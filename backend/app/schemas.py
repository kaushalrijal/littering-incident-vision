"""Pydantic schemas for request/response validation."""
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response envelope."""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class IncidentUpdate(BaseModel):
    """Body for PATCH /api/incidents/{id}."""

    review_status: Literal["pending", "confirmed", "false_alarm"] = Field(
        ..., description="New review status for the incident"
    )


class ProcessRequest(BaseModel):
    """Body for POST /api/videos/{id}/process (kept for forward compatibility)."""

    force: bool = Field(
        False, description="Restart processing even if the video already completed"
    )
