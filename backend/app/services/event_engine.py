"""
Rule-based littering event engine.

Implements the event rule from the project proposal:

    L = N ^ R ^ S ^ M

where
    N : a waste object appears **N**ear a person (within ``proximity_radius``
        px, within a short window around the object's first appearance),
    R : the object is **R**eleased / separated from the person,
    S : the object remains **S**tationary afterwards,
    M : the person **M**oves away from the object.

The engine is deliberately pure Python (no ML) so it can be unit-tested
without any heavy dependencies. It consumes per-frame track updates and
emits incident events with a confidence score.

Tuning parameters come from ``Settings`` (``backend/app/config.py``) and
can be changed via ``.env`` (see ``.env.example``).
"""
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# A bbox is (x1, y1, x2, y2)
BBox = Tuple[float, float, float, float]
Point = Tuple[float, float]


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _center(bbox: BBox) -> Point:
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


@dataclass
class PersonState:
    track_id: int
    last_center: Point
    last_seen_frame: int
    history: deque = field(default_factory=lambda: deque(maxlen=20))


@dataclass
class WasteState:
    track_id: int
    class_name: str
    born_frame: int
    born_center: Point
    last_center: Point
    last_seen_frame: int
    history: deque = field(default_factory=deque)
    stationary_frames: int = 0
    mean_conf: float = 0.0
    frames: int = 0
    associated_person: Optional[int] = None
    born_dist: float = float("inf")
    fired: bool = False
    skipped: bool = False


class EventEngine:
    """Tracks persons/waste across frames and detects suspected littering."""

    def __init__(self, cfg, frame_width: int, frame_height: int) -> None:
        self.cfg = cfg
        self.frame_width = max(frame_width, 1)
        self.frame_height = max(frame_height, 1)

        self.person_tracks: Dict[int, PersonState] = {}
        self.waste_tracks: Dict[int, WasteState] = {}
        self._events: List[dict] = []
        self._fired_count: int = 0

        # Pre-computed history size used by the stationary check.
        self._history_len = max(int(getattr(cfg, "stationary_frames", 12)) + 2, 4)

    # ------------------------------------------------------------------
    def reset(self) -> None:
        self.person_tracks.clear()
        self.waste_tracks.clear()
        self._events.clear()
        self._fired_count = 0

    # ------------------------------------------------------------------
    def process_frame(
        self,
        frame_idx: int,
        timestamp_ms: int,
        person_dets: List[dict],
        waste_dets: List[dict],
    ) -> List[dict]:
        """
        Advance the engine by one processed frame.

        Args:
            frame_idx:      sequential index of the *processed* frame
                            (0, 1, 2, ... regardless of the video's frame step)
            timestamp_ms:   playback time of this frame inside the video
            person_dets:    detections with track_id for persons
            waste_dets:     detections with track_id for waste objects

        Returns:
            A list of newly fired events (usually empty). Each event:
            {
                "frame_idx", "timestamp_ms", "confidence", "class_name",
                "track_id", "reason",
                "stationary_frames", "born_dist", "current_dist",
            }
        """
        new_events: List[dict] = []

        # --- Persons ----------------------------------------------------
        seen_persons: set = set()
        for det in person_dets:
            tid = det.get("track_id")
            if tid is None:
                continue
            seen_persons.add(tid)
            center = _center(det["bbox"])
            state = self.person_tracks.get(tid)
            if state is None:
                self.person_tracks[tid] = PersonState(
                    track_id=tid, last_center=center, last_seen_frame=frame_idx
                )
            else:
                state.last_center = center
                state.last_seen_frame = frame_idx
                state.history.append(center)

        # --- Waste objects ----------------------------------------------
        seen_waste: set = set()
        for det in waste_dets:
            tid = det.get("track_id")
            if tid is None:
                continue
            seen_waste.add(tid)
            center = _center(det["bbox"])
            state = self.waste_tracks.get(tid)
            if state is None:
                state = self._create_waste(det, tid, center, frame_idx)
                self.waste_tracks[tid] = state
            else:
                state.last_center = center
                state.last_seen_frame = frame_idx
                state.history.append(center)
                state.frames += 1
                state.mean_conf = (state.mean_conf * (state.frames - 1) + det["conf"]) / state.frames

                # Stationary check: displacement from the smoothed position.
                if len(state.history) >= 2:
                    mean = self._mean_point(state.history)
                    disp = _dist(center, mean)
                    if disp < self.cfg.stationary_threshold * 2.0:
                        state.stationary_frames += 1
                    else:
                        state.stationary_frames = 0

        # --- Association & firing --------------------------------------
        for tid, state in self.waste_tracks.items():
            if tid not in seen_waste:
                continue
            if state.fired or state.skipped:
                continue
            if state.associated_person is None:
                self._try_associate(state, frame_idx)
            if state.associated_person is None:
                continue
            if state.frames < self.cfg.min_track_frames:
                continue
            if self._fired_count >= self.cfg.max_incidents:
                continue

            person = self.person_tracks.get(state.associated_person)
            if person is None:
                # The person left the frame; if the departure was recent we can
                # still use their last known position (they clearly moved away).
                person = self._find_recent_person(state.associated_person, frame_idx)
            if person is None:
                continue

            current_dist = _dist(person.last_center, state.last_center)
            if current_dist <= self.cfg.leave_distance:
                continue
            if state.stationary_frames < self.cfg.stationary_frames:
                continue

            event = self._build_event(state, frame_idx, timestamp_ms, current_dist)
            state.fired = True
            self._fired_count += 1
            self._events.append(event)
            new_events.append(event)

        # --- Garbage collection -----------------------------------------
        self._expire(frame_idx)
        return new_events

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _create_waste(self, det: dict, tid: int, center: Point, frame_idx: int) -> WasteState:
        x1, y1, x2, y2 = det["bbox"]
        area = max((x2 - x1), 0.0) * max((y2 - y1), 0.0)
        state = WasteState(
            track_id=tid,
            class_name=det.get("class_name", "waste"),
            born_frame=frame_idx,
            born_center=center,
            last_center=center,
            last_seen_frame=frame_idx,
            history=deque([center], maxlen=self._history_len),
            frames=1,
            mean_conf=det["conf"],
        )

        # Objects that are tiny, touch the frame edge, or are already present
        # at the start of the video are treated as pre-existing litter /
        # detector artifacts and can never become events.
        if area < self.cfg.min_object_area:
            state.skipped = True
        elif (
            x1 < self.cfg.edge_margin
            or y1 < self.cfg.edge_margin
            or x2 > self.frame_width - self.cfg.edge_margin
            or y2 > self.frame_height - self.cfg.edge_margin
        ):
            state.skipped = True
        elif frame_idx < self.cfg.ignore_first_frames:
            state.skipped = True

        self._try_associate(state, frame_idx)
        return state

    def _try_associate(self, state: WasteState, frame_idx: int) -> None:
        """N: associate the waste object with the nearest nearby person."""
        best_person: Optional[int] = None
        best_dist = float("inf")
        for pid, person in self.person_tracks.items():
            if frame_idx - person.last_seen_frame > self.cfg.person_near_window:
                continue
            d = _dist(person.last_center, state.last_center)
            if d < self.cfg.proximity_radius and d < best_dist:
                best_dist = d
                best_person = pid
        if best_person is not None:
            state.associated_person = best_person
            state.born_dist = best_dist

    def _find_recent_person(self, person_id: int, frame_idx: int) -> Optional[PersonState]:
        person = self.person_tracks.get(person_id)
        if person is None:
            return None
        if frame_idx - person.last_seen_frame > self.cfg.person_expire:
            return None
        return person

    def _build_event(self, state: WasteState, frame_idx: int, timestamp_ms: int, current_dist: float) -> dict:
        mean_conf = state.mean_conf
        stat_factor = min(state.stationary_frames / (self.cfg.stationary_frames * 2.0), 1.0)
        prox_factor = 1.0 if state.born_dist <= self.cfg.proximity_radius * 0.5 else 0.6
        confidence = (
            0.30
            + 0.25 * min(mean_conf, 0.9) / 0.9
            + 0.25 * stat_factor
            + 0.20 * prox_factor
        )
        confidence = min(round(confidence, 3), 0.99)

        reason = (
            f"waste object '{state.class_name}' (track {state.track_id}) appeared "
            f"{state.born_dist:.0f}px from a person, stayed stationary for "
            f"{state.stationary_frames} frames, person moved "
            f"{current_dist:.0f}px away"
        )

        return {
            "frame_idx": frame_idx,
            "timestamp_ms": timestamp_ms,
            "confidence": confidence,
            "class_name": state.class_name,
            "track_id": state.track_id,
            "reason": reason,
            "stationary_frames": state.stationary_frames,
            "born_dist": round(state.born_dist, 1),
            "current_dist": round(current_dist, 1),
        }

    def _expire(self, frame_idx: int) -> None:
        self.person_tracks = {
            pid: p
            for pid, p in self.person_tracks.items()
            if frame_idx - p.last_seen_frame <= self.cfg.person_expire
        }
        self.waste_tracks = {
            tid: t
            for tid, t in self.waste_tracks.items()
            if frame_idx - t.last_seen_frame <= self.cfg.waste_expire
        }

    @staticmethod
    def _mean_point(points: deque) -> Point:
        n = max(len(points), 1)
        sx = sum(p[0] for p in points)
        sy = sum(p[1] for p in points)
        return (sx / n, sy / n)
