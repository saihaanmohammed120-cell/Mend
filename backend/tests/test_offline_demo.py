"""Exercise the documented demo command and its no-overwrite boundary."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/verify_offline_demo.py"


class OfflineDemoTests(unittest.TestCase):
    def test_actual_cli_chain_and_existing_destination_refusal(self):
        with tempfile.TemporaryDirectory(prefix="mend-demo-check-") as temporary:
            destination = Path(temporary) / "demo"
            command = [sys.executable, str(SCRIPT), "--output-dir", str(destination)]
            result = subprocess.run(command, capture_output=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
            summary = json.loads((destination / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "passed")
            self.assertFalse(summary["live_verification"])
            self.assertEqual(len(summary["checks"]), 5)
            self.assertFalse((destination / "must-not-exist.json").exists())
            def snapshot():
                return {path.relative_to(destination).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                        for path in destination.rglob("*") if path.is_file()}
            before = snapshot()
            refused = subprocess.run(command, capture_output=True, timeout=10)
            self.assertEqual(refused.returncode, 1)
            self.assertEqual(before, snapshot())


if __name__ == "__main__":
    unittest.main()
