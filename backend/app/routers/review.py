"""Review-summary endpoint: videos with incident breakdowns for the Incident Review table."""
import math

from fastapi import APIRouter, Query

from backend.app import db
from backend.app.schemas import PaginatedResponse

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/video-summaries")
def video_summaries(
    status: str | None = Query(default=None, description="Filter by incident review status"),
    search: str | None = Query(default=None, description="Search by filename"),
    days: int | None = Query(default=None, ge=1, le=365, description="Videos from last N days"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
):
    """Videos that have at least one incident, with pending/confirmed/false_alarm counts."""
    total = db.count_video_incident_summaries(status_filter=status, search=search, min_incidents=1, days=days)
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    items = db.list_video_incident_summaries(
        status_filter=status, search=search, limit=page_size, offset=offset, min_incidents=1, days=days
    )
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
