# 01 - Overview

## 1. The purpose of the system

Littering in public places is a common problem. Small waste items such as wrappers, bottles, and paper cups stay unnoticed until they collect in open spaces. CCTV cameras record the footage, but a person must review the footage manually. Manual review is slow and can miss important events.

The system detects suspected littering incidents from video. When the system detects an incident, it saves the evidence. The evidence contains a snapshot, a clip, a timestamp, and a confidence score. The operator reviews the evidence in a web dashboard.

## 2. The inputs of the system

The system accepts these inputs:

- Uploaded video files.
- Video from a webcam, for real-time testing.
- Video from an IP camera (planned for a future version).

The uploaded video is the main input for the minor project demo. The system stores the incidents that it finds in an uploaded video. The webcam input runs the same detection in real time in the browser. The system shows the webcam results on the screen only. The system does not save webcam incidents to the database.

## 3. The main parts of the system

The system has five main parts:

| Part | Task |
| --- | --- |
| The detector | Finds persons and waste objects in each frame |
| The tracker | Follows objects across the frames |
| The event engine | Decides if a littering event happened |
| The backend | Stores the data and controls the work flow |
| The dashboard | Shows the incidents to the operator |

### 3.1 The detector

The detector uses a YOLO model from the Ultralytics library. YOLO finds objects in one pass over the image. The default model is the pretrained COCO model. This model finds persons, bottles, and cups without any training.

### 3.2 The tracker

The tracker uses ByteTrack. ByteTrack gives each detected object an identity number. The identity number stays the same while the object moves across the frames. This lets the system follow the object over time.

### 3.3 The event engine

The event engine is a set of rules. The rules check the relation between a person and a waste object over time. The system flags an incident when these conditions are true:

- A waste object appears near a person.
- The object stays in one place.
- The person moves away from the object.

The project proposal defines this rule as N and R and S and M. See the file 03-how-the-code-works.md for the full explanation.

### 3.4 The backend

The backend is a FastAPI application. It has these tasks:

- Receive uploaded videos.
- Queue the videos for processing.
- Store the incidents in a database.
- Serve the dashboard and the media files.
- Send live updates to the dashboard over a WebSocket.
- Run real-time detection on webcam frames.

### 3.5 The dashboard

The dashboard is a single-page web application. The project builds it with React. The operator uses the dashboard to:

- Upload videos.
- Watch the processing status in real time.
- View the list of incidents.
- Review each incident.
- Mark an incident as confirmed or as a false alarm.
- Test the model in real time with the webcam.

## 4. The data decision

The team does not collect or annotate any new data. This is a fixed decision for the project. All data comes from existing public sources:

- TACO, for waste images with annotations.
- TrashNet, for waste classification images.
- The pretrained COCO model, for persons, bottles, and cups.
- Public test videos, for the demo and the evaluation.

The file 04-datasets.md gives the complete data plan.

## 5. The outputs of the system

The system produces these outputs:

- Detected persons and waste objects with bounding boxes.
- An annotated preview video for each processed video.
- A real-time annotated webcam stream.
- Incidents with a snapshot, a clip, a timestamp, and a confidence score.
- A review dashboard.
- Evaluation results, such as detection accuracy, false alarm rate, processing speed, and detection delay.

## 6. The main work flow

1. The operator uploads a video.
2. The server saves the video and queues it.
3. The worker thread processes the video.
4. The pipeline reads the frames one by one.
5. The detector finds the objects in each frame.
6. The tracker follows the objects across the frames.
7. The event engine checks the rules.
8. The pipeline saves the incidents and the evidence.
9. The dashboard shows the incidents.
10. The operator reviews the incidents.

## 7. The software that the system uses

| Software | Version range | Task |
| --- | --- | --- |
| Python | 3.10 to 3.12 | The programming language |
| FastAPI | 0.110 or newer | The web framework |
| Uvicorn | 0.29 or newer | The web server |
| Ultralytics | 8.2 or newer | The YOLO model and the tracker |
| OpenCV | 4.9 or newer | The video and image processing |
| SQLite | Built into Python | The database |

## 8. What this project does not do

The current version does not do these tasks:

- Save incidents from the webcam to the database. The webcam is for real-time testing only.
- Process a live IP camera feed.
- Log in users or control access.
- Run in the cloud.
- Deploy to a production server.

These tasks are future work. The project proposal lists them as stretch goals.
