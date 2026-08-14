# 05 - Installation

## 1. The requirements

The system needs these items:

- A computer with 64-bit Python 3.10, 3.11, or 3.12.
- About 4 GB of free disk space.
- An internet connection for the first run.
- No GPU is required. A GPU makes the processing faster.

The first run downloads the YOLO model file. The file is about 6 MB.

## 2. The installation steps

1. Open a terminal window.

2. Go to the project folder.

```bash
cd litter-detector
```

3. Create a virtual environment.

```bash
python -m venv .venv
```

4. Activate the virtual environment.

On macOS and Linux:

```bash
source .venv/bin/activate
```

On Windows:

```bash
.venv\Scripts\activate
```

5. Install the dependencies.

```bash
pip install -r requirements.txt
```

The install takes some time. PyTorch and the Ultralytics library are large.

### 2.1 The optional CPU install

On a computer without an NVIDIA GPU, the default install downloads the CUDA version of PyTorch. This version is large. The operator can install the CPU version first:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

This install is smaller and is enough for the demo.

## 3. The first run

1. Start the server.

```bash
python run.py
```

2. Open a browser.

3. Go to this address:

```text
http://127.0.0.1:8000
```

The dashboard opens.

The model file downloads when the first video is processed. The download is not at the server start. The server starts fast.

## 4. The server messages

The terminal shows the server log. The log has these messages:

| Message | Meaning |
| --- | --- |
| Processing worker started | The worker thread is ready |
| Loading YOLO model | The worker loads the model for the first job |
| Video N done | The processing of video N finished |
| Processing failed for video N | The processing of video N failed |

## 5. The configuration

The system reads the settings from the environment variables. The operator can put the settings in a .env file in the project root.

1. Copy the example file.

```bash
cp .env.example .env
```

2. Edit the .env file with a text editor.

The .env file is optional. Without the file, the system uses the default values.

### 5.1 The settings table

| Setting | Default | Task |
| --- | --- | --- |
| HOST | 127.0.0.1 | The address of the server |
| PORT | 8000 | The port of the server |
| MODEL_PATH | yolov8n.pt | The model file |
| DEVICE | cpu | The compute device: cpu, 0, or mps |
| CONF_THRESHOLD | 0.30 | The detection confidence threshold |
| IOU_THRESHOLD | 0.45 | The IoU threshold |
| IMGSZ | 640 | The input image size |
| WASTE_CLASSES | bottle,cup | The waste class names |
| FRAME_STEP | 2 | Process every Nth frame |
| MAX_INCIDENTS | 50 | The incident limit per video |
| SAVE_OUTPUT_VIDEO | true | Save the annotated preview |
| LOG_DETECTIONS | false | Write the detection log |
| MAX_UPLOAD_MB | 500 | The upload size limit |
| MAX_VIDEO_DURATION_S | 0 | The video length limit, 0 is no limit |
| PROXIMITY_RADIUS | 150 | The near distance for rule N |
| STATIONARY_THRESHOLD | 8 | The stationary movement limit |
| STATIONARY_FRAMES | 12 | The stationary frame count for rule S |
| LEAVE_DISTANCE | 120 | The leave distance for rule M |
| MIN_TRACK_FRAMES | 5 | The minimum track age |
| MIN_OBJECT_AREA | 400 | The minimum object area |
| EDGE_MARGIN | 40 | The frame edge margin |
| IGNORE_FIRST_FRAMES | 20 | The pre-existing litter window |
| CLIP_BEFORE_MS | 2000 | The clip start before the event |
| CLIP_AFTER_MS | 3000 | The clip end after the event |
| DATABASE_PATH | backend/data/litter.db | The database file |
| STORAGE_DIR | backend/storage | The media folder |

### 5.2 The device setting

The DEVICE setting accepts these values:

| Value | Device |
| --- | --- |
| cpu | The central processor |
| 0 | The first NVIDIA GPU |
| mps | The Apple Silicon GPU |

## 6. The stop

The operator stops the server with Ctrl+C in the terminal. The server stops the worker thread and closes the database.

## 7. The verification

The operator checks that the install works:

1. Start the server.

2. Open this address in a browser:

```text
http://127.0.0.1:8000/api/health
```

The page shows this result:

```json
{"status": "ok"}
```

3. Go to the dashboard address.

4. Confirm that the page has the Upload tab.
