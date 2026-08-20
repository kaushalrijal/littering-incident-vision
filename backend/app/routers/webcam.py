"""
Webcam router: real-time camera stream processing via WebSockets.
"""
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
from backend.app.services.worker import worker

logger = logging.getLogger("routers.webcam")
router = APIRouter(tags=["webcam"])


@router.websocket("/ws/webcam")
async def websocket_webcam_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Webcam WebSocket client connected")

    try:
        detector = worker._get_detector()
        pipeline = Pipeline(detector)
        engine = EventEngine(settings, frame_width=640, frame_height=480)
        frame_idx = 0

        while True:
            data = await websocket.receive_text()
            if not data:
                continue

            try:
                payload = json.loads(data)
                img_data = payload.get("image", "")
                if "," in img_data:
                    img_data = img_data.split(",", 1)[1]

                raw_bytes = base64.b64decode(img_data)
                np_arr = np.frombuffer(raw_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    continue

                h, w = frame.shape[:2]
                engine.frame_width = w
                engine.frame_height = h

                # Detect & track
                start_time = time.monotonic()
                dets = detector.predict(frame)
                person_dets = [d for d in dets if d["class_id"] in detector.person_ids]
                waste_dets = [d for d in dets if d["class_id"] in detector.waste_ids]

                ts_ms = int(time.time() * 1000)
                new_events = engine.process_frame(frame_idx, ts_ms, person_dets, waste_dets)

                # Draw detections + top-right HUD
                annotated = pipeline._draw_detections(frame, dets, engine=engine)
                elapsed_ms = (time.monotonic() - start_time) * 1000

                # Encode back to JPEG
                _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                b64_out = base64.b64encode(buffer).decode("utf-8")

                response = {
                    "type": "webcam_frame",
                    "image": f"data:image/jpeg;base64,{b64_out}",
                    "frame_idx": frame_idx,
                    "inference_ms": round(elapsed_ms, 1),
                    "associations": engine.get_active_associations(),
                    "events": new_events,
                }
                await websocket.send_text(json.dumps(response))
                frame_idx += 1

            except Exception as exc:
                logger.warning("Error processing webcam frame: %s", exc)

    except WebSocketDisconnect:
        logger.info("Webcam WebSocket client disconnected")
