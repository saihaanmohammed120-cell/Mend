# Authenticated controller evidence readers

Implemented offline, 21 October 2026. `mend.evidence_readers.TrustedEvidenceReaders` consumes authenticated records from a configured external controller. It does not produce protected-check evidence, inspect Nebius infrastructure, establish isolation, or enable live execution. Bootstrap's release lock and the live-provider/database holds remain unchanged.

## Injection and ownership

Construct `TrustedEvidenceReaders(origin, project_id=..., report_key=..., termination_key=..., access_token=..., context_reader=..., transport=None, timeout=3.0, clock=None)` in trusted application assembly. The two HMAC keys must be distinct byte strings of at least 32 bytes. The access token and both keys belong outside candidate source, injected files, model inputs, logs and public receipts. No environment loader or production context adapter is installed by this slice.

`origin` is an explicitly operator-controlled HTTPS origin on port 443, without credentials, path, query or fragment. It is never a task field or arbitrary user URL. Explicit loopback origins on HTTPS port 443 are accepted; there is no DNS/private-network denial policy beyond this trusted configuration boundary. The owned `JsonTransport` pins the configured hostname, disables ambient proxies, checks TLS, rejects redirects and bounds response bytes. An injected transport is a trusted testing/assembly boundary and must preserve those rules.

`context_reader(job_id)` must be asynchronous and return trusted persisted `{task, attempt, project_id}`. It must authorize its own database lookup; it must not derive expectations from controller responses or workload output. Required task fields are `id`, `contract`, `contract_sha256`, and `protected_checks_sha256`. Required attempt fields are `id`, `task_id`, `ordinal`, `job_id`, `model_id`, `image_digest`, `snapshot_sha256`, `dispatch_requested_at`, and `deadline_at`. The reader validates the curated frozen contract and hashes, dispatch chronology and exact configured project before making an evidence request.

Inject the object using `NebiusRunner(..., evidence_readers=readers, release_enabled=False)`. Its project must match the runner's project. It cannot be mixed with separate `report_reader` or `termination_reader` arguments. Existing individually injected readers retain their interface. The assembly owns the paired-reader object's lifetime: call `readers.close()` separately from `runner.close()`. Only a transport created by the reader is closed by it.

## Controller wire protocol

This is a Mend controller protocol, **not a claimed Nebius API**:

| Request | Returned authenticated payload |
| --- | --- |
| `GET /v1/mend/jobs/<job_id>/report` | Complete protected supervisor report |
| `GET /v1/mend/jobs/<job_id>/termination` | Independent infrastructure observation |

Both requests use the configured bearer access token and return exactly `{report, signature}`. `signature` is lowercase HMAC-SHA256 of the UTF-8 canonical JSON emitted by `mend.supervisor.canonical(report)`, using the corresponding configured key. Response bodies are limited to 70,000 bytes; supervisor report payloads retain the existing 65,536-byte cap. Lookup and transport share one bounded asynchronous wait per reader invocation; caller cancellation propagates. Missing records, HTTP errors, bad signatures, schema errors, timeouts and identity mismatches produce the safe `evidence_unavailable` error. A 404 never becomes proof of absence or stop.

Both signed payloads contain `schema_version: 1`, `source: "live"`, nonempty `observer_id` and `observer_version`, and exact persisted values for:

- `task_id`, `attempt_id`, `job_id`, `model_id`, `image_digest`;
- `contract_sha256`, `snapshot_sha256`, `protected_checks_sha256`;
- `provider_project_id` and integer `execution_ordinal`.

The report payload also satisfies the existing `supervisor.verify_report` contract: `complete: true`, consistent boolean `passed`, every frozen command with exact arguments and integer exit code, and every required check with consistent counts/results. Authenticated failures can supply repair diagnostics; an unsigned, mismatched or incomplete report cannot. A reader does not turn a failed report into passing evidence.

The termination payload additionally contains `job_terminal: true`, `termination_verified: true`, timezone-aware `workload_finished_at` and `provider_stopped_at`, nonempty `resource_id` and `observation_api`, and `verification: {kind: "independent_termination", reference: "..."}`. Optional `stopped` must be literal `true`. Chronology requires dispatch <= workload finish <= infrastructure stop <= current time. An observed stop after the execution deadline is retained as an overrun; the existing finalizer rejects that attempt for success. Wall-clock chronology alone does not establish the strict stop bound or account for uncertainty.

## Durable hashes and remaining authority gaps

The report reader returns `{runner_report, report_storage_key: null, report_evidence}`; the termination reader returns its verified payload with enriched `verification`. Both attach an `envelope_sha256` over **canonical signed-envelope JSON**, plus observer metadata. This is not a hash of raw HTTP response bytes. The runner retains report verification in `resolution_evidence.report_verification`; existing service resolution persists it alongside the stop verification. No new database columns or migrations are introduced. Hash matching does not establish signing authority or infrastructure semantics.

Before any live release, the project still needs a reviewed controller that protects checks from candidate interference, a separately trusted observer with documented job-to-resource mapping and actual independent stop observations, trusted persisted-context lookup, secret provisioning/rotation, and immutable retention of the original signed records. This slice retains canonical hashes and verified payloads; it does not archive complete original signed envelopes or raw response bytes. It does not make backend/database-authority tampering or compromised controller keys safe.

Provider isolation, conservative timing/uncertainty measurements, complete protected-report delivery, authenticated recovery and end-to-end live receipt verification remain release gates. Two different HMAC keys and valid-looking observer labels cannot establish those facts. All local reader tests use synthetic keys and injected in-memory transports; none authenticates a provider or executes generated source.
