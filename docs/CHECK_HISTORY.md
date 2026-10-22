# Protected-check consistency gate

Implemented offline, 21 October 2026. This is the first working slice of roadmap item 05. It consumes existing authenticated reports; it does not run code, schedule retries, lift release gates, persist a quarantine or remove a protected check.

## Behavior

`mend.check_history.analyze_check_history(envelopes, expected_runs, contract, signing_key=...)` verifies every report with the existing controller HMAC verifier. The key, contract and expected run inventory must be operator-controlled, separate from candidate/workload output. A signature establishes authority within that configured-key boundary, not provider independence, real execution or completeness of the inventory.

The inventory must name exactly eight identity fields per observation: `task_id`, `attempt_id`, `job_id`, `contract_sha256`, `snapshot_sha256`, `protected_checks_sha256`, `image_digest`, `model_id`. Reports and expected identities are paired in order. Each job must be distinct; duplicate job evidence is rejected rather than counted as repetition. All observations share the same task, contract, exact source snapshot, protected checks, runner image and model. The contract's canonical digest must match the expected identity. Mixing an original and corrected snapshot cannot manufacture a flaky finding. The tool currently does not aggregate different tasks, machines, models or environment cohorts.

| Observed evidence for a check | Classification | Gate effect |
| --- | --- | --- |
| At least one pass and one failure | `inconsistent` | Block; list as a quarantine candidate for human review |
| Fewer than two observations, or any skip without pass/failure disagreement | `inconclusive` | Non-passing/inconclusive |
| At least two failures and no pass or skip | `consistent_failure` | Block; ordinary repeated failure is not labeled flaky |
| At least two passes, no failure or skip | `observed_consistent_pass` | Pass only if every required check has this result and all frozen commands exit zero |

Inconsistent/consistently failed checks take precedence over inconclusive checks when computing the gate. Otherwise, a skipped or missing observation remains inconclusive. A failing command blocks even if its check results claim passes. Invalid signatures, missing inventory, altered commands/results, changed identities, duplicate jobs and oversized input are rejected without an output summary.

This is evidence of observed inconsistency, not a diagnosis of its cause. A failing environment, nondeterminism or a compromised signer still needs investigation. Two successful observations do not prove absence of flakiness. Output explicitly retains `absence_of_flakiness_proven: false`, `inventory_completeness_proven: false`, `tests_excluded: false`, `live_verification: false` and `apply_authorized: false`. It includes per-check counts, canonical envelope hashes and a digest binding the supplied inventory/reports. The policy is fixed and fail-closed; no automatic-approval threshold is introduced.

## Offline file/CI command

After backend installation, run from `backend/` with operator-controlled files:

```powershell
python scripts/check_history.py --contract frozen-contract.json --expected-runs trusted-runs.json --key-file private-controller-key.bin --report report-1.json --report report-2.json --output check-history.json
```

`frozen-contract.json` is the frozen contract object, not the outer prepared case. `trusted-runs.json` is the ordered list of expected eight-field identities. Each report file is the existing `{report, signature}` envelope. The key file contains 32–256 raw bytes, never a key in command-line text or a committed example credential. No key is copied into the result or printed. Do not obtain the key, expected inventory or frozen contract from an untrusted pull request. Whoever controls this inventory could omit adverse observations, so this CLI cannot prove inventory completeness. A production controller must bind the complete reserved execution inventory to trusted task state.

Inputs are bounded: at most 100 reports, 65,536 bytes per envelope, 2 MiB canonical envelope aggregate, 256 KiB contract and 256 KiB CLI inventory. No submitted command or source is executed. The output uses exclusive creation and refuses to replace any existing file, including an input or a key. Exit codes are:

- **0:** supplied evidence has observed consistent passes and successful commands.
- **1:** valid evidence is blocked by disagreement, repeated failure or a command failure.
- **2:** inconclusive evidence or invalid/unreadable inputs, missing authority or an unavailable/existing output destination. Invalid inputs produce no summary.

Use the process exit status directly in a trusted CI step; do not append `continue-on-error` or reinterpret a missing result as success. The prepared repository workflow discovers these tests automatically. No GitHub required-check rule or remote workflow run has been established by this local implementation.

## Comparative review integration

`review_bug_comparison` optionally accepts `candidate_history` and `history_identities` together. Supplied history must authenticate and match the exact candidate cohort. A blocked or inconclusive history prevents a `regression_demonstrated` result, returning `candidate_history_blocked` or `candidate_history_inconclusive`. Other candidate failures remain failures. Invalid histories are rejected. Passing history does not override a failed candidate or an unproven original regression. Results retain the full analysis as `check_history`; absent history is `null` and conveys no consistency review. The helper still never authorizes repository application.

No extra jobs are allocated or budget limits increased. If the existing reserved execution history cannot provide comparable observations, the correct result is insufficient evidence. Do not launch repeats outside the frozen allocation merely to obtain a green gate. Automatic repeat collection, durable operator review/quarantine, controller completeness and UI integration remain future work.

## Actual validation

Twenty-two focused offline tests passed across the history analyzer, real CLI subprocesses, bug comparisons and preparation CLI. Twelve tests are new or newly added integration coverage in this continuation. They cover disagreement, stable passes/failures, skips, command failure, replay, mixed source/context, signature tampering, altered contract, input bounds, invalid identities, duplicate JSON fields, private key non-disclosure, output preservation and candidate-bound comparison integration. All signed fixtures use an explicitly synthetic controller key; they do not establish live provider evidence.
