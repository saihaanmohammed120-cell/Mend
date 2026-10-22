# Offline verification — 19 October 2026

These are fresh local results from Windows, not a remote CI or cloud execution result. Historical records elsewhere retain their original dates and scope.

| Check | Result |
| --- | --- |
| Frontend `npm test` | 98 passed |
| Frontend `npm run typecheck` | Passed |
| Frontend `npm run lint` | Passed with an existing command-copy ref-cleanup warning; the local-only Playwright adapter also warns about an anonymous default export and is excluded from publication |
| Frontend `npm run build` | Passed |
| Frontend Playwright suite using local installed Chrome | 24 passed |
| Backend `python -m unittest discover -s tests -p test_stop_proof.py -v` | 9 passed; injected offline adapters |
| Backend `python -m unittest discover -s tests -v` | 266 discovered: 244 passed, 7 skipped, 4 failures, 11 errors |
| Full-source connector publication/readback and remote CI | Blocked, not run |
| Live Nebius, infrastructure stop timing, real signed receipt | Not run; hold remains |

The browser suite targets a fresh loopback Next.js server with live execution disabled. It checks hero layout at 320–1920 pixels in both color schemes, focus/tap targets, evidence disclosures, hash matching/mismatch, local case review/edit/clear/undo/download, manual reproduction-command selection, workbench pointer depth, simulated sample playback/download, keyboard focus and mobile containment. The sample fixture aborts unexpected protected API/provider requests and asserts no uncaught page or console errors. A mounted preference-change case verifies automatic playback pauses when reduced motion becomes enabled. This is public/local UI acceptance, not an authenticated application/provider end-to-end test. Real clipboard write permission was not established.

The machine-only Playwright adapter selects the existing installed Chrome executable. It is excluded from the source package. On a fresh environment use `cd frontend`, `npm ci`, `npx playwright install chromium`, then `npm run test:browser` with the portable checked-in configuration. Browser-version equivalence is not claimed.

The final unfiltered backend failures involve POSIX private file modes, ownership APIs (`os.geteuid`, `os.O_DIRECTORY`), symlink privileges and executable/shebang CLI fixtures unsupported by this Windows run. No safety assertion was removed or weakened. An earlier run also failed a scheduler-sensitive accelerated-clock deadline assertion (59.4 versus 60 seconds); it passed in the final unfiltered run. This is an unresolved test reliability caveat, not a measured provider stop time. The new root GitHub Actions workflow prepares a Linux run but has not executed remotely.

Dependencies used for these checks were installed from the declared backend test extra and the frontend lockfile. Backend Python was 3.12; declared ranges selected FastAPI 0.148.0, Starlette 1.9.0, httpx 0.28.1 and cryptography 50.0.1. This is not validation of every version allowed by the ranges or a rerun of the separately pinned runtime lock. Frontend installation retained upstream ESLint peer warnings and five reported high-severity development dependency advisories; this continuation did not upgrade dependencies or perform a fresh vulnerability investigation.

Raw command outputs are retained under `verification/2026-10-19/` with local absolute workspace/runtime prefixes redacted. Public ZIP files are reloaded and checked against their per-file manifest. That confirms package consistency only, not runtime trust or signing.

Implementation guidance: the motion preference hook follows React's [external-store browser API and server-rendering contract](https://react.dev/reference/react/useSyncExternalStore), with a stable server snapshot and media-query change subscription/cleanup.
