# Mend proof readability — continuation, 17 October 2026

## Published result

Paper and Proof version 18 is deployed at https://mend-paper-proof.bravebadge32.chatgpt.site . Existing custom access was preserved.

- The exact note “This is a curated patch, not a model-generated repair.” appears immediately under “Captured CSV-cleaner example,” ahead of the evidence tabs.
- One “What’s real on this page” legend follows the hero: captured local checks are real, SLSA is a real unsigned document, and Nebius is not yet connected. Section labels link to the legend; material safety and privacy explanations remain.
- The code handoff explicitly identifies the same captured CSV-cleaner example and source hash as the proof card.
- Describe / Review / Download now expose Current step, Complete, Next and Requested labels, in addition to aria-current and visual state selectors. Download requested does not establish that a file was saved.

## Fresh verification in this continuation

- Frontend test command: 91 passed, 0 failed, 0 skipped. This includes actual Web Crypto hash matching and controlled tampering, and component event-handler coverage; it is not a rendered browser click.
- Initial Next.js build failed while opening a persisted Turbopack database (“invalid digit found in string”). The existing cache was preserved under a new name; a fresh build passed without application-code changes.
- Hosted production build passed. Six changed/shared component owners match the canonical app byte-for-byte.
- Generated HTML checks passed for hero authorship placement, one legend, same-example reference and initial step labels.
- All four downloadable proof files match their SHA-256 digests and byte counts. The ZIP contains identical bytes.
- Sites saved version 18, commit 3fa112ba7126bfe4688ae0c21c77617e1b3b8b6d, deployment appgdep_6ad39566e10c819199b9f7b34865a96a, status succeeded at 2026-10-17T15:34:15.248415+00:00.

## Browser acceptance remains open

The cloud browser opened the actual hosted URL, which required ChatGPT sign-in. The sign-in flow reached a Google credential form; no secret was requested in chat or entered through a general browser API. Secure authentication is required to continue.

The following have NOT been established by this continuation:

1. A rendered click on Check file hashes and its visible pass/fail result.
2. Visible Describe → Review → Download progression on the hosted page.
3. Mobile containment, keyboard/focus rendering and clipboard behavior.
4. Real Nebius/Nemotron execution, cancel-to-stop timing or Sigstore signing.

Prepared browser cases are specifications, not executed evidence. Hash matching proves byte consistency only, not identity, signing or provider execution. No winning percentage is established.

## Plugin boundaries

Superpowers verification and Codex Dev Workflows recovery guided the resumed checks; Development OS maintained the bounded objective. Sites published the existing project. ZzzOps installation check was current, but checkpoint returned policy:missing with no GitHub origin; its goal loop was not initialized or changed. WebMockup’s image-only workflow was not applied because the active request is implementation and acceptance of an existing page, with no requested mockup deliverable.

## Next action

Complete secure sign-in in the supported browser, then test the hash control and Bug Desk steps and inspect their rendered states. Preserve the current evidence labels and access policy. Do not replace these acceptance checks with more source-only UI changes.
