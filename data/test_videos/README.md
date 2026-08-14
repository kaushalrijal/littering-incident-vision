# Test videos

Place the test videos for the demo and evaluation in this folder
(e.g. `test_01.mp4`, `test_02.mp4`, ...).

Per the project's data decision, **no videos are recorded or curated by the
team** — use publicly available footage (see the project plan, section
"Test-Video Strategy"):

- YouTube / surveillance compilations (where permitted),
- Pexels / Pixabay stock clips (license-clear),
- any public demo footage of people leaving objects behind.

Recommended mix:

| Type | Example | Expected |
|---|---|---|
| Person drops an object and walks away | littering clip | 1 incident |
| Person walks past existing litter | street scene | 0 incidents |
| Person carries an object but keeps it | pedestrian clip | 0 incidents |
| Multiple people, no dropping | crowd scene | 0 incidents |

Fill `../ground_truth.csv` (copy of `ground_truth.csv.example`) with the
expected outcome per video, then run:

```bash
python scripts/evaluate.py
```

Remember to cite every video's source in the report appendix and never
claim the footage as your own.
