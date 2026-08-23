"""
Live-camera evidence recorder.

Gives webcam sessions the same evidence trail as uploaded videos:

    ring-buffer recent frames -> on event: annotated snapshot (.jpg)
    -> persist an incidents row immediately -> evidence clip (.mp4) spanning
    [littering moment - CLIP_BEFORE_MS, fire time + CLIP_AFTER_MS], written
    once its post-roll window has elapsed.

Mirrors :func:`backend.app.services.pipeline.compute_clip_window`: clips are
anchored at ``born_timestamp_ms`` — when the waste object first appeared next
to the person, i.e. the actual littering moment — not at the later engine
fire time. The engine needs several seconds of S ^ M confirmation before it
fires, so without a look-back buffer the throw itself would be missed; the
ring buffer keeps exactly that history in memory.

Each session that produces at least one incident gets one row in ``videos``
(``source_type='webcam'``), so live incidents appear in the ordinary review
dashboard (Incidents tab, Review-by-video) alongside uploaded footage.

All methods are thread-safe: frame processing runs inside ``to_thread``
worker threads while session start/stop happens on the event loop.
"""
import logging
import threading
from collections import deque

import cv2
import numpy as np

from backend.app import db
from backend.app.config import settings
from backend.app.services.pipeline import open_video_writer
from backend.app.utils import now_str

logger = logging.getLogger("services.live_recorder")

# Extra look-back kept beyond clip_before_ms so late engine fires can still
# anchor their clip at the littering moment instead of the oldest frame.
RING_MARGIN_MS = 1500

# Safety caps for the derived fps of written clips (frames arrive at whatever
# rate inference allows; a stalled session must not produce 1 fps or 240 fps).
MIN_CLIP_FPS = 5.0
MAX_CLIP_FPS = 60.0


class _PendingClip:
    """An evidence clip still collecting frames (pre-roll done, post-roll open)."""

    __slots__ = ("incident_id", "seq", "start_ts", "end_ts", "frames")

    def __init__(self, incident_id: int, seq: int, start_ts: int, end_ts: int) -> None:
        self.incident_id = incident_id
        self.seq = seq
        self.start_ts = start_ts
        self.end_ts = end_ts
        self.frames: list[tuple[int, bytes]] = []  # (ts_ms, jpeg bytes)


class LiveSessionRecorder:
    """Records snapshots + evidence clips + DB rows for one webcam session."""

    def __init__(self, cfg=None) -> None:
        self.cfg = cfg or settings
        self.enabled = bool(getattr(self.cfg, "webcam_save_evidence", True))

        self.session_video_id: int | None = None
        self.incident_count: int = 0
        self.frame_width: int = 0
        self.frame_height: int = 0

        self._lock = threading.Lock()
        self._ring: deque[tuple[int, bytes]] = deque()  # (ts_ms, jpeg bytes)
        self._active: list[_PendingClip] = []
        self._next_seq: int = 0

        self._pre_ms = max(int(getattr(self.cfg, "clip_before_ms", 2000)), 0)
        self._post_ms = max(int(getattr(self.cfg, "clip_after_ms", 3000)), 0)
        self._max_ms = max(int(getattr(self.cfg, "clip_max_ms", 15000)), 0)
        # Hard frame cap so pathological configs cannot eat unbounded memory
        # (30 fps x 60 s of typical ~40 KB JPEGs is well under this).
        self._ring_max_frames = 1800

    # ------------------------------------------------------------------
    # Frame flow (called once per processed frame)
    # ------------------------------------------------------------------
    def record_frame(self, ts_ms: int, jpeg_bytes: bytes) -> None:
        """Buffer a frame and feed every clip whose post-roll is still open."""
        if not self.enabled or not jpeg_bytes:
            return
        with self._lock:
            self._prune_ring(ts_ms)
            self._ring.append((int(ts_ms), jpeg_bytes))
            if len(self._ring) > self._ring_max_frames:
                self._ring.popleft()

            still_open: list[_PendingClip] = []
            for clip in self._active:
                if int(ts_ms) <= clip.end_ts:
                    clip.frames.append((int(ts_ms), jpeg_bytes))
                    still_open.append(clip)
                else:
                    # Window complete: encode now, in this worker thread.
                    self._finalize_clip(clip)
            self._active = still_open

    def register_event(self, event: dict, fire_ts_ms: int, snapshot_bgr=None) -> int | None:
        """Persist one detected incident and open its evidence-clip recording.

        Returns the new incident row id, or None when disabled/failed. The
        incident is visible in the review dashboard immediately; ``clip_path``
        is attached once the clip finishes encoding.
        """
        if not self.enabled:
            return None
        try:
            with self._lock:
                video_id = self._ensure_session_locked()

                seq = self._next_seq
                self._next_seq += 1

                snapshot_rel = None
                if snapshot_bgr is not None:
                    snapshot_rel = f"snapshots/{video_id}_{seq}.jpg"
                    ok = cv2.imwrite(
                        str(settings.storage_dir / snapshot_rel), snapshot_bgr
                    )
                    if not ok:
                        logger.warning("Could not write live snapshot %s", snapshot_rel)
                        snapshot_rel = None

                fire_ts_ms = int(fire_ts_ms)
                born_ts = event.get("born_timestamp_ms")
                anchor = min(int(born_ts), fire_ts_ms) if born_ts else fire_ts_ms

                start_ts = anchor - self._pre_ms
                end_ts = fire_ts_ms + self._post_ms
                if self._max_ms > 0 and end_ts - start_ts > self._max_ms:
                    start_ts = end_ts - self._max_ms  # trim the approach, like uploads
                # Never promise pre-roll older than what we actually buffered.
                if self._ring:
                    start_ts = max(start_ts, self._ring[0][0])

                incident_id = db.create_incident(
                    video_id=video_id,
                    timestamp_ms=event["timestamp_ms"],
                    confidence=event["confidence"],
                    snapshot_path=snapshot_rel,
                    clip_path=None,
                    reason=event.get("reason", ""),
                    class_names=event.get("class_name"),
                    track_id=event.get("track_id"),
                )
                self.incident_count += 1

                clip = _PendingClip(incident_id, seq, start_ts, end_ts)
                # Backfill the pre-roll (the current frame is already in the
                # ring because record_frame() ran before the engine fired).
                for ts, jpg in self._ring:
                    if start_ts <= ts <= fire_ts_ms:
                        clip.frames.append((ts, jpg))

                if end_ts <= fire_ts_ms:
                    self._finalize_clip(clip)  # zero-length post roll: encode now
                else:
                    self._active.append(clip)

                return incident_id
        except Exception:
            # Evidence saving must never take down the live stream.
            logger.exception("Failed to record live incident evidence")
            return None

    def finalize_all(self) -> None:
        """Flush unfinished clips and update the session row. Safe twice."""
        with self._lock:
            for clip in self._active:
                self._finalize_clip(clip)
            self._active.clear()
            if self.session_video_id is not None:
                db.update_video(
                    self.session_video_id,
                    status="completed",
                    error=None,
                    detected_incidents=self.incident_count,
                    width=self.frame_width or None,
                    height=self.frame_height or None,
                )

    @property
    def recording(self) -> bool:
        """True while at least one evidence clip is collecting post-roll."""
        return bool(self._active)

    # ------------------------------------------------------------------
    # Internals (call with self._lock held)
    # ------------------------------------------------------------------
    def _prune_ring(self, now_ts_ms: int) -> None:
        horizon = now_ts_ms - (self._pre_ms + RING_MARGIN_MS)
        while self._ring and self._ring[0][0] < horizon:
            self._ring.popleft()

    def _ensure_session_locked(self) -> int:
        if self.session_video_id is None:
            # One library row per live session, so its incidents group together
            # in the Videos tab and Review-by-video like any upload would.
            label = f"Live camera {now_str()}"
            self.session_video_id = db.create_video(label, "", source_type="webcam")
            logger.info("Live camera session recorded as video %d", self.session_video_id)
        return self.session_video_id

    def _finalize_clip(self, clip: _PendingClip) -> None:
        frames = clip.frames
        try:
            rel_path: str | None = None
            if len(frames) >= 2 and self.frame_width > 0 and self.frame_height > 0:
                rel_path = f"clips/{self.session_video_id}_{clip.seq}.mp4"
                out_path = settings.storage_dir / rel_path
                duration_s = (frames[-1][0] - frames[0][0]) / 1000.0
                if duration_s > 0.05:
                    fps = (len(frames) - 1) / duration_s
                else:
                    fps = MAX_CLIP_FPS
                fps = max(MIN_CLIP_FPS, min(MAX_CLIP_FPS, fps))

                writer = open_video_writer(str(out_path), fps, self.frame_width, self.frame_height)
                if writer is not None:
                    written = 0
                    try:
                        for _, jpg in frames:
                            img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
                            if img is None:
                                continue
                            writer.write(img)
                            written += 1
                    finally:
                        writer.release()
                    if written < len(frames) or out_path.stat().st_size == 0:
                        logger.warning("Live clip %s incomplete (%d/%d frames)", rel_path, written, len(frames))
                    if out_path.stat().st_size == 0:
                        out_path.unlink(missing_ok=True)
                        rel_path = None
                else:
                    rel_path = None
            elif frames:
                logger.info("Live clip dropped: too few frames (%d)", len(frames))

            db.set_incident_clip_path(clip.incident_id, rel_path)
        except Exception:
            logger.exception("Failed to finalize live clip for incident %d", clip.incident_id)
