"""Opt-in execution of the existing rollback fixture against an isolated database.

Exit 0: fixture executed successfully; 1: fixture failed; 2: prerequisite blocked.
The operator must inject MEND_TEST_DATABASE_DSN privately and attest isolation
with --isolated (or MEND_TEST_DATABASE_ISOLATED=1). No migrations are applied.
"""
from __future__ import annotations

import importlib.util
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
READY = "MEND_POSTGRES_READY"
PREFLIGHT_SQL = """
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT CASE WHEN
  to_regclass('auth.users') IS NOT NULL AND
  to_regclass('mend_private.release_gate') IS NOT NULL AND
  to_regclass('public.tasks') IS NOT NULL AND
  to_regclass('public.task_attempts') IS NOT NULL AND
  to_regclass('public.logs') IS NOT NULL AND
  to_regclass('public.receipts') IS NOT NULL AND
  to_regprocedure('public.mend_command(text,jsonb)') IS NOT NULL AND
  EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND
  EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND
  EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon')
THEN 'MEND_POSTGRES_READY' ELSE 'MEND_POSTGRES_SCHEMA_MISSING' END;
ROLLBACK;
"""


def run_existing_fixture(*, env, psql) -> unittest.TestResult:
    """Load the exact existing test; do not replace SQL with a simulated adapter."""
    path = ROOT / "tests" / "test_repository.py"
    spec = importlib.util.spec_from_file_location("_mend_postgres_fixture", path)
    if spec is None or spec.loader is None:
        raise ImportError("fixture loader unavailable")
    module = importlib.util.module_from_spec(spec)
    previous_cwd = Path.cwd()
    sys.path.insert(0, str(ROOT))
    try:
        os.chdir(ROOT)
        spec.loader.exec_module(module)
        fixture = module.DatabaseExecutionTests("test_transactional_database_fixture")
        # Use exactly the attested environment/client that passed preflight,
        # rather than another ambient DSN or PATH at fixture execution time.
        fixture.fixture_environment = dict(env)
        fixture.fixture_psql = psql
        suite = unittest.TestSuite([fixture])
        result = unittest.TestResult()
        suite.run(result)
        return result
    finally:
        os.chdir(previous_cwd)
        sys.path.pop(0)


def main(*, isolated=False, env=None, find_psql=None, run=None, fixture_runner=None, output=None) -> int:
    env = os.environ if env is None else env
    if find_psql is None:
        find_psql = lambda name: shutil.which(name, path=env.get("PATH", os.defpath))
    run = subprocess.run if run is None else run
    fixture_runner = run_existing_fixture if fixture_runner is None else fixture_runner
    output = sys.stdout if output is None else output

    def report(message: str) -> None:
        print(message, file=output)

    blockers = []
    if not isolated and env.get("MEND_TEST_DATABASE_ISOLATED") != "1":
        blockers.append("--isolated or MEND_TEST_DATABASE_ISOLATED=1 operator opt-in missing")
    dsn = env.get("MEND_TEST_DATABASE_DSN", "")
    if not dsn.strip():
        blockers.append("MEND_TEST_DATABASE_DSN missing")
    psql = find_psql("psql")
    if not psql:
        blockers.append("psql unavailable")
    if blockers:
        for blocker in blockers:
            report("BLOCKED: " + blocker)
        report("PostgreSQL fixture executed: no")
        return 2

    # libpq accepts a connection string in PGDATABASE. Never put it in argv or
    # echo child output: connection errors can contain private connection data.
    child_env = dict(env, PGDATABASE=dsn, PGCONNECT_TIMEOUT="5", MEND_TEST_DATABASE_ISOLATED="1")
    try:
        preflight = run(
            [psql, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
            input=PREFLIGHT_SQL, text=True, capture_output=True,
            env=child_env, timeout=15,
        )
    except (OSError, UnicodeError):
        report("FAIL: installed PostgreSQL client could not execute safely")
        report("PostgreSQL fixture executed: no")
        return 1
    except subprocess.TimeoutExpired:
        report("BLOCKED: isolated PostgreSQL preflight timed out")
        report("PostgreSQL fixture executed: no")
        return 2
    if preflight.returncode not in (0, 1, 2, 3):
        report("FAIL: installed PostgreSQL client terminated unexpectedly")
        report("PostgreSQL fixture executed: no")
        return 1
    if preflight.returncode != 0 or READY not in preflight.stdout.splitlines():
        report("BLOCKED: database connection or migrated schema preflight failed")
        report("PostgreSQL fixture executed: no")
        return 2

    report("PASS: read-only PostgreSQL connection/schema preflight")
    try:
        result = fixture_runner(env=child_env, psql=psql)
    except Exception:
        # Do not render exception messages or tracebacks from secret-bearing
        # connection failures; operators can inspect private database logs.
        report("FAIL: existing PostgreSQL fixture could not complete")
        return 1
    if result.testsRun != 1 or result.skipped:
        report("BLOCKED: existing PostgreSQL fixture did not execute exactly once without skips")
        return 2
    report(f"Existing rollback fixture: tests={result.testsRun}, failures={len(result.failures)}, "
           f"errors={len(result.errors)}, skipped={len(result.skipped)}")
    if not result.wasSuccessful():
        report("FAIL: PostgreSQL fixture; inspect private database logs")
        return 1
    report("PASS: existing PostgreSQL transactional fixture executed; fixture transaction rolled back")
    report("Scope: synthetic database fixture only; no provider, concurrency, or release evidence")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--isolated", action="store_true",
                        help="attest the DSN names an authorized isolated development database")
    raise SystemExit(main(isolated=parser.parse_args().isolated))
