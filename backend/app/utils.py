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


def ensure_openh264() -> None:
    """Ensure Cisco OpenH264 DLL is present so OpenCV encodes native H.264 (avc1) playable in all web browsers."""
    import sys
    if sys.platform != "win32":
        return
    dll_name = "openh264-2.5.0-win64.dll"
    target_paths = [Path(dll_name), Path(sys.prefix) / "Scripts" / dll_name]
    if any(p.exists() for p in target_paths):
        return

    import bz2
    import logging
    import urllib.request
    logger = logging.getLogger("utils.openh264")
    url = "https://ciscobinary.openh264.org/openh264-2.5.0-win64.dll.bz2"
    try:
        logger.info("Downloading Cisco OpenH264 library for web browser HTML5 video compatibility...")
        data = urllib.request.urlopen(url, timeout=10).read()
        decompressed = bz2.decompress(data)
        Path(dll_name).write_bytes(decompressed)
        logger.info("OpenH264 library installed successfully.")
    except Exception as e:
        logger.warning("Could not download OpenH264 library: %s", e)
