# 07 - API reference

## 1. The base address

All the API endpoints start with this prefix:

```text
/api
```

The server address is http://127.0.0.1:8000 by default.

## 2. The endpoint list

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/health | Check the server |
| POST | /api/videos | Upload a video |
| GET | /api/videos | List the videos |
| GET | /api/videos/{id} | Get one video |
| POST | /api/videos/{id}/process | Queue a video for processing |
| GET | /api/incidents | List the incidents |
| GET | /api/incidents/{id} | Get one incident |
| PATCH | /api/incidents/{id} | Change the review status |

The system also has two WebSocket endpoints. These endpoints do not use the /api prefix.

| Path | Purpose |
| --- | --- |
| /ws/events | Push the live status and progress updates to the dashboard |
| /ws/webcam | Run the live webcam detection |

The system also serves these static paths:

| Path | Content |
| --- | --- |
| /media/... | The stored videos, snapshots, and clips |
| / | The dashboard |

## 3. GET /api/health

The purpose: check that the server runs.

The response:

```json
{"status": "ok", "service": "Real-Time Littering Detection System", "version": "1.0.0"}
```

## 4. POST /api/videos

The purpose: upload a video. The server queues the video automatically.

The request: a multipart form with one field.

| Field | Type | Content |
| --- | --- | --- |
| file | file | The video file |

The supported file types:

- mp4
- mov
- avi
- mkv
- webm
- m4v

The response status: 201.

The response body: the video record. The record has these fields:

| Field | Content |
| --- | --- |
| id | The video number |
| filename | The original file name |
| source_type | The input type |
| file_path | The stored file path |
| status | pending |
| created_at | The creation time |

The error responses:

| Status | Cause |
| --- | --- |
| 400 | The file type is not supported |
| 400 | The file is empty |
| 413 | The file is larger than the size limit |

## 5. GET /api/videos

The purpose: list all the videos. The list is newest first.

The response: a list of video records. Each record has the incident count:

```json
{"incident_count": 3}
```

## 6. GET /api/videos/{id}

The purpose: get one video record.

The response status: 200.

The error responses:

| Status | Cause |
| --- | --- |
| 404 | The video does not exist |

## 7. POST /api/videos/{id}/process

The purpose: queue a video for processing.

The request body (optional):

```json
{"force": true}
```

The force flag has this effect:

| Force value | Status of the video | Result |
| --- | --- | --- |
| false | pending or failed | Queue the video |
| false | processing | Error 409 |
| false | completed | Error 409 |
| true | completed | Delete the incidents and queue the video |

The error responses:

| Status | Cause |
| --- | --- |
| 404 | The video does not exist |
| 409 | The video is already processing |
| 409 | The video is completed and the force flag is false |

## 8. GET /api/incidents

The purpose: list the incidents. The list is newest first.

The optional query parameters:

| Parameter | Content |
| --- | --- |
| video_id | The video number |
| status | The review status |

The valid status values:

- pending
- confirmed
- false_alarm

The response: a list of incident records. Each record has these fields:

| Field | Content |
| --- | --- |
| id | The incident number |
| video_id | The video number |
| timestamp_ms | The event time in the video |
| confidence | The confidence score |
| snapshot_path | The snapshot path |
| clip_path | The clip path |
| review_status | The review status |
| reason | The reason text |
| class_names | The waste class name |
| track_id | The object identity number |
| video_filename | The video file name |
| video_file_path | The video file path |

The error responses:

| Status | Cause |
| --- | --- |
| 400 | The status value is not valid |

## 9. GET /api/incidents/{id}

The purpose: get one incident record.

The response status: 200.

The error responses:

| Status | Cause |
| --- | --- |
| 404 | The incident does not exist |

## 10. PATCH /api/incidents/{id}

The purpose: change the review status of an incident.

The request body:

```json
{"review_status": "confirmed"}
```

The valid values:

- pending
- confirmed
- false_alarm

The response: the updated incident record.

The error responses:

| Status | Cause |
| --- | --- |
| 404 | The incident does not exist |
| 422 | The status value is not valid |

## 11. The WebSocket endpoints

The system has two WebSocket endpoints. These endpoints give real-time updates. They do not use the /api prefix.

### 11.1 /ws/events

The dashboard opens this WebSocket at the start. The server pushes messages to the dashboard. The client does not send messages.

The server sends two message types.

The first type is the status message. The server sends it when the video status changes.

```json
{"type": "video_status", "video_id": 3, "status": "processing"}
```

The status field has one of these values: pending, processing, completed, or failed. The completed message adds a "stats" object. The failed message adds an "error" string.

The second type is the progress message. The server sends it many times during the processing.

```json
{"type": "video_progress", "video_id": 3, "stats": {"processed_frames": 120, "total_frames": 900, "detected_incidents": 2}}
```

The dashboard uses the progress message to update the progress bar. The dashboard uses the status message to refresh the video list and the incident list.

### 11.2 /ws/webcam

The Real-Time Camera tab opens this WebSocket. The browser sends the camera frames. The server returns the annotated frames.

The browser sends this message for each frame. The browser sends up to 20 frames per second.

```json
{"image": "data:image/jpeg;base64,...", "timestamp_ms": 1699999999999}
```

The image field holds one JPEG frame in base64 form. The server reads the image field. The server does not use the timestamp_ms field.

The server returns this message for each frame:

```json
{"type": "webcam_frame", "image": "data:image/jpeg;base64,...", "frame_idx": 42, "inference_ms": 38.5, "associations": [[7, 3]], "events": []}
```

The response fields have this content:

| Field | Content |
| --- | --- |
| image | The annotated frame in base64 form |
| frame_idx | The frame number in this session |
| inference_ms | The frame processing time in milliseconds |
| associations | The active links, as pairs of [waste track number, person track number] |
| events | The new littering events in this frame |

The server does not save the webcam frames. The server does not save the webcam events in the database. The webcam path is for a live demonstration only.

## 12. The media files

The /media path serves the stored files. The file paths come from the database.

Examples:

```text
/media/videos/3.mp4
/media/snapshots/3_0.jpg
/media/clips/3_0.mp4
/media/output/3.mp4
```

The browser plays the mp4 files. A clip that uses the mp4v codec may not play in the browser. The operator can use the download link in the dashboard instead.
