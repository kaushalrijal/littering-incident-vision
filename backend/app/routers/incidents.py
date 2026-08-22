"""Incident endpoints: list, detail, review status updates."""
import math

from fastapi import APIRouter, HTTPException, Query

from backend.app import db
from backend.app.schemas import IncidentUpdate, PaginatedResponse

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=PaginatedResponse)
def list_incidents(
    video_id: int | None = Query(default=None, description="Filter by video id"),
    status: str | None = Query(default=None, description="Filter by review status"),
    sort: str = Query(default="newest", description=f"One of: {', '.join(db.INCIDENT_SORTS)}"),
    min_confidence: float | None = Query(default=None, ge=0.0, le=1.0, description="Minimum confidence"),
    search: str | None = Query(default=None, description="Substring match on reason or video filename"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=10, ge=1, le=100, description="Items per page"),
    days: int | None = Query(default=None, ge=1, le=365, description="Filter incidents from last N days"),
):
    """List incidents, sorted, filtered and paginated."""
    if status and status not in db.REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(db.REVIEW_STATUSES)}",
        )
    if sort not in db.INCIDENT_SORTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sort. Allowed: {', '.join(db.INCIDENT_SORTS)}",
        )
    total = db.count_incidents(
        video_id=video_id,
        status=status,
        min_confidence=min_confidence,
        search=search,
        days=days,
    )
    total_pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    items = db.list_incidents(
        video_id=video_id,
        status=status,
        sort=sort,
        min_confidence=min_confidence,
        search=search,
        days=days,
        limit=page_size,
        offset=offset,
    )
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{incident_id}")
def get_incident(incident_id: int):
    incident = db.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.patch("/{incident_id}")
def update_incident(incident_id: int, body: IncidentUpdate):
    """Set the review status: pending / confirmed / false_alarm."""
    incident = db.set_incident_status(incident_id, body.review_status)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident
