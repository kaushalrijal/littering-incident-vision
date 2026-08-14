#!/usr/bin/env python3
"""
Evaluation script for the littering detection system.

Runs the full pipeline over a folder of test videos (without touching the
web database), prints a per-video results table and writes a JSON report.

Usage (from the project root):
    python scripts/evaluate.py                       # uses data/test_videos/
    python scripts/evaluate.py --videos data/test_videos
    python scripts/evaluate.py --ground-truth data/ground_truth.csv
    python scripts/evaluate.py --model yolov8s.pt --device 0

Ground-truth CSV format (optional):
    video,expected_incidents
    test_01.mp4,1
    test_02.mp4,0
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# Make the backend package importable when run from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--videos", default="data/test_videos", help="folder with test videos")
    p.add_argument("--ground-truth", default="data/ground_truth.csv", help="optional GT csv")
    p.add_argument("--model", default=None, help="override MODEL_PATH")
    p.add_argument("--device", default=None, help="override DEVICE (cpu / 0 / mps)")
    p.add_argument("--out", default="data/eval_results.json", help="output JSON path")
    return p.parse_args()


def load_ground_truth(path: Path) -> dict:
    if not path.exists():
        return {}
    gt: dict = {}
    with open(path, "r", encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            line = line.strip()
            if not line or i == 0:
                continue  # skip header + blanks
            parts = line.split(",")
            if len(parts) >= 2:
                try:
                    gt[parts[0].strip()] = int(parts[1].strip())
                except ValueError:
                    pass
    return gt


def main() -> None:
    args = parse_args()

    # Override settings through the environment BEFORE backend import.
    if args.model:
        os.environ["MODEL_PATH"] = args.model
    if args.device:
        os.environ["DEVICE"] = args.device

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
        sys.exit(1)

    gt = load_ground_truth(Path(args.ground_truth))
    print(f"[evaluate] loading model {settings.model_path} (device={settings.device}) ...")
    detector = Detector()
    pipeline = Pipeline(detector)

    results = []
    print(f"\n{'video':<24} {'frames':>7} {'time_s':>7} {'fps':>6} {'incidents':>9}")
    print("-" * 62)

    for idx, fpath in enumerate(files, start=1):
        t0 = time.monotonic()
        stats = pipeline.process(
            video_id=idx,
            persist=False,
            video_path=fpath,
        )
        elapsed = time.monotonic() - t0
        incidents = stats.get("incidents", [])
        results.append(
            {
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
            }
        )
        print(
            f"{fpath.name:<24} {stats.get('processed_frames', 0):>7} "
            f"{elapsed:>7.2f} {stats.get('processing_fps', 0):>6.1f} "
            f"{len(incidents):>9}"
        )

    # ------------------------------------------------------------------
    # Optional ground-truth comparison
    # ------------------------------------------------------------------
    if gt:
        tp = fp = fn = tn = 0
        print("\nGround-truth comparison:")
        print(f"{'video':<24} {'expected':>8} {'detected':>8}  result")
        print("-" * 62)
        for r in results:
            expected = gt.get(r["file"], 0)
            detected = r["incident_count"]
            if expected > 0 and detected > 0:
                tp += 1
                verdict = "TP"
            elif expected > 0 and detected == 0:
                fn += 1
                verdict = "FN"
            elif expected == 0 and detected > 0:
                fp += 1
                verdict = "FP"
            else:
                tn += 1
                verdict = "TN"
            print(f"{r['file']:<24} {expected:>8} {detected:>8}  {verdict}")

        total = tp + fp + fn + tn or 1
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        print(
            f"\nTP={tp}  FP={fp}  FN={fn}  TN={tn}\n"
            f"Accuracy  = {(tp + tn) / total:.2%}\n"
            f"Precision = {precision:.2%}\n"
            f"Recall    = {recall:.2%}\n"
            f"F1        = {f1:.2%}"
        )
        results.append(
            {
                "ground_truth_metrics": {
                    "tp": tp, "fp": fp, "fn": fn, "tn": tn,
                    "accuracy": round((tp + tn) / total, 4),
                    "precision": round(precision, 4),
                    "recall": round(recall, 4),
                    "f1": round(f1, 4),
                }
            }
        )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nReport written to {out_path}")


if __name__ == "__main__":
    main()
