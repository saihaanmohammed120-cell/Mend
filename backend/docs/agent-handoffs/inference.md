# Inference agent handoff

## Part 1 — boundaries and dependencies

Owned files: `mend/transport.py`, `mend/inference.py`, `tests/test_inference.py`, and this handoff. Inputs are a frozen contract, user prompt, existing text files, bounded diagnostics, configured Token Factory credential/model and optional configured price provenance. Outputs are full replacement text files plus actual completion/model identities and reported token usage. No generated code is executed here. Core validates replacements before dispatch. The task orchestrator owns aggregate usage, repair reservations, cancellation, and the two-request retry budget; this adapter never retries automatically.

`JsonTransport.request(method, url, headers=None, json_body=None, timeout=30.0, max_bytes=1048576)` is async, requires an explicit HTTPS host allowlist, and returns a JSON object or array. `TransportError` contains a stable safe code/status and retryability metadata, never provider bodies or secrets. Transport uses stdlib urllib; tests inject response handlers without live network calls. `TokenFactoryClient.generate(contract,prompt,files,diagnostics=None,max_output_tokens=4096,timeout=30.0)` is async, checks `/v1/models`, then makes a single non-streaming completion call. Missing credentials or unavailable models fail rather than falling back.

Inherited requirements: TRD v1.2, Nemotron 3, default candidate `nvidia/nemotron-3-super-120b-a12b`, no invented pricing, no fabricated live verification, protected-source constraints, and aggregate 30,000-token cap enforced by the task orchestrator. Account model/JSON compatibility and latency require the real Phase 1 spike.

## Part 2 — implementation and integration contract

The adapter performs account model discovery at `/v1/models` (cached at most 60 seconds within that client), then posts non-streaming chat completions to `/v1/chat/completions` with JSON-object format. Response model identity must exactly match the configured identifier. Completion identity, finite integer token usage, complete finish reason, strict JSON keys and core replacement validation are required. Protected source integrity is verified before making a paid call. The output contains only replacement files and actual model/request/usage evidence; the trusted runner determines whether checks pass.

Constructor: `TokenFactoryClient(api_key, model_id=DEFAULT_MODEL, endpoint=DEFAULT_ENDPOINT, *, transport=None, input_price_per_million=None, output_price_per_million=None, price_provenance=None)`. `pricing_available` reports whether both prices and provenance were configured. `reservation(contract,prompt,files,diagnostics=None,max_output_tokens=4096)` returns `{token_count,cost}` before dispatch. Token reservation uses serialized request UTF-8 bytes plus a 1024-token framing allowance and the output limit. This is a conservative engineering estimate, not verified Token Factory tokenization or a billing guarantee. The Phase 1 spike must test that bound; actual overage requires reconciliation and blocks new inference. Keep persisted reserved usage separate from actual provider-reported usage; never invent actual usage or refund an ambiguous crashed call.

Unpriced cost is `None`, never zero. Live orchestration must require pricing configuration before starting a task. A generated malformed/refused/truncated/protected patch raises `MendError` with `.usage` attached so accounting survives rejection. Missing/inconsistent provider usage blocks acceptance and requires reconciliation. No adapter request retries occur; task-level retries require a persisted explicit reservation, and ambiguous completion timeouts are marked `.ambiguous=True`. Cancellation cannot undo a completion already accepted remotely.

Known-credential, bearer-token and common API-key/JWT patterns are redacted from model input. Diagnostics are bounded to 32KB and encoded as data rather than trusted instructions. Prompt injection is also contained by frozen editable paths and trusted checks; model instructions alone are not an execution security boundary.

## Part 3 — review and actual local verification

Security review covered HTTPS allowlist bypasses, credential forwarding on redirects, inherited HTTP proxies, request/header injection, non-finite limits, duplicate JSON fields, response byte bounds, malformed provider statuses, token accounting on rejected patches, cancelled-thread resource ownership, and slow body trickling. Redirects/proxies/retries are disabled. Responses close and concurrency slots release even when cleanup fails. Deadline checks encompass model discovery and completion.

A refactor initially referenced variables outside their scope; the first fixture run exposed six errors. The reference was corrected before acceptance. Further review caught wasted paid calls with altered protected checks and cleanup exceptions leaking concurrency slots; both now have regression tests.

Executed command: `python3 -m unittest discover -s tests -p test_inference.py -v`.

```text
[OFFLINE HTTP HANDLER / PROVIDER FIXTURE ENVIRONMENT — NO LIVE KEY CALLS]
test_actual_usage_remains_on_truncated_refused_malformed_source ... ok
test_ambiguous_timeout_has_no_automatic_retry ... ok
test_changed_protected_source_fails_before_provider_call ... ok
test_discovery_cached_without_cross_model_or_mock_fallback ... ok
test_discovery_then_completion_and_real_response_identities ... ok
test_fixture_only_prices_and_reservation_do_not_invent_rates ... ok
test_invalid_arguments_fail_before_provider_call ... ok
test_missing_key_wrong_host_and_non_nvidia_model_fail_closed ... ok
test_missing_model_never_silently_substitutes ... ok
test_missing_or_inconsistent_usage_requires_reconciliation ... ok
test_pricing_requires_pair_and_provenance ... ok
test_provider_model_mismatch_blocks_output ... ok
test_raw_transport_exceptions_never_escape ... ok
test_secrets_redacted_and_diagnostics_demoted_to_data ... ok
test_array_json_support_and_closed_transport ... ok
test_cancellation_does_not_dispatch_duplicate_and_closes_response ... ok
test_header_injection_and_nonfinite_timeout_rejected ... ok
test_https_allowlist_blocks_ssrf_and_credentials ... ok
test_json_fixture_closes_response ... ok
test_malformed_status_and_cleanup_failure_do_not_leak_slots ... ok
test_provider_error_sanitized_without_automatic_retry ... ok
test_redirect_handler_never_copies_headers ... ok
test_response_bound_with_and_without_content_length ... ok
test_slow_drip_body_does_not_reset_total_deadline ... ok
test_strict_json_and_utf8_invalidity ... ok
test_timeout_caps_orphan_work_and_closes_late_response ... ok
Ran 26 tests in 0.308s
OK
```

`python3 -m py_compile mend/transport.py mend/inference.py` also completed successfully. These are actual locally executed fixture tests, not proof of provider model access, latency, prices, or job termination.

### Read-only audit and authorized correction pass

The complete read-only audit reproduced three additional boundary bugs before further changes: JSON exponent `1e999` parsed as infinity; an `HTTPError.close()` exception escaped the safe handler; and extreme finite Decimal prices caused arithmetic overflow. The authorized fix pass added finite float parsing, guarded HTTP-error cleanup, price representability/size checks before transport allocation, and safe Decimal arithmetic errors. Targeted regressions now cover all three.

```text
[OFFLINE PROVIDER / HTTP FIXTURES — NO LIVE CALLS]
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_inference.py -v
Ran 29 tests in 0.270s
OK
```

The preceding 26-test log is initial acceptance evidence; this 29-test run is the post-audit correction result.

## Part 4 — convergence and remaining evidence

Runner and repository consume the shared async JSON transport; orchestration consumes generation, conservative reservation and `.usage` error metadata. Applications close owned transport/client resources at shutdown. The urllib executor is bounded to four outstanding operations by default. A local deadline bounds the async wait, and socket/body deadlines bound ordinary reads. Operating-system DNS resolution cannot be forcibly interrupted by stdlib urllib; abandoned work is concurrency-capped until it returns. A timed-out POST is unresolved provider work, never authorization to issue a duplicate.

No key was available, so no real account model listing, generation, JSON compatibility, tokenization bound, prices or latency was verified. Release requires those measured Phase 1 results and the blueprint's separate job cancellation/isolation gates. No mock fallback enters the live adapter.

Primary documentation consulted 11 October 2026:

- https://docs.tokenfactory.nebius.com/quickstart — documented API endpoint and bearer authentication.
- https://docs.tokenfactory.nebius.com/ai-models-inference/json — JSON mode and model-dependent capability.
- https://api.tokenfactory.nebius.com/docs — provider API reference.

These sources establish request format, not this account's runtime availability.
