"""
End-to-end smoke test for live-camera evidence saving (self-contained).

Boots the FastAPI app in-process with:
  * DATABASE_PATH / STORAGE_DIR pointed at a throwaway directory,
  * the webcam router's Detector and EventEngine replaced by fakes,

then drives /ws/webcam exactly like the browser does (binary JPEG frames),
makes the fake engine fire one littering event, closes the socket, and
verifies the full evidence trail:

  * a videos row with source_type='webcam' exists,
  * an incidents row exists whose snapshot + clip files exist on disk,
  * responses carry the `recording` flag while post-roll is open.

Run:  python scripts/smoke_live_evidence.py
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_tmp = Path(tempfile.mkdtemp(prefix="live_smoke_"))
os.environ["DATABASE_PATH"] = str(_tmp / "smoke.db")
os.environ["STORAGE_DIR"] = str(_tmp / "storage")

import cv2  # noqa: E402
import numpy as np  # noqa: E402


def install_fakes():
    """Swap the webcam router's heavy dependencies before serving traffic."""
    import backend.app.routers.webcam as wc

    class FakeDetector:
        person_ids = [0]
        waste_ids = [1]

        def predict(self, frame):
            return [
                {"class_id": 0, "class_name": "person",
                 "bbox": (10.0, 20.0, 60.0, 120.0), "conf": 0.9, "track_id": 1},
            ]

    class FakeEngine:
        fired = False

        def __init__(self, cfg, frame_width=640, frame_height=480):
            pass

        def process_frame(self, frame_idx, ts_ms, person_dets, waste_dets):
            if not self.fired and frame_idx >= 8:
                self.fired = True
                return [{
                    "frame_idx": frame_idx,
                    "timestamp_ms": ts_ms,
                    "born_timestamp_ms": ts_ms - 1500,
                    "confidence": 0.77,
                    "class_name": "bottle",
                    "track_id": 9,
                    "reason": "smoke-test littering event",
                    "stationary_frames": 9,
                    "born_dist": 40.0,
                    "current_dist": 120.0,
                }]
            return []

        def get_active_associations(self):
            return [(9, 1)]

    wc._webcam_detector = FakeDetector()
    wc.EventEngine = FakeEngine


async def main():
    install_fakes()

    import uvicorn
    import websockets

    from backend.app.config import settings
    from backend.app.main import app

    settings.storage_dir.mkdir(parents=True, exist_ok=True)

    config = uvicorn.Config(app, host="127.0.0.1", port=8907, log_level="warning")
    server = uvicorn.Server(config)
    serve_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)

    events_seen, recording_flags = [], []
    try:
        async with websockets.connect("ws://127.0.0.1:8907/ws/webcam") as ws:
            for i in range(30):
                ok, buf = cv2.imencode(".jpg", np.full((240, 320, 3), i * 4 % 255, dtype=np.uint8))
                assert ok
                await ws.send(buf.tobytes())
                reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
                recording_flags.append(reply.get("recording"))
                events_seen.extend(reply.get("events", []))
                await asyncio.sleep(0.03)

        print(f"events received : {len(events_seen)}")
        for ev in events_seen:
            print(f"  incident #{ev.get('incident_id')}: {ev['reason']}")
        print(f"recording flag  : ever-true={any(recording_flags)} last={recording_flags[-1]}")

        # Let the server's finally-block finalize clips after disconnect.
        await asyncio.sleep(1.0)

        from backend.app import db

        sessions = db.query(
            "SELECT id, filename, source_type, status, detected_incidents "
            "FROM videos WHERE source_type='webcam'"
        )
        print("\nwebcam session rows:", json.dumps(sessions, indent=2))
        assert len(sessions) == 1, "expected exactly one webcam session row"
        assert sessions[0]["status"] == "completed"

        inc = db.query(
            "SELECT id, video_id, snapshot_path, clip_path FROM incidents WHERE video_id=?",
            (sessions[0]["id"],),
        )
        print("incidents:", json.dumps(inc, indent=2))
        assert len(inc) == 1, "expected one persisted incident"

        row = inc[0]
        assert row["snapshot_path"], "snapshot_path missing"
        assert row["clip_path"], "clip_path missing"
        for key in ("snapshot_path", "clip_path"):
            p = settings.storage_dir / row[key]
            assert p.exists() and p.stat().st_size > 0, f"missing evidence file {key}: {p}"
            print(f"ok: {p} ({p.stat().st_size} bytes)")

        print("\nSMOKE TEST PASSED")
    finally:
        server.should_exit = True
        await asyncio.wait_for(serve_task, timeout=10)


if __name__ == "__main__":
    asyncio.run(main())
