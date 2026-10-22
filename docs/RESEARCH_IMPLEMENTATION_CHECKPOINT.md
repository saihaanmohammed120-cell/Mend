# Mend — reference research and implementation checkpoint

Date: 16 October 2026. This report covers the resumed video/reference-inspired improvement task. Earlier reports remain dated historical evidence; this is not a fresh audit of every backend or submission requirement.

## Delivered

Paper and Proof has a genuine **Check file hashes** action inside the captured example’s **Provenance** panel. It reads the included source, regression test, raw captured run and provenance files, computes SHA-256 from the fetched bytes, and compares both the hashes and file sizes with fingerprints prepared during the build. It starts with **“Not checked in this browser.”** Results appear only after the operation finishes. A downloadable fingerprint JSON is included in the example ZIP.

This is deliberately limited to **file consistency**. It does not authenticate the publisher, validate a Sigstore identity, prove passing tests, or establish Nebius execution. Files and fingerprints supplied by the same compromised publisher could be replaced together. Independent signing and trusted execution evidence remain necessary. The existing provenance stays explicitly **unsigned**. [EVIDENCE S4/S5: actual byte-hashing tests, server-render checks and hosted artifact checks]

The roadmap now uses an editorial ledger: an introductory column and numbered, outlined rows on desktop; a stacked layout on narrower screens. The existing planned capabilities and **“Not yet built”** label remain. No pretend controls, dates, popularity claims, new animations or token changes were added. This describes the source implementation; the rendered desktop/mobile result remains **unverified**. [EVIDENCE S5/S7: authored CSS/HTML checks and absent browser tooling]

Published Site: https://mend-paper-proof.bravebadge32.chatgpt.site/ . Sites returned deployment **succeeded**, version **15**, at **2026-10-16T15:20:18.188530+00:00**. The existing custom audience was preserved; this is not confirmation of external judge access. Site source commit: `08155c1d51eab105dce77d2319f1be523072d111`. A Site deployment commit is not an authenticated execution-receipt commit. [EVIDENCE S6: native Sites save/deploy calls]

## Video review and useful adaptations

The available `26954.mp4` clip was inspected through extracted visual frames. Its visible examples criticize generic outcome-free copy, repeated icon-card grids, default font choices, fading hover states and superficial glow effects, and show texture as a possible way to add character. The spoken audio was **not transcribed**; older unavailable video instructions remain **unverified**. The video’s subjective scoring language was not treated as usability research or an objective quality metric. [EVIDENCE S1: actual media inspection and viewed frames]

Mend already had a specific outcome headline, self-hosted Fraunces/Archivo/Plex typography, paper/ink/coral tokens, useful proof views, hard shadows and restrained textures. Replacing those with a reference site’s branding would weaken continuity. The useful delta was therefore a distinctive roadmap composition and a substantive proof-file interaction, rather than more decorative sections or invented capabilities.

## Reference research: scope and limits

The interrupted research records were recovered and consolidated instead of re-running the entire collection. The catalog contains **126 attempted entries**, **121 recorded successful HTML retrievals**, and **116 counted distinct sites** after exclusions. The counted groups are **39 developer products**, **35 design systems**, and **42 execution/verification products**. [EVIDENCE S2: raw HTTP records and current catalog recount]

The excluded successful entries include an unrelated mobility company at `bruno.com`, duplicate Adobe/HeroUI/Web Awesome entries, and a duplicate final host reached by a redirected design-system URL. Failed retrievals remain in the catalog with their observed HTTP status. No replacement site was counted without a successful recorded retrieval.

This is **source and metadata screening**, not a rendered visual audit of those sites, not testing of their functionality, and not a survey of what most people prefer. The catalog records requested/final URLs, status, metadata excerpts, recorded retrieval time, exclusions and counting decisions. Some titles are extraction excerpts rather than independently verified full page titles.

Files: `docs/research/reference-catalog.json` and `docs/research/reference-catalog.csv` in the source archive.

### Focused sources behind the implementation

| Source | Observed guidance | Mend decision |
| --- | --- | --- |
| [MDN: SubtleCrypto.digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) | Digesting requires a secure context and complete input in memory; SHA-256 is supported. | Use native Web Crypto, cap reads, reject unavailable hashing and avoid pretending that a hash is a signature. |
| [GOV.UK: error messages](https://design-system.service.gov.uk/components/error-message/) | Explain a problem clearly and help the user recover. | Give distinct read/size/timeout/mismatch messages; failures never become a match. |
| [Linear: design refresh](https://linear.app/now/behind-the-latest-design-refresh) | Reduce competing visual weight and support the main work. | Keep evidence inspection primary and the planned roadmap secondary. |
| [NNGroup: aesthetic-usability effect](https://www.nngroup.com/articles/aesthetic-usability-effect/) | Attractive interfaces can affect perceived usability and mask problems. | Treat craft as presentation, then verify behavior separately. No winning probability or preference statistic is invented. |

These are paraphrased design/engineering inputs, not proof that Mend has passed usability testing. [EVIDENCE S8: the linked pages were opened with the web search tool]

## Implementation and safety boundaries

| Owner | Change |
| --- | --- |
| `frontend/scripts/prepare-proof-manifest.mjs` | Generate fingerprints from actual proof bytes only after validating capture/source/test/provenance bindings. Reject output aliases and use fresh temporary files plus atomic rename. |
| `frontend/lib/captured-file-digests.json` | Generated build-recorded fingerprints. |
| `frontend/public/example/integrity.json` | Downloadable copy of the fingerprint record. |
| `frontend/lib/artifact-integrity.ts` | Fixed same-origin file allowlist, bounded reads, native SHA-256, byte-size comparison and abort handling. |
| `frontend/components/artifact-integrity-check.tsx` | Real action, pending/error/mismatch states, actual fetched hashes, timeout and unmount cleanup; explicit trust boundary. |
| `frontend/components/provenance-receipt.tsx` | Integrate the check into the existing unsigned provenance view. |
| `frontend/components/proof-hero.css` | Token-based checker styling, wrapping hashes and existing touch/focus rules. |
| `frontend/components/proof-roadmap.tsx` and `.css` | Read-only outlined roadmap ledger and narrow-screen stacking. |
| `frontend/package.json` | Prepare the manifest before development, tests and production builds. |
| `frontend/tests/artifact-integrity.test.ts` and `hero-render.test.ts` | Protect actual hashing, mismatch/failure/cancellation, input preservation and initial non-verified UI. |
| `frontend/e2e/hero.spec.ts` | Prepare browser acceptance for the actual hash action. Discovered, **not executed**. |
| Hosted Site mirrors, `build.cjs`, `tests/hero-output.py` | Generate fingerprints before bundling; include JSON in the ZIP; check hosted byte bindings and initial markup. |

The checker only reads its fixed included artifacts. It does not execute downloaded code, accept arbitrary fetch URLs, request API keys, call Nebius, create jobs, write database rows, merge code or create signatures. No backend or database behavior was changed in this scope.

## Defect found and fixed before publication

Independent review reproduced an input-clobber bug in the first manifest generator: resolved-path checks caught matching paths and symlinks but missed **hard links**, which can give different pathnames to the same file. Writing a manifest through such an output could replace the proof source with JSON. [EVIDENCE S3: isolated hard-link reproduction by the review agent]

The fix compares existing destination device/inode identities with every protected proof input, validates all destinations before writing, and writes outputs through exclusive temporary files followed by atomic rename. Regression coverage exercises both a hard-linked module output and a hard-linked public manifest; the source must stay unchanged and the operation must reject. Canonical and hosted generators are identical. [EVIDENCE S4/S5: actual passing regression and mirror checks]

The review found no further material issue within its bounded hash/fetch/component scan. That is not a claim that the entire project is bug-free, secure or production-ready.

## Actual verification in this continuation

```text
[ACTUAL LOCAL EXECUTION — NOT A NEBIUS RUN]
npm test:             81 passed, 0 failed, 0 skipped
npm run lint:        exit 0
npm run build:       exit 0; TypeScript completed
Hosted build:        exit 0
Hosted artifact QA:  passed
Canonical mirrors:   8 file pairs matched byte-for-byte
Browser discovery:   20 cases found; 0 executed
Sites publication:   succeeded
```

The frontend tests use real local artifact bytes and the runtime’s real Web Crypto implementation, with an injected local-file response fetcher. They do not prove browser networking, deployed user interaction, provider behavior, or execution of the Python checks. The hosted checks inspect generated HTML, static assets and ZIP contents; they are **not visual acceptance**. Browser cases cover narrow and wide screens, themes, keyboard/focus behavior and the hash action, but all remain **unverified** until executed. [EVIDENCE S4/S5/S7]

Raw logs and structured scope: `docs/verification/research-integrity-*`. No tool output was invented. The npm environment emitted an existing proxy-configuration warning; commands still returned the recorded exit codes. No fresh dependency security-clearance claim is made.

## Remaining blockers and next work

| Priority | Remaining work | Honest current status |
| --- | --- | --- |
| Acceptance | Open the deployed flow with the required Playwright/control-browser capability; exercise the hash action, errors, keyboard navigation, themes and narrow-screen containment. | **Unverified.** No Playwright MCP, DevTools MCP or control-browser tool is exposed. No alternate browser installation or authentication workaround was attempted. |
| Core technology | Finish the independently reviewed infrastructure-stop evidence path, then run the genuine Nemotron/Token Factory + isolated Nebius job repair loop. | **Unverified.** No model call or Nebius job was run in this continuation. Required private access, infrastructure/cost configuration and stop-evidence integration remain outside this UI feature. |
| Safety feasibility | Measure inference, provisioning and cancellation-to-actual-stop latency against the job/task budgets. | **Unverified; not measured.** A cancellation acknowledgement or configuration value is not stop evidence. |
| Receipt authority | Configure an authorized OIDC signing identity, issue and independently verify cosign/Sigstore provenance, and retain the transparency evidence. | **Unverified; unsigned.** The hash action does not close this gap. |
| Product integrity | Implement and prove the diagnosis evidence review and merge-approval policy before advertising them as shipped. | **Unverified in this continuation.** Roadmap text is not implementation evidence. |
| Database/backend | Re-check the required application/owner/database behavior through actual FastAPI and Supabase paths as the core integration resumes. | **Unverified this continuation.** Earlier dated observations are retained, not relabeled as fresh. |
| Submission | Confirm public repository access, committed MIT license, remote CI evidence, judge-accessible deployment and the walkthrough recording. | **Unverified this continuation.** No GitHub MCP or external judge-access check occurred. Existing custom Site access was not widened. |

Do not add more marketing claims or a wider feature surface to compensate for these gaps. The next substantive milestone remains actual browser/provider acceptance and trustworthy execution evidence. No available research establishes guaranteed hackathon success or a winning percentage.

## Continuation checkpoint

The scoped reference-inspired enhancement is implemented and published. Resume from `MEND_STATE_SAVE.md`, retain this source archive and catalog, and avoid repeating completed source screening. Browser and live-provider acceptance remain open. Private credentials belong only in server-side environment configuration and must never be embedded in source, reports, screenshots or public receipts.
