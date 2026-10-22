# Mend — repair-case and handoff refinement

16 October 2026. A bounded continuation of the Paper and Proof UI/UX work, preserving existing tokens, typography, motion and evidence boundaries.

## Published changes

**Undo clear.** Clearing a nonempty case offers a real Undo action. Undo restores the exact draft inputs but requires a fresh review before export. Any subsequent edit or example load retires the Undo copy, preventing it from replacing newer work. Empty fields cannot be cleared again. The privacy notice now explicitly describes the temporary in-memory Undo behavior.

**Direct review editing.** Each reviewed field has a named Change action that focuses its actual input. Changing original source opens its disclosure before moving focus. Error-only cases explicitly show that no source is included. Any edit continues to invalidate the prepared packet.

**Reproduction command copying.** Checks and the handoff share a real copy control for the included Python command. The command remains in a read-only, selectable input. Clipboard success appears only after the writer promise resolves. Missing or denied clipboard access shows a manual-copy fallback. Duplicate pending clicks are guarded; late responses cannot update an unmounted control. Copying never executes tests.

These are implemented source changes. Actual post-change browser appearance, keyboard behavior and operating-system clipboard acceptance remain **unverified**. [EVIDENCE S1/S2/S7 — inspected source, implementation and current tool inventory]

Site: https://mend-paper-proof.bravebadge32.chatgpt.site/#prepare-case . Sites returned **succeeded** for version **17**, source `a06b80e772662e73bcf75dcd3ca44fc985390e23`, at `2026-10-16T16:18:28.152470+00:00`. Existing custom access was preserved; external judge access remains **unverified**. [EVIDENCE S6 — native Sites save/deploy]

## Implementation owners

| Files | Responsibility |
| --- | --- |
| `frontend/components/repair-case.tsx` and `.css` | Recoverable clearing, targeted edits, missing-source state and privacy copy. |
| `frontend/components/command-copy.tsx` and `.css` | Shared command control, clipboard lifecycle, selection and feedback. |
| `frontend/components/captured-workspace.tsx` | Use the same control in Checks. |
| `frontend/tests/repair-case.test.ts`, `command-copy.test.ts` | Protect restoration, stale review, exact targets and asynchronous clipboard behavior. |
| `frontend/tests/hero-render.test.ts`, `captured-inspector.test.ts` | Integrate the actual new component or isolated child boundary into existing tests. |
| `frontend/e2e/hero.spec.ts` | Prepare browser checks for Undo, direct editing and command selection. Discovered, not executed. |
| Hosted shared mirrors, `src/App.jsx`, `build.cjs`, `tests/hero-output.py` | Same owners in the handoff; include styles and verify initial command markup. |

No native form submission, server persistence, model/job call, execution request or signature was added. Existing capture and provenance files were reused unchanged. Clear with Undo is not a secure-purge feature.

## Review and actual verification

Independent source review found that the initial privacy note still implied Clear removed the inputs from memory. The implementation intentionally retained an Undo copy. The note was corrected before publication. The bounded review found no further material issue in the selected state, cleanup, SSR or focus paths; this does not establish whole-project security or browser correctness. [EVIDENCE S3 — review and corrected source]

The initial clipboard tests waited only one microtask and inspected state before the VM's cross-context promise continuation finished. The test harness now waits through the event-loop boundary. Production success conditions were not weakened to make tests pass.

```text
[ACTUAL LOCAL VERIFICATION]
Frontend tests:       90 passed, 0 failed, 0 skipped
TypeScript:          exit 0
Production build:    exit 0, including TypeScript
Hosted build/QA:     passed
Browser discovery:   21 cases; 0 executed
Deployment:          succeeded
```

Handler tests invoke the actual component logic with injected DOM/clipboard boundaries. They establish internal behavior, not a real system clipboard write. Hosted QA inspects generated HTML, proof/ZIP bindings, source disclosures and initial copy controls; it does not inspect a rendered page. No initial clipboard-success claim is emitted. Changed canonical and hosted owners matched byte for byte. [EVIDENCE S4/S5 — `exec_command`, test/build output, source workflow and Python artifact checks]

Raw logs and structured evidence: `docs/verification/ui-refinement-*`. No fresh lint, dependency audit, database, remote GitHub/CI or live provider verification is claimed.

## Documentation consulted

Context7 resolve/query calls were completed for Next.js and React before framework edits. [MDN Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) was opened to confirm its asynchronous success and permission-failure semantics. Native clipboard availability remains a browser acceptance question.

## Next gate and limits

Run the prepared browser journey in the permitted Playwright/control-browser environment: desktop/mobile themes, error navigation, restored inputs, fresh review after Undo, command selection, allowed/denied clipboard, and real downloads. Playwright/DevTools/control-browser are not exposed, so these remain **unverified**. No preview server or substitute browser was started. [EVIDENCE S7 — tool inventory and discovery]

Real Nebius/Nemotron execution, cancel-to-actual-stop measurement, receipt signing, diagnosis review, merge approval, current FastAPI/Postgres behavior, public repository/CI, recording and judge access remain **unverified in this continuation**. The new UI does not close those gates. Earlier plans and historical reports are retained in the source archive and state save.
