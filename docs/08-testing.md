# 08 - Testing

## 1. The test levels

The project has two test levels:

| Level | Content |
| --- | --- |
| Unit tests | The event engine rules |
| Smoke tests | The server work flow |

The unit tests run fast. They do not need the model. The smoke tests need the server and the model.

## 2. The unit tests

The unit tests are in the file tests/test_event_engine.py. The tests use the pytest framework. The tests simulate the detections with simple coordinates. They do not use YOLO.

### 2.1 The install

1. Install the test dependencies.

```bash
pip install -r requirements-dev.txt
```

### 2.2 The run

1. Go to the project folder.

2. Run the tests.

```bash
python -m pytest tests/ -v
```

The result shows one line per test.

### 2.3 The test list

The file has seven tests:

| Test | What it checks |
| --- | --- |
| test_happy_path_detects_littering_event | A person drops an object and walks away. One event fires. |
| test_pre_existing_waste_never_fires | Waste is visible at the start. No event fires. |
| test_person_walking_past_existing_litter_no_event | A person walks past existing litter. No event fires. |
| test_waste_appears_without_person_nearby_no_event | Waste appears far from a person. No event fires. |
| test_single_event_per_track_debounce | One waste track gives at most one event. |
| test_edge_object_skipped | An object at the frame edge is skipped. No event fires. |
| test_reset_clears_state | The reset function clears all the state. |

### 2.4 The happy path test

The happy path test simulates this scene:

- A person walks from the left side.
- A bottle appears near the person at frame 5.
- The bottle stays in one place.
- The person walks away.

The test expects exactly one event.

### 2.5 The pass condition

The tests pass when the pytest output shows no failures. The final line looks like this:

```text
7 passed in 0.XXs
```

## 3. The smoke test

The smoke test checks the complete work flow. The smoke test does not need a real detection video.

### 3.1 The sample video

1. Create the sample video.

```bash
python scripts/make_sample_video.py
```

The script writes the file data/test_videos/sample_synthetic.mp4.

The video contains colored rectangles. The rectangles are not real objects. The YOLO model detects nothing in this video. The expected incident count is zero.

### 3.2 The flow test

1. Start the server.

```bash
python run.py
```

2. Open the dashboard.

3. Upload the sample video.

4. Watch the status on the Videos tab.

5. Wait until the status shows "completed".

The test passes when:

- The status changes from pending to processing to completed.
- The incident count is zero.
- The terminal shows the processing messages.

This test confirms that the upload, the queue, the pipeline, and the database work together.

## 4. The full flow test

This test uses a real video with a person. It checks the complete system.

1. Put a real test video in the data/test_videos folder.

2. Start the server.

3. Upload the video.

4. Wait for the status "completed".

5. Check the Incidents tab.

The test passes when:

- The incidents appear.
- Each incident has a snapshot.
- Each incident has a clip.
- The dashboard shows the review buttons.

## 5. The database check

The operator can check the database directly. The database file is backend/data/litter.db.

1. Open a terminal.

2. Run this command:

```bash
sqlite3 backend/data/litter.db "SELECT id, filename, status FROM videos;"
```

3. Run this command:

```bash
sqlite3 backend/data/litter.db "SELECT id, video_id, review_status, confidence FROM incidents;"
```

The sqlite3 command line tool must be installed. On some systems, the tool is not present.

## 6. How to add a unit test

1. Open the file tests/test_event_engine.py.

2. Add a test function. The name starts with "test_".

3. Use the person and waste helper functions.

4. Use the run_frames helper function to simulate the frames.

5. Run the tests.

```bash
python -m pytest tests/ -v
```

## 7. The test data

The test videos go in the data/test_videos folder. The videos must follow the licenses of their sources. The file data/test_videos/README.md gives the guidance.

## 8. The known test limits

The unit tests do not test the model. The model quality can change the results. The team must test the model with real videos. The file 09-validation.md explains the validation with real videos.
