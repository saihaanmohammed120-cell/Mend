# Mend browser bridge

`mend-client.ts` implements the actual FastAPI routes in `mend/api.py`. This is a source module ready for integration into the existing frontend; the published static Site is not connected to this API. Paper and Proof tokens, layout, typography and motion are untouched. Next.js 14 remains the requested legacy baseline, with the governing support/release gate still open.

## Deployment boundary

Serve browser pages and `/api/*` under one HTTPS origin using a reverse proxy. Keep backend server cookies unchanged: Secure, HttpOnly session and readable CSRF cookie, both `__Host-` scoped. Backend `MEND_PUBLIC_ORIGIN`/allowed origins must exactly match that origin. Providers and service-role keys exist only on the backend. Never configure browser environment variables with provider credentials.

Initialize `new MendClient()` inside a browser/client component, not during server rendering. The module has no framework or package dependency. API calls use relative paths, same-origin credentials, no-store, redirect rejection and bounded JSON reads. Session and CSRF handling are memory-only. No credentials are written to localStorage, sessionStorage or URLs. A Supabase access token obtained through the existing sign-in flow is passed directly to `exchangeSession(accessToken)`; this bridge does not implement a fabricated login flow or retain that token.

## Actual route methods

| Method | Route | Body / additional header |
|---|---|---|
| `exchangeSession(token,options?)` | POST `/api/session` | `{access_token:token}` |
| `getSession(options?)` | GET `/api/session` | None |
| `logout(options?)` | DELETE `/api/session` | CSRF header |
| `create(prompt,key,options?)` | POST `/api/tasks` | `{prompt,runtime:'python'}`; CSRF and Idempotency-Key |
| `get(taskId,options?)` | GET `/api/tasks/{id}` | None |
| `propose(taskId,version,contract,options?)` | PATCH `/api/tasks/{id}/contract` | `{expected_version,contract}`; CSRF |
| `start(taskId,version,key,options?)` | POST `/api/tasks/{id}/start` | `{expected_version}`; CSRF and Idempotency-Key |
| `cancel(taskId,options?)` | POST `/api/tasks/{id}/cancel` | `{}`; CSRF |
| `receipt(taskId,options?)` | GET `/api/tasks/{id}/receipt` | None |
| `artifacts(taskId,options?)` | GET `/api/tasks/{id}/artifacts` | None |
| `watchTask(taskId,handlers,options?)` | GET `/api/tasks/{id}/events?after=N` | Cookie EventSource; no access-token query/header |

All fetch methods accept `{signal}`. Fetch and response bodies are aborted/cancelled on all exit paths, including invalid headers. Requests time out after 15 seconds without cancelling remote jobs: Stop explicitly calls `cancel`. Task creation never starts inference or execution. Call `propose(taskId,version,null)` to request the service's curated contract; present its returned commands/checks/limits for review, then explicit Start using the returned contract version. A supplied contract object is still server-validated against the trusted template. Preserve the same creation/Start idempotency key across a deliberate retry; automatic mutation retries are not implemented. Owner IDs are returned by the server and are never accepted in mutation payloads.

The API route, service and browser prompt cap is 8000 UTF-8 bytes. Contract mismatches, expired sessions, release blockers, receipt-unavailable and provider failures surface through `MendClientError(code,message,status)`, never as manufactured success.

## SSE lifecycle

`watchTask` checks session and authorizes an initial task snapshot before opening EventSource. An authorized task response includes `next_sequence`, the next unused event ID; latest committed ID is `next_sequence - 1`. A terminal snapshot still replays when the requested cursor is behind that ID. If the sequence is absent or exceeds JavaScript safe precision, replay remains open until its terminal event; no precision-based assumption skips it. Callbacks are `onTask`, `onEvent`, optional `onError` and `onConnection`. The returned handle supplies `close()` and `cursor()`. Retain cursor only as an event position; a fresh call can resume with `{after:handle.cursor()}`. Native EventSource supplies Last-Event-ID on its own reconnects. Decimal-string cursors use BigInt internally so PostgreSQL bigint IDs are not rounded. The authoritative SSE `id` stays a string; `data.sequence` should not be used as a browser numeric replay cursor.

Only named state/log/receipt/failed/stopped events are consumed. Duplicate or older IDs are ignored. Event identity, task ID and persisted state labels are validated. Native reconnect errors are bounded (three consecutive errors by default), session expiration closes the stream, and terminal events close it. An AbortSignal or handle.close cleans up source/timer/signal ownership. Consumer notifications cannot interrupt resource cleanup. The application cursor advances only after successful synchronous `onEvent` delivery; failed delivery closes the stream with its previous cursor intact. A changed server-reported account retires earlier account streams. Component unmount must call close; application shutdown/sign-out must call `dispose()`/`logout()`. Closing SSE does not cancel a remote job.

Persisted states are exactly draft, ready, writing, waiting_runner, running, fixing, finalizing, passed, needs_help, runner_unavailable, stopping, stopped. Draft/finalizing are not invented client labels. Render event/log strings as plain text, never innerHTML. Success printing must follow a stored receipt event and must honor `source`/`live_verification`; local_test receipts stay visibly local and must not be marketed as real provider evidence. A state alone never proves universal correctness.

`artifacts()` accepts only bounded-expiry HTTPS links returned by the authorized endpoint and rejects local_test schemes. Do not place these signed URLs in logs or analytics. Render a normal link with `rel='noreferrer'` and referrer policy `no-referrer`; request a fresh link when its short expiry elapses. Private object origin/key scope is checked by the server artifact adapter. The browser never accepts raw storage keys from users.

## Verification boundary

TypeScript strict compilation and the saved injected browser-boundary regressions in `mend-client.test.cjs` check this module locally. Run `node --test web/mend-client.test.cjs` from the project root with an existing `tsc` executable on PATH, or set `MEND_TSC_BIN` to its executable path. The test compiles into a fresh operating-system temporary directory and removes it after execution; no package installation, network access or checked-in build output is required. Node 20+ is required for built-in Fetch/Response and node:test. They do not prove a running FastAPI route, authenticated browser integration, CORS/proxy behavior, actual SSE backpressure or live artifacts. Those gates remain outstanding; no Site was modified by this bridge implementation.
