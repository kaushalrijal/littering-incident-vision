"""
Video processing pipeline.

Drives the full flow for one uploaded video:

    open video -> per-frame YOLO detect + ByteTrack -> event engine
    -> on event: save snapshot (.jpg) + evidence clip (.mp4, extracted from
       the source around the event time) -> persist incidents + stats.

Used both by the background worker (persist=True) and by the evaluation
script (persist=False).
"""
import json
import logging
import time
from pathlib import Path
from typing import Callable, List, Optional

import cv2

from backend.app import db
from backend.app.config import settings
from backend.app.services.event_engine import EventEngine

logger = logging.getLogger("pipeline")

PERSON_COLOR = (0, 200, 0)   # BGR green
WASTE_COLOR = (0, 0, 255)    # BGR red

# Codecs tried in order when writing .mp4 clips / previews. "avc1" is H.264
# supported natively by HTML5 web browsers (Chrome, Firefox, Edge, VS Code).
CODECS = ["avc1", "H264", "x264", "mp4v"]


class Pipeline:
    def __init__(self, detector, cfg=None) -> None:
        self.detector = detector
        self.cfg = cfg or settings

    # ------------------------------------------------------------------
    def process(
        self,
        video_id: int,
        persist: bool = True,
        progress_cb: Optional[Callable[[dict], None]] = None,
        video_path: Optional[Path] = None,
    ) -> dict:
        """
        Process one video file end-to-end.

        Args:
            video_id:  the id of the video row (also used as file name base).
            persist:   when True, write results into the database.
            progress_cb: optional callback with a stats dict, called ~1/s.
            video_path: explicit file path (used by the evaluation script).

        Returns:
            {"incidents": [...], "stats": {...}}
        """
        if video_path is not None:
            video_path = Path(video_path)
        elif persist:
            video = db.get_video(video_id)
            if video is None:
                raise ValueError(f"Video {video_id} not found")
            # DB stores paths relative to the media storage root.
            video_path = self.cfg.storage_dir / video["file_path"]
        else:
            # Evaluation mode without explicit path: file lives at storage/videos/{id}{ext}
            candidates = sorted((self.cfg.storage_dir / "videos").glob(f"{video_id}.*"))
            if not candidates:
                raise FileNotFoundError(f"No stored video file for id {video_id}")
            video_path = candidates[0]

        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        try:
            return self._run(cap, video_path, video_id, persist, progress_cb)
        finally:
            cap.release()

    # ------------------------------------------------------------------
    def _run(self, cap, video_path: Path, video_id: int, persist: bool, progress_cb) -> dict:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps != fps:  # 0 or NaN on some corrupt files
            fps = 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

        if self.cfg.max_video_duration_s > 0 and total_frames > 0:
            duration_s = total_frames / fps
            if duration_s > self.cfg.max_video_duration_s:
                raise ValueError(
                    f"Video longer than the configured limit "
                    f"({duration_s:.0f}s > {self.cfg.max_video_duration_s}s)"
                )

        engine = EventEngine(self.cfg, frame_width=width, frame_height=height)

        preview_writer = None
        if self.cfg.save_output_video and width and height:
            preview_path = self.cfg.storage_dir / "output" / f"{video_id}.mp4"
            preview_writer = self._open_writer(str(preview_path), fps, width, height)

        detections_log = None
        if self.cfg.log_detections:
            detections_log = open(
                self.cfg.storage_dir / "output" / f"{video_id}_detections.jsonl", "w"
            )

        incidents: List[dict] = []
        stats = {
            "video_id": video_id,
            "processed_frames": 0,
            "detected_incidents": 0,
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "width": width,
            "height": height,
        }

        started = time.monotonic()
        last_progress = started
        src_frame = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                process_this = (src_frame % self.cfg.frame_step == 0)

                if process_this:
                    dets = self.detector.predict(frame)
                    person_dets = [
                        d for d in dets if d["class_id"] in self.detector.person_ids
                    ]
                    waste_dets = [
                        d for d in dets if d["class_id"] in self.detector.waste_ids
                    ]

                    ts_ms = int(src_frame / fps * 1000)
                    new_events = engine.process_frame(
                        stats["processed_frames"], ts_ms, person_dets, waste_dets
                    )
                    for event in new_events:
                        event["src_frame"] = src_frame
                        record = self._handle_event(
                            cap, frame, dets, video_id, src_frame, fps, width, height,
                            event, len(incidents), engine=engine,
                        )
                        incidents.append(record)
                        stats["detected_incidents"] = len(incidents)
                    if new_events:
                        # _handle_event() seeks the capture to extract evidence
                        # clips, so restore the position for the main loop;
                        # otherwise the next read() would skip post_frames.
                        cap.set(cv2.CAP_PROP_POS_FRAMES, src_frame + 1)

                    stats["processed_frames"] += 1

                    if preview_writer is not None:
                        annotated = self._draw_detections(frame, dets, engine=engine)
                        preview_writer.write(annotated)

                    if detections_log is not None:
                        detections_log.write(
                            json.dumps(
                                {
                                    "src_frame": src_frame,
                                    "timestamp_ms": ts_ms,
                                    "detections": [
                                        {
                                            "class": d["class_name"],
                                            "conf": round(d["conf"], 3),
                                            "bbox": [round(v, 1) for v in d["bbox"]],
                                            "track_id": d["track_id"],
                                        }
                                        for d in dets
                                    ],
                                }
                            )
                            + "\n"
                        )

                    now = time.monotonic()
                    if now - last_progress >= 1.0:
                        last_progress = now
                        stats["processing_fps"] = round(
                            stats["processed_frames"] / max(now - started, 1e-6), 2
                        )
                        if progress_cb is not None:
                            progress_cb(dict(stats))

                src_frame += 1

                if self.cfg.max_incidents and len(incidents) >= self.cfg.max_incidents:
                    logger.info("Reached MAX_INCIDENTS for video %s; stopping early.", video_id)
                    break
        finally:
            if preview_writer is not None:
                preview_writer.release()
            if detections_log is not None:
                detections_log.close()

        elapsed = max(time.monotonic() - started, 1e-6)
        stats["processing_fps"] = round(stats["processed_frames"] / elapsed, 2)
        stats["duration_ms"] = int(total_frames / fps * 1000) if total_frames else 0
        stats["elapsed_s"] = round(elapsed, 2)
        stats["incidents"] = incidents

        if persist:
            self._persist(video_id, stats)
        elif progress_cb is not None:
            progress_cb(dict(stats))

        logger.info(
            "Video %s done: %d frames processed in %.1fs, %d incident(s)",
            video_id, stats["processed_frames"], elapsed, len(incidents),
        )
        return stats

    # ------------------------------------------------------------------
    def _handle_event(self, cap, frame, dets, video_id, src_frame, fps, width, height, event, seq, engine=None) -> dict:
        """Save the snapshot + evidence clip for one event. Returns the record."""
        base = self.cfg.storage_dir
        snapshot_rel = f"snapshots/{video_id}_{seq}.jpg"
        clip_rel = f"clips/{video_id}_{seq}.mp4"

        # Snapshot (with boxes drawn) -----------------------------------
        annotated = self._draw_detections(frame, dets, engine=engine)
        ok_snap = cv2.imwrite(str(base / snapshot_rel), annotated)

        # Evidence clip extracted from the source ------------------------
        pre_frames = int(self.cfg.clip_before_ms / 1000.0 * fps)
        post_frames = int(self.cfg.clip_after_ms / 1000.0 * fps)
        start = max(0, src_frame - pre_frames)
        end = src_frame + post_frames
        clip_ok = self._write_clip(cap, start, end, str(base / clip_rel), fps, width, height)
        if not clip_ok:
            clip_rel = None

        return {
            "video_id": video_id,
            "timestamp_ms": event["timestamp_ms"],
            "confidence": event["confidence"],
            "snapshot_path": snapshot_rel if ok_snap else None,
            "clip_path": clip_rel,
            "reason": event["reason"],
            "class_names": event["class_name"],
            "track_id": event["track_id"],
            "src_frame": event["src_frame"],
            "stationary_frames": event["stationary_frames"],
            "born_dist": event["born_dist"],
            "current_dist": event["current_dist"],
        }

    # ------------------------------------------------------------------
    def _write_clip(self, cap, start_frame: int, end_frame: int, out_path: str, fps, width, height) -> bool:
        """Seek to start_frame, copy source frames [start, end) into a clip."""
        if width <= 0 or height <= 0:
            return False
        writer = self._open_writer(out_path, fps, width, height)
        if writer is None:
            return False
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            for _ in range(max(end_frame - start_frame, 1)):
                ok, frm = cap.read()
                if not ok:
                    break
                writer.write(frm)
        finally:
            writer.release()
        return Path(out_path).stat().st_size > 0

    # ------------------------------------------------------------------
    def _open_writer(self, out_path: str, fps, width, height):
        for codec in CODECS:
            try:
                fourcc = cv2.VideoWriter_fourcc(*codec)
            except Exception:
                continue
            writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
            if writer.isOpened():
                logger.debug("Using codec %s for %s", codec, out_path)
                return writer
            writer.release()
        logger.warning("No usable video codec for %s (tried %s)", out_path, CODECS)
        return None

    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    def _draw_detections(self, frame, dets: List[dict], engine=None):
        """Return a copy of the frame with bounding boxes, labels, and top-right association HUD drawn."""
        out = frame.copy()
        assoc_map = {}
        active_assocs = []
        if engine is not None and hasattr(engine, "get_active_associations"):
            active_assocs = engine.get_active_associations()
            assoc_map = dict(active_assocs)

        # Draw bounding boxes
        for d in dets:
            x1, y1, x2, y2 = (int(v) for v in d["bbox"])
            is_person = d["class_id"] in self.detector.person_ids
            color = PERSON_COLOR if is_person else WASTE_COLOR
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
            label = f"{d['class_name']} {d['conf']:.2f}"
            tid = d.get("track_id")
            if tid is not None:
                label += f" #{tid}"
                if not is_person and tid in assoc_map:
                    label += f" (person #{assoc_map[tid]})"
            cv2.putText(
                out, label, (x1, max(y1 - 6, 15)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
            )

        # Top-Right HUD Debugging Overlay for Associations: (Trash, Person)
        hud_str = "Assoc (Trash, Person): "
        if active_assocs:
            hud_str += ", ".join(f"({w}, {p})" for w, p in active_assocs)
        else:
            hud_str += "None"

        h, w = out.shape[:2]
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        (text_w, text_h), baseline = cv2.getTextSize(hud_str, font, font_scale, thickness)

        margin = 10
        box_x2 = w - margin
        box_x1 = max(10, box_x2 - text_w - 16)
        box_y1 = margin
        box_y2 = box_y1 + text_h + 12

        # Draw semi-transparent dark HUD box
        overlay = out.copy()
        cv2.rectangle(overlay, (box_x1, box_y1), (box_x2, box_y2), (20, 20, 20), -1)
        cv2.rectangle(overlay, (box_x1, box_y1), (box_x2, box_y2), (0, 220, 255), 1)
        cv2.addWeighted(overlay, 0.75, out, 0.25, 0, out)

        # Draw HUD text in bright yellow / cyan
        cv2.putText(
            out, hud_str, (box_x1 + 8, box_y1 + text_h + 5),
            font, font_scale, (0, 230, 255), thickness, cv2.LINE_AA,
        )

        return out

    # ------------------------------------------------------------------
    def _persist(self, video_id: int, stats: dict) -> None:
        for inc in stats["incidents"]:
            db.create_incident(
                video_id=video_id,
                timestamp_ms=inc["timestamp_ms"],
                confidence=inc["confidence"],
                snapshot_path=inc["snapshot_path"],
                clip_path=inc["clip_path"],
                reason=inc["reason"],
                class_names=inc["class_names"],
                track_id=inc["track_id"],
            )
        db.update_video(
            video_id,
            status="completed",
            error=None,
            duration_ms=stats.get("duration_ms"),
            fps=stats.get("fps"),
            width=stats.get("width"),
            height=stats.get("height"),
            total_frames=stats.get("total_frames"),
            processed_frames=stats.get("processed_frames"),
            processing_fps=stats.get("processing_fps"),
            detected_incidents=len(stats["incidents"]),
        )
