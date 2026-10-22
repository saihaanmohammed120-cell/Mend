# Mend full-stack readiness — 17 October 2026

Implemented an actual database handshake and separate connection states in the canonical Next.js workbench. This removes a misleading gap: configuration flags alone previously determined runtime readiness. No winning percentage is measured or promised by this work.

## Changes

- Backend `/readyz` now calls the fixed, read-only Supabase RPC in database/live modes. It separates database observation from release permission and returns HTTP 503 when either the configuration or database gate blocks execution. Local-test mode reports the database as not checked.
- Applied migration `20261017163137_mend_runtime_probe`. The function is STABLE, SECURITY DEFINER, uses an empty search path, and permits execution only by `service_role`. It returns schema version and two release-gate facts; it does not expose task records or change data.
- The probe has a ten-second caller deadline and one transport slot per repository. urllib's socket timeout alone does not bound the entire response. A timed-out/cancelled caller keeps that slot occupied until its underlying request ends, preventing repeated status requests from accumulating blocking probe threads.
- The Next proxy has a twelve-second timeout, an 8 KiB streaming response limit and explicit field reconstruction, including nested database fields. A bare ready flag or contradictory/missing evidence cannot enable Start.
- The connection panel shows App API, Database and Execution separately, includes an observation timestamp and provides Recheck connections. Failed explicit and pre-start checks clear previous readiness. Connection observations are not repair results.

## Fresh validation

| Evidence | Result |
| --- | --- |
| Backend complete suite | 257 run: 256 passed, one isolated PostgreSQL fixture skipped, zero failures |
| Frontend complete suite | 98 passed, zero failures |
| Production build / TypeScript / ESLint | Passed |
| Scoped independent review | Three findings corrected; eight backend and sixteen frontend focused tests passed; no remaining material finding |
| Actual database readback | Browser roles cannot execute probe; service role can; gate present and disabled; STABLE and empty search path confirmed |
| Actual local production Next → Uvicorn → real Supabase | Passed; backend 503 correctly blocked, frontend 200 with `api_status=reachable`, database verified and execution disabled |

The initial three-second probe budget failed closed on this environment's latency. A diagnostic request succeeded after 7.84 seconds; after adjusting the caller budget to ten seconds, the complete real chain succeeded. Readiness timestamps in the chain evidence are `2026-10-17T16:35:40.970545+00:00` and `2026-10-17T16:35:47.102276+00:00`.

Review found and fixed nested-field forwarding, stale ready state after a failed pre-start fetch, and the absence of a total probe deadline. Regression cases for the first two were observed failing before correction. Slow-transport and caller-cancellation cases verify deadline and slot behavior.

No task or artifact was changed: database counts remain three tasks, four logs, zero attempts and zero receipts. The live gate remains false.

## Delivery limits and next priority

This is canonical full-stack source plus an applied database migration. The existing public static landing page was not republished; the new panel has SSR/controller coverage but no actual browser acceptance. The production server processes used in the integration check were local, loopback-only and stopped afterward. A public API deployment, genuine provider repair execution, independent stop timing and signed live receipt remain unverified.

The next meaningful competition milestone is a genuine Nemotron/Nebius repair run with a recorded failing check, bounded repair, final protected-check result and measured stop evidence. Provider credentials, resource/image configuration, pricing provenance and the independent stop/report integration remain release prerequisites from the previous preflight. Connection success alone does not satisfy them.

Evidence: `backend/docs/verification/runtime-final-backend.txt`, `runtime-readiness-tests.txt`, `runtime-live-chain.json`, `runtime-supabase.json`; `docs/verification/runtime-full-frontend.txt`, `runtime-build.txt`, `runtime-typecheck.txt`, `runtime-lint.txt`. Reproduce the chain with `python scripts/verify_readiness_chain.py --output docs/verification/runtime-live-chain.json` from the backend after a frontend production build and private environment setup. The script calls only read-only endpoints.
