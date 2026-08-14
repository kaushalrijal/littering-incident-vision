"""Small shared helpers."""
from datetime import datetime
from pathlib import Path

from .config import settings

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def now_str() -> str:
    """Local time as 'YYYY-MM-DD HH:MM:SS' (consistent with the dashboard)."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def safe_ext(filename: str) -> str:
    """Return the lower-cased extension of a filename, or '' if empty."""
    return Path(filename or "").suffix.lower()


def is_allowed_video(filename: str) -> bool:
    return safe_ext(filename) in ALLOWED_VIDEO_EXTENSIONS


def rel_path(absolute: Path) -> str:
    """Store paths relative to the media storage root."""
    try:
        return str(absolute.relative_to(settings.media_dir))
    except ValueError:
        return str(absolute)


def abs_path(relative: str) -> Path:
    """Resolve a stored (relative) media path to an absolute path."""
    p = Path(relative)
    return p if p.is_absolute() else settings.media_dir / p
