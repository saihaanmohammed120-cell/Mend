# Mend — real-execution milestone and submission preflight

Status: milestone started with source/API review and a real local prerequisites probe. The actual Nebius/Nemotron spike, bug repair, regression execution and live receipt remain **unverified and blocked**, not completed.

## What hackathon verification actually says

The organizer's winning-project guidance explicitly encourages AI coding tools, including Claude, Copilot and Cursor. AI-assisted development does not need concealment. The reviewed official rules, FAQ and updates do not identify a specific AI-authorship detector or automated whole-project scanner. Any undisclosed scanning remains unknown; no promise can be made that a checker will or will not flag a submission.

The submission must accurately represent its functioning software and required platform/model use. Judges may inspect the source or test the demo; the rules also permit assessment from the submitted materials without personally running it. Public licensed source, setup instructions, accessible working software and the required short public demonstration remain submission gates. Ownership and permitted third-party material still matter.

The appropriate preparation is an auditable working project: explicit simulations, real provider records, reproducible tests, protected evidence and an accurate feature-status description. A local test suite or polished animation cannot stand in for a runtime NVIDIA model call or provider-backed repair.

Sources: official rules, FAQ and organizer updates listed below. No organizer-specific scanning mechanism is implemented or claimed by this preflight.

## API fit review

| Capability | Documented fit | Account/runtime evidence |
| --- | --- | --- |
| Nemotron inference | Token Factory supports the OpenAI-compatible global chat-completions endpoint; official Nemotron example publishes `nvidia/nemotron-3-super-120b-a12b`. Existing adapter follows that global endpoint. | Availability, structured-output behavior, latency, token usage, quality and account balance remain unverified until authenticated calls. |
| Isolated Jobs | Existing create/list/cancel routes and payload structure match published Jobs documentation. CPU-only jobs are documented; a GPU is not required merely to execute Python. | Project authorization, image pull, placement, resource availability and actual billing remain unverified. |
| Job timing | Published provider timeout minimum is one hour; creation usually takes a few minutes. Mend cancels actively through its backend deadline worker. | The configured sixty-second deadline starts before dispatch and may expire during provisioning. Cancellation-to-stop and total-budget feasibility remain unverified. |
| Logs | Current CLI `job logs` follow/tail flags match documentation. Published logs access is console/CLI based. | CLI installation/authentication and actual stdout-to-SSE delivery remain unverified. |
| Credits | Official FAQ distinguishes Token Factory promotional credits from AI Cloud; no separate Cloud credit grant is published there. | Inference credit redemption does not prove Jobs authorization or billing coverage. |
| Evidence readers | Constructor accepts absent readers; supplied readers must be asynchronous and bounded. Trusted report and independent stop evidence gate verified results. | Current live assembly remains deliberately gated. Keys alone do not integrate readers, monetary policy or evidence authority. |

The API contracts look relevant, but “perfectly suitable” is not established. Job provisioning is a concrete feasibility risk, not merely a missing-key issue. Keep the global inference endpoint because it is documented; do not change it based solely on the regional URL in a marketing example.

The current Jobs file-injection limit is also narrower than the local intake's total source allowance: each injected file is capped at 64 KiB. The local intake packet is preparation only. A new executable bug recipe must enforce that per-file bound or introduce a separately reviewed upload mechanism before promising arbitrary sample execution.

Context7 lookup for the exact Nebius Python SDK returned unrelated Go/solution-library entries. Those were not treated as Python API documentation. No SDK-backed changes were made. The existing REST adapter review used actual official REST documentation rather than a remembered SDK shape.

## Alternative worth measuring, not silently adopting

Token Factory now documents **Sandboxes**, specifically for isolated code execution and software-engineering agents. The overview identifies it as Beta requiring requested access. It is a candidate if short-lived Jobs cannot fit Mend's deadline, but it is not an available integration in this project today.

Before proposing a formal infrastructure delta, verify account activation, supported images, credential/project scope, actual timeout/stop semantics, networking policy, log/output provenance and credit coverage. Preserve Nebius/NVIDIA runtime evidence and trusted verification whichever runner is selected. No switch, Beta-access request or sandbox operation happened during this pass.

## Preflight command implemented

New source: `backend/scripts/phase1_preflight.py`.

From `Mend/backend`:

```bash
.venv/bin/python scripts/phase1_preflight.py --output docs/verification/phase1-prerequisites.json
```

It reads private environment configuration without serializing credentials, checks presence/shape for the existing adapter's inference/Jobs inputs and pricing metadata, reports CLI/dependency availability, and records configured limits separately from live observations. It never contacts a provider, creates a job, submits a task, mutates the database or enables release.

Exit `2` means missing/invalid local prerequisites; `0` means configured but still unverified; `1` means the local probe failed. No exit means the provider works. Even fully populated dummy fields remain `configured_unverified`, with no invented timing or receipt.

**EVIDENCE S143 — exec_command:** actual environment returned blocked, with Token Factory key, Cloud token/project, image/placement, pricing metadata and Nebius CLI absent. Actual inference/provisioning observations were `not_run`; cancellation timing was null. Raw result: `backend/docs/verification/phase1-prerequisites.json`.

The new targeted tests protect redaction, incomplete-configuration blocking and the distinction between configured values and authenticated proof. Dummy inputs are explicitly local test data, not successful provider runs.

## Fresh application/database/repository observations

**EVIDENCE S145 — exec_command, existing real Uvicorn probe:** health returned HTTP 200 in database-only mode; readiness returned HTTP 503 with provider release gated. Browser authentication, provider execution and physical job stopping remain unverified.

**EVIDENCE S146 — Supabase MCP execute_sql against the actual project:**

```json
[{"milestone_preflight":{"status":"ready","task_id":"96deff11-c0e2-4299-b5f0-b4f0a5020b7a","repair_count":0,"execution_count":0,"live_execution_enabled":false}}]
```

This is a real database read, not a new task write or an executed check. No task was modified during this preflight.

**EVIDENCE S147 — GitHub MCP get_user_login and scoped repository search:** search for Mend under the connected account returned `{"archive_filter_applied":null,"repositories":[]}`. No matching repository was returned by that search. Public repository state and a committed remote MIT license remain unverified; absence from this result is not a universal proof that no repository exists.

## Next real spike, in dependency order

1. Configure the Token Factory credential privately, confirm credit/account provisioning, and discover the configured NVIDIA model through the actual account.
2. Issue a bounded real generation. Save redacted request/model IDs, provider-reported usage, elapsed inference time and structured-output validation. Never fabricate these fields or retry an ambiguous paid request blindly.
3. Establish Cloud authorization, supported CPU placement and the pinned trusted image separately from inference access. Confirm billing coverage and task monetary policy.
4. Run an independent measurement probe rather than bypassing the public live gate. Record dispatch, provisioning, running, cancel request, cancel acknowledgement and independently observed stop. Keep ambiguous or late stop outcomes explicit.
5. Decide whether the original Jobs timing definition is achievable. If not, keep it gated and review a measured alternative or a disclosed revised allocation; do not loosen the bound silently.
6. Integrate minimum trusted report/termination and monetary authority. Prove one genuine current recipe end to end before extending generic bug contracts.
7. Complete the reviewed bug recipe with original reproduction, candidate review, actual check output and immutable comparative regression proof under the disclosed allocation.

The explicit PC-access announcement and Playwright connection are still pending. Public source and the real walkthrough remain submission-critical; optional task graphs and extra agent roles do not replace them.

## Proposed project-review/evidence-pack feature

Add a later **Verification Pack** that exports the reviewed contract, original/candidate identities, exact commands and results, model/provider provenance, regression comparisons, limits/exclusions and artifact manifest. Reports must distinguish observed, failed, missing and unverified evidence.

A project-review pass may examine authorized source snapshots for missing checks, wrong runtime claims, exposed credentials and reproducibility gaps, then propose findings for review. Model findings remain advisory until tool-verified. Describe the checked scope and observed findings, with ordinary setup instructions and evidence that a reviewer can reproduce.

This feature is planned. The implemented preflight covers local prerequisites only, not an AI scan of every repository file.

## Corrections and checkpoint

The earlier research roadmap overstated the constructor reader requirement. It now accurately states optional construction versus verified-outcome gates. Existing release gates, frontend tokens and the published demo remain unchanged.

No real Nebius operation or paid call occurred. Continue after private configuration and account checks; the raw blocked preflight makes the prerequisites concrete and reviewable.

## Primary sources

- Official rules: https://nebiusglobalaihackathon.devpost.com/rules
- Organizer AI-assisted-development guidance: https://nebiusglobalaihackathon.devpost.com/updates/46205-how-to-build-a-winning-project
- Judging guidance: https://nebiusglobalaihackathon.devpost.com/updates/46204-here-s-how-judging-works
- Credit/platform FAQ: https://nebiusglobalaihackathon.devpost.com/details/faqs
- Token Factory quickstart: https://docs.tokenfactory.nebius.com/quickstart
- Published Nemotron model example: https://nebius.com/services/token-factory/nemotron
- Serverless Jobs API, timing and logs: https://docs.nebius.com/serverless/jobs/manage
- Sandboxes Beta overview: https://docs.tokenfactory.nebius.com/sandboxes/overview
