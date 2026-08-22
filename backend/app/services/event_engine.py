"""
Rule-based littering event engine with Track Stitching & Flicker Recovery.

Implements the event rule from the project proposal:

    L = N ^ R ^ S ^ M

where
    N : a waste object appears **N**ear a person (within ``proximity_radius``
        px, within a short window around the object's first appearance),
    R : the object is **R**eleased / separated from the person,
    S : the object remains **S**tationary afterwards,
    M : the person **M**oves away from the object.

Features Track Stitching (Re-ID):
If detection flickers or occlusion causes ByteTrack to reassign a track ID to a
stationary waste object or a moving person, the engine stitches the new track to
the recently lost track, preserving initial person association (N), initial birth location,
and accumulated stationary frame count (S).

The engine is deliberately pure Python (no ML) so it can be unit-tested
without any heavy dependencies.
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


def _point_to_box_dist(point: Point, bbox: BBox) -> float:
    """Calculate minimum Euclidean distance from a point (x, y) to a bounding box rectangle (x1, y1, x2, y2).
    Returns 0.0 if the point is inside the bounding box."""
    px, py = point
    x1, y1, x2, y2 = bbox
    dx = max(x1 - px, 0.0, px - x2)
    dy = max(y1 - py, 0.0, py - y2)
    return math.hypot(dx, dy)


def _center(bbox: BBox) -> Point:
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


@dataclass
class PersonState:
    track_id: int
    last_center: Point
    last_seen_frame: int
    last_bbox: BBox = (0.0, 0.0, 0.0, 0.0)
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

        # Buffers for track stitching (reconnecting lost tracks after dropouts)
        self.lost_waste_tracks: Dict[int, WasteState] = {}
        self.lost_person_tracks: Dict[int, PersonState] = {}
        self.person_alias_map: Dict[int, int] = {}

        self._events: List[dict] = []
        self._fired_count: int = 0

        # Pre-computed history size used by the stationary check.
        self._history_len = max(int(getattr(cfg, "stationary_frames", 12)) + 2, 4)

        # --- Noise-rejection gates -----------------------------------------
        # Gate 1 (confirmation): a waste track must be detected in at least
        # this many distinct frames before it may show up as an active
        # association (HUD) or fire an event. Brief low-conf flickers die young.
        self.confirm_frames = max(1, int(getattr(cfg, "confirm_frames", 3)))
        # Gate 2 (consistency): fraction of its life a track must actually have
        # been seen (sightings / age). Flicker stitched together by reconnects
        # accumulates raw sightings but fails this ratio.
        self.min_hit_ratio = float(getattr(cfg, "min_hit_ratio", 0.5))
        # Gate 3 (confidence): minimum mean detection confidence to fire.
        self.waste_min_conf = float(getattr(cfg, "waste_min_conf", 0.45))

    def _is_consistent(self, state: WasteState, frame_idx: int) -> bool:
        """True if the track has been seen in >= min_hit_ratio of its life."""
        age = frame_idx - state.born_frame + 1
        if age <= 0:
            return True
        return (state.frames / age) >= self.min_hit_ratio

    def get_active_associations(self) -> List[Tuple[int, int]]:
        """Return list of (waste_track_id, active_person_track_id) for debugging UI overlay.

        Unconfirmed tracks (seen in fewer than ``confirm_frames`` distinct
        frames) are withheld: momentary noise detections must not flash up as
        (trash, person) pairs.
        """
        assoc = []
        for tid, state in self.waste_tracks.items():
            if state.skipped or state.associated_person is None:
                continue
            if state.frames < self.confirm_frames:
                continue
            active_pid = state.associated_person
            for p_tid in self.person_tracks:
                if self._resolve_person_id(p_tid) == self._resolve_person_id(state.associated_person):
                    active_pid = p_tid
                    break
            assoc.append((tid, active_pid))
        return assoc

    # ------------------------------------------------------------------
    def reset(self) -> None:
        self.person_tracks.clear()
        self.waste_tracks.clear()
        self.lost_waste_tracks.clear()
        self.lost_person_tracks.clear()
        self.person_alias_map.clear()
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
        new_events: List[dict] = []

        # --- Persons ----------------------------------------------------
        seen_persons: set = set()
        for det in person_dets:
            tid = det.get("track_id")
            if tid is None:
                continue
            seen_persons.add(tid)
            bbox = det["bbox"]
            center = _center(bbox)

            root_tid = self._resolve_person_id(tid)
            state = self.person_tracks.get(root_tid) or self.person_tracks.get(tid)

            if state is None:
                reconnected = self._try_reconnect_person(tid, center, frame_idx)
                if reconnected is not None:
                    state = reconnected
                    state.last_bbox = bbox
                    self.person_tracks[tid] = state
                    self.person_tracks[state.track_id] = state
                else:
                    state = PersonState(
                        track_id=tid, last_center=center, last_seen_frame=frame_idx, last_bbox=bbox
                    )
                    self.person_tracks[tid] = state
            else:
                state.last_center = center
                state.last_seen_frame = frame_idx
                state.last_bbox = bbox
                state.history.append(center)
                self.person_tracks[tid] = state

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
                state = self._create_or_reconnect_waste(det, tid, center, frame_idx)
                self.waste_tracks[tid] = state
            else:
                state.last_center = center
                state.last_seen_frame = frame_idx
                state.history.append(center)
                state.frames += 1
                state.mean_conf = (state.mean_conf * (state.frames - 1) + det["conf"]) / state.frames

                # If waste was born during ignore_first_frames but moved with a person (> 30px), un-skip carried trash!
                if state.skipped and state.born_frame < self.cfg.ignore_first_frames:
                    if _dist(center, state.born_center) > 30.0 and state.associated_person is not None:
                        state.skipped = False

                # Stationary check: displacement from the smoothed position or initial birth location.
                if len(state.history) >= 2:
                    mean = self._mean_point(state.history)
                    disp = _dist(center, mean)
                    disp_born = _dist(center, state.born_center)
                    if disp < self.cfg.stationary_threshold * 2.0 or disp_born < self.cfg.stationary_threshold * 3.0:
                        state.stationary_frames += 1
                    else:
                        state.stationary_frames = max(0, state.stationary_frames - 2)

        # Move unseen active tracks into lost buffers
        for pid, pstate in list(self.person_tracks.items()):
            if pid not in seen_persons and frame_idx - pstate.last_seen_frame == 1:
                self.lost_person_tracks[pid] = pstate

        for wid, wstate in list(self.waste_tracks.items()):
            if wid not in seen_waste and frame_idx - wstate.last_seen_frame == 1:
                self.lost_waste_tracks[wid] = wstate

        # --- Association & firing --------------------------------------
        for tid, state in list(self.waste_tracks.items()):
            if frame_idx - state.last_seen_frame > 5:
                continue
            if state.fired or state.skipped:
                continue
            # Noise gate 1: unconfirmed tracks (brief flickers) never fire.
            if state.frames < self.confirm_frames:
                continue
            if state.associated_person is None:
                self._try_associate(state, frame_idx)
            if state.associated_person is None:
                continue
            if state.frames < self.cfg.min_track_frames:
                continue
            # Noise gate 2: consistency — flicker stitched across a long life
            # accumulates sightings but fails the seen/age ratio.
            if not self._is_consistent(state, frame_idx):
                continue
            # Noise gate 3: average detection confidence floor.
            if state.mean_conf < self.waste_min_conf:
                continue
            if self._fired_count >= self.cfg.max_incidents:
                continue

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
    # Internals & Track Stitching
    # ------------------------------------------------------------------
    def _create_or_reconnect_waste(self, det: dict, tid: int, center: Point, frame_idx: int) -> WasteState:
        """Attempt to reconnect a new waste track to a recently lost waste track, or create new."""
        reconnect_dist = getattr(self.cfg, "waste_reconnect_dist", 60.0)
        reconnect_win = getattr(self.cfg, "waste_reconnect_window", 30)
        c_name = det.get("class_name", "waste")

        best_cand: Optional[WasteState] = None
        best_cand_dist = float("inf")

        for l_tid, l_state in list(self.lost_waste_tracks.items()):
            if frame_idx - l_state.last_seen_frame > reconnect_win:
                continue
            if l_state.class_name != c_name:
                continue
            d = _dist(center, l_state.last_center)
            if d <= reconnect_dist and d < best_cand_dist:
                best_cand_dist = d
                best_cand = l_state

        if best_cand is not None:
            # Grant catch-up stationary credit only when the track has been
            # consistently detected so far (a real object under occlusion).
            # Sparse flicker noise that merely recurs nearby gets no credit.
            consistent_before = self._is_consistent(best_cand, frame_idx)
            best_cand.last_center = center
            best_cand.last_seen_frame = frame_idx
            best_cand.history.append(center)
            best_cand.frames += 1
            best_cand.mean_conf = (best_cand.mean_conf * (best_cand.frames - 1) + det["conf"]) / best_cand.frames
            if consistent_before:
                best_cand.stationary_frames += 1

            self.lost_waste_tracks.pop(best_cand.track_id, None)
            return best_cand

        return self._create_waste(det, tid, center, frame_idx)

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

        # Attempt association first
        self._try_associate(state, frame_idx)

        if area < self.cfg.min_object_area:
            state.skipped = True
        elif (
            x1 < self.cfg.edge_margin
            or y1 < self.cfg.edge_margin
            or x2 > self.frame_width - self.cfg.edge_margin
            or y2 > self.frame_height - self.cfg.edge_margin
        ):
            # Only skip edge objects if NOT associated with a person entering the video
            if state.associated_person is None:
                state.skipped = True
        elif frame_idx < self.cfg.ignore_first_frames:
            # Pre-existing litter present at video start: skip by default unless it moves with person (>30px)
            state.skipped = True

        return state

    def _try_reconnect_person(self, tid: int, center: Point, frame_idx: int) -> Optional[PersonState]:
        """Attempt to reconnect a lost person track to a new person track ID."""
        reconnect_dist = getattr(self.cfg, "person_reconnect_dist", 80.0)
        reconnect_win = getattr(self.cfg, "person_reconnect_window", 30)

        best_cand: Optional[PersonState] = None
        best_cand_dist = float("inf")

        for l_pid, l_state in list(self.lost_person_tracks.items()):
            if frame_idx - l_state.last_seen_frame > reconnect_win:
                continue
            d = _dist(center, l_state.last_center)
            if d <= reconnect_dist and d < best_cand_dist:
                best_cand_dist = d
                best_cand = l_state

        if best_cand is not None:
            self.person_alias_map[tid] = best_cand.track_id
            best_cand.last_center = center
            best_cand.last_seen_frame = frame_idx
            best_cand.history.append(center)
            self.lost_person_tracks.pop(best_cand.track_id, None)
            return best_cand

        return None

    def _resolve_person_id(self, pid: int) -> int:
        """Resolve alias mapping for person IDs."""
        visited = set()
        curr = pid
        while curr in self.person_alias_map and curr not in visited:
            visited.add(curr)
            curr = self.person_alias_map[curr]
        return curr

    def _try_associate(self, state: WasteState, frame_idx: int) -> None:
        """N: associate the waste object with the nearest nearby person using box-aware proximity."""
        best_person: Optional[int] = None
        best_dist = float("inf")
        for pid, person in self.person_tracks.items():
            if frame_idx - person.last_seen_frame > self.cfg.person_near_window:
                continue
            
            # Point-to-Box distance (distance from trash center to person bounding box rectangle)
            if hasattr(person, "last_bbox") and person.last_bbox and person.last_bbox != (0.0, 0.0, 0.0, 0.0):
                d = _point_to_box_dist(state.last_center, person.last_bbox)
            else:
                d = _dist(person.last_center, state.last_center)

            if d < self.cfg.proximity_radius and d < best_dist:
                best_dist = d
                best_person = self._resolve_person_id(pid)
        if best_person is not None:
            state.associated_person = best_person
            state.born_dist = best_dist

    def _find_recent_person(self, person_id: int, frame_idx: int) -> Optional[PersonState]:
        root_id = self._resolve_person_id(person_id)
        person = self.person_tracks.get(root_id) or self.person_tracks.get(person_id)
        if person is None:
            person = self.lost_person_tracks.get(root_id) or self.lost_person_tracks.get(person_id)
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
        reconnect_win_p = getattr(self.cfg, "person_reconnect_window", 30)
        reconnect_win_w = getattr(self.cfg, "waste_reconnect_window", 30)

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
        self.lost_person_tracks = {
            pid: p
            for pid, p in self.lost_person_tracks.items()
            if frame_idx - p.last_seen_frame <= reconnect_win_p
        }
        self.lost_waste_tracks = {
            tid: t
            for tid, t in self.lost_waste_tracks.items()
            if frame_idx - t.last_seen_frame <= reconnect_win_w
        }

    @staticmethod
    def _mean_point(points: deque) -> Point:
        n = max(len(points), 1)
        sx = sum(p[0] for p in points)
        sy = sum(p[1] for p in points)
        return (sx / n, sy / n)
