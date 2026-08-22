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


def test_waste_track_reconnection_after_detection_dropout():
    """If waste detection drops for a few frames and gets assigned a new track ID after person walks away, track stitching reconnects it and fires event."""
    engine = make_engine()

    def persons(idx):
        if idx < 25:
            x = 100 + min(idx, 20) * 12  # person moves away from 100 to 340
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if 5 <= idx < 10:
            return [waste(50, 110, 100, 140, 130)]  # original waste track ID 50
        elif idx >= 15:
            return [waste(99, 112, 101, 142, 131)]  # reappears with NEW track ID 99 after 5 missing frames!
        return []

    events = run_frames(engine, 40, persons, wastes)

    assert len(events) == 1, f"expected 1 reconnected event, got {len(events)}"
    ev = events[0]
    assert ev["track_id"] == 50  # preserved original track ID from reconnection
    assert ev["class_name"] == "bottle"


def test_person_track_reconnection_after_person_id_change():
    """If person track changes ID mid-sequence (e.g. from 1 to 77), person alias mapping links them so distance calculation M succeeds."""
    engine = make_engine()

    def persons(idx):
        if idx < 10:
            return [person(1, 100, 90, 130, 120)]
        elif idx >= 12:
            x = 100 + (idx - 10) * 15  # person reappears as ID 77 and moves away
            return [person(77, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if idx >= 5:
            return [waste(50, 110, 100, 140, 130)]
        return []

    events = run_frames(engine, 40, persons, wastes)

    assert len(events) == 1, f"expected 1 event with person alias mapping, got {len(events)}"
    assert events[0]["track_id"] == 50


def test_off_camera_person_departure():
    """If person drops litter, moves away, and leaves the frame, the engine still fires the event using the person's last known location."""
    engine = make_engine()

    def persons(idx):
        if idx < 15:
            x = 100 + idx * 20  # person moves from 100 to 400 (far away > 80px) and disappears
            return [person(1, x, 90, x + 30, 120)]
        return []  # person leaves camera view after frame 15

    def wastes(idx):
        if idx >= 5:
            return [waste(50, 110, 100, 140, 130)]  # stays still
        return []

    events = run_frames(engine, 30, persons, wastes)

    assert len(events) == 1, f"expected 1 event for off-camera person departure, got {len(events)}"
    assert events[0]["track_id"] == 50


def test_get_active_associations():
    """Verify that get_active_associations returns [(waste_id, person_id)] once a track is confirmed."""
    engine = make_engine()
    engine.process_frame(6, 200, [person(10, 100, 90, 130, 120)], [])
    engine.process_frame(7, 233, [person(10, 100, 90, 130, 120)], [waste(12, 110, 100, 140, 130)])
    # Only 1 sighting so far: unconfirmed -> must NOT appear in the HUD.
    assert engine.get_active_associations() == []
    engine.process_frame(8, 266, [person(10, 100, 90, 130, 120)], [waste(12, 110, 100, 140, 130)])
    assert engine.get_active_associations() == []  # still unconfirmed (2 < confirm_frames=3)
    engine.process_frame(9, 299, [person(10, 100, 90, 130, 120)], [waste(12, 110, 100, 140, 130)])

    assocs = engine.get_active_associations()
    assert assocs == [(12, 10)], f"expected [(12, 10)], got {assocs}"


def test_box_aware_hand_held_trash_association():
    """Trash held in hand near person box edge (large center-to-center distance) associates successfully via point-to-box distance."""
    engine = make_engine()
    # Person box: (100, 50, 200, 350) -> torso center (150, 200)
    # Trash box: (210, 280, 240, 310) -> trash center (225, 295)
    # Center-to-center dist: sqrt((225-150)^2 + (295-200)^2) = sqrt(75^2 + 95^2) = 121.0px
    # Point-to-box dist: dx = 225 - 200 = 25px, dy = 0px -> 25px!
    for idx in (6, 7, 8):  # confirm_frames=3 sightings required for the HUD
        engine.process_frame(idx, 200 + 33 * idx, [person(10, 100, 50, 200, 350)], [waste(12, 210, 280, 240, 310)])

    assocs = engine.get_active_associations()
    assert assocs == [(12, 10)], f"expected [(12, 10)], got {assocs}"


def test_carried_trash_entrance_not_skipped():
    """Carried trash entering at frame index 1 (< ignore_first_frames) near a person moves with person, un-skips, and fires when dropped."""
    engine = make_engine()

    def persons(idx):
        if idx < 25:
            x = 100 + idx * 15  # person enters at 100 and walks to 475
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if 1 <= idx < 10:
            x = 110 + (idx - 1) * 15  # trash moves in hand with person from 110 to 245
            return [waste(50, x, 100, x + 30, 130)]
        elif idx >= 10:
            return [waste(50, 245, 100, 275, 130)]  # person drops trash at 245 and continues walking to 475!
        return []

    events = run_frames(engine, 40, persons, wastes)

    # The trash is first seen inside the ignore_first_frames window, so it starts
    # skipped like pre-existing litter. Because it then travels with the person
    # (> 30 px from its birth spot while associated), the engine un-skips it as
    # carried trash; once it is dropped and stays still while the person leaves,
    # the rule fires exactly one event on the original track.
    assert len(events) == 1, f"expected 1 event for carried-then-dropped trash, got {len(events)}"
    ev = events[0]
    assert ev["track_id"] == 50
    assert ev["class_name"] == "bottle"


def test_brief_flicker_noise_never_associates_or_fires():
    """Noise: trash detected for only 2 frames near a person must not show in the HUD nor fire an event."""
    engine = make_engine()

    def persons(idx):
        if idx < 20:
            x = 100 + idx * 12
            return [person(1, x, 90, x + 30, 120)]  # person walks past the noise spot
        return []

    def wastes(idx):
        if idx in (6, 7):  # brief low-conf blip near the person's path
            return [{"track_id": 50, "class_name": "bottle", "bbox": (110 + idx * 12, 100, 140 + idx * 12, 130), "conf": 0.35}]
        return []

    events = run_frames(engine, 40, persons, wastes)

    assert events == [], f"flicker noise fired events: {events}"
    assert engine.get_active_associations() == []


def test_sparse_stitched_noise_blocked_by_hit_ratio():
    """Flicker recurring ~1/3 of frames at one spot accumulates sightings but must fail the consistency gate."""
    engine = make_engine()

    def persons(idx):
        if idx < 20:
            x = 100 + min(idx, 15) * 12
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if idx >= 6 and idx % 3 == 0:
            # Same spot, same track id: sparse detections that stitching keeps alive.
            return [waste(50, 112, 101, 142, 131)]
        return []

    events = run_frames(engine, 45, persons, wastes)

    assert len(events) == 0, f"sparse flicker fired events: {events}"


def test_low_mean_confidence_track_never_fires():
    """A consistently seen but weakly-confident track must not fire."""
    engine = make_engine()

    def persons(idx):
        if idx < 20:
            x = 100 + min(idx, 15) * 12
            return [person(1, x, 90, x + 30, 120)]
        return []

    def wastes(idx):
        if idx >= 5:
            low = waste(50, 110, 100, 140, 130)
            low["conf"] = 0.32  # persistent but below WASTE_MIN_CONF
            return [low]
        return []

    events = run_frames(engine, 40, persons, wastes)

    assert events == [], f"low-confidence track fired: {events}"

def test_edge_entrance_carried_trash_association():
    """Trash born near the frame edge (x1 < edge_margin) carried by a person entering the screen associates successfully and is NOT skipped."""
    engine = make_engine()  # edge_margin = 20.0, ignore_first_frames = 5
    # Person box: (5, 90, 60, 300) -> entering from left edge (x1 = 5)
    # Trash box: (10, 200, 40, 230) -> trash inside lower portion of person box (x1 = 10 < edge_margin 20)
    # Born while a person is near -> not edge-skipped; confirm_frames=3 sightings for the HUD.
    for idx in (6, 7, 8):
        engine.process_frame(idx, 200 + 33 * idx, [person(12, 5, 90, 60, 300)], [waste(13, 10, 200, 40, 230)])

    assocs = engine.get_active_associations()
    assert assocs == [(13, 12)], f"expected [(13, 12)], got {assocs}"



