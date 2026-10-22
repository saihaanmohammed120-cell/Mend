"""Verifier control-flow checks; these do not replace or simulate FastAPI."""
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify_http_runtime.py"
SPEC = importlib.util.spec_from_file_location("mend_http_runtime_driver", SCRIPT)
driver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(driver)
HTTP_SPEC = importlib.util.spec_from_file_location("mend_http_test_boundary", SCRIPT.parents[1] / "tests" / "test_http.py")
http_tests = importlib.util.module_from_spec(HTTP_SPEC)
HTTP_SPEC.loader.exec_module(http_tests)


class HttpRuntimeDriverTests(unittest.TestCase):
    @staticmethod
    def canonical_suite(action=lambda: None):
        cases = []
        for index, identifier in enumerate(sorted(driver.REQUIRED_TEST_IDS)):
            case = unittest.FunctionTestCase(action if index == 0 else lambda: None)
            case.id = lambda identifier=identifier: identifier
            cases.append(case)
        return unittest.TestSuite(cases)

    def run_with_suite(self, suite):
        output = io.StringIO()
        versions = {name: "test-control-flow" for name in driver.REQUIRED_PACKAGES}
        with patch.object(driver, "preflight", return_value=(versions, [], [])), \
                patch.object(driver, "load_http_suite", return_value=suite):
            code = driver.main(output)
        return code, output.getvalue()

    def test_missing_dependencies_block_before_loading_suite(self):
        output = io.StringIO()
        with patch.object(driver, "preflight", return_value=({}, ["fastapi: distribution not installed"], [])), \
                patch.object(driver, "load_http_suite") as load:
            self.assertEqual(driver.main(output), 2)
        load.assert_not_called()
        self.assertIn("HTTP_RUNTIME BLOCKED", output.getvalue())
        self.assertNotIn("HTTP_RUNTIME PASS", output.getvalue())

    def test_passing_unittest_suite_reports_pass_and_zero_skips(self):
        code, output = self.run_with_suite(self.canonical_suite())
        self.assertEqual(code, 0)
        self.assertIn("HTTP_RUNTIME PASS: 3 genuine HTTP tests, zero skips", output)

    def test_failure_is_not_misreported_as_blocked_or_pass(self):
        def fail():
            self.fail("verifier must propagate test failure")
        code, output = self.run_with_suite(self.canonical_suite(fail))
        self.assertEqual(code, 1)
        self.assertIn("HTTP_RUNTIME FAIL", output)
        self.assertNotIn("HTTP_RUNTIME PASS", output)

    def test_skip_cannot_count_as_runtime_success(self):
        def skip():
            raise unittest.SkipTest("control-flow fixture")
        code, output = self.run_with_suite(self.canonical_suite(skip))
        self.assertEqual(code, 2)
        self.assertIn("HTTP_RUNTIME BLOCKED: 1 HTTP test(s) skipped", output)
        self.assertNotIn("HTTP_RUNTIME PASS", output)

    def test_empty_discovery_is_blocked(self):
        code, output = self.run_with_suite(unittest.TestSuite())
        self.assertEqual(code, 2)
        self.assertIn("collected no tests", output)

    def test_missing_canonical_test_blocks_before_suite_execution(self):
        suite = self.canonical_suite()
        incomplete = unittest.TestSuite(list(suite)[:2])
        with patch.object(driver.unittest, "TextTestRunner") as runner:
            code, output = self.run_with_suite(incomplete)
        self.assertEqual(code, 2)
        runner.assert_not_called()
        self.assertIn("HTTP_RUNTIME BLOCKED: 1 required HTTP test(s) missing", output)
        self.assertNotIn("HTTP_RUNTIME PASS", output)

    def test_shadow_module_is_rejected_without_loading_http_suite(self):
        class InstalledDistribution:
            version = "1.0"
            files = ["package/__init__.py"]

            def locate_file(self, item):
                return Path("/installed") / item

        class ShadowModule:
            __file__ = "/untracked/package/__init__.py"

        with patch.object(driver.importlib.metadata, "distribution", return_value=InstalledDistribution()), \
                patch.object(driver.importlib, "import_module", return_value=ShadowModule()):
            installed, blockers, errors = driver.preflight()
        self.assertEqual(installed, {})
        self.assertEqual(blockers, [])
        self.assertEqual(len(errors), len(driver.REQUIRED_PACKAGES))
        self.assertTrue(all("not a recorded distribution file" in item for item in errors))

    def test_import_error_reports_type_without_exception_values(self):
        class InstalledDistribution:
            version = "1.0"

        with patch.object(driver.importlib.metadata, "distribution", return_value=InstalledDistribution()), \
                patch.object(driver.importlib, "import_module", side_effect=RuntimeError("private-config-value")):
            installed, blockers, errors = driver.preflight()
        self.assertEqual(installed, {})
        self.assertEqual(blockers, [])
        self.assertTrue(all("RuntimeError" in item for item in errors))
        self.assertNotIn("private-config-value", str(errors))

    def test_discovery_selects_only_existing_http_suite(self):
        with patch.object(driver.unittest, "TestLoader") as loader:
            loader.return_value.errors = []
            driver.load_http_suite()
        loader.return_value.discover.assert_called_once_with(str(driver.ROOT / "tests"), pattern="test_http.py")

    def test_installed_broken_dependency_fails_even_with_other_packages_absent(self):
        output = io.StringIO()
        with patch.object(driver, "preflight", return_value=(
                {}, ["starlette: distribution not installed"], ["fastapi: import failed (ImportError)"])), \
                patch.object(driver, "load_http_suite") as load:
            self.assertEqual(driver.main(output), 1)
        load.assert_not_called()
        self.assertIn("HTTP_RUNTIME FAIL: installed dependency preflight failed", output.getvalue())
        self.assertNotIn("HTTP_RUNTIME BLOCKED", output.getvalue())

    def test_discovery_import_error_fails_instead_of_becoming_missing_test_blocker(self):
        output = io.StringIO()
        versions = {name: "test-control-flow" for name in driver.REQUIRED_PACKAGES}
        with patch.object(driver, "preflight", return_value=(versions, [], [])), \
                patch.object(driver, "load_http_suite", side_effect=ImportError("private-config-value")):
            self.assertEqual(driver.main(output), 1)
        self.assertIn("HTTP suite loading failed (ImportError)", output.getvalue())
        self.assertNotIn("private-config-value", output.getvalue())

    def test_loader_errors_are_not_treated_as_successful_discovery(self):
        with patch.object(driver.unittest, "TestLoader") as loader:
            loader.return_value.errors = ["private-config-value"]
            with self.assertRaisesRegex(ImportError, "Existing HTTP suite could not be imported"):
                driver.load_http_suite()

    def test_genuinely_absent_frameworks_keep_truthful_skip(self):
        with patch.object(http_tests.importlib.util, "find_spec", return_value=None), \
                patch.object(http_tests.importlib.metadata, "distribution",
                             side_effect=http_tests.importlib.metadata.PackageNotFoundError):
            self.assertFalse(http_tests.http_dependencies_available())

    def test_corrupt_installed_distribution_is_not_hidden_by_an_earlier_absent_package(self):
        def distribution(name):
            if name == "httpx":
                return object()
            raise http_tests.importlib.metadata.PackageNotFoundError(name)
        with patch.object(http_tests.importlib.util, "find_spec", return_value=None), \
                patch.object(http_tests.importlib.metadata, "distribution", side_effect=distribution):
            with self.assertRaisesRegex(ImportError, "Installed httpx distribution has no importable module"):
                http_tests.http_dependencies_available()


if __name__ == "__main__":
    unittest.main(verbosity=2)
