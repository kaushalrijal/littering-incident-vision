"""
Unit tests for startup recovery of interrupted video processing
(backend.app.db.reconcile_interrupted_videos).

A crash or a server restart can leave a video row stuck at status='processing'.
The worker skips 'processing' rows and the /process endpoint returns 409 for
them, so without recovery such a row is stuck forever. The reconciliation step
runs at startup and resets these orphans to 'failed' so they can be re-run.

These tests use a throwaway SQLite database and need no torch / ultralytics.
Run from the project root either way:
    python -m pytest tests/test_reconcile.py -v
    python tests/test_reconcile.py            # built-in runner (no pytest needed)
"""
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import db  # noqa: E402


@contextmanager
def temp_db():
    """Point the data-access layer at a throwaway database for one test."""
    original = db.settings.database_path
    with tempfile.TemporaryDirectory() as tmp:
        db.settings.database_path = Path(tmp) / "test_litter.db"
        try:
            db.init_db()
            yield
        finally:
            db.settings.database_path = original


def _new_video(status, error=None):
    """Create a video row and force it to the given status."""
    vid = db.create_video(filename=f"{status}.mp4", file_path=f"videos/{status}.mp4")
    if status != "pending" or error is not None:
        db.update_video(vid, status=status, error=error)
    return vid


# ----------------------------------------------------------------------
def test_reconcile_resets_only_processing_rows():
    with temp_db():
        pending = _new_video("pending")
        proc1 = _new_video("processing")
        proc2 = _new_video("processing")
        completed = _new_video("completed")
        failed = _new_video("failed", error="original failure")

        reset = db.reconcile_interrupted_videos()

        # Exactly the two interrupted rows are reported.
        assert set(reset) == {proc1, proc2}, reset

        # The orphans are now 'failed' with the recovery message.
        for vid in (proc1, proc2):
            row = db.get_video(vid)
            assert row["status"] == "failed"
            assert "interrupted" in (row["error"] or "").lower()

        # Every other status is left untouched.
        assert db.get_video(pending)["status"] == "pending"
        assert db.get_video(completed)["status"] == "completed"
        failed_row = db.get_video(failed)
        assert failed_row["status"] == "failed"
        assert failed_row["error"] == "original failure"  # not overwritten


def test_reconcile_no_processing_returns_empty():
    with temp_db():
        _new_video("pending")
        _new_video("completed")
        assert db.reconcile_interrupted_videos() == []


def test_reconcile_empty_database_returns_empty():
    with temp_db():
        assert db.reconcile_interrupted_videos() == []


def test_reconcile_is_idempotent():
    with temp_db():
        proc = _new_video("processing")
        assert db.reconcile_interrupted_videos() == [proc]
        # A second startup finds nothing still processing.
        assert db.reconcile_interrupted_videos() == []
        assert db.get_video(proc)["status"] == "failed"


# ----------------------------------------------------------------------
if __name__ == "__main__":
    tests = sorted(k for k, v in globals().items() if k.startswith("test_") and callable(v))
    passed = failed = 0
    for name in tests:
        try:
            globals()[name]()
            print(f"PASS  {name}")
            passed += 1
        except AssertionError as exc:
            print(f"FAIL  {name}: {exc}")
            failed += 1
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR {name}: {type(exc).__name__}: {exc}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
