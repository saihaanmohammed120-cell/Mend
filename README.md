# Mend — Paper and Proof

Mend is a bounded self-healing coding agent for the Coding and Agentic Engineering hackathon track. The intended workflow writes Python with NVIDIA Nemotron 3 through Nebius Token Factory, runs protected checks in an isolated Nebius job, repairs failed checks up to three times, and delivers code with a source-linked receipt.

## Current integration status

**Public source snapshot, 22 October 2026:** GitHub App installation access and a write check now work. This delivery contains the full Next.js/FastAPI source and preserves both MIT notices. [Offline Linux CI](https://github.com/saihaanmohammed120-cell/Mend/actions) is configured; consult the run for the exact commit for its result. Earlier dated publication blockers below are historical. The public static Site remains separate from authenticated full-stack hosting. Live Nebius execution and database changes remain on hold.

**Frontend refinement, 21 October 2026:** public static Site version 20 now has a quieter captured-evidence frame, clearer unsigned provenance/source identities, grouped proof downloads, an expanded evidence key and a hardened keyboard skip link. The same evidence components are updated in this full-stack source. Fresh checks: 107 unit tests, 39 production Chrome cases, build/typecheck and six signed-out public light/dark/desktop/tablet/mobile scenarios. See [scope and verification](docs/EVIDENCE_UI_2026_10_21.md). This frontend release does not enable the backend provider loop or complete the six roadmap products.

**Roadmap continuation, 21 October 2026:** the screenshot's six roadmap capabilities are not complete. Flaky-test work now has an offline authenticated check-history analyzer, a fail-closed file/CI command and candidate-comparison integration. It flags disagreement for review without excluding tests or granting approval. Twenty-two focused tests pass; full Windows backend: 282 passed, seven skipped, four failures and 11 errors out of 304. Frontend was unchanged and its earlier browser results were not rerun. See [all six roadmap statuses](docs/ROADMAP_STATUS_2026_10_21.md) and [history gate usage](docs/CHECK_HISTORY.md). GitHub required checks, public deployment, automatic quarantine and the remaining roadmap products are unfinished.

**21 October 2026:** Python bug-case review now has an offline preparation helper, an authenticated stateless preparation endpoint and source-bound comparative signed-report validation. The `/fix` intake remains local-only; the new recipe does not run through the live CSV engine. Paired authenticated evidence readers can be explicitly injected into the runner, with project/attempt/source binding and durable envelope digests; external authorities and context lookup remain unfinished. See [bug review contracts](docs/BUG_CASE_REVIEW.md) and [reader protocol](backend/docs/TRUSTED_EVIDENCE_READERS.md). Live execution and database changes remain on hold. The compact local intake passed 107 unit tests and 34 production Chrome cases; a silent offline UI draft was recorded. Full Windows backend: 270 passed, seven skipped, four failures and 11 errors. See [current delivery and remaining work](docs/CONTINUATION_2026_10_21.md). GitHub source publication remains blocked by missing connector installation access; the static Site is unchanged.

**20 October 2026:** the hosted landing is now public and version 19 qualifies its unmeasured stop bound. The full-stack source adds compact sign-in/task views, secure local HTTPS instructions and an early-wakeup deadline fix. Fresh checks: 100 frontend unit tests, 28 production-browser cases, typecheck/lint/build, and focused backend regressions pass. The full Windows backend suite still has POSIX failures. See [current delivery and limits](docs/CONTINUATION_2026_10_20.md). These full-stack changes are not deployed to the separate static landing; GitHub source publication and live execution remain blocked.

**19 October 2026:** the complete source ZIP is recovered. Stop-proof validation now guards runner observation, service resolution, historical attempts, live receipt checks and cancellation completion. Browser animation callbacks and reduced-motion hydration are fixed. See [the continuation record](docs/CONTINUATION_2026_10_19.md) and [fresh verification](docs/OFFLINE_VERIFICATION_2026_10_19.md) for exact scope and remaining failures. Live Nebius execution remains on hold. The public [Mend repository](https://github.com/saihaanmohammed120-cell/Mend) exists with MIT licensing; application-file publication is blocked by connector installation access. The following dated checkpoints are historical where they conflict with this update.

Latest continuation, 17 October 2026: [full-stack readiness](docs/FULLSTACK_READINESS.md) now verifies the local production Next.js → FastAPI → real Supabase path while execution stays locked. The canonical workbench adds separate API/database/execution states and a real connection recheck; this panel has not been published to the static landing page or accepted in a browser. The existing version-18 landing desktop paths have their separate [browser acceptance record](docs/BROWSER_UI_ACCEPTANCE.md). Older checkpoints below retain the scope and dates of their observations.

This source preserves the existing implementation and the Paper and Proof design contract. The current implementation uses Next.js 16.4.1, React 19.3.1 and Tailwind CSS 4.3.3; the original planning documents remain historical baselines. The framework migration, dependency findings and local verification are recorded in [framework migration evidence](docs/FRAMEWORK_SECURITY_MIGRATION.md) and the subsequent [tooling follow-up](docs/TOOLING_FOLLOWUP.md).

The `/sample` route uses explicitly simulated evidence; `/` contains the separate authenticated workbench integration. Browser acceptance, a real provider repair run, measured cancel-to-stop latency and a live verified receipt remain unverified. Backend/database evidence from earlier continuations is retained with its dates in [the frontend checkpoint](docs/FRONTEND_INTEGRATION_CHECKPOINT.md) and [Phase 2 evidence](docs/PHASE2_DATABASE_INITIALIZATION.md); those observations were not rerun during the framework migration.

The reference-inspired proof-file check and roadmap ledger are documented in [the research/implementation checkpoint](docs/RESEARCH_IMPLEMENTATION_CHECKPOINT.md). The hash action checks file consistency only; captured provenance remains unsigned, and deployed browser acceptance remains unverified.

The screenshot-guided evidence disclosures, proof-first page order and local repair-case preparation are documented in [the screenshot/workflow review](docs/SCREENSHOT_WORKFLOW_REVIEW.md). This local case workflow exports input only; it does not create an execution task or receipt.

The follow-up [repair-case and handoff refinement](docs/UI_REFINEMENT.md) adds Undo clear, direct review editing and honest command copying. Browser acceptance remains unverified.

The configured Supabase reference is `uwkdrmdflzverflcfkgk`. GitHub App access was restored on 22 October; current source and CI results are available through this repository and its Actions page. The new offline UI recording does not establish the final narrated provider walkthrough.

## File structure

| Path | Purpose |
| --- | --- |
| `backend/mend/` | Existing FastAPI API, authentication, domain logic, orchestration, adapters and workers |
| `backend/migrations/` | Existing schema and RPC definitions; cloud execution unverified |
| `backend/scripts/` | Existing genuine HTTP/Postgres verification and provider spike tools |
| `backend/tests/` | Existing regression and integration checks |
| `backend/docs/baseline/` | Preserved TRD, UI/UX brief, App Flow and schema documentation |
| `frontend/app/` | Existing Next.js workbench and simulated SSE route |
| `frontend/components/` | Existing task card and receipt components |
| `frontend/lib/`, `frontend/tests/` | Existing client protocol, motion, tilt and checks |
| `docs/CONNECTION_CHECKPOINT.md` | Current observed integration results and next steps |
| `LICENSE` | Preserved MIT license |

## Local development

Backend setup, existing checks and safety constraints are documented in [backend/README.md](backend/README.md). Frontend setup is documented in [frontend/README.md](frontend/README.md). Use their existing package definitions and lockfiles. Dependencies and private environment files are intentionally excluded from this source checkout.

Do not enable live execution based solely on a database URL or API key. The inherited deadline, ownership, isolation, evidence and release gates remain in force. Provider acknowledgement is not infrastructure-stop evidence. The `/sample` route remains simulated. The captured CSV example records actual local Python execution with unsigned in-toto/SLSA provenance; it does not establish live Nebius execution.

## Next integration step

Verify the published source and exact-commit offline Linux CI result, then complete the authenticated browser workflow. Follow [the offline walkthrough plan](docs/WALKTHROUGH.md). Before a separately authorized paid Nebius/Nemotron spike, integrate a reviewed independent infrastructure-stop evidence reader as well as private credentials, infrastructure and cost settings. The current live spike entry point blocks before provider-client allocation because it cannot yet assemble that reader. Record inference/provisioning latency and cancel-to-stop time before enabling live execution. Keep provider credentials server-side. Public/sample browser checks, local tests and a production build do not establish the authenticated provider repair loop.
