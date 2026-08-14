"""
YOLO detector + ByteTrack tracker wrapper around Ultralytics.

* ``person`` detections come from the model's ``person`` class
  (class id 0 on the pretrained COCO model).
* Waste-like detections come from the classes listed in
  ``settings.waste_classes`` (default ``bottle,cup`` for COCO weights).
  If you fine-tune a model on TACO/TrashNet, set ``WASTE_CLASSES`` to your
  class names (e.g. ``bottle,cup,wrapper,paper,other_waste``).

The wrapper is NOT thread-safe by design: it is used exclusively by the
single background processing worker.
"""
import logging
from typing import List, Optional

import numpy as np

from backend.app.config import settings

logger = logging.getLogger("ml.detector")


class Detector:
    def __init__(
        self,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        conf: Optional[float] = None,
        iou: Optional[float] = None,
        imgsz: Optional[int] = None,
    ) -> None:
        from ultralytics import YOLO  # heavy import: only when actually used

        self.model_path = model_path or settings.model_path
        self.device = device or settings.device
        self.conf = conf if conf is not None else settings.conf_threshold
        self.iou = iou if iou is not None else settings.iou_threshold
        self.imgsz = imgsz if imgsz is not None else settings.imgsz

        logger.info("Loading YOLO model %r (device=%s) ...", self.model_path, self.device)
        self.model = YOLO(self.model_path)

        # Resolve class ids ------------------------------------------------
        names = self.model.names  # dict[int, str]
        self.names: dict = {int(k): str(v) for k, v in names.items()}
        self.person_ids: List[int] = [
            i for i, n in self.names.items() if n.lower() == "person"
        ]
        if not self.person_ids:
            # Custom models that call the class something else: fall back to 0.
            logger.warning("No class named 'person' found; assuming class id 0.")
            self.person_ids = [0]

        wanted = [n.strip().lower() for n in settings.waste_classes if n.strip()]
        if wanted:
            self.waste_ids: List[int] = []
            for i, n in self.names.items():
                if n.lower() in wanted:
                    self.waste_ids.append(i)
            missing = [w for w in wanted if w not in [self.names[i].lower() for i in self.waste_ids]]
            if missing:
                logger.warning(
                    "Waste classes not present in this model (ignored): %s "
                    "(available classes: %s)",
                    missing,
                    sorted(self.names.values()),
                )
        else:
            # No explicit waste classes: treat everything except person as waste.
            self.waste_ids = [i for i in self.names if i not in self.person_ids]

        self.waste_ids = sorted(set(self.waste_ids))
        self._all_used_ids = set(self.person_ids) | set(self.waste_ids)
        logger.info(
            "Person classes: %s | Waste classes: %s", self.person_ids, self.waste_ids
        )

    # ------------------------------------------------------------------
    def predict(self, frame_bgr: np.ndarray) -> List[dict]:
        """
        Run detection + tracking on one BGR frame.

        Returns a list of dicts:
            {"class_id", "class_name", "bbox": (x1, y1, x2, y2), "conf", "track_id"}
        ``track_id`` may be None (e.g. very first frame or tracker warm-up);
        the event engine simply skips untracked detections.
        """
        results = self.model.track(
            frame_bgr,
            persist=True,
            tracker="bytetrack.yaml",
            conf=self.conf,
            iou=self.iou,
            imgsz=self.imgsz,
            device=self.device,
            verbose=False,
        )

        dets: List[dict] = []
        boxes = results[0].boxes
        if boxes is None or boxes.xyxy is None or len(boxes) == 0:
            return dets

        xyxy = boxes.xyxy.detach().cpu().numpy()
        confs = boxes.conf.detach().cpu().numpy()
        clss = boxes.cls.detach().cpu().numpy().astype(int)
        ids = (
            boxes.id.detach().cpu().numpy().astype(int)
            if boxes.id is not None
            else None
        )

        for i in range(len(xyxy)):
            class_id = int(clss[i])
            if class_id not in self._all_used_ids:
                continue
            x1, y1, x2, y2 = (float(v) for v in xyxy[i])
            dets.append(
                {
                    "class_id": class_id,
                    "class_name": self.names.get(class_id, str(class_id)),
                    "bbox": (x1, y1, x2, y2),
                    "conf": float(confs[i]),
                    "track_id": int(ids[i]) if ids is not None else None,
                }
            )
        return dets
