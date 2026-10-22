# Mend — framework migration and bounded verification

Date: 15 October 2026. Initial implementation overlay; original PRD/TRD/UI brief remain historical baselines.

Later same-day tooling changes supersede the ESLint 9 and ESM-warning status below: see [automatic tooling follow-up](TOOLING_FOLLOWUP.md). The initial command outputs below remain dated evidence.

## Result

The frontend now installs Next.js 16.4.1, React/React DOM 19.3.1, React type packages 19.3.0, Tailwind CSS and its PostCSS plugin 4.3.3, and direct PostCSS 8.5.30. Node >=22.13.0 is declared; verification used Node 24.19.0. The existing motion library remains installed with compatible React peers. This migration does not establish a live provider product or a public deployment.

## Why the baseline changed

**EVIDENCE S241 — exec_command / npm audit --json and npm metadata:** the before audit reported 12 vulnerable dependency entries: 1 critical, 9 high and 2 moderate. The Next.js 14 implementation had no supported patched release path within its baseline. The implementation therefore moves to the supported major rather than applying a forced downgrade or masking advisories. Context7 resolve-library-id followed by query-docs was used for Next.js before implementation edits. React documentation was queried for the effect/hydration compatibility work.

Primary references consulted: [Next.js support policy](https://nextjs.org/support-policy), [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16), [Next ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint), and [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

## Applied compatibility changes

- Await Promise route parameters in the same-origin API catchall and task page. Existing proxy authentication, CSRF, route/method allowlist, no-store behavior and UUID validation remain in place.
- Replace removed `next lint` with the ESLint CLI and flat Next core-web-vitals/TypeScript configuration. No rules were disabled. Internal sample navigation uses Next Link; a test-harness local `module` variable was renamed without changing the VM property.
- Use Tailwind's dedicated PostCSS plugin, CSS import and explicit TypeScript config. Preserve legacy border/placeholder/cursor defaults and migrate four small-radius utility sites to the equivalent v4 utility.
- Preserve the literal custom palette, fonts, hard shadows, panel radius, static canvas noise and focus geometry. Direct installed-v4 compilation verified generated CSS declarations; visual rendering remains unverified.
- Remove synchronous state-setting effects. Preview autoplay derives from hydration and motion preference until explicit user controls take over. Workbench draft hydration uses an empty server snapshot and a bounded browser storage snapshot; handlers persist explicit edits, avoiding a restore/write race. Storage denial remains nonfatal; oversized drafts are not restored/persisted.
- Accept Next-generated automatic JSX runtime and development type include changes in tsconfig. Keep image optimization and production browser source maps disabled.
- Repair the missing local Python environment launcher using the existing interpreter and environment. No backend application source, database schema or provider release gate was changed.

## Actual verification in this continuation

**EVIDENCE S237 — exec_command / captured command run:**

| Command | Observed result | Evidence file |
| --- | --- | --- |
| `npm test` | 57 tests passed; 0 failed, cancelled, skipped or todo | `verification/frontend-tests.txt` |
| `npm run lint` | Exit 0, no ESLint diagnostics | `verification/frontend-lint.txt` |
| `npm run typecheck` | Exit 0, no TypeScript diagnostics | `verification/frontend-typecheck.txt` |
| `npm run build` | Exit 0; Next 16 Turbopack production compilation and route generation | `verification/frontend-build.txt` |
| `npm run test:browser:list` | 8 cases discovered; browser execution NOT performed | `verification/browser-test-discovery.txt` |
| existing backend environment `python -m pip check` | `No broken requirements found.` | Tool output; environment check only |

A clean `next typegen` invocation generated route types before standalone typechecking. The route migration reproduction originally failed three cases; its fixed focused suite passed. Component initialization regressions reproduced effect updates and pause/draft issues before the fix. The final suite includes these regressions. Component tests execute real component bodies with isolated hook/storage dependencies; they are not a real React/browser renderer or authenticated end-to-end test.

**EVIDENCE S239 — agent exec_command / direct installed-v4 PostCSS compilation:** TypeScript config loads; panel declarations are 20px radius, 2px ink border, white surface and 8px 8px 0px ink shadow. Button shadow is 4px 4px 0px ink. Focus declarations are solid 3px ink outline, 3px offset and 3px paper ring. Palette, fonts, static noise opacity and legacy small-radius value are preserved. This is compiled-CSS evidence only. Motion constants and pointer controller were not rewritten by this migration.

## Dependency audit limits

**EVIDENCE S233/S235 — exec_command / npm audit JSON:**

| Scope | Before | After |
| --- | --- | --- |
| All dependencies | 12 entries: 1 critical / 9 high / 2 moderate | 5 high; no critical or moderate entries |
| Production dependencies after migration | Not independently measured before migration | 0 reported advisories; audit exit 0 |

The remaining all-dependency findings are `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. These are five affected entries in one development-tooling chain, not five demonstrated exploits. The registry metadata queried this continuation reports braces 3.0.3 as latest; the advisory affects <=3.0.3. No patched upstream braces release was available from that metadata. The npm-suggested downgrade to eslint-config-next 14.2.35 was deliberately not applied because it would mix an obsolete lint baseline into this supported-major migration. No advisory suppression or forced/unreviewed override was applied.

Raw reports: `verification/framework-audit-before.json`, `framework-audit-after.json`, `framework-audit-production.json`. These are point-in-time registry advisory results, not a general security guarantee. The initial ESLint 9.39.5 installation emitted an unsupported-version warning. The later tooling follow-up upgrades to ESLint 10.12.0 and records successful clean install/lint with upstream plugin peer warnings; strict-peer compatibility remains an open caveat. Nonfatal build output includes TypeScript-config ESM reparsing and the host npm proxy configuration warning. Neither was hidden or counted as an application failure.

## Live execution and browser limits

**EVIDENCE S238 — exec_command / phase1_preflight.py:** the redacted local prerequisite check returned exit 2 and `status: blocked`. Missing items are Token Factory API key, Nebius IAM token, cloud project/subnet/platform/preset, pricing provenance/input/output prices, spike image, task cost cap and approved spike probe. The runner digest is absent and the Nebius CLI is not present. Model discovery, inference and job provisioning were not run; cancel-to-stop is null and no verified fix receipt was produced. Literal redacted result: `verification/framework-phase1-preflight.json`.

Browser appearance, reduced-motion rendering, hover smoothness, downloads in a real browser, authenticated application acceptance, current database behavior, real provider execution, public GitHub/CI state and walkthrough recording remain unverified in this continuation. No Playwright MCP or Chrome DevTools MCP is exposed. The managed Sites environment's required browser-control skill is unavailable; no alternate browser path, preview server or browser installation was used. No public deployment or protected-site authentication was attempted.

Tailwind 4's documented minimum browser versions are Safari 16.4, Chrome 111 and Firefox 128. This changes the implementation's browser floor and requires acceptance on the intended judging devices. The existing Paper and Proof contrast table and motion specifications were not edited.

## Remaining order

1. Run the prepared browser suite and inspect actual artifacts in a permitted environment; retain honest sample labels and verify the authenticated contract path separately.
2. Resolve private provider access/infrastructure prerequisites, then run the existing real Nebius/Nemotron spike. Measure inference and provisioning latency plus cancellation request-to-infrastructure-stop latency; test the total task budget rather than asserting it fits. Keep live execution disabled until the release evidence supports it.
3. Review residual development-tooling exposure and review the upstream peer declarations retained by the subsequent ESLint 10 migration. Recheck the registry for the unpatched braces advisory before release.
4. Verify the actual public repository/MIT license and submission walkthrough through appropriate live evidence. Report authority, history APIs, full contract-review expansion and physical purge work remain behind genuine execution evidence.

No UI expansion or new multi-agent runtime claims are introduced by this migration.
