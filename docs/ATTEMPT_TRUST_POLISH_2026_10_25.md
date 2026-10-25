# Attempt observations, file permissions and trust signals

This polish adds exactly three features to existing pages. It does not enable provider execution or change authentication, execution or monetary-cap decisions. The owner explicitly approved the event-only addition after the granularity audit; both provider and hosted-database holds remain active.

## What changed

1. The existing attempt records and logs did not supply per-attempt outcomes through the public stream. A new source migration observes reservations and the first resolution, writing bounded identity/status/check summaries to the existing logs table. The local fixture store emits the same schema. `attempt_status` is deliberately separate from task `status`, so a passing attempt cannot close the browser stream before final task events. No endpoint, model-output schema, rationale generation or backfill is added. Reservation does not establish that execution started. Existing events remain append-only; history may be partial.
2. Contract editable/protected paths have open/closed Lucide locks and distinct quiet surfaces. They describe editing permissions, not an invented source diff. Existing unavailable-source disclosures stay intact.
3. A compact four-slot trust summary shows independent Pass, Fail or Not available states. The captured example's existing browser SHA-256 operation can establish only its own file consistency. It cannot certify an authenticated task, publisher identity or execution. The task view has no independently fetched artifact comparison, independent before/after protected-test comparison, public monetary cap, or independent stop-proof envelope, so those slots remain Not available. Contract locks, zero usage, cancellation requests and status timestamps do not become passing evidence.

Approach and why remain **Not recorded** because the existing model contract records neither. Checks come only from complete, unique identities matching the task contract. Inconsistent summaries are withheld. Fixture records remain explicitly non-live.

## View the features

- Public frontend: <https://mend-smasher.vercel.app/>. Open **Provenance** in the captured example, then **Check file hashes**. Before checking, all four slots are unavailable. A real successful comparison changes only File hashes to Pass; a mismatch changes it to Fail. Expand **What these signals establish** for limits.
- Authenticated task: `/tasks/<your-owned-task-UUID>`. The Agreement shows file locks; the Evidence panel shows task-scoped trust signals and the Attempt timeline. Existing tasks without the new observations show an honest empty timeline. There is no seeded production example or new route.
- Offline browser acceptance: from `frontend`, run `npm run test:browser` after installing the documented Playwright Chromium dependency. Tests in `e2e/workspace.spec.ts` explicitly intercept identity/task/SSE transport with `source: local_test`, `live_verification: false`. They show two synthetic observations solely to test presentation, at390/1440px in light/dark with keyboard and reduced motion. They do not authenticate a real account or call a provider.

## Exact source files

| File | Reason |
| --- | --- |
| `backend/mend/domain.py` | Allowlist attempt event identity and attempt-specific status. |
| `backend/mend/local_store.py` | Emit observation events from the existing offline store. |
| `backend/migrations/20261025055350_mend_attempt_events.sql` | Observe reservations/first outcomes in the existing PostgreSQL log stream; source only. |
| `backend/tests/test_attempt_events.py` | Actual fixture service failure/repair, ownership, replay and idempotency checks. |
| `backend/tests/test_repository.py` | Disposable rollback SQL assertions for trigger observations and duplicate resolution. |
| `backend/tests/test_service.py` | Keep provider-output attribution distinct from new system observations. |
| `frontend/lib/attempt-timeline.ts` | Validate and project explicit attempt observations. |
| `frontend/components/attempt-timeline.tsx` | Render recorded attempts, check identities, gaps and diagnostics. |
| `frontend/components/trust-badge.tsx` | Four scoped independent signals, with explicit missing-evidence reasons. |
| `frontend/components/workbench.tsx` | Wire timeline/trust and present existing file editing permissions. |
| `frontend/components/artifact-integrity-check.tsx` | Feed the actual captured-file hash result into its own trust slot. |
| `frontend/tests/attempt-timeline.test.ts` | Reject inferred attempts, wrong owners, duplicates and conflicting summaries. |
| `frontend/tests/trust-badge.test.ts` | Keep absent signals unavailable and captured-file results isolated. |
| `frontend/tests/component-initialization.test.ts` | Update the existing component isolation harness for imports. |
| `frontend/tests/hero-render.test.ts` | Exercise the real new badge through the existing render harness. |
| `frontend/e2e/workspace.spec.ts` | Browser fixture timeline/locks/trust, keyboard and containment checks. |
| `frontend/e2e/provenance.spec.ts` | Assert actual hash success/mismatch changes only the captured-file slot. |
| `frontend/DESIGN.md` | Record the retained visual direction, evidence boundaries and asset guidance. |
| This document | Scope, viewing instructions, changed-file inventory and limitations. |
| `PUBLICATION_MANIFEST.json` | Update publication fingerprints for these source changes; not execution evidence. |

## Verification and release limits

Local frontend commands `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npx playwright test --config playwright.local.config.ts` ran. Observed:122 unit tests passed;48 production Chrome cases passed; types/build succeeded; lint0errors with2inherited workstation warnings. The local browser adapter selects installed Chrome because the downloaded default browser is absent. It is not included in public source. New source introduces no dependency or animation.

Backend commands use Python3.12: `python -m compileall -q mend scripts tests`, `python -m unittest discover -s tests -v`, and `python scripts/verify_http_runtime.py`, from `backend`. The new2event tests pass. The broad Windows run is not a clean pass: existing POSIX file ownership/permissions and executable fixtures need Linux. An affected attribution assertion was corrected to distinguish system events from provider output. Exact final Linux results must be read from the Actions run for the release commit, never inferred from previous releases. The dedicated CI database is disposable, isolated and separately opted in; its SQL fixtures roll back.

The migration has **not been applied to the hosted database**. Applying it, producing real provider observations, verifying live auth/repair/stop timing, and supplying independent missing trust signals remain outside this held polish. Neither the browser fixtures nor a successful CI migration establish any of those. The old ChatGPT Site is separate from the Vercel frontend. No final video or hackathon submission is created by this patch.
