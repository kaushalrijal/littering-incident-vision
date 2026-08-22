# 08 - Testing

## 1. The test levels

The project has two test levels:

| Level | Content |
| --- | --- |
| Unit tests | The event engine rules, the evaluation harness, the start-up recovery, and the webcam frame processor |
| Smoke tests | The server work flow |

The unit tests run fast. They do not need the model. The smoke tests need the server and the model.

## 2. The unit tests

The unit tests are in the tests folder. The file tests/test_event_engine.py tests the event engine rules. The file tests/test_evaluate.py tests the evaluation harness. The file tests/test_reconcile.py tests the start-up recovery of the interrupted videos. The file tests/test_webcam.py tests the webcam frame processor. The tests use the pytest framework. The tests simulate the data with simple values. They do not use YOLO.

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

### 2.3 The event engine test list

The file tests/test_event_engine.py has 14 tests:

| Test | What it checks |
| --- | --- |
| test_happy_path_detects_littering_event | A person drops an object and walks away. One event fires. |
| test_pre_existing_waste_never_fires | Waste is visible at the start. No event fires. |
| test_person_walking_past_existing_litter_no_event | A person walks past existing litter. No event fires. |
| test_waste_appears_without_person_nearby_no_event | Waste appears far from a person. No event fires. |
| test_single_event_per_track_debounce | One waste track gives at most one event. |
| test_edge_object_skipped | An object at the frame edge is skipped. No event fires. |
| test_reset_clears_state | The reset function clears all the state. |
| test_waste_track_reconnection_after_detection_dropout | The waste detection drops for some frames and returns with a new track number. The track stitching reconnects it. One event fires with the original track number. |
| test_person_track_reconnection_after_person_id_change | The person track number changes in the middle of the scene. The person alias map links the two numbers. One event fires. |
| test_off_camera_person_departure | A person drops litter and leaves the frame. The engine uses the last known person position. One event fires. |
| test_get_active_associations | The get_active_associations function returns the waste-to-person links. |
| test_box_aware_hand_held_trash_association | A person holds trash near the edge of the person box. The point-to-box distance links the trash to the person. |
| test_carried_trash_entrance_not_skipped | A person carries trash into the frame and then drops it. The engine does not skip the carried trash. |
| test_edge_entrance_carried_trash_association | A person carries trash in from the frame edge. The engine links the trash to the person and does not skip it. |

### 2.4 The happy path test

The happy path test simulates this scene:

- A person walks from the left side.
- A bottle appears near the person at frame 5.
- The bottle stays in one place.
- The person walks away.

The test expects exactly one event.

### 2.5 The pass condition

The tests pass when the pytest output shows no failures. When you run the whole tests folder, the final line counts both files:

```text
30 passed in 0.XXs
```

### 2.6 The evaluation harness tests

The file tests/test_evaluate.py has 8 tests. The tests check the parts of scripts/evaluate.py that do not need the model:

| Test | What it checks |
| --- | --- |
| test_classify_video_all_quadrants | The TP, FP, FN, and TN labels are correct. |
| test_load_ground_truth_free_columns_and_comments | The ground truth reader accepts a free column order, comment lines, and quoted text. |
| test_load_ground_truth_legacy_two_columns | The reader still accepts the old two-column format. |
| test_load_ground_truth_missing_file_is_empty | A missing ground truth file gives an empty result. |
| test_compute_metrics_known_scenario | The metrics and the detection delay are correct for a known scenario. |
| test_compute_metrics_no_ground_truth_returns_none | The metrics are absent when there is no ground truth. |
| test_render_markdown_with_metrics | The Markdown report contains the metrics and the table. |
| test_render_markdown_without_ground_truth | The Markdown report works without ground truth. |

### 2.7 The start-up recovery tests

The file tests/test_reconcile.py has 4 tests. The tests use a throwaway database. They check that the server recovers a video that a stopped server left in the "processing" status:

| Test | What it checks |
| --- | --- |
| test_reconcile_resets_only_processing_rows | Only the "processing" videos become "failed". The "pending", the "completed", and the already "failed" videos do not change. |
| test_reconcile_no_processing_returns_empty | No reset happens when no video is in the "processing" status. |
| test_reconcile_empty_database_returns_empty | The recovery is safe on an empty database. |
| test_reconcile_is_idempotent | A second run finds nothing to reset. |

### 2.8 The webcam processor tests

The file tests/test_webcam.py has 4 tests. The tests use a fake detector and a fake event engine. They check the frame processor of the webcam router. They do not use YOLO or a real camera:

| Test | What it checks |
| --- | --- |
| test_process_frame_meta_mode_shape | The metadata reply has the correct fields. It has the boxes, the track numbers, and the associations. It has no image. |
| test_process_frame_meta_bbox_is_rounded_float_list | Each box is a list of four rounded numbers. |
| test_process_frame_legacy_mode_returns_image | The legacy request gets an annotated image reply. |
| test_process_frame_undecodable_returns_none | A bad frame gives no reply. The server drops it. |

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
