# 03 - How the code works

This document explains each part of the code. Read the files in the project while you read this document.

## 1. The settings module (config.py)

The file backend/app/config.py contains the Settings class. The class reads the settings from the environment variables. The operator can also put the settings in a .env file. The file .env.example in the project root shows all the settings.

The module creates one settings object at the start. This object is the single source of the configuration. All the other modules read this object.

The Settings class also creates the folders that the system needs. These folders are:

- The storage folder and its sub-folders.
- The database folder.
- The frontend folder.

## 2. The database layer (db.py)

The file backend/app/db.py contains the data access functions.

The layer opens a new connection for each call. This is safe for the API threads and the worker thread at the same time. The connection uses these settings:

- WAL mode, so the readers do not block the writer.
- Foreign keys on, so the delete of a video also deletes its incidents.

The main functions are:

| Function | Task |
| --- | --- |
| init_db | Create the tables |
| create_video | Insert a video record |
| get_video | Get one video record |
| list_videos | Get all video records and the incident counts |
| update_video | Change one video record |
| create_incident | Insert an incident record |
| get_incident | Get one incident record |
| list_incidents | Get the incident records, with filters |
| set_incident_status | Change the review status of an incident |

## 3. The detector (ml/detector.py)

The file ml/detector.py contains the Detector class.

### 3.1 The model

The Detector loads the YOLO model from the Ultralytics library. The default model is yolov8n.pt. The server downloads this file on the first job. The download needs an internet connection.

### 3.2 The classes

The model has a list of class names. The detector builds two lists of class ids:

| List | Content |
| --- | --- |
| person_ids | The ids of the classes named "person" |
| waste_ids | The ids of the classes in the WASTE_CLASSES setting |

The default WASTE_CLASSES value is "bottle,cup". The pretrained COCO model has these classes. The operator can change the value for a custom model.

### 3.3 The predict function

The function predict takes one frame as input. The function runs the model in track mode:

- The tracker is ByteTrack.
- The persist option is true, so the tracker keeps the object identities across the frames.
- The confidence threshold and the IoU threshold come from the settings.

The function returns a list of detections. Each detection has:

- The class id.
- The class name.
- The bounding box (x1, y1, x2, y2).
- The confidence score.
- The track id.

The track id can be None on the first frames. The event engine skips these detections.

## 4. The event engine (event_engine.py)

The file backend/app/services/event_engine.py contains the EventEngine class. This class is the heart of the project.

The engine is pure Python. It does not use the model. This makes it fast and easy to test.

### 4.1 The rule

The engine checks the rule from the project proposal:

```text
L = N and R and S and M
```

The letters have these meanings:

| Letter | Condition |
| --- | --- |
| N | The waste object appears near a person |
| R | The object is released and separated from the person |
| S | The object stays stationary |
| M | The person moves away from the object |

### 4.2 The state

The engine keeps state for each tracked object:

| State | Content |
| --- | --- |
| PersonState | The position and the last seen frame of a person |
| WasteState | The position, the history, the age, and the association of a waste object |

### 4.3 The process_frame function

The pipeline calls process_frame for each processed frame. The function has four inputs:

- The frame index.
- The timestamp in milliseconds.
- The person detections.
- The waste detections.

The function does these steps:

1. Update the person tracks.
2. Update the waste tracks.
3. Check the skip conditions for new waste tracks.
4. Try to associate each waste track with a person.
5. Fire the events that meet the rule.
6. Remove the old tracks.

### 4.4 The skip conditions

A new waste track is skipped when one of these conditions is true:

- The object area is smaller than MIN_OBJECT_AREA.
- The object box touches the frame edge, within EDGE_MARGIN.
- The object is born in the first IGNORE_FIRST_FRAMES frames.

The third condition is important. A waste object that is visible at the start of the video is pre-existing litter. It is not an event.

### 4.5 The association (N)

The engine tries to find a person near the waste object. A person is a candidate when:

- The person was seen in the last PERSON_NEAR_WINDOW frames.
- The distance from the person to the object is less than PROXIMITY_RADIUS.

The engine selects the nearest person. It stores the person id and the birth distance.

The engine retries the association each frame while the object has no person. This covers the case where the person walks to the object just after it appears.

### 4.6 The stationary check (S)

The engine keeps the recent centers of the object in a history list. Each frame, the engine compares the current center with the mean of the history.

- If the distance is less than two times STATIONARY_THRESHOLD, the stationary count increases.
- If the distance is more, the stationary count resets to zero.

The engine uses the mean of the history, not the previous center. This reduces the effect of small detection noise.

### 4.7 The fire condition

The engine fires an event when all these conditions are true:

- The track is not skipped.
- The track has not fired before.
- The track has a person.
- The track lived for at least MIN_TRACK_FRAMES frames.
- The stationary count is at least STATIONARY_FRAMES.
- The distance from the person to the object is more than LEAVE_DISTANCE.
- The total fired count is less than MAX_INCIDENTS.

The engine fires one event per waste track. The fired flag prevents a second event for the same track.

### 4.8 The confidence score

The engine calculates the confidence score from three factors:

- The mean detection confidence of the object.
- The stationary duration.
- The birth distance from the person.

The score is in the range 0.30 to 0.99.

### 4.9 The event output

Each event has these fields:

| Field | Content |
| --- | --- |
| frame_idx | The processed frame index |
| timestamp_ms | The event time in the video |
| confidence | The confidence score |
| class_name | The waste class name |
| track_id | The object identity number |
| reason | The text that explains the event |
| stationary_frames | The stationary count at the event time |
| born_dist | The birth distance from the person |
| current_dist | The person distance at the event time |

### 4.10 The expiry

The engine removes a person track that was not seen for more than PERSON_EXPIRE frames. It removes a waste track that was not seen for more than WASTE_EXPIRE frames.

## 5. The pipeline (pipeline.py)

The file backend/app/services/pipeline.py contains the Pipeline class. The pipeline processes one video from start to end.

### 5.1 The process function

The function process has these inputs:

- The video id.
- The persist flag.
- The progress callback.
- The video path (for the evaluation script).

The persist flag is true for the normal work flow. The persist flag is false for the evaluation script. When persist is false, the pipeline does not write to the database.

The pipeline opens the video with OpenCV. If the video cannot open, the pipeline raises an error.

### 5.2 The main loop

The main loop reads the frames one by one. The loop processes a frame when this condition is true:

```text
source_frame mod FRAME_STEP = 0
```

The default FRAME_STEP value is 2. The system processes every second frame. This is a balance between speed and accuracy.

For each processed frame, the loop does these steps:

1. Run the detector on the frame.
2. Split the detections into persons and waste objects.
3. Send both lists to the event engine.
4. Save the evidence for the new events.
5. Restore the capture position.
6. Write the annotated frame to the preview video.
7. Update the progress values.

### 5.3 The evidence for an event

For each event, the pipeline does these tasks:

1. Save a snapshot. The snapshot is the current frame with the boxes drawn. The file goes to the snapshots folder.
2. Save a clip. The clip contains the source frames from the event time. The clip starts CLIP_BEFORE_MS before the event. The clip ends CLIP_AFTER_MS after the event. The file goes to the clips folder.
3. Store the incident record in the database.

### 5.4 The capture position

The pipeline extracts a clip by seeking the video capture. The clip writer moves the capture position. After the clip writer finishes, the pipeline restores the position to the next unprocessed frame. This prevents the main loop from skipping frames.

### 5.5 The preview video

The pipeline writes an annotated preview video. The preview shows the boxes and the labels. The file goes to the output folder. The operator can use this video for the demo and the report.

### 5.6 The detection log

The pipeline can write a detection log. The log is a JSONL file. Each line contains the detections of one frame. This feature is off by default. The operator turns it on with the LOG_DETECTIONS setting.

### 5.7 The progress

The pipeline sends progress values to the callback about one time per second. The callback updates the video record in the database. The dashboard shows these values as a progress bar.

### 5.8 The stats

The pipeline returns a stats dict. The dict contains:

- The processed frame count.
- The total frame count.
- The processing speed in frames per second.
- The video duration.
- The list of incidents.

### 5.9 The persist step

When persist is true, the pipeline:

1. Inserts one incident record for each incident.
2. Updates the video record.
3. Sets the video status to "completed".

## 6. The worker (worker.py)

The file backend/app/services/worker.py contains the ProcessingWorker class.

The worker is a background thread. It drains a queue of video ids.

### 6.1 The queue

The server puts a video id in the queue when:

- A video is uploaded.
- The operator starts the processing.

The worker takes one id from the queue at a time. The worker processes the videos one by one.

### 6.2 The dedupe check

A video can be in the queue two times. For example, the upload adds the video, and the operator clicks the process button. The worker checks the video status before it starts:

- If the status is "processing", the worker skips the video.
- If the status is "completed", the worker skips the video.

This prevents the duplicate incidents.

### 6.3 The model load

The worker loads the model on the first job. The load happens in the worker thread. This keeps the server start fast. The model stays in memory for the next jobs.

### 6.4 The status changes

The worker sets the video status to "processing" before the job. On success, the pipeline sets the status to "completed". On failure, the worker sets the status to "failed" and stores the error message.

## 7. The API routers

### 7.1 The video router (routers/videos.py)

The video router has four endpoints:

| Endpoint | Task |
| --- | --- |
| POST /api/videos | Upload a video |
| GET /api/videos | List the videos |
| GET /api/videos/{id} | Get one video |
| POST /api/videos/{id}/process | Queue a video for processing |

The upload endpoint does these steps:

1. Check the file type. Only mp4, mov, avi, mkv, webm, and m4v are allowed.
2. Create a video record.
3. Save the file in the storage folder. The upload streams the file in parts. It stops when the file is larger than MAX_UPLOAD_MB.
4. Update the video record with the file path.
5. Put the video id in the queue.

If the upload fails, the endpoint deletes the file and the video record.

The process endpoint has these rules:

- If the status is "processing", the endpoint returns error 409.
- If the status is "completed" and the force flag is false, the endpoint returns error 409.
- When the force flag is true, the endpoint deletes the old incidents and queues the video again.

### 7.2 The incident router (routers/incidents.py)

The incident router has three endpoints:

| Endpoint | Task |
| --- | --- |
| GET /api/incidents | List the incidents |
| GET /api/incidents/{id} | Get one incident |
| PATCH /api/incidents/{id} | Change the review status |

The list endpoint accepts two filters:

- video_id: show only the incidents of one video.
- status: show only the incidents of one review status.

The valid review statuses are:

- pending
- confirmed
- false_alarm

## 8. The main application (main.py)

The file backend/app/main.py creates the FastAPI application.

The application uses a lifespan function. The function runs at the start and at the stop of the server:

- At the start: create the tables, start the worker.
- At the stop: stop the worker.

The application registers these routes in this order:

1. GET /api/health
2. The video router at the /api prefix.
3. The incident router at the /api prefix.
4. The /media static mount.
5. The / mount for the frontend.

The order is important. The /api routes must come before the / mount. Otherwise the frontend mount would catch the API requests.

## 9. The frontend (frontend/js/app.js)

The dashboard is a single page. The JavaScript file controls all the behavior.

### 9.1 The views

The page has three views:

| View | Content |
| --- | --- |
| Upload | The drop zone and the upload status |
| Videos | The video list and the progress |
| Incidents | The incident grid and the filters |

### 9.2 The polling

The page refreshes the data every 2.5 seconds. This keeps the progress bar and the incident list up to date. The refresh uses two requests:

- GET /api/videos
- GET /api/incidents

### 9.3 The upload

The operator drops a video on the drop zone or selects a file. The page sends the file with a FormData request. After the upload, the page shows the video list.

### 9.4 The video list

The video list shows one row per video. Each row has:

- The video number and the file name.
- The status badge.
- The progress bar and the frame count.
- The duration and the frames per second.
- The incident count.
- The action buttons.

The action buttons depend on the status:

| Status | Button |
| --- | --- |
| pending | Process |
| processing | No button |
| completed | View and Reprocess |
| failed | Retry |

### 9.5 The incident grid

The incident grid shows one card per incident. Each card has:

- The snapshot image.
- The incident number and the event time.
- The review status badge.
- The video file name and the confidence.
- The reason text.

The operator clicks a card to open the detail modal.

### 9.6 The detail modal

The detail modal shows:

- The snapshot with the boxes.
- The source video.
- The evidence clip, with a download link.
- The metadata table.
- The review buttons.

The "Jump to event time" button moves the source video to the event time. This helps the operator check the event.

The review buttons send a PATCH request. The buttons are:

- Confirm.
- False alarm.
- Mark pending.

## 10. The scripts

### 10.1 The evaluation script (scripts/evaluate.py)

The script runs the pipeline over the test videos. The script does not write to the main database. The script prints a table with these values for each video:

- The frame count.
- The processing time.
- The processing speed.
- The incident count.

The script can also compare the results with a ground truth file. See the file 09-validation.md.

### 10.2 The sample video script (scripts/make_sample_video.py)

The script creates a synthetic video. The video contains colored rectangles. It does not contain real persons or objects. The YOLO model cannot detect these rectangles. The video is only for a smoke test of the work flow.

## 11. The unit tests (tests/test_event_engine.py)

The tests check the event engine rules. The tests do not use the model. They simulate the detections with simple coordinates. The file 08-testing.md gives the details.
