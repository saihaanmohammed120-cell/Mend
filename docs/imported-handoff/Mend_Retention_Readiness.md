# Mend retention readiness — 17 October 2026

## Delivered

A bounded, read-only retention inspector is implemented and verified against the real Supabase project. It identifies expired task records whose current database purge safeguards are satisfied and counts active-state, lease, unresolved-attempt and Storage-object blockers. It does not delete metadata or Storage objects, submit jobs, create receipts or enable live execution.

This completes the inspection stage. It does not complete the previously deferred physical purge worker. The existing SQL deletion helper remains protected and unexposed to browser roles; no new deletion entrypoint was added.

## How to run

From the backend, with the real server-side environment configured privately:

```bash
python scripts/inspect_retention.py --limit 20
```

The script accepts 1–100 as the limit. It exposes no --apply or --delete mode. It reads the existing private environment and outputs only aggregate counts; task IDs, owner IDs, prompts, storage paths and credentials are not printed. If configuration, transport or response validation fails, it returns a bounded error and performs no deletion. No browser feature or control was added.

## Database and code changes

- Applied migration 20261017161207_mend_retention_plan.
- Added public.mend_retention_plan(integer), a STABLE read-only function with fixed empty search_path. Execution is revoked from PUBLIC, anon and authenticated and granted only to service_role.
- Added an (expires_at,id) index to support the ordered, bounded expiry scan.
- The function samples at most limit+1 expired rows to determine has_more and returns at most limit. It checks the same conditions as the existing guarded purge helper.
- Added a fixed-endpoint retention_plan method to the existing database transport. Shared transport handling retains no retries, response limits, strict JSON validation and redacted error handling.
- Added a validating aggregate summarizer and the operator CLI.

Readiness is a snapshot. Neither an eligible count nor an earlier inspection authorizes or guarantees a later deletion. A real purge worker must coordinate Storage removal, reconcile unknown outcomes and recheck database safeguards at deletion time. A batch with has_more=true is not a complete inventory; there is no cursor/continuous-worker implementation in this change.

## Fresh verification

- Eight focused tests were written before implementation and observed failing because the feature was missing, then passed after implementation.
- Full backend suite: 249 tests run, 248 passed, one PostgreSQL fixture skipped, zero failures. The skip is tests/test_repository.py::DatabaseExecutionTests.test_transactional_database_fixture and was not counted as a pass. Real hosted acceptance below is separate evidence.
- Independent source review found no material issue; reviewer ran 21 local retention/repository tests. This review was not external-provider proof.
- The real CLI completed against Supabase and reported: checked_tasks=3, metadata_purge_guard_satisfied=3, blocked_tasks=0, has_more=false, deletion_performed=false, provider_execution=not_run.
- Real Supabase role/limit checks rejected 0, 101 and null limits; denied both anon and authenticated execution; allowed service_role; limit=2 returned two tasks and has_more=true.
- Catalog readback confirms STABLE volatility, constrained search_path and server-only execute grants.
- Counts remained 3 tasks, 4 logs, 0 attempts and 0 receipts. The live gate remains false.
- The security advisor still reports only the existing leaked-password-protection warning; this change introduced no reported function exposure issue. The paid feature was not enabled.

The first CLI attempt before migration returned database_unavailable without leaking error details; after the read-only RPC was applied, it completed successfully. A new scratch Python environment restored the declared framework/test dependencies for the full suite. No project dependency files were changed.

## Provider priority and remaining gates

The original highest-value milestone remains a genuine Nebius/Nemotron run with measured under-60-second job timing and independent cancel-to-stop evidence. A fresh redacted preflight, run with restored backend dependencies, remains blocked on the Token Factory key, IAM token, project/subnet/platform/preset, pricing provenance and cap, pinned spike image, explicit probe approval and Nebius CLI.

No paid model/job call was made. Configuration presence would still not count as authentication or execution proof. Trusted report integration and receipt signing remain incomplete. Supabase backups and paid leaked-password protection also remain open from the schema audit. Existing expired records were not removed and no cleanup schedule was created.

The next prerequisite for the technology milestone is secure provider configuration and a verified independent stop-evidence path. Physical deletion is a separate consequential action and was not inferred from a general request to continue improvements.

## Saved owners and evidence

- backend/mend/retention.py
- backend/mend/repository.py
- backend/scripts/inspect_retention.py
- backend/tests/test_retention.py
- backend/migrations/20261017161207_mend_retention_plan.sql
- backend/docs/verification/retention-live-inspection.json
- backend/docs/verification/retention-live-acceptance.json
- backend/docs/verification/retention-role-limit-probe.sql
- backend/docs/verification/retention-focused-tests.txt
- backend/docs/verification/retention-full-tests.txt
- backend/docs/verification/retention-provider-preflight.json

No deployment of the API or a continuous cleanup worker is claimed. The database read-only function is applied; the source and CLI are delivered for operator use.
