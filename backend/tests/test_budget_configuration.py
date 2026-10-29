"""Offline configuration and reservation checks; no provider or database calls."""
import base64
import unittest
from unittest.mock import AsyncMock, Mock, patch

from mend.bootstrap import build_runtime
from mend.config import Settings
from mend.domain import MendError


def environment(**values):
    return {
        "MEND_MODE": "database_only", "MEND_TASK_COST_CAP": "0.25",
        "MEND_PUBLIC_ORIGIN": "https://mend.test", "MEND_ALLOWED_ORIGINS": "https://mend.test",
        "SUPABASE_URL": "https://supabase.test", "SUPABASE_SERVICE_ROLE_KEY": "fixture-server-key",
        "MEND_SESSION_SEAL_KEY": base64.urlsafe_b64encode(b"b" * 32).decode(),
        **values,
    }


class BudgetConfigurationTests(unittest.TestCase):
    def test_missing_and_blank_caps_stay_unconfigured(self):
        self.assertIsNone(Settings.from_env({}).max_task_cost)
        self.assertIsNone(Settings.from_env({"MEND_TASK_COST_CAP": ""}).max_task_cost)

    def test_positive_cap_is_loaded_without_an_invented_default(self):
        for value, expected in (("0.25", 0.25), ("1", 1.0), ("2.5e-3", 0.0025)):
            with self.subTest(value=value):
                self.assertEqual(Settings.from_env({"MEND_TASK_COST_CAP": value}).max_task_cost, expected)

    def test_invalid_environment_caps_fail_closed(self):
        for value in ("0", "-1", "NaN", "Infinity", "-Infinity", "1e999", "1e-999",
                      "not-a-number", " ", "1" * 129, None, True, 0.25):
            with self.subTest(value=value), self.assertRaises(MendError) as caught:
                Settings.from_env({"MEND_TASK_COST_CAP": value})
            self.assertEqual(caught.exception.code, "invalid_configuration")

    def test_direct_settings_reject_invalid_caps(self):
        for value in (0, -1, float("nan"), float("inf"), True, "0.25", 10 ** 1000):
            with self.subTest(value=value), self.assertRaises(MendError):
                Settings(max_task_cost=value)

    def test_assembly_forwards_cap_in_every_mode_without_enabling_live(self):
        for mode in ("local_test", "database_only", "live"):
            with self.subTest(mode=mode), \
                    patch("mend.bootstrap.DiskTestArtifacts"), \
                    patch("mend.bootstrap.TokenFactoryClient"), \
                    patch("mend.bootstrap.NebiusRunner"):
                runtime = build_runtime(environment(MEND_MODE=mode, MEND_LOCAL_DATABASE=":memory:"))
                try:
                    self.assertEqual(runtime.settings.max_task_cost, 0.25)
                    self.assertEqual(runtime.service._config("max_task_cost"), 0.25)
                    self.assertIs(runtime.service._config("live_enabled"), False)
                finally:
                    runtime.close()

    def test_configured_cap_cannot_bypass_live_release_gate(self):
        with patch("mend.bootstrap.TokenFactoryClient", side_effect=AssertionError("provider constructed")), \
                patch("mend.bootstrap.NebiusRunner", side_effect=AssertionError("runner constructed")), \
                self.assertRaises(MendError) as caught:
            build_runtime(environment(MEND_MODE="live", MEND_LIVE_ENABLED="true"))
        self.assertEqual(caught.exception.code, "release_blocked")


class BudgetReservationTests(unittest.IsolatedAsyncioTestCase):
    async def test_assembled_cap_blocks_over_budget_before_reservation_or_generation(self):
        runtime = build_runtime(environment())
        self.addCleanup(runtime.close)
        service = runtime.service
        service.model = Mock()
        service.model.reservation.return_value = {"cost": 0.125, "token_count": 100}
        service.model.generate = AsyncMock(side_effect=MendError("fixture_generation_reached", "Offline fixture."))
        service._remaining = Mock(return_value=60)
        service._worker = AsyncMock()
        task = {"id": "fixture-task", "contract": {}, "prompt": "fixture", "usage": {"cost": 0.25}}
        with self.assertRaises(MendError) as caught:
            await service._generate(task, {}, None)
        self.assertEqual(caught.exception.code, "budget_exceeded")
        service._worker.assert_not_awaited()
        service.model.generate.assert_not_awaited()

        # An exactly affordable reservation is allowed and recorded before generation.
        task["usage"]["cost"] = 0.125
        with self.assertRaises(MendError) as caught:
            await service._generate(task, {}, None)
        self.assertEqual(caught.exception.code, "fixture_generation_reached")
        service._worker.assert_awaited_once_with("usage", "fixture-task", cost=0.125,
                                                token_count=100, api_retry_increment=0)
        service.model.generate.assert_awaited_once()

    async def test_missing_assembled_cap_blocks_nonfixture_inference(self):
        runtime = build_runtime(environment(MEND_TASK_COST_CAP=""))
        self.addCleanup(runtime.close)
        service = runtime.service
        service.model = Mock()
        service.model.reservation.return_value = {"cost": 0.125, "token_count": 100}
        service.model.generate = AsyncMock()
        service._remaining = Mock(return_value=60)
        service._worker = AsyncMock()
        with self.assertRaises(MendError) as caught:
            await service._generate({"contract": {}, "prompt": "fixture"}, {}, None)
        self.assertEqual(caught.exception.code, "budget_unconfigured")
        service._worker.assert_not_awaited()
        service.model.generate.assert_not_awaited()
