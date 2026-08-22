# Test videos — how to build the evaluation set

This folder holds the labelled clips used to measure the **complete littering
event detector** (detection → tracking → rule engine → incidents). This is the
system-level evaluation the report calls for in sections 7.5–7.6: the detector
is already measured on images, but end-to-end accuracy, precision, recall, F1,
false-alarm rate and detection delay need a labelled *video* set — this one.

Per the project's data decision, **no videos are recorded or curated by the
team.** Use publicly available, license-clear footage:

- Pexels / Pixabay stock clips (license-clear),
- public surveillance / demo compilations where permitted,
- any public footage of people leaving objects behind.

Cite every clip's source in the report appendix; never claim footage as your own.

## How many, and what mix

Aim for **15–30 short clips (5–20 s each)**, roughly balanced between positive
(an event should fire) and negative (no event should fire). A balanced set is
what makes precision and the false-alarm rate meaningful.

| Scenario | Label | `expected_incidents` | Why it matters |
|---|---|---|---|
| Person drops an object and walks away | `drop+leave` | `1` | The core true positive |
| Person walks past existing litter | `walk-past` | `0` | Must not fire on pre-existing waste |
| Person carries an object and keeps it | `carry+keep` | `0` | Must not fire when nothing is dropped |
| Several people, nobody litters | `crowd` | `0` | False-alarm stress test |
| People present, no waste at all | `person-only` | `0` | Sanity check |

Get several of each. The negatives are what expose false alarms, so do not
skip them.

## Naming

Name files by scenario so the set is easy to scan, e.g. `drop_and_leave_01.mp4`,
`walk_past_litter_02.mp4`, `carry_and_keep_01.mp4`. Only these extensions are
picked up: `.mp4 .mov .avi .mkv .webm .m4v`.

## Labelling

1. Copy `../ground_truth.csv.example` to `../ground_truth.csv`.
2. Add one row per clip. Set `expected_incidents` to `1` or `0`.
3. For `drop+leave` clips, note `event_time_s` (the second the drop happens) so
   the harness can report **detection delay**. Leave it blank otherwise.

## Run the evaluation

Point the harness at the team's fine-tuned model **and** its class name — both
are required, because the committed default is still the stock COCO model:

```bash
python scripts/evaluate.py --model ml/weights/best.pt --waste-classes trash
```

It prints a per-video table and the metrics, and writes:

- `data/eval_report.md` — a paste-ready table + metrics for the report,
- `data/eval_results.json` — the machine-readable results.

> Note: `sample_synthetic.mp4` (from `scripts/make_sample_video.py`) contains
> only coloured rectangles, so the model detects nothing in it (0 incidents by
> design). It checks the pipeline runs; it is **not** part of the accuracy set.
