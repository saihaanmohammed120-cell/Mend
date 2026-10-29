# Phase 1: operator-controlled provider measurements

This tool collects evidence for the inherited Mend TRD v1.2. It never activates the production release gate or writes receipts. No live provider calls have been performed during construction. Offline fixture tests verify measurement mechanics only.

## Default behavior

```bash
python3 scripts/phase1_spike.py --dry-run
```

The default, including invocation without arguments, makes **zero provider requests**, needs no credentials, and prints required environment variable names. A selected `--output` saves the dry-run report. Existing output files are never overwritten. Live mode is a separate, explicit paid operator action.

## Reviewed timing workload

Build `deploy/spike.Dockerfile`, which copies only the fixed `deploy/timing_probe.py`: a non-root Python process printing one diagnostic line and sleeping 120 seconds. It does not read injected source, execute model output, access credentials, generate receipts or run the regular check supervisor. A separate image is essential: the normal supervisor can stop at 55 seconds and cannot establish cancellation of a still-running process at 60 seconds.

```bash
docker build -f deploy/spike.Dockerfile -t "$MEND_SPIKE_IMAGE_TAG" .
docker push "$MEND_SPIKE_IMAGE_TAG"
docker image inspect --format='{{index .RepoDigests 0}}' "$MEND_SPIKE_IMAGE_TAG"
```

Choose an operator-owned registry tag through `MEND_SPIKE_IMAGE_TAG`, then inject the resulting immutable repository `@sha256:` reference as `MEND_SPIKE_IMAGE`. The script rejects an unpinned image. Image build/push, platform scheduling and network/process isolation have not been tested here. Non-root execution alone does not prove isolation. Production image and gate remain unchanged.

## Required live configuration

Inject credentials through the operator's environment or deployment secret manager; do not place them in source, container files, printed reports or command-line arguments.

| Variable | Meaning |
|---|---|
| `NEBIUS_TOKEN_FACTORY_API_KEY` | Account Token Factory credential |
| `NEBIUS_IAM_TOKEN` | Separate Nebius Cloud IAM token |
| `NEBIUS_PROJECT_ID` / `NEBIUS_SUBNET_ID` | Authorized timing-job placement |
| `NEBIUS_PLATFORM` / `NEBIUS_PRESET` | Explicit account-supported resource selection |
| `MEND_SPIKE_IMAGE` | Reviewed separate timing image, pinned by digest |
| `MEND_SPIKE_PROBE_APPROVED` | Must equal `true`; operator attestation of the fixed timing image |
| `MEND_INPUT_PRICE_PER_MILLION` / `MEND_OUTPUT_PRICE_PER_MILLION` | Actual configured account prices, both required |
| `MEND_PRICE_PROVENANCE` | Source/date explaining those configured prices |
| `MEND_TASK_COST_CAP` | Positive cap on conservative inference reservations, in the same configured price currency |
| `NEBIUS_MODEL_ID` | Optional explicit NVIDIA Nemotron identifier; default `nvidia/nemotron-3-super-120b-a12b` |

The standalone spike applies `MEND_TASK_COST_CAP` to its own accumulated inference reservations. Application assembly separately forwards the same setting to the per-task `TaskService` inference gate; neither consumer shares an account-wide spending ledger. Missing or blank configuration prevents a live spike from starting and blocks nonfixture service inference. See [task budget configuration](TASK_BUDGET_CONFIGURATION.md).

The inference monetary cap is not a verified bound on Cloud compute charges. Job pricing remains unmeasured; the operator must review the selected Cloud resources/billing before authorizing a paid probe. Unknown cancellation may require manual provider cleanup and must not be treated as a stopped resource. Configuring the cap does not lift the live release block or the provider/database holds.

```bash
python3 scripts/phase1_spike.py --run-live --generation-calls 1 --output var/phase1-observations.json
```

`--generation-calls` accepts 1–4, default 1. `--max-output-tokens` defaults to 2048 and accepts 1–8192. A conservative persisted 30,000-token/inference-cost reservation may stop the requested series early. No generation or submission POST is automatically retried. Never run another probe while a prior job remains unresolved.

## What is measured

1. Each inference request's full wall latency, actual model/completion identities, actual reported input/output tokens and calculated cost from configured prices. The latency includes account-model discovery when uncached; separate listing latency is not claimed. Calls after the first use an explicitly labelled curated repair-context fixture, not purported live stderr. Model output stays data and never enters the timing job or executes on the host.
2. Dispatch is journaled before Cloud submission with an attempt UUID, exact submission key, source identity, UTC dispatch time and dispatch-plus-60-second deadline. Submission acknowledgment latency and first observed RUNNING latency are recorded. Provisioning/queue upper bound is derived from first observation minus acknowledgment; polling precision limits it. It is not an exact provider start timestamp.
3. An independent asyncio deadline worker sends a cancellation request at dispatch-plus-60 seconds, unaffected by slow observation polling. Cancellation acknowledgment latency is recorded separately from workload/container completion and infrastructure termination. No provider timeout setting purports to enforce 60 seconds; the Jobs adapter retains the provider's one-hour minimum.
4. Nebius SDK `finishedAt` records workload/container completion. A terminal job status and its backend observation time are stored separately; neither proves VM/resource termination. The shipped CLI has no independent termination reader, so actual infrastructure stop and the strict bound remain **unmeasured**, even if the provider reports a completed or cancelled job. A future reviewed reader must supply `termination_verified=true`, a valid `provider_stopped_at`, and evidence `{kind: "independent_termination", reference: "..."}`; only that complete predicate authorizes dispatch-to-resource-stop and cancellation-to-resource-stop measurements. The safe report stores an evidence-reference hash rather than an arbitrary provider URL. With verified evidence, a stop after 60 seconds fails `strict_60_second_sample_fit`. An early-ending job cannot establish running-job cancellation. Unknown schemas, absent independent evidence, negative/future timestamps or ambiguous submission remain unmeasured. An acknowledgment, a workload timestamp or a terminal job state is never substituted for verified infrastructure termination.

The tool monitors for a bounded cleanup window after the deadline. Unknown submission is reconciled by its exact persisted `mend-<submission_key>` name; no second create is issued. Unresolved reports retain `job_id` when known and `manual_cleanup_required=true`, with explicit provider cleanup instructions. This includes terminal workloads without independent resource-stop evidence. An interrupted probe attempts one cancellation if none was already attempted. Storage failures after dispatch must not prevent cancellation, and interrupted journal-write failure still prints the in-memory cleanup identities. Report writes are private, atomic local files; no credential values are included.

## Reading the budget projection

Four 60-second job budgets contribute **240 seconds including provisioning and queueing**. Queue time is reported but not added again. Four measured generation latencies are summed; when fewer calls complete, four times the slowest observed generation is explicitly an extrapolation. Independently verified resource-stop overrun is included conservatively across four jobs; workload completion never supplies this number. Without resource evidence that overrun is unknown. Artifact transfer, orchestration overhead, report transfer and receipt finalization remain unmeasured. First observed RUNNING at or after 60 seconds flags exhausted job budget.

The report flags `fits=false` when even this partial subtotal exceeds 600 seconds. A subtotal below 600 yields `fits=null`, because unmeasured phases prevent a verified fit. Sampling cannot prove hard upper bounds, and this probe never sets `live_release_ready=true`. Cancellation initiated exactly at 60 seconds with positive stop delay fails the strict requirement; a compliant architecture still needs demonstrable timely termination before release.

## Cleanup and release review

After every paid probe, record job/workload terminal state and separately obtain infrastructure termination evidence. If resource termination is unknown, use the persisted resource ID or exact submission name in Nebius Jobs to cancel/reconcile it using the [official job management instructions](https://docs.nebius.com/serverless/jobs/manage), then obtain the required independent resource evidence. Retain the report and operator evidence. Do not remove the journal or re-run submission merely because the CLI exited or `finishedAt` was populated.

Release separately requires real protected-check/report authority, result transfer, logs, isolation and recovery evidence, migration/framework verification, the full measured task critical path, and a defensible strict job lifetime bound. This timing-only tool is not an end-to-end success demonstration.

The SDK/workload-versus-infrastructure evidence finding is an implementation overlay; the inherited baseline TRD v1.2 remains unchanged.
