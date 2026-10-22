# Frontend bridge handoff

## Part 1 — Context isolation and dependency mapping

Read governing BLUEPRINT and actual `mend/api.py`, `mend/auth.py`, `mend/config.py`, and `mend/service.py`. Owned deliverables are `web/mend-client.ts`, `web/README.md` and this handoff. Browser-only TypeScript with DOM standard APIs, no React/Next dependency, no live Site mutation. Existing Paper and Proof design remains untouched. Inputs are authenticated server session, approved task data and persisted SSE events. Outputs are typed client methods and cleanup-owned stream handles.

## Part 2 — Modular synthesis

Implemented all actual task/session/receipt/artifact API routes. Same-origin HTTPS fetch uses cookie credentials, CSRF mutation headers, explicit idempotency keys, no redirects, 15-second AbortController bounds and 1MB streamed response limits. Access token supplied directly to session exchange is not retained or persisted. Server chooses user identity; browser never sends owner/worker/provider identifiers. `propose(...,null)` requests the trusted curated template supported by the real service, with explicit review before Start.

EventSource authorizes an initial snapshot, uses cookie credentials, supports decimal-string initial replay and native Last-Event-ID reconnection, validates named persisted events, deduplicates IDs, and owns terminal/abort/error/session-expiry cleanup. Actual 12-state enum includes persisted draft/finalizing. Signed links must use HTTPS with 1–300-second expiry; local_test links are rejected by the download method rather than advertised as real downloads. `dispose` closes resources and forgets in-memory session/CSRF state.

## Part 3 — Review and actual verification

Review covered token storage/URL leakage, cross-origin requests, CSRF, response bounds, signal/timer lifecycle, automatic mutation retries, terminal stream closure and simulated evidence labeling. Found existing API/service prompt discrepancy (16KB/8KB), reported to root; bridge conservatively uses service's 8000-byte limit. No request cancellation is represented as remote job termination. Event SSE ID remains the authoritative string cursor even if a bigint JSON numeric field exceeds JavaScript safe precision.

Strict compilation actually passed:
```text
node .../typescript/bin/tsc --noEmit --strict --target ES2020 --module ES2020 --lib ES2020,DOM web/mend-client.ts
Exit code: 0
```

Compiled CommonJS in scratch and exercised actual exported code using injected fetch and EventSource boundary doubles. Actual output:
```text
PASS 1: Actual API routes, session exchange, CSRF, idempotency and 12 persisted states
PASS 2: Cookie SSE replay cursor, duplicate suppression and terminal cleanup
PASS 3: Bounded JSON response, non-HTTPS local link rejection and AbortSignal
PASS 4: Bounded stream errors and owned resource disposal
RESULT: 4 local browser-boundary scenarios passed; live browser/backend/provider integration not verified
```

## Part 4 — Pipeline convergence

Ready to import into a client component and wire existing Workbench controls without altering design tokens. Requires genuine same-origin proxy, HTTPS, Supabase-authenticated cookie session, backend worker and reviewed provider release evidence. The live static Site remains a simulated demonstration and was not connected to this bridge. Browser layout, hosted routing, live session/CORS/SSE and actual artifact download require end-to-end deployment verification. No fabricated evidence or provider success is claimed.


## Durable regression follow-up

Saved the actual four browser-boundary scenarios in `web/mend-client.test.cjs`. The dependency-free Node test compiles the source with existing `tsc` on PATH or `MEND_TSC_BIN`, uses a fresh temporary output directory and removes it on completion. No packages or providers are fetched. Root aligned the API route with the existing 8000-byte service/client prompt cap; README no longer presents that discrepancy as unresolved.

Command: `MEND_TSC_BIN=<existing-tsc-executable> node --test web/mend-client.test.cjs`

Actual saved-test output:
```text
✔ Actual API routes, session exchange, CSRF, idempotency and 12 persisted states (11.177863ms)
✔ Cookie SSE replay cursor, duplicate suppression and terminal cleanup (1.804562ms)
✔ Bounded JSON response, non-HTTPS local link rejection and AbortSignal (1.636768ms)
✔ Bounded stream errors, secure browser requirement and owned resource disposal (2.464341ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1854.926473
```

These are local injected boundary regressions, not live Site or provider verification. Source bridge behavior and existing UI remain unchanged.
