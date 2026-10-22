# Auth/API handoff

## Part 1 — boundaries and dependencies

Owned files: `mend/auth.py`, `mend/api.py`, `mend/config.py`, `tests/test_auth.py`, and this handoff. The blueprint and inherited TRD v1.2 govern ownership, secure-cookie EventSource authentication, persisted replay, no token URLs, and default-disabled live execution. Inputs are environment-only configuration, a TaskService instance, and a bounded HTTPS JsonTransport. Outputs are a FastAPI application factory, a Supabase server-verified encrypted-session boundary, redacted errors, and authenticated task/SSE endpoints. Supabase identity verification runs on each authenticated request; task ownership remains checked by the store as defense in depth. Session creation and all mutations require an explicit allowed browser Origin; mutations also require a session-bound double-submit CSRF token. SSE disconnect never cancels work.

FastAPI is a declared production dependency. The initial environment lacked the framework; the restored canonical virtual environment now runs genuine FastAPI/Starlette/HTTPX tests, as recorded in the 13 October correction below. Core authentication and configuration tests use actual stdlib unittest and cryptography. No alternate fake framework is substituted. No provider credentials or browser session tokens appear in public errors, health, URLs, or logs.

## Part 2 — implemented modules

- `Settings.from_env` reads deployment values only from environment injection; live execution defaults false. Credentials are separate and excluded from dataclass repr. HTTPS auth/public origins and a 32-byte base64 AES seal key are mandatory before application construction. `live_blockers()` emits stable names without values.
- `SupabaseAuthenticator` verifies `/auth/v1/user` through bounded HTTPS transport, never trusting a decoded client JWT alone. Exchange encrypts user ID, access token, issue/expiry times, and independent random CSRF token with AES-GCM. Every later request decrypts and re-verifies the token and exact subject. Provider errors are redacted; outages fail closed with 503 rather than silently granting access. Session cookies are limited below 4KB and expire within 15 minutes.
- `create_app` exposes session exchange/logout, all seven task routes from TRD §7, liveness/readiness, and strict credentialed CORS. Secure `__Host-` cookies use `/`, no Domain, HttpOnly for session, SameSite Strict. Origin plus session-bound header/cookie CSRF validation applies to all mutations; login requires allowed Origin. Task IDs are canonical UUIDs, user identity is supplied only by the auth boundary, and the service/store must independently enforce ownership. Bodies are byte-capped, read under a 10-second deadline, reject duplicates/nonfinite JSON/unknown fields, and use explicit public payload allowlisting.
- SSE uses secure cookie identity with pre-stream ownership authorization, `Last-Event-ID` precedence, persisted sequence IDs, deduplication, JSON escaping, 15-second comments, and no buffering/cache. One pending read is retained through heartbeat timeouts; disconnect cleanup cancels only this read and closes the iterator, never the task/job. Streams stop at session expiry, requiring reauthentication. No access token appears in a query string. Start is durable-worker-owned, not an API fire-and-forget coroutine.

## Part 3 — security review and real verification

Reviewed ciphertext tampering, expired/future/oversized sessions, cross-subject token substitution, arbitrary browser origins, login CSRF, missing/mismatched double-submit tokens (including non-ASCII input), unbounded request bytes, header/event injection, secret disclosure through errors/repr, skipped replay IDs, and leaked pending generators. Constant-time token comparisons, bounded transport, explicit fields, bounded cookies and iterator cleanup address these paths. Browser tokens are intentionally in encrypted HttpOnly session storage; raw provider keys never reach a browser.

Earlier actual command (12 October 2026): `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_auth.py -v`.

```text
test_bodies_bounded_and_duplicate_nonfinite_rejected ... ok
test_overflowing_json_numbers_rejected_without_rejecting_finite_costs ... ok
test_provider_errors_redacted_and_bad_tokens_not_dispatched ... ok
test_server_identity_reverified_and_subject_bound ... ok
test_sse_disconnect_cleans_generator_without_cancelling_job ... ok
test_sse_drops_event_if_client_disconnects_during_wait ... ok
test_sse_drops_event_if_session_expires_during_serialization ... ok
test_sse_drops_event_that_arrives_after_session_expiry ... ok
test_sse_heartbeat_replay_dedup_and_cleanup ... ok
test_configuration_no_secrets_in_readiness ... ok
test_cookie_size_budget ... ok
test_csrf_is_bound_to_session_and_origin_exact ... ok
test_encryption_roundtrip_and_no_plain_token ... ok
test_ids_and_cursor_validation ... ok
test_origins_normalize_equally_from_environment_and_direct_settings ... ok
test_origins_reject_credentials_controls_and_nonorigin_paths ... ok
test_receipt_sse_preserves_finite_fractional_usage ... ok
test_sse_wire_ids_json_and_no_worker_credentials ... ok
test_tampering_wrong_key_and_expiry_fail_closed ... ok
Ran 19 tests in 0.036s
OK
```

These are actual local cryptography/async boundary tests using explicitly injected transport/service fixtures, not a live Supabase call or a FastAPI route integration test. At that earlier checkpoint, three genuine HTTP tests were explicitly skipped because the framework dependencies were absent. That historical limitation is superseded by the current genuine five-test HTTP result below.

## Part 4 — integration contract and release gates

Factory: `create_app(service, settings, authenticator)`. Compose `SupabaseAuthenticator(settings, JsonTransport(...))` with the exact configured Supabase hostname allowlisted. Transport must disable redirects and return redacted TransportError status. Settings environment names: `MEND_MODE`, `MEND_PUBLIC_ORIGIN`, `MEND_ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MEND_SESSION_SEAL_KEY`, `NEBIUS_TOKEN_FACTORY_API_KEY`, `NEBIUS_TOKEN_FACTORY_URL`, `NEBIUS_MODEL_ID`, `NEBIUS_IAM_TOKEN`, `NEBIUS_PROJECT_ID`, `MEND_RUNNER_IMAGE_DIGEST`, `MEND_LIVE_ENABLED`. No values are included in this handoff. The session seal key must remain stable across replica/restart boundaries and be rotated deliberately.

The browser calls `POST /api/session` with JSON `{access_token}` (or empty JSON plus Bearer header) and an allowed Origin, retains returned csrf_token in memory, uses `credentials: include`, and sends X-CSRF-Token for mutations. Refresh or expired session requires a new exchange. Intended deployment is a same-origin HTTPS proxy; SameSite Strict will not support unrelated cross-site cookies simply because an Origin is CORS-allowed. All task endpoints require authenticated cookies. Start additionally requires Idempotency-Key and expected_version; task-store semantics provide atomic duplicate-start protection.

Remaining gates: test actual Supabase identity/session revocation; authorize reverse-proxy Origin/HTTPS forwarding; enforce per-principal edge rate limits and test slow/disconnected clients at deployment; confirm store ownership, event bounds, and persisted worker recovery; complete all provider feasibility gates before enabling live work. `/readyz` reflects configured release blockers only; it explicitly does not establish model/provider execution evidence. No actual authentication account, provider job, or paid deployment was created by this agent.

### Convergence fix — SSE monetary usage

`event_bytes` now uses finite ordinary JSON (`allow_nan=False`) after public allowlisting. It does not use canonical hash JSON, whose integer-only policy intentionally rejects floats. Real receipt usage such as cost 0.00125 and actual_cost 0.00075 now survives SSE serialization; NaN/infinity remain rejected. The earlier 19-test auth suite included this regression and completed in 0.036s with OK; the latest result is recorded below. Hash identity rules are unchanged.

### Read-only audit followed by authorized fixes — 12 October 2026

Before modifying code, temporary/stdout-only reproductions established: an event emitted at clock 102 despite expiry 101; JSON numeric literal 1e999 parsed as infinity; and a validated configured origin with trailing slash rejected the browser's slash-free Origin. Framework discovery independently confirmed FastAPI, Starlette and httpx unavailable. No files were changed during that audit.

After the coordinator authorized the fix pass, owned API/config modules were corrected. SSE rechecks expiry/disconnect immediately after awaiting the event and expiry again after serialization, suppresses abandoned-read cleanup errors, and closes the generator without cancelling task work. bounded_json applies a finite parse_float handler in addition to duplicate-key/NaN/Infinity rejection, preserving legitimate fractional costs. Frozen Settings canonicalizes public origin, Supabase origin and allowed origins for both direct construction and environment loading; host casing, default HTTPS port and terminal slash normalize identically, while credentials, paths, query values, fragments, controls and non-HTTPS origins fail. Allowlist checks remain exact and unrelated origins remain denied.

Six new core regressions cover numeric overflow, finite cost preservation, pending-wait expiry, serialization expiry, disconnect, and direct/environment origin normalization/rejection. All 19 scoped tests passed. Canonical evidence hashing still rejects floats; ordinary SSE JSON continues to permit finite monetary usage. No bootstrap, database, worker, frontend or provider integration was edited in this owned fix pass; their audit findings remain with their assigned owners.


## Pre-PC review and authorized correction — 13 October 2026

### Part 1 — isolated scope and dependencies

Canonical source is `Mend/backend`; the original `mend-backend` package was read initially but never modified in this correction pass. Owned changes are `mend/auth.py`, `mend/api.py`, `tests/test_auth.py`, `tests/test_http.py`, and this handoff. Existing TRD v1.2 and blueprint ownership/session/SSE rules are preserved. The Supabase skill was read, and current authoritative getUser documentation confirmed server-side identity verification remains the appropriate boundary. Context7 resolved the exact FastAPI library `/websites/fastapi_tiangolo` and returned current StreamingResponse, Request.is_disconnected and exception/middleware documentation before framework changes.

Read-only tests reproduced both defects before root authorized changes. A cookie issued at time 100 with expiry 160 was accepted when identity verification began at 159 and returned at 161. A genuine TestClient unexpected exception returned sanitized JSON but omitted Cache-Control, nosniff, Referrer-Policy, CSP and trusted-origin CORS because framework server-error handling wraps user middleware.

### Part 2 — complete fixes

After verifying the access token with the server, authenticate now checks the existing issued cookie expiry again. It never refreshes or reissues authorization implicitly. The regression covers returns at 159, 159.999, exactly 160 and 161, with one injected identity request per scenario and unchanged expiry 160 for successful pre-expiry cases.

Unexpected-error responses now explicitly carry the same four security/cache headers as normal middleware responses. Credentialed CORS is included only for an exact configured allowed Origin; untrusted and missing origins receive no CORS authorization. The error body remains generic and excludes injected private exception details. No wildcard, provider call or public credential was added.

### Part 3 — actual verification and review

The canonical virtual environment was restored by the coordinator. Actual installed libraries: FastAPI 0.143.0, Starlette 1.7.0 and HTTPX 0.28.1. These are genuine framework libraries with local injected authentication/storage fixtures, not substitute framework implementations and not live Supabase/Nebius calls.

```text
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -m unittest discover -s tests -p test_auth.py -v
Ran 20 tests in 0.039s
OK

PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -m unittest discover -s tests -p test_http.py -v
Ran 5 tests in 0.309s
OK
```

All five HTTP tests executed with zero skips. New genuine route tests confirm late verification returns 401 and unexpected errors preserve safe headers/CORS for trusted, untrusted and absent origins. Existing draft→contract→Start→local fixture repair→receipt→SSE, CSRF/wrong-origin/oversized prompt and numeric-overflow tests pass. The framework emitted its HTTPX TestClient deprecation warning; execution completed successfully without dependency changes by this agent.

### Part 4 — convergence and remaining gates

Shared interfaces and the issued-session contract are unchanged. No bootstrap, database, worker, frontend, provider adapter, original package, or deployment configuration was edited. Tests make no paid or database/provider network requests. Actual Supabase account/revocation behavior, independent remote termination, trusted report production, provider isolation, physical retention purge and public deployment remain separate release gates. Genuine local HTTP success is not evidence of those integrations or of a completed production Mend.
