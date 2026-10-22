# Mend — Technical Requirements Document

**File:** `TRD.md`  
**Version:** 1.2 — audited baseline  
**Date:** 2026-10-11  
**Stage:** Technical baseline required before backend implementation  
**Inputs:** The corrected 12-page Mend PRD, the supplied Vibe Coding workflow video, and the subsequent Wonderful UI specification. See `PLAN_AUDIT.md` for corrections and unresolved integration gates.

## 1. Purpose and scope

Mend turns a bounded coding request into an executed, checked source bundle. It generates code, runs it in a Nebius Serverless Job, reads failures, applies targeted repairs, and delivers the exact passing snapshot with a receipt. A passing result means the declared checks passed; it does not certify universal correctness or production readiness.

The delivery workflow requires this TRD before backend construction. The existing frontend scaffold is an interface prototype; it does not establish that inference, sandbox enforcement, termination, or receipt persistence work.

MVP scope is a pinned Python runtime, approved dependencies, a fixed entry point, and protected pytest checks. Arbitrary repositories, dynamic package installation, additional runtimes, automatic deployment, and production repair are deferred.

This document carries forward the PRD’s model, execution, evidence, and release gates, including the safety concerns on pages 5 and 12. The later explicit requirements take precedence where they tighten or change the PRD: **a 60-second maximum job lifetime**, three repairs, hard shadows, 3D card depth, and spring motion.

## 2. Required stack and ownership

| Layer | Required technology | Responsibility |
|---|---|---|
| Web application | Next.js 14 App Router, React, TypeScript (requested legacy baseline) | Workbench, task submission, live evidence, artifact handoff |
| Styling | Tailwind CSS | Shared design tokens and responsive layouts |
| Motion and icons | Framer Motion; lucide-react | Entrance springs, card tilt, receipt animation, consistent icons |
| Backend | FastAPI, Python | Authentication, contracts, orchestration, provider adapters, cancellation, SSE |
| Durable orchestration | Backend worker and persisted database state | Job deadlines, repair limits, recovery after API restarts |
| Identity and data | Supabase Auth and PostgreSQL | User ownership, tasks, attempts, logs, receipts |
| Artifact storage | Private Supabase Storage buckets | Immutable snapshots, reports, diffs, source bundles |
| Inference | Nebius Token Factory; NVIDIA Nemotron 3 | Structured code generation and repair patches |
| Execution | Nebius Serverless Jobs, pinned container image | Isolated, run-to-completion validation of each snapshot |
| Live transport | SSE through browser `EventSource` | Ordered state changes and stdout/stderr updates |

Provider credentials, Supabase service-role credentials, and orchestration authority remain server-side. Browser code must never call provider administration APIs directly.

**Framework support:** The official [Next.js support policy](https://nextjs.org/support-policy) lists 14.x as unsupported. Preserve the requested version for the existing prototype; production release requires an explicitly documented move to a supported version and compatibility checks. This audit does not silently upgrade the application.

**Provider feasibility gates:** Confirm which Nemotron 3 variant (Nano 30B vs. Super 120B) fits the latency/quality tradeoff inside the 60-second job budget, and confirm its exact API id with a live call. The October 2026 [Token Factory lineup](https://nebius.com/services/token-factory/nemotron) lists Nano 30B, Nano Omni, Super 120B, and Ultra 550B; the published Super API id is `nvidia/nemotron-3-super-120b-a12b`. Do not silently substitute another model or treat a reward/base model as the requested generator. Verify Nebius job submission, status, logs, backend-initiated cancellation and measured stop latency, resource restrictions, and result transfer before accepting live tasks. These are requirements to verify, not claims that every capability is already available.

## 3. Wonderful design system

### 3.1 Tokens

| Token | Value | Use |
|---|---|---|
| Paper | `#F5F2EA` | Main canvas |
| Surface | `#FFFFFF` | Task cards, panels, receipt paper |
| Ink | `#18201B` | Text, strong borders, hard shadows |
| Accent | `#FF5B23` | Primary action surfaces and selected details |
| Forest | `#183E32` | Successful check indicators |
| Error | `#B42318` | Failure text and alerts |
| Muted text | `#5B615B` | Supporting copy |
| Control border | `#717971` | Input and control boundaries |
| Divider | `#D8DDD5` | Decorative separators |
| Panel shadow | `8px 8px 0px #18201B` | Main workbench surfaces |
| Control shadow | `4px 4px 0px #18201B` | Raised primary buttons |
| Panel radius | `20px` | Task card and primary panels |
| Control radius | `12px` | Inputs and buttons |
| Border | `2px solid #18201B` | Raised surfaces and primary controls |
| Spacing | `4px` base; `8 / 16 / 24 / 32px` steps | Consistent layout rhythm |

Apply a static noise texture over the paper canvas at **5% opacity**. It must ignore pointer events and never reduce text legibility. Shadows have zero blur; reserve their strongest treatment for primary surfaces so the workbench remains readable.

Use Inter or a system sans-serif for interface text, and IBM Plex Mono or a system monospace for code and logs. Body text is 16px, labels 14px, titles 28–32px, and code 14px with approximately 22px line height.

The visual character is a tactile coworker’s desk: warm paper, crisp white, ink, and purposeful orange. Avoid neon glows, glass panels, robot imagery, and generic purple/blue AI styling.

### 3.2 Depth and motion rules

- The main Task Card uses a parent perspective of **1200px** and `transform-style: preserve-3d`.
- Fine-pointer hover maps the pointer position to a maximum **±3°** rotation on each axis. The card returns to zero on pointer exit. Small decorative layers may translate up to 8px on the Z axis.
- Disable tilt on touch/coarse-pointer devices and when reduced motion is requested. Focus and form interaction must remain stable; tilt must not change layout or obscure controls.
- All major interface elements enter through Framer Motion with `type: "spring"`, `stiffness: 100`, and `damping: 10`. Use a short stagger, opacity, and at most 16px of translation. Do not animate each incoming log line or repeatedly replay entrances during state updates.
- The Success Receipt is revealed from a top printer slot using an overflow-clipped wrapper. Paper moves downward from behind the slot with the shared spring. Keep slot and paper as separate layers; maintain access to the receipt content.
- Print the receipt only after a valid success receipt has been committed to Supabase. Failed and cancelled tasks must never trigger a success animation.
- With reduced motion, remove tilt and sliding transitions, use immediate visibility or a brief opacity change, and preserve all information.

### 3.3 Interaction and accessibility

Use ink text on orange buttons; orange is not a small-text color on white. Meet WCAG AA contrast, provide visible keyboard focus, and use labels/icons alongside status colors. Controls have at least 44px touch targets.

Desktop presents task context, code/diff, and attempt evidence. Narrow screens use Files / Changes / Checks tabs. Status, elapsed time, attempt count, and Stop remain accessible. Logs follow new output only while the user is near the bottom; otherwise offer a “Jump to latest” action. Announce status changes politely without reading every log line aloud.

## 4. Execution contract and state machine

1. **Prepare, review, and freeze:** Create an owned draft without dispatching inference or a job. Prepare a versioned proposed contract from approved starter checks or bounded check preparation; show runtime, editable paths, expected behavior, commands, and budgets. Contract preparation has its own bounded request and counts toward aggregate inference usage. Mark a valid proposal `ready`. Only an explicit Start request with the expected contract version freezes its hashes and begins the 10-minute execution budget.
2. **Generate:** Request a structured patch from the configured model. Reject absolute paths, traversal, protected-file changes, binaries, oversized output, and non-applying patches.
3. **Snapshot:** Store the accepted source snapshot and SHA-256 hash. Use approved commands from the contract, never arbitrary model-generated shell commands.
4. **Execute:** Reserve an attempt transactionally, submit one Nebius job, persist its identifier and deadline, and stream sanitized stdout/stderr and state events.
5. **Evaluate:** Collect exit codes and a complete structured runner report. Assertion failures count even when stderr is empty or the program exits successfully.
6. **Repair:** If code checks fail and budgets permit, send bounded diagnostics, current code, and prior failure signatures to the model. Re-run the full mandatory suite in a fresh job after an accepted patch.
7. **Finalize, deliver, or stop:** On verified success, enter `finalizing`, freeze the tested bundle, and commit its receipt within the remaining task budget. Persistence retries do not rerun code. Otherwise retain the latest snapshot, failure evidence, and explicit stop reason.

Backend states are `draft`, `ready`, `writing`, `waiting_runner`, `running`, `fixing`, `finalizing`, `passed`, `needs_help`, `runner_unavailable`, `stopping`, and `stopped`. `passed`, `needs_help`, `runner_unavailable`, and `stopped` are terminal. Editing a completed contract creates a new task linked to its parent.

Persist state changes before emitting them. A task has one orchestration owner and at most one active job. Use database transactions and a worker lease to prevent duplicate dispatch. After restart, reconcile persisted job identifiers and deadlines before any further submission.

`draft` and `finalizing` are persisted backend lifecycle states, not client-only or derived labels. The `tasks.status` check constraint in Section 6.1 includes both. Backend transitions and durable events are:

| Trigger | Persisted transition | Event emitted after commit |
|---|---|---|
| Owned draft creation | New row → `draft` | `state` with `status: draft` |
| Valid proposal or edit invalidating readiness | `draft` → `ready`; `ready` → `draft` when invalidated | `state` with the committed status and contract version |
| Explicit Start of a valid reviewed contract | `ready` → `writing` | `state` with `status: writing` and frozen contract version |
| Passing execution satisfies the success gate | `running` → `finalizing` | `state` with `status: finalizing` and verified attempt/snapshot identity |
| Receipt, completed task, and receipt event committed atomically | `finalizing` → `passed` | `receipt` with receipt ID and `status: passed` |
| Receipt persistence exceeds the remaining task budget | `finalizing` → `needs_help` | `failed` with `status: needs_help` and reason `receipt_unavailable` |
| Cancellation wins before receipt completion | `finalizing` → `stopping` → `stopped` after termination confirmation | `state` with `status: stopping`, then `stopped` with `status: stopped` |

Transient receipt writes leave the task in `finalizing` and retry within the existing deadline; reconnect restores the persisted state. No client event can manufacture either state.

### Success gate

Success requires all of the following:

- A complete runner report for the expected attempt, contract, and snapshot.
- Successful completion of every required command and assertion.
- At least one required test, with zero failed or skipped mandatory checks.
- Unchanged hashes for protected tests and configuration.
- A provider-confirmed completion within the job deadline, with no effective cancellation.
- A downloadable immutable source bundle whose hash matches the tested snapshot.

Neither an exit code of zero nor the model saying “fixed” is sufficient.

## 5. Mandatory safety rules

### 5.1 Hard 60-second deadline

**Every Nebius job must terminate within 60 seconds of submission acceptance. This remains a product requirement, not a verified provider capability.** Provisioning, queueing, code execution, and in-job artifact transfer share this budget; retries never extend a job’s deadline.

Before dispatch, persist `dispatch_requested_at` and a conservative `deadline_at = dispatch_requested_at + 60 seconds`; retain the provider acceptance timestamp as `submitted_at` when available. Do not start the clock after a delayed acknowledgement. A provider idempotency/reconciliation mechanism must be verified; a locally generated key alone does not guarantee provider deduplication. Do not resubmit an uncertain creation request until the original outcome is reconciled.

**Confirmed compatibility gap:** Nebius [job management documentation](https://docs.nebius.com/serverless/jobs/manage) specifies a native timeout minimum of `3600s` via REST and `1h` via CLI. No configurable provider timeout stops a job at 60 seconds. A native timeout is not the enforcement mechanism for Mend’s deadline.

Enforcement uses **only an independent backend deadline worker actively calling the documented cancellation API at the persisted 60-second mark** for an unfinished job: `POST https://api.nebius.cloud/ai/v1/jobs/cancel` with `{"id": "<job_ID>"}`. Persist the cancellation intent, block new work for the attempt, request cancellation, verify that the provider has actually stopped the job, and record the request and confirmed-stop times. Reconcile delayed or uncertain submission acknowledgements; if a job identifier is obtained after its deadline, cancel immediately without resetting the clock. Browser timers, closed SSE connections, cancelled HTTP requests, coroutine timeouts, and process watchdogs do not enforce remote job termination.

**Phase 1 spike requirement:** Measure deadline-worker scheduling delay, cancellation-request/API latency, and time from the cancellation call to actual confirmed termination of a running job; include queued/provisioning cases. Record per-run observations, sample count, percentiles, maximum observed delay, and failures or unconfirmed stops. The measured cancellation-to-stop latency, not the configured native timeout or API acknowledgement, determines whether the 60-second bound is achievable. Sampling does not establish a guaranteed upper bound. Calling cancellation at 60 seconds with any positive subsequent stop delay can exceed the strict total-job limit; flag that incompatibility explicitly and keep live execution blocked unless the bound is demonstrated or the specification is explicitly amended.

A job that exceeds the deadline cannot produce a passing receipt. Escalate unresolved termination and block further dispatch for that task. Do not describe a cancellation request or best-effort cleanup as a proven hard timeout.

### 5.2 Repair and resource limits

| Limit | Enforcement |
|---|---|
| Repair attempts | **Maximum 3**, enforced by backend transactions |
| Code executions | Initial execution plus three repaired executions: **maximum 4 jobs per task** |
| Overall task time | 10 minutes from contract freeze, including inference, queueing, and receipt finalization |
| Inference usage | Maximum 30,000 aggregate input/output tokens and a configured monetary cap |
| Source | Maximum 20 files and 200KB total source |
| Logs | Maximum 256KB of stdout/stderr per attempt; show explicit truncation markers |
| Concurrency | One active job per task; two active tasks per user |
| Repeated failure | Stop after two consecutive identical failure signatures without new evidence |

Reserve repair and execution slots atomically before issuing work. Rejected or failed repair generations still consume the reserved repair slot; they do not allow unlimited model calls. Transient API requests may be retried at most twice across a task using idempotency and the existing budgets. They must not create extra jobs, reset deadlines, or disguise infrastructure failures as code repairs.

Cancellation first records durable intent under the same task lock used for completion, blocks new inference and execution, requests termination, and confirms it. Return `stopping` until termination is confirmed; only then mark `stopped`. Cancellation committed before success prevents a late success transition. A task already committed as `passed` is immutable and cannot be retroactively cancelled. Do not classify rejected code patches as provider outages.

Explicitly configure provider restart policy `never`. Automatic container restarts must not bypass the four-execution cap or deadlines. Request retries are not additional model calls or extra code executions.

**Phase 1 budget validation:** The 10-minute total is a proposed cap, not a verified fit. Measure end-to-end inference latency for each generation call with Nano 30B and Super 120B, recording actual input/output tokens, and measure submission acknowledgement, provisioning/queueing, execution, result transfer, cancellation-to-stop, and receipt finalization. Evaluate the initial generation plus up to three repair calls under the aggregate 30,000-token cap. Four 60-second job budgets total 240 seconds and already include provisioning/queueing; do not count that time twice. Compare the complete measured critical path against 600 seconds, including inference, orchestration, persistence, and any stop overrun. Report measurements and explicitly flag when the 10-minute total does not fit; do not infer feasibility from token limits or `4 × 60` arithmetic. Inference runs outside the per-job stopwatch but inside the overall execution budget; bounded contract preparation also counts toward aggregate token usage.

### 5.3 Sandbox and data boundaries

Execute as a non-root user with a read-only base image, disposable workspace, resource/process limits, and no privileged mode or host mounts. Block code network access, cloud metadata access, ambient credentials, and provider secrets. Keep protected checks outside editable paths and unwritable by generated code.

A trusted supervisor handles narrowly scoped, expiring artifact transfers outside the generated program’s authority. Treat source and logs as untrusted data, including instructions embedded in stderr. Redact recognizable secrets before model submission and UI delivery.

Prove isolation on the selected Nebius execution configuration before accepting arbitrary code. If isolation remains unverified, restrict the demo to trusted curated tasks; this does not waive timeout or repair limits.

Expire task source, logs, reports, and receipts after 24 hours unless an explicit retention policy is introduced. Avoid raw source and prompts in analytics. Clean up active work safely before deletion.

## 6. Database schema

Use PostgreSQL tables `tasks`, `logs`, and `receipts` for the required entities **Tasks**, **Logs**, and **Receipts**. A supporting `task_attempts` table stores execution evidence and deadlines. All timestamps are UTC `timestamptz`; hashes are lowercase 64-character SHA-256 hex strings. Required columns are non-null unless stated otherwise.

### 6.1 Tasks — `tasks`

| Column | Type / default | Definition |
|---|---|---|
| `id` | `uuid`, generated, PK | Durable task identity |
| `user_id` | `uuid`, FK `auth.users.id` | Task owner |
| `parent_task_id` | `uuid`, nullable FK `tasks.id` | Previous task when a contract is revised |
| `prompt` | `text` | User request |
| `runtime` | `text`, `python` | Pinned MVP runtime identifier |
| `status` | `text`, `draft` | Persisted backend state; includes `draft` and `finalizing`; constrained below and in Section 4 |
| `contract` | `jsonb`, `{}` | Proposed contract in draft/ready; immutable once started |
| `contract_version` | `integer`, `1` | Optimistic concurrency version for review and Start |
| `contract_frozen_at` | `timestamptz`, nullable | Start commit time; begins execution budget |
| `contract_sha256` | `text`, nullable before Start | Hash of canonical frozen contract |
| `protected_checks_sha256` | `text`, nullable before Start | Hash of protected checks/configuration manifest |
| `max_repairs` | `smallint`, `3` | Must equal 3 for MVP |
| `job_timeout_seconds` | `smallint`, `60` | Must equal 60 |
| `repair_count` | `smallint`, `0` | Reserved repair slots; constrained to 0–3 |
| `execution_count` | `smallint`, `0` | Reserved execution slots; constrained to 0–4 |
| `usage` | `jsonb`, `{}` | Aggregate tokens, estimated cost, retry count |
| `stop_reason` | `text`, nullable | Stable reason code and user-facing detail |
| `cancel_requested_at` | `timestamptz`, nullable | Durable cancellation intent |
| `task_deadline_at` | `timestamptz`, nullable before Start | Contract freeze plus 10 minutes |
| `created_at` / `updated_at` | `timestamptz`, `now()` | Creation and latest state update |
| `completed_at` | `timestamptz`, nullable | Terminal completion time |
| `expires_at` | `timestamptz` | Retention deadline |
| `idempotency_key` | `text` | Unique with `user_id`; prevents duplicate creation |

The required `tasks.status` constraint is explicit; `draft` and `finalizing` are stored values:

```sql
CHECK (status IN (
  'draft', 'ready', 'writing', 'waiting_runner', 'running', 'fixing',
  'finalizing', 'passed', 'needs_help', 'runner_unavailable', 'stopping', 'stopped'
))
```

### 6.2 Supporting execution records — `task_attempts`

| Column | Type / default | Definition |
|---|---|---|
| `id` | `uuid`, generated, PK | Attempt identity |
| `task_id` | `uuid`, FK `tasks.id` | Owning task |
| `ordinal` | `smallint` | 1–4; unique with `task_id` |
| `status` | `text` | Reserved, submitted, running, passed, failed, timed_out, cancelled, or infrastructure_failed |
| `submission_key` | `text`, unique | Provider dispatch idempotency/reconciliation key |
| `job_id` | `text`, nullable, unique | Real Nebius job identifier |
| `model_id` / `model_request_id` | `text` / nullable `text` | Actual configured model and request evidence |
| `snapshot_sha256` | `text` | Frozen source hash |
| `snapshot_storage_key` | `text` | Private immutable snapshot location |
| `image_digest` | `text` | Pinned runner image digest |
| `dispatch_requested_at` / `deadline_at` | `timestamptz`, nullable before dispatch | Persisted together before provider submission |
| `submitted_at` | `timestamptz`, nullable | Provider-confirmed acceptance time when available |
| `started_at` / `finished_at` | `timestamptz`, nullable | Provider-confirmed timing |
| `exit_code` | `integer`, nullable | Execution outcome |
| `failure_signature` | `text`, nullable | Normalized failure fingerprint |
| `runner_report` | `jsonb`, nullable | Versioned command results, test IDs/counts, completeness, hashes |
| `report_storage_key` | `text`, nullable | Full private report location |
| `created_at` | `timestamptz`, `now()` | Record creation |

### 6.3 Logs — `logs`

| Column | Type / default | Definition |
|---|---|---|
| `id` | `bigint`, identity, PK | Internal record identity |
| `task_id` | `uuid`, FK `tasks.id` | Owning task |
| `attempt_id` | `uuid`, nullable FK `task_attempts.id` | Null for task-wide events |
| `sequence` | `bigint` | Monotonic per-task sequence; unique with `task_id` |
| `event_type` | `text` | `state`, `log`, `receipt`, `failed`, or `stopped` |
| `stream` | `text` | `stdout`, `stderr`, or `system` |
| `message` | `text`, empty string | Sanitized text; never rendered as HTML |
| `payload` | `jsonb`, `{}` | Typed event data; receipt events reference persisted receipts |
| `truncated` | `boolean`, `false` | Indicates omitted execution output |
| `created_at` | `timestamptz`, `now()` | Ingestion time |

Logs are append-only during retention. Sequence allocation and event insertion occur under the same per-task transaction lock so replay ordering is reliable. The output cap does not suppress essential terminal state events.

### 6.4 Receipts — `receipts`

| Column | Type / default | Definition |
|---|---|---|
| `id` | `uuid`, generated, PK | Receipt identity |
| `task_id` | `uuid`, unique FK `tasks.id` | One successful receipt per immutable task |
| `final_attempt_id` | `uuid`, FK `task_attempts.id` | Passing attempt |
| `schema_version` | `integer`, `1` | Receipt format version |
| `source` | `text`, `live` | Production receipts require real provider evidence |
| `status` | `text`, `passed` | Successful verified completion only |
| `contract_sha256` / `snapshot_sha256` | `text` | Exact contract and delivered source hashes |
| `model_id` / `job_id` / `image_digest` | `text` | Actual inference, execution, and environment identities |
| `checks` | `jsonb` | Required check IDs and passed/failed/skipped/total counts |
| `omitted_checks` | `jsonb`, `[]` | Explicit limitations and checks outside the contract |
| `attempts` | `smallint` | Number of executions, 1–4 |
| `repair_count` | `smallint` | Repairs consumed, 0–3 |
| `duration_ms` | `bigint` | Overall task duration, nonnegative |
| `bundle_storage_key` / `diff_storage_key` | `text` | Immutable private deliverables |
| `reproduction` | `jsonb` | Runtime, dependencies, entry point, commands |
| `receipt_json` | `jsonb` | Complete versioned handoff, including attempt history and caveats |
| `created_at` | `timestamptz`, `now()` | Receipt commit time |

Validate JSON structures with backend schemas before writes. Check constraints enforce counters, statuses, hash formats, and receipt totals. Conditional constraints require contract hashes, freeze timestamp, and overall deadline once execution starts; draft/ready rows may lack them. Composite foreign keys must ensure logs and final attempts belong to the referenced task.

Index `tasks(user_id, created_at)`, `tasks(status, task_deadline_at)`, `task_attempts(status, deadline_at)`, and `logs(task_id, sequence)`. Enforce one active attempt per task with a partial unique index. Worker claims and transitions use transactional row locks.

Enable RLS on every table. Users may read only their own tasks and related records; backend APIs perform all writes. Service-role access remains server-side. Storage buckets are private, with owner-authorized short-lived download links. Receipts and snapshots are immutable except for controlled retention deletion.

## 7. API, SSE, and receipt protocol

| Endpoint | Contract |
|---|---|
| `POST /api/tasks` | Create an owned draft without starting work; accept prompt/runtime and fixed limits; require `Idempotency-Key` |
| `PATCH /api/tasks/{task_id}/contract` | Validate/edit or prepare an unfrozen proposal; require expected version; return proposal, checks, and readiness |
| `POST /api/tasks/{task_id}/start` | Require expected contract version and idempotency; atomically freeze valid contract, check feasibility/budgets, and dispatch once |
| `GET /api/tasks/{task_id}` | Return current state, limits, attempts, and latest event sequence |
| `GET /api/tasks/{task_id}/events` | Authenticated SSE stream with durable event IDs and reconnect replay |
| `POST /api/tasks/{task_id}/cancel` | Record cancellation; return `stopping` or confirmed `stopped` |
| `GET /api/tasks/{task_id}/receipt` | Return the persisted receipt after verified success |
| `GET /api/tasks/{task_id}/artifacts` | Authorize access and return expiring artifact links |

For each SSE event, use `id: <sequence>`, `event: <event_type>`, and JSON `data`. Forward stdout and stderr incrementally from the trusted runner/provider log source; do not simulate logs or wait for the job to finish. Nebius documents real-time CLI following through `nebius ai job logs <job_ID> --follow`; its guide limits log access to the console and CLI, so do not invent a REST log stream. Verify a server-side CLI adapter or trusted log transport and its permissions, replay, and backpressure before live integration.

Persist events before emission. Reconnect using `Last-Event-ID`; support an authorized `after` cursor for a fresh connection. Send periodic heartbeat comments, disable intermediary buffering, and deduplicate by sequence in the UI. Closing the stream does not cancel a job.

Native `EventSource` cannot set arbitrary authorization headers. Use secure cookie authentication, preferably behind a same-origin proxy; verify Supabase identity server-side. For cross-origin connections, use `withCredentials`, explicit allowed origins, credentialed CORS, and CSRF protection for mutations. Never put access tokens in query strings.

On verified execution success, first persist `finalizing` and its `state` event. Commit the receipt, `passed` task state, and receipt event atomically; only then emit `receipt`. If persistence fails, retain verified execution evidence in persisted `finalizing` and retry persistence idempotently without rerunning code or announcing success prematurely. When the overall budget expires, persist `needs_help` and a `failed` event with reason `receipt_unavailable`; report “Checks passed; receipt unavailable.” Do not emit a delayed success after a terminal stop.

The public receipt JSON exposes `receipt_id`, `task_id`, `source`, `status`, `model`, `job_id`, `snapshot_sha256`, `checks`, `attempts`, `duration_ms`, and `created_at`, plus contract, reproduction, artifact, and limitation details. Demo fixtures must be visibly labeled and must never enter the production success path.

## 8. Verification and backend build gate

| Scenario | Required outcome |
|---|---|
| Endless loop, hung process, or queued job | Backend deadline worker calls cancellation at 60 seconds; confirmed-stop latency is measured; any deadline overrun blocks release and a passing receipt |
| Four failing executions | Initial run plus at most three repairs; no fifth job or fourth repair |
| Concurrent requests or worker restart | No duplicate job; persisted deadline and budgets remain effective |
| Runtime exception or incorrect output with exit zero | Failure recognized; bounded repair and full recheck |
| Missing report, skipped required test, zero tests, or altered checks | Success blocked |
| Cancellation racing with completion | First committed terminal decision wins under a task lock; cancellation committed first blocks late success |
| SSE disconnect and reconnect | Ordered replay without starting a second task |
| Supabase write failure after passing execution | No premature success event; receipt persistence retries safely |
| Artifact hash mismatch or another user’s ID | Download/completion blocked; ownership enforced |
| Keyboard, touch, or reduced-motion use | Full access without dependence on tilt, animation, or color |

Implementation order: Phase 1 model/latency/cancellation feasibility spike → schema and RLS → authenticated task APIs and durable orchestrator → verified inference/execution adapters → deadline and repair enforcement → SSE and receipt persistence → frontend integration → end-to-end verification.

Release requires Phase 1 measurements of Nemotron 3 generation latency, provisioning/queueing, and cancellation-to-confirmed-stop latency; explicit assessment of the strict 60-second bound and 10-minute total; framework support decision; real NVIDIA-model inference and Nebius execution evidence; proven deadline/isolation enforcement; protected-check integrity; reproducible downloaded artifacts; and the PRD’s P0 scenarios passing. A cancel call at 60 seconds is not evidence of termination by 60 seconds. Performance and recovery metrics remain measured targets until an evaluation run establishes actual results. No backend implementation is implied by this document.
