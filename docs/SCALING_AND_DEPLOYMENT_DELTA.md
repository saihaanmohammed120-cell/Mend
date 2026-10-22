# Mend — video-guided backend and deployment delta

Date: 13 October 2026. Canonical project: `Mend/`. This is a focused implementation checkpoint extending the existing PRD, TRD, app flow and Paper and Proof design brief. It does not replace the full project report or claim completed provider/browser execution.

## Outcome and boundaries

The video's visible themes were mapped to actual Mend code: database indexes, caching, load balancing and Docker consistency. Confirmed gaps received changes. Existing indexes were retained; broad caching and extra replicas were deferred. No UI tokens, animations, landing/demo files or public Site were changed. Audio narration was not transcribed, and no unavailable video instruction is treated as a confirmed requirement.

| Video theme | Observed gap or evidence | Applied decision |
| --- | --- | --- |
| Database indexes | Real owner-history/event-replay plans use existing indexes. Polling unnecessarily hydrated full attempt reports. | Retain indexes; return compact dispatch identities. |
| Caching | Normal finalization already needs an actual Storage readback. Recovery fetched identical bundle bytes again after an immutable-write conflict. | Reuse only bytes actually fetched within that invocation; retain verification. |
| Load balancing | No real multi-instance/provider execution evidence establishes global concurrency, recovery or SSE behavior. | Add explicit release prerequisites; keep replica/load-balancer expansion deferred. |
| Docker consistency | Canonical deployment referenced missing Dockerfiles; default Compose started incompatible database-only workers; dependencies floated at build time. | Restore Dockerfiles, gate workers with a profile, hash-lock runtime/build dependencies, add a pinned-base local build helper. |

## Trustworthy fix report: compact dispatch

**Original problem.** `pending` returned complete task views, including source contracts and attempt reports, although `worker.py` only consumes task IDs. A bounded batch of legitimate local tasks with bounded reports can exceed the repository's response-size limit. That can prevent useful scheduler polling even when no individual report violates its own limit.

**Files changed.** `backend/mend/local_store.py`, `backend/migrations/002_backend_rpc.sql`, `backend/tests/test_pending_dispatch.py`. Applied live migration is preserved as `backend/migrations/20261013145142_mend_compact_pending_dispatch.sql`; the version came from Supabase MCP, not a locally invented timestamp.

```diff
- SELECT jsonb_agg(mend_private.task_view(t.id)) FROM public.tasks t ...
+ SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id)
+ FROM (SELECT id,status,created_at FROM public.tasks
+       WHERE status IN ('writing','waiting_runner','running','fixing','finalizing','stopping')
+       ORDER BY created_at,id LIMIT n) x;
```

The excerpt highlights the projection/order change; the saved migration contains the complete function. SQLite polling now projects the same fields directly instead of deserializing every full task. Owned task reads still provide their complete evidence. Deadline polling, status enum, fenced claims, grants and release gating were not rewritten.

**EVIDENCE S179 — `exec_command`, local injected fixtures.** A fresh root reproduction created 20 tasks with legitimate local state transitions and bounded runner reports. Full views serialized to 2,559,451 bytes; compact dispatch serialized to 2,081 bytes. Largest report was 61,340 bytes against the existing 65,536-byte report cap. Returned IDs matched the fixture tasks, with only `created_at`, `id`, `status`. This is payload-size evidence, not a production latency or throughput benchmark. Raw result: `backend/docs/verification/scaling-dispatch-fixture.json`.

**EVIDENCE S180 — `supabase_apply_migration`, `supabase_execute_sql`, `supabase_list_migrations`.** Actual project `uwkdrmdflzverflcfkgk` accepted migration `mend_compact_pending_dispatch`; the subsequent live catalog/dispatch read returned:

```json
[{"compact_dispatch_verification":{"anon":false,"pending":[],"service_role":true,"authenticated":false,"release_enabled":false,"compact_projection":true}}]
```

The migration list returned version `20261013145142` for that name. This proves the applied projection, current empty dispatch result and checked grants/gate. A live active-task large-report run remains **unverified**; no synthetic provider task or release activation was created to manufacture that result. Raw record: `backend/docs/verification/scaling-supabase.json`.

## Trustworthy fix report: artifact read reuse

**Original problem.** Immutable-write recovery fetched existing bundle bytes to compare them, then fetched those same bytes again for verification. Submitted bytes alone are not proof of stored bytes; persistent caching would also need additional ownership/retention/invalidation guarantees.

**Files changed.** `backend/mend/service.py`, `backend/tests/test_service.py`.

```diff
- return storage_key
+ return storage_key, None  # A fresh PUT still requires actual GET readback.
...
- return storage_key
+ return storage_key, existing  # Conflict path already fetched and compared bytes.
...
- roundtrip = await artifacts.get(key)
+ if roundtrip is None:
+     roundtrip = await artifacts.get(key)
  verify_bundle(roundtrip, expected_snapshot_sha256)
```

This is same-invocation reuse, with no persistent cache. Fresh writes retain actual readback; conflict bytes must match; bundle verification still runs. Targeted regressions cover fresh readback, corrupt/missing recovery data, cancellation, budget expiry and retention expiry. These use local/injected adapters; real Storage performance and real provider recovery remain **unverified**. Full suite evidence below includes these assertions. No authentication, owner-task state, SSE or signed-download authorization was cached.

## Trustworthy fix report: deployment preparation

**Original problem.** The canonical folder lacked the API/runner/spike Dockerfiles referenced by deployment preparation. Compose also started workers by default despite their rejection of database-only mode, and API dependencies were resolved afresh during builds.

**Files created/restored/updated.** `backend/deploy/api.Dockerfile`, `runner.Dockerfile`, `spike.Dockerfile`, `compose.yaml`, executable `build_images.sh`, `build-requirements.in`, `backend/requirements.runtime.lock`, `backend/tests/test_deployment.py`, `backend/docs/DEPLOYMENT.md`.

```diff
+ image: ${MEND_API_IMAGE:-mend-api:local}
  orchestrator:
+   profiles: [execution]
  deadline:
+   profiles: [execution]
- RUN pip install .
+ RUN pip install --require-hashes -r requirements.runtime.lock
+ RUN pip install --no-deps --no-build-isolation .
```

The helper requires an operator-supplied base-image digest, validates plain build tags, quotes paths and stops on the first build failure. `MEND_API_BUILD_TAG` is the build tag; `MEND_API_IMAGE` is the common Compose runtime reference and may be a verified image digest. These are separate so a pinned runtime reference does not fail build-tag validation. Only local builds are requested; the helper neither pushes images nor provisions a provider resource. Direct Dockerfile defaults remain floating convenience values, so release preparation must use the pinned-base path and verify resulting image identities.

**EVIDENCE S182 — `exec_command`.** Shell syntax completed; six fake-Docker command-capture regressions passed. A real helper invocation encountered no Docker executable and returned:

```text
Blocked: Docker is not available; no images were built.
exit status: 3
```

The digest used for that guard probe was syntax-only fixture data, not a verified available image. Actual image builds, Compose startup, volume permissions, non-root runtime enforcement, isolation and container restart recovery remain **unverified**. A reused volume may override image-directory ownership; the deployment guide requires an actual UID write/restart probe and does not recommend world-writable permissions.

**EVIDENCE S183 — `exec_command`.** Hash-checked dependency installation completed in an isolated CPython environment; `pip check` returned `No broken requirements found.` The runtime lock contains build tooling as well as application dependencies. It was resolved for CPython 3.12/Linux x86-64; no untested cross-platform image claim is made. HTTPX was separately installed as a declared test-only dependency. Actual Docker installation remains **unverified**.

## Current verification, with evidence limits

**EVIDENCE S184 — `exec_command`.** Complete canonical backend suite:

```text
Ran 240 tests in 3.967s
OK (skipped=1)
```

Separate locked-runtime environment:

```text
Ran 240 tests in 3.748s
OK (skipped=1)
No broken requirements found.
```

Each run has 239 passing cases and one skipped isolated-Postgres fixture. These local/framework regressions do not substitute for real PostgreSQL concurrency, provider E2E or browser acceptance. The output includes an HTTPX TestClient deprecation warning; it is recorded rather than presented as a warning-free run. The command wrapper used `httpx` as the current declared test dependency.

Actual local Uvicorn probes in both environments returned `/healthz` 200 and `/readyz` 503 with `ready:false`, `mode:database_only`. Existing environment used Starlette 1.7.0; locked runtime used 1.8.0. The gate explicitly reported missing live evidence/provider configuration. No fabricated session or job was submitted. Raw records: `backend/docs/verification/scaling-backend.txt`, `scaling-locked-runtime.txt`, `scaling-http.json`, `scaling-locked-http.json`, `scaling-runtime-dependencies.json`, `scaling-deployment.txt`.

**EVIDENCE S178 — `supabase_execute_sql`.** Fresh real plans used `tasks_owner_recent` for owner history and `logs_task_id_sequence_key` for ordered replay; compact polling used `tasks_deadline` with a sort. Current results were tiny/empty and do not justify a throughput claim or another index. Raw plans: `backend/docs/verification/scaling-query-plans.json`. A diagnostic query first used the wrong `event` column, then was corrected from the schema to `event_type`; failed output is not counted as verification. Temporary payload-measurement helper imports/serialization were also corrected before the saved successful reproduction; those helpers were not application changes.

## Remaining gates and recommended sequence

1. Keep live execution disabled. Obtain private Token Factory/Cloud configuration and a reviewed spending scope; run one real NVIDIA Nemotron 3 inference plus fixed Nebius probe, retaining request/job IDs, provisioning latency and cancel-to-confirmed-stop measurement. The strict job bound and total task budget remain **unverified**.
2. Connect Playwright on PC and record the real authenticated browser story against the existing app. Visual correctness remains **unverified**; no UI polish is prioritized ahead of real execution evidence.
3. Assemble trusted report/termination readers, then establish real isolated execution, source-bound receipts, cross-owner Storage denial and restart/concurrency/cancellation behavior before enabling live tasks.
4. Build actual digest-pinned images, inspect context/volume permissions, run Compose database-only acceptance and validate replica/global cost/SSE safety before scaling.
5. Resolve the inherited frontend dependency/support migration; this slice does not claim dependency advisories are cleared. GitHub public repository/license/CI and walkthrough recording remain **unverified** in this slice because no fresh remote/recording check occurred.
6. Only afterward expand generic bug repair, independent reviewer/task graphs, frozen regression comparison, history/report screens and physical purge. Local Bug Desk remains an intake/review packet, not a verified bug-fixing service.

Official Docker sources consulted: <https://docs.docker.com/build/building/best-practices/> and <https://docs.docker.com/compose/how-tos/profiles/>. Supabase query-index guidance and FastAPI Context7 documentation were consulted before scoped work. Documentation is implementation guidance, not evidence of a deployed system.

## [STATE SAVE]

Completed slice: compact dispatch applied to actual Supabase; same-invocation artifact read reuse; canonical Dockerfiles restored; hash lock/build guard/profile boundary; current backend/HTTP verification. Canonical files are under `Mend/`; earlier copies are not the implementation target. Source archive and root `MEND_STATE_SAVE.md` include this delta and the authoritative migration. No public deployment, paid/provider operation, UI change or release activation occurred. Resume at real browser/provider measurement prerequisites, not another rewrite of completed files.
