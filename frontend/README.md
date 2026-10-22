# Mend workbench and public sample

20 October 2026: compact workspace routes, local HTTPS setup and production browser verification are delivered. Fresh results are 100 unit tests and 28 browser cases, plus typecheck/lint/build. Workspace API replies in browser tests are isolated fixtures; real account/provider acceptance remains open. See [current delivery and limits](../docs/CONTINUATION_2026_10_20.md). The browser command now builds and serves production before testing; its workspace transport fixture blocks external APIs and does not establish real TLS or authentication.

Current continuation, 19 October 2026: 98 unit tests, typecheck, lint, production build and 24 local Chrome browser cases pass. Pointer animation callback binding and reduced-motion hydration/preference updates are fixed. This supersedes older unexecuted-browser notes below for the local public/sample scope only. Authenticated backend/provider workflows and real clipboard permission remain unverified. See [fresh evidence and limits](../docs/OFFLINE_VERIFICATION_2026_10_19.md).

Next.js 16.4.1 / React 19.3.1 source for the Main Workbench and Task Card, using Tailwind CSS 4.3.3, Framer Motion, Lucide icons, native EventSource sample playback, and a printable JSON sample receipt.

## Run

Node.js 22.13 or later and the declared npm dependencies are required. Use `npm ci` for the checked-in lockfile. Next.js generates async route types; after a clean checkout, run `npx next typegen` before the standalone typecheck.

```bash
npm ci
npm run dev
```

Open http://localhost:3000/sample for the demonstration. Its repair preview uses bundled Python source, named checks and an explicitly illustrative receipt. Pause/play, manual stepping and the JSON source/test bundle do not call providers or the database. Reduced-motion preference starts the preview paused. The lower **Play sample run** control plays a fixed SSE fixture; editing its prompt does not execute that prompt. **Stop sample** closes playback only.

The authenticated workbench requires same-origin HTTPS, including in local development. Start it with:

```bash
npm run dev:https -- --hostname localhost
```

Open `https://localhost:3000/sign-in`. Next.js creates a local development certificate using mkcert and may request permission to trust its local certificate authority. For an existing certificate, pass `--experimental-https-key /path/to/localhost-key.pem --experimental-https-cert /path/to/localhost.pem` instead. Keep certificate keys out of source control. Production uses the hosting platform's HTTPS certificate; do not disable the client's HTTPS check.

Configure the server-only `MEND_BACKEND_URL` in `.env.local` to the running FastAPI origin (loopback HTTP is accepted for this server-to-server hop). The browser continues to call the same-origin `/api/` proxy over HTTPS; it must never receive service-role or provider keys. Use public Supabase browser Auth settings from `.env.example` only. Backend private settings belong to its separate environment.

Sign-in requires an existing Mend account; there is no public account-registration workflow. `/sign-in` opens the compact workspace and `/tasks/<task-id>` opens its compact owner-authorized task view. These routes retain the session/draft checks and do not enable live execution. An unavailable API or disabled execution gate remains visible.

The root route `/` remains the authenticated developer workbench. `/fix` remains the bug-intake preparation screen. Preparing a route locally does not make the existing ChatGPT-protected hosted Site public.

```bash
npx next typegen
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## Safe integration boundary

The `/sample` route is **demo-only**. `NEXT_PUBLIC_MEND_API_URL` does not enable live execution. The old automatic live switch has been removed because its API request, response, authentication and SSE contracts differ from the audited backend.

The maintained application bridge is `lib/mend-client.ts`, with the controller in `lib/use-workbench.ts` and the protected interface in `components/workbench.tsx`. It implements session/CSRF handling, contract review and guarded start, event mapping and receipt/artifact retrieval boundaries. Actual authenticated browser acceptance and real provider execution remain unverified. A configured URL alone cannot bypass the backend live feasibility gate.

Native EventSource supplies no arbitrary authorization headers. The audited bridge uses same-origin cookie authentication and validated CSRF for mutations; provider secrets remain server-side. This sample adapter is not an alternative backend implementation.

## Paper and Proof

Warm paper canvas `#F5F2EA`; white panels/code/receipt; ink `#18201B`; orange `#FF5B23`. Main panels have a 2px ink border, 20px corners, and `8px 8px 0px #18201B` shadows. Primary actions retain `4px 4px 0px #18201B`. Decorative canvas noise is static at 5% and cannot intercept input. Focus has a 3px ink outline separated by a 3px gap.

The 100/10 entrance spring and receipt spring remain shared. Pointer tilt is an imperative rAF controller with cached stable-wrapper bounds, a ±3° clamp, smoothed targets and the shared 100/10 spring return. Pointer movement never sets React state. Focus, drag selection, coarse pointers, reduced motion, scroll/resize and teardown flatten the surface. No CSS transform transition fights the rAF write. The hard shadow remains fixed rather than animating independently.

## Current scope and limits

The sample supports labeled playback, a continuous numbered before/after code view, a bundled regression suite, a JSON sample bundle, visible illustrative check names, bounded SSE logs and a labeled sample receipt. The root workbench has separate authenticated integration code. Generic bug fixing, repository history and actual provider execution are not established by this demonstration.

## Browser acceptance suite

`e2e/sample.spec.ts` and `playwright.config.ts` target a fresh local application at a fixed loopback origin, using synthetic sample data. They do not inspect or sign in to the protected ChatGPT-hosted Site. Run `npm run test:browser:list` to discover tests without starting a browser. In an environment where browser QA is permitted and Chromium is installed, `npm run test:browser` runs the suite and starts its own local server. `npm run test:browser:report` opens the generated report. The suite covers sample disclosure, line numbering, phase stepping, bundle download, tokens/focus, mobile containment and unexpected private/provider requests.

The current managed Sites environment does not expose its required `control-browser` skill. Browser execution and visual acceptance are therefore unverified here. No browser binary was installed and no preview server was started for this preparation. Test discovery, unit checks and production compilation are separate from an executed browser suite.

The 60-second job lifetime is a live release requirement, not verified by this sample. Provider job timeout has a one-hour minimum; a backend deadline worker must call cancellation and Phase 1 must measure actual stop latency. Nemotron 3 inference latency, provisioning latency, the total 10-minute task budget and the cancellation bound remain live feasibility gates.

Local TypeScript, controller and protocol tests are evidence of source-level behavior only. They do not certify browser animation, mobile rendering, screen-reader conformance, FastAPI HTTP integration, PostgreSQL, provider execution or database persistence. Current evidence and unresolved gates are recorded in `../docs/PUBLIC_SAMPLE_CHECKPOINT.md` and the project resume checkpoint.

## Framework migration and remaining release gates — 15 October 2026

The implementation has migrated from the historical Next.js 14 / React 18 / Tailwind 3 baseline to Next.js 16.4.1 / React 19.3.1 / Tailwind 4.3.3. Async route parameters are awaited, the ESLint CLI uses flat configuration, and Tailwind uses its dedicated PostCSS plugin. The original PRD/TRD remain historical baselines; this implementation deviation and actual verification are recorded in `../docs/FRAMEWORK_SECURITY_MIGRATION.md`.

The current production-dependency audit reports no known advisories. The all-dependency audit still reports five high-severity entries through the development-only Next ESLint plugin → fast-glob → micromatch → braces chain. These are dependency entries, not five demonstrated exploits. The registry currently offers no patched braces release; no unsupported framework downgrade, forced fix, advisory suppression or unreviewed package override was used. ESLint is now pinned to 10.12.0. Normal clean npm installation and lint passed, with upstream plugin peer warnings retained; strict-peer package-manager compatibility remains an open caveat. Explicit ESM package configuration removes the prior config-reparsing build warning. Current follow-up logs and limits are recorded in `../docs/TOOLING_FOLLOWUP.md`.

Source/build checks do not establish browser rendering or security clearance. Public deployment remains gated on real browser acceptance and review of residual tooling exposure. Tailwind 4 requires modern browsers: Safari 16.4+, Chrome 111+, Firefox 128+. Paper and Proof tokens and the shared motion settings remain the design contract.

## Hero review — 15 October 2026

The root workbench now leads with the shared `ProofHero`: one primary CTA, self-hosted Fraunces/Archivo/Plex, scoped light/dark tokens and actual-controller evidence. The new hero never falls back to the simulated `/sample` run. A missing or rejected receipt stays unissued. Commit identity and receipt signing stay explicitly unavailable. See `../docs/HERO_REVIEW.md` for the requested capability gaps and verification limits. The 390px Playwright cases are prepared but browser execution remains unverified.
