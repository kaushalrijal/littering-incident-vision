"""
Unit tests for the live-camera evidence recorder (backend/app/services/live_recorder.py).

These run torch-free with a temp database + storage root, verifying that a
webcam session persists incidents exactly like uploaded videos do: annotated
snapshot, evidence clip spanning pre-roll (from the ring buffer) around the
littering moment plus post-roll after the fire, and rows visible through the
ordinary incidents/videos queries.

Run from the project root:
    python -m pytest tests/test_live_recorder.py -v
"""
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import config as app_config  # noqa: E402
from backend.app import db  # noqa: E402
from backend.app.services.live_recorder import RING_MARGIN_MS, LiveSessionRecorder  # noqa: E402

CFG = SimpleNamespace(
    webcam_save_evidence=True,
    clip_before_ms=2000,
    clip_after_ms=3000,
    clip_max_ms=15000,
)


@pytest.fixture()
def isolated_storage(tmp_path, monkeypatch):
    """Point the global settings at a throwaway DB + storage tree."""
    storage = tmp_path / "storage"
    for sub in ("videos", "snapshots", "clips", "output"):
        (storage / sub).mkdir(parents=True)
    monkeypatch.setattr(app_config.settings, "storage_dir", storage)
    monkeypatch.setattr(app_config.settings, "database_path", tmp_path / "test.db")
    db.init_db()
    return storage


def jpeg_bytes(w=64, h=48):
    img = np.full((h, w, 3), 90, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def make_event(fire_ts, born_ts=None, track=7):
    return {
        "timestamp_ms": fire_ts,
        "born_timestamp_ms": born_ts if born_ts is not None else fire_ts,
        "confidence": 0.82,
        "class_name": "bottle",
        "track_id": track,
        "reason": "unit-test event",
        "stationary_frames": 9,
        "born_dist": 42.0,
        "current_dist": 130.0,
    }


def feed(recorder, start_ms, end_ms, step_ms=200):
    for ts in range(start_ms, end_ms + 1, step_ms):
        recorder.record_frame(ts, jpeg_bytes())


def test_disabled_recorder_is_a_no_op(isolated_storage):
    cfg = SimpleNamespace(webcam_save_evidence=False, clip_before_ms=2000,
                          clip_after_ms=3000, clip_max_ms=15000)
    rec = LiveSessionRecorder(cfg)
    rec.frame_width, rec.frame_height = 64, 48

    feed(rec, 0, 5000)
    assert rec.register_event(make_event(5000), 5000, snapshot_bgr=np.zeros((4, 4, 3), np.uint8)) is None
    assert rec.recording is False
    assert db.count_videos() == 0
    assert db.count_incidents() == 0


def test_register_event_persists_incident_snapshot_and_session(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    feed(rec, 1000, 5000)

    incident_id = rec.register_event(
        make_event(5000, born_ts=4000),
        5000,
        snapshot_bgr=np.zeros((4, 4, 3), dtype=np.uint8),
    )
    assert incident_id is not None

    # Incident is immediately visible through the normal review queries.
    incident = db.get_incident(incident_id)
    assert incident["video_id"] == rec.session_video_id
    assert incident["review_status"] == "pending"
    assert incident["snapshot_path"] is not None
    assert (isolated_storage / incident["snapshot_path"]).stat().st_size > 0
    assert incident["clip_path"] is None  # clip still collecting post-roll

    # One library row for the whole session, marked as a webcam source.
    video = db.get_video(rec.session_video_id)
    assert video["source_type"] == "webcam"
    assert video["filename"].startswith("Live camera")


def test_clip_finalizes_after_post_roll_with_preroll_backfilled(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    feed(rec, 1000, 5000)  # frames every 200 ms

    incident_id = rec.register_event(make_event(5000, born_ts=4000), 5000)
    clip = rec._active[0]
    # Pre-roll: [born - 2000ms, fire] -> ts 2000..5000 inclusive = 16 frames.
    assert clip.start_ts == 2000
    assert len(clip.frames) == 16
    assert rec.recording is True

    # Post-roll: frames keep flowing until the window closes at fire + 3000 ms.
    feed(rec, 5200, 8200)
    assert rec._active == []  # finalized once a frame crossed end_ts

    incident = db.get_incident(incident_id)
    assert incident["clip_path"] is not None
    clip_file = isolated_storage / incident["clip_path"]
    assert clip_file.stat().st_size > 0


def test_finalize_all_flushes_open_clips_and_closes_the_session(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    feed(rec, 1000, 5000)

    incident_id = rec.register_event(make_event(5000, born_ts=4000), 5000)
    rec.finalize_all()  # e.g. the user pressed Stop mid post-roll
    rec.finalize_all()  # must be safe to call twice

    assert rec._active == []
    incident = db.get_incident(incident_id)
    assert incident["clip_path"] is not None
    assert (isolated_storage / incident["clip_path"]).stat().st_size > 0

    video = db.get_video(rec.session_video_id)
    assert video["status"] == "completed"
    assert video["detected_incidents"] == 1


def test_pre_roll_never_exceeds_buffered_history(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48

    # Fill the buffer, letting the pruner evict everything older than
    # now - (pre-roll + margin): at ts 5000 the horizon is 1500 ms.
    feed(rec, 1000, 5000)
    oldest_kept = next(ts for ts in range(1000, 999999, 200) if ts >= 5000 - (CFG.clip_before_ms + RING_MARGIN_MS))

    # Birth long before anything buffered: the clip simply starts at the
    # oldest retained frame instead of failing or producing a hole.
    rec.register_event(make_event(5000, born_ts=1000), 5000)
    clip = rec._active[0]
    assert clip.start_ts == oldest_kept
    assert clip.frames[0][0] == oldest_kept


def test_two_events_get_independent_clips_and_sequences(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    feed(rec, 1000, 5000)

    id1 = rec.register_event(make_event(5000, born_ts=4500, track=7), 5000)
    id2 = rec.register_event(make_event(5100, born_ts=4600, track=8), 5100)
    assert id1 != id2
    assert len(rec._active) == 2
    assert db.count_incidents() == 2
    assert rec.incident_count == 2

    rec.finalize_all()
    paths = {db.get_incident(i)["clip_path"] for i in (id1, id2)}
    assert None not in paths
    assert len(paths) == 2  # distinct clip files


def test_missing_snapshot_still_persists_the_incident(isolated_storage):
    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    feed(rec, 1000, 5000)

    incident_id = rec.register_event(make_event(5000), 5000, snapshot_bgr=None)
    incident = db.get_incident(incident_id)
    assert incident["snapshot_path"] is None
    assert incident["reason"] == "unit-test event"


# ----------------------------------------------------------------------
# Integration with webcam._process_frame (fake detector/engine, real recorder)
# ----------------------------------------------------------------------
class _FakeDetector:
    person_ids = [0]
    waste_ids = [1]

    def predict(self, frame):
        return []


class _FakeEngine:
    def __init__(self):
        self.frame_width = 0
        self.frame_height = 0

    def process_frame(self, frame_idx, ts_ms, person_dets, waste_dets):
        return [make_event(ts_ms, born_ts=ts_ms - 1000)]

    def get_active_associations(self):
        return []


class _FakePipeline:
    @staticmethod
    def _draw_detections(frame, dets, engine=None):
        return frame


def test_process_frame_attaches_incident_and_recording_flag(isolated_storage):
    from backend.app.routers import webcam

    rec = LiveSessionRecorder(CFG)
    rec.frame_width, rec.frame_height = 64, 48
    rec.record_frame(1000, jpeg_bytes())

    result = webcam._process_frame(
        _FakeDetector(), _FakeEngine(), _FakePipeline(), jpeg_bytes(), 1,
        want_image=False, recorder=rec,
    )

    assert result["events"][0]["incident_id"] is not None
    assert result["recording"] is True  # post-roll still open
    assert db.get_incident(result["events"][0]["incident_id"]) is not None

    rec.finalize_all()
