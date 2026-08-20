"""
Background processing worker.

A single daemon thread drains a queue of video ids and processes each one
with the Pipeline. The YOLO model is loaded lazily on the first job, in the
worker thread, so the web server starts fast and model loading never blocks
a request.
"""
import logging
import queue
import threading

from backend.app import db
from backend.app.services.pipeline import Pipeline

logger = logging.getLogger("worker")


from backend.app.services.websocket_manager import ws_manager


class ProcessingWorker:
    def __init__(self) -> None:
        self._queue: "queue.Queue[int]" = queue.Queue()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._detector = None

    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="processing-worker", daemon=True
        )
        self._thread.start()
        logger.info("Processing worker started")

    def stop(self) -> None:
        self._stop.set()
        self._queue.put(None)
        if self._thread is not None:
            self._thread.join(timeout=10)
        logger.info("Processing worker stopped")

    def enqueue(self, video_id: int) -> None:
        self._queue.put(video_id)
        ws_manager.broadcast_sync({
            "type": "video_status",
            "video_id": video_id,
            "status": "pending"
        })

    # ------------------------------------------------------------------
    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                item = self._queue.get(timeout=1.0)
            except queue.Empty:
                continue
            if item is None:
                break
            try:
                self._process_one(item)
            except Exception:  # defensive: never kill the worker thread
                logger.exception("Unhandled error while processing video %s", item)

    def _process_one(self, video_id: int) -> None:
        video = db.get_video(video_id)
        if video is None:
            logger.warning("Skipping missing video %s", video_id)
            return
        if video["status"] in ("processing", "completed"):
            logger.info("Skipping video %s (status=%s)", video_id, video["status"])
            return

        db.update_video(video_id, status="processing", error=None)
        ws_manager.broadcast_sync({
            "type": "video_status",
            "video_id": video_id,
            "status": "processing"
        })

        try:
            detector = self._get_detector()
            pipeline = Pipeline(detector)

            def progress(stats: dict) -> None:
                db.update_video(
                    video_id,
                    processed_frames=stats.get("processed_frames", 0),
                    detected_incidents=stats.get("detected_incidents", 0),
                )
                ws_manager.broadcast_sync({
                    "type": "video_progress",
                    "video_id": video_id,
                    "stats": stats
                })

            res = pipeline.process(video_id, persist=True, progress_cb=progress)
            ws_manager.broadcast_sync({
                "type": "video_status",
                "video_id": video_id,
                "status": "completed",
                "stats": res
            })
        except Exception as exc:
            logger.exception("Processing failed for video %s", video_id)
            db.update_video(video_id, status="failed", error=str(exc)[:1000])
            ws_manager.broadcast_sync({
                "type": "video_status",
                "video_id": video_id,
                "status": "failed",
                "error": str(exc)[:1000]
            })

    def _get_detector(self):
        if self._detector is None:
            from ml.detector import Detector

            logger.info("Initializing detector (first job)...")
            self._detector = Detector()
        return self._detector


worker = ProcessingWorker()
