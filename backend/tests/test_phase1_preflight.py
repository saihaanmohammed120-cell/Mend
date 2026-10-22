"""Local preflight invariants; these tests do not authenticate any provider."""
import json
import unittest

from scripts.phase1_preflight import inspect_configuration


class PreflightTests(unittest.TestCase):
    @staticmethod
    def configured_spike():
        return {
            "NEBIUS_TOKEN_FACTORY_API_KEY": "DUMMY_INFERENCE_CREDENTIAL",
            "NEBIUS_IAM_TOKEN": "DUMMY_CLOUD_CREDENTIAL",
            "NEBIUS_PROJECT_ID": "DUMMY_PROJECT",
            "NEBIUS_SUBNET_ID": "DUMMY_SUBNET",
            "NEBIUS_PLATFORM": "DUMMY_PLATFORM",
            "NEBIUS_PRESET": "DUMMY_PRESET",
            "MEND_INPUT_PRICE_PER_MILLION": "1",
            "MEND_OUTPUT_PRICE_PER_MILLION": "2",
            "MEND_PRICE_PROVENANCE": "DUMMY_PRICE_REFERENCE",
            "MEND_SPIKE_IMAGE": "registry.example/timing-probe@sha256:" + "b" * 64,
            "MEND_TASK_COST_CAP": "1",
            "MEND_SPIKE_PROBE_APPROVED": "true",
        }

    def test_missing_prerequisites_block_and_measurements_stay_absent(self):
        result = inspect_configuration({}, cli_present=False, dependencies_present=False)
        self.assertEqual(result["status"], "blocked")
        self.assertIsNone(result["live_observations"]["cancel_to_stop_seconds"])
        self.assertEqual(result["live_observations"]["inference"], "not_run")
        self.assertFalse(result["live_release_enabled_by_probe"])

    def test_configured_fields_never_become_authenticated_or_verified_proof(self):
        values = self.configured_spike()
        result = inspect_configuration(values, cli_present=True, dependencies_present=True)
        self.assertEqual(result["status"], "configured_unverified")
        self.assertEqual(result["live_observations"]["model_discovery"], "not_run")
        serialized = json.dumps(result)
        for private in ("DUMMY_INFERENCE_CREDENTIAL", "DUMMY_CLOUD_CREDENTIAL", "DUMMY_PROJECT", "DUMMY_PRICE_REFERENCE"):
            self.assertNotIn(private, serialized)

    def test_standalone_spike_does_not_require_production_runner_image(self):
        result = inspect_configuration(self.configured_spike(), cli_present=True, dependencies_present=True)
        self.assertEqual(result["status"], "configured_unverified")
        self.assertFalse(result["runtime_integration"]["runner_configuration_presence"]["MEND_RUNNER_IMAGE_DIGEST"])
        self.assertEqual(result["runtime_integration"]["release_readiness"],
                         "unverified_not_established_by_spike_configuration")

    def test_invalid_production_runner_image_is_reported_separately(self):
        values = {**self.configured_spike(), "MEND_RUNNER_IMAGE_DIGEST": "registry.example/runner:latest"}
        result = inspect_configuration(values, cli_present=True, dependencies_present=True)
        self.assertEqual(result["status"], "configured_unverified")
        self.assertNotIn("MEND_RUNNER_IMAGE_DIGEST", result["invalid_fields"])
        self.assertIn("MEND_RUNNER_IMAGE_DIGEST", result["runtime_integration"]["runner_invalid_fields"])

    def test_spike_specific_configuration_is_required_separately_from_runner(self):
        result = inspect_configuration({
            "MEND_RUNNER_IMAGE_DIGEST": "registry.example/runner@sha256:" + "a" * 64,
        }, cli_present=True, dependencies_present=True)
        self.assertEqual(result["status"], "blocked")
        for field in ("MEND_SPIKE_IMAGE", "MEND_TASK_COST_CAP", "MEND_SPIKE_PROBE_APPROVED"):
            self.assertIn("missing:" + field, result["blockers"])

    def test_unapproved_or_unpinned_spike_is_invalid(self):
        result = inspect_configuration({
            "MEND_SPIKE_IMAGE": "registry.example/timing-probe:latest",
            "MEND_SPIKE_PROBE_APPROVED": "false",
        }, cli_present=True, dependencies_present=True)
        for field in ("MEND_SPIKE_IMAGE", "MEND_SPIKE_PROBE_APPROVED"):
            self.assertIn(field, result["invalid_fields"])

    def test_monetary_cap_must_be_finite_positive_and_representable(self):
        for cap in ("0", "-1", "NaN", "Infinity", "1e9999", "1e-9999", "bad"):
            with self.subTest(cap=cap):
                result = inspect_configuration({"MEND_TASK_COST_CAP": cap},
                                               cli_present=True, dependencies_present=True)
                self.assertIn("MEND_TASK_COST_CAP", result["invalid_fields"])

    def test_positive_cap_is_local_configuration_only(self):
        result = inspect_configuration({"MEND_TASK_COST_CAP": "0.25"},
                                       cli_present=True, dependencies_present=True)
        self.assertNotIn("MEND_TASK_COST_CAP", result["invalid_fields"])
        self.assertEqual(result["live_observations"]["inference"], "not_run")
        self.assertFalse(result["live_release_enabled_by_probe"])

    def test_wrong_endpoint_invalid_model_and_nonfinite_prices_remain_blocked(self):
        result = inspect_configuration({
            "NEBIUS_TOKEN_FACTORY_URL": "https://example.com/v1",
            "NEBIUS_MODEL_ID": "other/fake-model",
            "MEND_INPUT_PRICE_PER_MILLION": "NaN",
            "MEND_OUTPUT_PRICE_PER_MILLION": "Infinity",
        }, cli_present=True, dependencies_present=True)
        self.assertEqual(result["status"], "blocked")
        for key in ("NEBIUS_TOKEN_FACTORY_URL", "NEBIUS_MODEL_ID", "MEND_INPUT_PRICE_PER_MILLION", "MEND_OUTPUT_PRICE_PER_MILLION"):
            self.assertIn(key, result["invalid_fields"])

    def test_documented_trailing_slash_does_not_create_a_false_endpoint_failure(self):
        result = inspect_configuration({"NEBIUS_TOKEN_FACTORY_URL": "https://api.tokenfactory.nebius.com/v1/"},
                                       cli_present=False, dependencies_present=True)
        self.assertNotIn("NEBIUS_TOKEN_FACTORY_URL", result["invalid_fields"])
        self.assertEqual(result["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
