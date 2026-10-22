# Standards-based receipt and read-only roadmap

## Delivered and incomplete

The captured CSV cleaner now includes an actual unsigned in-toto Statement/v1 using the SLSA provenance/v1 predicate. The receipt card displays the real source repository/commit, builder, entrypoint, parameters, trigger and artifact digest, and downloads the actual statement. Raw local checks remain separate. The live slot never upgrades a legacy check record into signed provenance.

Real keyless signing, public transparency publication and cryptographic end-to-end verification are BLOCKED/UNVERIFIED. No signature, signer identity, Rekor entry or SLSA security-level claim was fabricated. The environment preflight found no cosign CLI and no ambient GitHub or Sigstore OIDC identity. GitHub MCP returned an empty accessible repository list. The existing live backend/database receipt path remains legacy and unsigned; this frontend/standalone tooling change is not its migration.

The signing CLI uses the real cosign attest-blob statement path and verify-blob-attestation, exact identity and issuer checks, artifact digest binding, exact DSSE statement matching and inclusion-proof requirements. The standalone workflow source is pinned to official action refs inspected via GitHub MCP and cosign v3.1.3; its version-specific attest-blob documentation confirms --statement support. This workflow is not installed, executed, a required CI check, or an observed successful run.

## Review sequence

The receipt-only Site version was deployed before adding roadmap content. The roadmap then follows the flow diagram and precedes the footer. It contains six transparent outlined cards labeled Not yet built, with no links, buttons, inputs or click targets.

## Current evidence

- S264/S265: actual environment presence check and GitHub MCP list_repositories — no signing prerequisites or accessible repository.
- S266: actual fresh Python capture and provenance prepare — failing empty-input run then corrected source passing all four named checks; statement artifact SHA agrees with exact source bytes and raw capture hash, actual native repository and committed inputs.
- S267: native Sites receipt-only publication succeeded; this establishes deployment, not browser appearance or a signature.
- S268: real frontend local test run71passed/0failed/0skipped; TypeScript and Next production build exited0. Provenance tests12passed and capture regression tests2passed, also rerun from the canonical standalone export. Cosign argument/rejection tests use explicit subprocess mocks, not a real keyless signature. Generated HTML checks confirm provenance/source/capture/ZIP bindings and six noninteractive roadmap cards in the requested order.
- Current callable-tool inventory exposes no Playwright/DevTools MCP tool. 390px rendering, focus appearance, receipt visual behavior and external share previews remain unverified. No browser/authentication workaround was used.

## Actual standards references

- https://slsa.dev/spec/v1.2/build-provenance
- https://in-toto.io/Statement/v1
- https://docs.sigstore.dev/cosign/signing/signing_with_blobs/
- https://github.com/sigstore/cosign/blob/v3.1.3/doc/cosign_attest-blob.md
- https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-blob-attestation.md

## Exact next signing gate

Authorize a real source GitHub repository with the standalone export layout, install its provided workflow and run it with GitHub-hosted OIDC. Independently verify the artifact and statement against the expected workflow identity/issuer and public-log evidence. Only then wire a verified bundle into the published receipt and display Signed with Sigstore. Do not paste OIDC tokens into chat, accept a browser status flag as verification, replace the absent signature with a private-key mock, or describe a local capture as a Nebius run.

Live backend provenance needs a separate reviewed metadata/storage migration plus server-side signer/verification integration. The actual Nebius/Nemotron spike, cancel-to-stop measurement, public GitHub/MIT confirmation and walkthrough remain separate unverified gates.

## Publication

Receipt-only version10 deployed before roadmap. Final version11: source b298faf2b724dacfe5091fba7f85084c25d6c3d3, deployment appgdep_6ad120002c108191b2e2db7de7d885e2 returned succeeded. URL https://mend-paper-proof.bravebadge32.chatgpt.site . Recorded 2026-10-16T00:20:11+05:30. Native deployment is not a signature or browser acceptance.
