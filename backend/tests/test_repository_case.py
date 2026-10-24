"""Multi-file contract/diff boundaries; Python inputs are inert text only."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from mend.domain import MendError, canonical_json, sha256_bytes, source_sha256
from mend.repository_case import prepare_repository_case, review_repository_candidate


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "repository_case.py"


class RepositoryCaseTests(unittest.TestCase):
    def setUp(self):
        self.files = {"app/__init__.py": "", "app/math.py": "def value():\n    return 0\n",
                      "app/format.py": "# é 😀\r\ndef label():\r\n    return 'old'",
                      "tests/__init__.py": "", "tests/unit/__init__.py": "",
                      "tests/unit/test_math.py": "# proposed protected oracle; never executed\n"}
        self.editable = ["app/math.py", "app/format.py"]
        self.ids = ["tests.unit.test_math.Checks.test_value"]
        self.case = prepare_repository_case(self.files, self.editable, self.ids)
        self.pin = sha256_bytes(canonical_json(self.case))
        self.candidate = {**self.files, "app/math.py": self.files["app/math.py"].replace("return 0", "return 1"),
                          "app/format.py": self.files["app/format.py"].replace("'old'", "'new'")}

    def review(self):
        return review_repository_candidate(self.case, self.candidate, expected_case_sha256=self.pin)

    def test_case_freezes_complete_snapshot_commands_and_protected_tree(self):
        self.assertEqual(self.case["snapshot_sha256"], source_sha256(self.files))
        self.assertEqual(self.case["contract"]["snapshot_paths"], sorted(self.files))
        self.assertEqual(self.case["contract"]["commands"][0]["argv"],
                         ["python", "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-p", "test_*.py", "-v"])
        self.assertEqual(set(self.case["contract"]["protected_files"]), set(self.files) - set(self.editable))
        self.files["app/math.py"] = "mutated after preparation"
        self.assertNotEqual(self.case["original_files"]["app/math.py"], self.files["app/math.py"])
        self.assertFalse(self.case["execution_enabled"])

    def test_multifile_diff_preserves_exact_unicode_crlf_and_missing_newlines(self):
        result = self.review()
        self.assertEqual(result["changed_paths"], sorted(self.editable))
        self.assertEqual(result["candidate_snapshot_sha256"], source_sha256(self.candidate))
        self.assertIn("--- a/app/format.py\n+++ b/app/format.py\n", result["diff"])
        self.assertIn(" # é 😀\r\n", result["diff"])
        self.assertIn("-    return 'old'\n\\ No newline at end of file\n", result["diff"])
        self.assertIn("--- a/app/math.py\n+++ b/app/math.py\n", result["diff"])
        self.assertEqual(result["case_sha256"], self.pin)
        for field in ("execution_enabled", "apply_authorized", "live_verification", "repair_demonstrated"):
            self.assertFalse(result[field])
        self.assertEqual(result["approval_status"], "not_approved")

    def test_unsafe_hidden_binary_dependency_reserved_and_shadow_paths_fail(self):
        for path in ("../escape.py", "/absolute.py", "app\\math.py", ".env", "app/.secret.py", "image.png",
                     "requirements.txt", "pyproject.toml", "setup.py", "app/conftest.py", "sitecustomize.py",
                     "unittest.py", "NUL.py", "app/LPT1.py", "not-importable.py", "class.py"):
            with self.subTest(path=path), self.assertRaises(MendError):
                prepare_repository_case({**self.files, path: "# private"}, self.editable, self.ids)
        with self.assertRaises(MendError):
            prepare_repository_case({**self.files, "APP/__init__.py": ""}, self.editable, self.ids)
        with self.assertRaises(MendError):
            prepare_repository_case({**self.files, "app.py": ""}, self.editable, self.ids)
        for folder in ("vendor", "venv", "node_modules"):
            with self.subTest(folder=folder), self.assertRaises(MendError):
                prepare_repository_case({**self.files, folder + "/__init__.py": ""}, self.editable, self.ids)

    def test_editable_and_check_id_boundaries_fail_closed(self):
        for editable in ([], ["app/math.py"] * 2, ["missing.py"], ["tests/unit/test_math.py"], [False], "app/math.py"):
            with self.subTest(editable=editable), self.assertRaises(MendError):
                prepare_repository_case(self.files, editable, self.ids)
        for ids in ([], self.ids * 2, ["tests.unit.missing.Checks.test_value"], ["app.math.Checks.test_value"],
                    ["tests.unit.test_math.Checks.other_method"], ["tests.unit.test_math.class.test_value"], [False]):
            with self.subTest(ids=ids), self.assertRaises(MendError):
                prepare_repository_case(self.files, self.editable, ids)
        for missing in ("tests/__init__.py", "tests/unit/__init__.py", "app/__init__.py"):
            files = {p: s for p, s in self.files.items() if p != missing}
            with self.subTest(missing=missing), self.assertRaises(MendError):
                prepare_repository_case(files, self.editable, self.ids)

    def test_added_deleted_or_protected_candidate_changes_and_empty_patch_fail(self):
        variants = [self.files, {**self.candidate, "new.py": "# added"},
                    {p: s for p, s in self.candidate.items() if p != "app/math.py"}]
        for path in self.case["contract"]["protected_files"]:
            variants.append({**self.candidate, path: "# changed protected file\n"})
        for candidate in variants:
            with self.subTest(candidate=list(candidate)), self.assertRaises(MendError):
                review_repository_candidate(self.case, candidate, expected_case_sha256=self.pin)

    def test_changed_base_even_with_recomputed_hashes_and_forged_contract_fail(self):
        changed_files = {**self.files, "app/math.py": "# different base\n"}
        self.case = prepare_repository_case(changed_files, self.editable, self.ids)
        with self.assertRaises(MendError) as caught:
            self.review()
        self.assertEqual(caught.exception.code, "repository_case_mismatch")
        self.setUp()
        self.case["contract"]["commands"][0]["argv"] = ["sh"]
        self.pin = sha256_bytes(canonical_json(self.case))
        with self.assertRaises(MendError) as caught:
            self.review()
        self.assertEqual(caught.exception.code, "repository_contract_changed")

    def test_source_limits_invalid_utf8_and_nul_fail(self):
        for source in ("#" * 200001, "#\x00", "\ud800"):
            with self.subTest(source=repr(source)[:30]), self.assertRaises(MendError):
                prepare_repository_case({**self.files, "app/math.py": source}, self.editable, self.ids)
        many = {**self.files, **{f"extra_{i}.py": "" for i in range(20)}}
        with self.assertRaises(MendError):
            prepare_repository_case(many, self.editable, self.ids)

    def run_cli(self, args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=10)

    def test_actual_cli_prepare_review_and_nonoverwrite_never_execute_code(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "not-executed.txt"
            files = {**self.files, "app/math.py": "from pathlib import Path\nPath(" + repr(str(marker)) + ").touch()\n"}
            request, case_path, candidate_path, output = (root / p for p in ("request.json", "case.json", "candidate.json", "review.json"))
            request.write_bytes(canonical_json({"files": files, "editable_paths": self.editable, "required_check_ids": self.ids}))
            prepare = ["prepare", "--request", str(request), "--output", str(case_path)]
            run = self.run_cli(prepare)
            self.assertEqual(run.returncode, 0, run.stderr)
            case = json.loads(case_path.read_bytes())
            pin = sha256_bytes(canonical_json(case))
            candidate_path.write_bytes(canonical_json({**files, "app/math.py": files["app/math.py"] + "# change\n"}))
            review = ["review", "--case", str(case_path), "--candidate", str(candidate_path),
                      "--expected-case-sha256", pin, "--output", str(output)]
            run = self.run_cli(review)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertFalse(marker.exists())
            result = json.loads(output.read_bytes())
            self.assertEqual(result["status"], "candidate_diff_prepared")
            self.assertFalse(result["repair_demonstrated"])
            for args, path in ((prepare, case_path), (review, output)):
                saved = path.read_bytes()
                self.assertEqual(self.run_cli(args).returncode, 2)
                self.assertEqual(path.read_bytes(), saved)

    def test_actual_cli_strict_json_overflow_and_wrong_pin_write_nothing(self):
        for text in ('{"files":{},"files":{}}', '{"files":NaN}', '[]', '{"extra":true}', '#' * 3000001):
            with self.subTest(text=text[:40]), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                request, output = root / "request.json", root / "case.json"
                request.write_text(text, encoding="utf-8")
                run = self.run_cli(["prepare", "--request", str(request), "--output", str(output)])
                self.assertEqual(run.returncode, 2)
                self.assertFalse(output.exists())
                self.assertNotIn(text[:30], run.stderr)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "case.json").write_bytes(canonical_json(self.case))
            (root / "candidate.json").write_bytes(canonical_json(self.candidate))
            run = self.run_cli(["review", "--case", str(root / "case.json"), "--candidate", str(root / "candidate.json"),
                                "--expected-case-sha256", "0" * 64, "--output", str(root / "output.json")])
            self.assertEqual(run.returncode, 2)
            self.assertFalse((root / "output.json").exists())

    def test_maximum_json_escaped_snapshot_survives_cli_prepare(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            files = {"helper.py": "#" + "\x01" * 199999, "tests/__init__.py": "", "tests/test_helper.py": ""}
            request = {"files": files, "editable_paths": ["helper.py"], "required_check_ids": ["tests.test_helper.Checks.test_value"]}
            path, output = root / "request.json", root / "case.json"
            path.write_bytes(canonical_json(request))
            self.assertGreater(path.stat().st_size, 1_000_000)
            run = self.run_cli(["prepare", "--request", str(path), "--output", str(output)])
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(output.read_bytes())["original_files"], files)


if __name__ == "__main__":
    unittest.main()
