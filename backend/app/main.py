"""
Real-Time Littering Detection System - FastAPI application.

Run with:  python run.py   (or: uvicorn backend.app.main:app --reload)
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.app import db
from backend.app.config import settings
from backend.app.routers import incidents, videos
from backend.app.services.worker import worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
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


# API routes must be registered before the static mounts so /api/* wins.
app.include_router(videos.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")

# Stored media (uploaded videos, snapshots, evidence clips).
app.mount("/media", StaticFiles(directory=settings.storage_dir), name="media")

# Dashboard (vanilla HTML/CSS/JS, no build step).
app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
