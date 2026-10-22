# Mend — automatic tooling follow-up

Date: 15 October 2026. This follow-up supersedes the ESLint 9 and ESM-warning follow-ups in the preceding migration snapshot. The application framework, source, tokens and motion specifications are unchanged by this slice.

## Applied changes

- `frontend/package.json`: pin ESLint 10.12.0 and declare `type: module`, matching the existing ESM configuration files.
- `frontend/package-lock.json`: regenerate through a normal npm install, followed by a successful clean npm ci. No force or legacy-peer-deps flags were used.
- Documentation/checkpoint/evidence: record the actual outcomes and remaining upstream/provider/browser blockers. No rules were disabled and no framework downgrade was applied.

**EVIDENCE S242 — exec_command / fresh registry metadata and Context7 resolve/query docs:** current Next config is 16.4.1 and the latest braces release is still 3.0.3. Next documentation explicitly describes ESLint 10 support while warning that some included plugins do not yet list it in their peer dependencies. The latest published React, JSX accessibility and import lint plugins still list peer ranges ending at ESLint 9. These metadata gaps remain; no declaration was rewritten to conceal them.

## Observed verification

**EVIDENCE S243 — exec_command:** `npm ci --no-audit --no-fund` exited 0 and `npm run lint` exited 0 with no lint diagnostics. Install output includes peer warnings for the React/import/accessibility plugins. Exact logs: `verification/eslint10-clean-install.txt` and `eslint10-lint.txt`. This is observed local behavior, not a guarantee for strict-peer package managers or a remote CI observation.

**EVIDENCE S245 — exec_command:**

| Command | Actual result | File |
| --- | --- | --- |
| npm test | 57 passed; 0 failed, cancelled, skipped or todo | verification/tooling-tests.txt |
| npm run typecheck | Exit 0, no diagnostics | verification/tooling-typecheck.txt |
| npm run build | Exit 0; ESM reparsing warning absent | verification/tooling-build.txt |
| npm run test:browser:list | 8 cases discovered, none executed | verification/tooling-browser-discovery.txt |
| npm audit --json | Exit 1; 5 high entries | verification/tooling-audit-current.json |
| npm audit --omit=dev --json | Exit 0; 0 reported advisories | verification/tooling-audit-production.json |

The host npm http-proxy warning persists. It is an inherited host configuration warning, not fixed by modifying application source. The prior ESLint 9 unsupported-version warning is removed by the version upgrade; peer declarations remain an explicit compatibility caveat.

## Remaining advisory

The affected dependency chain remains eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. The audit's five entries describe this development-tooling chain, not five independently demonstrated exploits. No patched braces release appeared in the current registry query. This follow-up does not claim the advisory is fixed and does not substitute an unreviewed fork/override or a vulnerable framework downgrade. Production-only audit results are limited to the current advisory database and do not certify overall security.

## Browser and provider boundaries

**EVIDENCE S244 — tool inventory and plugin-management searches for Playwright/browser:** no Playwright MCP or Chrome DevTools MCP tool is exposed; the searches did not surface a suitable browser automation plugin. Search is not an exhaustive directory. No unrelated plugin was installed, and no browser-control or authentication workaround was attempted. Browser rendering/animation/authenticated acceptance remain unverified. No public deployment occurred in this slice.

**EVIDENCE S246 — exec_command / existing phase1_preflight.py:** current local prerequisites return blocked. Token Factory and IAM credentials, project/subnet/platform/preset, pricing/provenance, spike image, cost cap, probe approval and Nebius CLI remain missing. The runner digest is absent. Literal redacted result is in `verification/tooling-provider-preflight.json`. Model discovery, inference and provisioning were not run; cancel-to-stop is null; no verified receipt was produced. These live capabilities remain unverified.

Current database behavior, public GitHub/remote CI state and submission recording were not inspected in this slice and remain unverified. Existing dated evidence remains historical.

## Resume order

Complete permitted browser acceptance when its required integration is available. Execute the genuine Nebius/Nemotron spike after private access and infrastructure settings are supplied, recording actual cancel-to-stop latency and inference/provisioning budgets before live release. Recheck upstream braces remediation and lint peer declarations before deployment. No additional UI expansion or runtime multi-agent feature was introduced.
