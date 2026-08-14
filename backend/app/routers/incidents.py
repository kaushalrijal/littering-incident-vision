"""Incident endpoints: list, detail, review status updates."""
from fastapi import APIRouter, HTTPException, Query

from backend.app import db
from backend.app.schemas import IncidentUpdate

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
def list_incidents(
    video_id: int | None = Query(default=None, description="Filter by video id"),
    status: str | None = Query(default=None, description="Filter by review status"),
):
    """List incidents, optionally filtered by video or review status."""
    if status and status not in db.REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(db.REVIEW_STATUSES)}",
        )
    return db.list_incidents(video_id=video_id, status=status)


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
