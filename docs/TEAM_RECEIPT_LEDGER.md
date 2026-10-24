# Team receipt ledger

This source adds explicit team sharing of already persisted, live, passed receipts.
No receipt is shared automatically. Empty teams return an empty page. Synthetic
fixture receipts are test data; no real repair, signing or provider result is claimed.

## Authorization and privacy

The backend supplies the actor from its verified sealed session. Body/query actor
claims and user-editable JWT metadata must never supply this identity. Every SQL
call checks current `mend_private.team_memberships` rows. Nonmembers, nonowners and
unknown receipts receive the existing indistinguishable unavailable response.
Only the actual task owner can share or withdraw a receipt, and that owner must
currently belong to the destination team.

Operators provision `mend_private.teams` and `mend_private.team_memberships` through
an independently authorized migration-owner workflow. There is no self-enrollment,
invite, roster-management or membership-mutation API. Those tables permit no
direct mutation by `anon`, `authenticated` or the service role. Identifiers are
immutable; operators remove membership with DELETE and provision a new membership
with INSERT when appropriate. Deleting a member immediately denies subsequent
reads and cascades deletion of that member's shared entries. Rejoining requires
explicit sharing again. Another member's removal does not withdraw the owner's
remaining shared entries. Deleting the receipt or its task removes its shares.

The public `mend_team_ledger(text,jsonb)` RPC is SECURITY INVOKER and executable
only by the service role. Its SECURITY DEFINER implementation remains in the
private schema, has an empty search path and denies client execution. The service
gets private-schema usage and execution of that one implementation, with no new
direct table or sequence rights. Existing private helpers remain revoked.

The summary has exactly these fields:

`receipt_id`, `task_id`, `source`, `status`, `contract_sha256`, `snapshot_sha256`,
`attempts`, `repair_count`, `duration_ms`, `created_at`, `shared_at`.

It excludes prompts, source, checks and command output, reports, raw evidence,
private artifact/storage paths, reproduction text, model/job identifiers and full
receipt JSON. Team sharing grants no task-detail or artifact-download permission.
Hashes identify persisted artifacts; they do not establish receipt signing.
The SQL projection and Python response validator enforce the same allowlist.
Malformed data or extra fields fail closed before the API can return them.

Existing task retention still applies: expired task receipts disappear from team
queries and cannot be newly shared. This feature adds no retention extension or
new purge path. Previously returned summaries cannot be recalled from a client;
membership revocation affects later reads rather than data already received.

## Backend integration

`TeamLedger(repository)` reuses `SupabaseRepository`'s bounded HTTPS transport,
redirect rejection, timeouts, private error messages and no-retry behavior.
`list_receipts(user_id, team_id, limit=20, cursor=None)` reads a current page.
`share(user_id, team_id, receipt_id)` and `unshare(...)` are idempotent and obey
`repository.read_only`. A write hold rejects both methods before transport.
The ledger never enables the provider release gate.

The API integration exposes:

- `GET /api/teams/{team_id}/receipts?limit=20&after=123` for summaries.
- `POST /api/teams/{team_id}/receipts` with exactly `{"receipt_id":"<uuid>"}`.
- `DELETE /api/teams/{team_id}/receipts/{receipt_id}` to withdraw a share.

The HTTP layer authenticates every route, checks CSRF/Origin for writes, enforces
the existing hosted database-write hold and rejects unknown fields. `after` maps
to the adapter's `cursor`. Queries use descending share identities, fetch at most
`limit + 1` rows and return `{ "receipts": [...], "next_cursor": "123" }` or a null
cursor at the end. Limits are integer 1–100, default 20. Cursors are canonical
positive signed-bigint strings of at most 19 digits, reauthorized on each call.
They are positions rather than permission tokens or consistent snapshot handles.
Unsharing, expiry and membership removal can shorten later pages; newer shares
appear on a fresh first page.

## Verification and deployment status

`backend/tests/test_team_ledger.py` contains offline transport, hold, validation,
safe-projection and SQL-boundary checks. These checks do not execute SQL.
Run from `backend`:

```powershell
python -m unittest discover -s tests -p test_team_ledger.py -v
```

`backend/tests/team_receipt_ledger_fixture.sql` is an actual rollback-only fixture
for the disposable CI PostgreSQL database named `mend_ci`. After all existing
migrations and the ledger SQL are applied to that disposable database, run:

```text
psql -X -v ON_ERROR_STOP=1 -f tests/team_receipt_ledger_fixture.sql
```

The fixture requires the synthetic Auth/Storage prerequisites used by the
existing PostgreSQL CI job. It builds synthetic receipts through intact guarded
task/attempt/finalization RPCs, with no trigger bypass. Its temporary release
setting exists only inside the rolled-back synthetic transaction and is restored
to false before ledger assertions. It tests nonmembership, receipt ownership,
unknown receipts, cross-team isolation, duplicate sharing, exact summaries,
pagination/cursor bounds, immutable shares, withdrawal, membership removal,
rejoining and client/service privilege boundaries. It performs no network calls.

The official CLI generated the local migration name
`backend/migrations/20261024110336_team_receipt_ledger.sql`; that file is the
authoritative SQL source. CLI metadata generation performs no database action.
Hosted migration application, operator team provisioning and hosted end-to-end
verification remain pending. Existing database and provider holds remain active.

The implementation follows current [Supabase database-function guidance](https://supabase.com/docs/guides/database/functions)
and [function execution revocation guidance](https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A).
