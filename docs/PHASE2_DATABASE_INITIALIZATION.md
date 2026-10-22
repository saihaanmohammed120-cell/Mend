# Phase 2 — Database and app initialization

Date: 2026-10-12

Historical Phase 2 snapshot. The application-write blocker below is superseded by [the frontend integration checkpoint](FRONTEND_INTEGRATION_CHECKPOINT.md): the real backend write succeeded and the persisted draft/event were independently observed through Supabase MCP. Browser/HTTP sign-in end-to-end and provider execution remain unverified.
Project: `uwkdrmdflzverflcfkgk`
API origin: `https://uwkdrmdflzverflcfkgk.supabase.co`

## Completed database work

- **EVIDENCE S65/S66 — Supabase MCP apply_migration:** initial Mend schema and backend RPC migrations returned `{"success":true}`. Existing Supabase Auth users own tasks; no unrelated users/projects tables were introduced.
- **Original error / fix:** PostgreSQL rejected unparenthesized CASE expressions in both task and attempt IF guards. Parentheses now protect their internal THEN tokens. The failed transaction rolled back before the corrected migration succeeded.
- **EVIDENCE S70 — Supabase MCP execute_sql:** all Mend tables have RLS; the artifact bucket is private; service_role can execute `mend_command`; anon/authenticated cannot; live execution is disabled.
- **EVIDENCE S72 — Supabase MCP execute_sql:** real rollback-only RPC write/read, idempotency, initial state event, owner RLS and cross-owner rejection succeeded. This used synthetic ownership rows only inside the rolled-back SQL transaction; it is database logic evidence, not app HTTP or provider evidence.
- **EVIDENCE S76 — Supabase MCP execute_sql:** zero probe users and probe tasks remained; the provider release gate remained false.
- **EVIDENCE S68/S73/S74/S75 — advisor, function inspection, migration, advisor:** the platform auto-RLS event-trigger helper had public browser execution grants. Those grants were revoked without changing its body or event-trigger behavior. The final security advisor returned `{"result":{"lints":[]}}`.

Literal database probe result:

```json
{"record_retention":"rolled_back","owner_rls_verified":true,"provider_execution":"skipped","cross_owner_rejected":true,"idempotency_verified":true,"rpc_write_read_verified":true,"initial_state_event_verified":true}
```

## Local application initialization

`backend/.env` contains the correct origin, database-only mode and disabled live flag. This private file is ignored by Git and excluded from deliverables. No server credential was invented.

Changed implementation:

- `backend/migrations/001_mend.sql`: corrected both CASE guards.
- `backend/migrations/002_backend_rpc.sql`: includes the auto-RLS helper privilege hardening for fresh-project reproduction. The live project records that follow-up as a separate migration.
- `backend/mend/config.py`, `bootstrap.py`: explicit database-only mode and standalone real repository construction.
- `backend/mend/worker.py`: blocks provider worker execution in database-only mode.
- `backend/scripts/verify_app_database.py`: actual TaskService-to-SupabaseRepository draft create/read/idempotency/event probe, with safe credential-free error output.
- `backend/tests/test_database_initialization.py`: provider-construction, missing-credential, Start and worker regression checks.

## Remaining blocker and exact next command

The local application write remains **unverified**. Its attempted probe returned:

```json
{"status":"BLOCKED","code":"configuration","database_write_verified":false}
```

Securely inject `SUPABASE_SERVICE_ROLE_KEY` into the server environment or ignored `backend/.env`. Do not expose it in browser code, source control, receipts or chat. Use an existing authorized Supabase Auth user UUID; do not substitute an arbitrary fixture owner. Browser API startup also requires `MEND_PUBLIC_ORIGIN`, `MEND_ALLOWED_ORIGINS` and a private session seal key.

From the backend directory, load private configuration and run:

```bash
set -a
. ./.env
set +a
python3 scripts/verify_app_database.py --user-id "$MEND_VERIFY_OWNER_ID"
```

Set `MEND_VERIFY_OWNER_ID` privately to the authorized Auth user before this command. The probe retains a draft task for independent inspection; no code is generated, no job is submitted and no success receipt is fabricated. After success, verify the returned task ID and initial log row independently through Supabase MCP.

## Actual local checks

- **EVIDENCE S69 — shell:** database-initialization regressions: 5 passed; existing genuine HTTP tests: 3 passed, zero skips. HTTP checks retain local backing services and are not real-database app evidence.
- **EVIDENCE S77 — shell:** bootstrap tests: 11 passed. Repository suite: 14 run, 13 passed, 1 skipped because the separate isolated psql DSN is absent. The skipped fixture is not a pass and is not replaced by the narrower MCP probe.

Nebius spike remains skipped as requested. End-to-end repair, application database write, live receipt, deployed API and UI visual correctness remain unverified.
