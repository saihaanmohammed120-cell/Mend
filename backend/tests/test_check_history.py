"""Synthetic controller evidence, never provider runs or repeated code execution."""
import copy
import unittest

from mend.check_history import analyze_check_history
from mend.domain import MendError, canonical_json, sha256_bytes
from mend.supervisor import sign_report


KEY = b"synthetic-history-controller-key-1234"
CONTRACT = {"commands": [{"id": "checks", "argv": ["python", "-m", "unittest"]}],
            "required_check_ids": ["Checks.test_one", "Checks.test_two"]}


def observation(number, statuses=("passed", "passed"), exit_code=None):
    expected = {"task_id": "task-one", "attempt_id": "attempt-" + str(number),
                "job_id": "job-" + str(number), "contract_sha256": sha256_bytes(canonical_json(CONTRACT)),
                "snapshot_sha256": "a" * 64, "protected_checks_sha256": "b" * 64,
                "image_digest": "registry.test/runner@sha256:" + "c" * 64, "model_id": "model-test"}
    exit_code = (0 if set(statuses) == {"passed"} else 1) if exit_code is None else exit_code
    report = {**expected, "source": "live", "complete": True,
              "passed": set(statuses) == {"passed"} and exit_code == 0,
              "command_results": [{**CONTRACT["commands"][0], "command_id": "checks", "exit_code": exit_code}],
              "checks": {"total": 2, **{s: statuses.count(s) for s in ("passed", "failed", "skipped")},
                         "results": [{"check_id": name, "status": status}
                                     for name, status in zip(CONTRACT["required_check_ids"], statuses)]}}
    del report["command_results"][0]["id"]
    return expected, sign_report(report, KEY)


class CheckHistoryTests(unittest.TestCase):
    def analyze(self, *samples):
        expected, reports = zip(*samples) if samples else ([], [])
        return analyze_check_history(list(reports), list(expected), CONTRACT, signing_key=KEY)

    def test_inconsistent_check_blocks_and_is_only_recommended_for_quarantine(self):
        result = self.analyze(observation(1), observation(2, ("failed", "passed")), observation(3))
        self.assertEqual(result["gate_status"], "blocked")
        self.assertEqual(result["quarantine_candidates"], ["Checks.test_one"])
        self.assertEqual(result["checks"][0]["classification"], "inconsistent")
        self.assertEqual(result["checks"][0]["counts"], {"passed": 2, "failed": 1, "skipped": 0})
        self.assertFalse(result["tests_excluded"])
        self.assertFalse(result["live_verification"])
        self.assertFalse(result["apply_authorized"])

    def test_consistent_pass_is_observation_not_a_guarantee(self):
        result = self.analyze(observation(1), observation(2))
        self.assertEqual(result["gate_status"], "passed")
        self.assertFalse(result["absence_of_flakiness_proven"])
        self.assertEqual(result["observed_runs"], 2)
        self.assertEqual(len(result["report_sha256"]), 2)

    def test_empty_single_and_skipped_histories_cannot_pass(self):
        for samples in [(), (observation(1),),
                        (observation(1, ("skipped", "passed")), observation(2))]:
            with self.subTest(count=len(samples)):
                self.assertEqual(self.analyze(*samples)["gate_status"], "inconclusive")
        failed = self.analyze(observation(1, ("failed", "passed")), observation(2, ("failed", "passed")))
        self.assertEqual(failed["gate_status"], "blocked")
        self.assertEqual(failed["quarantine_candidates"], [])

    def test_passing_checks_with_failed_command_still_block(self):
        self.assertEqual(self.analyze(observation(1), observation(2, exit_code=1))["gate_status"], "blocked")

    def test_replayed_jobs_and_mixed_context_fail_closed(self):
        first = observation(1)
        with self.assertRaises(MendError):
            self.analyze(first, first)
        for field in ("task_id", "contract_sha256", "snapshot_sha256", "protected_checks_sha256",
                      "image_digest", "model_id"):
            with self.subTest(field=field), self.assertRaises(MendError):
                expected, envelope = observation(2)
                expected[field] = "different"
                envelope["report"][field] = "different"
                self.analyze(first, (expected, sign_report(envelope["report"], KEY)))

    def test_tampered_signature_results_missing_inventory_and_contract_are_rejected(self):
        expected, envelope = observation(1)
        for mutation in (lambda x: x.update(signature="0" * 64),
                         lambda x: x["report"]["checks"].update(passed=900)):
            changed = copy.deepcopy(envelope)
            mutation(changed)
            with self.assertRaises(MendError):
                self.analyze((expected, changed), observation(2))
        with self.assertRaises(MendError):
            analyze_check_history([envelope], [], CONTRACT, signing_key=KEY)
        changed_contract = copy.deepcopy(CONTRACT)
        changed_contract["commands"][0]["argv"] = ["sh"]
        with self.assertRaises(MendError):
            analyze_check_history([envelope], [expected], changed_contract, signing_key=KEY)

    def test_bounded_inputs_and_identity_values(self):
        for reports, expected in [(None, []), ([], None), ([{}] * 101, [{}] * 101)]:
            with self.subTest(reports=type(reports)), self.assertRaises(MendError):
                analyze_check_history(reports, expected, CONTRACT, signing_key=KEY)
        expected, envelope = observation(1)
        for field, value in [("job_id", "bad\nidentity"), ("snapshot_sha256", "not-a-hash")]:
            changed = {**expected, field: value}
            with self.assertRaises(MendError):
                analyze_check_history([envelope], [changed], CONTRACT, signing_key=KEY)

    def test_inputs_not_mutated_and_canonical_history_identity(self):
        samples = [observation(1), observation(2)]
        frozen = copy.deepcopy(samples)
        a, b = self.analyze(*samples), self.analyze(*samples)
        self.assertEqual(a, b)
        self.assertEqual(samples, frozen)
        self.assertEqual(a["contract_sha256"], sha256_bytes(canonical_json(CONTRACT)))


if __name__ == "__main__":
    unittest.main()
