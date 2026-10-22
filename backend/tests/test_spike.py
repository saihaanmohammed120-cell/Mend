"""Offline Phase 1 measurement fixtures; no provider or Docker calls."""
import asyncio
import contextlib
import copy
import datetime as dt
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from mend.domain import MendError
from scripts.phase1_spike import (
    Journal, ProbeConfig, REQUIRED_ENV, base_report, main,
    measure_inference, measure_job, summarize,
)


class AcceleratedClock:
    def __init__(self, scale=1000):
        self.real_start, self.scale = time.monotonic(), scale
        self.wall_start = dt.datetime(2026, 10, 11, tzinfo=dt.timezone.utc)

    def monotonic(self):
        return (time.monotonic() - self.real_start) * self.scale

    def now(self):
        return self.wall_start + dt.timedelta(seconds=self.monotonic())

    async def sleep(self, seconds):
        await asyncio.sleep(max(0, seconds) / self.scale)


class ControlledDeadlineClock:
    """Schedule exact deadline samples independently of operating-system timers."""
    def __init__(self, early_by=0):
        self.elapsed = 0.0
        self.early_by = early_by
        self.woke = False
        self.observed = asyncio.Event()

    def monotonic(self):
        return self.elapsed

    def now(self):
        return dt.datetime(2026, 10, 11, tzinfo=dt.timezone.utc) + dt.timedelta(seconds=self.elapsed)

    async def sleep(self, seconds):
        if seconds > 30 and not self.woke:
            self.woke = True
            await self.observed.wait()
            self.elapsed += seconds - self.early_by
            return
        self.elapsed += seconds
        await asyncio.sleep(0)


class MemoryJournal:
    def __init__(self):
        self.report = base_report("offline_fixture")
        self.snapshots = []

    def save(self):
        self.snapshots.append(copy.deepcopy(self.report))


class FixtureModel:
    def __init__(self, token_reservation=5000, error=None):
        self.calls, self.tokens, self.error = [], token_reservation, error

    def reservation(self, *args):
        return {"token_count": self.tokens, "cost": 0.01}

    async def generate(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.error:
            raise self.error
        return {"files": {"never-execute.py": "raise RuntimeError('must remain data')"},
                "model_id": "nvidia/fixture", "model_request_id": "fixture-id",
                "input_tokens": 100, "output_tokens": 20, "cost": 0.001}


class FixtureRunner:
    def __init__(self, clock, journal, *, mode="normal", observation_delay=0):
        self.clock, self.journal = clock, journal
        self.mode, self.observation_delay = mode, observation_delay
        self.calls, self.cancelled = [], False

    async def submit(self, task, attempt, files, contract):
        self.attempt = attempt
        self.dispatch = dt.datetime.fromisoformat(attempt["dispatch_requested_at"].replace("Z", "+00:00"))
        self.calls.append(("submit", self.clock.monotonic()))
        assert self.journal.snapshots[-1]["job"]["submission_key"] == attempt["submission_key"]
        assert "never-execute.py" not in files
        if self.mode in {"ambiguous", "recovered"}:
            raise MendError("runner_ambiguous", "Fixture-only ambiguous submission")
        return "fixture-job"

    async def reconcile(self, key):
        self.calls.append(("reconcile", self.clock.monotonic()))
        return {"status": "found", "job_id": "fixture-job"} if self.mode == "recovered" else {"status": "ambiguous"}

    async def cancel(self, job_id):
        self.calls.append(("cancel", self.clock.monotonic()))
        self.cancelled = True
        return {"acknowledged": True, "stopped": False}

    async def observe(self, job_id):
        if self.observation_delay:
            await self.clock.sleep(self.observation_delay)
        elapsed = (self.clock.now() - self.dispatch).total_seconds()
        if self.mode == "early":
            return {"status": "infrastructure_failed", "job_id": job_id, "job_terminal": True, "termination_verified": True,
                    "termination_evidence": {"kind": "independent_termination", "reference": "fixture-only-independent-resource-observation"},
                    "provider_stopped_at":
                    (self.dispatch + dt.timedelta(seconds=0.001)).isoformat()}
        if self.mode == "unknown":
            return {"status": "unknown"}
        if self.cancelled and elapsed >= 63:
            return {"status": "cancelled", "job_id": job_id, "job_terminal": True, "termination_verified": True,
                    "termination_evidence": {"kind": "independent_termination", "reference": "fixture-only-independent-resource-observation"},
                    "provider_stopped_at":
                    (self.dispatch + dt.timedelta(seconds=63)).isoformat()}
        return {"status": "running"}


class ObservedRunner(FixtureRunner):
    async def observe(self, job_id):
        self.clock.observed.set()
        await asyncio.sleep(0)
        return await super().observe(job_id)


class SpikeConfigurationTests(unittest.TestCase):
    def test_default_dry_run_does_not_construct_provider_clients(self):
        output = io.StringIO()
        with patch("scripts.phase1_spike.TokenFactoryClient", side_effect=AssertionError("unexpected network client")), \
             patch("scripts.phase1_spike.NebiusRunner", side_effect=AssertionError("unexpected runner")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(main([], env={}), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["provider_requests"], 0)
        self.assertEqual(report["source"], "dry_run")
        self.assertFalse(report["live_release_ready"])

    def test_live_without_configuration_fails_before_requests(self):
        output = io.StringIO()
        with patch("scripts.phase1_spike.TokenFactoryClient", side_effect=AssertionError("unexpected client")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(main(["--run-live"], env={}), 2)
        self.assertEqual(json.loads(output.getvalue())["error_code"], "missing_probe_configuration")

    def test_configured_live_cli_blocks_before_provider_clients_without_stop_authority(self):
        env = dict.fromkeys(REQUIRED_ENV, "fixture-only")
        env.update(MEND_TASK_COST_CAP="1", MEND_SPIKE_PROBE_APPROVED="true")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "probe.json"
            output = io.StringIO()
            with patch("scripts.phase1_spike.TokenFactoryClient", side_effect=AssertionError("paid client constructed")) as model, \
                 patch("scripts.phase1_spike.NebiusRunner", side_effect=AssertionError("paid runner constructed")) as runner, \
                 contextlib.redirect_stdout(output):
                self.assertEqual(main(["--run-live", "--output", str(path)], env=env), 2)
            model.assert_not_called()
            runner.assert_not_called()
            report = json.loads(output.getvalue())
            self.assertEqual(report, json.loads(path.read_text()))
            self.assertEqual(report["error_code"], "independent_stop_evidence_unconfigured")
            self.assertEqual(report["source"], "blocked_preflight")
            self.assertEqual(report["provider_requests"], 0)
            self.assertIn("independent_stop_evidence_unconfigured", report["blockers"])
            self.assertIn("independent", report["required_action"])
            self.assertEqual(report["inference"], [])
            self.assertEqual(report["job"], {})
            self.assertFalse(report["live_release_ready"])

    def test_config_secrets_not_in_repr_and_approval_required(self):
        env = dict.fromkeys(REQUIRED_ENV, "fixture-only")
        env.update(NEBIUS_TOKEN_FACTORY_API_KEY="synthetic-factory-secret", NEBIUS_IAM_TOKEN="synthetic-iam-secret",
                   MEND_TASK_COST_CAP="1", MEND_SPIKE_PROBE_APPROVED="true")
        config = ProbeConfig.from_env(env)
        self.assertNotIn("synthetic-factory-secret", repr(config))
        self.assertNotIn("synthetic-iam-secret", repr(config))
        env["MEND_SPIKE_PROBE_APPROVED"] = "false"
        with self.assertRaises(MendError):
            ProbeConfig.from_env(env)

    def test_journal_private_atomic_and_never_overwrites_existing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "probe.json"
            journal = Journal(path, base_report("offline_fixture"))
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            journal.report["job"]["submission_key"] = "fixture-submission"
            journal.save()
            self.assertEqual(json.loads(path.read_text())["job"]["submission_key"], "fixture-submission")
            with self.assertRaises(FileExistsError):
                Journal(path, {})

    def test_interruption_journal_failure_still_prints_cleanup_identity(self):
        class FailedJournal:
            def __init__(self, *args):
                self.report = {"job": {"job_id": "fixture-job", "submission_key": "fixture-submission"}}
            def save(self):
                raise OSError("fixture-only journal failure")
        def interrupted(coroutine):
            coroutine.close()
            raise KeyboardInterrupt
        output = io.StringIO()
        with patch("scripts.phase1_spike.ProbeConfig.from_env", return_value=object()), \
             patch("scripts.phase1_spike.Journal", FailedJournal), \
             patch("scripts.phase1_spike.asyncio.run", side_effect=interrupted), \
             contextlib.redirect_stdout(output):
            self.assertEqual(main(["--run-live"], env={}), 130)
        report = json.loads(output.getvalue())
        self.assertEqual(report["job"]["job_id"], "fixture-job")
        self.assertEqual(report["job"]["submission_key"], "fixture-submission")
        self.assertTrue(report["journal_write_failed"])

    def test_ten_minute_misfit_and_queue_not_double_counted(self):
        report = base_report("offline_fixture")
        report["inference"] = [{"status": "completed", "latency_seconds": 100,
                                "input_tokens": 100, "output_tokens": 20}] * 4
        report["job"] = {"dispatch_to_provider_stop_seconds": 63, "first_observed_running_seconds": 61}
        summarize(report, 4)
        projection = report["ten_minute_projection"]
        self.assertEqual(projection["subtotal_seconds"], 652)
        self.assertFalse(projection["fits"])
        self.assertTrue(projection["queue_is_inside_job_budget"])
        self.assertTrue(report["provisioning_consumed_job_budget"])

    def test_short_measured_projection_never_claims_verified_fit(self):
        report = base_report("offline_fixture")
        report["inference"] = [{"status": "completed", "latency_seconds": 1}]
        summarize(report, 1)
        self.assertIsNone(report["ten_minute_projection"]["fits"])
        self.assertEqual(report["ten_minute_projection"]["subtotal_seconds"], 244)
        self.assertEqual(report["ten_minute_projection"]["status"], "partial_extrapolation_not_verified")
        self.assertFalse(report["live_release_ready"])


class SpikeMeasurementTests(unittest.IsolatedAsyncioTestCase):
    async def test_inference_four_calls_accounted_without_executing_returned_source(self):
        journal, clock, model = MemoryJournal(), AcceleratedClock(), FixtureModel()
        await measure_inference(model, journal, calls=4, cost_cap=1, clock=clock)
        self.assertEqual(len(model.calls), 4)
        self.assertEqual(journal.report["reserved_tokens"], 20000)
        self.assertEqual(journal.report["inference"][1]["context"], "curated_repair_fixture")
        self.assertTrue(all(item["returned_source_executed"] is False for item in journal.report["inference"]))
        self.assertTrue(all("files" not in item for item in journal.report["inference"]))

    async def test_token_reservations_stop_fifth_or_over_budget_call(self):
        journal, clock, model = MemoryJournal(), AcceleratedClock(), FixtureModel(token_reservation=16000)
        await measure_inference(model, journal, calls=4, cost_cap=1, clock=clock)
        self.assertEqual(len(model.calls), 1)
        self.assertEqual(journal.report["inference_stop_reason"], "reserved_token_or_cost_budget_exhausted")

    async def test_unknown_inference_usage_keeps_reservation_and_stops(self):
        error = MendError("provider_timeout", "Synthetic timeout")
        journal, model = MemoryJournal(), FixtureModel(error=error)
        await measure_inference(model, journal, calls=4, cost_cap=1, clock=AcceleratedClock())
        self.assertEqual(len(model.calls), 1)
        self.assertEqual(journal.report["reserved_tokens"], 5000)
        self.assertTrue(journal.report["inference"][0]["usage_reconciliation_required"])

    async def test_cancel_ack_is_separate_from_stop_and_positive_lag_fails_bound(self):
        journal, clock = MemoryJournal(), ControlledDeadlineClock()
        runner = ObservedRunner(clock, journal)
        await measure_job(runner, journal, clock=clock)
        job = journal.report["job"]
        self.assertTrue(job["terminal_confirmed"])
        self.assertTrue(job["cancel_acknowledged"])
        self.assertEqual(job["cancel_request_elapsed_seconds"], 60)
        self.assertEqual(job["dispatch_to_provider_stop_seconds"], 63)
        self.assertGreater(job["cancel_to_provider_stop_seconds"], 0)
        self.assertEqual(job["cancel_to_provider_stop_seconds"], 3)
        self.assertFalse(job["strict_60_second_sample_fit"])
        self.assertEqual(sum(call[0] == "cancel" for call in runner.calls), 1)

    async def test_deadline_worker_is_independent_of_slow_observation(self):
        journal, clock = MemoryJournal(), AcceleratedClock(scale=100)
        runner = FixtureRunner(clock, journal, observation_delay=17)
        await measure_job(runner, journal, clock=clock)
        elapsed = journal.report["job"]["cancel_request_elapsed_seconds"]
        self.assertGreaterEqual(elapsed, 60)
        self.assertLess(elapsed, 65)

    async def test_deadline_worker_rechecks_time_after_an_early_wakeup(self):
        journal, clock = MemoryJournal(), ControlledDeadlineClock(early_by=1)
        runner = ObservedRunner(clock, journal)
        await measure_job(runner, journal, clock=clock)
        job = journal.report["job"]
        self.assertGreaterEqual(job["cancel_request_elapsed_seconds"], 60)
        self.assertLess(job["cancel_request_elapsed_seconds"], 65)
        self.assertEqual(sum(call[0] == "cancel" for call in runner.calls), 1)
        self.assertTrue(job["terminal_confirmed"])
        self.assertFalse(job["strict_60_second_sample_fit"])

    async def test_unknown_stop_requires_manual_cleanup_without_cancel_retry(self):
        journal, clock = MemoryJournal(), AcceleratedClock()
        runner = FixtureRunner(clock, journal, mode="unknown")
        await measure_job(runner, journal, clock=clock)
        job = journal.report["job"]
        self.assertFalse(job["terminal_confirmed"])
        self.assertTrue(job["manual_cleanup_required"])
        self.assertEqual(job["job_id"], "fixture-job")
        self.assertFalse(job["strict_60_second_sample_fit"])
        self.assertEqual(sum(call[0] == "cancel" for call in runner.calls), 1)

    async def test_ambiguous_submit_preserves_name_never_creates_twice(self):
        journal, clock = MemoryJournal(), AcceleratedClock()
        runner = FixtureRunner(clock, journal, mode="ambiguous")
        await measure_job(runner, journal, clock=clock)
        job = journal.report["job"]
        self.assertTrue(job["submission_key"])
        self.assertIsNone(job["job_id"])
        self.assertTrue(job["manual_cleanup_required"])
        self.assertEqual(sum(call[0] == "submit" for call in runner.calls), 1)

    async def test_early_terminal_probe_does_not_claim_running_cancel_measurement(self):
        journal, clock = MemoryJournal(), AcceleratedClock()
        runner = FixtureRunner(clock, journal, mode="early")
        await measure_job(runner, journal, clock=clock)
        self.assertTrue(journal.report["job"]["terminal_confirmed"])
        self.assertFalse(journal.report["job"]["cancel_running_job_measured"])
        self.assertFalse(journal.report["job"]["strict_60_second_sample_fit"])
        self.assertFalse(any(call[0] == "cancel" for call in runner.calls))

    async def test_workload_finish_and_terminal_status_do_not_prove_vm_stop(self):
        class WorkloadOnlyRunner(FixtureRunner):
            async def observe(self, job_id):
                result = await super().observe(job_id)
                if result.get("provider_stopped_at"):
                    finish = result["provider_stopped_at"]
                    # Regression: even a stop-looking timestamp without independent
                    # termination verification must not authorize a VM-stop claim.
                    result.update(job_terminal=True, workload_finished_at=finish,
                                  termination_verified=False, termination_evidence=None)
                return result
        journal, clock = MemoryJournal(), AcceleratedClock()
        runner = WorkloadOnlyRunner(clock, journal)
        await measure_job(runner, journal, clock=clock)
        job = journal.report["job"]
        self.assertTrue(job["job_terminal_observed"])
        self.assertEqual(job["dispatch_to_workload_finish_seconds"], 63)
        self.assertFalse(job["terminal_confirmed"])
        self.assertFalse(job["resource_termination_verified"])
        self.assertTrue(job["manual_cleanup_required"])
        self.assertFalse(job["strict_60_second_sample_fit"])
        self.assertEqual(job["strict_60_bound_status"], "unmeasured")
        self.assertNotIn("dispatch_to_provider_stop_seconds", job)
        self.assertIn("actual_infrastructure_termination", journal.report["unmeasured"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
