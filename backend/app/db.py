"""
SQLite data-access layer.

A fresh connection is opened per call, which makes the module safe to use
from the FastAPI request threads and the background processing worker at
the same time. WAL mode keeps readers from blocking the writer.
"""
import sqlite3
from contextlib import closing
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


VIDEO_SORTS = {
    "newest": "v.id DESC",
    "oldest": "v.id ASC",
    "name": "v.filename COLLATE NOCASE ASC",
    "incidents": "(SELECT COUNT(*) FROM incidents i WHERE i.video_id = v.id) DESC, v.id DESC",
}


def list_videos(
    sort: str = "newest",
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    """List videos, newest first by default.

    ``sort`` is a key in ``VIDEO_SORTS``, ``status`` filters on the
    processing status and ``search`` does a case-insensitive substring
    match against the filename.
    """
    fields = ", ".join(f"v.{f}" for f in VIDEO_FIELDS.split(", "))
    order_by = VIDEO_SORTS.get(sort, VIDEO_SORTS["newest"])
    clauses, params = [], []
    if status:
        clauses.append("v.status = ?")
        params.append(status)
    if search:
        clauses.append("v.filename LIKE ?")
        params.append(f"%{search}%")
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return query(
        f"""
        SELECT {fields}
             , (SELECT COUNT(*) FROM incidents i WHERE i.video_id = v.id)
               AS incident_count
          FROM videos v{where}
         ORDER BY {order_by}
        """,
        params,
    )


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


def reconcile_interrupted_videos() -> list:
    """Recover videos left mid-processing by a previous run (a crash or restart).

    The single background worker handles one video at a time and always moves a
    row on to 'completed' or 'failed' when it stops working on it. So any row
    still marked 'processing' when the server starts was interrupted before it
    could finish. Reset those rows to 'failed' with a clear message so they never
    stay stuck, and so the operator can re-run them from the dashboard. Returns
    the list of video ids that were reset.
    """
    rows = query("SELECT id FROM videos WHERE status = 'processing'")
    ids = [row["id"] for row in rows]
    if not ids:
        return []
    placeholders = ", ".join("?" for _ in ids)
    execute(
        f"UPDATE videos SET status = 'failed', error = ?, updated_at = ? "
        f"WHERE id IN ({placeholders})",
        (
            "Processing was interrupted before it finished (for example, the "
            "server stopped). Use Re-run to try again.",
            _now(),
            *ids,
        ),
    )
    return ids


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


INCIDENT_SORTS = {
    "newest": "i.id DESC",
    "oldest": "i.id ASC",
    "confidence": "i.confidence DESC, i.id DESC",
    "timestamp": "i.timestamp_ms DESC, i.id DESC",
}


def list_incidents(
    video_id: Optional[int] = None,
    status: Optional[str] = None,
    sort: str = "newest",
    min_confidence: Optional[float] = None,
    search: Optional[str] = None,
) -> list:
    """List incidents joined with their video, newest first by default.

    Sortable via ``INCIDENT_SORTS`` keys; filterable by video, review
    status, minimum confidence and a substring match on the reason text.
    """
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
    if min_confidence is not None:
        clauses.append("i.confidence >= ?")
        params.append(min_confidence)
    if search:
        clauses.append("(i.reason LIKE ? OR v.filename LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += f" ORDER BY {INCIDENT_SORTS.get(sort, INCIDENT_SORTS['newest'])}"
    return query(sql, params)


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


def _now() -> str:
    from .utils import now_str

    return now_str()
