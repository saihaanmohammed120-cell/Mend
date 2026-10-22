# Database handoff — Mend backend overlay

## Part 1: inputs, outputs and dependency map

Inputs: `docs/BLUEPRINT.md`, inherited `migrations/001_mend.sql`, governing TRD v1.2, `mend.domain.MendError`, trusted ownership and worker UUIDs. Outputs: `mend/repository.py`, `migrations/002_backend_rpc.sql`, `tests/test_repository.py`, and this handoff. Migration 001 received one confirmed defect correction during integration: cancellation of a reserved, never-dispatched attempt now permits null dispatch time **only** with resolved durable `never_dispatched` evidence. Previously its cancellation check required a dispatch even when no provider job existed. No other inherited 001 content changed. No PostgreSQL service, database credential or provider credential was available. No migration was executed or release gate enabled.

The dispatcher inherits 001's exact task state machine, one unresolved attempt per task, four executions/three repairs, owner max-two running tasks, frozen contract and protected-check identities, event sequence trigger, output cap, immutable attempt/receipt evidence and cancellation-before-success guards.

## Part 2: implemented integration

`SupabaseRepository(url,service_role_key,timeout=10,opener=None).call(action,payload)` sends a server-only authenticated POST to `/rest/v1/rpc/mend_command`. HTTPS origin only, redirects forbidden, 1MiB request/2MiB response limits, finite serialized request JSON, timeout at most 30s. No automatic network retry after an ambiguous committed transaction. Stable safe errors omit URL, provider body, SQL detail and secrets.

Migration 002 installs a single service-role command dispatcher. Task ownership checks precede owner operations; an unexpired matching `worker_id` fences worker operations. Task rows lock before attempt rows. Read replay persists and orders existing events; it does not synthesize SSE events ahead of commit. Network calls are outside the transaction.

Changes agreed with root:

- `start_task` additionally receives trusted `contract_sha256` and `protected_checks_sha256` computed from core canonical bytes. SQL validates format and persists them; SQL cannot independently reconstruct the protected file manifest and does not pretend jsonb text serialization equals Python canonical JSON.
- `output` includes `worker_id`. Internal `get_task` and `request_cancel` calls omit `user_id` only when a valid worker lease is supplied. Owner actions require `user_id`.
- `dispatch` returns `new_dispatch=true` only for the first durable dispatch intent. `false` means reconcile; never create another provider job. A transport timeout on first dispatch also means reconcile before create.
- `resolve_attempt` requires authoritative completion and provider-stop timestamps for known jobs. They must be ordered from dispatch through stop, no later than database now. Unknown jobs remain unresolved unless durable absence evidence establishes they were never created.
- `usage` should conservatively reserve maximum token/cost spend **before inference**, with no refund. The configured monetary ceiling must come from real prices and is not invented here. After a successful call, `usage` also accepts optional `actual_tokens`/`actual_cost` with `token_count=0,cost=0` to record actual provider-reported totals separately; actual totals may not exceed reservations. The service must additionally compare each call against its own reservation. Receipt copy must label reserved versus actual. Actual billing/provenance remains the inference/service responsibility.
- Receipt finalization requires an earlier committed `set_state(finalizing)`; `finalize` inserts receipt and the inherited trigger commits task `passed` and its receipt event atomically. Caller supplies top-level `bundle_storage_key`, `diff_storage_key`, `reproduction`, `bundle_verified_sha256`; authoritative row identity overrides receipt copies. The backend must actually verify immutable bundle bytes first.

Owner reads return `attempts` and `receipt`, remove worker lease tokens, and expose `live_verification=true` only for a successfully persisted production receipt. Test-store receipts never enter this database path.

## Part 3: security review and verified local output

Confirmed inherited permission defects corrected in **002**, preserving inherited guard intent:

1. Existing service-role direct table mutation grants and RPC helper grants could bypass the new dispatcher ownership/lease checks. Both are revoked.
2. Table-level UPDATE revocation alone would retain inherited column-level UPDATE grants. Every inherited column grant is explicitly revoked.
3. Authenticated direct SELECT on all task columns revealed `lease_owner`, the worker fencing token. Authenticated task SELECT is restricted to a column allowlist without lease columns; task view also removes them.

Only the service role has execute permission on `mend_command`; PUBLIC, anon and authenticated execution is revoked. All SECURITY DEFINER functions have empty search paths and fully qualified table/helper references. Service-role SELECT is retained for trusted observability; no browser write policy is added.

Actual local command:

```text
python3 -m unittest discover -s tests -p test_repository.py -v
Ran 10 tests in 0.012s
OK (skipped=1)
```

Nine tests **executed and passed**: exact RPC envelope and headers; unsafe URL/header config rejection; invalid action/nonfinite payload rejected before network; response bound and close; safe SQL error mapping without private detail; ambiguous transport failure never retried; malformed/nonobject JSON response rejection; dispatcher action/privilege structural coverage; inherited guard preservation. The tenth test was explicitly skipped: `No isolated PostgreSQL DSN/psql; migration execution pending.` Python compilation passed. These are real stdlib tests with injected transport responses, not proof that SQL compiles or provider endpoints work.

## Part 4: convergence and outstanding gates

Apply migrations 001 then 002 only to a fresh isolated Supabase-compatible development database using migration-owner credentials. Set `MEND_TEST_DATABASE_DSN` privately and run the same test command when `psql` is installed. The embedded transactional fixture rolls back all users/tasks/gate changes and covers ownership, idempotency, release block, worker lease fence, token exhaustion, cancel-before-success, event replay, table/column privilege removal. Synthetic fixture provider values are not production evidence.

Integration amendments: service-only `deadline_cancel` bypasses a currently held regular worker lease solely after a locked server-clock due/cancellation recheck, commits intent and returns the attempt for cancellation. `due` includes normalized `attempt_id`. This avoids postponing safety cancellation behind inference's lease. Provider report IDs are accepted as canonical `check_id`/`command_id` with legacy `id` support; conflicting identifiers are rejected rather than rewriting authenticated report bytes. Canonical commands need exit_code=0 and exact argv matching the frozen contract; status is checked for passed only if present, since the trusted supervisor uses command_id/argv/exit_code.

Additional PostgreSQL execution scenarios still required, beyond that embedded fixture:

- Two connections starting three tasks for one owner: only two active starts commit.
- Two workers race reserve/dispatch: exactly one reservation and one `new_dispatch=true`; timeout reconciliation never creates duplicate work.
- Expired lease holder cannot attach, resolve, output, reserve, finalize or change state; a new worker reconciles old dispatch.
- Four executions and three repairs accepted at most; repeated identical failures/evidence block a subsequent repair.
- UTF-8 output reaching 256000 bytes preserves whole code points and one truncation marker; terminal receipt/stop events survive log cap.
- Cancel and finalization race serializes under task lock: an earlier cancellation prevents receipt success; an already committed receipt remains immutable.
- Missing/duplicated/skipped checks or commands, wrong hashes/attempt/job/bundle, late provider stop, cross-task attempt and wrong artifact owner cannot produce receipt.
- Finalizing state is observed in its own committed transaction; finalization retry returns the same persisted receipt without rerunning code.
- `due` catches expired jobs, total-task deadlines and cancellations, including ambiguous dispatch; lease claim and provider reconciliation precede resolved status.

**Not verified:** SQL parsing/migration execution, real PostgREST exposure/role behavior, concurrent PostgreSQL locks, Supabase Storage policies/signing, live model availability, real Nebius job submission/cancellation, measured strict 60-second stop bound, and measured 600-second critical path. Live execution stays disabled by inherited release gate default. Successful local adapter tests do not remove these release gates.

## Read-only audit and authorized correction pass — 12 October 2026

The source audit ran before changes. It confirmed production cancellation reason mismatch (service fix owned by orchestration), retention Start/worker mismatch, weaker report identity checks, permissive response JSON, malformed port acceptance, missing spike cap documentation and missing Docker context exclusions.

Authorized database/config corrections:

- Repository success/error JSON now uses the shared strict parser; duplicate fields, nonfinite literals and overflowing finite-looking numbers are rejected. HTTPS origin validation rejects malformed/out-of-range/non-443 ports and whitespace/control characters.
- Start rejects a new run whose complete 600-second budget cannot fit remaining task retention. `due` includes retention-expired active tasks and deadline/cancellation work without an unresolved attempt. Null-attempt `deadline_cancel` commits task intent; caller claims a lease for `finish_stop`. Known jobs are prioritized before null-job cleanup in the bounded due list.
- Deadline cancellation preserves an existing cancellation reason and reports the chosen reason, including `retention_expired`. Worker mutation fences remain unchanged.
- SQL success requires boolean `complete=true`, `source=live`, and matching task/model/image identities in addition to original snapshot/contract/job/check/command evidence.
- `output` accepts only a trusted `stream=system,truncated=true` control marker. It atomically records the fixed backend-generated marker once, sets log_truncated, ignores caller text and does not consume the candidate stdout budget. Ordinary arbitrary system output remains denied.
- `request_cancel` accepts optional safe bounded diagnostic codes, records each once in an essential state event only while actually stopping, and ignores invalid diagnostic syntax so it cannot roll cancellation back. No free-form diagnostic text or secret is added.
- Existing finalization fencing was retained. After an ambiguous finalization response, reconciliation reads the receipt through an authenticated owner `get_task`/receipt path while retention remains valid; it must never bypass a stale mutation lease or create another receipt/job.
- `.dockerignore` excludes private environments, Git history, databases, keys, logs, artifacts/evidence and dependency caches from Docker build contexts. `.env.example` includes an empty, uninvented `MEND_TASK_COST_CAP`.

Actual scoped output after these changes:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_repository.py -v
Ran 13 tests in 0.003s
OK (skipped=1)
```

Twelve tests ran and passed; one PostgreSQL fixture remains skipped. The rollback-only fixture was extended with trusted marker deduplication and never-dispatched cancellation. SQL retention/deadline/report/marker assertions are structural checks, **not database execution proof**. Migration 001 was not changed during this correction pass. PostgreSQL execution/concurrency/provider stop evidence remain pending. The urllib repository timeout is a socket-operation timeout; an absolute end-to-end transport deadline is not established by these adapter tests.

### Provider log attribution followup

The Nebius CLI transport can merge Docker output streams. Optional `output.provider_stream` now accepts only `unattributed`, `stdout` or `stderr`, persists that attribution atomically in `logs.payload` for normal output and trusted truncation markers, and never accepts an arbitrary caller payload. The service must preserve `unattributed`; transport stdout alone must not be represented as proven Docker stdout. A private capped append helper centralizes byte/sequence logic, and the inherited owner-only four-argument wrapper delegates to it. Migration 001 remains unchanged in this followup.

Actual scoped output:

```text
Ran 14 tests in 0.005s
OK (skipped=1)
```

Thirteen tests executed and passed, including an adapter wire test and SQL allowlist/persistence structural checks. The rollback-only fixture now checks attribution on normal and marker events, but remains unexecuted without PostgreSQL. Real log attribution/delivery remains a measured integration gate.
