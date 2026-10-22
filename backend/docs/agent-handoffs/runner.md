# Runner scope handoff

## Part 1 — Boundary and dependency map

Owns `mend/runner.py`, `mend/supervisor.py`, `deploy/runner.Dockerfile`, and `tests/test_runner.py`. Inputs are frozen curated contracts, persisted dispatch deadlines, immutable source identity and submission keys. Outputs are actual provider job IDs, independently observed provider evidence, bounded logs and externally authenticated reports. Depends on `mend.domain` validation/hashing and `mend.transport.JsonTransport`. No host execution of model-generated source is permitted.

Provider source: https://docs.nebius.com/serverless/jobs/manage. REST creation/cancellation/listing are documented; logs are CLI/console only. Native timeout minimum is 3600 seconds. No claim of strict 60-second stopping or verified restart/network behavior follows from these fields.

## Part 2 — Implementation boundary

REST submission is reconciled by persisted submission name before dispatch. Unknown create/list responses fail closed. A cancel response is acknowledgment only. Completion requires independent provider terminal evidence and a configured authenticated report reader. Log strings are diagnostic only. The image runs as non-root with root-owned protected files and no credential injection.

## Part 3 — Security review

Same-process generated imports can monkeypatch unittest/report output. Therefore raw stdout and child-authored JSON never qualify as a trusted runner report. Supervisor report validation runs outside the generated process; live report transport and sandbox isolation remain release gates. No provider resources are created by local tests.

## Part 4 — Convergence

`NebiusRunner(token, project_id, image, *, subnet_id, platform, preset, release_enabled=False, transport=None, report_reader=None, termination_reader=None, reader_timeout=3.0, cli_path='nebius', cli_env=None, clock=None)` exposes async `submit`, `observe`, `cancel`, `stream_logs` and owned-transport `close`. `image_digest` is the `sha256:` identity from the pinned image. Dedicated CLI profile environment accepts only PATH, HOME, XDG_CONFIG_HOME, NEBIUS_PROFILE and LANG; no ambient server environment is inherited.

`report_reader(job_id)` is asynchronous and returns `{runner_report, report_storage_key}` only after independent trusted authentication. `supervisor.verify_report` checks an HMAC envelope and exact frozen identities/commands/checks. The trusted controller must stay outside the candidate container and never supply its signing key to generated code. No external report producer/transport is falsely claimed complete. `probe` executes the frozen unittest argv, whose output is diagnostic and insufficient for passing receipts. The image is non-root and secret-free; network blocking, metadata denial, cgroups, PID isolation, restart configuration and read-only-root enforcement require a measured provider spike before use.

Actual command: `python3 -m unittest discover -s tests -p test_runner.py -v`.

```text
test_cancel_ack_is_not_stop_evidence ... ok
test_cli_environment_rejects_ambient_credentials ... ok
test_live_gate_blocks_all_submission_requests ... ok
test_log_timeout_kills_trusted_fixture ... ok
test_native_timeout_is_3600_not_backend_deadline ... ok
test_operation_acknowledgment_never_invents_job_id ... ok
test_real_trusted_cli_fixture_streams_and_caps_output ... ok
test_source_mismatch_and_expired_deadline_prevent_dispatch ... ok
test_stdout_cannot_become_report ... ok
test_submission_name_reconciles_without_create ... ok
test_terminal_without_stop_time_stays_unresolved ... ok
test_unknown_list_and_paginated_list_fail_closed ... ok
test_authenticated_failed_report_can_supply_repair_evidence ... ok
test_changed_check_id_or_command_cannot_pass ... ok
test_signed_report_is_bound_to_exact_attempt ... ok
test_unsigned_child_authored_report_is_rejected ... ok
Ran 16 tests in 0.096s
OK
```

The first test execution found a syntax error in the new test fixture's list-comprehension terminator; corrected before the passing run. A review then corrected report verification to authenticate truthful failed-check reports as repair evidence while rejecting inconsistent success flags. All provider replies in these tests are injected fixtures. Two log tests execute only locally authored trusted fixture scripts, never generated candidate source. Docker build and live API/schema compatibility are unverified; no credentials or paid resources were used.

### Integration delta — persisted recovery evidence

1. Dependency audit found migration 001 requires `resolution_evidence` to be an object with `kind=provider_terminal` and a nonempty reference, while the original adapter returned diagnostic strings. Recovery also needed a read-only entry point rather than submission retries.
2. Terminal observations now include `{kind: provider_terminal, reference: <actual list endpoint>#<job ID>, provider_state: <observed state>}`. Report transport diagnostics remain separate. `reconcile(submission_key)` returns `found` with a unique observed job ID, or `ambiguous` with no ID. Empty, paginated, duplicate and unavailable listings never authorize a second POST.
3. Reviewed resource ownership and ambiguous-operation handling. Added a regression covering reconciliation absence, uniqueness, duplicate IDs and pagination while proving all calls are GET-only; extended terminal-evidence assertions.
4. Orchestration and database agents received the exact interface. Actual scoped output:

```text
python3 -m unittest discover -s tests -p test_runner.py -v
Ran 17 tests in 0.085s
OK
```

### Authorized audit fix — 12 October 2026

1. Read-only review reproduced malformed provider metadata exceptions, failed/unbounded report retrieval, split UTF-8 corruption and unsafe report-field exception types. Primary SDK review showed workload completion had incorrectly been equated with VM termination, an undocumented job exit field was read, standard Operation responses required reconciliation, and known provisioning states were omitted. The earlier terminal-evidence integration description above is historical; the following stricter contract supersedes it.
2. Provider lists now traverse at most ten pages/1,000 jobs within ten seconds, with typed nested metadata and cycle-token detection. Create acknowledgments are reconciled read-only without a second POST. SDK PROVISIONING/STARTING/IMAGE_PULLING states map to submitted; ERROR is retained as a terminal job observation. `finishedAt` populates only `workload_finished_at`/`finished_at`. No SDK `exitCode` is assumed. Actual command exit evidence can come from authenticated reports.
3. Terminal observations expose `job_terminal=true`, `terminal_observed_at`, and `job_observation_evidence`; these never establish VM stop. Default `termination_verified=false` and `provider_stopped_at=null` remain. An independently reviewed asynchronous `termination_reader(job_id)` must return `{job_id, provider_stopped_at, verification: {kind: 'independent_termination', reference: <bounded nonempty reference>}}`, with exact job match, timezone-aware stop no later than observation time and no earlier than known workload completion. Only valid proof enables `termination_verified=true`, `termination_evidence`, and resolvable `provider_terminal` evidence. No such reader is integrated or claimed verified here.
4. Report and termination readers must be asynchronous; synchronous callbacks are rejected to prevent unbounded event-loop blocking. Each read is bounded by `reader_timeout` (default three seconds, maximum ten). Failures preserve already-known job/workload evidence while remaining unresolved. External cancellation of the observation coroutine still propagates.
5. Logs use the documented `--tail 1000` plus following instead of discarding initial history with `--tail 0`. Replay is explicitly bounded, not complete-history proof. Incremental UTF-8 decoding preserves split characters. Missing/nonzero CLI outcomes become safe transport errors. Raw CLI output is labelled `provider_stream=unattributed`; actual stdout/stderr attribution is still a provider integration gate. Cap metadata is `{stream:'system',truncated:true,...}`; database/orchestration agents coordinated its trusted marker path.
6. Report verification rejects malformed signature/ID/status/counter fields using `ReportError`, enforces nonzero unique required-check/command identities, and handles invalid serialization safely. Probe input/timeout validation was tightened. Existing non-root images, no credentials, no signed child reports and disabled release defaults were preserved.

Actual scoped verification:

```text
python3 -m unittest discover -s tests -p test_runner.py -v
Ran 29 tests in 0.139s
OK
```

The scoped suite includes actual locally authored trusted CLI fixtures for split UTF-8 output, nonzero exit, byte cap and timeout cleanup. It does not execute generated source. Provider schema references: [Nebius-maintained SDK v0.2.69](https://pkg.go.dev/github.com/nebius/gosdk@v0.2.69/proto/nebius/ai/v1#JobStatus), [job states](https://pkg.go.dev/github.com/nebius/gosdk@v0.2.69/proto/nebius/ai/v1#JobStatus_State), and [official job management/CLI options](https://docs.nebius.com/serverless/jobs/manage). Account calls, live schema compatibility, Docker build, report authority and infrastructure termination remain unverified.
