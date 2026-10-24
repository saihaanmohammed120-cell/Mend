"""Offline policy boundaries with synthetic signatures, never provider evidence."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from mend.approval_policy import evaluate_approval_policy
from mend.bug_cases import prepare_bug_case
from mend.domain import MendError, canonical_json, sha256_bytes, source_sha256
from mend.supervisor import sign_report


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "approval_policy.py"


class ApprovalPolicyTests(unittest.TestCase):
    def setUp(self):
        self.key = b"synthetic-offline-controller-key-123456"
        self.check_id = "test_regression.Checks.test_value"
        intake = {"kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py",
                  "original_source": "def value():\n    return 0\n", "reported_error": None,
                  "expected_behavior": "Return one.",
                  "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}}
        self.case = prepare_bug_case(intake, "# Proposed checks; never executed here.\n", [self.check_id], self.check_id)
        self.candidate = "def value():\n    return 1\n"
        self.policy = {"kind": "mend_review_policy", "schema_version": 1, "policy_id": "small-helper-review",
                       "case_sha256": sha256_bytes(canonical_json(self.case)),
                       "max_changed_lines": 2, "max_changed_bytes": 26, "min_history_runs": 2}
        self.bind_evidence()

    def bind_evidence(self):
        original, candidate = self.identity("original"), self.identity("candidate")
        history = []
        for index in range(2):
            identity = self.identity("candidate")
            identity.pop("comparison_run_id")
            identity.pop("execution_category")
            identity["job_id"] = f"candidate-history-{index}"
            history.append(identity)
        self.expected = {"original": original, "candidate": candidate, "history": history}
        self.evidence = {"original": self.envelope(original, False), "candidate": self.envelope(candidate, True),
                         "history": [self.envelope(identity, True) for identity in history]}

    def identity(self, role):
        source = self.case["intake"]["original_source"] if role == "original" else self.candidate
        return {"task_id": "case-1", "attempt_id": "comparative-attempt", "job_id": "comparative-job",
                "comparison_run_id": role, "execution_category": "comparative_regression",
                "contract_sha256": self.case["contract_sha256"],
                "protected_checks_sha256": self.case["protected_checks_sha256"],
                "snapshot_sha256": source_sha256({"helper.py": source, **self.case["contract"]["protected_files"]}),
                "image_digest": "sha256:" + "a" * 64, "model_id": "synthetic-model"}

    def envelope(self, identity, passed):
        return sign_report({**identity, "source": "live", "complete": True, "passed": passed,
            "command_results": [{"command_id": "unit-tests", "argv": self.case["contract"]["commands"][0]["argv"],
                                 "exit_code": 0 if passed else 1}],
            "checks": {"total": 1, "passed": int(passed), "failed": int(not passed), "skipped": 0,
                       "results": [{"check_id": self.check_id, "status": "passed" if passed else "failed",
                                    "failure_kind": "behavioral_assertion"}]}}, self.key)

    def evaluate(self):
        return evaluate_approval_policy(self.policy, self.case, self.candidate, self.evidence, self.expected,
                                        signing_key=self.key)

    def test_threshold_equality_grants_only_exact_bound_review(self):
        result = self.evaluate()
        self.assertEqual(result["decision"], "review_approved")
        self.assertEqual(result["risk"], {"changed_lines": 2, "changed_bytes": 26, "observed_history_runs": 2})
        self.assertEqual(result["protected_checks_sha256"], self.case["protected_checks_sha256"])
        self.assertEqual(result["policy_sha256"], sha256_bytes(canonical_json(self.policy)))
        self.assertEqual(result["evidence_sha256"], sha256_bytes(canonical_json(self.evidence)))
        self.assertEqual(result["expected_runs_sha256"], sha256_bytes(canonical_json(self.expected)))
        for flag in ("execution_enabled", "apply_authorized", "live_verification"):
            self.assertIs(result[flag], False)
        self.policy["policy_id"] = "another-approved-policy"
        self.assertNotEqual(result["policy_sha256"], self.evaluate()["policy_sha256"])

    def test_threshold_overflow_and_insufficient_history_need_human_review(self):
        for metric in ("max_changed_lines", "max_changed_bytes", "min_history_runs"):
            with self.subTest(metric=metric):
                saved = self.policy[metric]
                self.policy[metric] += 1 if metric == "min_history_runs" else -1
                result = self.evaluate()
                self.assertEqual(result["decision"], "human_review_required")
                self.assertTrue(result["reasons"])
                self.policy[metric] = saved
        self.evidence["history"], self.expected["history"] = [], []
        self.assertEqual(self.evaluate()["decision"], "human_review_required")

    def test_signed_candidate_failure_or_inconsistent_history_cannot_approve(self):
        self.evidence["original"] = self.envelope(self.expected["original"], True)
        self.assertEqual(self.evaluate()["decision"], "human_review_required")
        self.evidence["original"] = self.envelope(self.expected["original"], False)
        self.evidence["candidate"] = self.envelope(self.expected["candidate"], False)
        self.assertEqual(self.evaluate()["decision"], "human_review_required")
        self.evidence["candidate"] = self.envelope(self.expected["candidate"], True)
        self.evidence["history"][0] = self.envelope(self.expected["history"][0], False)
        result = self.evaluate()
        self.assertEqual(result["history_gate_status"], "blocked")
        self.assertEqual(result["decision"], "human_review_required")

    def test_size_bound_preserves_lf_crlf_unicode_and_counts_unchanged_interior(self):
        for original, candidate, lines, byte_count in (
                ("# é\r\nreturn 0\r\n", "# é\r\nreturn 1", 2, 18),
                ("# é\n", "# ê\n", 2, 10),
                ("# a\n# same\n# b\n", "# A\n# same\n# B\n", 6, 30),
                ("# a\u2028b\n", "# a\u2028c\n", 2, 16)):
            with self.subTest(original=original):
                intake = copy.deepcopy(self.case["intake"])
                intake["original_source"] = original
                self.case = prepare_bug_case(intake, "# tests\n", [self.check_id], self.check_id)
                self.policy.update(case_sha256=sha256_bytes(canonical_json(self.case)),
                                   max_changed_lines=lines, max_changed_bytes=byte_count)
                self.candidate = candidate
                self.bind_evidence()
                result = self.evaluate()
                self.assertEqual(result["risk"]["changed_lines"], lines)
                self.assertEqual(result["risk"]["changed_bytes"], byte_count)
                self.assertEqual(result["decision"], "review_approved")

    def test_tampered_reports_keys_roles_source_and_replayed_history_fail_closed(self):
        mutations = [lambda: self.evidence["candidate"]["report"].update(passed=False),
                     lambda: self.expected["candidate"].update(snapshot_sha256="0" * 64),
                     lambda: self.expected["candidate"].update(comparison_run_id="original"),
                     lambda: self.expected["history"][1].update(job_id=self.expected["history"][0]["job_id"]),
                     lambda: self.evidence.update(review_approved=True)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.setUp()
                mutate()
                with self.assertRaises(MendError):
                    self.evaluate()
        self.setUp()
        self.key = b"wrong-controller-key-1234567890123456"
        with self.assertRaises(MendError):
            self.evaluate()
        self.setUp()
        self.candidate += "# changed after signing\n"
        with self.assertRaises(MendError):
            self.evaluate()

    def test_protected_checks_and_original_are_pinned_even_if_case_is_rebuilt(self):
        for field in ("original_source", "protected_tests"):
            self.setUp()
            intake = copy.deepcopy(self.case["intake"])
            tests = self.case["contract"]["protected_files"]["test_regression.py"]
            if field == "original_source":
                intake["original_source"] += "# changed\n"
            else:
                tests += "# replaced oracle\n"
            self.case = prepare_bug_case(intake, tests, [self.check_id], self.check_id)
            with self.assertRaises(MendError) as caught:
                self.evaluate()
            self.assertEqual(caught.exception.code, "policy_case_mismatch")

    def test_unknown_policy_fields_floats_and_bool_thresholds_rejected(self):
        for field, value in (("execution_enabled", True), ("schema_version", True), ("max_changed_lines", True),
                             ("max_changed_bytes", 2.0), ("min_history_runs", 1), ("case_sha256", "bad")):
            self.setUp()
            self.policy[field] = value
            with self.subTest(field=field), self.assertRaises(MendError):
                self.evaluate()

    def cli_inputs(self, root):
        values = {"policy": self.policy, "case": self.case, "evidence": self.evidence, "expected-runs": self.expected}
        args = [sys.executable, str(SCRIPT)]
        for name, value in values.items():
            path = root / (name + ".json")
            path.write_bytes(canonical_json(value))
            args += ["--" + name, str(path)]
        (root / "candidate.py").write_bytes(self.candidate.encode("utf-8"))
        (root / "private.key").write_bytes(self.key)
        return args + ["--candidate", str(root / "candidate.py"), "--key-file", str(root / "private.key"),
                       "--output", str(root / "decision.json")]

    def run_cli(self, args):
        return subprocess.run(args, capture_output=True, text=True, timeout=10)

    def test_real_cli_decision_exit_codes_and_nonoverwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            args = self.cli_inputs(root)
            run = self.run_cli(args)
            self.assertEqual(run.returncode, 0, run.stderr)
            output = root / "decision.json"
            saved = output.read_bytes()
            self.assertEqual(json.loads(saved)["decision"], "review_approved")
            self.assertEqual(self.run_cli(args).returncode, 2)
            self.assertEqual(output.read_bytes(), saved)
            output.unlink()
            self.policy["max_changed_bytes"] = 25
            (root / "policy.json").write_bytes(canonical_json(self.policy))
            run = self.run_cli(args)
            self.assertEqual(run.returncode, 1, run.stderr)
            self.assertEqual(json.loads(output.read_bytes())["decision"], "human_review_required")
            self.assertNotIn(self.key.decode(), run.stdout + run.stderr + output.read_text())

    def test_real_cli_duplicate_json_oversize_key_and_untrusted_evidence_produce_no_output(self):
        for invalid in ("duplicate", "key", "evidence", "candidate"):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                args = self.cli_inputs(root)
                if invalid == "duplicate":
                    (root / "policy.json").write_text('{"kind":"mend_review_policy","kind":"mend_review_policy"}')
                elif invalid == "key":
                    (root / "private.key").write_bytes(b"secret-do-not-print" * 20)
                elif invalid == "evidence":
                    (root / "evidence.json").write_text('{"review_approved":true}')
                else:
                    (root / "candidate.py").write_bytes(b"#" * 200001)
                run = self.run_cli(args)
                self.assertEqual(run.returncode, 2, run.stderr)
                self.assertFalse((root / "decision.json").exists())
                self.assertNotIn("secret-do-not-print", run.stdout + run.stderr)

    def test_real_cli_reads_inert_python_without_importing_or_executing_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "must-not-exist.txt"
            self.candidate = "from pathlib import Path\r\nPath(" + repr(str(marker)) + ").write_text('executed')\r\n"
            self.policy.update(max_changed_lines=100, max_changed_bytes=10000)
            self.bind_evidence()
            run = self.run_cli(self.cli_inputs(root))
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertFalse(marker.exists())
            result = json.loads((root / "decision.json").read_bytes())
            self.assertEqual(result["candidate_snapshot_sha256"], self.expected["candidate"]["snapshot_sha256"])


if __name__ == "__main__":
    unittest.main()
