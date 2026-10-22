"""Authenticated reader fixtures only; no provider, database or signing service calls."""
import asyncio
import copy
import datetime as dt
import hashlib
import unittest
from unittest.mock import AsyncMock
from types import SimpleNamespace

from mend.domain import (MendError, canonical_json, curated_contract, initial_files,
                         protected_checks_sha256, source_sha256)
from mend.evidence_readers import PersistedTaskContext
from mend.runner import NebiusRunner
from mend.supervisor import canonical, sign_report


NOW = dt.datetime(2026, 10, 21, tzinfo=dt.timezone.utc)
REPORT_KEY = b"offline-controller-key-never-use-live-0001"
STOP_KEY = b"offline-independent-observer-key-00000002"


class EvidenceReaderTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        contract = curated_contract()
        self.context = {"project_id": "project-1", "task": {
            "id": "task-1", "contract": contract,
            "contract_sha256": hashlib.sha256(canonical_json(contract)).hexdigest(),
            "protected_checks_sha256": protected_checks_sha256(contract)}, "attempt": {
            "id": "attempt-1", "task_id": "task-1", "ordinal": 1, "job_id": "job-1",
            "model_id": "nvidia/offline-fixture", "image_digest": "sha256:" + "a" * 64,
            "snapshot_sha256": source_sha256(initial_files(contract)),
            "dispatch_requested_at": "2026-10-20T23:59:00Z", "deadline_at": "2026-10-21T00:00:00Z"}}
        task, attempt = self.context["task"], self.context["attempt"]
        identities = {key: attempt[key] for key in ("job_id", "model_id", "image_digest", "snapshot_sha256")}
        identities.update(task_id=task["id"], attempt_id=attempt["id"],
            contract_sha256=task["contract_sha256"], protected_checks_sha256=task["protected_checks_sha256"],
            provider_project_id="project-1", execution_ordinal=1, schema_version=1, source="live")
        self.report = {**identities, "observer_id": "protected-controller", "observer_version": "reviewed-v1",
            "complete": True, "passed": True,
            "command_results": [{"command_id": "unit-tests", "argv": contract["commands"][0]["argv"], "exit_code": 0}],
            "checks": {"total": 4, "passed": 4, "failed": 0, "skipped": 0,
                "results": [{"check_id": key, "status": "passed"} for key in contract["required_check_ids"]]}}
        self.stop = {**identities, "observer_id": "independent-resource-observer", "observer_version": "reviewed-v1",
            "resource_id": "vm-1", "observation_api": "reviewed-provider-resource-observation-v1",
            "job_terminal": True, "stopped": True, "termination_verified": True,
            "workload_finished_at": "2026-10-20T23:59:10Z", "provider_stopped_at": "2026-10-20T23:59:20Z",
            "verification": {"kind": "independent_termination", "reference": "provider-record:vm-1"}}
        self.lookup = AsyncMock(side_effect=lambda job: copy.deepcopy(self.context))
        self.transport = AsyncMock()

    def readers(self, **overrides):
        from mend.evidence_readers import TrustedEvidenceReaders
        config = dict(project_id="project-1", report_key=REPORT_KEY, termination_key=STOP_KEY,
            access_token="offline-evidence-access-placeholder", context_reader=self.lookup,
            transport=self.transport, timeout=0.05, clock=lambda: NOW)
        config.update(overrides)
        return TrustedEvidenceReaders("https://evidence.example", **config)

    async def test_valid_report_and_stop_are_authenticated_and_bound_before_runner_use(self):
        report_envelope, stop_envelope = sign_report(self.report, REPORT_KEY), sign_report(self.stop, STOP_KEY)
        self.transport.request.side_effect = [report_envelope, stop_envelope]
        readers = self.readers()
        report, stop = await readers.report("job-1"), await readers.termination("job-1")
        self.assertEqual(report["runner_report"], self.report)
        self.assertEqual(report["report_evidence"]["envelope_sha256"], hashlib.sha256(canonical(report_envelope)).hexdigest())
        self.assertIs(stop["termination_verified"], True)
        self.assertEqual(stop["verification"]["envelope_sha256"], hashlib.sha256(canonical(stop_envelope)).hexdigest())
        calls = self.transport.request.call_args_list
        self.assertEqual([call.args[:2] for call in calls], [
            ("GET", "https://evidence.example/v1/mend/jobs/job-1/report"),
            ("GET", "https://evidence.example/v1/mend/jobs/job-1/termination")])
        self.assertTrue(all(call.kwargs["max_bytes"] == 70000 and call.kwargs["timeout"] <= .05 for call in calls))

    async def test_every_signed_identity_is_bound_to_persisted_context(self):
        for key in ("task_id", "attempt_id", "job_id", "contract_sha256", "snapshot_sha256",
                    "protected_checks_sha256", "image_digest", "model_id", "provider_project_id", "execution_ordinal"):
            for method, original, signing_key in (("report", self.report, REPORT_KEY), ("termination", self.stop, STOP_KEY)):
                with self.subTest(key=key, method=method):
                    record = {**original, key: 2 if key == "execution_ordinal" else "another-identity"}
                    self.transport.request.return_value = sign_report(record, signing_key)
                    with self.assertRaises(MendError):
                        await getattr(self.readers(), method)("job-1")

    async def test_unsigned_tampered_and_cross_authority_records_are_rejected(self):
        for method, record, signing_key in (("report", self.report, REPORT_KEY), ("termination", self.stop, STOP_KEY)):
            changed = sign_report(copy.deepcopy(record), signing_key)
            changed["report"]["source"] = "workload_stdout"
            for envelope in (record, changed, sign_report(record, b"untrusted-workload-key-000000000000000"),
                             sign_report(record, STOP_KEY if method == "report" else REPORT_KEY)):
                with self.subTest(method=method, envelope_type=type(envelope).__name__):
                    self.transport.request.return_value = envelope
                    with self.assertRaises(MendError):
                        await getattr(self.readers(), method)("job-1")

    async def test_stop_cannot_be_inferred_from_flags_or_impossible_timestamps(self):
        for changes in ({"termination_verified": False}, {"stopped": False}, {"job_terminal": False},
                        {"provider_stopped_at": "2026-10-21T00:00:01Z"},
                        {"provider_stopped_at": "2026-10-20T23:58:59Z"},
                        {"workload_finished_at": "2026-10-20T23:59:30Z"},
                        {"workload_finished_at": "2026-10-21T00:00:01Z"},
                        {"workload_finished_at": "2026-10-20T23:59:10"},
                        {"resource_id": ""}, {"observation_api": ""}, {"observer_version": ""},
                        {"verification": {"kind": "job_terminal_observation", "reference": "cancel-ack"}}):
            with self.subTest(changes=changes):
                self.transport.request.return_value = sign_report({**self.stop, **changes}, STOP_KEY)
                with self.assertRaises(MendError):
                    await self.readers().termination("job-1")

    async def test_failed_report_is_bound_and_preserves_failed_checks(self):
        report = copy.deepcopy(self.report)
        report["passed"] = False
        report["checks"].update(passed=3, failed=1)
        report["checks"]["results"][0]["status"] = "failed"
        report["command_results"][0]["exit_code"] = 1
        self.transport.request.return_value = sign_report(report, REPORT_KEY)
        self.assertEqual((await self.readers().report("job-1"))["runner_report"], report)
        report["command_results"][0]["argv"] = ["echo", "passed"]
        self.transport.request.return_value = sign_report(report, REPORT_KEY)
        with self.assertRaises(MendError):
            await self.readers().report("job-1")

    async def test_invalid_context_never_reaches_evidence_endpoint(self):
        for target, key, value in (("attempt", "job_id", "other-job"), ("attempt", "task_id", "other-task"),
                                   ("task", "contract_sha256", "a" * 64), ("attempt", "snapshot_sha256", "")):
            with self.subTest(key=key):
                context = copy.deepcopy(self.context)
                context[target][key] = value
                self.lookup.side_effect = None
                self.lookup.return_value = context
                with self.assertRaises(MendError):
                    await self.readers().report("job-1")
        self.transport.request.assert_not_called()

    async def test_context_cannot_select_another_provider_project(self):
        self.context["project_id"] = "project-other"
        self.report["provider_project_id"] = "project-other"
        self.transport.request.return_value = sign_report(self.report, REPORT_KEY)
        with self.assertRaises(MendError):
            await self.readers().report("job-1")
        self.transport.request.assert_not_called()

    def test_paired_reader_cannot_attach_to_another_runner_project(self):
        with self.assertRaises(MendError):
            NebiusRunner("offline-cloud-token", "project-other", "registry/image@sha256:" + "a" * 64,
                subnet_id="subnet-1", platform="cpu-1", preset="preset-1", transport=self.transport,
                evidence_readers=self.readers())
        self.transport.request.assert_not_called()

    async def test_context_and_transport_timeouts_are_bounded_and_errors_are_safe(self):
        async def hanging(*args, **kwargs):
            await asyncio.sleep(10)
        self.lookup.side_effect = hanging
        with self.assertRaises(MendError) as caught:
            await self.readers(timeout=.01).report("job-1")
        self.assertNotIn("offline-evidence-access-placeholder", str(caught.exception))
        self.transport.request.assert_not_called()
        self.lookup.side_effect = lambda job: copy.deepcopy(self.context)
        self.transport.request.side_effect = hanging
        with self.assertRaises(MendError):
            await self.readers(timeout=.01).termination("job-1")

    async def test_oversized_records_are_rejected_even_with_injected_transport(self):
        self.transport.request.return_value = sign_report({**self.report, "padding": "x" * 70000}, REPORT_KEY)
        with self.assertRaises(MendError):
            await self.readers().report("job-1")

    def test_invalid_configuration_and_shared_signing_authority_are_rejected(self):
        for changes in ({"termination_key": REPORT_KEY}, {"report_key": b"short"},
                        {"context_reader": lambda job: self.context}, {"timeout": float("nan")},
                        {"access_token": "header\ninjection"}):
            with self.subTest(changes=list(changes)), self.assertRaises(MendError):
                self.readers(**changes)

    async def test_runner_paired_readers_accept_authenticated_data_and_fail_closed_on_tamper(self):
        from test_runner import Transport
        report_envelope = sign_report(self.report, REPORT_KEY)
        stop_envelope = sign_report(self.stop, STOP_KEY)
        self.transport.request.side_effect = [stop_envelope, report_envelope]
        persisted = {**self.context["task"], "source": "live", "attempts": [self.context["attempt"]]}
        task_reader = AsyncMock(return_value=persisted)
        context_reader = PersistedTaskContext("task-1", project_id="project-1", task_reader=task_reader)
        listing = {"items": [{"metadata": {"id": "job-1"}, "status": {
            "state": "COMPLETED", "finishedAt": self.stop["workload_finished_at"]}}]}
        runner = NebiusRunner("offline-cloud-token", "project-1", "registry/image@sha256:" + "a" * 64,
            subnet_id="subnet-1", platform="cpu-1", preset="preset-1", transport=Transport(listing, listing),
            evidence_readers=self.readers(context_reader=context_reader), clock=lambda: NOW)
        observation = await runner.observe("job-1")
        self.assertEqual(observation["status"], "passed")
        self.assertEqual(observation["runner_report"], self.report)
        expected_digest = hashlib.sha256(canonical(report_envelope)).hexdigest()
        self.assertEqual(observation["resolution_evidence"]["report_verification"]["envelope_sha256"], expected_digest)
        from mend.service import TaskService
        service = TaskService(SimpleNamespace(source="live"), None, None, None, clock=lambda: NOW)
        service._worker = AsyncMock()
        await service._resolve("task-1", self.context["attempt"], observation)
        persisted = service._worker.call_args.kwargs["resolution_evidence"]
        self.assertEqual(persisted["report_verification"]["envelope_sha256"], expected_digest)
        self.assertEqual(task_reader.await_count, 2)
        task_reader.assert_awaited_with("task-1")
        stop_envelope["report"]["job_id"] = "wrong-job"
        self.transport.request.side_effect = [stop_envelope, report_envelope]
        observation = await runner.observe("job-1")
        self.assertEqual(observation["status"], "unknown")
        self.assertFalse(observation["termination_verified"])
        self.assertIsNone(observation["provider_stopped_at"])

    async def test_persisted_context_reloads_attached_identity_for_every_read(self):
        task = {**self.context["task"], "source": "live", "attempts": [self.context["attempt"]]}
        task_reader = AsyncMock(return_value=task)
        lookup = PersistedTaskContext("task-1", project_id="project-1", task_reader=task_reader)
        readers = self.readers(context_reader=lookup)
        self.transport.request.return_value = sign_report(self.report, REPORT_KEY)
        self.assertEqual((await readers.report("job-1"))["runner_report"], self.report)
        task["attempts"][0]["snapshot_sha256"] = "b" * 64
        with self.assertRaises(MendError):
            await readers.report("job-1")
        self.assertEqual(task_reader.await_count, 2)

    async def test_persisted_context_rejects_missing_ambiguous_foreign_and_fixture_jobs_before_http(self):
        original = {**self.context["task"], "source": "live", "attempts": [self.context["attempt"]]}
        invalid = [None, {**original, "id": "other-task"}, {**original, "source": "local_test"},
            {key: value for key, value in original.items() if key != "source"},
            {**original, "attempts": []}, {**original, "attempts": {}},
            {**original, "attempts": [None]}, {**original, "attempts": original["attempts"] * 2},
            {**original, "attempts": [{**self.context["attempt"], "job_id": "other-job"}]},
            {**original, "attempts": [{**self.context["attempt"], "task_id": "other-task"}]},
            {**original, "attempts": original["attempts"] * 5}]
        task_reader = AsyncMock()
        readers = self.readers(context_reader=PersistedTaskContext("task-1", project_id="project-1", task_reader=task_reader))
        for task in invalid:
            with self.subTest(task=task):
                task_reader.return_value = task
                with self.assertRaises(MendError) as caught:
                    await readers.report("job-1")
                self.assertEqual(caught.exception.code, "evidence_unavailable")
        self.transport.request.assert_not_called()

    async def test_persisted_context_preserves_authorization_failure_and_bounded_wait(self):
        task_reader = AsyncMock(side_effect=MendError("lease_lost", "private lookup detail", 409))
        readers = self.readers(context_reader=PersistedTaskContext("task-1", project_id="project-1", task_reader=task_reader), timeout=.01)
        with self.assertRaises(MendError) as caught:
            await readers.report("job-1")
        self.assertNotIn("private lookup detail", str(caught.exception))
        async def hanging(task_id):
            await asyncio.sleep(10)
        task_reader.side_effect = hanging
        with self.assertRaises(MendError):
            await readers.termination("job-1")
        self.transport.request.assert_not_called()

    async def test_persisted_context_detaches_source_and_contract_before_controller_request(self):
        task = {**self.context["task"], "source": "live", "attempts": [self.context["attempt"]]}
        lookup = PersistedTaskContext("task-1", project_id="project-1", task_reader=AsyncMock(return_value=task))
        detached = await lookup("job-1")
        task["contract"]["commands"][0]["argv"][0] = "untrusted"
        task["attempts"][0]["snapshot_sha256"] = "b" * 64
        self.assertNotEqual(detached["task"]["contract"], task["contract"])
        self.assertNotEqual(detached["attempt"]["snapshot_sha256"], task["attempts"][0]["snapshot_sha256"])

    def test_persisted_context_requires_explicit_async_authorized_lookup(self):
        for reader in (None, lambda task_id: self.context):
            with self.subTest(reader=reader), self.assertRaises(MendError):
                PersistedTaskContext("task-1", project_id="project-1", task_reader=reader)

    async def test_external_cancellation_propagates_and_cancels_the_reader_wait(self):
        entered, cancelled = asyncio.Event(), asyncio.Event()
        async def hanging(job_id):
            entered.set()
            try:
                await asyncio.sleep(10)
            finally:
                cancelled.set()
        self.lookup.side_effect = hanging
        task = asyncio.create_task(self.readers(timeout=1).report("job-1"))
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(cancelled.is_set())
        self.transport.request.assert_not_called()

    def test_unsafe_origins_and_mixed_runner_readers_are_rejected_without_requests(self):
        from mend.evidence_readers import TrustedEvidenceReaders
        for origin in ("http://evidence.example", "https://user:secret@evidence.example", "https://evidence.example/path",
                       "https://evidence.example?secret=token", "https://evidence.example:8443"):
            with self.subTest(origin=origin), self.assertRaises(MendError):
                TrustedEvidenceReaders(origin, project_id="project-1", report_key=REPORT_KEY, termination_key=STOP_KEY,
                    access_token="offline-token", context_reader=self.lookup, transport=self.transport)
        with self.assertRaises(MendError):
            NebiusRunner("offline-cloud-token", "project-1", "registry/image@sha256:" + "a" * 64,
                subnet_id="subnet-1", platform="cpu-1", preset="preset-1", transport=self.transport,
                evidence_readers=self.readers(), report_reader=AsyncMock())
        self.transport.request.assert_not_called()
