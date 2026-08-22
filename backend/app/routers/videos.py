"""Video endpoints: upload, list, status, (re)process."""
import logging

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from backend.app import db
from backend.app.config import settings
from backend.app.schemas import ProcessRequest
from backend.app.services.worker import worker
from backend.app.utils import is_allowed_video, safe_ext

logger = logging.getLogger("routers.videos")
router = APIRouter(prefix="/videos", tags=["videos"])

CHUNK = 1024 * 1024  # 1 MB


@router.post("", status_code=201)
async def upload_video(file: UploadFile = File(...)):
    """Upload a video; it is queued for processing automatically."""
    if not is_allowed_video(file.filename or ""):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: mp4, mov, avi, mkv, webm, m4v",
        )

    ext = safe_ext(file.filename)
    video_id = db.create_video(file.filename or f"video{ext}", "")
    rel = f"videos/{video_id}{ext}"
    path = settings.storage_dir / rel
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0

    try:
        with open(path, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.max_upload_mb} MB limit",
                    )
                out.write(chunk)
    except HTTPException:
        path.unlink(missing_ok=True)
        db.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        raise
    except Exception as exc:  # pragma: no cover - defensive
        path.unlink(missing_ok=True)
        db.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    if size == 0:
        path.unlink(missing_ok=True)
        db.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    db.update_video(video_id, file_path=rel)
    worker.enqueue(video_id)
    logger.info("Video %s queued for processing", video_id)
    return db.get_video(video_id)


@router.get("")
def list_videos(
    sort: str = Query(default="newest", description=f"One of: {', '.join(db.VIDEO_SORTS)}"),
    status: str | None = Query(default=None, description="Filter by processing status"),
    search: str | None = Query(default=None, description="Substring match on filename"),
):
    """List uploaded videos with incident counts, sorted and filtered."""
    if sort not in db.VIDEO_SORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sort. Allowed: {', '.join(db.VIDEO_SORTS)}",
        )
    if status and status not in db.VIDEO_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(db.VIDEO_STATUSES)}",
        )
    return db.list_videos(sort=sort, status=status, search=search)


@router.get("/{video_id}")
def get_video(video_id: int):
    video = db.get_video(video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@router.post("/{video_id}/process")
def process_video(video_id: int, body: ProcessRequest | None = None):
    """Queue a video for processing. Pass force=true to reprocess a finished one."""
    video = db.get_video(video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    if video["status"] == "processing":
        raise HTTPException(status_code=409, detail="Video is already processing")
    if video["status"] == "completed" and not (body and body.force):
        raise HTTPException(
            status_code=409,
            detail="Video already processed. Pass force=true to reprocess.",
        )

    # Reprocessing: clear previous incidents first.
    db.execute("DELETE FROM incidents WHERE video_id = ?", (video_id,))
    db.update_video(video_id, status="pending", error=None, detected_incidents=0)
    worker.enqueue(video_id)
    return db.get_video(video_id)
