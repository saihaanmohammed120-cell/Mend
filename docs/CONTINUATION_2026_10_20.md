# Public access, compact workspaces and timing repair — 20 October 2026

The user authorized agent work on Mend and explicitly approved making the hosted Site public. Live Nebius execution remains on hold. No database mutation, provider request, resource provisioning or signing operation was performed.

## Delivered behavior

- The existing Site is public. A fresh signed-out Chrome session returns HTTP 200, with no browser errors or horizontal overflow at desktop/mobile widths. This is the static landing and captured local example, separate from the full-stack application.
- Static Site version 19 is deployed from `057941d4f506ffe0ef44d371d1c245abbf96253a`. Its leading budget now says `60s / job required` and `Stop latency unverified`. Existing captured source identity, evidence labels and unsigned provenance remain intact.
- In the full-stack source, `/sign-in` and `/tasks/<id>` use a compact workspace view. The landing header has an Open workspace link. Sign-in exposes the credential fields without the marketing/evidence tour; signed-in workspaces restore the saved draft. Task views retain the existing controller, owner authorization, contract, event, receipt and download protections.
- `npm run dev:https` and its proof-manifest prehook provide the documented secure local setup. Browser authentication still requires same-origin HTTPS. Next's local certificate behavior and separate private/backend settings are explained in the frontend README.
- The timing probe rechecks its monotonic deadline after every sleep. Early event-loop wakeups can no longer authorize cancellation before the deadline. The deterministic regression failed at 59 seconds before correction and passes with the original deadline assertions retained.
- Playwright now builds and serves the production app. This avoids a development-only HMR/debug dependency in the isolated workspace fixture and exercises the delivered bundle. The CI workflow relies on this build instead of running the same production build twice.

## Fresh checks

| Check | Result and scope |
| --- | --- |
| Frontend unit tests | 100 passed |
| Production browser suite | 28 passed; local public/sample behavior plus isolated workspace API fixtures |
| TypeScript and ESLint | Passed; existing command-copy ref-cleanup warning retained |
| Production build | Passed as part of the browser server startup |
| Actual local Next HTTPS | 390px and 1440px sign-in views passed: credentials in viewport, no HTTPS-client error, no overflow or uncaught page errors |
| Spike measurement regressions | 10 passed, including deterministic early wakeup |
| Stop-proof regressions | 9 passed |
| Existing slow-observation timing regression | 10 consecutive passes, retaining >=60 and <65 assertions |
| Full backend suite on Windows | 267 tests: 245 passed, 7 skipped, 4 failures and 11 errors |
| Static landing | Build, generated HTML/source/provenance/ZIP assertions and native deployment succeeded; hosted browser returned 200 |

The full backend failures remain the Windows/POSIX ownership, file-mode, symlink and executable-fixture incompatibilities. No safety tests were weakened or skipped to manufacture a pass. Linux execution is still needed; WSL/Docker are not available here.

The four workspace browser cases use a synthetic HTTPS origin, loopback-served production assets and explicitly injected read-only API replies. Unknown API/external requests are blocked. They verify UI/controller behavior, not real Supabase authentication, cookies or database persistence. Separately, actual Next HTTPS was tested with a one-day self-signed loopback certificate in an isolated browser context; no system trust-store change occurred. Its backend was intentionally unavailable. These checks do not establish an authenticated full-stack repair.

## Hosted and source state

Live landing: `https://mend-paper-proof.bravebadge32.chatgpt.site/`.

Saved Site version: `appgprj_6acb97b759148191aa98a4553d0a34ff~appgver_05e77f8e130c8191a18654488fef4e38`.

Successful deployment: `appgdep_6ad77eec25708191847827cd66c5aab2`.

The full-stack changes in this package have not been deployed to that static Site. Its runtime cannot directly host the existing Next.js server and Python API. GitHub still contains only its MIT license; connector installation access remains absent, so full-source publication/readback and remote CI have not succeeded.

## Remaining release gates

1. Give the existing GitHub app installation access to Mend, publish this exact full source and verify connector readback plus Linux CI.
2. Deploy compatible Node/Python services with the existing private Auth/session/backend settings; verify actual owner login, contract review, reload/recovery, event replay and artifact authorization.
3. Complete independent report/stop authority integration offline. Keep live execution disabled until the user separately lifts the hold and real feasibility measurements satisfy the contract.
4. Record and verify a genuine working walkthrough before calling the provider demonstration or hackathon submission complete. No video was recorded this continuation.

## Evidence handling

Current logs are in `verification/2026-10-20/`. Public Site and actual HTTPS observations/screenshots are delivered beside the source package under `outputs/mend-tour-20261020/`; the version-19 public capture is in its `public-v19/` subfolder.

An initial 20 October public-access check reused the previous day's public capture path. The new capture was moved into the correct dated folder, and the overwritten 19 October JSON was replaced with a clearly labeled recovered summary of the earlier recorded 401 result. That recovered summary is not an original raw browser export. No application capture/provenance or packaged 19 October source was changed by this correction.
