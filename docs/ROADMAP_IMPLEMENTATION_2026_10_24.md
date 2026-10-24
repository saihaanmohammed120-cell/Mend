# Six roadmap capabilities — implementation status, 24 October 2026

The website previously put all six cards under one “Not yet built” label. That no longer describes the available tools. Each card now states its own implementation boundary and links to the actual source/usage guide. This release does not claim all six are fully hosted products.

| Capability | Available implementation | Remaining boundary |
| --- | --- | --- |
| Whole-repo repair | [Repository case CLI](REPOSITORY_CASES.md) freezes bounded multi-directory Python source/protected tests and reviews exact cross-file candidate diffs. | No model repair, repository crawling, dependency execution, patch application or integration with the live CSV task engine. |
| Required CI/CD check | Backend/HTTP, browser/proxy, images, PostgreSQL and `roadmap_tools` workflow jobs; a concrete [required-check ruleset](../.github/mend-required-checks.json). | The ruleset is a versioned configuration, not an applied GitHub rule. The connector returns403 for branch protection and has no administration-write capability. |
| Policy-as-code approval | [Offline policy gate](APPROVAL_POLICY.md) authenticates comparison/history evidence, pins case/policy/source identities, and returns bounded review approval or human-review-required. | Unsigned review output grants no execution, apply or merge authority. Operator-controlled policies, expected identities and keys are essential; real production evidence is not established. |
| Team receipt ledger | [Team ledger](TEAM_RECEIPT_LEDGER.md) has membership/owner-authorized sharing and paginated safe summaries, service-only SQL, adapter and authenticated API routes. | No hosted migration or team membership provisioning occurred. Real hosting/authentication, concurrent/hosted acceptance and product UI remain pending. |
| Flaky-test detection | [Existing history gate](CHECK_HISTORY.md) checks authenticated matching-input runs and flags inconsistent results for review. | Production history completeness, automatic quarantine lifecycle and UI remain pending. Passing observations are not a guarantee of no flakiness. |
| IDE receipts | [VS Code extension](IDE_RECEIPTS.md) opens real exported receipts, validates structure and compares exact workspace source/check hashes. Node tests and an isolated real editor-host smoke exist. | Current curated two-file CSV contract only. No signature/runtime authentication, Marketplace/VSIX installation or general repository receipt support is claimed. |

## Concrete GitHub enforcement configuration

`.github/mend-required-checks.json` targets `refs/heads/main` and requires `backend`, `frontend`, `images`, `postgres` and `roadmap_tools` from GitHub Actions app15368. The app ID was read from actual check runs. No bypass actors are proposed. The schema was checked against [GitHub's ruleset API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset).

An administrator must inspect existing rules before applying this once, avoiding duplicate/conflicting rulesets. Using an administrator-authorized GitHub CLI session from the repository root:

```bash
gh api repos/saihaanmohammed120-cell/Mend/rulesets
gh api --method POST repos/saihaanmohammed120-cell/Mend/rulesets --input .github/mend-required-checks.json
gh api repos/saihaanmohammed120-cell/Mend/rules/branches/main
```

The POST is a real repository-setting mutation and requires Administration write permission. It was **not executed** by this delivery. Confirm all five check contexts exist on the selected commit first. Once enabled, test a deliberately failing change on a separate branch/PR and verify it cannot update main; a JSON file or green Actions run alone does not prove enforcement. Future work should use a tested branch/PR rather than untested direct pushes to protected main.

## Database boundary

The ledger migration filename was generated locally by `supabase migration new team_receipt_ledger`; the CLI metadata operation did not contact or modify the hosted project. SQL migration and authorization fixture execute only in the disposable `mend_ci` PostgreSQL job. The fixture creates synthetic receipts through the actual guarded lifecycle and rolls back; it does not run candidate code, produce a real live receipt or call a provider. Do not apply the hosted migration or enable writes until the existing database hold is explicitly lifted.

## Release status

Both existing holds remain. A Token Factory key alone does not complete real authentication, protected controller/independent stop infrastructure, raw evidence retention, strict timing feasibility, live receipt verification, the final public video or the final submission. Use the [release ledger](RELEASE_READINESS_2026_10_24.md) and exact-commit CI/evidence before making broader claims. Available local tooling and fixture-tested source are useful deliverables; they are not proof of a completed hosted repair loop.
