#!/usr/bin/env python3
"""
System-level evaluation for the littering detection pipeline.

This script measures the COMPLETE event detector (detection -> tracking ->
N ^ R ^ S ^ M rule engine -> incidents), NOT the object-detection model on
its own. It runs the pipeline over a folder of labelled test videos (without
touching the web database), compares the incidents it produces against a
ground-truth CSV, and reports event-level metrics: accuracy, precision,
recall, F1, false-alarm rate, miss rate and detection delay. It writes both a
machine-readable JSON report and a paste-ready Markdown table for the project
report.

Usage (from the project root):
    # evaluate the team's fine-tuned model on the labelled set
    python scripts/evaluate.py --model ml/weights/best.pt --waste-classes trash

    # other options
    python scripts/evaluate.py --videos data/test_videos
    python scripts/evaluate.py --ground-truth data/ground_truth.csv
    python scripts/evaluate.py --no-output          # skip annotated previews (faster)

IMPORTANT (model wiring): the committed config default is the stock COCO model
(MODEL_PATH=yolov8n.pt, WASTE_CLASSES=bottle,cup). To evaluate the real system
you must select the fine-tuned model AND its classes together, either through
a .env file or with --model / --waste-classes on the command line. If you
select best.pt but leave WASTE_CLASSES=bottle,cup, the detector finds no
matching class and reports zero incidents.

Ground-truth CSV format (see data/ground_truth.csv.example):
    video,expected_incidents,scenario,event_time_s,notes
    drop_and_leave_01.mp4,1,drop+leave,4.5,person drops a bottle and walks off
    walk_past_litter_01.mp4,0,walk-past,,litter already on the ground
  - video            : file name inside the --videos folder (required)
  - expected_incidents: 1 (an event should fire) or 0 (none should fire) [required]
  - scenario         : short label for the table (optional)
  - event_time_s     : seconds into the clip when the drop happens; enables the
                       detection-delay metric on true-positive clips (optional)
  - notes            : free text, ignored by the metrics (optional)
Lines beginning with '#' and blank lines are ignored. Column order is free;
columns are matched by their header name.
"""
import argparse
import csv
import json
import os
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

# Make the backend package importable when run from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

# Accepted header aliases (lower-cased) -> canonical field name.
_COLUMN_ALIASES = {
    "video": "video", "file": "video", "filename": "video", "file_name": "video",
    "expected_incidents": "expected", "expected": "expected", "label": "expected",
    "scenario": "scenario", "type": "scenario", "category": "scenario",
    "event_time_s": "event_time_s", "event_time": "event_time_s",
    "drop_time_s": "event_time_s", "drop_time": "event_time_s",
    "notes": "notes", "note": "notes", "comment": "notes",
}


# ======================================================================
# Pure, import-friendly helpers (no torch/ultralytics needed).
# These are unit-tested independently of the ML stack.
# ======================================================================
def load_ground_truth(path: Path) -> dict:
    """Parse the ground-truth CSV into {video_name: {...}}.

    Handles quoted fields, free column order (matched by header name), extra
    columns, '#' comment lines and the legacy two-column format. Returns an
    empty dict when the file does not exist.
    """
    if not path.exists():
        return {}

    # Drop comment/blank lines before handing the rest to csv.reader so that
    # quoted commas inside a notes field are parsed correctly.
    raw_lines = []
    with open(path, "r", encoding="utf-8", newline="") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            raw_lines.append(line)
    if not raw_lines:
        return {}

    reader = csv.reader(raw_lines)
    header = [h.strip().lower() for h in next(reader)]
    field_by_index = [_COLUMN_ALIASES.get(h) for h in header]

    gt: dict = {}
    for parts in reader:
        if not parts:
            continue
        row: dict = {}
        for i, value in enumerate(parts):
            if i >= len(field_by_index) or field_by_index[i] is None:
                continue
            row[field_by_index[i]] = value.strip()

        name = row.get("video", "").strip()
        if not name:
            continue
        try:
            expected = int(float(row.get("expected", "0")))
        except ValueError:
            expected = 0

        event_time_s = None
        raw_time = row.get("event_time_s", "").strip()
        if raw_time:
            try:
                event_time_s = float(raw_time)
            except ValueError:
                event_time_s = None

        gt[name] = {
            "expected": expected,
            "scenario": row.get("scenario", "").strip(),
            "event_time_s": event_time_s,
            "notes": row.get("notes", "").strip(),
        }
    return gt


def classify_video(expected: int, detected: int) -> str:
    """Video-level confusion label from expected vs detected incident counts."""
    if expected > 0 and detected > 0:
        return "TP"
    if expected > 0 and detected == 0:
        return "FN"
    if expected == 0 and detected > 0:
        return "FP"
    return "TN"


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


def compute_metrics(results: list, gt: dict) -> dict:
    """Build event-level metrics from per-video results + ground truth.

    ``results`` is a list of dicts, each with at least ``file``,
    ``incident_count`` and ``incidents`` (list of {timestamp_ms, confidence}).
    Returns None when no ground truth is available.
    """
    if not gt:
        return None

    tp = fp = fn = tn = 0
    expected_total = detected_total = 0
    delays: list = []
    per_video: list = []

    for r in results:
        if r["file"] not in gt:
            continue
        meta = gt[r["file"]]
        expected = meta["expected"]
        detected = r["incident_count"]
        verdict = classify_video(expected, detected)

        expected_total += max(expected, 0)
        detected_total += detected
        if verdict == "TP":
            tp += 1
        elif verdict == "FP":
            fp += 1
        elif verdict == "FN":
            fn += 1
        else:
            tn += 1

        confs = [i["confidence"] for i in r["incidents"] if i.get("confidence") is not None]
        mean_conf = round(statistics.mean(confs), 4) if confs else None

        delay_s = None
        if verdict == "TP" and meta["event_time_s"] is not None and r["incidents"]:
            first_ms = min(i["timestamp_ms"] for i in r["incidents"])
            delay_s = round(first_ms / 1000.0 - meta["event_time_s"], 3)
            delays.append(delay_s)

        per_video.append({
            "file": r["file"],
            "scenario": meta["scenario"],
            "expected": expected,
            "detected": detected,
            "verdict": verdict,
            "mean_confidence": mean_conf,
            "detection_delay_s": delay_s,
        })

    total = tp + fp + fn + tn
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    specificity = _safe_div(tn, tn + fp)
    f1 = _safe_div(2 * precision * recall, precision + recall)

    detection_delay = None
    if delays:
        detection_delay = {
            "n": len(delays),
            "mean_s": round(statistics.mean(delays), 3),
            "median_s": round(statistics.median(delays), 3),
            "values": delays,
        }

    return {
        "n_labelled": total,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "accuracy": round(_safe_div(tp + tn, total), 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "specificity": round(specificity, 4),
        "f1": round(f1, 4),
        "false_alarm_rate": round(_safe_div(fp, fp + tn), 4),
        "miss_rate": round(_safe_div(fn, fn + tp), 4),
        "expected_incident_total": expected_total,
        "detected_incident_total": detected_total,
        "detection_delay": detection_delay,
        "per_video": per_video,
    }


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def render_markdown(meta: dict, results: list, metrics: dict) -> str:
    """Render a paste-ready Markdown evaluation report."""
    lines = []
    lines.append("# Littering Detection — System Evaluation Report")
    lines.append("")
    lines.append(f"_Generated: {meta['generated_at']}_")
    lines.append("")
    lines.append("This report measures the **complete event detector** "
                 "(detection → tracking → rule engine → incidents), not the "
                 "object-detection model in isolation.")
    lines.append("")

    # Run configuration ------------------------------------------------
    lines.append("## Run configuration")
    lines.append("")
    lines.append("| Setting | Value |")
    lines.append("| --- | --- |")
    lines.append(f"| Model | `{meta['model']}` |")
    lines.append(f"| Device | `{meta['device']}` |")
    lines.append(f"| Waste classes | `{meta['waste_classes']}` |")
    lines.append(f"| Frame step | {meta['frame_step']} |")
    lines.append(f"| Confidence threshold | {meta['conf_threshold']} |")
    lines.append(f"| Videos folder | `{meta['videos_dir']}` |")
    lines.append(f"| Videos processed | {len(results)} |")
    lines.append("")

    # Headline metrics -------------------------------------------------
    if metrics:
        lines.append("## Headline metrics (event level)")
        lines.append("")
        lines.append("| Metric | Value |")
        lines.append("| --- | --- |")
        lines.append(f"| Labelled videos | {metrics['n_labelled']} |")
        lines.append(f"| Accuracy | {_pct(metrics['accuracy'])} |")
        lines.append(f"| Precision | {_pct(metrics['precision'])} |")
        lines.append(f"| Recall (sensitivity) | {_pct(metrics['recall'])} |")
        lines.append(f"| Specificity | {_pct(metrics['specificity'])} |")
        lines.append(f"| F1 score | {_pct(metrics['f1'])} |")
        lines.append(f"| False-alarm rate (FP/(FP+TN)) | {_pct(metrics['false_alarm_rate'])} |")
        lines.append(f"| Miss rate (FN/(FN+TP)) | {_pct(metrics['miss_rate'])} |")
        dd = metrics["detection_delay"]
        if dd:
            lines.append(f"| Detection delay (mean over {dd['n']} TP clips) | {dd['mean_s']:.2f} s |")
            lines.append(f"| Detection delay (median) | {dd['median_s']:.2f} s |")
        lines.append("")

        # Confusion matrix ---------------------------------------------
        lines.append("## Confusion matrix (video level)")
        lines.append("")
        lines.append("| | Detected event | No event |")
        lines.append("| --- | --- | --- |")
        lines.append(f"| **Littering (expected)** | TP = {metrics['tp']} | FN = {metrics['fn']} |")
        lines.append(f"| **No littering (expected)** | FP = {metrics['fp']} | TN = {metrics['tn']} |")
        lines.append("")

        # Per-video ----------------------------------------------------
        lines.append("## Per-video results")
        lines.append("")
        lines.append("| Video | Scenario | Expected | Detected | Verdict | Mean conf | Delay (s) |")
        lines.append("| --- | --- | ---: | ---: | :---: | ---: | ---: |")
        for r in metrics["per_video"]:
            conf = f"{r['mean_confidence']:.2f}" if r["mean_confidence"] is not None else "—"
            delay = f"{r['detection_delay_s']:.2f}" if r["detection_delay_s"] is not None else "—"
            scenario = r["scenario"] or "—"
            lines.append(
                f"| {r['file']} | {scenario} | {r['expected']} | "
                f"{r['detected']} | {r['verdict']} | {conf} | {delay} |"
            )
        lines.append("")
        lines.append(
            f"Incident counts: {metrics['detected_incident_total']} detected "
            f"vs {metrics['expected_incident_total']} expected across the labelled set."
        )
        lines.append("")
        lines.append("> **How to read this.** A video is a true positive when it "
                     "should contain a littering event and at least one incident "
                     "fired. The false-alarm rate is the fraction of clean clips "
                     "that wrongly fired. Detection delay is measured only on "
                     "true-positive clips that carry a labelled `event_time_s`.")
    else:
        # No ground truth: timing-only table.
        lines.append("## Per-video output (no ground truth supplied)")
        lines.append("")
        lines.append("| Video | Frames | Time (s) | FPS | Incidents |")
        lines.append("| --- | ---: | ---: | ---: | ---: |")
        for r in results:
            lines.append(
                f"| {r['file']} | {r['frames_processed']} | {r['processing_s']:.2f} "
                f"| {r['processing_fps']:.1f} | {r['incident_count']} |"
            )
        lines.append("")
        lines.append("> Fill `data/ground_truth.csv` (copy the `.example`) to get "
                     "accuracy, precision, recall, F1, false-alarm rate and "
                     "detection delay.")

    lines.append("")
    return "\n".join(lines)


# ======================================================================
# CLI entry point (imports the ML stack lazily inside main).
# ======================================================================
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="System-level littering evaluation.")
    p.add_argument("--videos", default="data/test_videos", help="folder with test videos")
    p.add_argument("--ground-truth", default="data/ground_truth.csv", help="ground-truth CSV")
    p.add_argument("--model", default=None, help="override MODEL_PATH (e.g. ml/weights/best.pt)")
    p.add_argument("--waste-classes", default=None,
                   help="override WASTE_CLASSES (e.g. 'trash' for the fine-tuned model)")
    p.add_argument("--device", default=None, help="override DEVICE (cpu / 0 / mps)")
    p.add_argument("--conf", default=None, help="override CONF_THRESHOLD")
    p.add_argument("--no-output", action="store_true",
                   help="skip writing annotated preview videos (faster evaluation)")
    p.add_argument("--out", default="data/eval_results.json", help="output JSON path")
    p.add_argument("--report", default="data/eval_report.md", help="output Markdown report path")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    # Override settings through the environment BEFORE the backend import.
    if args.model:
        os.environ["MODEL_PATH"] = args.model
    if args.device:
        os.environ["DEVICE"] = args.device
    if args.waste_classes:
        os.environ["WASTE_CLASSES"] = args.waste_classes
    if args.conf:
        os.environ["CONF_THRESHOLD"] = args.conf
    if args.no_output:
        os.environ["SAVE_OUTPUT_VIDEO"] = "false"

    from backend.app.config import settings
    from backend.app.services.pipeline import Pipeline
    from ml.detector import Detector

    videos_dir = Path(args.videos)
    if not videos_dir.exists():
        print(f"[evaluate] videos folder not found: {videos_dir}")
        sys.exit(1)

    files = sorted(
        (p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS),
        key=lambda p: p.name,
    )
    if not files:
        print(f"[evaluate] no video files found in {videos_dir}")
        print("[evaluate] add labelled clips and fill data/ground_truth.csv "
              "(see data/test_videos/README.md).")
        sys.exit(1)

    gt = load_ground_truth(Path(args.ground_truth))
    if not gt:
        print(f"[evaluate] no ground truth at {args.ground_truth} — "
              "reporting timing/incident counts only (no accuracy metrics).")

    print(f"[evaluate] loading model {settings.model_path} "
          f"(device={settings.device}, waste_classes={settings.waste_classes}) ...")
    detector = Detector()
    pipeline = Pipeline(detector)

    results = []
    print(f"\n{'video':<28} {'frames':>7} {'time_s':>7} {'fps':>6} {'incidents':>9}")
    print("-" * 66)

    for idx, fpath in enumerate(files, start=1):
        t0 = time.monotonic()
        stats = pipeline.process(video_id=idx, persist=False, video_path=fpath)
        elapsed = time.monotonic() - t0
        incidents = stats.get("incidents", [])
        results.append({
            "file": fpath.name,
            "duration_ms": stats.get("duration_ms", 0),
            "frames_processed": stats.get("processed_frames", 0),
            "processing_s": round(elapsed, 2),
            "processing_fps": stats.get("processing_fps", 0),
            "incident_count": len(incidents),
            "incidents": [
                {
                    "timestamp_ms": i["timestamp_ms"],
                    "confidence": i["confidence"],
                    "class": i["class_names"],
                    "reason": i["reason"],
                }
                for i in incidents
            ],
        })
        print(
            f"{fpath.name:<28} {stats.get('processed_frames', 0):>7} "
            f"{elapsed:>7.2f} {stats.get('processing_fps', 0):>6.1f} "
            f"{len(incidents):>9}"
        )

    metrics = compute_metrics(results, gt)

    # ------------------------------------------------------------------
    # Terminal summary
    # ------------------------------------------------------------------
    if metrics:
        print("\nGround-truth comparison:")
        print(f"{'video':<28} {'expected':>8} {'detected':>8}  result")
        print("-" * 66)
        for r in metrics["per_video"]:
            print(f"{r['file']:<28} {r['expected']:>8} {r['detected']:>8}  {r['verdict']}")
        print(
            f"\nTP={metrics['tp']}  FP={metrics['fp']}  "
            f"FN={metrics['fn']}  TN={metrics['tn']}\n"
            f"Accuracy         = {_pct(metrics['accuracy'])}\n"
            f"Precision        = {_pct(metrics['precision'])}\n"
            f"Recall           = {_pct(metrics['recall'])}\n"
            f"F1               = {_pct(metrics['f1'])}\n"
            f"False-alarm rate = {_pct(metrics['false_alarm_rate'])}\n"
            f"Miss rate        = {_pct(metrics['miss_rate'])}"
        )
        if metrics["detection_delay"]:
            dd = metrics["detection_delay"]
            print(f"Detection delay  = {dd['mean_s']:.2f}s mean / "
                  f"{dd['median_s']:.2f}s median (n={dd['n']})")

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------
    meta = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "model": settings.model_path,
        "device": settings.device,
        "waste_classes": ",".join(settings.waste_classes) if settings.waste_classes else "(all non-person)",
        "frame_step": settings.frame_step,
        "conf_threshold": settings.conf_threshold,
        "videos_dir": str(videos_dir),
    }

    json_report = {
        "generated_at": meta["generated_at"],
        "config": {
            "model": meta["model"],
            "device": meta["device"],
            "waste_classes": meta["waste_classes"],
            "frame_step": meta["frame_step"],
            "conf_threshold": meta["conf_threshold"],
            "videos_dir": meta["videos_dir"],
        },
        "videos": results,
        "metrics": metrics,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(json_report, indent=2), encoding="utf-8")

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(render_markdown(meta, results, metrics), encoding="utf-8")

    print(f"\nJSON report     -> {out_path}")
    print(f"Markdown report -> {report_path}")


if __name__ == "__main__":
    main()
