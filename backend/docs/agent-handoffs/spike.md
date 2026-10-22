# Phase 1 spike handoff

## Part 1 — boundaries before implementation

Owned scope: `scripts/phase1_spike.py`, `docs/PHASE1_SPIKE.md`, `tests/test_spike.py`, this handoff, and root-authorized `deploy/spike.Dockerfile` plus `deploy/timing_probe.py`. Inputs are an explicit paid operator flag, environment-only provider credentials/resource identifiers, configured prices/provenance/task cap and a pinned separate timing image. Output is a persisted safe measurement journal, never a live receipt. Default dry-run performs no provider requests. Tests inject offline clocks/model/runner fixtures.

The existing TRD/blueprint governs. Production bootstrap stays blocked. A separate fixed trusted timing container sleeps 120 seconds and ignores injected/generated source; cancellation is scheduled from persisted dispatch time at 60 seconds independently of observation polling. No model output executes on the host or in the timing job. Timing observations are samples, not production guarantees. Unknown submission/state or infrastructure termination retains reconciliation identity and explicit cleanup instructions. SDK workload `finishedAt` does not prove VM termination.

## Part 2 — implementation

Default CLI performs zero provider requests; paid mode requires `--run-live`, complete environment configuration and an explicitly approved separate digest-pinned timing image. Inference calls are limited to 1–4 with persisted conservative aggregate token/cost reservations. Journal creation refuses overwrite and uses private atomic writes. The independent cancellation coroutine records intent and job identity before its single cancellation attempt. Unknown submission is reconciled without duplicate creation. Cancellation acknowledgment, workload/container completion, terminal job observation and independently verified infrastructure termination are separate fields. Only the last can establish resource-stop timing; the shipped CLI has no independent reader and therefore cannot establish that timing.

The production bootstrap remains unchanged. Only this isolated operator probe constructs `NebiusRunner(release_enabled=True)`; it never constructs a production task or receipt. Generated source is never executed. The 600-second projection explicitly includes queueing inside job budgets, labels extrapolation and leaves successful fit unknown until remaining phases are measured.

## Part 3 — review and executed evidence

Review identified that the ordinary 55-second supervisor image cannot test cancellation of a job still running at 60 seconds; the separate fixed 120-second workload resolves the measurement setup without changing production runtime. Review also ensured a post-dispatch storage-write failure does not block cleanup. Unknown job identity/state preserves its submission key and explicit manual cleanup requirement; no absent resource is silently treated as terminated.

Actual commands and output:

```text
[OFFLINE FIXTURE MEASUREMENT ENVIRONMENT — NO PROVIDER OR DOCKER CALLS]
python3 -m unittest discover -s tests -p test_spike.py -v
test_config_secrets_not_in_repr_and_approval_required ... ok
test_default_dry_run_does_not_construct_provider_clients ... ok
test_journal_private_atomic_and_never_overwrites_existing ... ok
test_live_without_configuration_fails_before_requests ... ok
test_short_measured_projection_never_claims_verified_fit ... ok
test_ten_minute_misfit_and_queue_not_double_counted ... ok
test_ambiguous_submit_preserves_name_never_creates_twice ... ok
test_cancel_ack_is_separate_from_stop_and_positive_lag_fails_bound ... ok
test_deadline_worker_is_independent_of_slow_observation ... ok
test_early_terminal_probe_does_not_claim_running_cancel_measurement ... ok
test_inference_four_calls_accounted_without_executing_returned_source ... ok
test_token_reservations_stop_fifth_or_over_budget_call ... ok
test_unknown_inference_usage_keeps_reservation_and_stops ... ok
test_unknown_stop_requires_manual_cleanup_without_cancel_retry ... ok
Ran 14 tests in 0.988s
OK

python3 scripts/phase1_spike.py --dry-run
provider_requests: 0
source: dry_run
live_release_ready: false

python3 -m py_compile scripts/phase1_spike.py deploy/timing_probe.py
Exit code: 0
```

## Part 4 — convergence and remaining gates

All artifacts are ready for root packaging. No Token Factory/Cloud credential was available and no paid operation was performed. Account model support, billed prices, deployment, cancellation-to-independent-resource-stop, provider response schema, exact queue latency, Cloud cost, protected report transport and end-to-end task fit remain unverified. Docker build has not run. Offline fixture behavior does not replace these gates. Operator instructions and interpretation are in `docs/PHASE1_SPIKE.md`.

### Read-only audit and authorized correction pass

The read-only audit found that SDK `finishedAt` was being classified as infrastructure stop evidence and that KeyboardInterrupt combined with journal-write failure dropped the cleanup report. The authorized correction now retains workload finish/terminal observation separately, requires the runner's explicit independent termination predicate, and preserves printed cleanup identities even when interruption persistence fails. Existing stop-timing tests now use explicitly labelled independent-termination fixtures; an added workload-only regression proves the strict bound stays unmeasured with manual cleanup required. Baseline TRD v1.2 files remain unchanged.

```text
[OFFLINE MEASUREMENT FIXTURES — NO PROVIDER OR DOCKER CALLS]
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_spike.py -v
Ran 16 tests in 1.051s
OK
```

The preceding 14-test log records initial acceptance; this 16-test run is the corrected post-audit result.
