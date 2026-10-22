"""Local safety regressions; these do not prove hosted database execution."""
import asyncio
import base64
import unittest
from unittest.mock import patch

from mend.bootstrap import build_runtime, database_repository_from_env
from mend.domain import MendError, curated_contract
from mend.config import https_origin
from mend.repository import SupabaseRepository
from mend.service import TaskService
from mend.worker import serve


class DatabaseInitializationTests(unittest.TestCase):
    def test_loopback_https_port_is_explicit_and_remote_port_remains_rejected(self):
        self.assertEqual(https_origin('https://localhost:8443'), 'https://localhost:8443')
        for invalid in ('http://localhost:8443', 'https://host.test:8443', 'https://localhost:0'):
            with self.subTest(invalid=invalid), self.assertRaises(MendError):
                https_origin(invalid)

    def environment(self):
        return {"MEND_MODE": "database_only", "MEND_LIVE_ENABLED": "false",
                "MEND_PUBLIC_ORIGIN": "https://mend.test", "MEND_ALLOWED_ORIGINS": "https://mend.test",
                "SUPABASE_URL": "https://supabase.test", "SUPABASE_SERVICE_ROLE_KEY": "fixture-server-key",
                "MEND_SESSION_SEAL_KEY": base64.urlsafe_b64encode(b"d" * 32).decode()}

    def test_database_mode_never_constructs_provider_clients(self):
        with patch("mend.bootstrap.TokenFactoryClient", side_effect=AssertionError("provider constructed")), \
             patch("mend.bootstrap.NebiusRunner", side_effect=AssertionError("provider constructed")):
            runtime = build_runtime(self.environment())
        try:
            self.assertIsInstance(runtime.service.store, SupabaseRepository)
            self.assertIsNone(runtime.service.model)
            self.assertIsNone(runtime.service.runner)
            self.assertIn("database_only_mode", runtime.settings.live_blockers())
        finally:
            runtime.close()

    def test_missing_server_credential_fails_closed(self):
        with self.assertRaises(MendError):
            database_repository_from_env({"SUPABASE_URL": "https://supabase.test"})

    def test_live_flag_cannot_enable_database_mode(self):
        with self.assertRaises(MendError) as caught:
            build_runtime({**self.environment(), "MEND_LIVE_ENABLED": "true"})
        self.assertEqual(caught.exception.code, "release_blocked")

    def test_workers_do_not_mutate_database_mode(self):
        runtime = build_runtime(self.environment())
        with patch.object(runtime.service.store, "call", side_effect=AssertionError("database accessed")), \
             self.assertRaises(MendError) as caught:
            asyncio.run(serve(runtime, "orchestrator"))
        self.assertEqual(caught.exception.code, "release_blocked")

    def test_start_is_blocked_before_start_mutation(self):
        calls = []
        class DraftRepository:
            def call(self, action, payload):
                calls.append(action)
                return {"contract": curated_contract()}
        service = TaskService(DraftRepository(), None, None, None, {"live_enabled": False})
        with self.assertRaises(MendError) as caught:
            asyncio.run(service.start("task", "owner", 1))
        self.assertEqual(caught.exception.code, "release_blocked")
        self.assertEqual(calls, ["get_task"])
