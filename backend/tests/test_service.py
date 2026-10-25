import asyncio
import unittest
import uuid
import json
import copy
import os
import sqlite3
import stat
import tempfile
from datetime import datetime, timedelta, timezone

from mend.artifacts import LocalArtifacts
from mend.domain import MendError, canonical_json, curated_contract
from mend.fakes import FixtureModel, FixtureRunner
from mend.local_store import LocalTestStore
from mend.service import TaskService, failure_signature, semantic_diagnostics


class Clock:
    def __init__(self):
        self.value = datetime(2026, 10, 11, tzinfo=timezone.utc)
    def __call__(self):
        return self.value
    def advance(self, seconds):
        self.value += timedelta(seconds=seconds)


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = Clock()
        self.store = LocalTestStore(clock=self.clock)
        self.model = FixtureModel()
        self.runner = FixtureRunner(clock=self.clock)
        self.artifact_store = LocalArtifacts()
        self.service = TaskService(self.store, self.model, self.runner, self.artifact_store,
                                   {"poll_interval_seconds": 0.001}, self.clock)
        self.user = str(uuid.uuid4())

    def tearDown(self):
        self.store.close()

    async def ready(self):
        task = await self.service.create(self.user, "Clean CSV rows", str(uuid.uuid4()))
        task = await self.service.propose(task["id"], self.user, task["contract_version"], curated_contract())
        return await self.service.start(task["id"], self.user, task["contract_version"])

    async def test_failure_repair_receipt_is_explicit_local_test(self):
        task = await self.ready()
        await self.service.run_task(task["id"])
        task = await self.service.get(task["id"], self.user)
        self.assertEqual(task["status"], "passed")
        self.assertEqual(task["execution_count"], 2)
        self.assertEqual(task["repair_count"], 1)
        receipt = await self.service.receipt(task["id"], self.user)
        self.assertEqual(receipt["source"], "local_test")
        self.assertIs(receipt["live_verification"], False)
        self.assertEqual(task["usage"]["tokens"], 2000)
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertEqual(raw["usage"]["actual_tokens"], 140)
        events = [event async for event in self.service.events(task["id"], self.user)]
        self.assertEqual([e["sequence"] for e in events], list(range(1, len(events) + 1)))
        self.assertEqual(events[-1]["event_type"], "receipt")
        self.assertIn("bundle", await self.service.artifacts(task["id"], self.user))

    async def test_invalid_patches_consume_three_repairs_not_executions(self):
        self.model.fail_patch = True
        task = await self.ready()
        await self.service.run_task(task["id"])
        task = await self.service.get(task["id"], self.user)
        self.assertEqual(task["status"], "needs_help")
        self.assertEqual(task["repair_count"], 3)
        self.assertEqual(task["execution_count"], 1)
        self.assertEqual(self.model.calls, 4)
        self.assertIsNone(task["receipt"])
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertEqual(raw["usage"]["actual_tokens"], 280)

    async def test_frozen_contract_stale_version_and_cross_owner_rejected(self):
        task = await self.ready()
        with self.assertRaises(MendError):
            await self.service.propose(task["id"], self.user, 1, curated_contract())
        with self.assertRaises(MendError):
            await self.service.get(task["id"], str(uuid.uuid4()))

    async def test_cancel_before_dispatch_never_runs_job(self):
        task = await self.ready()
        await self.service.cancel(task["id"], self.user)
        await self.service.run_task(task["id"])
        task = await self.service.get(task["id"], self.user)
        self.assertEqual(task["status"], "stopped")
        self.assertEqual(self.runner.submissions, 0)

    async def test_bad_report_cannot_print_receipt(self):
        self.runner.bad_report = True
        task = await self.ready()
        await self.service.run_task(task["id"])
        task = await self.service.get(task["id"], self.user)
        self.assertEqual(task["status"], "needs_help")
        self.assertIsNone(task["receipt"])

    async def test_changed_command_arguments_cannot_print_receipt(self):
        observe = self.runner.observe
        async def changed(job_id):
            evidence = await observe(job_id)
            if evidence.get("status") == "passed":
                evidence["runner_report"]["command_results"][0]["argv"] = ["python", "-c", "pass"]
            return evidence
        self.runner.observe = changed
        task = await self.ready()
        await self.service.run_task(task["id"])
        result = await self.service.get(task["id"], self.user)
        self.assertEqual(result["status"], "needs_help")
        self.assertEqual(result["stop_reason"], "command_mismatch")
        self.assertIsNone(result["receipt"])

    async def test_repeated_identical_check_failure_stops(self):
        self.model.always_fail = True
        task = await self.ready()
        await self.service.run_task(task["id"])
        task = await self.service.get(task["id"], self.user)
        self.assertEqual(task["status"], "needs_help")
        self.assertEqual(task["execution_count"], 2)
        self.assertEqual(task["stop_reason"], "repeated_failure_without_new_evidence")

    async def test_live_gate_blocks_test_adapters(self):
        self.store.source = "live"
        task = await self.service.create(self.user, "Clean CSV rows", str(uuid.uuid4()))
        task = await self.service.propose(task["id"], self.user, 1)
        with self.assertRaises(MendError) as result:
            await self.service.start(task["id"], self.user, task["contract_version"])
        self.assertEqual(result.exception.code, "release_blocked")

    async def test_lease_fences_worker_output(self):
        task = await self.ready()
        self.store.call("claim_worker", {"task_id": task["id"], "worker_id": "worker-a"})
        with self.assertRaises(MendError) as result:
            self.store.call("set_state", {"task_id": task["id"], "worker_id": "worker-b", "status": "running"})
        self.assertEqual(result.exception.code, "lease_lost")

    async def test_deadline_worker_cancels_and_requires_observed_stop(self):
        self.runner.hang = True
        self.runner.ambiguous_stop = True
        task = await self.ready()
        running = asyncio.create_task(self.service.run_task(task["id"]))
        for _ in range(500):
            current = await self.service.get(task["id"], self.user)
            if current["status"] == "running":
                break
            await asyncio.sleep(.001)
        else:
            self.fail("Fixture job never reached running")
        self.clock.advance(60)
        await self.service.deadline_tick()
        await asyncio.wait_for(running, 2)
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "stopping")
        self.assertIsNone(current["receipt"])
        self.assertGreaterEqual(len(self.runner.cancelled), 1)
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertIsNone(raw["attempts"][-1]["resolved_at"])

    async def test_independent_deadline_cancels_while_worker_lease_is_active(self):
        self.runner.hang = True
        task = await self.ready()
        running = asyncio.create_task(self.service.run_task(task["id"]))
        for _ in range(500):
            current = await self.service.get(task["id"], self.user)
            if current["status"] == "running":
                break
            await asyncio.sleep(.001)
        else:
            self.fail("Fixture never reached running")
        self.clock.advance(60)
        self.store.call("claim_worker", {"task_id": task["id"], "worker_id": self.service.worker_id, "seconds": 30})
        independent = TaskService(self.store, self.model, self.runner, self.artifact_store, {}, self.clock)
        await independent.deadline_tick()
        self.assertGreaterEqual(len(self.runner.cancelled), 1)
        await asyncio.wait_for(running, 2)
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "stopped")

    async def test_worker_recovery_observes_existing_job_without_duplicate_submit(self):
        self.runner.hang = True
        task = await self.ready()
        running = asyncio.create_task(self.service.run_task(task["id"]))
        for _ in range(500):
            current = await self.service.get(task["id"], self.user)
            if current["status"] == "running":
                break
            await asyncio.sleep(.001)
        else:
            self.fail("Fixture never reached running")
        running.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await running
        self.clock.advance(31)
        self.runner.hang = False
        recovery = TaskService(self.store, self.model, self.runner, self.artifact_store, {}, self.clock)
        await recovery.run_task(task["id"])
        current = await recovery.get(task["id"], self.user)
        self.assertEqual(current["status"], "passed")
        self.assertEqual(self.runner.submissions, 2)

    async def test_new_diagnostic_evidence_allows_another_repair(self):
        self.model.always_fail = True
        original_observe = self.runner.observe
        async def with_diagnostic(job_id):
            result = await original_observe(job_id)
            attempt = self.runner.jobs[job_id]["attempt"]
            result["runner_report"]["stderr"] = "first diagnostic" if attempt["ordinal"] == 1 else "new diagnostic"
            return result
        self.runner.observe = with_diagnostic
        task = await self.ready()
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["execution_count"], 3)
        self.assertEqual(current["stop_reason"], "repeated_failure_without_new_evidence")
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        first, second, third = raw["attempts"]
        self.assertEqual(first["failure_signature"], second["failure_signature"])
        self.assertNotEqual(first["diagnostic_evidence_sha256"], second["diagnostic_evidence_sha256"])
        self.assertEqual(second["diagnostic_evidence_sha256"], third["diagnostic_evidence_sha256"])

    async def test_actual_usage_overrun_is_persisted_for_reconciliation(self):
        original_generate = self.model.generate
        async def overrun(*args, **kwargs):
            result = await original_generate(*args, **kwargs)
            result["output_tokens"] = 2000
            return result
        self.model.generate = overrun
        task = await self.ready()
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        record = json.loads(current["stop_reason"])
        self.assertEqual(record["code"], "usage_reconciliation_required")
        self.assertEqual(record["actual_tokens"], 2020)
        self.assertEqual(record["reserved_tokens"], 1000)
        self.assertEqual(self.runner.submissions, 0)
        self.assertEqual(current["usage"]["tokens"], 1000)

    async def test_store_shutdown_is_idempotent_and_rejects_late_thread_reads(self):
        self.store.close()
        self.store.close()
        with self.assertRaises(MendError) as result:
            await asyncio.to_thread(self.store.call, "pending", {})
        self.assertEqual(result.exception.code, "store_closed")

    async def test_concurrent_run_calls_have_one_generation_in_flight(self):
        active, maximum = 0, 0
        original = self.model.generate
        async def measured(*args, **kwargs):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            try:
                await asyncio.sleep(.01)
                return await original(*args, **kwargs)
            finally:
                active -= 1
        self.model.generate = measured
        task = await self.ready()
        await asyncio.gather(self.service.run_task(task["id"]), self.service.run_task(task["id"]))
        self.assertEqual(maximum, 1)
        self.assertEqual((await self.service.get(task["id"], self.user))["status"], "passed")
        self.assertEqual(self.runner.submissions, 2)

    async def test_heartbeat_failure_always_releases_running_guard(self):
        self.runner.hang = True
        async def failed(task_id):
            await asyncio.sleep(.01)
            raise MendError("lease_lost", "Fixture lease loss.", 409)
        self.service._heartbeat = failed
        task = await self.ready()
        await self.service.run_task(task["id"])
        self.assertNotIn(task["id"], self.service._running)

    async def test_parallel_deadlines_do_not_wait_for_first_cancellation(self):
        released, fast = asyncio.Event(), asyncio.Event()
        class Store:
            def call(self, action, payload):
                if action == "due":
                    return [{"task_id": "slow", "attempt_id": "a"}, {"task_id": "fast", "attempt_id": "b"}]
                if action == "deadline_cancel":
                    return {"job_id": payload["task_id"], "cancel_requested": True}
                if action == "claim_worker":
                    return {"claimed": False}
        class Runner:
            async def cancel(self, job_id):
                if job_id == "slow":
                    await released.wait()
                else:
                    fast.set()
        service = TaskService(Store(), None, Runner(), None)
        pending = asyncio.create_task(service.deadline_tick())
        try:
            await asyncio.wait_for(fast.wait(), 1)
        finally:
            released.set()
            await pending

    async def test_rejected_cancel_still_observes_completed_provider(self):
        self.runner.hang = True
        task = await self.ready()
        pending = asyncio.create_task(self.service.run_task(task["id"]))
        for _ in range(500):
            if (await self.service.get(task["id"], self.user))["status"] == "running":
                break
            await asyncio.sleep(.001)
        async def rejected(job_id):
            raise MendError("runner_unavailable", "Fixture completed job rejects cancel.", 502)
        self.runner.cancel = rejected
        self.runner.hang = False
        await self.service.cancel(task["id"], self.user)
        await asyncio.wait_for(pending, 2)
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertEqual(raw["status"], "stopped")
        self.assertIsNotNone(raw["attempts"][-1]["resolved_at"])

    async def test_internal_cancel_reason_maps_to_reviewed_enum_with_diagnostic(self):
        async def ambiguous(*args):
            raise MendError("runner_ambiguous", "Fixture ambiguous dispatch.", 502)
        self.runner.submit = ambiguous
        task = await self.ready()
        await self.service.run_task(task["id"])
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertEqual(raw["status"], "stopping")
        self.assertEqual(raw["stop_reason"], "termination_unconfirmed")
        events = self.store.call("events", {"task_id": task["id"], "user_id": self.user})
        self.assertIn("runner_ambiguous", [e["payload"].get("code") for e in events])

    async def test_cancelled_draft_is_pending_and_stops_without_contract(self):
        task = await self.service.create(self.user, "CSV", str(uuid.uuid4()))
        await self.service.cancel(task["id"], self.user)
        self.assertIn(task["id"], [t["id"] for t in self.store.call("pending", {})])
        await self.service.run_task(task["id"])
        self.assertEqual((await self.service.get(task["id"], self.user))["status"], "stopped")
        self.assertEqual(self.model.calls, 0)

    async def test_cancel_and_total_deadline_are_due_without_job_deadline(self):
        task = await self.ready()
        await self.service.cancel(task["id"], self.user)
        self.assertEqual(self.store.call("due", {})[0]["attempt_id"], None)
        await self.service.deadline_tick()
        self.assertEqual((await self.service.get(task["id"], self.user))["status"], "stopped")
        task = await self.ready()
        self.clock.advance(601)
        await self.service.deadline_tick()
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "stopped")
        self.assertEqual(current["stop_reason"], "task_timeout")

    async def test_expired_owner_read_and_short_start_window_rejected(self):
        task = await self.service.create(self.user, "CSV", str(uuid.uuid4()))
        task = await self.service.propose(task["id"], self.user, 1)
        self.clock.advance(86400 - 599)
        with self.assertRaises(MendError) as result:
            await self.service.start(task["id"], self.user, task["contract_version"])
        self.assertEqual(result.exception.code, "retention_window")
        self.clock.advance(600)
        with self.assertRaises(MendError):
            await self.service.get(task["id"], self.user)

    async def test_surrogate_prompt_is_safe_validation_error(self):
        with self.assertRaises(MendError) as result:
            await self.service.create(self.user, "\ud800", str(uuid.uuid4()))
        self.assertEqual(result.exception.code, "invalid_task")

    async def test_reordered_evidence_has_identical_semantic_hashes(self):
        ids = curated_contract()["required_check_ids"]
        first = {"checks": {"check_ids": ids, "results": [{"check_id": i, "status": "failed"} for i in ids]},
                 "command_results": [{"command_id": "unit-tests", "argv": ["python", "-m", "unittest"], "exit_code": 1}]}
        other = copy.deepcopy(first)
        other["checks"]["check_ids"].reverse()
        other["checks"]["results"].reverse()
        self.assertEqual(failure_signature(first, 1), failure_signature(other, 1))
        self.assertEqual(canonical_json(semantic_diagnostics(first)), canonical_json(semantic_diagnostics(other)))
        other["command_results"][0]["argv"].reverse()
        self.assertNotEqual(canonical_json(semantic_diagnostics(first)), canonical_json(semantic_diagnostics(other)))

    async def test_fixture_initial_failure_is_independent_per_task(self):
        first = await self.ready()
        await self.service.run_task(first["id"])
        second = await self.ready()
        await self.service.run_task(second["id"])
        self.assertEqual((await self.service.get(first["id"], self.user))["execution_count"], 2)
        self.assertEqual((await self.service.get(second["id"], self.user))["execution_count"], 2)

    async def test_download_ttl_fits_retention_and_request_budget(self):
        task = await self.ready()
        await self.service.run_task(task["id"])
        self.clock.advance(86400 - 20)
        self.artifact_store.timeout = 15
        links = await self.service.artifacts(task["id"], self.user)
        self.assertEqual(links["bundle"]["expires_seconds"], 5)
        self.clock.advance(6)
        with self.assertRaises(MendError) as result:
            await self.service.artifacts(task["id"], self.user)
        self.assertEqual(result.exception.code, "artifact_expired")

    async def test_truncated_system_marker_persists_once_outside_source_cap(self):
        task = await self.ready()
        await self.service.run_task(task["id"])
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        attempt = raw["attempts"][-1]
        payload = {"task_id": task["id"], "attempt_id": attempt["id"], "worker_id": self.service.worker_id,
                   "stream": "system", "message": "Provider arbitrary text", "truncated": True}
        self.store.call("output", payload)
        self.store.call("output", payload)
        events = self.store.call("events", {"task_id": task["id"], "user_id": self.user})
        markers = [event for event in events if event["truncated"]]
        self.assertEqual(len(markers), 1)
        self.assertEqual(markers[0]["message"], "Output truncated after 256 KB.")
        self.assertEqual(markers[0]["stream"], "system")

    async def test_private_sqlite_creation_rejects_symlink_shared_file_and_legacy_data(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "private.sqlite")
            store = LocalTestStore(path)
            store.close()
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            parent_mode = stat.S_IMODE(os.stat(folder).st_mode)
            link = os.path.join(folder, "alias.sqlite")
            os.symlink(path, link)
            with self.assertRaises(MendError):
                LocalTestStore(link)
            os.chmod(path, 0o640)
            with self.assertRaises(MendError):
                LocalTestStore(path)
            self.assertEqual(stat.S_IMODE(os.stat(folder).st_mode), parent_mode)
            legacy = os.path.join(folder, "legacy.sqlite")
            db = sqlite3.connect(legacy)
            db.execute("CREATE TABLE tasks(id TEXT PRIMARY KEY,value TEXT NOT NULL)")
            db.execute("INSERT INTO tasks VALUES ('legacy','{}')")
            db.commit()
            db.close()
            os.chmod(legacy, 0o600)
            with self.assertRaises(MendError) as result:
                LocalTestStore(legacy)
            self.assertEqual(result.exception.code, "local_schema_upgrade")

    async def test_next_sequence_is_next_unused_and_attribution_survives_replay(self):
        task = await self.ready()
        await self.service.run_task(task["id"])
        records = self.store.call("events", {"task_id": task["id"], "user_id": self.user})
        raw = self.store.call("get_task", {"task_id": task["id"], "user_id": self.user})
        self.assertEqual(raw["next_sequence"], records[-1]["sequence"] + 1)
        logs = [event for event in records if event["event_type"] == "log" and event["stream"] in {"stdout", "stderr"}]
        self.assertTrue(logs)
        self.assertTrue(all(event["payload"]["provider_stream"] == "unattributed" for event in logs))
        observations = [event for event in records if event["payload"].get("code") in {"attempt_reserved", "attempt_resolved"}]
        self.assertEqual(len(observations), 4)
        self.assertTrue(all("provider_stream" not in event["payload"] for event in observations))

    async def interrupt_after_bundle_write(self):
        original_put = self.artifact_store.put
        interrupted = False
        def crash_after_bundle(task_id, user_id, key, data):
            nonlocal interrupted
            result = original_put(task_id, user_id, key, data)
            if key == "final/bundle.zip" and not interrupted:
                interrupted = True
                raise asyncio.CancelledError()
            return result
        self.artifact_store.put = crash_after_bundle
        task = await self.ready()
        try:
            with self.assertRaises(asyncio.CancelledError):
                await self.service.run_task(task["id"])
        finally:
            self.artifact_store.put = original_put
        self.assertEqual((await self.service.get(task["id"], self.user))["status"], "finalizing")
        return task

    async def test_finalizing_recovery_reuses_identical_immutable_artifact(self):
        task = await self.interrupt_after_bundle_write()
        reads = []
        original_get = self.artifact_store.get
        def record_get(key):
            reads.append(key)
            return original_get(key)
        self.artifact_store.get = record_get
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "passed")
        self.assertEqual(self.runner.submissions, 2)
        # Conflict comparison fetched the real stored bundle; reuse that read.
        self.assertEqual(sum(key.endswith("/final/bundle.zip") for key in reads), 1)
        self.assertEqual(len(reads), 2)  # Recovery snapshot plus final bundle.

    async def test_fresh_final_bundle_requires_actual_storage_readback(self):
        reads = []
        original_get = self.artifact_store.get
        def record_get(key):
            reads.append(key)
            return original_get(key)
        self.artifact_store.get = record_get
        task = await self.ready()
        await self.service.run_task(task["id"])
        self.assertEqual((await self.service.get(task["id"], self.user))["status"], "passed")
        self.assertEqual(len(reads), 1)
        self.assertTrue(reads[0].endswith("/final/bundle.zip"))
        await self.service.run_task(task["id"])
        self.assertEqual(len(reads), 1)  # A terminal task does not fetch evidence again.

    async def test_corrupt_fresh_storage_bytes_cannot_use_submitted_bundle_as_proof(self):
        original_get = self.artifact_store.get
        def corrupt_get(key):
            return b"corrupt stored archive" if key.endswith("/final/bundle.zip") else original_get(key)
        self.artifact_store.get = corrupt_get
        task = await self.ready()
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])
        self.assertEqual(current["stop_reason"], "invalid_bundle")

    async def test_corrupt_conflict_readback_blocks_recovered_receipt(self):
        task = await self.interrupt_after_bundle_write()
        original_get = self.artifact_store.get
        def corrupt_get(key):
            return b"corrupt stored archive" if key.endswith("/final/bundle.zip") else original_get(key)
        self.artifact_store.get = corrupt_get
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])
        self.assertEqual(current["stop_reason"], "artifact_conflict")
        self.assertEqual(self.runner.submissions, 2)

    async def test_missing_conflict_artifact_blocks_recovered_receipt(self):
        task = await self.interrupt_after_bundle_write()
        original_get = self.artifact_store.get
        def missing_get(key):
            if key.endswith("/final/bundle.zip"):
                raise MendError("artifact_not_found", "Local fixture artifact was removed.", 404)
            return original_get(key)
        self.artifact_store.get = missing_get
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])
        self.assertEqual(current["stop_reason"], "artifact_not_found")
        self.assertEqual(self.runner.submissions, 2)

    async def test_cancellation_after_bundle_write_prevents_recovery_success(self):
        task = await self.interrupt_after_bundle_write()
        await self.service.cancel(task["id"], self.user)
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "stopped")
        self.assertIsNone(current["receipt"])
        self.assertEqual(self.runner.submissions, 2)

    async def test_expired_task_budget_prevents_bundle_recovery_success(self):
        task = await self.interrupt_after_bundle_write()
        self.clock.advance(601)
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])
        self.assertEqual(current["stop_reason"], "finalization_blocked")
        self.assertEqual(self.runner.submissions, 2)

    async def test_expired_retention_prevents_bundle_recovery_success_and_owner_read(self):
        task = await self.interrupt_after_bundle_write()
        self.clock.advance(86401)
        await self.service.run_task(task["id"])
        with self.assertRaises(MendError):
            await self.service.get(task["id"], self.user)
        current = self.store.call("get_task", {"task_id": task["id"], "worker_id": self.service.worker_id})
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])
        self.assertEqual(self.runner.submissions, 2)

    async def test_non_boolean_report_complete_cannot_print_receipt(self):
        original = self.runner.observe
        async def invalid(job_id):
            report = await original(job_id)
            if report["status"] == "passed":
                report["runner_report"]["complete"] = "yes"
            return report
        self.runner.observe = invalid
        task = await self.ready()
        await self.service.run_task(task["id"])
        current = await self.service.get(task["id"], self.user)
        self.assertEqual(current["status"], "needs_help")
        self.assertIsNone(current["receipt"])

    async def test_local_usage_rejects_nonfinite_and_negative_actual_values(self):
        task = await self.ready()
        self.store.call("claim_worker", {"task_id": task["id"], "worker_id": self.service.worker_id})
        for patch in ({"cost": float("nan")}, {"actual_tokens": -1}, {"actual_cost": -1}, {"token_count": True}):
            payload = {"task_id": task["id"], "worker_id": self.service.worker_id, "token_count": 0, "cost": 0, **patch}
            with self.assertRaises(MendError):
                self.store.call("usage", payload)

    async def test_unknown_fixture_job_never_fabricates_stop_after_restart(self):
        evidence = await self.runner.observe("missing-fixture-job")
        self.assertEqual(evidence["status"], "unknown")
        self.assertNotIn("provider_stopped_at", evidence)
        with self.assertRaises(MendError):
            await self.runner.cancel("missing-fixture-job")


if __name__ == "__main__":
    unittest.main()
