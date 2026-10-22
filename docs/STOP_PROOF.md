# Stop-proof contract

Status: contract tightened 19 October 2026. The canonical backend has now been recovered from the user's ZIP. Shared validation now rejects missing/contradictory assertions, wrong job identities, invalid references and contradictory timestamps. Service resolution, persisted replay, historical attempts, receipt verification and every cancellation-completion path use these guards. Nine focused offline regression tests pass. The broader authority, timing and infrastructure requirements below remain release requirements; this partial enforcement does not establish a live trusted observer or a measured stop bound.

This document separates a request to stop from evidence that provider execution has stopped. It does not authorize a Nebius call. No fixture, JSON field, workload stdout, or successful cancellation request is sufficient to establish infrastructure stop.

## Existing bounds to preserve

The handoff specifies a 60-second per-job budget including queue/provisioning, at most three repairs/four executions, and a separate 600-second/30,000-token task policy. These are requirements, not measured results. The configured inference reservation cap is not a total compute/storage billing cap.

Public [Nebius job documentation](https://docs.nebius.com/serverless/jobs/manage), checked 19 October 2026, lists a native job timeout minimum of one hour. It describes cancellation as stopping the underlying VM while retaining mounted volumes. Those documented semantics are not a measured 60-second account-level guarantee. Actual adapter, job-state and infrastructure-observer mappings remain to be established after explicit authorization.

## Required separation of facts

| Fact | Meaning | Insufficient substitute |
| --- | --- | --- |
| Stop intent persisted | The owner requested Stop and durable state blocks new work | A UI click with no committed intent |
| Cancel request sent | The control plane attempted cancellation for a particular job | Closing an HTTP stream or aborting a local task |
| Cancel request acknowledged | A provider response accepted that request | HTTP success interpreted as completed teardown |
| Workload terminal observed | A trusted observer read the documented terminal job state | A program printing `stopped`, missing logs, or a stale cache |
| Infrastructure stop confirmed | An independent control-plane observation establishes that the bound workload can no longer execute | A task record marked cancelled, a container report, or unexplained 404 |
| Budget established | A conservative measured upper bound, including uncertainty, fits the job deadline | Subtracting unrelated wall-clock timestamps |

Do not introduce a single `stopped=true` flag that collapses these facts. Cancellation and natural completion can both produce stop evidence; retain which path occurred.

## Identity and authority

Bind every observation to task ID, attempt ID, execution ordinal, provider job ID, provider project, immutable runner image digest, source snapshot hash, and frozen acceptance-contract hash. Record the observer identity/version and the exact provider API/resource meaning it relied on. Do not make a mutable image tag an immutable identity.

Generate and persist a submission identity before job creation. A timed-out creation request is an ambiguous submission, not permission to submit another job. Reconcile by the adapter's documented correlation mechanism; stop late-discovered jobs for a cancelled task and keep the execution reservation consumed. Bind late responses to the original attempt and reject conflicting job identities.

The workload cannot author its own control-plane proof. Observer authority must be established independently of the user-editable workspace and model-generated files. Hashes protect bytes; they do not establish the observer's trustworthiness. A schema-valid record is not trusted solely because it declares a trusted origin.

Keep the trusted raw observation outside the editable workload. Preserve an immutable hash of its bytes and a redacted public derivative when necessary. Never publish authorization headers, tokens, environment dumps, or private account configuration as proof.

## Timing contract

Use named, separately persisted observations:

- `submission_started`: sampled immediately before the create request, before queue/provisioning.
- `stop_intent_committed`: durable owner cancellation, when present.
- `cancel_request_started` and `cancel_response_received`: control-plane request bounds, when present.
- `job_terminal_observed`: trusted observation of the correctly bound job.
- `infrastructure_stopped_observed`: independent evidence of infrastructure stop.
- `stop_evidence_committed`: the durable proof record is available to receipt finalization.

Preserve UTC timestamps for audit and monotonic elapsed measurements for bounds. Subtract monotonic samples only within the same clock epoch. After worker restart, do not reuse another process's monotonic origin; require an independently justified conservative upper bound with clock uncertainty. Missing trustworthy timing means the budget is unverified.

Report both `submission_to_stop_upper_bound_ms` and, when applicable, `stop_intent_to_stop_upper_bound_ms`. The first must be at most 60,000 milliseconds, inclusive, to establish the per-job stop bound. Publish actual overruns; do not clip measurements to the limit. Record observation latency and uncertainty, and include them in the upper bound. Retain evidence-commit latency separately; the task's end-to-end budget must still cover finalization and evidence persistence.

Cancellation must begin early enough to leave the measured stop/observation margin inside the job deadline. The margin cannot be invented before it is established. If the provider cannot support the required bound, mark the gate failed and revisit the execution approach; do not silently change the PRD to a runtime-only timeout.

## Lifecycle and concurrency requirements

1. Persist stop intent before acknowledging it to the owner or emitting a stopping event. Make duplicate Stop requests idempotent.
2. Prevent new generation, repair, and execution reservations after stop intent commits. Every retry rechecks task state and the current lease/fence.
3. Keep budget and execution counters durable. Reconciliation, worker restart, lease expiry, and retries do not reset the three-repair/four-execution limits.
4. Once cancellation is requested, remain in stopping/reconciliation until the correctly bound stop evidence exists. A request timeout or missing evidence cannot become a stopped claim.
5. An attempt whose stop is unconfirmed blocks overlapping replacement execution. A bounded polling deadline ends the poll, not the obligation to reconcile the resource. Persist pending cleanup and arrange explicit resumption without an unbounded request handler.
6. Resolve completion-versus-Stop with a fenced, atomic finalization rule. A success commit after durable stop intent must fail. If success committed first, a later Stop is a no-op for that finished task; never emit conflicting terminal outcomes.
7. Fence evidence writes and finalization by the current lease and attempt identity. A stale worker cannot finalize or attach another attempt's observation.
8. A passing verification report is insufficient for a successful live receipt without acceptable stop evidence. Stop proof is also insufficient without protected check completion and matching source/contract hashes.
9. Do not hide unresolved execution behind retention expiry, remove job identity before proof capture, or delete task/artifact records while cleanup remains unresolved. Preserve an authorized operational reconciliation path even when owner-facing expired reads are hidden.
10. Redact public evidence and keep artifact access owner-authorized. Fail-closed behavior must not require exposing private control-plane credentials.

Keep the application outcome, stop-confirmation status, and budget result distinct. The UI may truthfully show cancelled input, pending infrastructure confirmation, and an unverified bound at the same time. It must not show a success badge or a confirmed-stop duration for that state.

## Receipt acceptance predicate

A live receipt may claim a bounded completed attempt only when all relevant facts are established: exact identities; immutable source and frozen checks; trusted complete verification; independently trusted infrastructure-stop evidence; conservative timing within the required bound; durable reservations within limits; current fencing; and no conflicting committed Stop.

Missing or invalid proof rejects the claim. Evidence of actual stop after 60 seconds establishes an overrun, not compliance. Unsigned public evidence must remain labeled unsigned. A local example must remain labeled local regardless of whether its checks passed.

## Required release tests

| Case | Required assertion |
| --- | --- |
| Acknowledged cancel, VM still running | No confirmed-stop result, success receipt, or replacement job |
| Forged workload stdout/report | Cannot satisfy trusted observer authority |
| Wrong job/task/attempt/hash/image | Evidence rejected before finalization |
| Create request times out; job appears later | Reconcile the original submission; no duplicate/fifth execution |
| Stop before job ID arrives | Durable intent applies to the eventual job; no new work |
| Exactly 60,000 ms, then 60,001 ms | Inclusive boundary accepted; overrun rejected |
| Delayed observation or uncertain clocks | Conservative upper bound used; unsupported bound stays unverified |
| Worker restart or expired lease | No monotonic-origin reuse or stale-worker finalization |
| Concurrent success and Stop | One durable outcome under the declared commit-order rule |
| Duplicate cancellation requests | One idempotent intent; no budget/counter reset |
| Provider 404, lost response, stale cached terminal state | No inferred stop without documented, authenticated resolution |
| Polling deadline and retention expiry | Pending reconciliation survives; request processing stays bounded |
| Natural completion before cancellation | Correctly bound natural stop accepted; no fabricated cancel timing |
| Valid stop, incomplete/skipped protected checks | No passing receipt |

Run these offline against injected provider/observer adapters first. They test logic, not cloud behavior. A later explicitly authorized timing experiment must retain real request/job identities, raw trusted observations, failed measurements, and uncertainty. No such experiment has run as part of this publication.
