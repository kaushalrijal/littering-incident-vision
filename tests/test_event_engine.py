"""
Unit tests for the N ^ R ^ S ^ M event engine (pure logic, no ML deps).

Run from the project root:
    python -m pytest tests/ -v
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.services.event_engine import EventEngine  # noqa: E402

# Test configuration (a lightweight stand-in for Settings).
CFG = SimpleNamespace(
    proximity_radius=100.0,
    stationary_threshold=8.0,
    stationary_frames=10,
    leave_distance=80.0,
    min_track_frames=3,
    min_object_area=50.0,
    edge_margin=20.0,
    ignore_first_frames=5,
    person_near_window=10,
    person_expire=40,
    waste_expire=40,
    max_incidents=10,
)


def person(tid, x1, y1, x2, y2):
    return {"track_id": tid, "class_name": "person", "bbox": (x1, y1, x2, y2), "conf": 0.9}


def waste(tid, x1, y1, x2, y2):
    return {"track_id": tid, "class_name": "bottle", "bbox": (x1, y1, x2, y2), "conf": 0.8}


def make_engine():
    return EventEngine(CFG, frame_width=640, frame_height=480)


def run_frames(engine, n_frames, person_dets, waste_dets):
    """person_dets/waste_dets: callables(frame_idx) -> list of dets."""
    all_events = []
    for idx in range(n_frames):
        ts = idx * 33  # pretend 30 fps
        events = engine.process_frame(idx, ts, person_dets(idx), waste_dets(idx))
        all_events.extend(events)
    return all_events


# ----------------------------------------------------------------------
def test_happy_path_detects_littering_event():
    """Person near object birth, object stationary, person walks away -> event."""
    engine = make_engine()

    def persons(idx):
        if idx < 20:
            x = 100 + min(idx, 15) * 12  # moves to ~280 by frame 15
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if idx >= 5:
            return [waste(50, 110, 100, 140, 130)]  # stays put
        return []

    events = run_frames(engine, 40, persons, wastes)

    assert len(events) == 1, f"expected 1 event, got {len(events)}"
    ev = events[0]
    assert ev["track_id"] == 50
    assert ev["class_name"] == "bottle"
    assert 0.0 < ev["confidence"] <= 1.0
    assert ev["timestamp_ms"] >= 0
    assert "stationary" in ev["reason"]


def test_pre_existing_waste_never_fires():
    """Waste visible from the very first frames is pre-existing litter."""
    engine = make_engine()

    def persons(idx):
        if idx < 25:
            x = 120 if idx < 10 else 120 + (idx - 10) * 15
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        return [waste(50, 110, 100, 140, 130)]  # born at frame 0

    events = run_frames(engine, 40, persons, wastes)
    assert events == []


def test_person_walking_past_existing_litter_no_event():
    """A person near already-present waste must not trigger an event."""
    engine = make_engine()

    def persons(idx):
        return [person(1, 100 + idx * 10, 90, 130 + idx * 10, 120)]

    def wastes(idx):
        return [waste(50, 110, 100, 140, 130)]

    events = run_frames(engine, 30, persons, wastes)
    assert events == []


def test_waste_appears_without_person_nearby_no_event():
    """Object appears far from any person -> no association -> no event."""
    engine = make_engine()

    def persons(idx):
        if idx < 15:
            return [person(1, 100, 100, 130, 130)]
        return []

    def wastes(idx):
        if idx >= 8:
            return [waste(50, 400, 300, 430, 330)]  # ~300px from the person
        return []

    events = run_frames(engine, 40, persons, wastes)
    assert events == []


def test_single_event_per_track_debounce():
    """One waste track must produce at most one event."""
    engine = make_engine()

    def persons(idx):
        x = 100 + min(idx, 20) * 12
        return [person(1, x, 90, x + 30, 120)]

    def wastes(idx):
        if idx >= 5:
            return [waste(50, 110, 100, 140, 130)]
        return []

    events = run_frames(engine, 80, persons, wastes)
    assert len(events) == 1


def test_edge_object_skipped():
    """Objects born on the frame edge are detector artifacts -> skipped."""
    engine = make_engine()

    def persons(idx):
        if idx < 20:
            return [person(1, 60, 90, 90, 120)]
        return []

    def wastes(idx):
        if idx >= 5:
            return [waste(50, 5, 100, 35, 130)]  # x1 = 5 < edge_margin(20)
        return []

    events = run_frames(engine, 40, persons, wastes)
    assert events == []


def test_reset_clears_state():
    engine = make_engine()
    engine.process_frame(0, 0, [person(1, 100, 100, 130, 130)], [])
    engine.reset()
    assert engine.person_tracks == {}
    assert engine.waste_tracks == {}
    assert engine._events == []
