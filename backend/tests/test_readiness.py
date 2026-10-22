"""Actual HTTP readiness with fixture transport; live acceptance is separate."""
import base64
import asyncio
import io
import json
import threading
import time
import unittest
from unittest.mock import patch

from mend.artifacts import LocalArtifacts
from mend.config import Settings
from mend.repository import SupabaseRepository
from mend.service import TaskService
from fastapi.testclient import TestClient
from mend.api import create_app


class Response(io.BytesIO):
    status = 200


class ReadinessTests(unittest.TestCase):
    def test_probe_deadline_keeps_one_transport_slot_until_real_completion(self):
        release = threading.Event()
        calls = []
        def slow_response(req, timeout):
            calls.append(req)
            release.wait(timeout=2)
            return Response(b'{"schema_version":1,"gate_present":true,"live_execution_enabled":false}')
        repo = SupabaseRepository("https://example.supabase.co", "fixture", opener=slow_response)
        async def exercise():
            started = time.monotonic()
            try:
                with patch("mend.repository.PROBE_DEADLINE_SECONDS", 0.05):
                    with self.assertRaises(TimeoutError):
                        await repo.runtime_probe()
                self.assertLess(time.monotonic() - started, 0.5)
                for _ in range(10):
                    with self.assertRaisesRegex(Exception, "Database status is unavailable"):
                        await repo.runtime_probe()
                self.assertEqual(len(calls), 1)
            finally:
                release.set()
        asyncio.run(exercise())
        self.assertFalse(repo._probe_inflight.locked())

    def test_cancelled_caller_does_not_release_an_active_probe_slot(self):
        release, entered = threading.Event(), threading.Event()
        def slow_response(req, timeout):
            entered.set(); release.wait(timeout=2)
            return Response(b'{}')
        repo = SupabaseRepository("https://example.supabase.co", "fixture", opener=slow_response)
        async def exercise():
            pending = asyncio.create_task(repo.runtime_probe())
            try:
                while not entered.is_set():
                    await asyncio.sleep(0.001)
                pending.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await pending
                self.assertTrue(repo._probe_inflight.locked())
                with self.assertRaisesRegex(Exception, "Database status is unavailable"):
                    await repo.runtime_probe()
            finally:
                release.set()
        asyncio.run(exercise())
        self.assertFalse(repo._probe_inflight.locked())

    def client(self, result=None, *, mode="database_only", live=False, fail=False):
        self.calls = []
        def request(req, timeout):
            self.calls.append((req, timeout))
            if fail:
                raise TimeoutError("PRIVATE_CONNECTION_SECRET")
            return Response(json.dumps(result).encode())
        repo = SupabaseRepository("https://example.supabase.co", "fixture-private-key", opener=request)
        settings = Settings(mode=mode, public_origin="https://mend.test", allowed_origins=("https://mend.test",),
            supabase_url="https://example.supabase.co", supabase_service_role_key="fixture-private-key",
            session_seal_key=base64.urlsafe_b64encode(b"s"*32).decode(), live_enabled=live,
            token_factory_key="fixture", nebius_iam_token="fixture", nebius_project_id="fixture",
            runner_image_digest="registry.example/image@sha256:"+"a"*64)
        service = TaskService(repo, None, None, LocalArtifacts())
        return TestClient(create_app(service, settings, None), base_url="https://mend.test")

    def test_database_only_reports_a_real_probe_but_keeps_execution_locked(self):
        with self.client({"schema_version":1,"gate_present":True,"live_execution_enabled":False}) as client:
            response=client.get("/readyz")
        self.assertEqual(response.status_code,503)
        body=response.json()
        self.assertEqual(body.get("database"), {"status":"verified","source":"supabase_rpc","release_gate":"disabled"})
        self.assertIn("database_release_gate_disabled",body["blockers"])
        self.assertFalse(body["ready"])
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.calls[0][0].full_url,"https://example.supabase.co/rest/v1/rpc/mend_runtime_probe")
        self.assertEqual(json.loads(self.calls[0][0].data),{})
        self.assertEqual(self.calls[0][1],10)

    def test_connection_error_is_redacted_and_cannot_enable_start(self):
        with self.client(fail=True,mode="live",live=True) as client:
            response=client.get("/readyz")
        body=response.json()
        self.assertEqual(response.status_code,503)
        self.assertFalse(body["ready"])
        self.assertIn("database_unavailable",body["blockers"])
        self.assertEqual(body.get("database",{}).get("status"),"unavailable")
        self.assertNotIn("PRIVATE",response.text)
        self.assertEqual(len(self.calls),1)

    def test_malformed_and_contradictory_database_results_fail_closed(self):
        for result in ({},[],{"schema_version":True,"gate_present":True,"live_execution_enabled":True},
                       {"schema_version":1,"gate_present":True,"live_execution_enabled":"true"},
                       {"schema_version":1,"gate_present":False,"live_execution_enabled":True}):
            with self.subTest(result=result), self.client(result,mode="live",live=True) as client:
                body=client.get("/readyz").json()
                self.assertFalse(body["ready"])
                self.assertIn("database_unavailable",body["blockers"])

    def test_missing_gate_is_not_confused_with_release_permission(self):
        with self.client({"schema_version":1,"gate_present":False,"live_execution_enabled":False},mode="live",live=True) as client:
            body=client.get("/readyz").json()
        self.assertFalse(body["ready"])
        self.assertIn("database_release_gate_missing",body["blockers"])

    def test_local_mode_does_not_contact_or_claim_the_real_database(self):
        with self.client(mode="local_test") as client:
            body=client.get("/readyz").json()
        self.assertFalse(body["ready"])
        self.assertEqual(self.calls,[])
        self.assertEqual(body.get("database",{}).get("status"),"not_checked")

    def test_consistent_gates_can_be_ready_without_claiming_provider_verification(self):
        with self.client({"schema_version":1,"gate_present":True,"live_execution_enabled":True},mode="live",live=True) as client:
            response=client.get("/readyz")
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()["ready"])
        self.assertEqual(response.json()["provider_verification"],"not_established_by_this_endpoint")
        self.assertEqual(response.headers["cache-control"],"no-store")
