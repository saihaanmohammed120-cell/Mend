# Mend — code, checked and repaired

**Current hosted boundary, 29 October 2026:** the public Render service is deployed in explicit setup-only mode (health liveness available, readiness blocked); its existence does not establish authentication, database operations or execution. The Vercel app exposes that real setup status. Both provider and hosted-database holds remain. The latest source wires the [task inference cap](docs/TASK_BUDGET_CONFIGURATION.md) and verifies locked runtime versions in CI; see [current scope and evidence](../docs/DELIVERY_2026_10_29.md). Earlier checkpoints below retain their original dates and are historical where superseded.

**Backend continuation, 24 October 2026:** the Next proxy now exposes authenticated stateless bug-contract preparation. A default-off database write setting enforces the existing hold before transport. New checks exercise production Next → real Uvicorn/FastAPI with fixture identity; CI adds a disposable PostgreSQL migration/rollback fixture. Hosted startup still needs the private Supabase server key; no hosted backend or live repair is implied. See [behavior, checks and Render configuration](../docs/BACKEND_INTEGRATION_2026_10_24.md) and the exact-commit Actions result.

Mend is a bounded self-healing coding agent for the **Coding and Agentic Engineering** track of the Nebius × NVIDIA hackathon. A frozen Python task contract defines editable source, protected checks, and approved commands. The intended live loop generates code with an NVIDIA Nemotron 3 model through Nebius Token Factory, runs an isolated Nebius Job, repairs a failed check up to three times, and delivers a verified receipt plus the tested source bundle.

**Historical Phase 2 status (17 October 2026): database schema and real local backend write verified; provider execution remained blocked.** The Paper and Proof website separates a simulated `/sample` route from actual captured local CSV checks and an unsigned standards-based provenance document. Neither establishes provider execution. This repository does not turn that animation into proof of live inference or execution. Phase 2 applied the actual Supabase migrations and verified a rollback-only SQL/RPC/RLS probe. No cloud deployment, paid resource provisioning, provider cancellation measurement, or live receipt is claimed.

For database initialization without Nebius credentials, set `MEND_MODE=database_only` and keep `MEND_LIVE_ENABLED=false`. This mode uses the real Supabase repository for draft/contract operations, has no model or runner, and blocks Start and worker processes. It requires private Supabase server credentials; browser API startup additionally requires the inherited real Auth, HTTPS-origin and session-seal configuration. It is not provider release readiness. See [Phase 2 checkpoint](../docs/PHASE2_DATABASE_INITIALIZATION.md).

`GET /readyz` now observes a real service-only `mend_runtime_probe()` database response in database/live modes. It returns separate database and release-gate facts, a UTC observation time, and HTTP 503 while any gate is blocked. The caller deadline is ten seconds, with one underlying probe allowed per repository; a timed-out transport keeps that slot until it ends. Local-test mode reports the database as not checked. A successful connection does not establish provider execution or a repair result. The canonical Next workbench exposes these layers through a bounded, allowlisted `/api/runtime` proxy and a Recheck connections control. See [full-stack readiness evidence](../docs/FULLSTACK_READINESS.md).

## Preserved foundation

`docs/baseline` contains the inherited TRD v1.2, Design Brief v1.2, App Flow and Backend Schema. `docs/BLUEPRINT.md` records this implementation overlay and module boundaries. The static design stays intact: warm paper, ink borders, hard shadows, restrained orange, smooth bounded tilt, and clearly labeled evidence. This package implements backend mechanics. The current canonical workbench uses the migrated Next.js stack documented in the root README; Next.js 14 is a historical planning baseline, not the current implementation.

## Limits and evidence

- **60 seconds per job:** persisted deadline, independent cancellation/reconciliation worker. Provider configuration has a one-hour floor and cannot establish this bound. A cancel acknowledgement does not mean the job stopped. Any positive cancel-to-stop delay at the 60-second mark leaves the strict bound unproven and blocks release.
- **Three repair attempts / four execution attempts:** durable reservations, no refund after failed inference, no new job until ambiguous work has been reconciled.
- **600-second task budget / 30,000-token aggregate cap:** bounded policies, not measured latency promises. Record reserved versus actual usage separately; configured price provenance is required.
- **Exact protected checks and commands:** required checks must all execute and pass; missing, skipped, duplicated, changed or invented check evidence cannot produce a successful receipt.
- **Private artifacts and ownership:** per-owner/task paths, immutable snapshots, bundle round-trip verification, owner-only reads, worker lease fencing, append-only ordered events.

## Local verification

Python 3.11+ is required; the production runtime lock targets Python 3.12/Linux x86-64. Core tests use the standard library; cryptography is required for authentication tests. FastAPI and uvicorn are declared runtime dependencies. To verify the production dependency set in a fresh Python 3.12 environment with package-network access, run from `backend`:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install --require-hashes -r requirements.runtime.lock
python scripts/verify_runtime_lock.py --constraints > .venv/runtime-constraints.txt
python -m pip install --no-build-isolation -c .venv/runtime-constraints.txt '.[test]'
python -m pip check
python scripts/verify_runtime_lock.py
python scripts/verify_http_runtime.py
python -m unittest discover -s tests -v
python scripts/local_rehearsal.py
```

CI uses this same hashed runtime install and version gate for the full backend/HTTP suites and the frontend-to-backend chain. Test extras resolve under exported exact runtime constraints, so installing HTTPX cannot replace a production dependency. The verifier rejects unsupported, unpinned, unhashed or duplicate lock entries and fails if any installed runtime version differs. Keep its parser aligned with this lock's pinned SHA-256 format when regenerating dependencies; no lock update is implied by a CI change. The PostgreSQL migration/rollback/team fixture remains a separate disposable CI service.

The rehearsal uses dependency-injected adapters and a `local_test` store. Generated programs are not executed on the host. Its receipt is explicitly non-live and must never be presented as a successful Nebius execution. Tests containing PostgreSQL/framework prerequisites report skips when unavailable; skips are not passes. Browser bridge regressions run with `node --test web/mend-client.test.cjs` and TypeScript 5.9.3 on PATH. Detailed actual output is recorded in `docs/agent-handoffs`, with final integrated output retained by the release report.

## Read-only retention inspection

After applying `migrations/20261017161207_mend_retention_plan.sql`, run:

```bash
python scripts/inspect_retention.py --limit 20
```

This server-only command reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the private environment or `.env`. It inspects at most 1–100 expired tasks, reports aggregate readiness/blocker counts and prints no task IDs, prompts or object paths. `has_more` means the inspected batch is incomplete. It has no apply/delete mode and submits no provider jobs.

`metadata_purge_guard_satisfied` is a database snapshot, not permission to delete later. Active states, unexpired worker leases, unresolved attempts and remaining Storage objects block readiness. Physical purge still requires a separately reviewed Storage-aware worker that rechecks the database safeguards at deletion time. Keep the live execution gate disabled until its independent provider evidence exists.

## Deployment preparation

Read [DEPLOYMENT.md](docs/DEPLOYMENT.md) before running any server configuration. A genuine Supabase auth identity, encrypted secure session cookie, CSRF protection and HTTPS same-site API routing are required. Credentials stay on server services; the runner receives no provider, Supabase or session secrets.

```bash
cp .env.example .env
```

Populate `.env` privately. The compose manifest separates API, orchestrator and deadline worker. Defaults retain `local_test` and live execution disabled. Live bootstrap remains fail-closed until account-specific provider/report/isolation wiring and measured release evidence exist. Setting `MEND_LIVE_ENABLED=true` alone is not a release procedure.

## Repository map

| Path | Purpose |
|---|---|
| `mend/domain.py`, `patches.py`, `artifacts.py` | Frozen contracts, bounded source replacements, canonical identity and private bundles |
| `mend/repository.py`, `migrations` | Supabase RPC transport, constraints, transactional ownership and lease fencing |
| `mend/inference.py`, `transport.py` | Bounded real Token Factory adapter and account model discovery |
| `mend/runner.py`, `supervisor.py` | Nebius adapter, reconciliation, signed-report verifier and diagnostic-only check probe |
| `mend/service.py`, `local_store.py`, `fakes.py` | Bounded orchestration and explicitly labeled test adapters |
| `mend/auth.py`, `api.py`, `config.py` | Supabase identity, sealed cookies, CSRF, API and resumable SSE |
| `mend/bootstrap.py`, `worker.py` | Environment composition and separately supervised worker roles |
| `deploy` | Server/runner images and deployment preparation |
| `tests` | Actual local regressions and explicitly pending database fixtures |

## Submission preparation

The public repository is prepared under the [MIT license](LICENSE); this archive is not evidence that a public repository has been created. Before submission: establish real NVIDIA-model and Nebius evidence, make the build accessible to judges with an intentional sharing choice, verify a fresh-account setup, record the under-three-minute demonstration, and submit provider feedback required by the official rules. [PITCH.md](docs/PITCH.md) provides a truthful recording sequence. Current private site access remains unchanged.

## Offline check-history gate

The new `scripts/check_history.py` consumes existing signed controller reports and a trusted frozen identity inventory. It detects matching-input pass/fail disagreement, fails closed for CI, and flags checks for deliberate review without excluding tests or starting jobs. See [usage, trust boundary, exit codes and limits](../docs/CHECK_HISTORY.md) and [the six-item roadmap status](../docs/ROADMAP_STATUS_2026_10_21.md). This is not live provider verification or a required GitHub check.
