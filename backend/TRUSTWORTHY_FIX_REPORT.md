# Mend — Trustworthy Fix Report

Checkpoint: 12 October 2026. This report completes the next unfinished deliverable from the saved master plan. It records already completed corrections and captured verification; this checkpoint changes only `TRUSTWORTHY_FIX_REPORT.md`. No completed implementation file was rewritten, no whole-codebase audit was repeated, and no tests were rerun to produce this report.

### 🚨 Original Error / Problem Statement

The existing Paper and Proof Site demonstrates a simulated repair loop. Its visual polish does not establish a working Nebius-backed agent. Backend implementation and review uncovered concrete boundary defects: concurrent orchestration, cancellation delayed by worker leases, incomplete cleanup, expired sessions delivering SSE events, unsafe JSON numbers, filesystem races, inconsistent replay cursors, and provider workload completion being mistaken for infrastructure termination.

The preserved v1.2 TRD, UI/UX Brief, App Flow and Stage 5 schema remain the governing baseline. Nemotron 3, FastAPI, Supabase, Nebius Jobs, persisted SSE events, immutable protected checks, a maximum of three repairs/four executions, and explicit evidence boundaries remain unchanged. The reported earlier interruption cannot be independently attributed to a particular quota or runtime limit; the saved files and logs establish the actual stopping point.

### 📁 Files Impacted

The following files belong to the completed implementation and correction pass. Their presence does not imply that every production integration has been executed.

| Boundary | Implementation files |
|---|---|
| Contract, safe source edits and immutable artifacts | `mend/domain.py`, `mend/patches.py`, `mend/artifacts.py` |
| Authentication, HTTP/SSE and configuration | `mend/auth.py`, `mend/api.py`, `mend/config.py` |
| Provider transport and inference | `mend/transport.py`, `mend/inference.py` |
| Job observation and authenticated report validation | `mend/runner.py`, `mend/supervisor.py` |
| Task orchestration, explicit local fixtures and persistence | `mend/service.py`, `mend/local_store.py`, `mend/fakes.py`, `mend/repository.py` |
| Runtime construction and independent workers | `mend/bootstrap.py`, `mend/worker.py`, `mend/__init__.py` |
| Browser bridge | `web/mend-client.ts`, `web/mend-client.test.cjs`, `web/README.md` |
| Inherited schema and backend RPC overlay | `migrations/001_mend.sql`, `migrations/002_backend_rpc.sql` |
| Rehearsal and feasibility measurements | `scripts/local_rehearsal.py`, `scripts/phase1_spike.py`, `deploy/timing_probe.py` |
| Container/deployment configuration | `deploy/api.Dockerfile`, `deploy/runner.Dockerfile`, `deploy/spike.Dockerfile`, `deploy/compose.yaml` |
| Backend regression tests | `tests/test_auth.py`, `tests/test_bootstrap.py`, `tests/test_core.py`, `tests/test_http.py`, `tests/test_inference.py`, `tests/test_repository.py`, `tests/test_runner.py`, `tests/test_service.py`, `tests/test_spike.py` |

Continuity and evidence records: `docs/BLUEPRINT.md`, `docs/baseline/`, `docs/AUDIT_2026_10_12.md`, `docs/agent-handoffs/`, and `docs/verification/`. The existing Site remained unchanged in the recorded backend correction pass; its separately captured interaction and static-example regressions remain explicit source-level evidence.

### 🔍 Plain-English Explanation

The main risk was treating a plausible-looking result as stronger evidence than it actually supplied. A successful workload, a cancellation acknowledgment, or candidate-authored output cannot prove that remote infrastructure stopped or that trusted checks passed. Those boundaries now fail closed. SDK workload timestamps remain workload timestamps; infrastructure termination requires a separate authenticated reader, exact job identity, an independent proof reference and valid chronology. Candidate stdout remains diagnostic output.

Other corrections protect ownership and recovery. Cancellation intent is committed independently of a busy execution lease; due jobs can be cancelled concurrently. Normal mutations remain lease-fenced. A restarted worker reconciles existing work without issuing duplicate jobs. Finalizing remains a separate persisted state before an atomic receipt/pass/event commit. Immutable artifacts can be reused only when canonical bytes match.

| Previously observed defect | Recorded correction |
|---|---|
| Concurrent task entry and heartbeat failure could bypass or strand the running guard | A single generation owns the guard; cleanup releases it even when heartbeat handling fails. |
| Worker lease contention and serial cancellation delayed independent deadlines | Service-only deadline cancellation commits intent under task/attempt locks; independent cancellation requests run without waiting for ordinary worker reconciliation. |
| Cancellation exceptions prevented observation of a completed job | Observation continues after rejected cancellation; acknowledgment alone never resolves the attempt. |
| SQL and local fixtures disagreed about deadlines, cancelled drafts and reasons | Scheduler eligibility, task/retention deadlines, canonical reason mapping and bounded diagnostics now align. |
| Malformed completions or usage overruns could lose spend evidence | Reservations precede inference and remain charged; actual usage and finite overage evidence persist separately. |
| An awaited SSE event could arrive after session expiry or disconnect | Eligibility is checked after awaits and again after serialization; abandoned readers close without cancelling the coding task. |
| JSON exponent overflow, duplicate fields and malformed configuration escaped safe validation | Finite-number parsing, duplicate rejection and consistent origin normalization produce safe failures. |
| Browser callbacks, early transfer rejection and owner changes could strand resources or lose replay | Transfer ownership is aborted on rejection; callback failures cannot prevent disposal; cursors advance only after delivery; account changes retire prior streams. |
| Filesystem races, symlinks or nonregular files could redirect reads/publication | Descriptor-scoped paths, private owned SQLite files and immutable publication reject unsafe file types and directory rebinding. |
| Split UTF-8 logs, missing initial CLI output and truncation could obscure diagnostics | Incremental decoding preserves characters; safe attribution and a single persisted truncation marker retain event ordering. |
| Provider metadata, pagination and reports could produce raw errors or invented identities | Responses are typed and bounded; operation acknowledgments trigger read-only reconciliation; unknown evidence stays unresolved. |
| Truthy strings and incomplete check reports could resemble success | Strict boolean/integer fields, exact commands/check IDs, complete counts, matching identities and valid chronology are required. |
| Spike interruption could lose cleanup identity or overstate timing fit | Cleanup identity survives journal failure; workload and infrastructure stop remain distinct; measured projections cannot become guarantees. |

The existing Site preserves warm-paper canvas, hard ink shadows, the static canvas texture, focus rules, continuous code numbering and the commented failed-state annotation. Pointer tilt remains imperative, frame-batched and bounded to ±3°, with stable cached bounds and reduced-motion cleanup. Captured tests support these implementation behaviors; they do not constitute a new visual browser audit.

### 💻 Code Diff

No authenticated before-and-after source diff was retained in the reviewed audit or final convergence handoff. Fabricating removed lines would misrepresent the checkpoint. The table above records the exact implementation delta supported by those documents; the current source files remain the implementation authority.

This resume step adds only this report. Completed backend files, Site source, baseline documents and deployment settings are not rewritten by this step.

### 🧪 Simulated Test & Verification Output

The following are excerpts from already captured stdout in `docs/verification/`, rather than newly executed tests or invented demonstrations.

Backend unit suite, `python-unittest.txt`:

```text
Final convergence, 2026-10-12
$ python3 -m unittest discover -s tests -v
----------------------------------------------------------------------
Ran 168 tests in 2.064s

OK (skipped=4)

Exit code: 0
```

The result is **164 passed and four explicitly skipped**, not 168 passed. The three HTTP cases require genuine FastAPI/Starlette/httpx; the database case requires isolated PostgreSQL/psql:

```text
test_http_to_store_repair_receipt_and_sse_roundtrip (test_http.HttpIntegrationTests.test_http_to_store_repair_receipt_and_sse_roundtrip) ... skipped 'FastAPI/Starlette/httpx unavailable; genuine HTTP integration pending.'
test_real_http_rejects_csrf_wrong_origin_and_oversized_prompt (test_http.HttpIntegrationTests.test_real_http_rejects_csrf_wrong_origin_and_oversized_prompt) ... skipped 'FastAPI/Starlette/httpx unavailable; genuine HTTP integration pending.'
test_real_http_rejects_overflowing_numeric_json (test_http.HttpIntegrationTests.test_real_http_rejects_overflowing_numeric_json) ... skipped 'FastAPI/Starlette/httpx unavailable; genuine HTTP integration pending.'
test_transactional_database_fixture (test_repository.DatabaseExecutionTests.test_transactional_database_fixture) ... skipped 'No isolated PostgreSQL DSN/psql; migration execution pending.'
```

Browser bridge, `browser-client.txt`:

```text
$ node --test web/mend-client.test.cjs
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1005.131596

Exit code: 0
```

Existing Site interaction regressions, `site-interactions.txt`:

```text
$ node --test tests/demo-clock.test.mjs tests/pointer-tilt.test.mjs
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 102.744269

Exit code: 0
```

Trusted static example, `site-example.txt`:

```text
$ python3 -m unittest -v test_csv_tools
test_duplicate_rows (test_csv_tools.CsvChecks.test_duplicate_rows) ... ok
test_empty_input (test_csv_tools.CsvChecks.test_empty_input) ... ok
test_field_order (test_csv_tools.CsvChecks.test_field_order) ... ok
test_missing_values (test_csv_tools.CsvChecks.test_missing_values) ... ok

----------------------------------------------------------------------
Ran 4 tests in 0.000s

OK

Exit code: 0
```

Local repair-loop rehearsal, `local-rehearsal.txt`:

```text
$ python3 scripts/local_rehearsal.py
[LOCAL FIXTURE ENVIRONMENT — NO GENERATED CODE EXECUTED]
PASS: failed check -> one repair -> passing fixture -> durable local_test receipt
PASS: ordered persisted SSE events; protected source bundle round-trip verified
{
  "source": "local_test",
  "live_verification": false,
  "executions": 2,
  "repairs": 1,
  "checks": [
    "test_csv_tools.CsvChecks.test_empty_input",
    "test_csv_tools.CsvChecks.test_duplicate_rows",
    "test_csv_tools.CsvChecks.test_missing_values",
    "test_csv_tools.CsvChecks.test_field_order"
  ],
  "events": 16
}

Exit code: 0
```

The fixture supplied the reported check results; the rehearsal did not execute model-generated source or establish live protected-check execution. FixtureRunner job state remains process-local, and local artifact identifiers are not browser-download links.

Syntax verification, `syntax-compile.txt`:

```text
$ python3 -m compileall -q mend scripts tests deploy/timing_probe.py

Exit code: 0
```

The separately captured `spike-dry-run.txt` reports `source: dry_run`, `provider_requests: 0`, and `live_release_ready: false`, with exit code 0. It leaves trusted report transfer, receipt finalization, isolation, log delivery, cloud job cost and actual infrastructure termination unmeasured. Compilation and a no-network dry run do not substitute for framework, database, container or provider execution.

The independent convergence handoff also records these assertion-backed local exercises:

```text
Cancelled draft: stopped; jobs=0; next_sequence=max+1
Task deadline without attempt: stopped; reason=task_timeout
Malformed complete string: needs_help; receipt=False
Production retry counter: canonical public api_retry_count=2
```

### 🚀 Deployment & Demo Checklist

- **Keep live release blocked.** Bootstrap rejects live-enabled startup; trusted `report_reader` and independent `termination_reader` authorities remain unwired. A flag cannot promote fixture evidence to live evidence.
- **Execute the skipped integrations.** Apply migrations to isolated PostgreSQL and run transaction/locking races. Install genuine FastAPI/Starlette/httpx and exercise HTTP, secure cookies, CSRF, origins and SSE through the intended HTTPS proxy.
- **Build and exercise containers.** Docker build, volume permissions and UID10001 behavior remain unexecuted. The captured namespace could not map UID10001; observed SQLite mode 0600 under the available UID does not establish deployment interoperability.
- **Verify the account model and pricing.** Confirm the selected Nemotron 3 variant and exact API ID with a real Token Factory call; supply measured input/output pricing provenance and an explicit cost cap through environment configuration. No credentials are embedded in source.
- **Measure real timing before accepting limits.** Measure inference, provisioning/queueing, cancellation acknowledgment and independently evidenced infrastructure stop. Nebius's native timeout minimum is 3600 seconds; cancel-at-60 does not prove stop-by-60. Any positive cancel-to-stop delay at that mark violates the strict bound. Sampling alone is not a guarantee; the live gate stays blocked unless the bound is defensible or the requirement is explicitly amended.
- **Establish trusted isolated checks and report transport.** Candidate code must not control the trusted report authority or its signing material. Confirm exact frozen commands/checks, hashes, identities, isolation and log attribution. Candidate stdout cannot manufacture a receipt.
- **Verify the total budget.** Measure up to four generation calls and four executions, token/cost usage, provisioning and finalization against the 600-second total task budget. Explicitly flag any measured misfit.
- **Complete physical retention.** Logical expiry is enforced. Automated deletion of actual Storage/disk bytes and metadata remains incomplete; purge must wait until unresolved jobs are independently confirmed stopped. No physical 24-hour deletion claim is supported.
- **Preserve truthful demo access.** The existing Site remains simulated evidence with unchanged audience and visual tokens. No backend deployment, public repository publication or judge access change is recorded. A real demonstration requires those boundaries to be completed and evidenced before a verified receipt is advertised.

The local implementation checkpoint is verified within the stated fixture and source boundaries. The project is not yet a released live Nebius execution service, and no claim of perfection is supported.

## [STATE SAVE]

- Completed in this resume step: `TRUSTWORTHY_FIX_REPORT.md` only.
- Preserved: completed implementation files, baseline v1.2 documents, existing Site and captured final verification logs.
- Last confirmed verification: 168 Python tests run, 164 passed, four skipped; browser bridge 10 passed; Site interactions 10 passed; trusted static example four passed; local rehearsal, dry-run spike and syntax compilation exited 0.
- Remaining gates: genuine HTTP/PostgreSQL/Docker execution; account model/pricing; trusted report and termination authorities; measured strict 60-second feasibility and 600-second fit; physical purge; live deployment and submission access.
- Single next target: package and save the completed source archive and report artifacts. No additional coding is started at this checkpoint.
- Execution paused pending `NEXT`.
