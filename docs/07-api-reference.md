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

## 11. The media files

The /media path serves the stored files. The file paths come from the database.

Examples:

```text
/media/videos/3.mp4
/media/snapshots/3_0.jpg
/media/clips/3_0.mp4
/media/output/3.mp4
```

The browser plays the mp4 files. A clip that uses the mp4v codec may not play in the browser. The operator can use the download link in the dashboard instead.
