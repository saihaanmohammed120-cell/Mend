"""Exercise real CLI exit codes and artifact boundaries using synthetic evidence."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tests.test_check_history import CONTRACT, KEY, observation


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/check_history.py"


class CheckHistoryCliTests(unittest.TestCase):
    def run_gate(self, root, samples, output="result.json"):
        (root / "key.bin").write_bytes(KEY)
        (root / "contract.json").write_text(json.dumps(CONTRACT), encoding="utf-8")
        (root / "expected.json").write_text(json.dumps([s[0] for s in samples]), encoding="utf-8")
        args = [sys.executable, str(SCRIPT), "--contract", str(root / "contract.json"),
                "--expected-runs", str(root / "expected.json"), "--key-file", str(root / "key.bin"),
                "--output", str(root / output)]
        for index, (_, envelope) in enumerate(samples):
            path = root / f"report-{index}.json"
            path.write_text(json.dumps(envelope), encoding="utf-8")
            args.extend(["--report", str(path)])
        return subprocess.run(args, capture_output=True, text=True, timeout=10), args

    def test_pass_fail_inconclusive_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, samples, code, gate in [
                ("pass.json", [observation(1), observation(2)], 0, "passed"),
                ("flaky.json", [observation(1), observation(2, ("failed", "passed"))], 1, "blocked"),
                ("unknown.json", [observation(1)], 2, "inconclusive"),
            ]:
                with self.subTest(gate=gate):
                    run, args = self.run_gate(root, samples, name)
                    self.assertEqual(run.returncode, code, run.stderr)
                    data = (root / name).read_bytes()
                    self.assertEqual(json.loads(data)["gate_status"], gate)
                    self.assertNotIn(KEY.decode(), run.stdout + run.stderr + data.decode())
                    again = subprocess.run(args, capture_output=True, text=True, timeout=10)
                    self.assertEqual(again.returncode, 2)
                    self.assertEqual((root / name).read_bytes(), data)

    def test_tampering_duplicate_json_and_wrong_key_produce_no_artifact(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run, args = self.run_gate(root, [observation(1), observation(2)])
            self.assertEqual(run.returncode, 0)
            output_index = args.index("--output") + 1
            args[output_index] = str(root / "rejected.json")
            for mutation in [lambda: (root / "key.bin").write_bytes(b"bad"),
                             lambda: (root / "report-0.json").write_text('{"report":{},"report":{}}')]:
                (root / "key.bin").write_bytes(KEY)
                mutation()
                bad = subprocess.run(args, capture_output=True, text=True, timeout=10)
                self.assertEqual(bad.returncode, 2)
                self.assertFalse((root / "rejected.json").exists())


if __name__ == "__main__":
    unittest.main()
