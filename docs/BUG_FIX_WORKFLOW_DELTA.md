# Mend — bug-fix workflow and UI/UX delta

Status: implementation plan plus local intake UI. Generic model investigation, isolated bug execution, reviewed patch generation and regression generation remain unimplemented and unverified. This delta preserves the earlier PRD/TRD, existing CSV contract and Paper and Proof design tokens.

## Current delivery boundary

**EVIDENCE S133 — Sites get_site:** the existing Mend Site reports active status and a live URL, https://mend-paper-proof.bravebadge32.chatgpt.site. That establishes publication metadata, not visual correctness or a working agent backend. The public-page search fetch was inaccessible; no Playwright tools were exposed in the current inventory.

**EVIDENCE S134/S135 — targeted source inspection and contract-review sub-agent:** the saved Next.js workbench and FastAPI modules exist. The current task API accepts a prompt and optional runtime, and its contract validator accepts only the canonical CSV-cleaning recipe. It does not accept arbitrary source uploads, structured error records, generated acceptance tests or external repository application. Those functions cannot be added by merely changing marketing copy.

The website has been started and a demo has been published. The complete real bug-fixing product is unfinished. Model/provider execution and authenticated browser acceptance remain unverified. No existing deployment was changed during the local intake implementation.

## Product scope

Build a focused bug desk for small Python modules. The developer submits reported failure evidence, reviews an execution contract, inspects a source-bound fix and measured outcomes, then downloads a reviewed patch and regression artifact. External application is manual until a separately authorized repository integration exists.

The intended audience is a developer debugging a small utility or helper. Arbitrary repository dependencies, arbitrary shell commands and broad autonomous repository writes stay outside the first recipe.

### Requested features

| Feature | Required behavior | Honest outcome when evidence is absent |
| --- | --- | --- |
| Bug intake and investigation | Accept an error and/or one small Python module; preserve original source; explain a cause hypothesis with supporting evidence | Error-only intake is not a reproduced failure. Mark hypotheses and missing reproduction explicitly. |
| Automatic verification | Run the reviewed deterministic commands in an isolated job; preserve actual stdout, stderr, exit status and exact checks; repair only allowed source | No provider result means unverified; missing or truncated required evidence cannot be displayed as a passing check. |
| Trustworthy fix report | Show original failure, exact files changed, deterministic before/after diff, measured results, explanation and exclusions | No candidate means no diff or apply action. Model narrative cannot award verification. |
| Regression generation | Freeze a generated test and run the same test against original and patched source under the same harness | A test that does not expose the original bug is not a proven regression. Import/setup failure is not a relevant fail-before result. |

## Local UI implemented in this slice

The saved frontend gains `/fix`, with a navigation entry from the workbench. Its action is **Prepare review packet**, not Run or Fix. The page accepts error text, an optional original source module and expected behavior. It validates the local intake and permits an explicit JSON download labeled as intake, never as a receipt.

Typed source remains in page memory. No model, task API, database, storage, localStorage or sessionStorage receives it. Editing clears the prepared snapshot so an old packet cannot silently represent newer input. Original error text and source whitespace/blank lines survive serialization. Source preview numbers every displayed split line, including empty lines, and caps displayed rows/characters with an explicit shortening notice. The complete source stays in the JSON export.

Investigation, check execution, patch report and regression panels state their unavailable/planned status. They do not fabricate stdout, before/after patches, causes, passing tests or receipt printing. There is no repository-apply button and no hidden provider fallback.

Source files: `frontend/lib/bug-intake.ts`, `frontend/components/bug-desk.tsx`, `frontend/app/fix/page.tsx`, the workbench navigation and `frontend/tests/bug-intake.test.ts`.

**EVIDENCE S136 — bug-desk review agent, exec_command reproduction:** the initial helper trimmed error text and its preview could derive excessive rows from a valid newline-heavy input. Both source-level issues were corrected, including whitespace-only original source accompanying an error and Unicode-safe preview truncation. This was not a reproduced browser freeze or visual defect.

## Proposed app flow

1. Enter error/source and expected behavior; prepare the original evidence packet.
2. Submit only after the backend supports an owner-authorized, versioned bug recipe.
3. Review the reproduction method, editable path, protected checks, runner image, exclusions and effective allocation.
4. Approve the contract. Freeze original-source and check identities.
5. Run the original reproduction, then generate and check a candidate within the shared allocation.
6. Present the actual report: original failure, candidate diff, check output and a clearly attributed explanation.
7. Generate an additional regression after the candidate passes. Freeze its identity before comparative execution.
8. Compare the same regression against original and fixed snapshots; keep original acceptance checks protected.
9. Review the patch and download the artifact. A future Apply action requires explicit owner authorization and exact base identity.

Approval to execute a sandbox contract and approval to apply a patch to an external repository are distinct records. A successful sandbox result must not imply external source was modified.

## Explicit budget resolution

The existing CSV flow permits an initial candidate plus up to three repairs within four executions. That allocation cannot also silently include an original reproduction and post-fix comparative regression jobs.

**Proposed first bug recipe:** retain a four-job ceiling, with one original reproduction, up to two candidate jobs and one reserved comparative-regression job. That yields at most one repair for this bug recipe, disclosed before approval. The legacy CSV allocation remains unchanged. The comparison job must use a trusted harness that runs the original and fixed snapshots separately inside one bounded job, with source-bound results for both. Feasibility within the configured per-job deadline remains unverified until the real spike measures it.

If the comparison harness cannot safely complete both runs within the job bound, do not unlock the combined recipe. A repair-only handoff may provide a generated regression as an unverified proposal, or a separately reviewed versioned budget may be considered after real measurements. Never label an unexecuted regression as verified.

All investigation, writer, reviewer, explanation and regression-generator calls share the task's existing time, token and monetary ledger. The proposed allocation must reserve regression work up front. No agent gets an independent unlimited budget. API timeouts and cancellation acknowledgements do not prove actual stopped execution.

## Backend contract changes required

Create a reviewed bug recipe instead of loosening canonical equality. Proposed records and interfaces below are not currently implemented:

- Owner-scoped fix case: original source/error, expected behavior, source identity, recipe/version, approved contract, effective allocation and retention deadline.
- Category-aware execution records: reproduction, candidate and comparative-regression runs. Do not insert extra non-repair jobs into legacy counters without reviewing the existing execution/repair constraints.
- Candidate record: original base identity, current candidate identity, allowed paths, deterministic diff and model request/usage provenance.
- Review record: selected candidate identity, owner decision, expected base identity, approval time and idempotency key.
- Regression record: generated content/identity, original and fixed source identities, exact command/harness/image identities and both actual outcomes.

Expose these through an explicit public allowlist. Current arbitrary appended report fields may be discarded by public-payload filtering; adding model output to a dictionary does not establish an API contract.

A future external Apply endpoint must reject an outdated base, verify repository/owner authority, require approval of the exact candidate and make retries idempotent. No model or reviewer output can grant that authority.

## Multi-agent boundaries

The coordinator owns workflow state, reservations and authority checks. The investigator produces bounded hypotheses. The writer/repairer is the only patch producer. A reviewer is read-only and candidate-bound. The regression generator proposes tests in a separate lane. The isolated checker and backend verifier establish measured outcomes.

These roles are proposed runtime extensions. Current source does not establish independent model agents for all of them. All error text, source, model findings and generated tests are untrusted data. Do not show private reasoning transcripts as product evidence; show concise actions, hypotheses and tool results.

## Regression proof rules

- Test content is identical for original and fixed comparisons and frozen before either comparison starts.
- Expected values come from the reviewed behavior contract; the writer cannot choose a weaker oracle.
- The original must fail for the targeted behavioral assertion, not an unrelated syntax/import/environment error.
- The fixed candidate must pass the same test; skipped/omitted checks do not count as passing.
- Existing protected acceptance checks must still pass and remain unchanged.
- Reports bind case, candidate, regression, image, job and command identities. Candidate-emitted JSON cannot sign its own success.
- A test that passes both snapshots is marked as not demonstrating the reported bug. A failing fixed snapshot returns a useful unresolved handoff within the reviewed allocation.
- Generated test code runs only in isolation with the same privilege boundary as candidate code, never in the backend process or privileged report controller.

## UI/UX design extension

Keep the canvas warm paper, white card/code/report surfaces, ink borders, existing hard shadows, rounded corners, typography, focus tokens and spring/reduced-motion rules. No new colors, fonts, neon, glass or fake activity. Editable code fields do not acquire pointer tilt while typing or focused; the existing hover implementation remains unchanged.

Organize a single scrolling report workbench:

| Section | Primary task | Evidence shown |
| --- | --- | --- |
| Intake | Describe the original failure | Exact submitted error/source; no diagnosis badge |
| Contract desk | Review scope and allocation | Commands, protected checks, exclusions and effective repairs |
| Investigation | Understand the hypothesis | Evidence-linked cause explanation; reproduction status |
| Attempt ledger | Inspect the measured change | Continuous source numbering, exact diff, stdout/stderr and check identities |
| Patch review | Decide on the candidate | Original/base identity, changed paths, remaining concerns and download action |
| Regression desk | Protect the same behavior | Frozen test, relevant fail-before and pass-after output |
| Handoff | Keep the verified artifacts | Source-bound receipt and downloads, or explicit unresolved outcome |

Use ordinary scrolling and compact anchors; keep the current action visible without scroll hijacking. Do not print a success receipt because an animation ends. A missing input or evidence record appears as not supplied/not recorded, not as invented sample data. Simulated examples remain distinctly labeled and separate from live case records.

## Ordered delivery

Local intake authoring is the completed source slice. Browser interaction/rendering remains unverified. Next establish Playwright access on PC, complete the real provider measurement spike, integrate trusted report/termination readers and prove the original CSV path. Then implement the versioned bug recipe, category-aware counters and review report before enabling investigation/run buttons. The comparative regression harness follows under the disclosed allocation.

Public repository/license verification and the real submission recording remain required delivery work. A polished bug desk is not a substitute for a functioning execution path. Organizer judging guidance emphasizes actual planning, writing, testing and iteration: https://nebiusglobalaihackathon.devpost.com/updates/46204-here-s-how-judging-works.

## Acceptance gates

- Empty/oversized/unsafe intake rejected; error-only intake remains non-reproduced.
- Original source preserved exactly; editing invalidates the prepared packet.
- No submitted source sent or persisted implicitly.
- Commands/checks cannot be supplied as arbitrary shell authority.
- Same source-bound report shown across task/candidate changes; stale evidence rejected.
- Required check failures, missing evidence, stopping and exhaustion never print passing receipts.
- Patch review approval distinct from contract approval and verification.
- Comparative regression demonstrates the targeted behavior under identical harness inputs.
- Real Supabase MCP verifies owner isolation and persisted records after schema/API implementation.
- Real Playwright MCP verifies keyboard/focus, mobile layout, scroll behavior and evidence labels.

No declaration in this plan is a claim that the complete requested bug-fixing system works today.

## Verification in the implementation turn

**EVIDENCE S137 — exec_command:** TypeScript completed successfully; the frontend suite reported 37 passed, no failures and no skips. These are local validation/controller/boundary tests, not a real Nebius task or browser E2E.

**EVIDENCE S138 — exec_command:** the final Next.js production build completed with exit 0 and included `/fix`. Raw build output is `docs/verification/bug-desk-build.json`. Browser visual correctness, input/export interactions and provider execution remain unverified.

**EVIDENCE S139 — exec_command, actual local Next.js production server and HTTP request:** `/fix` returned HTTP 200 and its server-rendered markup contained Bug Desk, local-packet, execution-gated and regression-planned labels. Raw output is `docs/verification/bug-desk-http.json`. This does not establish browser interaction, visual acceptance or deployment of the new route to the existing Site.

The existing Site was inspected through Sites metadata only and was not modified or redeployed. New UI source lives in the saved Next.js project. Publication of the complete application must follow actual integration and browser acceptance.
