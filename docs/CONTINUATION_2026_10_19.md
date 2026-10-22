# Source recovery and offline improvements — 19 October 2026

This continuation uses the complete user-supplied `Mend_Local_Repository.zip`, SHA-256 `054cecc80f4fb77fac57db7b01adf509b7f47d472d70524eb7b5648e839e956b`. Earlier missing-source notes are historical. No live Nebius request, inference, job creation, cancellation experiment or database mutation was authorized or performed.

## What changed

- `backend/mend/termination.py` provides shared validation for a configured trusted reader's record. It requires an explicit affirmative termination assertion, the expected provider job ID, an independent-termination reference, timezone-aware ordering and terminal confirmation where required. Optional contradictory flags cannot be promoted to success.
- Runner observation, the offline timing probe and service finalization share this validation. Persisted proof retains its job and stop-time binding. Every previous dispatched attempt must have acceptable proof before another job or live receipt can be accepted. Cancellation completion, including error compensation and never-dispatched paths, checks this history.
- Nine focused offline regressions exercise negative assertions, wrong identities, timestamp contradictions, report acceptance, persisted replay and history/compensation bypasses. These use injected adapters, not provider clients.
- Three pointer-tilt integrations now call browser animation functions with their required window receiver. Real browser tests reproduced `Illegal invocation` before the fix.
- A shared reduced-motion preference hook preserves matching server/initial-client output and enables motion only after hydration and a known preference. No preference is inferred from unavailable server state.
- The case-preparation browser test now opens the existing Checks tab before selecting its reproduction command. An additional real-browser regression exercises workbench pointer motion.

## Fresh verification and limits

See [offline verification](OFFLINE_VERIFICATION_2026_10_19.md) for exact commands, outcomes and retained logs. No local test establishes provider authority, infrastructure stop, budget compliance, receipt signing or authenticated browser acceptance.

The full backend suite uses POSIX file ownership, private permission modes and executable CLI fixtures. Windows does not provide all of those semantics. The final unfiltered run discovered 266 tests: 244 passed, 7 skipped, 4 failed and 11 errored. The safety assertions were retained. An earlier run also exposed an intermittent accelerated-clock scheduling assertion at 59.4 versus 60 seconds; that passed in the final run and remains a timing-test reliability concern. A clean Linux run is required.

## Public repository and license

`https://github.com/saihaanmohammed120-cell/Mend` is public, with its existing MIT license visible in a signed-out Chrome session. Application source publication has not succeeded: the GitHub connector returned `403 Resource not accessible by integration`, and its installation list remains empty. The public repository currently contains only its license. No remote CI or full-source readback is claimed.

The publication package preserves that existing root license, with the original archive's contributor MIT notice retained under `licenses/`. Root GitHub Actions checks are prepared for the full-stack layout; their remote execution remains unverified. The nested historical backend workflows remain in the archive and are not automatically discovered as root workflows.

## Remaining work

1. Give the existing GitHub connector installation access to Mend; publish the prepared full-stack files with the connector and verify the tree, content and license by readback.
2. Execute the unmodified backend safety suite on Linux and review the accelerated-clock test's scheduler sensitivity. Confirm the authenticated workbench without enabling provider execution.
3. Follow [the recorded walkthrough plan](WALKTHROUGH.md). No recording or public video URL exists from this continuation.
4. Keep the live hold. A reviewed independent infrastructure observer, authority mapping and conservative measured timing are required before a separately authorized provider experiment.
