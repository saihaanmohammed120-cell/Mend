"""Offline regressions for stop authority; no provider clients are constructed."""
import copy
import datetime as dt
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from mend.domain import MendError, curated_contract
from mend.runner import NebiusRunner
from mend.service import TaskService
from scripts.phase1_spike import measure_job
from test_runner import Transport
from test_spike import AcceleratedClock, FixtureRunner, MemoryJournal

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 11, tzinfo=UTC)


class StopProofRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def observe(self, change):
        record = {"job_id": "job-1", "termination_verified": True,
                  "provider_stopped_at": "2026-10-10T23:59:10Z",
                  "verification": {"kind": "independent_termination", "reference": "reviewed-record"}}
        record.update(change)
        if change.get("remove_verified"):
            record.pop("termination_verified")
        async def reader(job_id):
            return record
        runner = NebiusRunner("fixture-token", "project-test", "registry/image@sha256:" + "a" * 64,
            subnet_id="subnet-test", platform="cpu-test", preset="preset-test",
            transport=Transport({"items": [{"metadata": {"id": "job-1"}, "status": {
                "state": "COMPLETED", "finishedAt": "2026-10-10T23:59:00Z"}}]}),
            termination_reader=reader, clock=lambda: NOW)
        return await runner.observe("job-1")

    async def test_negative_or_missing_assertions_never_become_verified(self):
        for change in ({"remove_verified": True}, *({"termination_verified": v} for v in (False, None, 1, "true")),
                       *({"stopped": v} for v in (False, None, 1, "true")),
                       *({"job_terminal": v} for v in (False, None, 1, "true"))):
            with self.subTest(change=change):
                result = await self.observe(change)
                self.assertFalse(result["termination_verified"])
                self.assertIsNone(result["provider_stopped_at"])

    async def test_explicit_valid_proof_remains_accepted(self):
        self.assertTrue((await self.observe({"stopped": True}))["termination_verified"])


class StopProofSpikeTests(unittest.IsolatedAsyncioTestCase):
    async def test_wrong_job_or_contradictory_chronology_keeps_cleanup_pending(self):
        for change in ({"job_id": "another-job"}, {"job_id": None}, {"stopped": False},
                       {"workload_finished_at": "after-stop"}):
            with self.subTest(change=change):
                class BadProofRunner(FixtureRunner):
                    async def observe(self, job_id):
                        result = await super().observe(job_id)
                        result.update(job_id=job_id, job_terminal=True)
                        patch = dict(change)
                        if patch.get("workload_finished_at") == "after-stop":
                            patch["workload_finished_at"] = (self.dispatch + dt.timedelta(seconds=.002)).isoformat()
                        result.update(patch)
                        return result
                journal, clock = MemoryJournal(), AcceleratedClock()
                await measure_job(BadProofRunner(clock, journal, mode="early"), journal, clock=clock)
                job = journal.report["job"]
                self.assertFalse(job["resource_termination_verified"])
                self.assertFalse(job["terminal_confirmed"])
                self.assertTrue(job["manual_cleanup_required"])
                self.assertNotIn("dispatch_to_provider_stop_seconds", job)


class StopProofServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = TaskService(SimpleNamespace(source="live"), None, None, None, clock=lambda: NOW)
        self.contract = curated_contract()
        self.attempt = dict(id="attempt-1", job_id="job-1", model_id="fixture-model", image_digest="fixture-image",
                            snapshot_sha256="snapshot", dispatch_requested_at="2026-10-10T23:59:00Z",
                            deadline_at="2026-10-11T00:00:00Z")
        self.task = dict(id="task-1", contract=self.contract, contract_sha256="contract",
                         protected_checks_sha256="checks", attempts=[self.attempt])
        ids = {"task_id": "task-1", "attempt_id": "attempt-1", "contract_sha256": "contract",
               "protected_checks_sha256": "checks", "snapshot_sha256": "snapshot",
               "model_id": "fixture-model", "image_digest": "fixture-image", "job_id": "job-1"}
        report = dict(ids, source="live", complete=True, passed=True,
                      command_results=[{"command_id": self.contract["required_command_ids"][0],
                                        "argv": self.contract["commands"][0]["argv"], "exit_code": 0}],
                      checks=dict(total=4, passed=4, failed=0, skipped=0,
                          results=[{"check_id": key, "status": "passed"} for key in self.contract["required_check_ids"]]))
        proof = {"kind": "independent_termination", "reference": "reviewed-record"}
        self.evidence = dict(job_id="job-1", job_terminal=True, termination_verified=True,
                             finished_at="2026-10-10T23:59:10Z", provider_stopped_at="2026-10-10T23:59:20Z",
                             termination_evidence=proof, resolution_evidence={"kind": "provider_terminal",
                                 "reference": proof["reference"], "verification": proof},
                             exit_code=0, runner_report=report, status="passed")

    async def test_receipt_rejects_unbound_or_unverified_stop_despite_passing_checks(self):
        for change in ({"job_id": "another-job"}, {"termination_verified": False}, {"job_terminal": False},
                       {"termination_evidence": None}, {"stopped": False},
                       {"resolution_evidence": {"kind": "provider_terminal", "reference": "cancel-ack-only"}}):
            with self.subTest(change=change):
                with self.assertRaises(MendError):
                    self.service._verify_report(self.task, self.attempt, {**self.evidence, **change})

    async def test_live_resolution_rejects_unverified_stop_before_persistence(self):
        self.service._worker = AsyncMock()
        with self.assertRaises(MendError):
            await self.service._resolve("task-1", self.attempt, {**self.evidence, "termination_verified": False})
        self.service._worker.assert_not_called()

    async def test_legacy_prior_stop_cannot_authorize_a_live_receipt(self):
        previous = {**self.attempt, "id": "prior-attempt", "job_id": "prior-job", "status": "failed",
                    "resolved_at": NOW.isoformat(), "provider_stopped_at": "2026-10-10T23:59:20Z",
                    "resolution_evidence": {"kind": "provider_terminal", "reference": "legacy-bare-marker"}}
        self.task["attempts"] = [previous, self.attempt]
        with self.assertRaises(MendError):
            self.service._verify_report(self.task, self.attempt, self.evidence)

    async def test_resolved_legacy_attempt_cannot_finish_cancellation(self):
        legacy = {**self.attempt, "resolved_at": NOW.isoformat(), "status": "failed",
                  "provider_stopped_at": "2026-10-10T23:59:20Z",
                  "resolution_evidence": {"kind": "provider_terminal", "reference": "legacy-bare-marker"}}
        self.service._current = AsyncMock(return_value={**self.task, "status": "stopping", "attempts": [legacy]})
        self.service._worker = AsyncMock()
        self.assertFalse(await self.service._cancel_attempt("task-1", legacy, "user_cancelled"))
        self.assertFalse(any(call.args[0] == "finish_stop" for call in self.service._worker.call_args_list))

    async def test_valid_bound_stop_preserves_proof_for_recovery(self):
        self.assertEqual(self.service._verify_report(self.task, self.attempt, self.evidence), self.evidence["runner_report"])
        self.service._worker = AsyncMock()
        await self.service._resolve("task-1", self.attempt, copy.deepcopy(self.evidence))
        persisted = self.service._worker.call_args.kwargs["resolution_evidence"]
        self.assertEqual(persisted["verification"]["job_id"], self.attempt["job_id"])
        self.assertIs(persisted["verification"]["termination_verified"], True)
        self.assertEqual(persisted["verification"]["reference"], self.evidence["termination_evidence"]["reference"])
        recovered = {**self.evidence, "id": self.attempt["id"], "resolved_at": NOW.isoformat(),
                     "resolution_evidence": persisted}
        for key in ("termination_evidence", "termination_verified", "job_terminal"):
            recovered.pop(key)
        self.assertEqual(self.service._verify_report(self.task, self.attempt, recovered), self.evidence["runner_report"])
        recovered["resolution_evidence"] = copy.deepcopy(persisted)
        recovered["resolution_evidence"]["verification"]["termination_verified"] = False
        with self.assertRaises(MendError):
            self.service._verify_report(self.task, self.attempt, recovered)

    async def test_run_task_compensation_cannot_bypass_legacy_stop_validation(self):
        legacy = {**self.attempt, "resolved_at": NOW.isoformat(), "status": "failed",
                  "provider_stopped_at": "2026-10-10T23:59:20Z",
                  "resolution_evidence": {"kind": "provider_terminal", "reference": "legacy-bare-marker"}}
        current = {**self.task, "status": "stopping", "attempts": [legacy], "cancel_requested_at": NOW.isoformat()}
        self.service._current = AsyncMock(return_value=current)
        self.service._call = AsyncMock(return_value={"claimed": True})
        self.service._worker = AsyncMock()
        self.service._heartbeat = AsyncMock()
        self.service._run = AsyncMock(side_effect=MendError("termination_unproven", "Fixture stop remains unproven"))
        await self.service.run_task("task-1")
        self.assertFalse(any(call.args[0] == "finish_stop" for call in self.service._worker.call_args_list))
