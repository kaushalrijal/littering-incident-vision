"""
Real-Time Littering Detection System - FastAPI application.

Run with:  python run.py   (or: uvicorn backend.app.main:app --reload)
"""
import logging
from contextlib import asynccontextmanager

import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from backend.app import db
from backend.app.config import settings
from backend.app.routers import incidents, videos, webcam
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.worker import worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    ws_manager.set_loop(asyncio.get_running_loop())
    worker.start()
    logger.info("Application started")
    yield
    worker.stop()
    logger.info("Application stopped")


app = FastAPI(
    title="Real-Time Littering Detection System",
    description=(
        "Detects suspected littering incidents from CCTV / webcam / uploaded "
        "video using YOLO detection, ByteTrack tracking and a rule-based event "
        "engine (N ^ R ^ S ^ M)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": app.title, "version": app.version}


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# API routes must be registered before the static mounts so /api/* wins.
app.include_router(videos.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(webcam.router)

# Stored media (uploaded videos, snapshots, evidence clips).
app.mount("/media", StaticFiles(directory=settings.storage_dir), name="media")

# Dashboard (React frontend app static mount).
app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
