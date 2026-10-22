import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "capture-example.py"


class CapturedExampleChecks(unittest.TestCase):
    def test_capture_records_actual_before_failure_after_pass_and_exact_source(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "--output", str(output)],
                capture_output=True, text=True, timeout=20,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            capture = json.loads(output.read_text())
            self.assertEqual(capture["source"], "captured_local")
            self.assertIs(capture["live_verification"], False)
            source = (ROOT / "example" / "csv_tools.py").read_bytes()
            self.assertEqual(capture["after_source"].encode(), source)
            self.assertEqual(capture["source_sha256"], hashlib.sha256(source).hexdigest())
            self.assertEqual(capture["before"]["returncode"], 1)
            self.assertIn("IndexError", capture["before"]["stderr"])
            self.assertEqual(capture["before"]["checks"]["passed"], 3)
            self.assertEqual(capture["before"]["checks"]["failed"], 1)
            self.assertIn({"check_id": "test_empty_input", "status": "failed"}, capture["before"]["checks"]["results"])
            self.assertEqual(capture["after"]["returncode"], 0)
            self.assertEqual(capture["after"]["checks"]["passed"], 4)
            self.assertEqual(capture["after"]["checks"]["failed"], 0)
            self.assertIn("Ran 4 tests", capture["after"]["stderr"])
            self.assertTrue(capture["after"]["stderr"].endswith("OK\n"))

    def test_reuse_preserves_valid_capture_and_recaptures_tampered_outcomes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            command = [sys.executable, str(SCRIPT), "--output", str(output)]
            subprocess.run(command, check=True, capture_output=True, timeout=20)
            original = output.read_bytes()
            subprocess.run([*command, "--reuse"], check=True, capture_output=True, timeout=20)
            self.assertEqual(output.read_bytes(), original)
            tampered = json.loads(original)
            tampered["after"]["checks"]["results"][0]["status"] = "failed"
            output.write_text(json.dumps(tampered))
            subprocess.run([*command, "--reuse"], check=True, capture_output=True, timeout=20)
            refreshed = json.loads(output.read_text())
            self.assertTrue(all(check["status"] == "passed" for check in refreshed["after"]["checks"]["results"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
