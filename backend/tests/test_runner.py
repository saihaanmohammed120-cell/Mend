import copy
import datetime as dt
import unittest
import tempfile
import os
import sys
import asyncio
from unittest.mock import patch

from mend.domain import MendError, canonical_json, curated_contract, initial_files, source_sha256
from mend.runner import NebiusRunner
from mend.supervisor import ReportError, sign_report, verify_report


class Transport:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    async def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        response = self.replies.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    def runner(self, transport, **kwargs):
        return NebiusRunner("cloud-test-token", "project-test", "registry/image@sha256:" + "a" * 64,
            subnet_id="subnet-test", platform="cpu-test", preset="preset-test", transport=transport,
            clock=lambda: dt.datetime(2026, 10, 11, tzinfo=dt.timezone.utc), **kwargs)

    def inputs(self):
        contract = curated_contract()
        files = initial_files(contract)
        attempt = {"id": "attempt-1", "submission_key": "submission-1",
                   "snapshot_sha256": source_sha256(files),
                   "dispatch_requested_at": "2026-10-11T00:00:00Z",
                   "deadline_at": "2026-10-11T00:01:00Z"}
        return {"id": "task-1"}, attempt, files, contract

    async def test_live_gate_blocks_all_submission_requests(self):
        transport = Transport()
        with self.assertRaisesRegex(MendError, "blocked"):
            await self.runner(transport).submit(*self.inputs())
        self.assertEqual(transport.calls, [])

    async def test_native_timeout_is_3600_not_backend_deadline(self):
        transport = Transport({"items": []}, {"id": "operation-1", "done": False},
            {"items": [{"metadata": {"id": "job-1", "name": "mend-submission-1"}}]})
        result = await self.runner(transport, release_enabled=True).submit(*self.inputs())
        self.assertEqual(result, "job-1")
        body = transport.calls[1][2]["json_body"]
        self.assertEqual(body["spec"]["timeout"], "3600s")
        self.assertEqual(body["spec"]["environmentVariables"], [])
        self.assertNotIn("cloud-test-token", canonical_json(body).decode())

    async def test_submission_name_reconciles_without_create(self):
        transport = Transport({"items": [{"metadata": {"id": "job-existing", "name": "mend-submission-1"}}]})
        self.assertEqual(await self.runner(transport, release_enabled=True).submit(*self.inputs()), "job-existing")
        self.assertEqual(len(transport.calls), 1)

    async def test_operation_acknowledgment_never_invents_job_id(self):
        transport = Transport({"items": []}, {"id": "operation-1", "done": False}, {"items": []})
        with self.assertRaisesRegex(MendError, "identity"):
            await self.runner(transport, release_enabled=True).submit(*self.inputs())
        self.assertEqual(sum(call[0] == "POST" for call in transport.calls), 1)

    async def test_cancel_ack_is_not_stop_evidence(self):
        transport = Transport({"id": "operation-cancel"})
        self.assertFalse((await self.runner(transport).cancel("job-1"))["stopped"])
        self.assertTrue(transport.calls[0][1].endswith("/jobs/cancel"))
        self.assertEqual(transport.calls[0][2]["json_body"], {"id": "job-1"})

    async def test_terminal_without_stop_time_stays_unresolved(self):
        transport = Transport({"items": [{"metadata": {"id": "job-1"}, "status": {"state": "COMPLETED"}}]})
        self.assertEqual((await self.runner(transport).observe("job-1"))["status"], "unknown")

    async def test_stdout_cannot_become_report(self):
        transport = Transport({"items": [{"metadata": {"id": "job-1"},
            "status": {"state": "COMPLETED", "finishedAt": "2026-10-11T00:00:20Z", "exitCode": 0}}]})
        result = await self.runner(transport).observe("job-1")
        self.assertEqual(result["status"], "unknown")
        self.assertNotIn("runner_report", result)
        self.assertTrue(result["job_terminal"])
        self.assertFalse(result["termination_verified"])
        self.assertIsNone(result["provider_stopped_at"])
        self.assertEqual(result["workload_finished_at"], "2026-10-11T00:00:20Z")
        self.assertNotIn("exit_code", result)

    async def test_recovery_reconciliation_is_read_only_and_requires_unique_job(self):
        for replies, status in (({"items": []}, "ambiguous"),
                ({"items": [{"metadata": {"name": "mend-submission-1", "id": "job-1"}}]}, "found"),
                ({"items": [{"metadata": {"name": "mend-submission-1", "id": "job-1"}},
                            {"metadata": {"name": "mend-submission-1", "id": "job-2"}}]}, "ambiguous"),
                ({"items": [], "nextPageToken": None}, "ambiguous")):
            transport = Transport(replies)
            result = await self.runner(transport).reconcile("submission-1")
            self.assertEqual(result["status"], status)
            self.assertEqual(len(transport.calls), 1)
            self.assertEqual(transport.calls[0][0], "GET")
            if status == "found":
                self.assertEqual(result["job_id"], "job-1")
            else:
                self.assertIsNone(result["job_id"])

    async def test_unknown_list_and_paginated_list_fail_closed(self):
        for reply in ({"operations": []}, {"items": [], "nextPageToken": []}):
            transport = Transport(reply)
            with self.assertRaises(MendError):
                await self.runner(transport, release_enabled=True).submit(*self.inputs())
            self.assertEqual(len(transport.calls), 1)

    async def test_source_mismatch_and_expired_deadline_prevent_dispatch(self):
        for change in ("source", "deadline"):
            transport = Transport()
            task, attempt, files, contract = self.inputs()
            if change == "source":
                files["csv_tools.py"] += "\n# Different source\n"
            else:
                attempt["deadline_at"] = "2026-10-10T00:00:00Z"
            with self.assertRaises(MendError):
                await self.runner(transport, release_enabled=True).submit(task, attempt, files, contract)
            self.assertEqual(transport.calls, [])

    async def test_cli_environment_rejects_ambient_credentials(self):
        with self.assertRaises(MendError):
            self.runner(Transport(), cli_env={"SUPABASE_SERVICE_ROLE_KEY": "private"})

    async def test_metadata_wrong_types_fail_closed(self):
        for value in (None, [], "unknown"):
            transport = Transport({"items": [{"metadata": value}]})
            self.assertEqual((await self.runner(transport).reconcile("submission-1"))["status"], "ambiguous")

    async def test_bounded_pagination_finds_existing_job(self):
        transport = Transport({"items": [], "nextPageToken": "next"},
            {"items": [{"metadata": {"name": "mend-submission-1", "id": "job-1"}}]})
        result = await self.runner(transport).reconcile("submission-1")
        self.assertEqual(result["job_id"], "job-1")
        self.assertIn("pageToken=next", transport.calls[1][1])
        self.assertTrue(all(call[0] == "GET" for call in transport.calls))

    async def test_pagination_cycles_counts_and_pages_are_bounded(self):
        for replies, count in (([{"items": [], "nextPageToken": "same"}] * 2, 2),
                               ([{"items": [{"metadata": {}}] * 1001}], 1),
                               ([{"items": [], "nextPageToken": str(number)} for number in range(10)], 10)):
            transport = Transport(*replies)
            result = await self.runner(transport).reconcile("submission-1")
            self.assertEqual(result["status"], "ambiguous")
            self.assertEqual(len(transport.calls), count)

    async def test_sdk_states_are_recognized(self):
        for state in ("PROVISIONING", "STARTING", "IMAGE_PULLING", "ERROR", "CANCELLING"):
            transport = Transport({"items": [{"metadata": {"id": "job-1"}, "status": {"state": state}}]})
            result = await self.runner(transport).observe("job-1")
            self.assertEqual(result["status"], "submitted" if state in {"PROVISIONING", "STARTING", "IMAGE_PULLING"} else "unknown")
            self.assertEqual(result["job_terminal"], state == "ERROR")

    def terminal_reply(self):
        return {"items": [{"metadata": {"id": "job-1"}, "status": {
            "state": "COMPLETED", "finishedAt": "2026-10-10T23:59:00Z"}}]}

    async def test_report_errors_and_timeouts_preserve_workload_observation(self):
        async def broken(job):
            raise OSError("storage unavailable")
        async def hanging(job):
            await asyncio.sleep(60)
        for reader in (broken, hanging):
            result = await self.runner(Transport(self.terminal_reply()), report_reader=reader,
                                       reader_timeout=0.01).observe("job-1")
            self.assertTrue(result["job_terminal"])
            self.assertEqual(result["workload_finished_at"], "2026-10-10T23:59:00Z")
            self.assertIsNone(result["provider_stopped_at"])
            self.assertEqual(result["report_diagnostic"], "trusted_report_unavailable")

    async def test_independent_termination_requires_correct_job_and_temporal_order(self):
        valid = {"job_id": "job-1", "termination_verified": True, "provider_stopped_at": "2026-10-10T23:59:10Z",
                 "verification": {"kind": "independent_termination", "reference": "reviewed-provider-stop-record"}}
        for change in ({}, {"job_id": "job-other"}, {"provider_stopped_at": "2026-10-11T00:00:10Z"},
                       {"provider_stopped_at": "2026-10-10T23:58:00Z"}, {"provider_stopped_at": "2026-10-10T23:59:10"},
                       {"verification": {"kind": "job_terminal_observation", "reference": "not-stop-proof"}}):
            async def reader(job):
                return {**valid, **change}
            result = await self.runner(Transport(self.terminal_reply()), termination_reader=reader).observe("job-1")
            self.assertEqual(result["termination_verified"], not bool(change))
            if not change:
                self.assertEqual(result["resolution_evidence"]["kind"], "provider_terminal")
            else:
                self.assertIsNone(result["provider_stopped_at"])

    async def test_synchronous_evidence_readers_are_rejected(self):
        with self.assertRaises(MendError):
            self.runner(Transport(), report_reader=lambda job: {})

    async def test_listing_deadline_exhaustion_prevents_network(self):
        transport = Transport()
        with patch("mend.runner.time.monotonic", side_effect=[0.0, 11.0]):
            self.assertEqual((await self.runner(transport).reconcile("submission-1"))["status"], "ambiguous")
        self.assertEqual(transport.calls, [])

    async def test_missing_cli_and_failed_cli_raise_safe_errors(self):
        with self.assertRaises(MendError):
            async for _ in self.runner(Transport(), cli_path="/mend-no-such-cli").stream_logs("job-1"):
                pass
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "trusted-cli")
            with open(path, "w") as handle:
                handle.write("#!" + sys.executable + "\nimport sys\nsys.exit(2)\n")
            os.chmod(path, 0o700)
            with self.assertRaisesRegex(MendError, "incomplete"):
                async for _ in self.runner(Transport(), cli_path=path).stream_logs("job-1"):
                    pass

    async def test_real_cli_utf8_split_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "trusted-cli")
            with open(path, "w") as handle:
                handle.write("#!" + sys.executable + "\nimport os,time\n"
                             "os.write(1,b'\\xe2');time.sleep(.03);os.write(1,b'\\x82\\xac')\n")
            os.chmod(path, 0o700)
            chunks = [item async for item in self.runner(Transport(), cli_path=path).stream_logs("job-1")]
            self.assertEqual("".join(item["message"] for item in chunks), "€")

    async def test_real_trusted_cli_fixture_streams_and_caps_output(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "trusted-cli")
            with open(path, "w") as handle:
                handle.write("#!" + sys.executable + "\nimport sys\n"
                             "assert sys.argv[1:] == ['ai','job','logs','job-1','--follow','--tail','1000']\n"
                             "print('trusted fixture stdout', flush=True)\n")
            os.chmod(path, 0o700)
            chunks = [item async for item in self.runner(Transport(), cli_path=path).stream_logs("job-1", max_bytes=5)]
            self.assertEqual(chunks[0]["message"], "trust")
            self.assertEqual(chunks[-1]["stream"], "system")
            self.assertTrue(chunks[-1]["truncated"])

    async def test_log_timeout_kills_trusted_fixture(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "trusted-cli")
            with open(path, "w") as handle:
                handle.write("#!" + sys.executable + "\nimport time\ntime.sleep(30)\n")
            os.chmod(path, 0o700)
            chunks = [item async for item in self.runner(Transport(), cli_path=path).stream_logs("job-1", timeout=0.03)]
            self.assertEqual(chunks, [])


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.contract = curated_contract()
        self.expected = {name: "identity-" + name for name in ("task_id", "attempt_id", "job_id",
            "contract_sha256", "snapshot_sha256", "protected_checks_sha256", "image_digest", "model_id")}
        self.report = {**self.expected, "source": "live", "complete": True, "passed": True,
            "command_results": [{"command_id": "unit-tests", "argv": self.contract["commands"][0]["argv"], "exit_code": 0}],
            "checks": {"total": 4, "passed": 4, "failed": 0, "skipped": 0,
                "results": [{"check_id": name, "status": "passed"} for name in self.contract["required_check_ids"]]}}
        self.key = b"test-controller-authority-key-32bytes"

    def test_signed_report_is_bound_to_exact_attempt(self):
        envelope = sign_report(self.report, self.key)
        self.assertEqual(verify_report(envelope, self.key, self.expected, self.contract), self.report)
        with self.assertRaises(ReportError):
            verify_report(envelope, self.key, {**self.expected, "attempt_id": "different"}, self.contract)

    def test_changed_check_id_or_command_cannot_pass(self):
        for change in ("check", "command", "skip"):
            report = copy.deepcopy(self.report)
            if change == "check":
                report["checks"]["results"][0]["check_id"] = "invented.check"
            elif change == "command":
                report["command_results"][0]["argv"] = ["echo", "passed"]
            else:
                report["checks"]["results"][0]["status"] = "skipped"
            with self.assertRaises(ReportError):
                verify_report(sign_report(report, self.key), self.key, self.expected, self.contract)

    def test_unsigned_child_authored_report_is_rejected(self):
        envelope = sign_report(self.report, b"untrusted-candidate-key-32bytes!")
        with self.assertRaises(ReportError):
            verify_report(envelope, self.key, self.expected, self.contract)

    def test_authenticated_failed_report_can_supply_repair_evidence(self):
        report = copy.deepcopy(self.report)
        report["checks"]["results"][0]["status"] = "failed"
        report["checks"].update(passed=3, failed=1)
        report["command_results"][0]["exit_code"] = 1
        report["passed"] = False
        self.assertFalse(verify_report(sign_report(report, self.key), self.key,
                                      self.expected, self.contract)["passed"])
        envelope = sign_report(self.report, self.key)
        envelope["report"]["checks"]["passed"] = 100
        with self.assertRaises(ReportError):
            verify_report(envelope, self.key, self.expected, self.contract)

    def test_malformed_report_fields_raise_report_errors(self):
        for field in ("command", "check", "status", "signature", "serialization"):
            report = copy.deepcopy(self.report)
            if field == "command":
                report["command_results"][0]["command_id"] = {}
            elif field == "check":
                report["checks"]["results"][0]["check_id"] = []
            elif field == "status":
                report["checks"]["results"][0]["status"] = {}
            elif field == "serialization":
                report["invalid"] = float("nan")
            with self.assertRaises(ReportError):
                envelope = sign_report(report, self.key)
                if field == "signature":
                    envelope["signature"] = "é" * 64
                verify_report(envelope, self.key, self.expected, self.contract)

    def test_zero_checks_cannot_be_authenticated_as_success(self):
        contract = copy.deepcopy(self.contract)
        contract["required_check_ids"] = []
        with self.assertRaises(ReportError):
            verify_report(sign_report(self.report, self.key), self.key, self.expected, contract)


if __name__ == "__main__":
    unittest.main()
