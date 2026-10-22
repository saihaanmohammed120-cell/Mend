# PostgreSQL runtime resume — 2026-10-12

## Part 1: inputs, outputs, ownership and dependencies

Scope: fixture gates in `tests/test_repository.py`, the PostgreSQL runtime driver, its targeted regression suite, and an opt-in operational workflow. Database preparation follows `docs/DEPLOYMENT.md` and the earlier `postgres-runtime.md` handoff. The existing `DATABASE_FIXTURE` SQL and migrations were not changed. `checks.yml` was not changed.

Owned files: `tests/test_repository.py`, `scripts/verify_postgres_runtime.py`, `tests/test_postgres_runtime_driver.py`, new `.github/workflows/postgres-runtime.yml`, and this handoff. Runtime still requires genuine `psql`, Python, and an already migrated, operator-authorized isolated Supabase-compatible development database. No provider resource, database or runtime dependency was provisioned/installed locally. No database connection was attempted.

## Part 2: confirmed defects and completed corrections

The direct fixture's import-time skip condition previously combined missing DSN and missing `psql`, so an explicitly configured but unavailable database runtime could be reported as skipped. It now skips only when no test DSN is supplied. With a DSN it requires `MEND_TEST_DATABASE_ISOLATED=1`; missing client, launch failure, timeout and text decoding failure produce a failed test rather than a skip. The fixture preserves environment-only DSN transport, adds five-second connection timeout and server-side 25-second statement/five-second lock limits beneath its existing 30-second process timeout, and suppresses private exception context before failing with a generic message.

The driver previously accepted an injected `env` for preflight but ran the fixture using ambient `os.environ` and ambient client resolution. It now resolves the client from the attested environment's PATH and passes that same resolved client and copied environment into the exact fixture instance. `--isolated` is converted to the fixture's isolation marker only after opt-in checks pass. Neither caller environment nor `os.environ` is mutated. No temporary credential-bearing environment changes need restoration.

Preflight client launch/decoding errors and unexpected process termination now return **FAIL / exit 1**; missing prerequisites, connection/schema unavailability or preflight timeout return **BLOCKED / exit 2**. Fixture failure returns **1**; a skipped/empty fixture remains **2**; an actually executed, passing fixture is the only **0**. Connection output and raw exceptions remain suppressed. The driver cannot independently prove a DSN is isolated; the attestation is an operator assertion.

The new workflow has only `workflow_dispatch`, a required boolean `isolated_database_attested` defaulting false, and a first job that fails with exit 2 when attestation is false. The database job depends on successful attestation, uses fixed environment `mend-postgres-isolated`, and injects only dedicated secret `MEND_ISOLATED_POSTGRES_DSN` as `MEND_TEST_DATABASE_DSN` into the driver step. It uses Python 3.12 and Ubuntu 24.04, read-only repository token permissions and checkout without persisted credentials. It does not start a PostgreSQL service, apply migrations, install packages, provision a database or fall back to a production DSN. A missing client/secret is blocked by the driver. Workflow/job timeouts bound CI execution; captured database output is not uploaded as an artifact.

The workflow's manual trigger and boolean syntax were checked against [GitHub's official workflow syntax documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Runner client availability is checked at execution time; no hosted runner or workflow execution was observed here.

## Part 3: actual verification and security review

Actual final targeted driver regression command:

```text
python -m unittest discover -s tests -p test_postgres_runtime_driver.py -v
Ran 12 tests in 0.023s
OK
```

The expanded tests execute the exact fixture with injected process responses to prove environment/client consistency, caller/ambient environment preservation, explicit isolation denial, configured missing-client failure without skipping, broken-client/timeout/decoding failure without private exception context, PATH consistency and existing safe driver status behavior. These are real control-flow regressions with mocked child processes, **not SQL runtime evidence**.

Actual repository suite command:

```text
python -m unittest discover -s tests -p test_repository.py -v
Ran 14 tests in 0.003s
OK (skipped=1)
```

Thirteen adapter/structural tests passed. The one real SQL fixture still skipped because no isolated test DSN was supplied. Compilation of the driver and both test files passed.

Actual runtime driver command and output, exit **2**:

```text
python scripts/verify_postgres_runtime.py --isolated
BLOCKED: MEND_TEST_DATABASE_DSN missing
BLOCKED: psql unavailable
PostgreSQL fixture executed: no
```

Local YAML parsing checked the sole manual trigger, required/default-false boolean input, fixed environment, dedicated secret mapping, dependent attestation job, absence of service provisioning and exact driver command. The attestation shell was locally executed without secrets or database access:

```text
Attestation shell input=false exit=2
Attestation shell input=true exit=0
PASS: workflow YAML/manual trigger/secret boundary/dependency and local shell checks
GitHub Actions workflow execution: unverified
```

Security review: no DSN/credentials in command arguments, workflow inputs, printed configuration, child logs or captured exception reports; DSN exists only in the authorized child environment. The same DSN is used at both stages. The fixture's changes remain inside the existing rollback transaction. Test credentials must have migration-owner privileges required by that fixture, and must belong only to a disposable isolated development database. No production or provider completion claims follow from these tests.

## Part 4: operational handoff and remaining gates

Current PostgreSQL status remains **BLOCKED / exit 2**. SQL parsing, role/grant behavior, actual rollback and all concurrency cases remain unverified. Workflow YAML/local shell checks do not constitute GitHub Actions execution evidence. Root should checkpoint all five owned files and distinguish the 12 driver regressions from 13 adapter/structural passes, one SQL skip and blocked runtime driver.

To use the prepared workflow, an operator must first prepare a fresh isolated Supabase-compatible development database and apply migration 001 then 002 as documented; the workflow performs neither operation. Configure GitHub environment `mend-postgres-isolated` with environment secret `MEND_ISOLATED_POSTGRES_DSN` containing that database's full private connection string, and configure environment protection/access appropriate to that isolated test database. Reserve this secret name for that environment: do not define a repository/organization secret with the same name, since GitHub's secrets context can also resolve those scopes. Do not store a production DSN under any test secret name.

Manually dispatch `isolated-postgres-runtime` with `isolated_database_attested=true` only after verifying isolation, migration readiness, permitted branch/code and test credential scope. False attestation deliberately fails the workflow before the database job can access its environment secret. Retain the driver status/exit code and safe summary; inspect detailed errors only in private database logs. Dispatch and real workflow operation have not been performed here.

For direct local execution, privately inject `MEND_TEST_DATABASE_DSN` and run `python scripts/verify_postgres_runtime.py --isolated`; the driver supplies the marker to the exact fixture. Running the fixture directly additionally requires privately exporting `MEND_TEST_DATABASE_ISOLATED=1`. Neither command should target production. A future passing fixture is still bounded synthetic database evidence; concurrency, private Storage, live providers and release activation remain the separate gates already documented.
