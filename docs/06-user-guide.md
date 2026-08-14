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

The dashboard has three tabs:

| Tab | Content |
| --- | --- |
| Upload | The drop zone for the videos |
| Videos | The video list and the progress |
| Incidents | The incident list |

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

The upload starts immediately. The page shows the upload status below the drop zone.

After the upload, the page opens the Videos tab. The new video has the status "pending". The processing starts automatically.

### 3.1 The upload problems

The upload fails when:

- The file type is not in the supported list.
- The file is larger than the MAX_UPLOAD_MB value.
- The file is empty.

The page shows the error message.

## 4. The video list

The Videos tab shows one row per video.

### 4.1 The status badges

The video status has four values:

| Status | Meaning |
| --- | --- |
| pending | The video waits for processing |
| processing | The system processes the video now |
| completed | The processing finished |
| failed | The processing failed |

The page shows the progress bar for the videos in processing. The progress bar shows the processed frame count and the total frame count.

### 4.2 The action buttons

The buttons depend on the status:

| Status | Button | Result |
| --- | --- | --- |
| pending | Process | Queue the video again |
| completed | View | Open the incidents of the video |
| completed | Reprocess | Delete the incidents and process again |
| failed | Retry | Queue the video again |

The failed row shows the error message under the status badge.

## 5. The incident list

The Incidents tab shows one card per incident.

Each card has:

- The snapshot image.
- The incident number.
- The event time.
- The review status badge.
- The video file name.
- The confidence score.
- The reason text.

### 5.1 The filters

The filters are above the list:

| Filter | Result |
| --- | --- |
| All | Show all the incidents |
| Pending | Show only the incidents with the pending status |
| Confirmed | Show only the confirmed incidents |
| False alarm | Show only the false alarm incidents |

The operator clicks a filter to use it.

When the operator clicks "View" on a video row, the page shows only the incidents of that video. A chip above the list shows the video number. The operator clicks the chip to remove the filter.

## 6. The incident review

1. Click an incident card.

2. The detail modal opens.

The modal shows:

- The snapshot with the detected boxes.
- The source video.
- The evidence clip.
- The metadata table.
- The review buttons.

### 6.1 The metadata

The metadata table shows:

| Item | Content |
| --- | --- |
| Video | The video number and the file name |
| Event time | The event time in the video |
| Confidence | The confidence score in percent |
| Waste class | The detected class name |
| Track ID | The object identity number |
| Reason | The text that explains the event |
| Review status | The current status |
| Recorded | The creation time |

### 6.2 The jump button

The "Jump to event time" button moves the source video to the event time. This lets the operator check the event in the source footage.

### 6.3 The review buttons

| Button | Result |
| --- | --- |
| Confirm | Set the status to confirmed |
| False alarm | Set the status to false_alarm |
| Mark pending | Set the status to pending |

The page updates the status after the click.

## 7. The demo flow

This flow works well for a live demo:

1. Prepare two or three test videos in advance.
2. Start the server.
3. Upload the first video.
4. Show the progress bar on the Videos tab.
5. Open the Incidents tab.
6. Click an incident.
7. Show the snapshot and the clip.
8. Use the jump button to show the event in the source video.
9. Mark the incident as confirmed.
10. Show a false alarm example and mark it as false_alarm.

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
