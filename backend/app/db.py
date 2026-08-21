"""
SQLite data-access layer.

A fresh connection is opened per call, which makes the module safe to use
from the FastAPI request threads and the background processing worker at
the same time. WAL mode keeps readers from blocking the writer.
"""
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    filename           TEXT    NOT NULL,
    source_type        TEXT    NOT NULL DEFAULT 'upload',
    file_path          TEXT    NOT NULL,
    status             TEXT    NOT NULL DEFAULT 'pending',
    error              TEXT,
    duration_ms        INTEGER,
    fps                REAL,
    width              INTEGER,
    height             INTEGER,
    total_frames       INTEGER,
    processed_frames   INTEGER NOT NULL DEFAULT 0,
    processing_fps     REAL,
    detected_incidents INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id      INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    timestamp_ms  INTEGER NOT NULL,
    confidence    REAL    NOT NULL,
    snapshot_path TEXT,
    clip_path     TEXT,
    review_status TEXT    NOT NULL DEFAULT 'pending',
    reason        TEXT,
    class_names   TEXT,
    track_id      INTEGER,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_video   ON incidents(video_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status  ON incidents(review_status);
CREATE INDEX IF NOT EXISTS idx_videos_status     ON videos(status);
"""

REVIEW_STATUSES = ("pending", "confirmed", "false_alarm")
VIDEO_STATUSES = ("pending", "processing", "completed", "failed")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.database_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create tables if they do not exist. Call once at startup."""
    with closing(get_conn()) as conn, conn:
        conn.executescript(SCHEMA)


def insert(sql: str, params: Iterable[Any] = ()) -> int:
    """Execute an INSERT and return the new row id."""
    with closing(get_conn()) as conn, conn:
        cur = conn.execute(sql, tuple(params))
        return int(cur.lastrowid)


def execute(sql: str, params: Iterable[Any] = ()) -> None:
    """Execute an UPDATE/DELETE/DDL statement."""
    with closing(get_conn()) as conn, conn:
        conn.execute(sql, tuple(params))


def query(sql: str, params: Iterable[Any] = ()) -> list:
    """Return all rows as a list of dicts."""
    with closing(get_conn()) as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [dict(r) for r in rows]


def query_one(sql: str, params: Iterable[Any] = ()) -> Optional[dict]:
    """Return one row as a dict, or None."""
    rows = query(sql, params)
    return rows[0] if rows else None


def query_scalar(sql: str, params: Iterable[Any] = ()) -> Any:
    """Return a single scalar value."""
    with closing(get_conn()) as conn:
        row = conn.execute(sql, tuple(params)).fetchone()
        return row[0] if row else None


# ----------------------------------------------------------------------
# Convenience helpers specific to the domain
# ----------------------------------------------------------------------

VIDEO_FIELDS = (
    "id, filename, source_type, file_path, status, error, duration_ms, fps, "
    "width, height, total_frames, processed_frames, processing_fps, "
    "detected_incidents, created_at, updated_at"
)


def get_video(video_id: int) -> Optional[dict]:
    return query_one(f"SELECT {VIDEO_FIELDS} FROM videos WHERE id = ?", (video_id,))


def list_videos(
    include_incident_count: bool = True,
    limit: int = 10,
    offset: int = 0,
    days: Optional[int] = None,
) -> list:
    fields = ", ".join(f"v.{f}" for f in VIDEO_FIELDS.split(", "))
    where = ""
    params: list = []
    if days is not None:
        where = " WHERE v.created_at >= ?"
        params = [_days_ago(days)]
    if include_incident_count:
        return query(
            f"""
            SELECT {fields}
                 , (SELECT COUNT(*) FROM incidents i WHERE i.video_id = v.id)
                   AS incident_count
              FROM videos v
             {where}
             ORDER BY v.id DESC
             LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        )
    return query(
        f"SELECT {fields} FROM videos v {where} ORDER BY v.id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )


def count_videos(days: Optional[int] = None) -> int:
    if days is not None:
        return query_scalar(
            "SELECT COUNT(*) FROM videos WHERE created_at >= ?", (_days_ago(days),)
        ) or 0
    return query_scalar("SELECT COUNT(*) FROM videos") or 0


def create_video(filename: str, file_path: str, source_type: str = "upload") -> int:
    now = _now()
    return insert(
        "INSERT INTO videos (filename, file_path, source_type, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (filename, file_path, source_type, now, now),
    )


def update_video(video_id: int, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = _now()
    assignments = ", ".join(f"{k} = ?" for k in fields)
    execute(
        f"UPDATE videos SET {assignments} WHERE id = ?",
        (*fields.values(), video_id),
    )


def get_incident(incident_id: int) -> Optional[dict]:
    return query_one(
        """
        SELECT i.*, v.filename AS video_filename, v.file_path AS video_file_path
          FROM incidents i
          JOIN videos v ON v.id = i.video_id
         WHERE i.id = ?
        """,
        (incident_id,),
    )


def list_incidents(
    video_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    days: Optional[int] = None,
) -> list:
    sql = """
        SELECT i.*, v.filename AS video_filename, v.file_path AS video_file_path
          FROM incidents i
          JOIN videos v ON v.id = i.video_id
    """
    clauses, params = [], []
    if video_id is not None:
        clauses.append("i.video_id = ?")
        params.append(video_id)
    if status:
        clauses.append("i.review_status = ?")
        params.append(status)
    if days is not None:
        clauses.append("i.created_at >= ?")
        params.append(_days_ago(days))
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY i.id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    return query(sql, params)


def count_incidents(
    video_id: Optional[int] = None,
    status: Optional[str] = None,
    days: Optional[int] = None,
) -> int:
    sql = "SELECT COUNT(*) FROM incidents i"
    clauses, params = [], []
    if video_id is not None:
        clauses.append("i.video_id = ?")
        params.append(video_id)
    if status:
        clauses.append("i.review_status = ?")
        params.append(status)
    if days is not None:
        clauses.append("i.created_at >= ?")
        params.append(_days_ago(days))
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    return query_scalar(sql, params) or 0


def count_videos_between(start: str, end: str) -> int:
    return query_scalar(
        "SELECT COUNT(*) FROM videos WHERE created_at >= ? AND created_at < ?",
        (start, end),
    ) or 0


def count_incidents_between(start: str, end: str) -> int:
    return query_scalar(
        "SELECT COUNT(*) FROM incidents WHERE created_at >= ? AND created_at < ?",
        (start, end),
    ) or 0


def create_incident(
    video_id: int,
    timestamp_ms: int,
    confidence: float,
    snapshot_path: str,
    clip_path: str,
    reason: str,
    class_names: str,
    track_id: Optional[int],
) -> int:
    now = _now()
    return insert(
        """
        INSERT INTO incidents
            (video_id, timestamp_ms, confidence, snapshot_path, clip_path,
             review_status, reason, class_names, track_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
        """,
        (
            video_id,
            timestamp_ms,
            confidence,
            snapshot_path,
            clip_path,
            reason,
            class_names,
            track_id,
            now,
            now,
        ),
    )


def set_incident_status(incident_id: int, review_status: str) -> Optional[dict]:
    if review_status not in REVIEW_STATUSES:
        raise ValueError(f"invalid review_status: {review_status!r}")
    execute(
        "UPDATE incidents SET review_status = ?, updated_at = ? WHERE id = ?",
        (review_status, _now(), incident_id),
    )
    return get_incident(incident_id)


def list_video_incident_summaries(
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    min_incidents: int = 0,
    days: Optional[int] = None,
) -> list:
    """Return videos with incident count breakdowns for the review dashboard."""
    sql = """
        SELECT
            v.id,
            v.filename,
            v.status AS video_status,
            v.created_at,
            COUNT(i.id) AS total_incidents,
            SUM(CASE WHEN i.review_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN i.review_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
            SUM(CASE WHEN i.review_status = 'false_alarm' THEN 1 ELSE 0 END) AS false_alarm_count
        FROM videos v
        LEFT JOIN incidents i ON i.video_id = v.id
    """
    having_clauses, params = [], []

    if status_filter and status_filter != "all":
        if status_filter == "pending":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'pending' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "confirmed":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'confirmed' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "false_alarm":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'false_alarm' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "has_incidents":
            having_clauses.append("COUNT(i.id) > 0")

    if min_incidents > 0:
        having_clauses.append(f"COUNT(i.id) >= {min_incidents}")

    where_parts = []
    if search:
        where_parts.append("v.filename LIKE ?")
        params.append(f"%{search}%")
    if days:
        where_parts.append("v.created_at >= ?")
        params.append(_days_ago(days))

    if where_parts:
        sql += " WHERE " + " AND ".join(where_parts)

    sql += " GROUP BY v.id"

    if having_clauses:
        sql += " HAVING " + " AND ".join(having_clauses)

    sql += " ORDER BY v.id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    return query(sql, params)


def count_video_incident_summaries(
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    min_incidents: int = 0,
    days: Optional[int] = None,
) -> int:
    sql = "SELECT COUNT(*) FROM (SELECT v.id FROM videos v LEFT JOIN incidents i ON i.video_id = v.id"
    having_clauses, params = [], []

    if status_filter and status_filter != "all":
        if status_filter == "pending":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'pending' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "confirmed":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'confirmed' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "false_alarm":
            having_clauses.append("SUM(CASE WHEN i.review_status = 'false_alarm' THEN 1 ELSE 0 END) > 0")
        elif status_filter == "has_incidents":
            having_clauses.append("COUNT(i.id) > 0")

    if min_incidents > 0:
        having_clauses.append(f"COUNT(i.id) >= {min_incidents}")

    where_parts = []
    if search:
        where_parts.append("v.filename LIKE ?")
        params.append(f"%{search}%")
    if days:
        where_parts.append("v.created_at >= ?")
        params.append(_days_ago(days))

    if where_parts:
        sql += " WHERE " + " AND ".join(where_parts)

    sql += " GROUP BY v.id"

    if having_clauses:
        sql += " HAVING " + " AND ".join(having_clauses)

    sql += ")"
    return query_scalar(sql, params) or 0


def _now() -> str:
    from .utils import now_str

    return now_str()


def _days_ago(n: int) -> str:
    """Return a 'YYYY-MM-DD HH:MM:SS' string for *n* days ago."""
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d 00:00:00")
