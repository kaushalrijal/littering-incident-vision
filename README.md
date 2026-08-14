# Real-Time Littering Detection System

A minor-project prototype that detects **suspected littering incidents** from
CCTV / webcam / uploaded video, using:

- **YOLO** (Ultralytics) for person + waste-object detection,
- **ByteTrack** (via Ultralytics) for multi-object tracking,
- a **rule-based event engine** implementing the proposal's rule
  `L = N ∧ R ∧ S ∧ M` (object appears **N**ear a person → is **R**eleased →
  stays **S**tationary → person **M**oves away),
- **FastAPI + SQLite** backend with a background processing worker,
- a **vanilla HTML/CSS/JS dashboard** (no build step) for reviewing incidents
  (snapshot, evidence clip, timestamp, confidence, review status).

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

### Quick smoke test (optional)

```bash
python scripts/make_sample_video.py     # synthetic clip (0 incidents expected)
python scripts/evaluate.py              # runs the pipeline over data/test_videos/
```

---

## 4. How to Use (Demo Flow)

1. Open the dashboard → **Upload** tab.
2. Drop a video of a public space (e.g. someone dropping an object and walking
   away). Processing starts automatically.
3. The **Videos** tab shows the queue with a live progress bar; when done the
   status becomes `completed`.
4. The **Incidents** tab lists every suspected event with a snapshot,
   confidence and reason. Click an incident to open the detail view:
   - snapshot image with detections drawn,
   - the source video and a **Jump to event time** button,
   - the extracted evidence clip (downloadable),
   - **Confirm / False alarm / Mark pending** review buttons.

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
| `PROXIMITY_RADIUS` | `150` | px — how close a person must be when the object appears (rule **N**) |
| `STATIONARY_FRAMES` | `12` | how long the object must stay still (rule **S**) |
| `LEAVE_DISTANCE` | `120` | px — how far the person must move away (rule **M**) |
| `IGNORE_FIRST_FRAMES` | `20` | waste already visible at the start = pre-existing litter, never an event |
| `CLIP_BEFORE_MS` / `CLIP_AFTER_MS` | `2000` / `3000` | evidence clip window |
| `MAX_INCIDENTS` | `50` | cap per video |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | server binding |

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

```bash
cp data/ground_truth.csv.example data/ground_truth.csv   # fill expected results
python scripts/evaluate.py
```

Prints a per-video table (frames, processing time, FPS, incidents), compares
against the ground-truth CSV when present (TP/FP/FN/TN, accuracy, precision,
recall, F1) and writes `data/eval_results.json` for the report.

---

## 8. Project Structure

```
litter-detector/
├── run.py                      # launcher (uvicorn)
├── requirements.txt
├── .env.example                # configuration template
├── backend/
│   ├── data/                   # SQLite database (runtime)
│   ├── storage/                # videos/, snapshots/, clips/, output/ (runtime)
│   └── app/
│       ├── main.py             # FastAPI app + static mounts
│       ├── config.py           # settings (env / .env driven)
│       ├── db.py               # SQLite data-access layer (WAL)
│       ├── schemas.py          # Pydantic request/response models
│       ├── utils.py
│       ├── routers/
│       │   ├── videos.py       # POST/GET /api/videos, POST /process
│       │   └── incidents.py    # GET/PATCH /api/incidents
│       └── services/
│           ├── worker.py       # background processing thread
│           ├── pipeline.py     # video -> detect -> track -> events -> evidence
│           └── event_engine.py # N ^ R ^ S ^ M rule engine (pure Python)
├── ml/
│   └── detector.py             # YOLO + ByteTrack wrapper
├── frontend/                   # dashboard (served by FastAPI, no build)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── scripts/
│   ├── evaluate.py             # metrics over data/test_videos/
│   └── make_sample_video.py    # synthetic smoke-test video
├── tests/
│   └── test_event_engine.py    # unit tests for the rule engine
└── data/
    ├── test_videos/            # put demo/eval videos here
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
| `GET` | `/media/...` | Stored videos, snapshots, clips |

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `RuntimeError: Model file not found` on first process | Check internet; Ultralytics downloads `yolov8n.pt` automatically. Or `pip install ultralytics` again |
| Upload fails with 413 | Raise `MAX_UPLOAD_MB` in `.env` |
| Video stuck `processing` | Watch the terminal logs; a failed job sets status `failed` with the error shown in the UI |
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

Tests cover the event-engine rule logic only (pure Python, no ML needed).

---

*Minor Project — Purwanchal Campus, IOE, Tribhuvan University. Team: Anish
Ghimire, Kaushal Rijal, Kaushal Kumar Roy, Prabin Acharya.*
