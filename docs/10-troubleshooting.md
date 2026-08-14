# 10 - Troubleshooting

## 1. How to use this document

Each row in the tables has three parts:

| Part | Content |
| --- | --- |
| Problem | What the operator sees |
| Cause | Why the problem happens |
| Fix | What the operator does |

## 2. The install problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The pip command is not found | The virtual environment is not active | Activate the virtual environment. See the file 05-installation.md. |
| The install takes a long time | PyTorch is large | Install the CPU version of PyTorch first. See the file 05-installation.md, section 2.1. |
| The pip install fails with a compile error | The Python version is not supported | Use Python 3.10, 3.11, or 3.12. |
| The dotenv module is not found | The dependencies are not installed | Run the command: pip install -r requirements.txt |

## 3. The start problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The run.py command gives an import error | The command runs from another folder | Go to the project folder first. |
| The port is already in use | Another program uses the port | Change the PORT value in the .env file. |
| The dashboard shows a blank page | The frontend folder is missing or empty | Create the frontend folder and restart the server. |
| The server starts, but the health check fails | The server did not start correctly | Read the terminal log. Fix the first error. |

## 4. The model problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The first job fails with a model download error | No internet connection | Connect to the internet and retry. Or copy the model file to the project folder. |
| The model loads slowly | The model file is large | Use the model yolov8n.pt for the demo. |
| The custom model ignores some waste classes | The WASTE_CLASSES names do not match the model | Check the model class names. Set the WASTE_CLASSES names exactly. |
| The model needs a GPU | The DEVICE value is wrong | Set the DEVICE value to cpu for a computer without a GPU. |

## 5. The upload problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The upload fails with error 400 | The file type is not supported | Convert the video to mp4. |
| The upload fails with error 413 | The file is larger than the size limit | Increase the MAX_UPLOAD_MB value. Or shorten the video. |
| The upload fails, and the video row disappears | The upload failed during the write | Check the disk space. Check the file format. |

## 6. The processing problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The video stays in the "pending" status | The worker thread is not running | Restart the server. The worker starts at the server start. |
| The video shows the "failed" status | The processing raised an error | Read the error in the video row. Read the terminal log. |
| The video shows the "failed" status with an OpenCV error | The video file is damaged | Use another video file. |
| The processing is slow | The model or the device is slow | Set FRAME_STEP to 3. Use the model yolov8n. Use a GPU. |
| The processing stops at MAX_INCIDENTS | The video has many incidents | Increase the MAX_INCIDENTS value. Or do nothing, the limit is a safety. |

## 7. The detection problems

| Problem | Cause | Fix |
| --- | --- | --- |
| No incidents on the test video | The rules are strict | Check the video scene. The person must drop an object and walk away. Tune the rule settings in the .env file. |
| Too many false alarms | The rules are loose | Increase the STATIONARY_FRAMES value. Increase the LEAVE_DISTANCE value. |
| The object is not detected | The object is too small or too dark | Lower the CONF_THRESHOLD value. Use a better video. |
| The waste classes are not detected | The default classes are bottle and cup only | Set the WASTE_CLASSES value. Or fine-tune a custom model on TACO. |
| Pre-existing litter gives an event | The object appeared after the first frames | Increase the IGNORE_FIRST_FRAMES value. |

## 8. The dashboard problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The progress bar does not move | The video is small and finishes fast | Watch the status badge. It changes to "completed". |
| The incident list is empty | No incident was detected | Check the processing status. Check the video scene. |
| The snapshot is missing | The snapshot save failed | Check the storage folder permissions. |
| The clip does not play in the browser | The clip uses the mp4v codec | Use the download link. Play the clip in VLC. |
| The source video does not play | The browser does not support the codec | Convert the source video to H.264 mp4. |

## 9. The database problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The error "database is locked" | Two writes happen at the same time | This is rare with the WAL mode. Wait and retry. Delete the database file and restart if it stays. |
| The old incidents return after a reprocess | The reprocess did not finish | Wait until the status shows "completed". The old incidents are deleted at the start of the reprocess. |
| The storage folder grows large | The clips and the previews stay on disk | Delete the files in the storage folder manually. |

## 10. The evaluation problems

| Problem | Cause | Fix |
| --- | --- | --- |
| The evaluate script finds no videos | The folder is empty | Put the videos in the data/test_videos folder. |
| The ground truth comparison is empty | The ground truth file has no match | Check the file names in the CSV file. The names must match the video names. |
| The evaluate script fails at import | The script runs from another folder | Run the script from the project folder. |

## 11. Where to look for help

The log messages give the first information. The relevant sources are:

- The terminal log.
- The error field in the video row.
- The eval_results.json file.
- The README.md file.
- The files in the docs folder.
