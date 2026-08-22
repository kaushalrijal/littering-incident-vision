"""
Unit tests for the webcam frame processor (backend/app/routers/webcam.py).

These tests are torch-free: they use a fake detector and a fake event engine, so
they run without YOLO or a real camera. They check the two response protocols
that the /ws/webcam endpoint speaks:

* the new **metadata-only** mode (binary frame in, boxes/associations/events
  out, no re-encoded image), and
* the **legacy** mode (base64 image in, annotated base64 image out).

They also confirm that an undecodable frame is dropped safely.
"""
import cv2
import numpy as np

from backend.app.routers import webcam


class _FakeDetector:
    """Stand-in for ml.detector.Detector with two fixed detections."""

    person_ids = [0]
    waste_ids = [1]

    def predict(self, frame):
        return [
            {
                "class_id": 0,
                "class_name": "person",
                "bbox": (10.0, 20.0, 60.0, 120.0),
                "conf": 0.9,
                "track_id": 1,
            },
            {
                "class_id": 1,
                "class_name": "trash",
                "bbox": (30.4, 80.6, 45.1, 100.9),
                "conf": 0.752,
                "track_id": 7,
            },
        ]


class _FakeEngine:
    """Stand-in for EventEngine: records calls, links trash 7 to person 1."""

    def __init__(self):
        self.frame_width = 0
        self.frame_height = 0
        self.calls = []

    def process_frame(self, frame_idx, ts_ms, person_dets, waste_dets):
        self.calls.append((frame_idx, len(person_dets), len(waste_dets)))
        return [
            {
                "frame_idx": frame_idx,
                "timestamp_ms": ts_ms,
                "confidence": 0.8,
                "class_name": "trash",
                "track_id": 7,
                "reason": "test event",
            }
        ]

    def get_active_associations(self):
        return [(7, 1)]


class _FakePipeline:
    def __init__(self, detector=None):
        pass

    def _draw_detections(self, frame, dets, engine=None):
        return frame  # identity: we only care that an image is produced


def _jpeg_bytes(w=64, h=48):
    img = np.zeros((h, w, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_process_frame_meta_mode_shape():
    engine = _FakeEngine()
    result = webcam._process_frame(
        _FakeDetector(), engine, _FakePipeline(), _jpeg_bytes(), 0, want_image=False
    )

    assert result["type"] == "webcam_frame"
    assert result["mode"] == "meta"
    assert result["width"] == 64 and result["height"] == 48
    assert "image" not in result  # the whole point: no re-encoded frame is sent
    assert result["frame_idx"] == 0

    detections = result["detections"]
    assert len(detections) == 2
    person = next(d for d in detections if d["kind"] == "person")
    trash = next(d for d in detections if d["kind"] == "waste")

    assert person["track_id"] == 1
    assert person["assoc_person"] is None
    assert trash["track_id"] == 7
    assert trash["assoc_person"] == 1  # waste linked to its person

    assert list(map(tuple, result["associations"])) == [(7, 1)]
    assert result["events"][0]["reason"] == "test event"
    # The engine received the split person/waste lists and the frame size.
    assert engine.calls == [(0, 1, 1)]
    assert engine.frame_width == 64 and engine.frame_height == 48


def test_process_frame_meta_bbox_is_rounded_float_list():
    result = webcam._process_frame(
        _FakeDetector(), _FakeEngine(), _FakePipeline(), _jpeg_bytes(), 0, want_image=False
    )
    for d in result["detections"]:
        assert isinstance(d["bbox"], list) and len(d["bbox"]) == 4
        assert all(isinstance(v, float) for v in d["bbox"])
    trash = next(d for d in result["detections"] if d["kind"] == "waste")
    assert trash["bbox"] == [30.4, 80.6, 45.1, 100.9]
    assert trash["conf"] == 0.752


def test_process_frame_legacy_mode_returns_image():
    result = webcam._process_frame(
        _FakeDetector(), _FakeEngine(), _FakePipeline(), _jpeg_bytes(), 3, want_image=True
    )
    assert result["type"] == "webcam_frame"
    assert result["image"].startswith("data:image/jpeg;base64,")
    assert "detections" not in result  # legacy shape stays image-only
    assert result["frame_idx"] == 3
    assert list(map(tuple, result["associations"])) == [(7, 1)]
    assert result["events"][0]["track_id"] == 7


def test_process_frame_undecodable_returns_none():
    result = webcam._process_frame(
        _FakeDetector(), _FakeEngine(), _FakePipeline(), b"not a jpeg", 0, want_image=False
    )
    assert result is None
