# Independent convergence review — 12 October 2026

## Part 1 — scope, continuity and evidence boundary

Inputs are BLUEPRINT.md, inherited TRD/Design Brief v1.2, the completed read-only audit, owner patches and scoped handoffs. The original architecture, Paper and Proof interface, frozen curated contract, three-repair/four-execution limits and strict evidence rules remain governing. Each defect was reported before the authorized correction pass; owners modified their assigned modules. This reviewer changed Auth/API only in its authorized fix pass and this review document during convergence. No provider, database, Docker or browser verification is inferred from local fixtures.

Reviewed boundaries: API/auth/config; core serialization and immutable artifacts; database dispatcher; inference/HTTPS; runner/supervisor; orchestration/SQLite; bootstrap/worker; and their shared cancellation, log, receipt and retention contracts. Latest source was declared stable by the coordinator; orchestration metadata handoff and final captured logs remain coordinator-owned.

## Part 2 — converged corrections

| Boundary | Correction observed | Remaining verification boundary |
|---|---|---|
| Session SSE | Expiry/disconnect are checked after pending log awaits; expiry is checked again after serialization. Abandoned reads and iterators close without cancelling the coding task. | Genuine FastAPI/Starlette streaming behavior remains unexecuted. |
| Request JSON | Overflowing numeric literals such as 1e999 fail finite parse_float validation; duplicates, NaN and Infinity fail. Finite fractional costs remain valid wire JSON. | Network body/proxy behavior needs genuine HTTP tests. |
| Origin configuration | Direct Settings and environment loading canonicalize host casing, default HTTPS port and terminal slash consistently; credentials, controls, paths and unrelated origins remain denied. | Same-origin HTTPS proxy and real cookie behavior must be tested. |
| Deadline authority | Independent service-only deadline_cancel commits due cancellation intent under task/attempt locks without first acquiring a busy execution lease. Cancellation requests precede ordinary lease-dependent reconciliation writes. | A cancel acknowledgment is not proof of remote infrastructure stop. |
| Due/pending/retention | Due records cover job, task and retention deadlines plus cancellation; tasks with no unresolved attempt use null attempt_id. Pending excludes unstarted drafts/ready proposals but includes stopping drafts. Start must fit its full 600-second task budget inside logical retention. | Database queries are structurally reviewed; PostgreSQL execution remains skipped. |
| Cancellation reasons | Service errors map to canonical reasons; bounded diagnostic_code normalizes to public code, and conflicting duplicate values fail. Repeated intent preserves the original reason/timestamp; known receipts are not rewritten to stopping. | Actual provider stop remains distinct from cancellation intent. |
| Repair and usage | reserve_repair owns the atomic fixing transition. Reserved token/cost spend precedes inference and is not refunded; actual usage remains separate, malformed completions retain usage evidence, and overage blocks success with finite reconciliation details. | Tokenizer upper bounds, real prices and a configured monetary cap need account measurements. |
| Public usage | Production api_retries normalizes to public api_retry_count; conflicting duplicate values fail. Source-path maps, actual usage and next_sequence survive safe projection. | No live receipt/account billing claim follows from projection tests. |
| Sequence semantics | next_sequence consistently means the next unallocated sequence; persisted events remain contiguous and replayable. | Actual PostgreSQL concurrent allocation/locking is unexecuted. |
| Logs and truncation | Incremental UTF-8 preserves split characters. A fixed system truncation marker persists once outside candidate output budget, with terminal events unaffected. provider_stream uses a safe enum and unattributed CLI output stays explicitly unattributed. | CLI history is bounded to 1000 lines; complete history and actual Docker stdout/stderr attribution are unverified. |
| Provider response schema | SDK job metadata, pagination, provisioning and terminal states are typed/bounded; normal Operation responses trigger read-only identity reconciliation rather than becoming invented job IDs. | SDK/document review is not account-level compatibility evidence. |
| Workload versus infrastructure stop | finishedAt now records workload completion only. Terminal job observation keeps termination_verified=false and provider_stopped_at=null by default. A separately reviewed async termination reader must supply exact job identity, independent proof reference and valid stop chronology. | No independent infrastructure termination reader is integrated. |
| Trusted report boundary | Async evidence readers are bounded; reader failures preserve known observations without manufacturing stop/pass. Supervisor and service require strict boolean complete/passed flags, integer counters/exit codes, exact commands/checks/identities, and valid chronology. The reproduced complete='yes' false positive is now rejected. | The trusted report producer/controller remains unwired; generated-process stdout is diagnostic only. |
| Crash/finalization | Reconciliation never creates duplicate work. Immutable artifacts can be reused only when canonical bytes match. Finalizing commits separately; persisted receipt/pass/event are atomic. Mutation leases stay fenced; an ambiguous committed result is recovered through authenticated receipt reads, not a stale mutation bypass. | Independent-process fixture job state is not durable provider recovery evidence. |
| Filesystem | SQLite requires a private owned regular file and safe parent; descriptor-scoped artifact paths reject symlinks, FIFOs and directory rebindings, publish immutably and clean up descriptors. Runtime cleanup closes every resource and is idempotent. | Docker/image execution under UID10001 is unavailable here. |

The reviewed corrections do not establish that the complete project is perfect or that live execution is release-ready.

## Part 3 — actual verification

Final captured coordinator log was read from docs/verification/python-unittest.txt:

```text
Ran 168 tests in 2.064s
OK (skipped=4)
Exit code: 0
164 passed; 4 explicitly skipped
```

Captured local rehearsal also completed with exit code 0.

Three skipped cases require genuine FastAPI/Starlette/httpx; one requires isolated PostgreSQL/psql. The final captured logs under docs/verification are authoritative; this replaces the earlier 166-test review checkpoint. This review does not silently convert a skipped test into a passing test.

Owned Auth/API regression run:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_auth.py -v
Ran 19 tests in 0.036s
OK
```

Independent stdout-only convergence exercises executed against current source:

```text
Cancelled draft: stopped; jobs=0; next_sequence=max+1
Task deadline without attempt: stopped; reason=task_timeout
Malformed complete string: needs_help; receipt=False
Production retry counter: canonical public api_retry_count=2
```

All associated assertions passed. Earlier independent disk artifact cancellation between final bundle and diff writes recovered from finalizing to passed with an explicitly local_test receipt; it does not verify real remote execution.

UID10001 verification was attempted honestly. Changing a temporary directory owner to 10001 failed with EINVAL before exercising project code; this runtime maps only UID/GID 0 (`0 0 1` in both namespace maps). The actual available UID created SQLite with mode 0600. Dockerfile user/chown settings look consistent, but UID10001 volume interoperability was not executed and remains a Docker gate.

## Part 4 — exact remaining gates

- **Live release remains blocked.** Bootstrap rejects live-enabled startup; report_reader and termination_reader are not wired to reviewed independent authorities. A flag cannot turn a test adapter into live evidence.
- **A terminal workload is not infrastructure termination.** The measured spike must establish what resource has stopped, its independently evidenced time, and cancellation-to-stop latency. The native 3600-second timeout and cancel-at-60 mechanics do not establish a strict 60-second bound.
- **No live account evidence exists here.** Nemotron model availability, actual inference, prices, queue/provisioning latency, job submission/cancellation, isolation, metadata/network restrictions, trusted protected checks, log delivery and total 600-second fit require real credentials and measured calls.
- **SQL, genuine HTTP and Docker remain unexecuted.** Run migrations/transaction races on isolated PostgreSQL, then authentic HTTP/cookie/CORS/SSE tests and container build/volume tests under UID10001. Local scoped tests do not substitute for these.
- **Logical retention is enforced; physical purge is not automated.** Expired task access and starts are blocked, and active retention expiry triggers stopping/reconciliation. A verified cleanup worker must remove actual Storage/disk bytes and metadata only after unresolved jobs are confirmed stopped. No physical 24-hour deletion claim is supported yet.
- **Local fixtures have explicit limits.** FixtureRunner job state is process-local, links are local_test identifiers rather than browser downloads, and no model-generated source is executed on the host by the local suite. These fixtures cannot establish independent-process remote recovery.
- **Shared diagnostics now project consistently.** Database diagnostic_code normalizes to public code, matching local diagnostics; conflicting duplicates fail rather than hiding provenance. This projection correction preserves canonical cancellation reasons and does not itself establish remote stop.
- **No public submission or backend deployment was performed by this review.** Existing Site audience and visual tokens remain unchanged; repository publication, judge access and the real execution demonstration require separate completion.

These boundaries preserve the existing master plan and the requirement that every passing receipt correspond to authenticated, complete evidence.
