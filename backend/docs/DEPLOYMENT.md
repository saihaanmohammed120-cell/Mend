# Mend deployment preparation

Current integration and Render settings: [24 October backend continuation](../../docs/BACKEND_INTEGRATION_2026_10_24.md). `MEND_DATABASE_WRITES_ENABLED=false` now independently enforces the hosted database hold at both HTTP and repository boundaries. Authentication and stateless bug-contract review remain available when private server configuration is supplied. Do not turn this flag on without lifting the existing database hold; provider release remains independently blocked.

This is a configuration preparation guide, not an authenticated application deployment report. The public MIT source and static Site exist; the provider-backed full-stack workflow remains gated. On 22 October, missing API/runner/spike Dockerfiles were restored and packaging regression checks added. The offline CI now builds all three images against a verified digest-pinned official Python base and checks non-root imports/readability without running services, generated code, timing probes or provider calls. Consult the exact commit's Actions result before treating those image checks as passed.

## 1. Local baseline

Run the README test and rehearsal commands. Retain stdout, skipped dependency tests and the source manifest. A local repair simulation proves control-flow mechanics only. `local_test` receipts must remain visibly labeled and cannot enter the production `receipts` table.

The API factory is `mend.bootstrap:create_app_from_env`; durable worker entry points are `python -m mend.worker --role orchestrator` and `python -m mend.worker --role deadline`. The deadline process is independent so a generation call cannot block the cancel scheduler. Provider stop confirmation remains a separate reconciliation step.

## 2. Database and private storage

For a **fresh development Supabase project**, apply `migrations/001_mend.sql` then `002_backend_rpc.sql` as the migration owner, and run the PostgreSQL fixture suite in that isolated environment. The existing Mend project `uwkdrmdflzverflcfkgk` already has its initial schema/RPC migrations; do not replay CREATE statements there. On 13 October 2026, Supabase MCP applied `mend_compact_pending_dispatch`, and its returned migration version is recorded in `migrations/20261013145142_mend_compact_pending_dispatch.sql`. The post-read confirmed the compact dispatch projection, service-role execution permission, denied anon/authenticated RPC execution and a disabled release gate. Literal output is in `docs/verification/scaling-supabase.json`. Full isolated PostgreSQL concurrency/race tests remain unverified and skipped without an isolated DSN.

The service-role credential is server-only. Browser writes to tables/RPCs are denied; owned rows are read through RLS and worker mutations through fenced RPC actions. The `mend-artifacts` bucket is private. Test signed URLs, immutable uploads and cross-owner denial against real Storage. Do not delete Storage metadata directly to pretend the underlying bytes were deleted.

Keep `mend_private.release_gate.live_execution_enabled=false`. The database release record requires a real monetary cap and evidence reference; neither is populated by this implementation. Owner/operator activation is a later reviewed operation after the gates below pass.

## 3. Authentication and same-site frontend

Create the session seal key in a private terminal:

```bash
python -c 'import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
```

Put it in `MEND_SESSION_SEAL_KEY`, never in source or screenshot. Configure genuine `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `MEND_PUBLIC_ORIGIN` and matching explicit `MEND_ALLOWED_ORIGINS`. The API validates the Supabase access token, exchanges it for a secure HttpOnly session cookie, and binds mutations to Origin plus a CSRF token. Use TLS for browser sessions.

Proxy `/api/*`, `/healthz` and `/readyz` through the **same HTTPS origin as the eventual frontend**. Native `EventSource` uses the same-site cookie; it must not carry provider keys or tokens in its URL. Proxy configuration must disable buffering/caching for SSE, preserve `Last-Event-ID`, and allow the long-running stream. Session expiry ends the stream and requires a valid refresh/session exchange.

The existing static Mend site has not been connected to these routes. A Vercel or other frontend reverse proxy is an integration choice to validate later; no Vercel/Fly deployment is claimed. CORS alone does not make strict same-site cookies work on an unrelated origin.

## 4. Server containers

After privately populating `.env`, resolve and independently verify an actual Python base-image digest. Export that real digest reference as `PYTHON_BASE_IMAGE`; no example digest represents an available image. Build preparation uses hashed dependencies from `requirements.runtime.lock` and the local build helper:

```bash
deploy/build_images.sh
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml up -d --no-build api
```

Actual Docker builds and Compose startup remain unverified: Docker is unavailable in the current environment, and the helper exited with its explicit no-build blocker. Shell syntax and fake-Docker command-capture regressions were executed; those are not image-build evidence. `MEND_API_BUILD_TAG` controls the helper's local API build tag; `MEND_API_IMAGE` controls the common Compose runtime image, and may be a verified registry digest. With defaults, both use `mend-api:local`; a custom build tag must be paired with the intended runtime reference. Build tags and deployed immutable image identities are distinct.

The default Compose invocation starts only the API. Orchestrator/deadline services require the `execution` profile and passing live release prerequisites; database-only mode must not start workers that reject that mode. After those gates pass, an operator may explicitly start the profile. No additional replicas or load balancer are enabled by this preparation.

API binds host loopback only; an external HTTPS proxy is required. The files configure UID/GID 10001, dropped capabilities, a read-only root filesystem and bounded temporary storage; actual runtime enforcement remains unverified. The API, orchestrator and independent deadline worker share the `mend-data` volume. A reused volume can override image-directory ownership: verify UID 10001 write access, cross-process persistence and restart recovery on the actual volume before deployment; do not use world-writable permissions to hide a failed probe. Process-local model/runner fixtures cannot prove provider recovery across restarts. Real recovery tests need provider reconciliation or an explicitly persistent test provider. Local artifact URIs are labeled test identifiers, not browser-download links.

Do not treat `/healthz` as a live-provider verification: it reports process liveness. `/readyz` exposes configuration blockers, with provider verification explicitly not established by that endpoint. Healthchecks may be healthy while release remains blocked.

The API Dockerfile installs `requirements.runtime.lock` with `--require-hashes`, then the project with `--no-deps --no-build-isolation`. The lock includes build tooling from `deploy/build-requirements.in`. It was resolved for CPython 3.12/Linux x86-64; other target platforms need separate validation. All Dockerfiles require a caller-supplied `PYTHON_BASE_IMAGE`; the build helper requires its digest-pinned form, verifies all definitions exist before building any image and stops on the first build failure. Compose explicitly passes the supplied base. Runner/timing images copy only their respective trusted probe and receive no API package, runtime dependencies or secrets. CI image smoke checks do not establish volume persistence, API startup, provider isolation or stop timing. Verify resulting API/runner/spike image digests before deployment. Compose env files are server-only. Never build them into an image, print expanded secret-bearing Compose output, or inject them into generated-code jobs.

## 4.1. Scaling boundaries

Actual small-data PostgreSQL plans already use owner-history and event-replay indexes. Compact dispatch now returns only `id`, `status` and `created_at`, with deterministic ordering; source/history evidence remains in separate owned task reads. Its local large-report fixture prevents over-sized polling responses, but does not establish live throughput. Retain uncached authentication, ownership, task state, SSE and signed-download authorization. Artifact read reuse is limited to actual stored bytes already fetched within the same finalization invocation; fresh writes still require readback and bundle verification.

Do not add worker replicas until shared global concurrency/cost bounds, fenced claims, restart recovery and cancellation races have real evidence. Test SSE replay across API instances before routing streams through a load balancer. A partial active-task ordering index is a candidate only if representative EXPLAIN/load measurements show the current sort is material. Persistent artifact caches require measured repeated reads and explicit owner/retention/invalidation rules; they are not part of this change.

## 5. Nebius integration — deliberately blocked

Inference defaults to `https://api.tokenfactory.nebius.com/v1` and NVIDIA candidate `nvidia/nemotron-3-super-120b-a12b`. Confirm account availability with a real model-list call and a real completion. Measure latency/quality for the chosen Nemotron 3 variant rather than asserting the account can use every variant. Token Factory and Nebius Cloud IAM credentials are distinct; an additional NVIDIA key is not required merely to call an NVIDIA model through Token Factory.

The runner adapter needs a real project, subnet, platform/preset, immutable container image, authenticated bounded log transport and a trusted structured report transport. These account-specific values must be verified against the real account; report wiring is **not fully composed yet**. Account identifiers are read from `NEBIUS_SUBNET_ID`, `NEBIUS_PLATFORM`, `NEBIUS_PRESET`; prices from `MEND_INPUT_PRICE_PER_MILLION`, `MEND_OUTPUT_PRICE_PER_MILLION`, `MEND_PRICE_PROVENANCE`. Trusted report transport and safety evidence remain unresolved: the bootstrap rejects `MEND_LIVE_ENABLED=true` even if credentials and account values are supplied. These adapters need deliberate integration and review before activation. No stdout string or untrusted file alone can establish provider completion or supervisor integrity.

`deploy/runner.Dockerfile` is a separate image; it receives generated files and protected checks only. Nebius job/runtime policy must prove non-root execution, no ambient credentials, protected-file immutability, read-only base, disposable workspace, process/resource limits, no metadata/network access and no privileged/host mounts. A Dockerfile alone does not prove provider isolation.

The provider's 3600-second minimum configured timeout is only a last-resort safety net. The backend deadline worker persists cancellation intent and actively calls cancellation. It must measure actual cancel-to-confirmed-stop latency. A cancellation acknowledged at 60 seconds with positive stopping delay fails the strict stop-by-60 requirement; do not claim configuration solves this contradiction.

## 6. Release evidence checklist

- Real account model discovery, selected NVIDIA open-source model completion and exact model/request IDs.
- Applied SQL, ownership/grants tests and two-worker concurrency/cancellation races.
- Real isolated Nebius job, immutable source/report identities, exact checks and protected supervisor evidence.
- Measured provisioning/queueing, execution, inference per call, result transfer, cancellation-to-stop and receipt finalization; explicit assessment of strict 60s and total 600s feasibility.
- Durable restart recovery, ambiguous dispatch reconciliation, independent deadline cancellation and no duplicate job.
- Secret scanning, CSRF/session expiry, SSE replay/reconnect and private artifact cross-owner tests.
- Downloaded bundle reproduced against exactly the checks named on the persisted receipt.
- Same-site frontend/API integration and fresh judge-access test; current private site audience changes require deliberate action.
- Public MIT repository, setup documentation, real demonstration recording and required provider feedback.

Until these pass, retain live mode disabled and present the existing animation as **simulated evidence**.

## Optional provider spike

A separately reviewed fixed trusted probe may use `MEND_SPIKE_IMAGE` and `MEND_SPIKE_PROBE_APPROVED`; these default empty/false and do not enable generated-code execution or release. Confirm the spike script's exact interface and non-production resource scope before supplying credentials. Retain actual model/queue/cancel latency output; no inferred provider timing qualifies as measurement.

## Audit corrections and retry boundaries

`MEND_TASK_COST_CAP` is required by the optional provider spike and must be configured from an explicit spending decision; the environment example leaves it blank. It is not an invented default price or an automatic grant to use paid resources.

The Docker context ignore file excludes private env files, databases, keys, logs, private artifacts/evidence and Git/dependency caches before uploading the build context. Keep the server-only environment injection boundary unchanged.

A new task Start must fit its entire 600-second budget inside remaining 24-hour retention. Independently scheduled cancellation also handles expiry and tasks with no unresolved attempt; this is a source implementation, still awaiting PostgreSQL concurrency/runtime verification. Expired rows remain inaccessible to browsers, while safety reconciliation can still finish stopped work.

An ambiguous finalization response must be reconciled through the authenticated owner's task/receipt read while unexpired. Existing successful receipts remain immutable. Mutation RPCs continue to require an unexpired worker lease; retry logic must not remove that fence or dispatch another job merely because a client timed out. Invalid diagnostic codes do not override the cancellation reason; trusted truncation markers are system evidence rather than invented candidate output.

CLI output may combine Docker stdout and stderr. Preserve `provider_stream=unattributed` in persisted log metadata when the provider transport cannot distinguish them; the backend transport's stdout channel is not proof of the container's original stream. Production stream attribution and delivery must be verified against real Nebius logs before presenting that provenance as established.
