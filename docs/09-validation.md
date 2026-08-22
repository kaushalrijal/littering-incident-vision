# 09 - Validation

## 1. The purpose of the validation

The validation measures how well the system works. The team uses the validation results in the report. The project proposal defines four metrics:

- Detection accuracy.
- False alarm rate.
- Processing speed.
- Detection delay.

## 2. The evaluation script

The script scripts/evaluate.py runs the pipeline over the test videos. The script does not write to the main database.

### 2.1 The run

1. Put the labelled test videos in the data/test_videos folder.

2. Go to the project folder.

3. Run the script. Name the fine-tuned model and its waste class. The committed default is the stock COCO model, so you must name both.

```bash
python scripts/evaluate.py --model ml/weights/best.pt --waste-classes trash
```

The script measures the complete event detector, not the detection model alone. The script prints a table. The table has one row per video:

| Column | Content |
| --- | --- |
| video | The file name |
| frames | The processed frame count |
| time_s | The processing time in seconds |
| fps | The processing speed |
| incidents | The incident count |

The script writes two reports:

| File | Content |
| --- | --- |
| data/eval_results.json | The machine-readable results |
| data/eval_report.md | A paste-ready table and the metrics for the report |

### 2.2 The options

| Option | Default | Task |
| --- | --- | --- |
| --videos | data/test_videos | The test video folder |
| --ground-truth | data/ground_truth.csv | The ground truth file |
| --model | none | Override the model path |
| --waste-classes | none | Override the waste class names |
| --device | none | Override the device |
| --conf | none | Override the confidence threshold |
| --no-output | off | Skip the annotated preview videos for speed |
| --out | data/eval_results.json | The JSON report file |
| --report | data/eval_report.md | The Markdown report file |

Example on a GPU:

```bash
python scripts/evaluate.py --model ml/weights/best.pt --waste-classes trash --device 0
```

## 3. The ground truth

The ground truth file states the expected result for each video. The team writes this file by hand. This is evaluation labeling, not data curation.

### 3.1 The format

1. Copy the example file.

```bash
cp data/ground_truth.csv.example data/ground_truth.csv
```

2. Edit the file. The format is:

```text
video,expected_incidents,scenario,event_time_s,notes
drop_and_leave_01.mp4,1,drop+leave,4.5,person drops a bottle
walk_past_litter_01.mp4,0,walk-past,,litter already present
```

The expected_incidents value is 1 when the video contains a littering event. The value is 0 when the video has no event. The other columns are optional:

| Column | Task |
| --- | --- |
| scenario | A short label for the report table |
| event_time_s | The second when the drop happens. This value enables the detection delay metric. |
| notes | Free text for the team. The script ignores this column. |

The column order is free. The script matches the columns by the header name. Lines that start with the # sign are ignored.

### 3.2 The file name match

The video names in the ground truth file must match the file names in the test folder. The names are case sensitive.

## 4. The metrics

When the ground truth file exists, the script compares the results. The comparison uses four counts:

| Count | Meaning |
| --- | --- |
| TP | True positive. An event was expected and detected. |
| FP | False positive. No event was expected, but one was detected. |
| FN | False negative. An event was expected, but none was detected. |
| TN | True negative. No event was expected and none was detected. |

The script calculates:

| Metric | Formula |
| --- | --- |
| Accuracy | (TP + TN) / all counts |
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| Specificity | TN / (TN + FP) |
| F1 | 2 * precision * recall / (precision + recall) |
| False alarm rate | FP / (FP + TN) |
| Miss rate | FN / (FN + TP) |

The false alarm rate is the fraction of the clean videos that fired an event in error. The script also reports the detection delay when the ground truth gives the event_time_s value. See section 6.

## 5. The suggested targets

The report needs quantitative results. The team can use these initial targets:

| Metric | Target |
| --- | --- |
| Detection accuracy | More than 80 percent |
| False alarm rate | Less than 20 percent |
| Detection delay | Less than 5 seconds |
| Processing speed | More than 15 frames per second |

The targets depend on the test videos. The team records the actual values and explains the differences.

## 6. The detection delay

The detection delay is the time from the event to the alarm. The delay has two parts:

- The processing time of the frames.
- The rule check time.

The team can measure the delay with a stopwatch on the demo videos. The script can also measure the delay. For each true-positive video that has an event_time_s value in the ground truth, the script subtracts the event time from the first incident time. The report gives the mean and the median delay.

## 7. The processing speed

The processing speed depends on:

- The model size. The model yolov8n is faster than yolov8s.
- The device. A GPU is faster than the CPU.
- The FRAME_STEP value. A higher value is faster.
- The image size.

The pipeline reports the speed in the stats. The dashboard shows the value in the video list.

## 8. The report evidence

The team collects these items for the report:

- The evaluation table.
- The screenshot of the pipeline output.
- The snapshots of the incidents.
- The clips of the incidents.
- The training curves, if a custom model was trained.

The data/eval_report.md file gives a paste-ready table and the metrics. The data/eval_results.json file gives the exact numbers.

## 9. The limitation of the small test set

The public littering-action videos are rare. The test set can be small. The team must state this in the report. A small test set gives a limited proof. The metrics are valid only for the used videos.

The team can also report the detection quality on the TACO test split. This is a separate image-level metric. The team uses the Ultralytics validation command for this.

## 10. The fine-tuning validation

The team can validate a custom model in two ways:

1. The image-level validation on the TACO split. The metric is mAP.

2. The event-level validation with the test videos. The metrics are the table in section 4.

The suggested mAP target for the TACO split: 0.55 or more.
