# Mend — Backend Schema

**Workflow point:** 5 — Backend Schema  
**Schema version:** 1.0  
**Governing documents:** TRD v1.2, UI/UX Design Brief v1.2, App Flow  
**Date:** 11 October 2026  
**Status:** implementation files prepared; migration and database regression suite not yet executed against Supabase. Live execution remains disabled by default.

## 1. Scope and evidence

This stage turns the saved TRD into a PostgreSQL migration, read ownership policies, lifecycle guards, execution reservations, ordered events, and an atomic receipt commit. It does not replace the TRD or change the Paper and Proof visual system.

The current published Mend site is a static React demonstration. Its loop, example checks, and illustrative receipt do not prove a working FastAPI/Nebius/Supabase integration. The planned production stack remains Next.js 14, FastAPI, Supabase, Nebius Token Factory, Nebius Serverless Jobs, and authenticated SSE. Nemotron 3 is the model family; choose Nano 30B or Super 120B through measured account-level calls. Super's candidate API ID is `nvidia/nemotron-3-super-120b-a12b`; do not present it as successfully called by this build.

Point 5 is named in the saved workflow. Point 6's title and the referenced video/transcript were not available in the recovered material. This document does not invent that next stage.

### Deliverables

| File | Purpose |
|---|---|
| `migrations/001_mend.sql` | Transactional, apply-once Supabase migration |
| `tests/database.sql` | Rollback-only database fixtures for lifecycle, budgets, event order, receipts, RLS and grants |
| `tests/check_bundle.py` | Packaging and structural checks; explicitly not a SQL execution test |
| `README.md` | Setup, execution and release instructions |
| `BACKEND_SCHEMA.md` | Data contract and backend transaction obligations |

Use a fresh isolated Supabase development project first. The migration intentionally fails on existing conflicting objects instead of silently merging unknown schemas. It makes no changes to the deployed demo or a production database.

## 2. Data boundaries and ownership

Every task belongs to an authenticated Supabase user. `auth.users` is the identity authority; a task's owner cannot change. An optional parent task must belong to that same owner. Revising a frozen contract creates a new owned draft linked to its parent.

RLS is enabled on `tasks`, `task_attempts`, `logs`, and `receipts`. Authenticated users can SELECT their own unexpired records. Anonymous users have no access. Browser writes are revoked; FastAPI verifies identity and ownership before every service-role operation. Possession of a task UUID is not authorization.

The service-role credential exists only on the server. It may insert tasks/attempts/receipts and update explicitly granted lifecycle/evidence columns. It cannot directly update execution or repair counters, sequence allocation, log-byte counters, leases, logs, or receipt rows. Counter/lease/output helpers own those writes. The migration owner remains privileged; this is not a security boundary against a compromised database administrator.

All private helpers use an empty `search_path`, qualified table names, and revoked public execution. Only the four named public backend RPCs are executable by `service_role`. None is callable by `anon` or `authenticated`.

### Relationship map

| Parent | Child | Rule |
|---|---|---|
| `auth.users.id` | `tasks.user_id` | One owner per task |
| `tasks(id,user_id)` | `tasks(parent_task_id,user_id)` | Same-owner lineage; retention clears an expired parent's link |
| `tasks.id` | `task_attempts.task_id` | Up to four reserved execution attempts |
| `tasks.id` | `logs.task_id` | Durable, ordered task events |
| `task_attempts(task_id,id)` | `logs(task_id,attempt_id)` | An event cannot reference another task's attempt |
| `tasks.id` | `receipts.task_id` | At most one successful receipt |
| `task_attempts(task_id,id)` | `receipts(task_id,final_attempt_id)` | Final evidence must belong to this exact task |

## 3. Required tables

The SQL migration is the executable source of truth. All timestamps are `timestamptz`; serialize UTC ISO-8601 on the API. SHA-256 fields use lowercase 64-character hex. A runner image digest is `sha256:<64 lowercase hex>`.

### 3.1 `tasks`

| Columns | Type / rule |
|---|---|
| `id`, `user_id`, `parent_task_id` | UUID identity, immutable owner, nullable same-owner parent |
| `prompt`, `runtime` | Nonempty text; pinned MVP runtime `python` |
| `status` | The twelve persisted states in section 4 |
| `contract`, `contract_version` | Object JSON and positive optimistic version; edits advance exactly once |
| `contract_frozen_at`, `contract_sha256`, `protected_checks_sha256` | Null before Start; together with the deadline immutable after Start |
| `max_repairs`, `job_timeout_seconds` | Fixed at **3** and **60** |
| `repair_count`, `execution_count` | Monotonic reserved slots, 0–3 and 0–4; executions cannot exceed repairs + 1 |
| `usage` | Required numeric `tokens`, `cost`, `api_retries`; token cap 30,000, retry cap 2, nonnegative cost |
| `stop_reason`, `cancel_requested_at` | Stable terminal reason and irreversible cancellation intent |
| `task_deadline_at` | Freeze timestamp + exactly 600 seconds |
| `created_at`, `updated_at`, `completed_at`, `expires_at` | Creation/update, terminal completion, creation + 24-hour retention |
| `idempotency_key` | Required; unique together with owner |
| `next_sequence` | Helper-owned next SSE event number; starts at 1 |
| `lease_owner`, `lease_expires_at` | Nullable together; worker ownership and expiry |

The monetary cap is deliberately not invented. A privileged operator must set it with measured release evidence before live Start is enabled. Contract preparation must also have a configured budget before any model call. Never treat a null cap as permission for unlimited preparation.

`usage.tokens` records cumulative charged aggregate input/output tokens, including preparation. The backend must reserve/authorize a bounded request before calling inference, set a provider output limit within the remaining budget, track in-flight reservations separately, and reconcile actual usage without allowing overlapping calls to overspend. The database checks cumulative recorded usage; it cannot bound a remote model call or calculate undisclosed provider charges. Include reservation accounting and price provenance in `usage` and test it during backend integration.

### 3.2 `task_attempts`

| Columns | Type / rule |
|---|---|
| `id`, `task_id`, `ordinal` | UUID, owned task FK, unique ordinal 1–4 |
| `status` | `reserved`, `submitted`, `running`, `passed`, `failed`, `timed_out`, `cancelled`, `infrastructure_failed` |
| `submission_key`, `job_id` | Unique reconciliation/idempotency key and nullable actual provider job ID |
| `model_id`, `model_request_id` | Actual generation model and optional provider request identity |
| `snapshot_sha256`, `snapshot_storage_key` | Frozen source identity and owner/task private object path |
| `source_file_count`, `source_bytes` | Actual accepted source counts: 1–20 files, no more than 200,000 bytes |
| `image_digest` | Pinned runner image |
| `dispatch_requested_at`, `deadline_at` | Persisted together before submission; deadline = dispatch + 60 seconds |
| `submitted_at`, `started_at`, `finished_at` | Nullable provider timing evidence |
| `exit_code`, `failure_signature`, `diagnostic_evidence_sha256` | Outcome and normalized failure/evidence identity |
| `runner_report`, `report_storage_key` | Versioned structured results and full private evidence |
| `created_at` | Reservation time |
| `resolved_at`, `resolution_evidence` | Confirmed reconciliation, not a UI status inference |
| `cancel_requested_at`, `cancel_acknowledged_at`, `provider_stopped_at` | Separate cancellation request, acknowledgement, and actual stop timing |
| `log_bytes`, `log_truncated` | Helper-owned per-attempt output accounting |

`task_one_unresolved_attempt` is a partial unique index on `task_id WHERE resolved_at IS NULL`. A terminal-looking status, API acknowledgement, unknown submission result, or cancel request does not free the slot. A resolved known job requires `provider_terminal` evidence, a durable reference, and provider stop timing. Without a job ID, resolution must prove `never_dispatched` before dispatch or a reconciled `provider_absent`. Do not infer absence from a temporary lookup error.

Reservation fields and deadlines cannot be rewritten. A failed initial or repaired code check requires both a failure signature and a diagnostic evidence hash. After two consecutive identical failed signatures with identical diagnostic evidence, the repair helper rejects further repairs. Compute evidence hashes from stable, sanitized diagnostic facts; merely editing source or changing timestamps is not new evidence.

For size limits, this stage uses decimal KB: 200KB = 200,000 bytes, 256KB = 256,000 bytes. Backend validation counts decoded source UTF-8 bytes, not transport/ZIP size. This is conservative if an earlier implementation interpreted KB as KiB.

### 3.3 `logs`

| Columns | Type / rule |
|---|---|
| `id` | Generated bigint internal identity; never the SSE replay cursor |
| `task_id`, `attempt_id` | Task FK; nullable attempt with same-task composite FK |
| `sequence` | Helper-allocated monotonic number, unique per task |
| `event_type` | `state`, `log`, `receipt`, `failed`, `stopped` |
| `stream` | `stdout`, `stderr`, `system`; container output requires an attempt |
| `message`, `payload`, `truncated` | Sanitized text, object JSON, explicit omission marker |
| `created_at` | Durable ingestion time |

Append-only through retention. State/version changes automatically insert system events. Output insertion allocates and persists its sequence under the same task lock, then commits before SSE emits it. The 256KB combined stdout/stderr cap applies per attempt. It preserves whole UTF-8 characters, emits one visible truncation event, and never suppresses final state/receipt events. Sanitization is a backend responsibility before insertion; SQL cannot identify every secret in arbitrary text.

### 3.4 `receipts`

| Columns | Type / rule |
|---|---|
| `id`, `task_id`, `final_attempt_id` | UUID, unique successful task, exact passing attempt |
| `schema_version`, `source`, `status` | Fixed version 1, `live`, `passed` |
| `contract_sha256`, `snapshot_sha256` | Frozen contract and delivered tested source |
| `model_id`, `job_id`, `image_digest` | Actual provider/runtime identities from the final attempt |
| `checks`, `omitted_checks` | Exact mandatory results/counts and explicit out-of-contract limitations |
| `attempts`, `repair_count`, `duration_ms` | Actual reserved executions/repairs, derived elapsed milliseconds |
| `bundle_storage_key`, `diff_storage_key` | Immutable owner/task private deliverables |
| `reproduction`, `receipt_json` | Runtime/commands and versioned handoff |
| `created_at` | Receipt commit time |

Production receipt rows never hold simulated evidence. The demo JSON remains a separate illustrative artifact with `source: demo` and `live_verification: false`; it must not be inserted here. SQL validates consistency of stored evidence, not authenticity of provider responses or bundle bytes. FastAPI must verify the actual report transport, artifacts, hashes, and cancellation outcome first.

## 4. State and event contract

Both `draft` and `finalizing` are persisted in `tasks.status`. The UI maps the committed status; neither is manufactured client-side.

| From | Allowed next states |
|---|---|
| `draft` | `ready`, `needs_help`, `stopping` |
| `ready` | `draft`, `writing`, `needs_help`, `stopping` |
| `writing` | `waiting_runner`, `needs_help`, `runner_unavailable`, `stopping` |
| `waiting_runner` | `running`, `needs_help`, `runner_unavailable`, `stopping` |
| `running` | `fixing`, `finalizing`, `needs_help`, `runner_unavailable`, `stopping` |
| `fixing` | `waiting_runner`, `needs_help`, `runner_unavailable`, `stopping` |
| `finalizing` | `passed`, `needs_help`, `stopping` |
| `stopping` | `stopped`, only after execution/dispatch reconciliation |
| `passed`, `needs_help`, `runner_unavailable`, `stopped` | Terminal; no new work |

Self-updates may record evidence without re-emitting the same state. Proposal version changes emit a `state` event even if status stays the same. Terminal task content and frozen evidence are immutable; sequence/lease bookkeeping and deletion of an expired parent's FK are not changes to the result.

| Committed change | Durable event |
|---|---|
| Create draft / ordinary state or proposal version change | `state` |
| `running` → `finalizing` after the success gate | `state` with `status: finalizing` |
| Receipt insert atomically completes task | `receipt` with persisted receipt UUID and `status: passed` |
| `needs_help` / `runner_unavailable` | `failed` with stored reason |
| Cancellation requested | `state` with `status: stopping` |
| Actual stop confirmed | `stopped` |

If a running job remains unconfirmed, stay in `stopping`; do not mark `stopped` or release the attempt slot. Inference/adapter work must also be stopped or quiesced by the backend before a terminal transition; database rows alone do not terminate processes.

## 5. Backend transaction protocol

Use short **READ COMMITTED** transactions and a consistent lock order: task first, then its attempt. Never hold a database lock during inference, storage transfer, provider submission, cancellation, or streaming. All worker mutations check a live matching lease token under the task lock; the service-role API must implement this for writes beyond the provided RPCs. A lease is not a provider job and never resets a deadline.

### 5.1 Create and edit

Authorize the session user, then insert an unfrozen `draft`. Uniqueness on `(user_id,idempotency_key)` handles retrying creation. On conflict, read the existing owned task and compare the request fingerprint; return 409 for reused keys with different content. No inference or job starts on creation.

Editing uses `SELECT ... FOR UPDATE`, ownership, and an expected `contract_version`. Reject frozen/terminal tasks. Validate the full proposal and paths, increment its version exactly once, and persist `ready` only if valid; otherwise `draft`. A stale version is 409. Do not allow the client to set counters, provider IDs, hashes, or status directly.

### 5.2 Explicit Start and contract freeze

Under the task lock, compare ownership and expected contract version, confirm `ready`, check budgets and release evidence, compute canonical contract/protected-manifest hashes, and update to `writing` with a freeze time and 600-second deadline. Repeated Start for the same already-frozen version returns its existing task; a different version conflicts. The trigger serializes Start by owner with an advisory lock and refuses a third active task.

Contract minimum shape: version, runtime pin, editable-path allowlist, protected manifest, approved argv commands with unique IDs, `required_command_ids`, nonempty unique string `required_check_ids`, expected behavior, and the fixed limits. Backend JSON schemas validate ID sets, command definitions, file limits, path traversal, protected paths and types before freeze.

Define hashing consistently across services: canonical UTF-8 JSON, recursively sorted object keys, compact separators, preserved array order, no implicit Unicode normalization, no ASCII escaping, no floats or duplicate object keys. Permit only objects, arrays, strings, integers, booleans and null. Hash the canonical bytes; do not hash PostgreSQL's display formatting of JSONB. Integration must include shared hash test vectors before accepting arbitrary contracts.

### 5.3 Worker lease, generation, repair and dispatch

`mend_claim_worker(task,owner,seconds)` atomically claims or renews a 1–60-second lease; default 30 seconds. A second unexpired owner is rejected. On takeover, reconcile all persisted submissions and deadlines before doing anything new. A separate deadline worker must continue cancellation even if the orchestration lease/process dies.

Before an initial generation, authorize its inference budget. Before each repair generation, call and commit `mend_reserve_repair(task,lease)`. It validates the failed evidence, active lease, cancellation, task deadline, three-repair cap and repeated failure rule. Rejected patches and failed generations consume their reserved slot. Retries reuse request idempotency and consume the existing global retry/token/cost budgets.

After validating an accepted patch and storing its immutable snapshot, insert `task_attempts` with the next ordinal, snapshot/file counts, actual model ID and unique `submission_key`. The trigger increments `execution_count` in that same transaction. A competing reservation rolls back rather than incrementing the count twice.

Before contacting Nebius, commit `dispatch_requested_at` and `deadline_at = dispatch + 60 seconds`. Do not dispatch when that deadline cannot fit inside the remaining task deadline. Move to `waiting_runner`, submit with restart policy `never`, and persist the actual job ID and provider evidence. On ambiguous submission, reconcile the same key; do not allocate a replacement attempt. Move to `running` only from confirmed evidence. If a job completes while queue/start notifications were missed, the backend still commits the lifecycle consistently before evaluating finalization.

### 5.4 Streaming

Use `mend_append_output(task,attempt,stream,sanitized_message)` for stdout/stderr. Read committed rows after the cursor, ordered by `sequence`. Emit:

```text
id: <sequence>
event: <event_type>
data: <JSON message/payload>

```

Replay on `Last-Event-ID` or an authorized initial `after` cursor. Authenticate EventSource with same-origin secure cookies; do not put tokens in query strings. A disconnect does not cancel work. Send heartbeat comments, apply bounded backpressure, and use a verified Nebius CLI-follow adapter or trusted log transport; this schema does not invent a provider REST log stream.

### 5.5 Cancellation and deadlines

Call and commit `mend_request_cancel(task,reason)` after ownership authorization. The default reason is `user_cancelled`; deadline/maintenance workers use the correct `job_timeout`, `task_timeout`, `termination_unconfirmed`, or `retention_expired` code. These internal codes are never client-controlled. It locks the same task used by receipt completion, records durable intent, and returns `stopping`. A committed `passed` task remains `passed`. The deadline worker then actively invokes Nebius cancellation/termination, records acknowledgement separately, reconciles the actual provider stop and resolves the attempt. Only after all outstanding work is confirmed stopped may the backend commit `stopped` with `completed_at` and a reason.

The **60-second field is a backend deadline, not a configurable Nebius timeout**. Nebius's native timeout floor does not enforce this limit. The Phase 1 spike must measure cancellation-to-actual-stop delay, including queued/provisioning jobs and failures. A call at 60 seconds followed by positive stop delay exceeds a strict 60-second bound. Sampling does not prove a guaranteed bound; keep Start blocked unless the strict requirement is demonstrated or explicitly amended. No attempt stopped/completed after its deadline can receive a passing receipt. A prior job overrun also blocks further repair/dispatch and later successful finalization for that task; a faster subsequent job cannot erase the violation.

### 5.6 Verified success and receipt finalization

The complete trusted runner report must identify the task's latest attempt, contract, snapshot, protected manifest and actual job. Mandatory commands must each appear exactly once with a passing result and zero exit code; mandatory checks must each appear exactly once, with at least one check, all passed, none failed or skipped. Provider completion and confirmed stop must be within the job deadline and the overall task budget. Cancellation prevents success.

Commit `running` → `finalizing` and its event as a separate transaction after evaluating that evidence. Verify/freeze the downloadable bundle and diff outside the DB transaction. The server must recompute the bundle's canonical source hash and compare it with the tested snapshot; the SQL `bundle_verified_sha256` assertion is not itself a byte verification.

Then insert the receipt. Its BEFORE trigger rechecks success, validates identities and artifact ownership, derives time and canonical handoff fields/history. Its AFTER trigger updates the task to `passed`; the task trigger inserts the receipt event. **Receipt, passed state and event commit together or all roll back.** Emit only after commit.

On a transient persistence failure, read by unique `task_id`: return the existing receipt if it committed, otherwise retry persistence while `finalizing` without a new generation or job. Use a stable receipt UUID for retries. Deadline exhaustion becomes `needs_help` / `receipt_unavailable`; show “Checks passed; receipt unavailable.” Never announce a delayed success after a terminal stop.

## 6. Storage and retention

The migration creates private bucket `mend-artifacts` without browser Storage policies. Server writes use `upsert: false` and owner/task/content-addressed paths. Reject traversal and overwrites in the API. Snapshot/report/bundle/diff bytes are private; never store public object URLs or long-lived signed links in receipts.

FastAPI checks ownership and expiry before generating a short-lived download URL. Its expiry cannot exceed task retention. Stored keys are not authorization. Verify downloads and their SHA before a successful receipt. Bucket privacy and server-only writes do not by themselves make bytes immutable; the API and write credentials must uphold the no-overwrite rule.

At creation, tasks expire after 24 hours. Owner read policies hide expired rows. A cleanup worker cancels/reconciles active work first, waits for terminal state and an expired lease, deletes files through the Storage API, verifies completion, then invokes privileged `mend_private.purge_expired_task`. That helper refuses early/unresolved cleanup and refuses deletion while task objects remain in Storage metadata. Task deletion cascades its attempts/logs/receipts and clears a younger task's parent FK. The private purge helper is not granted to the application service role; run it using a dedicated trusted maintenance path. SQL metadata deletion is not a substitute for physically deleting stored bytes.

## 7. Release gates and measured spike

`mend_private.release_gate.live_execution_enabled` starts **false**. The normal backend cannot update it. A privileged operator may enable it only after reviewed evidence and a monetary cap are set. This release switch records an operational decision; it does not manufacture provider evidence or replace the tests below.

| Gate | Required evidence | Current status |
|---|---|---|
| Migration and policies | Actual Supabase apply + rollback-only regression run; grants/RLS inspected | Not run |
| Concurrency | Two-session Start, lease, repair, dispatch, cancellation/receipt races | Not run |
| Model | Live Nano/Super IDs and measured generation latency/tokens/quality | Not run |
| Timeout | Real cancellation-to-stop observations and strict-bound assessment | Unverified; live execution blocked |
| Total budget | Measured inference, dispatch, queue/provisioning, execution, transfer, finalization and any stop overrun | Unverified |
| Isolation and logging | Non-root sandbox/no network/secrets/protected-file boundaries; real live log transport/replay/backpressure | Unverified |
| Artifacts and retention | Bundle hash round-trip, no overwrite, owner-only links, actual 24-hour cleanup | Not run |

Measure the initial generation plus up to three repair calls under the aggregate 30,000-token cap. Four job budgets total 240 seconds and already include their queue/provisioning time; do not count that time twice. Compare the whole critical path with 600 seconds. Record sample count, distributions, maximum observed delay and failures. Explicitly flag when the total does not fit, rather than asserting that the arithmetic proves feasibility.

## 8. Validation record and next handoff

The live demo passed 10 Node interaction/clock regression checks and four Python example checks. Its served HTML/JS/CSS matched the published tested build. These are demo checks, not evidence that this migration or a provider run succeeded. No post-change visual browser inspection was available in this environment.

For this schema package, the structural/package checker verifies file completeness, required tables/states/columns, restricted grants, helper search paths and bounded schema constants. It is not a PostgreSQL parser and cannot prove SQL syntax or runtime behavior. `tests/database.sql` is supplied but has not been executed: no PostgreSQL/Supabase test instance was available. Keep the migration unapplied to production until the database and concurrency release gates pass.

The database fixture suite uses obvious synthetic IDs/evidence inside one rolled-back transaction. It does not call Nebius, retain a live receipt, or enable production execution. Run with a migration-owner connection in an isolated development database, not a production project.

The next stage can consume these files after its exact workflow title is recovered. Its first implementation obligations include the authenticated FastAPI transaction boundary, lease fencing, canonical contract hashes, inference budget reservation, real provider/log adapters, deadline recovery and artifact verification. Those obligations are recorded here without claiming they are implemented.

## 9. Reference documentation

- Supabase database functions and safe function privileges: https://supabase.com/docs/guides/database/functions
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostgreSQL trigger reference: https://www.postgresql.org/docs/16/sql-createtrigger.html
- Nebius job management / native timeout constraints: https://docs.nebius.com/serverless/jobs/manage
- Nemotron family/account model discovery: https://nebius.com/services/token-factory/nemotron

Provider references carry forward TRD v1.2's corrections. This stage makes no new claim that provider feasibility was measured.
