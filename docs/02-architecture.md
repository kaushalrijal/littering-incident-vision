# 02 - Architecture

## 1. The component map

This diagram shows the main parts of the system and how they connect.

```text
+------------------+      +----------------------------+
|   The dashboard  | <->  |   The FastAPI backend      |
|   (web browser)  |      |   (the server)             |
+------------------+      +----------------------------+
        |                          |            |
        |  HTTP /api/*             |            |
        +--------------------------+            |
                                   |            |
                          +--------v--------+   |
                          |  The worker     |   |
                          |  thread         |   |
                          +--------+--------+   |
                                   |            |
                          +--------v--------+   |
                          |  The pipeline   |   |
                          +--------+--------+   |
                                   |            |
              +--------------------+------------v----------+
              |  The detector + the tracker (YOLO + ByteTrack) |
              +-------------------------------------------------+
                                   |
                          +--------v--------+
                          |  The event      |
                          |  engine (rules) |
                          +--------+--------+
                                   |
              +--------------------+--------------------+
              |                                         |
     +--------v--------+                       +--------v--------+
     |  The database   |                       |  The media      |
     |  (SQLite)       |                       |  storage        |
     +-----------------+                       +-----------------+
```

## 2. The layers of the system

The system has three layers:

| Layer | Content | Example |
| --- | --- | --- |
| The presentation layer | The dashboard | index.html, style.css, app.js |
| The application layer | The API and the logic | The routers, the worker, the pipeline |
| The data layer | The storage | The database, the media files |

## 3. The data flow

The flow has two main stages: the upload stage and the processing stage.

### 3.1 The upload stage

1. The operator selects a video in the dashboard.
2. The dashboard sends the video to the server with an HTTP POST request.
3. The server checks the file type and the file size.
4. The server saves the file in the media storage.
5. The server creates a video record in the database.
6. The server puts the video id in the queue.
7. The server returns the video record to the dashboard.

### 3.2 The processing stage

1. The worker thread takes the video id from the queue.
2. The worker checks the video status. If the video is already processing or completed, the worker skips it.
3. The worker sets the video status to "processing".
4. The worker loads the model on the first job.
5. The pipeline opens the video file.
6. The pipeline reads the frames one by one.
7. The pipeline runs the detector and the tracker on each frame.
8. The pipeline sends the detections to the event engine.
9. The event engine returns the new events.
10. The pipeline saves a snapshot and a clip for each event.
11. The pipeline inserts the incident records in the database.
12. The pipeline sets the video status to "completed".
13. The dashboard shows the result.

## 4. The folder structure

This is the folder structure of the project:

```text
litter-detector/
|-- run.py
|-- requirements.txt
|-- requirements-dev.txt
|-- .env.example
|-- README.md
|-- docs/                    The documentation
|-- backend/
|   |-- app/
|   |   |-- main.py          The FastAPI application
|   |   |-- config.py        The settings
|   |   |-- db.py            The database layer
|   |   |-- schemas.py       The request models
|   |   |-- utils.py         The small helpers
|   |   |-- routers/
|   |   |   |-- videos.py    The video endpoints
|   |   |   |-- incidents.py The incident endpoints
|   |   |-- services/
|   |   |   |-- worker.py    The background thread
|   |   |   |-- pipeline.py  The video processing
|   |   |   |-- event_engine.py  The rules
|   |   |-- data/            The database files
|   |   |-- storage/         The media files
|-- ml/
|   |-- detector.py          The YOLO wrapper
|-- frontend/
|   |-- index.html
|   |-- css/style.css
|   |-- js/app.js
|-- scripts/
|   |-- evaluate.py          The validation script
|   |-- make_sample_video.py The smoke test video
|-- tests/
|   |-- test_event_engine.py The unit tests
|-- data/
|   |-- test_videos/         The test videos
|   |-- ground_truth.csv.example
```

## 5. The media storage

The server stores the media files in the storage folder. The folder has four sub-folders:

| Sub-folder | Content |
| --- | --- |
| videos | The uploaded videos |
| snapshots | The incident snapshots |
| clips | The incident clips |
| output | The preview videos and the detection logs |

The database stores the media paths relative to the storage folder. The server serves these files at the /media path.

## 6. The database

The system uses one SQLite database file. The file is backend/data/litter.db by default.

The database has two tables:

### 6.1 The videos table

| Column | Content |
| --- | --- |
| id | The video number |
| filename | The original file name |
| source_type | The input type, such as "upload" |
| file_path | The path of the saved file |
| status | pending, processing, completed, or failed |
| error | The error message, if the processing failed |
| duration_ms | The video duration in milliseconds |
| fps | The frames per second of the video |
| width | The video width in pixels |
| height | The video height in pixels |
| total_frames | The total number of frames |
| processed_frames | The number of processed frames |
| processing_fps | The processing speed |
| detected_incidents | The number of incidents |
| created_at | The creation time |
| updated_at | The last update time |

### 6.2 The incidents table

| Column | Content |
| --- | --- |
| id | The incident number |
| video_id | The video number |
| timestamp_ms | The event time in the video |
| confidence | The confidence score |
| snapshot_path | The path of the snapshot |
| clip_path | The path of the clip |
| review_status | pending, confirmed, or false_alarm |
| reason | The text that explains the event |
| class_names | The waste class name |
| track_id | The object identity number |
| created_at | The creation time |
| updated_at | The last update time |

## 7. The threading model

The system runs in one process. The process has two types of threads:

| Thread | Task |
| --- | --- |
| The API threads | Handle the HTTP requests from the dashboard |
| The worker thread | Process the videos from the queue |

The worker thread is a daemon thread. The server starts it when the application starts. The server stops it when the application stops.

The database layer opens a new connection for each call. This makes the database safe for the API threads and the worker thread at the same time. The database uses the WAL mode. The WAL mode lets readers and the writer work without blocking each other.

## 8. The configuration

The system reads its settings from the environment variables. The operator can also put the settings in a .env file. The file .env.example in the project root shows all the settings.

The file 05-installation.md gives the full configuration table.
