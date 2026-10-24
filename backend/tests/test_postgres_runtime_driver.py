"""Driver control-flow tests; injected results are not database execution evidence."""
import io
import subprocess
import unittest
from unittest import mock

from scripts import verify_postgres_runtime as driver


class PostgresRuntimeDriverTests(unittest.TestCase):
    def verify(self, *, isolated=False, env=None, find_psql=None, run=None, fixture_runner=None):
        output = io.StringIO()
        code = driver.main(
            isolated=isolated, env={} if env is None else env,
            find_psql=(lambda _: "/test/psql") if find_psql is None else find_psql,
            run=run, fixture_runner=fixture_runner, output=output,
        )
        return code, output.getvalue()

    def test_missing_prerequisites_block_before_any_connection(self):
        def unexpected(*args, **kwargs):
            self.fail("connection attempted before prerequisites")
        code, output = self.verify(find_psql=lambda _: None, run=unexpected,
                                   fixture_runner=unexpected)
        self.assertEqual(code, 2)
        self.assertIn("BLOCKED", output)
        self.assertIn("DSN missing", output)
        self.assertIn("psql unavailable", output)
        self.assertIn("fixture executed: no", output)

    def test_dsn_alone_does_not_authorize_connection(self):
        def unexpected(*args, **kwargs):
            self.fail("connection attempted without isolation opt-in")
        code, output = self.verify(env={"MEND_TEST_DATABASE_DSN": "private-secret"},
                                   run=unexpected, fixture_runner=unexpected)
        self.assertEqual(code, 2)
        self.assertNotIn("private-secret", output)

    def test_conninfo_and_uri_values_block_without_connection_or_secret_output(self):
        for value in ('host=private-host password=private-secret', 'postgresql://owner:private-secret@host/db'):
            with self.subTest(kind=value.split(':')[0]):
                process = mock.Mock(side_effect=AssertionError('Must not connect'))
                code, output = self.verify(isolated=True, env={'MEND_TEST_DATABASE_DSN': value}, run=process)
                self.assertEqual(code, 2)
                self.assertIn('must be a database name', output)
                self.assertNotIn('private-secret', output)
                process.assert_not_called()

    def test_client_resolution_uses_attested_path_without_ambient_fallback(self):
        output = io.StringIO()
        with mock.patch("shutil.which", return_value=None) as lookup, \
             mock.patch("subprocess.run") as process:
            code = driver.main(isolated=True,
                env={"MEND_TEST_DATABASE_DSN": "private-secret", "PATH": "/isolated/client/bin"},
                output=output)
        lookup.assert_called_once_with("psql", path="/isolated/client/bin")
        process.assert_not_called()
        self.assertEqual(code, 2)
        self.assertNotIn("private-secret", output.getvalue())

    def test_explicit_isolated_flag_authorizes_only_the_attested_test_connection(self):
        calls = []
        result = unittest.TestResult()
        result.testsRun = 1
        def run(argv, **kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 0, driver.READY + "\n", "")
        code, output = self.verify(isolated=True,
            env={"MEND_TEST_DATABASE_DSN": "private-secret"},
            run=run, fixture_runner=lambda **kwargs: result)
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 1)
        self.assertNotIn("private-secret", output)

    def test_preflight_is_read_only_and_secret_stays_in_environment(self):
        calls = []
        def run(argv, **kwargs):
            calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, driver.READY + "\n", "")
        result = unittest.TestResult()
        result.testsRun = 1
        code, output = self.verify(
            env={"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"},
            run=run, fixture_runner=lambda **kwargs: result,
        )
        self.assertEqual(code, 0)
        argv, kwargs = calls[0]
        self.assertNotIn("private-secret", " ".join(argv))
        self.assertNotIn("private-secret", output)
        self.assertEqual(kwargs["env"]["PGDATABASE"], "private-secret")
        self.assertIn("BEGIN READ ONLY", kwargs["input"])
        self.assertIn("ROLLBACK", kwargs["input"])
        self.assertEqual(kwargs["timeout"], 15)

    def test_connection_failure_and_timeout_block_without_printing_private_output(self):
        env = {"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"}
        for failure, expected in (
                (subprocess.CompletedProcess([], 1, "private-secret", "private-secret"), 2),
                (subprocess.CompletedProcess([], 0, "MEND_POSTGRES_SCHEMA_MISSING\n", ""), 2),
                (subprocess.TimeoutExpired(["psql"], 15, output="private-secret"), 2),
                (OSError("private-secret"), 1), (UnicodeError("private-secret"), 1),
                (subprocess.CompletedProcess([], 127, "private-secret", "private-secret"), 1)):
            with self.subTest(failure=type(failure).__name__):
                def run(*args, **kwargs):
                    if isinstance(failure, Exception):
                        raise failure
                    return failure
                def unexpected():
                    self.fail("fixture called after failed preflight")
                code, output = self.verify(env=env, run=run, fixture_runner=unexpected)
                self.assertEqual(code, expected)
                self.assertNotIn("private-secret", output)

    def test_skipped_and_empty_fixture_are_blocked_not_green(self):
        empty, skipped = unittest.TestResult(), unittest.TestResult()
        skipped.testsRun = 1
        skipped.skipped.append((None, "missing prerequisite"))
        for result in (empty, skipped):
            code, output = self.verify(
                env={"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"},
                run=lambda *a, **k: subprocess.CompletedProcess([], 0, driver.READY + "\n", ""),
                fixture_runner=lambda **kwargs: result,
            )
            self.assertEqual(code, 2)
            self.assertIn("BLOCKED", output)

    def test_fixture_failure_or_exception_returns_one_without_private_details(self):
        failed = unittest.TestResult()
        failed.testsRun = 1
        failed.failures.append((None, "private-secret"))
        def exception(**kwargs):
            raise RuntimeError("private-secret")
        for runner in (lambda **kwargs: failed, exception):
            code, output = self.verify(
                env={"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"},
                run=lambda *a, **k: subprocess.CompletedProcess([], 0, driver.READY + "\n", ""),
                fixture_runner=runner,
            )
            self.assertEqual(code, 1)
            self.assertIn("FAIL", output)
            self.assertNotIn("private-secret", output)

    def test_exact_fixture_uses_attested_environment_and_client_not_ambient_dsn(self):
        approved_env = {"MEND_TEST_DATABASE_DSN": "approved-test-secret", "PATH": "/approved/bin"}
        fixture_calls = []
        preflight_calls = []
        def fixture_process(argv, **kwargs):
            fixture_calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, "", "")
        def preflight(argv, **kwargs):
            preflight_calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, driver.READY + "\n", "")
        with mock.patch.dict("os.environ", {"MEND_TEST_DATABASE_DSN": "ambient-unapproved-secret"}), \
             mock.patch("subprocess.run", side_effect=fixture_process):
            code, output = self.verify(isolated=True, env=approved_env, run=preflight)
            self.assertEqual(driver.os.environ["MEND_TEST_DATABASE_DSN"], "ambient-unapproved-secret")
        self.assertEqual(code, 0)
        self.assertEqual(len(fixture_calls), 1)
        self.assertEqual(fixture_calls[0][0][0], preflight_calls[0][0][0])
        child_env = fixture_calls[0][1]["env"]
        self.assertEqual(child_env["PGDATABASE"], "approved-test-secret")
        self.assertEqual(child_env["MEND_TEST_DATABASE_ISOLATED"], "1")
        self.assertEqual(child_env["PGCONNECT_TIMEOUT"], "5")
        self.assertIn("statement_timeout=25000", child_env["PGOPTIONS"])
        self.assertEqual(fixture_calls[0][1]["timeout"], 30)
        self.assertIn("ROLLBACK;", fixture_calls[0][1]["input"])
        self.assertNotIn("approved-test-secret", output)
        self.assertNotIn("ambient-unapproved-secret", str(fixture_calls))
        self.assertNotIn("MEND_TEST_DATABASE_ISOLATED", approved_env)

    def test_existing_fixture_missing_client_with_dsn_fails_without_skip(self):
        with mock.patch("shutil.which", return_value=None), \
             mock.patch("subprocess.run") as process:
            result = driver.run_existing_fixture(
                env={"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"},
                psql=None,
            )
        self.assertEqual(result.testsRun, 1)
        self.assertEqual(len(result.failures), 1)
        self.assertEqual(result.skipped, [])
        process.assert_not_called()

    def test_existing_fixture_requires_attestation_before_connecting(self):
        with mock.patch("subprocess.run") as process:
            result = driver.run_existing_fixture(
                env={"MEND_TEST_DATABASE_DSN": "private-secret"}, psql="/test/psql")
        self.assertEqual(len(result.failures), 1)
        self.assertEqual(result.skipped, [])
        self.assertNotIn("private-secret", result.failures[0][1])
        process.assert_not_called()

    def test_installed_broken_client_and_fixture_timeouts_fail_without_private_context(self):
        for error in (OSError("private-secret"),
                      subprocess.TimeoutExpired(["psql"], 30, output="private-secret"),
                      UnicodeError("private-secret")):
            with self.subTest(error=type(error).__name__), \
                 mock.patch("subprocess.run", side_effect=error):
                result = driver.run_existing_fixture(
                    env={"MEND_TEST_DATABASE_DSN": "private-secret", "MEND_TEST_DATABASE_ISOLATED": "1"},
                    psql="/test/psql",
                )
            self.assertEqual(result.testsRun, 1)
            self.assertEqual(result.skipped, [])
            self.assertEqual(len(result.failures), 1)
            self.assertEqual(result.errors, [])
            self.assertNotIn("private-secret", result.failures[0][1])


if __name__ == "__main__":
    unittest.main()
