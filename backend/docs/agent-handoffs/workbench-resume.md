# Mend workbench resume — 2026-10-12

## Part 1 — Context isolation and dependency boundaries

Scope: the recovered Next.js 14 / React 18 prototype at `/workspace/scratch/ca486ef6d53d/mend-workbench`, compared with preserved UI/UX Brief sections 3, 7 and 9 and the audited backend integration boundary. No published Site source, baseline planning document, backend implementation, provider endpoint or database was changed by this agent.

The prototype previously switched automatically to a historical live adapter when `NEXT_PUBLIC_MEND_API_URL` existed. That adapter expected `task_id`, different SSE envelopes and states, and no explicit authenticated contract review/start sequence. It does not implement the audited backend contract. The published Site and this recovered prototype are separate deliverables.

Inputs: preserved baseline TRD/design brief, existing prototype components, sample SSE route and protocol validators. Outputs: confirmed prototype bug fixes, targeted regressions, real local verification logs and this handoff. Existing installed dependencies were used without installation, external downloads or provider requests. No video/transcript or missing video stage was invented.

## Part 2 — Completed modular changes

### Existing files modified

Paths below are relative to `mend-workbench/`:

- `README.md`: removes obsolete live endpoint instructions; documents the demo-only boundary and authoritative bridge location, limitations and unchanged Paper and Proof specifications.
- `.env.example`: states that the historical public-origin variable is ignored by this scaffold; provider keys remain prohibited in browser configuration.
- `lib/use-task-run.ts`: complete demo-only sample adapter. Keeps one active playback, event-ID deduplication, bounded output, strict sample receipt validation, same-stream reconnect, terminal cleanup, stale-generation rejection and sample stop. A 45-second playback safeguard and 15-second reconnect safeguard release a failed sample rather than leaving the form permanently locked. These are browser playback safeguards, not Nebius job termination.
- `components/task-card.tsx`: uses refs and imperative DOM tilt instead of MotionValue transforms measured from a moving surface; retains native form validation and keyboard submission. Focus/drag/coarse/reduced-motion/scroll/resize suspend tilt; listeners and pending frames are cleaned up. Disabled controls no longer animate a press. Stop is explicitly labeled as sample playback. Prompt form exposes busy state.
- `app/page.tsx`: removes live backend labeling; corrects entry headline, wordmark, selected heading/evidence/metadata roles and white 14/22 code/log surface; labels the unmeasured 60-second live-job target honestly.
- `components/success-receipt.tsx`: printer body gains the existing main-panel token; receipt paper remains white with 2px corners; metadata/evidence and JSON-control size/radius align with the brief.
- `app/globals.css`: focus outline gap changes from 4px to 3px; label role changes from 11px mono uppercase to 14/20 system-sans medium.
- `lib/motion.ts`: entrance displacement changes from 22px to the brief's maximum 16px. Shared spring remains stiffness 100 / damping 10.
- `tailwind.config.ts`: adds the existing control-border token `#717971` for the prompt boundary. Existing canvas, ink, orange, success, danger, shadow and radius values remain unchanged.

### New files

- `lib/pointer-tilt.ts`: cached stable-wrapper bounds, one pending rAF write, ±3° clamp, target interpolation and shared 100/10 spring return. Transform writes are imperative; CSS transition is disabled throughout. The hard shadow stays fixed, so no separate shadow cycle can desynchronize it. `will-change: transform` is applied to the surface. No React render occurs for pointer movement.
- `tests/pointer-tilt.test.ts`: exercises event batching/cached bounds, angle bounds, spring settling, suspension and pending-frame disposal through a controlled scheduler.
- Backend verification logs: `docs/verification/workbench-typecheck.txt`, `workbench-tests.txt`, `workbench-build.txt`, `workbench-sample-http.txt`.

### Token and interaction audit

| Requirement | Previous condition | Applied result |
|---|---|---|
| Warm paper canvas `#F5F2EA` | Correct | Preserved |
| Static canvas-only 5% noise | Correct, decorative/noninteractive | Preserved |
| Task/activity white panels, 2px ink border, 20px radius, 8px hard shadow | Correct | Preserved |
| Primary orange action, ink label, 4px hard shadow | Correct | Preserved |
| Printer main-panel elevation/shape | Missing hard shadow; 12px body corners and extra gray surface | Existing white main-panel token applied |
| White code/log surface | Paper-tinted | White applied |
| Focus outline | 3px ink, 4px gap | 3px ink, 3px gap |
| Control border | Translucent ink | Existing `#717971` token applied to textarea |
| Role sizes | Entry 64px desktop, 32px wordmark, 11px labels, 12px logs, tiny metadata | Entry 44/48 desktop and 32/36 mobile; wordmark 28/32; inspected headings 18/24; labels/evidence 14/20; body/input 16/24; logs 14/22; receipt metadata 12/18 |
| Stop/JSON control corners | 8px | 12px |
| Receipt paper corners | Unspecified | 2px |
| Entrance | Shared 100/10 spring, 22px displacement, 75ms stagger | Same spring, 16px displacement, 50ms stagger |
| Pointer tilt | Bounds measured on transforming card each move; focus/drag suspension absent | Bounds cached on stable wrapper once at entry; imperative rAF, smoothing, focus/drag suspension and cleanup |
| Reduced motion | Existing immediate entrance/receipt and static indicator | Preserved; tilt disabled |
| Copy honesty | Sample labels existed but an environment variable claimed live mode | Always demo-only; no live execution/database claim |

Baseline contrast table 3.2 was not edited. Source-token corrections are not a rendered contrast, mobile or accessibility conformance audit.

Authenticated before/after excerpts from the inspected source:

```diff
- const mode: RunMode = API_BASE ? "live" : "demo";
+ return { ...state, mode: "demo" as const, busy: isBusy(state.status), start, stop };

- const rect = event.currentTarget.getBoundingClientRect();
+ const tilt = createPointerTilt(card, () => outer.getBoundingClientRect(), { request: requestAnimationFrame, cancel: cancelAnimationFrame });

- hidden: { opacity: 0, y: reducedMotion ? 0 : 22 },
+ hidden: { opacity: 0, y: reducedMotion ? 0 : 16 },
```

## Part 3 — Micro-verification and quality gate

The React best-practices skill was read for the multiple TSX changes. Review focused on transient refs, no per-pixel state, cleaned up listeners/frames/timeouts, stable DOM ownership, native labels/form semantics, disabled actions, reduced motion and strict receipt validation. No CSS-in-JS framework or unrelated dependency was introduced.

Actual commands using existing dependencies:

```text
npm run typecheck
tsc --noEmit
exit 0

npm test
PASS pointer micro-events batch to one write using one stable bounds read
PASS pointer exit returns through the shared spring and stops scheduling
PASS focus/reduced/coarse/drag suppression and teardown cancel pending writes
PASS only a complete passing receipt qualifies as success
PASS sample receipts cannot masquerade as live execution
PASS rejects malformed and over-budget events; preserves stderr text
tests 6; pass 6; fail 0; skipped 0; todo 0

NEXT_TELEMETRY_DISABLED=1 npm run build
Next.js 14.2.35
Compiled successfully
Linting and checking validity of types
Generating static pages (4/4)
exit 0
```

The final build followed the requested typography/token corrections. The npm warning about an existing `http-proxy` environment configuration remains a warning; no proxy was configured or used by this work.

A separate attempted production HTTP/sample SSE smoke check did **not** pass. `next start -p 3216` printed Ready, but a subsequent request returned `ECONNREFUSED 127.0.0.1:3216`. The verifier exited 1 before any HTML or SSE assertion completed. The server was stopped; exact failure output is retained in `workbench-sample-http.txt`. This is not evidence of successful HTTP execution or a confirmed application defect. No substitute response was fabricated.

Controller tests verify scheduling and cleanup mechanically; they do not render React, measure smoothness, test visual focus clipping or certify screen-reader behavior. The backend's four genuine HTTP/PostgreSQL skips remain separate and are not resolved by these frontend tests.

## Part 4 — Pipeline convergence and next boundary

This source can be packaged as a preserved, buildable labeled sample prototype, alongside the backend bundle. It is not the published Site, a live Mend app, or a completed frontend/backend integration.

Next frontend module: authenticated contract-review and explicit start integration using `mend-backend/web/mend-client.ts` and `docs/FRONTEND_ACCEPTANCE.md`. It must implement the actual backend session/CSRF contract, authoritative state/event mapping, release gate and authorized downloads before a live mode can be exposed. The sample-only hook should not be extended with the obsolete endpoints.

Remaining visual/product acceptance work includes browser verification of tilt/focus/reduced motion/mobile layouts, receipt-height reservation and print motion; the contract-review screen, actual source/diff/check evidence, four-step repair-flow hero, code artifact download, history and retained drafts. Existing scaffold typography corrections do not certify every future screen. The original video remains unrecovered.

Live readiness also requires genuine FastAPI/PostgreSQL runtime verification, measured Nemotron 3 latency/provisioning/cancel-to-stop latency and the total budget fit. A provider timeout setting cannot enforce the 60-second bound. No real job, model call or Supabase write occurred during this agent scope.

**Agent checkpoint before root HTTP follow-up:** Scoped prototype source changes complete; TypeScript, six targeted/protocol tests and final production build passed. The first local HTTP smoke attempt returned connection refusal; browser visual and live integration gates remain open. No publication occurred.

## Root follow-up — local production HTTP/sample SSE

A bounded retry started Next with explicit `127.0.0.1` binding and sent requests from the same subprocess orchestration. Actual result: HTTP 200 with Sample mode and no Live backend label; sample SSE content type valid; eleven fixture events including stderr, fixing and a demo-only terminal receipt; exit 0. The server was stopped and its process group cleaned up. See `docs/verification/workbench-sample-http-retry.txt`. The original refused connection remains recorded; no cause is asserted beyond the controlled retry setup.

**LATEST STATE SAVE:** TypeScript, six tests, final build and genuine local Next HTML/fixture SSE verification passed. This is not a visual browser audit, actual FastAPI HTTP integration, Supabase persistence or provider execution. Root preserves the audited source and both smoke outcomes in the source packages/checkpoint.
