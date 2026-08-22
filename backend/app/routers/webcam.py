"""
Webcam router: real-time camera stream processing via WebSockets.

Protocol per frame:
    client -> {"image": "<data-url or bare base64 JPEG>"}
    server -> {"type": "webcam_frame", "image": ..., "inference_ms": ..., ...}

Each connection gets its own Detector instance, so ByteTrack state never
leaks between concurrent webcam sessions or background video jobs. All
CPU/GPU-heavy work (decode/detect/draw/encode) runs in a worker thread via
``asyncio.to_thread`` so the event loop stays responsive for other requests
and WebSocket broadcasts.

Disconnect handling: a client that vanishes mid-frame makes ``send_text``
raise (starlette converts the dead transport to ``WebSocketDisconnect``).
That exception is deliberately *not* swallowed by the frame-processing error
handler; it propagates to the outer handler so the session ends cleanly
instead of looping on a dead socket.
"""
import asyncio
import base64
import json
import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.config import settings
from backend.app.services.event_engine import EventEngine
from backend.app.services.pipeline import Pipeline

logger = logging.getLogger("routers.webcam")
router = APIRouter(tags=["webcam"])


def _build_detector():
    """Create a dedicated Detector instance for one webcam session."""
    from ml.detector import Detector

    return Detector()


def _decode_frame(data: str):
    """Decode a base64 JPEG payload. Returns None for malformed input."""
    try:
        payload = json.loads(data)
        img_data = payload.get("image", "")
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]
        raw_bytes = base64.b64decode(img_data)
        return cv2.imdecode(np.frombuffer(raw_bytes, np.uint8), cv2.IMREAD_COLOR)
    except Exception as exc:
        logger.warning("Malformed webcam payload dropped: %s", exc)
        return None


def _process_frame(detector, pipeline, engine, frame_idx, frame):
    """Detection + event logic + annotation + JPEG encode. Runs off-loop."""
    dets = detector.predict(frame)
    person_dets = [d for d in dets if d["class_id"] in detector.person_ids]
    waste_dets = [d for d in dets if d["class_id"] in detector.waste_ids]

    ts_ms = int(time.time() * 1000)
    new_events = engine.process_frame(frame_idx, ts_ms, person_dets, waste_dets)

    annotated = pipeline._draw_detections(frame, dets, engine=engine)
    ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise RuntimeError("JPEG encoding failed")
    return buffer, new_events


@router.websocket("/ws/webcam")
async def websocket_webcam_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Webcam WebSocket client connected")

    try:
        # Load the model off the event loop (first load also initializes CUDA).
        detector = await asyncio.to_thread(_build_detector)
        pipeline = Pipeline(detector)
        engine = EventEngine(settings, frame_width=640, frame_height=480)
        frame_idx = 0

        while True:
            data = await websocket.receive_text()
            if not data:
                continue

            frame = _decode_frame(data)
            if frame is None:
                continue

            h, w = frame.shape[:2]
            engine.frame_width = w
            engine.frame_height = h

            # perf_counter, not monotonic: monotonic has ~15.6ms granularity
            # on Windows (Python <= 3.12), which quantizes small latencies.
            start_time = time.perf_counter()
            try:
                buffer, new_events = await asyncio.to_thread(
                    _process_frame, detector, pipeline, engine, frame_idx, frame
                )
            except Exception as exc:
                logger.warning("Error processing webcam frame: %s", exc)
                continue
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            b64_out = base64.b64encode(buffer).decode("utf-8")
            response = {
                "type": "webcam_frame",
                "image": f"data:image/jpeg;base64,{b64_out}",
                "frame_idx": frame_idx,
                "inference_ms": round(elapsed_ms, 1),
                "associations": engine.get_active_associations(),
                "events": new_events,
            }

            try:
                await websocket.send_text(json.dumps(response))
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                # Transport died mid-send: end the session cleanly rather than
                # receiving on a socket whose state is already disconnected
                # (this caused the 'WebSocket is not connected' ASGI crash).
                logger.info("Webcam send failed, closing stream: %s", exc)
                break

            frame_idx += 1

    except WebSocketDisconnect:
        logger.info("Webcam WebSocket client disconnected")
    except Exception:
        logger.exception("Webcam session crashed")
