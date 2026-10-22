"""Offline bug-contract and synthetic signed-comparison boundary tests."""
import copy
import unittest

from mend.bug_cases import prepare_bug_case, review_bug_comparison
from mend.domain import MendError, source_sha256
from mend.supervisor import sign_report


class BugCaseTests(unittest.TestCase):
    def setUp(self):
        self.intake = {
            "kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py",
            "reported_error": "wrong result\n", "original_source": "def value():\n    return 0",
            "expected_behavior": "Return one.",
            "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"},
        }
        self.test_source = "# Proposed protected regression; not executed by these tests.\n"
        self.check_id = "test_regression.RegressionChecks.test_value"
        self.key = b"synthetic-controller-key-12345678"
        self.candidate = "def value():\n    return 1\n"
        self.case = prepare_bug_case(self.intake, self.test_source, [self.check_id], self.check_id)

    def identity(self, role):
        source = self.intake["original_source"] if role == "original" else self.candidate
        return {"task_id": "case-1", "attempt_id": "attempt-comparison", "job_id": "job-comparison",
                "comparison_run_id": role, "execution_category": "comparative_regression",
                "contract_sha256": self.case["contract_sha256"],
                "protected_checks_sha256": self.case["protected_checks_sha256"],
                "snapshot_sha256": source_sha256({"helper.py": source, "test_regression.py": self.test_source}),
                "image_digest": "registry.test/runner@sha256:" + "a" * 64,
                "model_id": "nvidia/nemotron-test"}

    def envelope(self, role, passed, failure_kind="behavioral_assertion"):
        report = {**self.identity(role), "source": "live", "complete": True, "passed": passed,
                  "command_results": [{"command_id": "unit-tests", "argv": self.case["contract"]["commands"][0]["argv"],
                                       "exit_code": 0 if passed else 1}],
                  "checks": {"total": 1, "passed": int(passed), "failed": int(not passed), "skipped": 0,
                             "results": [{"check_id": self.check_id, "status": "passed" if passed else "failed",
                                          "failure_kind": failure_kind}]},
                  "failure_kind": failure_kind}
        return sign_report(report, self.key)

    def review(self, before=None, after=None, **kwargs):
        return review_bug_comparison(self.case, self.candidate,
            before or self.envelope("original", False), after or self.envelope("candidate", True),
            signing_key=self.key, original_identity=self.identity("original"),
                candidate_identity=kwargs.get("candidate_identity", self.identity("candidate")),
                candidate_history=kwargs.get("candidate_history"), history_identities=kwargs.get("history_identities"))

    def test_preparation_is_frozen_bounded_and_never_starts_execution(self):
        self.assertEqual(self.case["intake"], self.intake)
        self.assertFalse(self.case["execution_enabled"])
        self.assertEqual(self.case["approval_status"], "not_approved")
        self.assertEqual(self.case["contract"]["allocation"],
                         {"reproduction": 1, "candidate": 2, "comparative_regression": 1})
        self.assertEqual(self.case["contract"]["limits"]["max_executions"], 4)
        self.intake["original_source"] = "changed"
        self.assertNotEqual(self.case["intake"]["original_source"], "changed")

    def test_invalid_intakes_fail_closed(self):
        for field, value in [("schema_version", True), ("file_path", "../helper.py"),
                             ("file_path", "test_regression.py"), ("file_path", "class.py"),
                             ("original_source", ""), ("original_source", "\ud800"),
                             ("expected_behavior", None), ("reported_error", "x" * 8001),
                             ("evidence", {"execution": "passed"})]:
            with self.subTest(field=field, value=repr(value)[:60]):
                bad = copy.deepcopy(self.intake)
                bad[field] = value
                with self.assertRaises(MendError):
                    prepare_bug_case(bad, self.test_source, [self.check_id], self.check_id)

    def test_checks_must_be_named_unique_and_include_the_target(self):
        for ids, target in [([], self.check_id), ([self.check_id] * 2, self.check_id),
                            (["other.Tests.test_it"], "other.Tests.test_it"), ([self.check_id], "missing")]:
            with self.subTest(ids=ids), self.assertRaises(MendError):
                prepare_bug_case(self.intake, self.test_source, ids, target)
        with self.assertRaises(MendError):
            prepare_bug_case(self.intake, " ", [self.check_id], self.check_id)

    def test_source_bound_comparison_keeps_authority_limits_and_exact_diff(self):
        result = self.review()
        self.assertEqual(result["status"], "regression_demonstrated")
        self.assertIn("-    return 0\n\\ No newline at end of file\n", result["diff"])
        self.assertIn("+    return 1\n", result["diff"])
        self.assertFalse(result["live_verification"])
        self.assertFalse(result["apply_authorized"])
        self.assertEqual(result["authority"], "configured_hmac_keys")

    def test_both_pass_or_wrong_failure_cannot_demonstrate_regression(self):
        self.assertEqual(self.review(before=self.envelope("original", True))["status"], "not_demonstrated")
        for kind in ["import_error", "syntax_error", "environment_error", None]:
            with self.subTest(kind=kind):
                self.assertEqual(self.review(before=self.envelope("original", False, kind))["status"],
                                 "failure_not_established")
        self.assertEqual(self.review(after=self.envelope("candidate", False))["status"], "candidate_failed")

    def test_tampered_checks_commands_keys_or_identity_are_rejected(self):
        for mutate in [lambda x: x["report"]["checks"].update(passed=999),
                       lambda x: x["report"]["command_results"][0].update(argv=["sh"]),
                       lambda x: x.update(signature="0" * 64)]:
            with self.subTest(mutate=mutate), self.assertRaises(MendError):
                bad = self.envelope("candidate", True)
                mutate(bad)
                self.review(after=bad)
        wrong = self.identity("candidate")
        wrong["snapshot_sha256"] = "0" * 64
        with self.assertRaises(MendError):
            self.review(candidate_identity=wrong)
        wrong = self.identity("candidate")
        wrong["image_digest"] = "different-image"
        with self.assertRaises(MendError):
            self.review(candidate_identity=wrong)

    def test_comparison_uses_one_job_with_distinct_authenticated_runs(self):
        self.assertEqual(self.identity("original")["job_id"], self.identity("candidate")["job_id"])
        self.assertEqual(self.review()["status"], "regression_demonstrated")
        replay = self.envelope("candidate", True)
        replay["report"]["comparison_run_id"] = "original"
        replay = sign_report(replay["report"], self.key)
        with self.assertRaises(MendError):
            self.review(after=replay)
        wrong = self.identity("candidate")
        wrong["job_id"] = "extra-job-outside-reservation"
        with self.assertRaises(MendError):
            self.review(candidate_identity=wrong)

    def test_modified_contract_or_empty_candidate_is_rejected(self):
        self.case["contract"]["limits"]["max_executions"] = 40
        with self.assertRaises(MendError):
            self.review()
        self.case = prepare_bug_case(self.intake, self.test_source, [self.check_id], self.check_id)
        with self.assertRaises(MendError):
            review_bug_comparison(self.case, self.intake["original_source"],
                self.envelope("original", False), self.envelope("candidate", True),
                signing_key=self.key, original_identity=self.identity("original"),
                candidate_identity=self.identity("candidate"))

    def test_patch_counts_only_lf_lines_and_preserves_unicode_separators(self):
        self.intake["original_source"] = "def value():\n    # one\u2028two\u0085three\fend\n    return 0\n"
        self.candidate = self.intake["original_source"].replace("return 0", "return 1")
        self.case = prepare_bug_case(self.intake, self.test_source, [self.check_id], self.check_id)
        diff = self.review()["diff"]
        self.assertIn("@@ -1,3 +1,3 @@\n", diff)
        self.assertIn("    # one\u2028two\u0085three\fend\n", diff)
        self.assertNotIn("No newline at end of file", diff)

    def test_candidate_history_can_block_an_otherwise_passing_comparison(self):
        identities, envelopes = [], []
        for index, passed in enumerate([True, False]):
            expected = self.identity("candidate")
            for field in ("comparison_run_id", "execution_category"):
                expected.pop(field)
            expected["job_id"] = f"reserved-candidate-{index}"
            report = self.envelope("candidate", passed)["report"]
            report.update(expected)
            identities.append(expected)
            envelopes.append(sign_report(report, self.key))
        result = self.review(candidate_history=envelopes, history_identities=identities)
        self.assertEqual(result["status"], "candidate_history_blocked")
        self.assertEqual(result["check_history"]["quarantine_candidates"], [self.check_id])
        self.assertFalse(result["apply_authorized"])
        self.assertIsNone(self.review()["check_history"])
        self.assertEqual(self.review(candidate_history=[], history_identities=[])["status"],
                         "candidate_history_inconclusive")

    def test_history_for_a_different_candidate_cannot_be_attached_to_review(self):
        expected = self.identity("candidate")
        for field in ("comparison_run_id", "execution_category"):
            expected.pop(field)
        expected["snapshot_sha256"] = "f" * 64
        report = {**self.envelope("candidate", True)["report"], **expected}
        with self.assertRaises(MendError):
            self.review(candidate_history=[sign_report(report, self.key)], history_identities=[expected])
        with self.assertRaises(MendError):
            self.review(candidate_history=[])


if __name__ == "__main__":
    unittest.main()
