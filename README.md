# Real-Time Littering Detection System

A minor-project prototype that detects **suspected littering incidents** from
CCTV / webcam / uploaded video, using:

- **YOLO** (Ultralytics) for person + waste-object detection,
- **ByteTrack** (via Ultralytics) for multi-object tracking,
- a **rule-based event engine** implementing the proposal's rule
  `L = N ∧ R ∧ S ∧ M` (object appears **N**ear a person → is **R**eleased →
  stays **S**tationary → person **M**oves away), with **track stitching** so a
  detection flicker or ID swap does not lose an event,
- **FastAPI + SQLite** backend with a background processing worker and
  **WebSockets** for live progress and real-time webcam inference,
- a **React dashboard** ("Kalanka", built with Vite + Tailwind) for
  uploading footage, watching the queue live, reviewing incidents (snapshot,
  evidence clip, timestamp, confidence, review status), and testing the model
  in real time from a webcam.

**Data decision (per team):** no dataset is recorded or curated by the team.
All training/testing data comes from existing public sources (TACO, TrashNet,
COCO-pretrained weights, Roboflow/Kaggle litter sets) and publicly available
test videos. Details and provenance guidance are in the project plan.

---

## 1. Requirements

- **Python 3.10 – 3.12** (64-bit)
- Internet connection on the **first run** (downloads the YOLO weights, ~6 MB)
- ~4 GB free disk space (PyTorch + dependencies)
- No GPU required — CPU works (a GPU makes processing faster)

---

## 2. Installation

```bash
# 1) Go to the project folder
cd litter-detector

# 2) Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3) Install dependencies
pip install -r requirements.txt
```

> **Tip for machines without an NVIDIA GPU (optional, smaller download):**
> ```bash
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
> pip install -r requirements.txt
> ```

---

## 3. Running the System

```bash
python run.py
```

Then open **http://127.0.0.1:8000** in your browser.

**First run:** the YOLO model (`yolov8n.pt`) is downloaded automatically when
the first video is processed (not at startup), so the server starts quickly.

The dashboard is a React app that is **already built** into `frontend/` and
committed to the repo, so `python run.py` serves it straight away — no Node
step is required just to run the system.

### Rebuilding the dashboard (only if you edit the frontend)

The React source lives in `frontend_app/`. You only need Node if you want to
change the UI.

```bash
cd frontend_app
npm install
npm run dev      # hot-reload dev server on http://127.0.0.1:5173
                 # (proxies /api, /ws and /media to the backend on :8000)
npm run build    # rebuilds the committed frontend/ that FastAPI serves
```

Run `python run.py` in another terminal so the dev server has a backend to
talk to.

### Quick smoke test (optional)

```bash
python scripts/make_sample_video.py     # synthetic clip (0 incidents expected)
python scripts/evaluate.py              # runs the pipeline over data/test_videos/
```

---

## 4. How to Use (Demo Flow)

1. Open the dashboard → **Upload Video** tab. Drag in a clip, or click to
   browse (e.g. someone dropping an object and walking away). The upload starts
   the processing pipeline automatically.
2. The **Videos & Output** tab shows the queue with a live, WebSocket-driven
   progress bar; when a video finishes, its status becomes `completed` and an
   **Output** button opens the annotated video (bounding boxes, track IDs and
   the association HUD). Use **Re-run** to reprocess.
3. The **Incident Review** tab lists every suspected event as a card with a
   snapshot, confidence, source video, timestamp and reason. Filter by
   pending / confirmed / false alarm. Click a card to open the detail view:
   - the extracted evidence clip (plays inline, downloadable),
   - the detection reason,
   - **Confirm** / **False alarm** review buttons.
4. The **Real-Time Camera** tab runs the full pipeline live on your webcam over
   a WebSocket, showing the annotated stream, FPS, inference latency and the
   active (trash, person) associations. Live webcam incidents are shown
   on-screen only — they are not saved to the database.

### Useful demo videos (put them in `data/test_videos/`)

| Scenario | Expected result |
|---|---|
| Person drops an object, walks away | 1+ incidents |
| Person walks past existing litter | 0 incidents |
| Person carries something but keeps it | 0 incidents |

---

## 5. Configuration

All settings are environment variables; copy `.env.example` to `.env` to
change them. The most useful ones:

| Variable | Default | Meaning |
|---|---|---|
| `MODEL_PATH` | `yolov8n.pt` | Ultralytics weights (name or file path). Use `yolov8s.pt` for accuracy, or your fine-tuned TACO model |
| `DEVICE` | `cpu` | `cpu`, `0` (GPU), `mps` (Apple Silicon) |
| `WASTE_CLASSES` | `bottle,cup` | Classes treated as waste (matched to the model's names). For a custom fine-tuned model: `bottle,cup,wrapper,paper,other_waste` |
| `FRAME_STEP` | `2` | Analyse every Nth frame (1 = every frame) |
| `CONF_THRESHOLD` | `0.30` | Detection confidence threshold |
| `PROXIMITY_RADIUS` | `180` | px — how close a person must be when the object appears (rule **N**) |
| `STATIONARY_FRAMES` | `8` | how long the object must stay still (rule **S**) |
| `LEAVE_DISTANCE` | `100` | px — how far the person must move away (rule **M**) |
| `IGNORE_FIRST_FRAMES` | `20` | waste already visible at the start = pre-existing litter, never an event |
| `CLIP_BEFORE_MS` / `CLIP_AFTER_MS` | `2000` / `3000` | evidence clip window |
| `MAX_INCIDENTS` | `50` | cap per video |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | server binding |

See **`.env.example`** for the complete list, including the track-stitching /
tracker-recovery settings (`WASTE_RECONNECT_DIST`, `PERSON_RECONNECT_DIST`,
`TRACK_BUFFER`, and so on).

---

## 6. Fine-Tuning on TACO (Optional, Recommended for the Report)

The pretrained COCO model already detects `person`, `bottle` and `cup`. To
improve waste detection, fine-tune YOLOv8 on **TACO** (public, pre-annotated,
COCO format) — no manual annotation needed:

```bash
# 1) Get TACO
git clone https://github.com/pedropro/TACO.git
cd TACO
pip install -r requirements.txt
python download.py             # downloads the images (see TACO docs)

# 2) Convert COCO JSON -> YOLO labels with the official script:
python utils/coco2yolo.py --dataset-dir . --img-size 640

# 3) Train (any free Colab T4 works; TACO is small, minutes per epoch)
yolo detect train data=<dataset>/data.yaml model=yolov8n.pt epochs=30 imgsz=640

# 4) Use the result
cp runs/detect/train/weights/best.pt ../litter-detector/ml/models/taco.pt
#    then set in .env:
#    MODEL_PATH=ml/models/taco.pt
#    WASTE_CLASSES=bottle,cup,wrapper,paper,other_waste
```

The system auto-maps `WASTE_CLASSES` to your model's class names.

---

## 7. Evaluation

This measures the **complete event detector** (detection → tracking → rule
engine → incidents), not the object detector on its own — the gap the report
flags in sections 7.5–7.6.

```bash
cp data/ground_truth.csv.example data/ground_truth.csv   # then label each clip
python scripts/evaluate.py --model ml/weights/best.pt --waste-classes trash
```

> Point it at your fine-tuned model **and** its class name. The committed
> default is the stock COCO model (`yolov8n.pt` + `bottle,cup`), so naming both
> makes sure evaluation runs the real model. If you point at `best.pt` but leave
> `WASTE_CLASSES=bottle,cup`, the detector matches no class and reports zero
> incidents.

It prints a per-video table and, when the ground-truth CSV is present, compares
against it — TP/FP/FN/TN, accuracy, precision, recall, F1, **false-alarm rate**,
miss rate, and **detection delay** (from the optional `event_time_s` column). It
writes a paste-ready table to `data/eval_report.md` and the raw numbers to
`data/eval_results.json`.

See `data/test_videos/README.md` for how to build and label the clip set.

---

## 8. Project Structure

```
litter-detector/
├── run.py                        # launcher (uvicorn)
├── requirements.txt              # runtime dependencies
├── requirements-dev.txt          # test / lint dependencies
├── .env.example                  # configuration template
├── openh264-2.5.0-win64.dll      # H.264 codec used for clip encoding (Windows)
├── backend/
│   ├── data/                     # SQLite database (runtime)
│   ├── storage/                  # videos/, snapshots/, clips/, output/ (runtime)
│   └── app/
│       ├── main.py               # FastAPI app, routers, WebSockets, static mounts
│       ├── config.py             # settings (env / .env driven)
│       ├── db.py                 # SQLite data-access layer (WAL)
│       ├── schemas.py            # Pydantic request/response models
│       ├── utils.py
│       ├── routers/
│       │   ├── videos.py         # POST/GET /api/videos, POST /process
│       │   ├── incidents.py      # GET/PATCH /api/incidents
│       │   └── webcam.py         # /ws/webcam real-time inference
│       └── services/
│           ├── worker.py            # background processing thread + WS broadcasts
│           ├── pipeline.py          # video -> detect -> track -> events -> evidence
│           ├── event_engine.py      # N ^ R ^ S ^ M rule engine (pure Python)
│           └── websocket_manager.py # WebSocket connection registry + broadcast
├── ml/
│   ├── detector.py               # YOLO + ByteTrack wrapper
│   └── bytetrack_custom.yaml     # tuned ByteTrack tracker config
├── frontend_app/                 # React + Vite + Tailwind dashboard (source)
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/           # Sidebar + Upload/Videos/Incidents/Webcam tabs
│   ├── package.json
│   └── vite.config.js            # builds into ../frontend
├── frontend/                     # built dashboard served by FastAPI (generated)
├── scripts/
│   ├── evaluate.py               # metrics over data/test_videos/
│   └── make_sample_video.py      # synthetic smoke-test video
├── notebooks/                    # training / exploration notebooks
├── tests/
│   ├── test_event_engine.py      # unit tests for the rule engine
│   ├── test_evaluate.py          # unit tests for the evaluation harness
│   ├── test_reconcile.py         # unit tests for startup crash-recovery
│   └── test_webcam.py            # unit tests for the webcam frame processor
└── data/
    ├── test_videos/              # put demo/eval videos here
    ├── eval_results.json         # written by scripts/evaluate.py
    └── ground_truth.csv.example
```

---

## 9. API Reference

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/videos` | Upload a video (multipart `file`); auto-queued |
| `GET` | `/api/videos` | List videos + incident counts |
| `GET` | `/api/videos/{id}` | Video detail + status |
| `POST` | `/api/videos/{id}/process` | Queue (re)processing; body `{"force": true}` to reprocess |
| `GET` | `/api/incidents?video_id=&status=` | List incidents (filterable) |
| `GET` | `/api/incidents/{id}` | Incident detail |
| `PATCH` | `/api/incidents/{id}` | `{"review_status": "confirmed"}` |
| `GET` | `/api/health` | Health check |
| `GET` | `/media/...` | Stored videos, snapshots, clips, annotated output |

**WebSockets**

| Path | Purpose |
|---|---|
| `/ws/events` | Server pushes live processing updates (`video_status`, `video_progress`) so the dashboard updates without polling |
| `/ws/webcam` | Client streams webcam frames (binary JPEG); server runs the pipeline off the event loop and returns **metadata only** (boxes, track IDs, associations, events) so the browser draws the overlay on the live video. Also accepts the legacy base64-JSON form and replies with an annotated frame, for older dashboard builds |

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `RuntimeError: Model file not found` on first process | Check internet; Ultralytics downloads `yolov8n.pt` automatically. Or `pip install ultralytics` again |
| Upload fails with 413 | Raise `MAX_UPLOAD_MB` in `.env` |
| Video stuck `processing` | A running job logs to the terminal; a failed job sets status `failed`, with the error in the terminal log and the video's `/api/videos/{id}` record. If the server was stopped mid-job, the video is reset to `failed` automatically on the next startup — just **Re-run** it |
| Clip won't play in the browser | OpenCV may have written an MPEG-4 (`mp4v`) clip; use the **Download clip** link and play in VLC, or set `CLIP_AFTER_MS`/re-encode |
| No incidents on your video | The rules are deliberately strict: the object must *appear* after the video starts, near a person, stay still, and the person must walk away. Tune `PROXIMITY_RADIUS`, `STATIONARY_FRAMES`, `LEAVE_DISTANCE` in `.env`, or lower `CONF_THRESHOLD` |
| Slow processing | Set `FRAME_STEP=3`, use `yolov8n.pt`, or `DEVICE=0` with a GPU |
| `sqlite3.OperationalError: database is locked` | Delete `backend/data/litter.db` and restart (WAL mode avoids this in normal use) |

---

## 11. Tests

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

Tests cover the event-engine rule logic, the evaluation harness, the startup
crash-recovery, and the webcam frame processor — all pure Python, no ML needed.

---

*Minor Project — Purwanchal Campus, IOE, Tribhuvan University. Team: Anish
Ghimire, Kaushal Rijal, Kaushal Kumar Roy, Prabin Acharya.*
