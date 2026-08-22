"""
Real-Time Littering Detection System - FastAPI application.

Run with:  python run.py   (or: uvicorn backend.app.main:app --reload)
"""
import logging
from contextlib import asynccontextmanager

import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app import db
from backend.app.config import settings
from backend.app.routers import incidents, videos, webcam, review
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.worker import worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")


from backend.app.utils import ensure_openh264


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_openh264()
    db.init_db()
    # A crash or restart can leave a video stuck 'processing'; the worker would
    # then skip it forever. Reset any such orphans to 'failed' before we start.
    interrupted = db.reconcile_interrupted_videos()
    if interrupted:
        logger.warning(
            "Reset %d video(s) left 'processing' by a previous run to 'failed': %s",
            len(interrupted),
            interrupted,
        )
    ws_manager.set_loop(asyncio.get_running_loop())
    worker.start()
    logger.info("Application started")
    yield
    worker.stop()
    logger.info("Application stopped")


app = FastAPI(
    title="Kalanka — Real-Time Littering Detection System",
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


@app.get("/api/dashboard/stats")
def dashboard_stats(days: int = 3):
    """Return current-period and previous-period counts for videos and incidents.

    The *previous* period is the same length window immediately before the
    current one, enabling a percentage-change comparison on the frontend.
    """
    from datetime import datetime, timedelta

    now = datetime.now()
    current_start = (now - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
    current_end = now.strftime("%Y-%m-%d %H:%M:%S")
    prev_start = (now - timedelta(days=days * 2)).strftime("%Y-%m-%d 00:00:00")
    prev_end = current_start

    cur_videos = db.count_videos_between(current_start, current_end)
    prev_videos = db.count_videos_between(prev_start, prev_end)
    cur_incidents = db.count_incidents_between(current_start, current_end)
    prev_incidents = db.count_incidents_between(prev_start, prev_end)

    def pct_change(cur: int, prev: int) -> float | None:
        if prev == 0:
            return None if cur == 0 else 100.0
        return round(((cur - prev) / prev) * 100, 1)

    return {
        "days": days,
        "videos": {
            "current": cur_videos,
            "previous": prev_videos,
            "change_pct": pct_change(cur_videos, prev_videos),
        },
        "incidents": {
            "current": cur_incidents,
            "previous": prev_incidents,
            "change_pct": pct_change(cur_incidents, prev_incidents),
        },
        "pending_incidents": db.count_incidents(status="pending"),
    }


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
app.include_router(review.router, prefix="/api")
app.include_router(webcam.router)

# Stored media (uploaded videos, snapshots, evidence clips).
app.mount("/media", StaticFiles(directory=settings.storage_dir), name="media")

# Built dashboard assets.
app.mount(
    "/assets",
    StaticFiles(directory=settings.frontend_dir / "assets"),
    name="assets",
)


def _safe_frontend_file(spa_path: str):
    """Resolve spa_path inside frontend_dir; None if it escapes or is missing."""
    if not spa_path or ".." in spa_path.split("/"):
        return None
    candidate = (settings.frontend_dir / spa_path).resolve()
    try:
        candidate.relative_to(settings.frontend_dir.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@app.get("/{spa_path:path}", include_in_schema=False)
def spa_fallback(spa_path: str):
    """Serve built files directly; fall back to index.html so client-side
    routes like /videos, /incidents and /live survive a hard refresh."""
    existing = _safe_frontend_file(spa_path)
    if existing is not None:
        return FileResponse(existing)
    return FileResponse(settings.frontend_dir / "index.html")
