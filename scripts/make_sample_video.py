#!/usr/bin/env python3
"""
Generates a synthetic sample video used only to smoke-test the
upload -> processing -> dashboard flow.

NOTE: The video contains colored rectangles, NOT real people or objects, so
the YOLO model will not detect anything in it. It exists purely to verify
that the server pipeline runs end-to-end (expect 0 incidents).

Usage:
    python scripts/make_sample_video.py -o data/test_videos/sample_synthetic.mp4
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("-o", "--out", default="data/test_videos/sample_synthetic.mp4")
    p.add_argument("--width", type=int, default=640)
    p.add_argument("--height", type=int, default=480)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--seconds", type=float, default=6.0)
    args = p.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    w, h = args.width, args.height
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out), fourcc, args.fps, (w, h))
    if not writer.isOpened():
        print("Could not open video writer (is OpenCV built with ffmpeg?).")
        sys.exit(1)

    total = int(args.fps * args.seconds)
    for i in range(total):
        frame = np.full((h, w, 3), 200, dtype=np.uint8)  # light gray

        # A moving "person-like" rectangle drifting from left to right.
        x = int(w * 0.1 + i / total * w * 0.6)
        cv2.rectangle(frame, (x, h // 3), (x + 60, h // 3 + 120), (0, 160, 0), -1)

        # A "dropped object" appears in the second half and stays still.
        if i > total // 2:
            cv2.rectangle(frame, (w // 2, h // 2), (w // 2 + 30, h // 2 + 30), (0, 0, 200), -1)

        writer.write(frame)

    writer.release()
    print(f"Wrote synthetic smoke-test video: {out} ({total} frames, {args.fps} fps)")


if __name__ == "__main__":
    main()
