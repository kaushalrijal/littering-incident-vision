"""
Webcam router: real-time camera stream processing via WebSockets.

Design notes
------------
* **Inference never runs on the event loop.** Every frame is decoded, detected,
  tracked and (optionally) drawn inside ``asyncio.to_thread`` so the single
  uvicorn event loop stays responsive for the rest of the API and the
  ``/ws/events`` progress socket.
* **Dedicated detector.** The webcam uses its own ``Detector`` instance, kept
  separate from the background worker's detector. The two never share a PyTorch
  model or ByteTrack state, so uploading a video and running the live camera at
  the same time cannot corrupt each other's track ids.
* **Single active session.** Only one webcam client is served at a time. A
  second connection is rejected with an ``error`` message; this keeps the shared
  detector single-threaded and avoids mixing two cameras into one tracker.
* **Drain-to-latest backpressure.** A receiver task keeps only the newest queued
  frame. If the browser sends faster than the CPU can infer, stale frames are
  dropped instead of piling up, so latency does not grow without bound.
* **Two wire protocols, one code path:**
    - *New (preferred):* client sends a **binary** JPEG frame; server replies
      with **metadata only** (boxes, track ids, associations, events). The
      browser draws the overlay on a canvas over its own ``<video>`` — no image
      is re-encoded or shipped back, which is the big "feels real-time" win.
    - *Legacy:* client sends ``{"image": "data:image/jpeg;base64,...}"``; server
      replies with an annotated JPEG in ``image``. The shipped dashboard bundle
      uses this path, so it keeps working unchanged until the frontend is
      rebuilt.
* **Evidence is saved like uploads.** A per-session :class:`LiveSessionRecorder`
  ring-buffers recent frames; when the engine fires, it persists the incident
  (annotated snapshot + evidence clip spanning pre/post-roll around the
  littering moment, exactly like uploaded videos) so live findings land in the
  review dashboard. Responses carry a ``recording`` flag while a clip's
  post-roll window is still open, which the UI shows as a REC badge.
"""
import asyncio
import base64
import contextlib
import json
import logging
import threading
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.config import settings
from backend.app.services.event_engine import EventEngine
from backend.app.services.live_recorder import LiveSessionRecorder
from backend.app.services.pipeline import Pipeline
from backend.app.services.websocket_manager import ws_manager

logger = logging.getLogger("routers.webcam")
router = APIRouter(tags=["webcam"])

# Reject frames larger than this (a 640x480 JPEG is ~30-60 KB; this is a wide
# guard against a malformed or hostile client sending huge payloads).
MAX_FRAME_BYTES = 4 * 1024 * 1024  # 4 MB

# Only one live webcam session at a time. Read/written only on the event loop,
# so a plain flag is race-free (no await between the check and the set below).
_session_active = False

# A dedicated detector for the webcam, separate from the worker's. Loaded once,
# lazily, and reused across webcam sessions. Guarded for the (rare) case of two
# initialisations racing across threads.
_webcam_detector = None
_detector_init_lock = threading.Lock()


def _get_webcam_detector():
    """Lazily build the webcam's own Detector (heavy: loads the model once)."""
    global _webcam_detector
    if _webcam_detector is None:
        with _detector_init_lock:
            if _webcam_detector is None:
                from ml.detector import Detector

                logger.info("Initializing dedicated webcam detector ...")
                _webcam_detector = Detector()
    return _webcam_detector


def _process_frame(detector, engine, pipeline, jpeg_bytes, frame_idx, want_image, recorder=None):
    """
    Decode one JPEG frame, run detection + tracking + the event engine, and
    build the response.

    Runs in a worker thread (via ``asyncio.to_thread``). Returns a JSON-ready
    dict, or ``None`` if the frame could not be decoded/encoded. When a
    ``recorder`` is given, every frame is buffered for evidence clips and new
    events are persisted with snapshot + clip like uploaded videos.
    """
    np_arr = np.frombuffer(jpeg_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None

    h, w = frame.shape[:2]
    engine.frame_width = w
    engine.frame_height = h

    # perf_counter, not monotonic: monotonic has ~15.6ms granularity on
    # Windows (Python <= 3.12), which quantizes small latencies.
    start = time.perf_counter()
    dets = detector.predict(frame)
    person_dets = [d for d in dets if d["class_id"] in detector.person_ids]
    waste_dets = [d for d in dets if d["class_id"] in detector.waste_ids]

    ts_ms = int(time.time() * 1000)
    new_events = engine.process_frame(frame_idx, ts_ms, person_dets, waste_dets)
    associations = engine.get_active_associations()
    elapsed_ms = (time.perf_counter() - start) * 1000

    # Evidence recording: buffer the frame first (so the just-fired event can
    # backfill its pre-roll from the ring buffer), then persist each event.
    evidence_recording = False
    if recorder is not None:
        try:
            incidents_before = recorder.incident_count
            was_recording = recorder.recording

            recorder.frame_width = w
            recorder.frame_height = h
            recorder.record_frame(ts_ms, jpeg_bytes)
            for event in new_events:
                snapshot_bgr = pipeline._draw_detections(frame, dets, engine=engine)
                incident_id = recorder.register_event(event, ts_ms, snapshot_bgr=snapshot_bgr)
                if incident_id is not None:
                    event["incident_id"] = incident_id
                    logger.info(
                        "Live incident %d saved (track %s, conf %.2f)",
                        incident_id, event.get("track_id"), event.get("confidence", 0),
                    )
            evidence_recording = recorder.recording

            # Nudge open dashboards to refresh — but only on a real change,
            # never per frame ('video_status' triggers a refetch client-side).
            if (
                recorder.incident_count != incidents_before
                or evidence_recording != was_recording
            ):
                ws_manager.broadcast_sync({
                    "type": "video_status",
                    "video_id": recorder.session_video_id,
                    "status": "completed",
                    "stats": {"detected_incidents": recorder.incident_count},
                })
        except Exception:
            logger.exception("Live evidence recording failed")

    if want_image:
        # Legacy path: draw server-side and ship an annotated JPEG back.
        annotated = pipeline._draw_detections(frame, dets, engine=engine)
        ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return None
        b64_out = base64.b64encode(buffer).decode("utf-8")
        return {
            "type": "webcam_frame",
            "image": f"data:image/jpeg;base64,{b64_out}",
            "frame_idx": frame_idx,
            "inference_ms": round(elapsed_ms, 1),
            "associations": associations,
            "events": new_events,
            "recording": evidence_recording,
        }

    # New path: metadata only. The browser draws the overlay itself.
    person_id_set = set(detector.person_ids)
    assoc_person = {int(w_tid): int(p_tid) for (w_tid, p_tid) in associations}
    detections = []
    for d in dets:
        x1, y1, x2, y2 = d["bbox"]
        is_person = d["class_id"] in person_id_set
        tid = d.get("track_id")
        detections.append(
            {
                "bbox": [
                    round(float(x1), 1),
                    round(float(y1), 1),
                    round(float(x2), 1),
                    round(float(y2), 1),
                ],
                "class_name": d["class_name"],
                "conf": round(float(d["conf"]), 3),
                "track_id": tid,
                "kind": "person" if is_person else "waste",
                "assoc_person": assoc_person.get(tid)
                if (not is_person and tid is not None)
                else None,
            }
        )
    return {
        "type": "webcam_frame",
        "mode": "meta",
        "frame_idx": frame_idx,
        "width": w,
        "height": h,
        "inference_ms": round(elapsed_ms, 1),
        "detections": detections,
        "associations": associations,
        "events": new_events,
        "recording": evidence_recording,
    }


async def _run_webcam_session(websocket: WebSocket):
    """Run one webcam session: receiver (drain-to-latest) + processor."""
    # Load the model off the event loop so the first connection does not freeze
    # the server while weights load.
    try:
        detector = await asyncio.to_thread(_get_webcam_detector)
    except Exception as exc:  # model missing, bad weights, etc.
        logger.exception("Webcam detector failed to load: %s", exc)
        with contextlib.suppress(Exception):
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "message": "Could not load the detection model. "
                        "Check the server log.",
                    }
                )
            )
        return

    pipeline = Pipeline(detector)  # only used for the legacy annotated-image path
    engine = EventEngine(settings, frame_width=640, frame_height=480)
    recorder = LiveSessionRecorder(settings)  # saves incidents like uploads do

    # Single-slot mailbox: the receiver overwrites it; the processor drains it.
    latest = {"frame": None, "want_image": False}
    new_frame = asyncio.Event()
    stop = asyncio.Event()

    async def receiver():
        try:
            while not stop.is_set():
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break

                payload_bytes = msg.get("bytes")
                want_image = False

                if payload_bytes is None:
                    # Text frame: legacy JSON {"image": "data:...;base64,..."}.
                    text = msg.get("text")
                    if not text:
                        continue
                    try:
                        obj = json.loads(text)
                    except (ValueError, TypeError):
                        continue
                    img = obj.get("image", "")
                    if not isinstance(img, str) or not img:
                        continue
                    if "," in img:
                        img = img.split(",", 1)[1]
                    try:
                        payload_bytes = base64.b64decode(img)
                    except (ValueError, TypeError):
                        continue
                    want_image = True  # legacy client expects an image back

                if payload_bytes is None:
                    continue
                if len(payload_bytes) > MAX_FRAME_BYTES:
                    logger.warning(
                        "Dropped oversized webcam frame (%d bytes)", len(payload_bytes)
                    )
                    continue

                # Drain-to-latest: keep only the newest frame.
                latest["frame"] = payload_bytes
                latest["want_image"] = want_image
                new_frame.set()
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # defensive: never let the receiver kill the loop
            logger.warning("Webcam receiver stopped: %s", exc)
        finally:
            stop.set()
            new_frame.set()  # wake the processor so it can exit

    recv_task = asyncio.create_task(receiver())
    frame_idx = 0
    try:
        while not stop.is_set():
            await new_frame.wait()
            new_frame.clear()
            if stop.is_set():
                break

            frame_bytes = latest["frame"]
            want_image = latest["want_image"]
            latest["frame"] = None
            if frame_bytes is None:
                continue

            try:
                result = await asyncio.to_thread(
                    _process_frame,
                    detector,
                    engine,
                    pipeline,
                    frame_bytes,
                    frame_idx,
                    want_image,
                    recorder,
                )
            except Exception as exc:  # one bad frame must not end the session
                logger.warning("Error processing webcam frame: %s", exc)
                continue

            if result is None:
                continue

            try:
                await websocket.send_text(json.dumps(result))
            except WebSocketDisconnect:
                break
            except Exception as exc:
                # Transport died mid-send: end the session cleanly rather than
                # receiving on a socket whose state is already disconnected
                # (this caused the 'WebSocket is not connected' ASGI crash).
                logger.info("Webcam send failed, closing stream: %s", exc)
                break
            frame_idx += 1
    finally:
        stop.set()
        recv_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await recv_task
        # Flush evidence clips still collecting post-roll and close the
        # session's video row. Off the event loop: encoding can take a moment.
        if recorder.enabled:
            try:
                await asyncio.to_thread(recorder.finalize_all)
                if recorder.session_video_id is not None:
                    ws_manager.broadcast_sync({
                        "type": "video_status",
                        "video_id": recorder.session_video_id,
                        "status": "completed",
                        "stats": {"detected_incidents": recorder.incident_count},
                    })
                    logger.info(
                        "Live session saved as video %d with %d incident(s)",
                        recorder.session_video_id, recorder.incident_count,
                    )
            except Exception:
                logger.exception("Failed to finalize live camera session")


@router.websocket("/ws/webcam")
async def websocket_webcam_endpoint(websocket: WebSocket):
    global _session_active
    await websocket.accept()

    if _session_active:
        logger.info("Rejected a second concurrent webcam session")
        with contextlib.suppress(Exception):
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "message": "Another camera session is already active. "
                        "Close it before starting a new one.",
                    }
                )
            )
            await websocket.close()
        return

    _session_active = True
    logger.info("Webcam WebSocket client connected")
    try:
        await _run_webcam_session(websocket)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Webcam session crashed")
    finally:
        _session_active = False
        logger.info("Webcam WebSocket client disconnected")
