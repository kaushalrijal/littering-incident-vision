"""
Unit tests for the system-level evaluation harness (scripts/evaluate.py).

These test the pure metric/parsing/reporting logic only, so they need no
torch / ultralytics and run anywhere.

Run from the project root either way:
    python -m pytest tests/test_evaluate.py -v
    python tests/test_evaluate.py            # built-in runner (no pytest needed)
"""
import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("evaluate", ROOT / "scripts" / "evaluate.py")
evaluate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(evaluate)  # safe: torch/ultralytics import lives inside main()


# ----------------------------------------------------------------------
def test_classify_video_all_quadrants():
    assert evaluate.classify_video(1, 2) == "TP"
    assert evaluate.classify_video(1, 0) == "FN"
    assert evaluate.classify_video(0, 3) == "FP"
    assert evaluate.classify_video(0, 0) == "TN"


def test_load_ground_truth_free_columns_and_comments():
    """Header order is free, comments/blank lines skipped, quoted commas kept."""
    csv_text = (
        "# a comment line\n"
        "\n"
        "scenario,video,expected_incidents,event_time_s,notes\n"
        'drop+leave,clip_a.mp4,1,4.5,"drops bottle, walks away"\n'
        "walk-past,clip_b.mp4,0,,litter already present\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as fh:
        fh.write(csv_text)
        path = Path(fh.name)

    gt = evaluate.load_ground_truth(path)
    path.unlink()

    assert set(gt) == {"clip_a.mp4", "clip_b.mp4"}
    assert gt["clip_a.mp4"]["expected"] == 1
    assert gt["clip_a.mp4"]["scenario"] == "drop+leave"
    assert gt["clip_a.mp4"]["event_time_s"] == 4.5
    assert gt["clip_a.mp4"]["notes"] == "drops bottle, walks away"  # comma survived quoting
    assert gt["clip_b.mp4"]["expected"] == 0
    assert gt["clip_b.mp4"]["event_time_s"] is None


def test_load_ground_truth_legacy_two_columns():
    csv_text = "video,expected_incidents\ntest_01.mp4,1\ntest_02.mp4,0\n"
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as fh:
        fh.write(csv_text)
        path = Path(fh.name)
    gt = evaluate.load_ground_truth(path)
    path.unlink()
    assert gt["test_01.mp4"]["expected"] == 1
    assert gt["test_02.mp4"]["expected"] == 0


def test_load_ground_truth_missing_file_is_empty():
    assert evaluate.load_ground_truth(Path("/no/such/ground_truth.csv")) == {}


def _sample_results():
    return [
        {"file": "v1.mp4", "incident_count": 2, "frames_processed": 100,
         "processing_s": 1.0, "processing_fps": 100.0,
         "incidents": [
             {"timestamp_ms": 6000, "confidence": 0.9},
             {"timestamp_ms": 5000, "confidence": 0.8},
         ]},
        {"file": "v2.mp4", "incident_count": 0, "frames_processed": 100,
         "processing_s": 1.0, "processing_fps": 100.0, "incidents": []},
        {"file": "v3.mp4", "incident_count": 1, "frames_processed": 100,
         "processing_s": 1.0, "processing_fps": 100.0,
         "incidents": [{"timestamp_ms": 2000, "confidence": 0.6}]},
        {"file": "v4.mp4", "incident_count": 0, "frames_processed": 100,
         "processing_s": 1.0, "processing_fps": 100.0, "incidents": []},
        {"file": "v5.mp4", "incident_count": 1, "frames_processed": 100,
         "processing_s": 1.0, "processing_fps": 100.0,
         "incidents": [{"timestamp_ms": 3000, "confidence": 0.7}]},
    ]


def _sample_gt():
    return {
        "v1.mp4": {"expected": 1, "scenario": "drop+leave", "event_time_s": 4.5, "notes": ""},
        "v2.mp4": {"expected": 1, "scenario": "drop+leave", "event_time_s": None, "notes": ""},
        "v3.mp4": {"expected": 0, "scenario": "walk-past", "event_time_s": None, "notes": ""},
        "v4.mp4": {"expected": 0, "scenario": "crowd", "event_time_s": None, "notes": ""},
        "v5.mp4": {"expected": 1, "scenario": "drop+leave", "event_time_s": 2.0, "notes": ""},
    }


def test_compute_metrics_known_scenario():
    m = evaluate.compute_metrics(_sample_results(), _sample_gt())
    # Confusion: v1 TP, v2 FN, v3 FP, v4 TN, v5 TP
    assert (m["tp"], m["fp"], m["fn"], m["tn"]) == (2, 1, 1, 1)
    assert m["n_labelled"] == 5
    assert m["accuracy"] == 0.6            # (2+1)/5
    assert m["precision"] == 0.6667        # 2/3
    assert m["recall"] == 0.6667           # 2/3
    assert m["specificity"] == 0.5         # 1/2
    assert m["f1"] == 0.6667
    assert m["false_alarm_rate"] == 0.5    # fp/(fp+tn) = 1/2
    assert m["miss_rate"] == 0.3333        # fn/(fn+tp) = 1/3
    assert m["expected_incident_total"] == 3
    assert m["detected_incident_total"] == 4
    # Detection delay: v1 -> 5.0-4.5=0.5, v5 -> 3.0-2.0=1.0
    assert m["detection_delay"]["n"] == 2
    assert m["detection_delay"]["mean_s"] == 0.75
    assert sorted(m["detection_delay"]["values"]) == [0.5, 1.0]


def test_compute_metrics_no_ground_truth_returns_none():
    assert evaluate.compute_metrics(_sample_results(), {}) is None


def test_render_markdown_with_metrics():
    results = _sample_results()
    m = evaluate.compute_metrics(results, _sample_gt())
    meta = {
        "generated_at": "2026-08-21 14:00", "model": "ml/weights/best.pt",
        "device": "cpu", "waste_classes": "trash", "frame_step": 2,
        "conf_threshold": 0.30, "videos_dir": "data/test_videos",
    }
    md = evaluate.render_markdown(meta, results, m)
    assert "System Evaluation Report" in md
    assert "False-alarm rate" in md
    assert "Confusion matrix" in md
    assert "ml/weights/best.pt" in md
    assert "v1.mp4" in md and "v5.mp4" in md
    assert "Detection delay" in md


def test_render_markdown_without_ground_truth():
    results = _sample_results()
    meta = {
        "generated_at": "2026-08-21 14:00", "model": "yolov8n.pt", "device": "cpu",
        "waste_classes": "bottle,cup", "frame_step": 2, "conf_threshold": 0.30,
        "videos_dir": "data/test_videos",
    }
    md = evaluate.render_markdown(meta, results, None)
    assert "no ground truth supplied" in md.lower()
    assert "v1.mp4" in md


# ----------------------------------------------------------------------
if __name__ == "__main__":
    tests = sorted(k for k, v in globals().items() if k.startswith("test_") and callable(v))
    passed = failed = 0
    for name in tests:
        try:
            globals()[name]()
            print(f"PASS  {name}")
            passed += 1
        except AssertionError as exc:
            print(f"FAIL  {name}: {exc}")
            failed += 1
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR {name}: {type(exc).__name__}: {exc}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
