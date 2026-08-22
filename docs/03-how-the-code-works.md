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
| reconcile_interrupted_videos | Reset videos left in the "processing" status by a stopped server to the "failed" status |
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

The engine can cancel the skip for a carried object. A skipped object can stay near a person and move with the person. This means the person carries the object into the scene. The object is not pre-existing litter. The engine removes the skip flag. The object can then fire an event when the person drops it and moves away. This rule also applies to an object that is born near the frame edge but moves with a person who enters the scene.

### 4.5 The association (N)

The engine tries to find a person near the waste object. A person is a candidate when:

- The person was seen in the last PERSON_NEAR_WINDOW frames.
- The distance from the person to the object is less than PROXIMITY_RADIUS.

The engine measures the distance from the object center to the nearest point on the person box. It does not measure the center-to-center distance. This is a box-aware distance. It gives a small distance when a person holds the object at the edge of the person box. A center-to-center distance would be too large in this case.

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

### 4.11 The track stitching (Re-ID)

The tracker can lose an object for a few frames. This happens with a detection flicker or an occlusion. When the object comes back, the tracker can give it a new identity number. Without a fix, the engine treats the new number as a new object. It loses the association, the birth location, and the stationary count.

The engine solves this with track stitching. The engine keeps a short memory of the lost tracks. When a new track appears, the engine tries to reconnect it to a lost track:

- For a waste object, the engine reconnects the new track when it is within WASTE_RECONNECT_DIST pixels of the lost track and within WASTE_RECONNECT_WINDOW frames.
- For a person, the engine reconnects the new track when it is within PERSON_RECONNECT_DIST pixels of the lost track and within PERSON_RECONNECT_WINDOW frames.

For a waste object, the reconnected track keeps its history. This includes the person association, the birth location, and the stationary count. For a person, the engine keeps an alias map. The alias map links the new person id to the first person id. The distance check for the rule M then uses the correct person.

### 4.12 The off-camera departure

A person can drop an object and then leave the frame. In this case, the engine has no current position for the person. The engine uses the last known position of the person for the rule M. This lets the event fire when the person is no longer visible.

### 4.13 The active associations

The engine has a function get_active_associations. The function returns the current list of (waste id, person id) pairs. The webcam handler uses this list to show the live associations on the screen.

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

This prevents the duplicate incidents. Because the worker skips a "processing" video, a video that a stopped server left in the "processing" status would stay stuck. The start-up recovery step (section 8) prevents this. It resets such a video to the "failed" status, so the operator can re-run it.

### 6.3 The model load

The worker loads the model on the first job. The load happens in the worker thread. This keeps the server start fast. The model stays in memory for the next jobs.

### 6.4 The status changes

The worker sets the video status to "processing" before the job. On success, the pipeline sets the status to "completed". On failure, the worker sets the status to "failed" and stores the error message.

### 6.5 The live updates

The worker sends messages to the dashboard over the WebSocket. It sends a message at these times:

- When a video enters the queue.
- When the job starts.
- While the job runs, with the progress values.
- When the job ends with success or failure.

The worker uses the WebSocket manager to send the messages. The dashboard listens on the /ws/events path. The dashboard updates the queue and the progress bar in real time. The operator does not refresh the page.

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

### 7.3 The webcam router (routers/webcam.py)

The webcam router has one WebSocket endpoint at the /ws/webcam path. For each frame from the browser the router does these steps:

1. Receive one frame. A binary message is a raw JPEG frame. A text message is the older JSON form with a base64 image.
2. Decode the image.
3. Run the detector, the tracker, and the event engine on the frame.
4. Build the reply.
5. Send the reply back to the browser.

The router runs step 2 to step 4 in a worker thread. It uses the asyncio.to_thread function for this work. The single server event loop therefore stays free while the model runs. This is the main performance change.

The router speaks two reply protocols. The protocol depends on the request:

| Request | Reply | Use |
| --- | --- | --- |
| Binary JPEG frame | Metadata only: the boxes, the track numbers, the associations, and the events. No image. | The current dashboard. The browser draws the boxes on the video. |
| JSON with a base64 image | An annotated JPEG image, plus the same metadata. | The older dashboard build. |

The metadata protocol is the faster one. The server does not draw or re-encode an image. The browser draws the boxes on a canvas over the local video. The two protocols share the same detection code. The size guard drops any frame larger than 4 MB.

The router uses a dedicated detector. This detector is separate from the background worker's detector. The two never share one model or one tracker. A video job and a live camera can therefore run at the same time without a track-number conflict. The router serves one webcam session at a time. It rejects a second session with an error message.

The webcam router does not save incidents to the database. It shows the results on the screen only.

## 8. The main application (main.py)

The file backend/app/main.py creates the FastAPI application.

The application uses a lifespan function. The function runs at the start and at the stop of the server:

- At the start: prepare the H.264 codec for the clips, create the tables, recover interrupted videos, give the WebSocket manager the event loop, and start the worker.
- At the stop: stop the worker.

The recovery step handles a server that stopped during the processing. The worker processes one video at a time and always moves a video to the "completed" or the "failed" status when it finishes. So a video that still shows the "processing" status at the start was interrupted. The recovery step sets each such video to the "failed" status with a clear message. This step is important, because the worker skips a video that shows the "processing" status. Without the recovery, an interrupted video stays stuck and the Re-run button does not work on it.

The application registers these routes:

1. GET /api/health, the health check.
2. The /ws/events WebSocket, for the live updates.
3. The video router at the /api prefix.
4. The incident router at the /api prefix.
5. The webcam router, which adds the /ws/webcam WebSocket.
6. The /media static mount, for the media files.
7. The / mount, for the built dashboard.

The order is important. The /api routes and the WebSocket routes must come before the / mount. If not, the frontend mount catches these requests.

The application also creates the WebSocket manager (services/websocket_manager.py). The manager keeps the list of the connected dashboards. The worker and the routers use the manager to send the live updates to all the connected dashboards.

## 9. The frontend (frontend_app/)

The dashboard is a single-page application. The project builds it with React, Vite, and Tailwind CSS. The source is in the frontend_app folder. The build command writes the static files to the frontend folder. The server serves the frontend folder.

### 9.1 The tabs

The dashboard has a sidebar and four tabs:

| Tab | Content |
| --- | --- |
| Upload Video | The drop zone and the upload status |
| Videos & Output | The video list, the progress, and the output video |
| Incident Review | The incident grid and the filters |
| Real-Time Camera | The live webcam test |

### 9.2 The live updates

The dashboard opens a WebSocket to the /ws/events path. The server sends the video status and the progress over this connection. The dashboard updates the video list and the progress bar in real time. The dashboard does not poll the server for the progress. The dashboard reads the full video list and the incident list from the /api endpoints when it needs them.

### 9.3 The upload tab

The operator drops a video on the drop zone or selects a file. The tab checks the file type and the file size in the browser. The tab sends the file with a FormData request to POST /api/videos. The tab shows an upload progress bar. The server queues the video for processing after the upload.

### 9.4 The videos and output tab

The video list is a table. It shows one row per video. Each row has:

- The file name.
- The status badge.
- The progress bar and the frame count, or the frames per second.
- The incident count.
- The upload time.
- The action buttons.

The action buttons depend on the status:

| Status | Button |
| --- | --- |
| completed | Output and Re-run |
| other | Re-run |

The Output button opens a modal. The modal plays the annotated output video. The modal has a download link for the video.

### 9.5 The incident review tab

The incident grid shows one card per incident. Each card has:

- The snapshot image.
- The review status badge.
- The confidence score.
- The video file name and the event time.
- The reason text.
- The Confirm and False alarm buttons.

The filter pills show all the incidents, or only the incidents of one review status. The review statuses are pending, confirmed, and false_alarm.

The operator clicks a card to open the detail modal. The modal shows:

- The evidence clip. The clip plays in the browser.
- The reason text.
- The Confirm and False alarm buttons.
- A download link for the clip.

The review buttons send a PATCH request to the /api/incidents/{id} endpoint.

### 9.6 The real-time camera tab

The Real-Time Camera tab tests the model with the webcam. The tab does these steps:

1. Ask the browser for permission to use the webcam.
2. Open a WebSocket to the /ws/webcam path.
3. Send each frame to the server as a binary JPEG image.
4. Wait for the reply before it sends the next frame. This pacing stops a frame backlog.
5. Draw the boxes and the labels on a canvas over the live video. The canvas uses the metadata from the reply.
6. Show the live metrics: the stream frames per second, the inference time, the active associations, and the count of the live incidents.

The tab shows the local video directly. The server does not send the video image back. The tab draws only the boxes. This method lowers the network load and makes the stream feel real-time.

The tab reconnects on its own if the WebSocket closes. It uses a growing delay between the attempts. A click on Stop Stream ends the session and stops the reconnect.

The webcam tab does not save the incidents. It shows the results on the screen only.

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
