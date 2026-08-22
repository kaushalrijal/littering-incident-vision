# 06 - User guide

## 1. The start

1. Start the server. See the file 05-installation.md.

2. Open a browser.

3. Go to this address:

```text
http://127.0.0.1:8000
```

The dashboard opens on the Upload tab.

## 2. The tabs

The dashboard has four tabs:

| Tab | Content |
| --- | --- |
| Upload Video | The drop zone for the videos |
| Videos & Output | The video list, the progress, and the output video |
| Incident Review | The incident list |
| Real-Time Camera | The live webcam test |

The operator clicks a tab to open it.

## 3. The video upload

1. Open the Upload tab.

2. Do one of these actions:

   - Drag a video file and drop it on the drop zone.
   - Click the drop zone and select a video file.

The supported file types are:

- mp4
- mov
- avi
- mkv
- webm
- m4v

The upload starts immediately. The page shows the upload status below the drop zone. The page shows an upload progress bar during the upload.

After the upload, the page opens the Videos & Output tab. The new video has the status "pending". The processing starts automatically.

### 3.1 The upload problems

The upload fails when:

- The file type is not in the supported list.
- The file is larger than the MAX_UPLOAD_MB value.
- The file is empty.

The page shows the error message.

## 4. The video list

The Videos & Output tab shows one row per video.

### 4.1 The status badges

The video status has four values:

| Status | Meaning |
| --- | --- |
| pending | The video waits for processing |
| processing | The system processes the video now |
| completed | The processing finished |
| failed | The processing failed |

The page shows the progress bar for the videos in processing. The progress bar shows the processed frame count and the total frame count. The progress bar updates in real time over the WebSocket. The operator does not refresh the page.

### 4.2 The action buttons

The buttons depend on the status:

| Status | Button | Result |
| --- | --- | --- |
| completed | Output | Open a modal that plays the annotated output video |
| any status | Re-run | Delete the incidents and process the video again |

A failed video shows the Failed badge. The terminal log shows the error message of a failed video.

## 5. The incident list

The Incident Review tab shows one card per incident.

Each card has:

- The snapshot image.
- The review status badge.
- The confidence score.
- The video file name.
- The event time.
- The reason text.
- The Confirm and False alarm buttons.

### 5.1 The filters

The filter pills are above the list:

| Filter | Result |
| --- | --- |
| All | Show all the incidents |
| Pending | Show only the incidents with the pending status |
| Confirmed | Show only the confirmed incidents |
| False alarm | Show only the false alarm incidents |

The operator clicks a filter pill to use it.

## 6. The incident review

1. Click an incident card.

2. The detail modal opens.

The modal shows:

- The evidence clip. The clip plays in the browser.
- The reason text.
- The review buttons.
- A download link for the clip.

### 6.1 The evidence clip

The evidence clip is a short video around the event time. The clip starts before the event and ends after the event. The operator plays the clip to check the event. The operator can save the clip with the download link.

### 6.2 The review buttons

| Button | Result |
| --- | --- |
| Confirm | Set the status to confirmed |
| False alarm | Set the status to false_alarm |

The page updates the status after the click.

## 7. The demo flow

This flow works well for a live demo:

1. Prepare two or three test videos in advance.
2. Start the server.
3. Upload the first video.
4. Show the progress bar on the Videos & Output tab.
5. Open the Incident Review tab.
6. Click an incident card.
7. Play the evidence clip in the modal.
8. Read the reason text that explains the event.
9. Mark the incident as confirmed.
10. Show a false alarm example and mark it as false_alarm.

The Real-Time Camera tab gives a second demo option. The operator starts the webcam and drops an object to show a live detection.

The system does not need the internet during the demo, after the model download.

### 7.1 The backup plan

A live demo can fail. The team keeps a backup plan:

- Process the videos before the demo.
- Save the screenshots of the results.
- Prepare a backup video of the processing.
- If the live run fails, show the saved results.

## 8. The good test video

A test video that gives a good demo result has these properties:

- A person drops an object on the ground.
- The person walks away from the object.
- The object stays in one place.
- The video has good light.
- The camera looks down at the scene from a high angle.

A person who only walks near existing litter gives no incident. This is correct behavior.
