# Mend live desktop UI/UX acceptance — 17 October 2026

## Scope and result

Reviewed the authenticated live Paper and Proof page at https://mend-paper-proof.bravebadge32.chatgpt.site/ through the supported cloud browser. Visually inspected the hero, four evidence tabs, shared legend, repair flow, handoff, source dialog, local case preparation, roadmap and footer.

No blocking UI defect was confirmed in these desktop paths. No application code, deployment, audience or backend state was changed during this review. This is targeted desktop acceptance, not exhaustive product certification.

## Actual browser results

| Area | Action and observed result |
| --- | --- |
| Hero | Curated-patch disclosure is visible directly below the capture caption. Serif wordmark, heading, orange CTA and bordered evidence card render coherently. |
| Evidence tabs | Before, Patch, Checks and Provenance switch visibly. Patched lines are numbered continuously, including line 3. Before/after table shows the actual empty-input failed → passed transition. |
| Keyboard tabs | ArrowLeft from Provenance selects Checks and moves focus to that tab. |
| Hash checker | Clicked Check file hashes. Pending state preceded a completed result: “The fetched files match this build’s recorded hashes.” All four files show Hash matches with their fetched digests. |
| Provenance | Expanded fields show repository, source commit, builder, entrypoint, parameters, trigger and artifact hash; signature is explicitly unavailable and no transparency-log entry is issued. |
| Flow | All nodes, pass/fail labels and repair return arrows are legible in the desktop diagram. The caption identifies the planned Nebius workflow. |
| Handoff | Same-example cross-reference is visible. Copy control reports success; actual browser clipboard equals python -m unittest -v test_csv_tools. |
| Source dialog | Opens with complete source and focus on Close details. Escape closes it and returns focus to View source. |
| Empty case | Review the case rejects missing inputs and focuses the error summary. |
| Case workflow | Loaded the captured sample; Review visibly advances the indicator from Describe to Review. Download case JSON creates a real completed browser download and visibly advances the indicator to Download / Requested. |
| Editing | Change expected behavior focuses that field. Editing it invalidates the reviewed packet and removes export, returning the indicator to Describe. |
| Recovery | Clear empties the fields and offers Undo. Undo restores the exact edited inputs and still requires a fresh review. |
| Code download | Download checked code completes. The downloaded ZIP is valid with eight entries. csv_tools.py SHA-256 matches the on-page value. |
| Roadmap/footer | Read-only outlined ledger, Not yet built label, six planned capabilities and serif footer wordmark render visibly. |
| Desktop containment | At the measured viewport, document scrollWidth and clientWidth are both 1348 px; no page-level horizontal overflow. Browser inner viewport measured 1363 × 936 px. |
| Live disclosure | Opening the live slot shows no attached job, no live output, closed SSE and unissued receipt fields. Limits disclosure distinguishes the required 60-second bound from unmeasured cancel-to-stop timing. |

## Download checks

The completed case download is 889 bytes, parses as JSON and contains schema_version, kind, reported_error, file_path, original_source, expected_behavior and evidence. The completed code ZIP passes its archive integrity check and contains the source whose SHA-256 is:

10e6a30c3be085a9965b999f3e1f4f3d2696bd34773e755804566c2e3acd4263

These checks do not execute downloaded Python or verify a signature.

## Limits and follow-up

- Mobile widths, touch interaction and alternate desktop widths were not rendered in this pass. The exposed browser control surface provides no documented viewport-resizing operation. No separate browser installation or improvised runtime was used.
- A controlled mismatch/error was not injected into the deployed hash fetches. Earlier unit coverage for tampering is not counted as a new browser failure-branch test.
- Offline behavior, clipboard-denial fallback, screen-reader output and full keyboard traversal are not comprehensively tested.
- External link previews, judge access, real Nebius/Nemotron execution, cancel-to-stop measurement and Sigstore signing remain outside this acceptance result.
- Browser logs inspected included extension metadata errors from a chrome-extension URL; these were not attributed to Mend. This log sample is not a whole-console clearance.
- No new winning probability, SLSA security level or signed-receipt claim is established.

## Evidence retained

Current-viewport screenshots were captured for the actual four-file hash result and the visually advanced Download step. They are browser-review artifacts, not promotional product mockups. The downloaded sample files were used only for inspection.

Next useful acceptance work: render 390 px and 320 px layouts using a supported viewport controller, check mobile tab/table/diagram containment and touch targets, then complete the real provider and signing gates independently of UI polish.
