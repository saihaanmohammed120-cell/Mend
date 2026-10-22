# PostgreSQL runtime driver — 2026-10-12

## Part 1: inputs, outputs, ownership and dependencies

Scoped inputs: `tests/test_repository.py`'s existing `DatabaseExecutionTests.test_transactional_database_fixture` and `DATABASE_FIXTURE`; migration interface headers and required schema objects in `migrations/001_mend.sql` and `002_backend_rpc.sql`; database preparation requirements in `docs/DEPLOYMENT.md`. No existing migration or fixture source was changed.

Owned outputs: `scripts/verify_postgres_runtime.py`, `tests/test_postgres_runtime_driver.py`, and this handoff. Runtime dependencies are Python stdlib, `psql`, and an operator-authorized isolated Supabase-compatible development PostgreSQL already migrated as its migration owner. Plain PostgreSQL without the Supabase auth schema/roles and other migration prerequisites is insufficient. The driver creates no provider/database resources and downloads nothing.

The runtime-prerequisites worker reported actual read-only environment checks: `psql`, `postgres`, `initdb`, `pg_ctl`, Docker and Podman absent; no installed PostgreSQL directories or cached server packages; neither test DSN nor isolation environment flag supplied. No database connection was attempted. This worker independently observed the driver's missing-DSN/client blockers below.

## Part 2: completed implementation

Run `python scripts/verify_postgres_runtime.py --isolated` from the backend directory after privately injecting `MEND_TEST_DATABASE_DSN`. `--isolated` is the operator's attestation that the DSN targets an authorized isolated development database; it is not automatic proof of isolation. `MEND_TEST_DATABASE_ISOLATED=1` is an alternative explicit opt-in. A DSN alone never authorizes a connection through the driver.

The driver checks isolation opt-in, nonempty DSN and actual `psql` availability before any connection. It then runs a read-only transaction checking the expected auth/application relations, command RPC and Supabase role names. This detects connectivity or missing schema prerequisites; it does not establish exact migration contents or privilege correctness. Connection timeout is five seconds, statement timeout five seconds and the preflight process timeout fifteen seconds.

After a successful preflight, the driver dynamically loads and executes exactly the existing rollback fixture test. It requires exactly one executed test and zero skips. The fixture itself uses `BEGIN`/`ROLLBACK` and a thirty-second child timeout; disconnect on SQL failure rolls back the uncommitted transaction. Exit statuses: **0** for the executed passing fixture, **1** for fixture failure/error, **2** for blocked prerequisites, absent schema, an empty suite or a skipped fixture. There is no mocked database fallback and no automatic migration application.

## Part 3: actual targeted verification and security review

Actual command:

```text
python -m unittest discover -s tests -p test_postgres_runtime_driver.py -v
Ran 7 tests in 0.000s
OK
```

These seven tests exercised driver control flow with injected subprocess/test results: prerequisite denial before connection, DSN without isolation denial, explicit flag opt-in, read-only preflight and environment-only secret transport, failed/missing-schema/timed-out/unavailable connection denial, zero/skipped fixture denial, and failing/exceptional fixture reporting. **They are not PostgreSQL execution evidence.**

Actual current-environment command and output, process exit **2**:

```text
python scripts/verify_postgres_runtime.py --isolated
BLOCKED: MEND_TEST_DATABASE_DSN missing
BLOCKED: psql unavailable
PostgreSQL fixture executed: no
```

Without `--isolated`, the driver also reports the missing operator opt-in and exits **2**. The existing fixture was separately invoked unchanged to establish its current actual behavior:

```text
PYTHONPATH=tests:. python -m unittest test_repository.DatabaseExecutionTests.test_transactional_database_fixture -v
test_transactional_database_fixture ... skipped 'No isolated PostgreSQL DSN/psql; migration execution pending.'
Ran 1 test in 0.000s
OK (skipped=1)
```

That legacy unittest command exits zero with a skip. The new driver explicitly prevents this outcome from qualifying as a runtime pass.

Security review: DSN is carried in child `PGDATABASE`, never argv, printed configuration or shell command examples. Child stdout/stderr and raw exceptions are captured and suppressed, including connection errors that may disclose host/user/password. Test failure details remain in private database logs. The existing fixture already uses environment-only DSN transport and a generic assertion; no change was needed. Read-only preflight cannot enable the release gate. Fixture gate changes and synthetic identities are transaction-scoped and rolled back. Operators must keep credentials private because process environments are accessible to sufficiently privileged users.

## Part 4: integration handoff and remaining gate

Current PostgreSQL runtime status is **BLOCKED / exit 2**. No migration was applied; no SQL fixture executed; no SQL, grants, concurrency or provider runtime pass is claimed. Root should retain this handoff and owned files in its checkpoint, and report the seven driver regressions separately from the blocked PostgreSQL gate.

On an authorized workstation with real `psql`, use a fresh isolated Supabase-compatible development database with migration-owner permissions. Do not point these commands at an existing production database. In a private Bash terminal, from the backend directory:

```bash
read -r -s -p 'Isolated development PostgreSQL DSN: ' MEND_TEST_DATABASE_DSN
export MEND_TEST_DATABASE_DSN
export PGDATABASE="$MEND_TEST_DATABASE_DSN"
psql -X -v ON_ERROR_STOP=1 -f migrations/001_mend.sql && \
  psql -X -v ON_ERROR_STOP=1 -f migrations/002_backend_rpc.sql && \
  python scripts/verify_postgres_runtime.py --isolated
unset PGDATABASE MEND_TEST_DATABASE_DSN
```

Stop if either migration command fails; inspect its output privately and do not run the second migration after a failed first migration. Apply migrations once to the fresh environment, in that order. For an already migrated isolated development database, omit both migration commands. Retain only redacted driver output and the exit code as review evidence. `MEND_TEST_DATABASE_ISOLATED=1` can be privately exported for automation instead of the flag.

Even a future exit-zero fixture establishes only the existing transactional fixture's database assertions: ownership, idempotency, release blocking, worker fencing, token cap, cancellation, event replay, truncation/provenance and selected column privilege checks. The additional concurrency, retention, finalization races and other scenarios listed in `docs/agent-handoffs/database.md` remain separate gates, along with real private Storage and all provider/release evidence. No paid resource creation is authorized or performed by this driver.
