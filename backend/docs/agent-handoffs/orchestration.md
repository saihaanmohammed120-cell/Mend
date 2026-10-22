# Orchestration handoff

## Part 1 — Context isolation and dependency mapping

Inherited requirements: docs/BLUEPRINT.md, TRD v1.2, and migration 001. Owned implementation files: mend/service.py, mend/local_store.py, mend/fakes.py; owned regression suite: tests/test_service.py. Inputs are frozen curated contracts, canonical hashes, model replacements, trusted provider observations, repository actions, and private immutable artifacts. Outputs are persisted task/attempt transitions, replayable events, cancellation intent, and receipts whose source matches their adapters. No generated source is executed on the host.

Dependencies: domain.py canonical_json/curated_contract/initial_files/protected_checks_sha256/source_sha256/public_payload; patches.py validate_replacements; artifacts.py deterministic_zip/verify_bundle and injected ArtifactStore; repository.call; model.generate/reservation; runner.submit/reconcile/observe/cancel/stream_logs. TaskService implements the blueprint's public async APIs plus run_task and deadline_tick. Authentication, paid-provider credentials, trusted supervisor production, and worker hosting belong to adjacent scopes.

## Part 2 — Modular synthesis

Task ownership precedes public reads, downloads and event replay. Start freezes canonical hashes. All worker writes include an unexpired lease identity. Inference budgets are conservatively reserved before each call, never refunded; provider-reported actual token/cost totals are tracked separately, including completed malformed responses. A configured monetary cap is mandatory in live mode. Calls use bounded output and total-deadline timeouts; no automatic provider retries are hidden in this service.

An execution slot is reserved before dispatch, then the dispatch deadline is persisted before the provider call. Repairs consume a slot before generation, including invalid patches. Recovery observes an existing job or performs read-only submission-key reconciliation; empty provider listings cannot prove absence. A reserved attempt with no dispatch intent can safely be resolved as never_dispatched. No repair begins while any prior execution remains unresolved.

deadline_tick is independent of the normal worker lease: deadline_cancel first locks/rechecks due evidence and durably records stopping, then runner.cancel is called before lease acquisition. A lease is needed only for subsequent reconciliation writes. Cancellation acknowledgement alone cannot resolve a job. Unknown stop observations leave the task in stopping and the execution unresolved.

Success requires exact protected check and command identity sets, individual passing results, complete trusted report identities, provider finish/stop timestamps within the deadline, no cancellation, and immutable downloaded bundle bytes matching the tested source manifest. Finalizing is committed separately; receipt and passed outcome finalize atomically through the repository. Final artifacts support safe retry only when existing immutable bytes match.

LocalTestStore uses SQLite BEGIN IMMEDIATE and transaction rollback, ownership checks, unique sequence allocation, usage and attempt bounds, leases, and explicit source=local_test. Fixture adapters simulate known failure/patch/pass outcomes without host execution. A local receipt cannot claim live_verification or enter production receipts.

## Part 3 — Review and real available test output

Review corrections: fixed local active-task count treating None as an integer; caught duplicate fixing transition against the production repair RPC; separated conservative reserved usage from actual provider accounting; made deadline cancellation independent of an occupied worker lease; prevented stale-worker compensating writes; restored previously submitted jobs without duplicate CREATE; made final artifact retry compare bytes instead of overwriting. Failure signatures and diagnostic hashes exclude changing task/job/model identities and timestamps; both must match before declaring no new evidence. Additional actual provider usage above its reservation is persisted as finite measured values in the terminal stop_reason reconciliation record before dispatch; reserved counters remain unchanged pending explicit operator reconciliation. Pricing evidence uses ordinary finite JSON rather than integer-only canonical identity serialization.

Actual command: `python3 -m unittest discover -s tests -p test_service.py -v`

```text
test_actual_usage_overrun_is_persisted_for_reconciliation ... ok
test_bad_report_cannot_print_receipt ... ok
test_cancel_before_dispatch_never_runs_job ... ok
test_deadline_worker_cancels_and_requires_observed_stop ... ok
test_failure_repair_receipt_is_explicit_local_test ... ok
test_frozen_contract_stale_version_and_cross_owner_rejected ... ok
test_independent_deadline_cancels_while_worker_lease_is_active ... ok
test_invalid_patches_consume_three_repairs_not_executions ... ok
test_lease_fences_worker_output ... ok
test_live_gate_blocks_test_adapters ... ok
test_new_diagnostic_evidence_allows_another_repair ... ok
test_repeated_identical_check_failure_stops ... ok
test_store_shutdown_is_idempotent_and_rejects_late_thread_reads ... ok
test_worker_recovery_observes_existing_job_without_duplicate_submit ... ok

Ran 14 tests in 0.393s
OK
```

This output tests real local Python orchestration using explicit fixture dependencies. It does not verify Token Factory account availability, provider cancellation latency, Docker isolation, Supabase RPC execution, live supervisor authenticity, or a strict 60-second provider stop guarantee.

## Part 4 — Pipeline convergence and unresolved gates

Repository delta: deadline_cancel must accept task_id/attempt_id, independently recheck that an unresolved attempt is due under a task lock, persist cancellation/stopping, and return the attempt; stale/not-due requests reject. This server-only action does not grant ordinary worker mutation authority. `due` may return id or attempt_id. Start receives trusted canonical contract/protected hashes. Usage accepts actual_tokens/actual_cost in addition to reserved token_count/cost. Receipt contains receipt_id, bundle_verified_sha256, private bundle/diff keys, reproduction, and complete usage/history. Runner reports may use command_results (command_id) and derive check identities from checks.results.

The production release gate remains closed. Time spent making a cancellation request and waiting for provider exit is not proof of a strict stop bound. The inference reservation is an engineering upper estimate until account/tokenizer measurements verify it. Any actual per-call overage blocks success. Migration/runtime and real provider evidence must be measured before enabling live jobs. Restart recovery conservatively halts ambiguous submissions rather than duplicating them. All user-facing receipts and download links remain bounded by ownership and evidence source.

## Authorized audit correction pass — 12 October 2026

The read-only review preceded this correction pass. Confirmed race reproductions showed two simultaneous generations for one task, a heartbeat exception leaving a permanent running guard, cancellation rejection preventing available terminal observation, and a slow cancellation postponing unrelated deadlines. The fixes reserve the running guard before any await and release it in an unconditional nested finally; normalize internal errors to reviewed cancellation reasons with separately persisted safe diagnostic codes; observe after failed cancellation requests; and process deadline cancellation independently with a four-operation concurrency bound. No response acknowledgement is treated as proof of provider termination. Nullable due records permit stopped bookkeeping for cancellation/retention/total deadlines without an execution.

Local persistence now mirrors scheduler states, cancellation and total/retention due eligibility, owner expiry, the full 600-second Start window, finite nonnegative usage, and reviewed state transitions. next_sequence means the next unused event number, matching PostgreSQL. Persistent local schema version 2 is explicit; nonempty legacy databases without version metadata are rejected for a deliberate upgrade rather than silently shifting event counters. Private SQLite creation uses mode 0600, refuses leaf symlinks and shared/non-owned/nonregular files, checks the opened inode, and does not change arbitrary parent permissions. Its directory must already be owned and lack group/other write access.

Logging preserves provider_stream attribution in event payloads. CLI aggregate output remains explicitly unattributed even when transported through stdout. Truncation is a backend-owned fixed system event, once per attempt, outside the source byte cap; arbitrary provider text cannot become that marker. Reordered check and command evidence is canonicalized by identity for failure comparisons; command argument order retains its meaning. Invalid UTF-8 prompts become safe validation errors. Supervisor success requires strict booleans and integer counters/exit codes, exact command arguments, and valid chronological evidence.

Fixture generation starts independently for each task. Its report shape now includes passed and structured terminal resolution evidence. Missing fixture state after restart remains unknown and cannot fabricate stop proof. Finalizing recovery reuses immutable bytes only when identical. Download link TTL is reduced to fit remaining retention, reserving the adapter's bounded request timeout; no link is issued if that leaves less than one second. This is conservative application accounting, not a demonstrated provider clock guarantee.

Actual scoped verification:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_service.py -v
Ran 34 tests in 0.513s
OK
```

The new targeted regressions cover concurrent starts, heartbeat cleanup, parallel cancellation, rejected cancel with independently observed completion, cancellation enum/diagnostic parity, cancelled draft scheduling, no-job total deadlines, owner expiry, insufficient Start retention, invalid UTF-8, reordered evidence, per-task fixtures, short signing windows, one-time truncation markers, SQLite permissions/symlinks/legacy version refusal, next-unused sequence semantics and attribution replay, immutable finalization retry, strict boolean evidence, invalid accounting values, and unknown restarted fixture jobs. These tests use local fixtures; they do not validate paid provider execution.

Remaining release gates: independently verified execution-environment stop timing, trusted supervisor production and transport, account-level model and actual tokenizer/billing bounds, full PostgreSQL runtime validation, source stream attribution/history completeness, a deployment-wide active job/concurrency budget, and scheduled physical private Storage/database retention cleanup. The four-way cancellation bound reduces head-of-line blocking but cannot establish a strict 60-second stop guarantee by itself. Expired reads and links are blocked; physical artifact purge is not claimed as implemented or exercised.
