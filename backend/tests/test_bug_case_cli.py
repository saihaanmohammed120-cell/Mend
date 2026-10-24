"""Actual CLI boundary, using inert input that must never be executed."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_bug_case.py"


class BugCaseCliTests(unittest.TestCase):
    def test_escaped_source_at_combined_cap_prepares_through_both_cli_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = {'kind': 'mend_bug_intake', 'schema_version': 1, 'file_path': 'helper.py',
                      'original_source': '#' + '\x01' * 199998, 'reported_error': None,
                      'expected_behavior': 'Return one',
                      'evidence': {'investigation': 'not_run', 'execution': 'not_run', 'regression': 'not_generated'}}
            request = {'intake': intake, 'protected_test_source': '#',
                       'required_check_ids': ['test_regression.Checks.test_value'],
                       'target_check_id': 'test_regression.Checks.test_value'}
            checks = root / 'checks.py'
            checks.write_text('#')
            for mode in ('request', 'intake'):
                source, output = root / f'{mode}.json', root / f'{mode}-prepared.json'
                source.write_text(json.dumps(request if mode == 'request' else intake), encoding='utf-8')
                self.assertGreater(source.stat().st_size, 1048576)
                args = [sys.executable, str(SCRIPT), '--' + mode, str(source), '--output', str(output)]
                if mode == 'intake':
                    args += ['--checks', str(checks), '--check', request['target_check_id'],
                             '--target-check', request['target_check_id']]
                run = subprocess.run(args, capture_output=True, text=True, timeout=10)
                self.assertEqual(run.returncode, 0, run.stderr)
                prepared = json.loads(output.read_bytes())
                self.assertEqual(prepared['intake'], intake)
                self.assertFalse(prepared['execution_enabled'])

    def test_browser_review_request_prepares_exact_sources_without_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = {"kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py",
                      "original_source": "# é 😀\r\nraise RuntimeError('Must never run')\r\n",
                      "reported_error": "failure", "expected_behavior": "Return one",
                      "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}}
            request = {"intake": intake, "protected_test_source": "raise RuntimeError('Never run checks')\r\n",
                       "required_check_ids": ["test_regression.Checks.test_value"],
                       "target_check_id": "test_regression.Checks.test_value"}
            source, output = root / "request.json", root / "review.json"
            source.write_bytes(json.dumps(request, ensure_ascii=False).encode("utf-8"))
            args = [sys.executable, str(SCRIPT), "--request", str(source), "--output", str(output)]
            run = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, 0, run.stderr)
            prepared = json.loads(output.read_bytes())
            self.assertEqual(prepared["intake"], intake)
            self.assertEqual(prepared["contract"]["protected_files"]["test_regression.py"], request["protected_test_source"])
            self.assertFalse(prepared["execution_enabled"])
            self.assertEqual(prepared["approval_status"], "not_approved")
            self.assertFalse(prepared["live_verification"])
            frozen = output.read_bytes()
            self.assertEqual(subprocess.run(args, capture_output=True, timeout=10).returncode, 2)
            self.assertEqual(output.read_bytes(), frozen)

    def test_request_rejects_extra_duplicate_or_mixed_inputs_without_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, output = root / "request.json", root / "review.json"
            args = [sys.executable, str(SCRIPT), "--request", str(source), "--output", str(output)]
            for content in ['{"intake":{},"intake":{}}', '{"extra":true}', '[]', '{"intake":']:
                source.write_text(content, encoding="utf-8")
                self.assertEqual(subprocess.run(args, capture_output=True, timeout=10).returncode, 2)
                self.assertFalse(output.exists())
            source.write_text("{}", encoding="utf-8")
            run = subprocess.run(args + ["--check", "test_regression.Checks.test_value"], capture_output=True, timeout=10)
            self.assertEqual(run.returncode, 2)
            self.assertFalse(output.exists())

    def test_cli_preserves_source_and_refuses_existing_or_duplicate_key_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = {"kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py",
                      "original_source": "raise RuntimeError('Never execute this during preparation')\n",
                      "reported_error": "failure", "expected_behavior": "Return one",
                      "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}}
            source, checks, output = root / "intake.json", root / "checks.py", root / "review.json"
            source.write_text(json.dumps(intake), encoding="utf-8")
            checks.write_text("raise RuntimeError('Checks are not executed either')\n", encoding="utf-8")
            args = [sys.executable, str(SCRIPT), "--intake", str(source), "--checks", str(checks),
                    "--check", "test_regression.Checks.test_value", "--target-check",
                    "test_regression.Checks.test_value", "--output", str(output)]
            run = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, 0, run.stderr)
            prepared = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(prepared["intake"], intake)
            self.assertFalse(prepared["execution_enabled"])
            snapshot = output.read_bytes()
            run = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, 2)
            self.assertEqual(output.read_bytes(), snapshot)
            source.write_text('{"kind":"mend_bug_intake","kind":"duplicate"}', encoding="utf-8")
            args[-1] = str(root / "rejected.json")
            run = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, 2)
            self.assertFalse((root / "rejected.json").exists())


if __name__ == "__main__":
    unittest.main()
