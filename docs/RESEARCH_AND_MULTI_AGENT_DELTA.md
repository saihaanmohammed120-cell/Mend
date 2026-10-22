# Mend — research and multi-agent implementation delta

Status: researched plan; proposed features are not implemented by this document.

This delta preserves the existing PRD/TRD, curated contract, backend, frontend and Paper and Proof identity. Original videos and complete PRD pages were not supplied in this turn, so no claim is made that those unseen materials were re-reviewed. The live site was not changed. No estimate of winning probability is supported.

## Product decision

Position Mend as a coding workbench that turns a reviewed task into an inspectable patch and independently checked handoff. A genuine multi-agent extension should improve a measurable outcome: finding an overlooked edge case, lowering human review effort, or recovering from a real failed check. A longer page should expose useful task actions and evidence rather than inflate the apparent feature count.

Keep the original Coding and Agentic Engineering track. Use the established Next.js/FastAPI/Supabase/Nebius stack; do not migrate to an unrelated agent framework merely to acquire a multi-agent label.

## Evidence register

Every observation below names its source. External research is not evidence that Mend already provides a capability. Source inspection is not execution evidence. Model identity in configuration is not a successful account-specific inference call.

| Key | Tool/source | Supported finding | Limit |
| --- | --- | --- | --- |
| R1 | Web search/open: official Devpost rules | Platform/model fit, functioning submission, public licensed source, setup README and short demonstration are requirements. Technology, Design, Potential Impact and Idea Quality are equally weighted. | No guarantee of eligibility or award. Repository and submitted video remain unverified here. |
| R2 | Web open/find: organizer judging guidance | Coding-track guidance favors planning, writing, testing and iterating on a real repository. | Agent count and scrolling length are not stated scoring criteria. |
| R3 | Web open/find: organizer resources and FAQ | Promotional credits are Token Factory credits. NVIDIA runtime inference through Token Factory can meet the platform requirement without placing the unrelated frontend/backend on AI Cloud. | Account redemption and Serverless Jobs billing/access remain unverified. |
| R4 | Web open/find: Anthropic multi-agent engineering | Parallel research benefits from independent work; coupled coding tasks and coordination/token overhead make unrestricted parallelism risky. | Research-system results cannot be transferred into a Mend speedup claim. |
| R5 | Web open/find: Stack Overflow Developer Survey 2026, AI trust table | 48.0% of 14,304 optional respondents selected trust when output is easily verifiable. | Attitudes, not proof of demand for Mend; not a testimonial or conversion statistic. Attribute Stack Exchange and ODbL when reproducing the data. |
| R6 | Web open/find: METR reward-hacking analysis | Observed examples include evaluator monkey-patching and manipulating equality/scoring. | Different models/tasks; no measured rate for Nemotron or Mend. |
| R7 | Web open/find: Anthropic effective-agent and evaluation guidance | Ground-truth tool outcomes, bounded iteration and outcome-based evaluation support a controlled repair loop. | Guidance, not a measured Mend outcome. |
| R8 | Web open/find: METR methodological update | Selection and time-measurement problems weaken broad productivity conclusions. | No universal productivity claim or borrowed speedup should be marketed. |
| S126 | Architecture sub-agent, exec_command; root targeted source reads | Canonical CSV-only contract, fail-closed live bootstrap, reader dependencies, current inference accounting and missing task-list/DAG APIs. | Static code facts; runtime behavior remains unverified until executed. |
| S127 | Supabase MCP execute_sql against the actual project | Retained task is ready, with no recorded executions and release gate disabled. | Independent database read, not authenticated browser E2E or provider proof. |
| S128 | exec_command dependency probe | Active Python initially had neither FastAPI nor Uvicorn; the first attempted HTTP startup failed. | Historical failure within this turn; successful restoration requires subsequent output. |
| S129/S130 | exec_command: isolated dependency installation and actual Uvicorn HTTP probe | Backend dependencies restored; actual health returned HTTP 200 and readiness returned HTTP 503 with live gating. | Startup/readiness evidence only; authenticated browser flow and provider execution remain unverified. |
| S131 | exec_command: targeted filesystem regression suite | Four regressions passed: hardlink rejection, symlink rejection, directory rejection, and atomic replacement preserving dummy configuration after target swap. | Real temporary filesystem tests, not provider/database E2E. |

### Official submission boundary

The official deadline is October 30, 2026 at 10:00 a.m. PDT. Source: R1. Keep a working judge-accessible build free through the stated judging period, publish the required source and license, document setup and actual model/platform use, and supply the required public demonstration. The video should be under three minutes. These are release tasks, not features that may be deferred behind a dashboard expansion.

The advertised $25 promotion and an additional Builder Program offer apply to Token Factory inference. They must not be described as free Serverless Jobs capacity. Redemption remains unverified. Source: R3.

## Audience, pain and testable hypotheses

Initial audience: a developer or small team needing a bounded Python utility, beginning with the actual CSV-cleaning recipe. Repository-wide arbitrary coding is an expansion target, not current support.

| Pain or failure | Proposed response | Evidence needed before a product claim |
| --- | --- | --- |
| Plausible code still misses an edge case | Reviewed immutable checks and real execution before a passing receipt | Same candidate identity, actual command and complete check outcomes |
| Debugging requires reconstructing the agent's changes | Attempt ledger with exact stderr, source diff and result | Persisted attempt/source identities; understandable handoff during a real task |
| A long autonomous run becomes unpredictable | Visible shared budget, bounded repairs and observed stopping status | Inference/provisioning latency and independently confirmed provider stop |
| Refresh or transport failure loses progress | Recover the task from durable events and snapshots | Browser reconnect/reload evidence without duplicate execution or receipt printing |
| More agents produce conflicting patches | Single writer, read-only reviewer, coordinator-controlled application | Conflict and stale-candidate rejection, with usage charged to the same task |
| A green result overstates verification | Receipt names exact checks and exclusions | Protected evaluator plus trusted report/source/artifact binding |

These responses are design hypotheses. No customer interviews, usability results or user productivity measurement were conducted in this research pass. Future interviews should ask developers to review an actual failed and repaired task, observe time spent finding the cause, and record confusion rather than solicit flattering quotes.

## Current architecture constraints discovered

- `backend/mend/domain.py` accepts only the exact canonical `csv-cleaner-v1` contract. New recipes require explicit reviewed contracts and validation changes.
- `backend/mend/bootstrap.py` blocks `live_enabled=True`. Its live runner composition lacks the required trusted report and independent termination readers. Adding keys alone cannot unlock a functioning live execution path.
- `backend/mend/runner.py` accepts absent readers at construction; supplied readers must be asynchronous and bounded. Trusted report and independent termination evidence are needed before an observation can substantiate a verified outcome. Cancellation acknowledgement must not be substituted for an independently observed stopped job.
- `backend/mend/service.py` reserves inference usage through `_generate()`. Additional reviewer calls cannot bypass that path, create a separate token wallet, or silently restart the task deadline.
- `backend/mend/supervisor.py` is the authority boundary for report identity and exact command/check outcomes. A model's claim that checks passed is not verification.
- The migration and current frontend include persisted `draft` and `finalizing` states. The older unresolved state-label mismatch must not be carried into this delta. No new role-specific task states are needed initially.
- `parent_task_id` exists in SQL, but the current APIs do not implement task listing, task graphs or dependent starts. A parent column alone does not establish a multi-task pipeline.
- The execution flow generates before the first candidate check. A faulty starter does not guarantee a real failure/repair demonstration. Never sabotage generated code to manufacture the desired hero sequence.

## Proposed multi-agent architecture

### First release: observable responsibilities

Show a role-aware timeline from actual contract, persisted events, attempts and validated receipt data. This introduces no additional model calls. Label provenance clearly:

| Role | Input boundary | Output | Authority |
| --- | --- | --- | --- |
| Contract planner — deterministic | Supported task prompt and selected curated recipe | Reviewed commands, editable paths, protected checks and budgets | Proposes; owner review freezes the contract |
| Writer — Nemotron | Frozen contract and permitted source | Complete candidate replacements | Cannot alter checks, commands, budgets or credentials |
| Checker — isolated execution | Immutable candidate and trusted harness | Command/check outcomes and bounded logs | Candidate stdout is untrusted; independent report is required |
| Repairer — Nemotron | Same contract, prior candidate and bounded failure diagnostics | Replacement candidate within remaining shared budget | Repairs only allowed files; never awards success |
| Receipt verifier — backend | Trusted report, candidate and artifact identities | Bound receipt or explicit rejection | Sole authority for a verified handoff |

This is a pipeline of responsibilities, not proof of multiple independent model agents. Do not claim an autonomous agent team until separate contexts, calls, outputs and accounting exist and a real run records them.

### Measured extension: independent read-only reviewer

Introduce a separate Reviewer context after the baseline real loop is proven. The reviewer receives a frozen candidate snapshot and explicit acceptance criteria. It returns structured advisory findings: candidate identity, permitted path, severity, check relation and concise actionable explanation. It cannot write files, execute arbitrary commands, change acceptance checks, approve a receipt, retrieve credentials or loosen limits.

The coordinator validates findings and hands relevant feedback to the single Writer/Repairer. Reviewer output is untrusted input and must be bounded, schema-checked and tied to the current candidate. A stale finding cannot repair a later candidate. Duplicate findings do not create duplicate work.

All model roles use the existing task-wide token/cost/deadline accounting. Default mode retains the original initial generation plus up to three repairs. Reviewer mode remains disabled until an explicitly versioned contract defines its call allocation and measures whether it fits. A reviewer call may reduce available repair calls under an unchanged call ceiling; the UI must disclose the effective allocation. It must not silently add calls to the old budget or promise the original allocation after consuming it elsewhere.

The configured model ID is `nvidia/nemotron-3-super-120b-a12b`. Availability, latency and comparative quality remain unverified until a live call. Nano versus Super routing should be evaluated against the same acceptance criteria; do not introduce Ultra merely for branding or assume its API ID.

### Later: dependent task graphs

Start with reviewed sequential children. A child starts only after its prerequisites have verified acceptable outcomes. Each child has its own frozen contract; the parent also has a reviewed aggregate token, time and monetary budget. Multiplying child tasks must not multiply an undisclosed spending allowance.

Required capabilities before enabling this mode: owner-authorized listing, durable graph records, cycle rejection, immutable dependency edges during execution, idempotent start, stale worker fencing, cancellation propagation, artifact identity transfer and explicit partial-failure policy. Existing `parent_task_id` is a starting point, not the implementation.

Avoid parallel writers on overlapping paths. Independent read-only reviews may run concurrently only after measured queue/inference costs and cancellation semantics justify them. Keep arbitrary repository credentials, package installation and unrestricted shell tools outside the first release.

## Safety and stop-bound honesty

Current source configuration contains a sixty-second per-job deadline, three repairs, four maximum executions, a ten-minute task budget and a thirty-thousand-token cap. These are configured limits, not measured provider guarantees.

Retain the backend deadline worker that actively requests cancellation. Do not restore wording that a provider timeout parameter enforces a sixty-second job stop. The spike must distinguish deadline expiry, cancel request, cancel acknowledgement and independently observed stop. Record both queue/provisioning and running intervals. A delayed or unknown stop keeps the run inconclusive and the live release gate closed.

Measure cancellation-to-stop on a deliberately long-running bounded probe whose purpose is disclosed. Never mix that probe with user artifacts or count it as successful task repair. If the observed stop exceeds the promised bound, report the failed feasibility gate and revise the supported release behavior before advertising a hard guarantee. One observation is feasibility evidence, not a percentile or universal guarantee.

## Deeper scrolling experience

Preserve every existing color, typography, radius, border, shadow, focus and motion token. No new neon, glass, scroll hijacking, fake busy agents, automatic counters or marketing claims. Pointer tilt stays imperative and bounded; reduced motion takes precedence. Every section has a useful task action or explains the evidence needed for the next action.

| Page section | Content and action | Data/gate |
| --- | --- | --- |
| Hero workbench | Prompt/review action, concise repair loop and visible real limits | A simulated loop stays labeled; a real replay identifies its recorded run |
| Task recipes | Supported CSV example and its acceptance scope | Other recipes visibly planned/disabled until supported by backend contracts |
| Responsibility timeline | Contract, writing, checking, repair and handoff stages | Persisted events; unknown activity says not recorded |
| Contract desk | Exact commands, check IDs, editable scope and exclusions | Returned reviewed/frozen contract; owner action before execution |
| Attempt ledger | Continuous code numbering, diff, exact failures and outcome | Actual candidate/attempt identity; no invented stdout or counter increments |
| Handoff dock | Code/archive and receipt actions | Existing receipt validation and actual artifact availability |
| Unsuccessful handoff | Last candidate, unresolved checks and suggested next action | Cannot print a success receipt; unavailable downloads stay unavailable |
| Evidence and limits | Observed timings, model/run identity, configured bounds and exclusions | Only measured values; no fabricated performance score |

Use normal scrolling and compact anchors. Keep the task composer reachable without forcing a judge through every section. Explanatory copy may appear before backend implementation, but actions must accurately disclose unavailable functionality. Do not turn internal SDK details into product copy unless they help assess evidence or limits.

## Ordered implementation tickets

| Ticket | Scope and file boundaries | Acceptance gate | Status |
| --- | --- | --- | --- |
| ENV-RESTORE | Isolated backend environment using declared project dependencies | Existing real FastAPI app starts; literal HTTP output recorded | Completed for this environment; reusable probe added |
| CORE-HTTP-DB | `api.py`, `bootstrap.py`, real Supabase repository, existing verifier | Authenticated application write/read plus independent Supabase MCP query; no fake actor | Historical service proof; full browser E2E unverified |
| SPIKE-REAL | Independent measurement harness around actual provider clients; no public gate bypass | NVIDIA model request ID, job ID, inference/queue timings, cancel acknowledgement and independently observed stop | Blocked on credentials/placement/image/billing prerequisites |
| AUTHORITY-INTEGRATE | `runner.py`, `supervisor.py`, report/termination adapters, bootstrap assembly | Trusted source-bound check report and independent termination reader; genuine end-to-end task | Pending spike; minimum authority is required for a verified receipt |
| SUBMISSION-READY | Repository visibility/license/README and public recorded walkthrough | GitHub MCP confirms actual public state and committed license; real recording produced | Unverified; must precede optional expansion |
| PIPELINE-VIEW | Proposed `frontend/lib/pipeline.ts`, `components/pipeline-timeline.tsx`, existing workbench | Evidence-only projection, replay safety, exact results, Playwright rendering | Planned; PC setup still pending |
| REVIEWER-EXPERIMENT | Versioned reviewer contract and shared usage accounting in service/inference | Paired baseline/reviewer runs show value under the same declared constraints | Planned, disabled by default |
| HISTORY-RECIPES | Owner-scoped listing and each separately reviewed recipe | Real database isolation and E2E for each enabled recipe | Later |
| DEPENDENT-TASKS | Durable parent-child graph and sequential coordinator | Ownership, cycle, cancellation, budget and partial-outcome verification | Later |

Before code edits against FastAPI, Next.js, Supabase client or Nebius SDK, resolve the exact library through Context7 and retrieve the relevant documentation. Database behavior requires actual Supabase MCP output. UI correctness requires exposed Playwright MCP and real rendered evidence. Existing completed files should be changed only where the next ticket requires it.

## Evaluation and judge story

Run the baseline and reviewer variant against the same frozen contracts, model version, starting source and declared budget. Separate rehearsed hero tasks from held-out variations. Record outcomes even when no repair is needed or a task fails. Capture input/output tokens from provider usage, not estimates; report cost only from documented pricing. Treat unknown provider completion as ambiguous rather than automatically issuing another paid call.

Useful measurements are accepted artifacts, exact fail-to-pass outcomes, false-positive reviewer findings, human interventions, inference latency, queue/provisioning latency, running time, cancellation-to-stop time and total task time. Publish raw records and denominator definitions before aggregates. Small samples do not justify universal reliability or productivity claims.

Submission narrative: show the reviewed task, real model generation, isolated check, actual repair when it occurs, protected-check integrity and identity-bound handoff. Show a controlled failure or stopping outcome as evidence of limits. Explain the independent reviewer only if its recorded output changed an observable result. Never represent a scripted failing/passing animation as live inference evidence.

## Risk register and fallback decisions

| Risk | Early signal | Response |
| --- | --- | --- |
| Job stops too late | Independent stop timestamp misses deadline | Fail feasibility gate; keep live gated and report supported limits honestly |
| Reviewer consumes budget without useful findings | Added latency/tokens, duplicate or wrong findings | Keep baseline default; remove reviewer from submission claims |
| Candidate edits the grader | Protected identity mismatch or harness anomaly | Reject attempt; preserve diagnostic record; never award a receipt |
| Provider accepts a request but transport times out | Missing completion/job identity with ambiguous dispatch | Reconcile before retry; charge/reserve conservatively |
| State/event replay creates duplicate actions | Repeated sequence or stale candidate identity | Dedupe by durable IDs; fence stale workers and views |
| More recipes hide weak validation | A recipe lacks independent executable checks | Leave disabled; ship the original bounded recipe well |
| Hero story depends on forced failure | Generation already passes or edited demo fixture | Record the genuine outcome; label any simulation clearly |
| Judge cannot access the build | Login/service failure or expiring hosting/credits | Provide tested access instructions and maintain availability through judging |

## Sources

- R1: https://nebiusglobalaihackathon.devpost.com/rules
- R2: https://nebiusglobalaihackathon.devpost.com/updates/46204-here-s-how-judging-works
- R3: https://nebiusglobalaihackathon.devpost.com/resources and https://nebiusglobalaihackathon.devpost.com/details/faqs
- R4: https://www.anthropic.com/engineering/multi-agent-research-system
- R5: https://survey.stackoverflow.co/2026/ai/data/ai-trust — Stack Exchange Inc., ODbL 1.0 attribution
- R6: https://metr.org/blog/2025-06-05-recent-reward-hacking/
- R7: https://www.anthropic.com/engineering/building-effective-agents and https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- R8: https://metr.org/blog/2026-02-24-uplift-update/

## Resume checkpoint

Run the reusable probe from `Mend/backend` with `.venv/bin/python scripts/verify_http_preflight.py --output docs/verification/research-resume-preflight.json`. It loads the private environment without printing it, forces database-only mode, starts the existing real app, verifies startup and fail-closed readiness, and shuts down the process. It does not submit a task or job and does not establish database behavior by itself.

Literal independent database query result from S127:

```json
[{"resume_preflight":{"status":"ready","task_id":"96deff11-c0e2-4299-b5f0-b4f0a5020b7a","repair_count":0,"execution_count":0,"contract_version":2,"live_execution_enabled":false}}]
```

The real HTTP record is `backend/docs/verification/research-resume-preflight.json`. Current source additions are the startup probe, credential-safe output regressions and this planning delta. The probe was reviewed and changed from direct truncating output to atomic owner-only replacement; aliases of private environment files are rejected before startup. No task was created, no provider call was made, and the live site was not edited during this slice.

Wait for the explicit PC-access announcement before Playwright setup. Keep provider execution deferred until the prerequisites are supplied and the real measurement harness is ready. Continue with genuine authenticated execution evidence; do not turn this proposed backlog into live UI claims. The existing daily reminder was created previously; delivery was not checked during this research pass.
