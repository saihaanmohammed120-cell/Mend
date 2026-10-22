#!/usr/bin/env python3
"""Capture the curated CSV example with real local Python unittest runs.

This runs known repository files in temporary directories. It is neither a
security sandbox nor evidence of Nebius execution, inference, or signing.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
GUARD = b"    if not rows:\n        return [], 0\n"
CHECK_IDS = frozenset({
    "test_empty_input", "test_duplicate_rows", "test_missing_values", "test_field_order",
})
TIMEOUT_SECONDS = 10
RUNNER = r'''
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path.cwd()))

class RecordingResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.recorded = []

    def record(self, test, status):
        self.recorded.append({"check_id": test.id().rsplit(".", 1)[-1], "status": status})

    def addSuccess(self, test):
        super().addSuccess(test)
        self.record(test, "passed")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.record(test, "failed")

    def addError(self, test, err):
        super().addError(test, err)
        self.record(test, "failed")

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.record(test, "skipped")

suite = unittest.defaultTestLoader.loadTestsFromName("test_csv_tools")
result = unittest.TextTestRunner(verbosity=2, resultclass=RecordingResult).run(suite)
checks = {
    "total": result.testsRun,
    "passed": sum(item["status"] == "passed" for item in result.recorded),
    "failed": len(result.failures) + len(result.errors),
    "skipped": len(result.skipped),
    "results": result.recorded,
}
Path("checks.json").write_text(json.dumps(checks), encoding="utf-8")
sys.exit(0 if result.wasSuccessful() else 1)
'''


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def run_checks(source, tests):
    with tempfile.TemporaryDirectory(prefix="mend-captured-local-") as temporary:
        directory = Path(temporary)
        (directory / "csv_tools.py").write_bytes(source)
        (directory / "test_csv_tools.py").write_bytes(tests)
        started_at = utc_now()
        completed = subprocess.run(
            [sys.executable, "-I", "-B", "-c", RUNNER],
            cwd=directory,
            # No inherited application credentials, Python paths or user site.
            env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
            capture_output=True, text=True, encoding="utf-8", errors="strict",
            timeout=TIMEOUT_SECONDS, check=False,
        )
        finished_at = utc_now()
        checks = json.loads((directory / "checks.json").read_text(encoding="utf-8"))
        return {
            "started_at": started_at,
            "finished_at": finished_at,
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "checks": checks,
        }


def timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Capture timestamps must contain the UTC Z suffix")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_run(run, before):
    if not isinstance(run, dict):
        raise ValueError("Missing captured run")
    if timestamp(run["started_at"]) > timestamp(run["finished_at"]):
        raise ValueError("Run timestamps are out of order")
    if type(run["returncode"]) is not int or run["returncode"] != (1 if before else 0):
        raise ValueError("Unexpected subprocess exit status")
    if not isinstance(run["stdout"], str) or not isinstance(run["stderr"], str):
        raise ValueError("Missing literal process streams")
    checks = run["checks"]
    expected_counts = {"total": 4, "passed": 3 if before else 4, "failed": 1 if before else 0, "skipped": 0}
    for key, expected in expected_counts.items():
        if type(checks[key]) is not int or checks[key] != expected:
            raise ValueError("Unexpected captured check counts")
    results = checks["results"]
    if not isinstance(results, list) or len(results) != len(CHECK_IDS):
        raise ValueError("Missing named check outcomes")
    if {item["check_id"] for item in results} != CHECK_IDS:
        raise ValueError("Captured check names differ from the curated suite")
    for item in results:
        expected = "failed" if before and item["check_id"] == "test_empty_input" else "passed"
        if item["status"] != expected:
            raise ValueError("Unexpected named check outcome")
        result_word = "ERROR" if expected == "failed" else "ok"
        pattern = rf"^{re.escape(item['check_id'])} \([^\n]+\) \.\.\. {result_word}$"
        if re.search(pattern, run["stderr"], flags=re.MULTILINE) is None:
            raise ValueError("Named outcome is absent from captured unittest output")
    if "Ran 4 tests" not in run["stderr"]:
        raise ValueError("Missing unittest summary")
    if before:
        if "IndexError: list index out of range" not in run["stderr"] or not run["stderr"].endswith("FAILED (errors=1)\n"):
            raise ValueError("Expected empty-input error was not captured")
    elif not run["stderr"].endswith("OK\n"):
        raise ValueError("After run did not finish successfully")


def valid_capture(capture, hashes, before_source, after_source):
    try:
        if type(capture["schema_version"]) is not int or capture["schema_version"] != 1:
            return False
        if capture["source"] != "captured_local" or capture["live_verification"] is not False:
            return False
        if any(capture[key] != value for key, value in hashes.items()):
            return False
        if capture["before_source"] != before_source or capture["after_source"] != after_source:
            return False
        validate_run(capture["before"], before=True)
        validate_run(capture["after"], before=False)
        if timestamp(capture["before"]["finished_at"]) > timestamp(capture["after"]["started_at"]):
            return False
        return timestamp(capture["captured_at"]) >= timestamp(capture["after"]["finished_at"])
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reuse", action="store_true", help="Reuse only matching, valid local captures")
    arguments = parser.parse_args()

    source = (ROOT / "example" / "csv_tools.py").read_bytes()
    tests = (ROOT / "example" / "test_csv_tools.py").read_bytes()
    if source.count(GUARD) != 1:
        raise ValueError("Expected the exact curated two-line empty-input guard once")
    before = source.replace(GUARD, b"", 1)
    before_source = before.decode("utf-8")
    after_source = source.decode("utf-8")
    hashes = {
        "source_sha256": digest(source),
        "tests_sha256": digest(tests),
        "capture_script_sha256": digest(Path(__file__).read_bytes()),
    }
    output = arguments.output.resolve()
    if arguments.reuse and output.is_file():
        try:
            capture = json.loads(output.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            capture = None
        if valid_capture(capture, hashes, before_source, after_source):
            print(f"Reused captured local example: {output}")
            return

    capture = {
        "schema_version": 1,
        "source": "captured_local",
        "live_verification": False,
        **hashes,
        "before_source": before_source,
        "after_source": after_source,
        "before": run_checks(before, tests),
        "after": run_checks(source, tests),
        "captured_at": utc_now(),
    }
    if not valid_capture(capture, hashes, before_source, after_source):
        raise ValueError("Actual runs did not produce the required before-failure / after-pass evidence")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as temporary:
            temporary_name = temporary.name
            json.dump(capture, temporary, indent=2, ensure_ascii=False)
            temporary.write("\n")
        os.replace(temporary_name, output)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    print(f"Captured local example: before 3 passed / 1 failed; after 4 passed / 0 failed; SHA-256 {hashes['source_sha256']}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"Local example capture failed: {error}", file=sys.stderr)
        sys.exit(1)
