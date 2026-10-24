# Mend release readiness — 24 October 2026

**Decision: not ready for a provider-backed hackathon submission.** Public source, frontend and offline verification are available; the working model repair and its evidence still need implementation/infrastructure and real validation. A Token Factory key does not complete the other prerequisites. Both explicit holds remain: no live Nebius/model/discovery/job/cancellation experiments and no hosted database writes or migrations.

## Deadline and minimum submission

Rechecked [official rules](https://nebiusglobalaihackathon.devpost.com/rules) on 24 October: submission closes **30 October 2026 at 10:00 PDT = 17:00 UTC = 22:30 India time**. Plan the final entry for 29 October so link/recording issues have a buffer. Required: a working application with a Nebius runtime call or AI Cloud execution and an NVIDIA open-source model, an accessible build, public licensed source/setup, English description, track selection, public YouTube demonstration under three minutes, and feedback about tools actually used. Provide free judge access through the end of judging, 15 December, including private testing credentials when necessary. Owner must confirm registration, eligibility, rights and team details.

The [organizer's judging note](https://nebiusglobalaihackathon.devpost.com/updates/46204-here-s-how-judging-works) emphasizes a real planning/writing/testing/iteration workflow for the coding-agent track. Configured integration, curated local execution, synthetic signatures and a polished preview do not demonstrate that loop.

## Complete current inventory

| Area | Implemented / observed | Still required before claiming end to end |
| --- | --- | --- |
| Public source/license | Public MIT repository; full source, manifest and connector/public checkout readback. | Read back final selected release commit and keep it consistent with the video. |
| Public frontend | Vercel landing, captured-evidence inspection, `/fix` local input/review/export and `/sample` simulation. | Final signed-out judge journey on selected deployment. This is not authenticated repair hosting. |
| Backend mechanics | Sessions/CSRF, owner-scoped tasks, frozen CSV contract, bounded orchestration, retries/events/artifacts and evidence validators. Real HTTP and PostgreSQL fixture checks exist. | Private service credential, Render API startup, same-origin Vercel wiring, genuine account/judge testing. Fixtures are not production identities. |
| Bug intake/review | Exact source and proposed checks, review invalidation, Clear/Undo, JSON export, authenticated stateless backend preparation and CLI preparation. | Generic Python bug execution is not connected to the CSV live engine; test-oracle approval and live comparative execution remain. |
| Transport limits | Source validation permits 200,000 combined UTF-8 bytes. Current pass raises only preparation transport/file limits to 1,400,000 bytes to accommodate JSON escaping; task/session routes retain their existing caps. | Exact final-commit verification of the maximum-sized case and rejection beyond source/transport limits. |
| Model inference | Existing bounded Token Factory adapter and request/usage tests. | Private inference key, actual model availability/response/usage validation, real generated repair. No discovery or inference authorized yet. |
| Compute/isolation | Digest-pinned image build and non-root/no-network smoke checks. | The chosen architecture additionally needs AI Cloud IAM/project/subnet/platform/preset and published immutable runner image. Trusted controller must protect checks from candidate interference. |
| Reports and stop proof | Separate report/termination reader protocol, persisted job/source context, signing verification and fail-closed finalization. | Real independent producers, job-resource mapping, production assembly, raw signed-record retention and independent stop measurements. A cancel acknowledgment or two HMAC keys is not that evidence. |
| Budgets/recovery | 60-second job/600-second task/three-repair/30,000-token policies and restart/ambiguity tests. | Conservative real latency/uncertainty, trusted price provenance, explicit spending cap, restart/cancel/recovery measurements and strict-bound feasibility. |
| Receipts/downloads | Owner checks, immutable artifacts, source/contract/check identity and bundle verification logic. | A genuine live receipt and exact downloaded bundle rechecked against its protected tests; public signing identity not established. |
| CI/database | Backend/frontend/browser/real HTTP chain/image checks; disposable PostgreSQL migrations and rollback fixture. | Production database/RLS/Storage and concurrent races, not merely synthetic prerequisites. Branch-required checks are not confirmed. |
| Video | Silent offline draft and English 2:45 narration plan. | Final truthful recording after real run; measured duration, audio/captions, public YouTube URL and signed-out playback. |
| Devpost | English draft and setup/test material. | Final owner fields, actual runtime/tool feedback, build/source/video URLs, testing credentials/access and confirmed submitted entry. Nothing has been submitted. |

## Work order and acceptance

1. **24–25 October: unblock and verify hosting.** Owner privately supplies existing Supabase service-role key. Deploy the authorized free Render service, wire Vercel and validate an existing genuine account. Keep database writes/provider execution disabled. Missing key is an input blocker; it is not fixed by installing another plugin.
2. **25–27 October: real execution and evidence path.** Establish the protected execution controller and independent termination authority, raw-record retention and production context assembly. Supply private inference/cloud credentials, immutable images, real prices and a spending decision. Operator must explicitly lift the relevant holds before any live call or hosted write. Test a controlled small CSV task first; the module intake must not be advertised as arbitrary-repository repair.
3. **27–28 October: reproduce the full loop.** Record generation, actual failed protected check, model repair, complete recheck, independent stop observation, persisted receipt and matching downloaded source. Exercise real cancellation/ambiguous dispatch/restart behavior. Any strict-bound or trust failure keeps release blocked; a good-looking UI is not a reason to bypass it.
4. **28–29 October: final judge package.** Select one tested commit/deployment, replace draft text with measured facts, record the under-three-minute English video, review full playback and confirm source/build/video access without an owner session. Owner supplies required entrant/team facts and submits the final Devpost entry.
5. **30 October before 22:30 IST: verify receipt of submission and links.** Keep a buffer; do not wait for the deadline to upload a video. Maintain free judge access through judging. If the genuine runtime/evidence path is still blocked, describe the limitation and do not claim eligibility or a completed self-healing run.

These are target work windows, not promises that unknown infrastructure or evidence will pass. A failed gate changes the plan, not the meaning of a passing result.

## Six screenshot roadmap items

| Capability | Current status | Submission priority |
| --- | --- | --- |
| Whole-repository repair | Not implemented; one-module preparation is not whole-repo execution. | After the controlled repair loop works; not required as a six-feature bundle by the rules. |
| Required CI/CD gate | Real four-job CI exists; required branch enforcement is unverified. | Useful hardening; do not describe branch protection as configured. |
| Policy-as-code approval | Not implemented; release holds/check validation grant no general approval authority. | After a reviewed risk/authority policy exists. |
| Team receipt ledger | Not implemented; current owner task evidence is not a team service. | Later; needs team roles, persistence and database authorization. |
| Flaky-test detection | Offline signed-history consistency analyzer/CLI/comparative integration exists. | Trusted complete history and quarantine lifecycle/UI remain. |
| IDE receipts | No editor extension/integration implemented. | Later; no plugin install substitutes for a verified product extension. |

## Private configuration and release limits

Never send an API-key screenshot or put credentials in source/public submission files. Use private backend/provider configuration files outside publication freezes, then server-side secret injection. Do not paste a Token Factory key into the Supabase server-key field: they serve different systems. Existing credential configuration does not lift a hold or activate live execution. No live provider call or hosted database change is authorized by this checklist.

The current workstation has no usable Nebius CLI on PATH. Nebius's [official setup guidance](https://github.com/nebius/mcp-server/blob/main/AGENT_SETUP.md) supports macOS/Linux and directs Windows users to WSL2 Ubuntu. Select a reviewed Linux/WSL worker environment before installing/configuring that CLI; a native Windows executable was not invented or reported as installed. CLI installation alone does not establish cloud identity, compute resources or stop authority.

Use [judge instructions](JUDGE_GUIDE.md), [backend setup](BACKEND_INTEGRATION_2026_10_24.md), [submission draft](HACKATHON_SUBMISSION_2026_10_24.md) and [walkthrough plan](WALKTHROUGH.md). Source/local/fixture, captured, unsigned and live evidence must retain their distinct labels.
