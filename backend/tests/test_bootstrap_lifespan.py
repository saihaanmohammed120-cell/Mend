"""Real ASGI lifecycle checks with isolated assembly dependencies; no DB evidence."""
from contextlib import asynccontextmanager
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from mend.bootstrap import Runtime, create_app_from_env


class BootstrapLifespanTests(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            supabase_url="https://example.supabase.co",
            allowed_origins=("https://mend.example",),
            validate_auth=Mock(),
            mode="database_only",
        )
        self.resource = Mock()
        self.transport = Mock()
        self.runtime = Runtime(self.settings, Mock(), [self.resource])
        self.patches = [
            patch("mend.bootstrap.build_runtime", return_value=self.runtime),
            patch("mend.bootstrap.JsonTransport", return_value=self.transport),
            patch("mend.bootstrap.SupabaseAuthenticator", return_value=Mock()),
        ]
        for assembly_patch in self.patches:
            assembly_patch.start()
            self.addCleanup(assembly_patch.stop)

    def assert_closed_once(self):
        self.transport.close.assert_called_once_with()
        self.resource.close.assert_called_once_with()
        self.assertEqual(self.runtime.resources, [])
        self.runtime.close()
        self.transport.close.assert_called_once_with()
        self.resource.close.assert_called_once_with()

    def test_factory_serves_health_and_closes_on_real_asgi_shutdown(self):
        app = create_app_from_env()
        with TestClient(app) as client:
            self.transport.close.assert_not_called()
            self.resource.close.assert_not_called()
            response = client.get("/healthz")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["mode"], "database_only")
            self.assertIs(app.state.mend_runtime, self.runtime)
        self.assert_closed_once()

    def test_existing_lifespan_state_and_shutdown_are_preserved(self):
        lifecycle = []

        @asynccontextmanager
        async def previous_lifespan(app):
            lifecycle.append("startup")
            try:
                yield {"existing_state": "kept"}
            finally:
                lifecycle.append("shutdown")

        app = FastAPI(lifespan=previous_lifespan)
        with patch("mend.api.create_app", return_value=app):
            assembled = create_app_from_env()
        with self.assertRaisesRegex(RuntimeError, "fixture body failure"):
            with TestClient(assembled) as client:
                self.assertEqual(client.app_state["existing_state"], "kept")
                raise RuntimeError("fixture body failure")
        self.assertEqual(lifecycle, ["startup", "shutdown"])
        self.assert_closed_once()

    def test_startup_failure_closes_runtime(self):
        @asynccontextmanager
        async def failing_lifespan(app):
            raise RuntimeError("fixture startup failure")
            yield

        app = FastAPI(lifespan=failing_lifespan)
        with patch("mend.api.create_app", return_value=app):
            assembled = create_app_from_env()
        with self.assertRaisesRegex(RuntimeError, "fixture startup failure"):
            with TestClient(assembled):
                self.fail("Startup should have failed before entering the client.")
        self.assert_closed_once()

    def test_existing_shutdown_failure_still_closes_runtime(self):
        @asynccontextmanager
        async def failing_shutdown(app):
            yield
            raise RuntimeError("fixture shutdown failure")

        app = FastAPI(lifespan=failing_shutdown)
        with patch("mend.api.create_app", return_value=app):
            assembled = create_app_from_env()
        with self.assertRaisesRegex(RuntimeError, "fixture shutdown failure"):
            with TestClient(assembled):
                self.resource.close.assert_not_called()
        self.assert_closed_once()

    def test_factory_failure_closes_resources_before_return(self):
        with patch("mend.api.create_app", side_effect=RuntimeError("fixture assembly failure")):
            with self.assertRaisesRegex(RuntimeError, "fixture assembly failure"):
                create_app_from_env()
        self.assert_closed_once()
