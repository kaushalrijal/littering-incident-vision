"""
Central configuration for the littering detection system.

Every setting can be overridden through environment variables or a `.env`
file placed in the project root (see `.env.example`).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env from the project root if present.
load_dotenv(BASE_DIR / ".env")


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Runtime settings. Access as ``settings`` (module-level singleton)."""

    def __init__(self) -> None:
        # --- Paths -------------------------------------------------------
        self.base_dir: Path = BASE_DIR
        self.database_path: Path = Path(
            _env_str("DATABASE_PATH", str(BASE_DIR / "backend" / "data" / "litter.db"))
        )
        self.storage_dir: Path = Path(
            _env_str("STORAGE_DIR", str(BASE_DIR / "backend" / "storage"))
        )
        self.frontend_dir: Path = BASE_DIR / "frontend"

        # --- Server ------------------------------------------------------
        self.host: str = _env_str("HOST", "127.0.0.1")
        self.port: int = _env_int("PORT", 8000)
        self.max_upload_mb: int = _env_int("MAX_UPLOAD_MB", 500)

        # --- Model -------------------------------------------------------
        self.model_path: str = _env_str("MODEL_PATH", "yolov8n.pt")
        self.device: str = _env_str("DEVICE", "cpu")
        self.conf_threshold: float = _env_float("CONF_THRESHOLD", 0.30)
        self.iou_threshold: float = _env_float("IOU_THRESHOLD", 0.45)
        self.imgsz: int = _env_int("IMGSZ", 640)
        self.waste_classes: list = [
            c.strip()
            for c in _env_str("WASTE_CLASSES", "bottle,cup").split(",")
            if c.strip()
        ]

        # --- Processing --------------------------------------------------
        self.frame_step: int = _env_int("FRAME_STEP", 2)
        self.max_incidents: int = _env_int("MAX_INCIDENTS", 50)
        self.save_output_video: bool = _env_bool("SAVE_OUTPUT_VIDEO", True)
        self.log_detections: bool = _env_bool("LOG_DETECTIONS", False)
        self.max_video_duration_s: int = _env_int("MAX_VIDEO_DURATION_S", 0)

        # --- Event rule engine (N ^ R ^ S ^ M) ----------------------------
        self.proximity_radius: float = _env_float("PROXIMITY_RADIUS", 150.0)
        self.stationary_threshold: float = _env_float("STATIONARY_THRESHOLD", 8.0)
        self.stationary_frames: int = _env_int("STATIONARY_FRAMES", 12)
        self.leave_distance: float = _env_float("LEAVE_DISTANCE", 120.0)
        self.min_track_frames: int = _env_int("MIN_TRACK_FRAMES", 5)
        self.min_object_area: float = _env_float("MIN_OBJECT_AREA", 400.0)
        self.edge_margin: float = _env_float("EDGE_MARGIN", 40.0)
        self.ignore_first_frames: int = _env_int("IGNORE_FIRST_FRAMES", 20)

        # Internal engine windows (frames). Not exposed in .env.example.
        self.person_near_window: int = _env_int("PERSON_NEAR_WINDOW", 15)
        self.person_expire: int = _env_int("PERSON_EXPIRE", 60)
        self.waste_expire: int = _env_int("WASTE_EXPIRE", 60)

        # --- Evidence clips ----------------------------------------------
        self.clip_before_ms: int = _env_int("CLIP_BEFORE_MS", 2000)
        self.clip_after_ms: int = _env_int("CLIP_AFTER_MS", 3000)

        self._ensure_dirs()

    # ------------------------------------------------------------------
    def _ensure_dirs(self) -> None:
        """Create the directories the system needs at runtime."""
        for sub in ("videos", "snapshots", "clips", "output"):
            (self.storage_dir / sub).mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.frontend_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    @property
    def media_dir(self) -> Path:
        """Absolute directory served at /media."""
        return self.storage_dir


settings = Settings()
