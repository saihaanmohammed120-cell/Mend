# Mend — UI/UX Design Brief

**Stage:** 4 in the supplied video workflow: PRD → TRD → AppFlow → UI/UX Design Brief → Backend Schema.  
**Version:** 1.2 · 11 October 2026  
**Audience:** Product designer, interaction designer, frontend engineer, backend engineer, hackathon reviewer.  
**Baseline:** Corrected PRD and `TRD.md` v1.2, and `APP_FLOW.md` v1.1.  
**Companions:** `UI_UX_DESIGN_BOARDS.pdf`, `UI_UX_DESIGN_REFERENCES.md`, and `PLAN_AUDIT.md`.

## 1. Design decision

Mend’s direction is **Paper and Proof**: a bright, tactile coding workbench that turns a brief into a checked change and a physical-looking receipt. Code is the main working surface. The repair trail explains the work. The receipt records the handoff.

The experience must feel carefully authored in its typography, spacing, materials, and transitions. Personality comes from a raised task card, an orange working edge, numbered attempt markers, a paper receipt, and precise language. Keep the interface compact enough for daily work; cinematic moments occur at meaningful transitions.

The design boards show proposed layouts and clearly labeled example evidence. They are static design studies, not implemented screens, measured runs, or proof of working provider integration.

### Audited foundation

| Decision | Design consequence |
|---|---|
| Three repairs; maximum four code executions | Separate repair and run counts; never imply an unlimited loop |
| Hard 60-second total job lifetime | Show the limit in contract review; live execution remains blocked while enforcement is unresolved |
| Nebius native timeout has a one-hour minimum | Only the backend worker requests cancellation at 60 seconds; measured stop latency gates readiness; no invented 60-second provider setting |
| Receipt persisted before success | Persisted backend `finalizing` precedes printing and verified download |
| Task review and Start are separate | Persisted backend `draft` permits safe edits; Start freezes the reviewed contract exactly once |
| Cancellation and completion are serialized | Cancellation recorded first blocks success; an already completed task stays completed |
| Next.js 14 is the requested legacy stack | Preserve the prototype baseline; production requires an explicit support/version decision |

The brief specifies a complete target experience. Provider readiness and actual implementation remain separately testable gates. Nemotron 3 variant selection and a live API call, measured cancellation-to-stop latency, and measured fit within the 10-minute task budget are Phase 1 readiness requirements; a cancellation request at 60 seconds is not confirmed termination by 60 seconds.

## 2. Research synthesis and reference discipline

The reference sweep attempted **120 sources**. Public content was retrieved from 96; nine returned limited content and 15 were unavailable. The companion index records each result. This is a broad source screen, not a claim that 120 paid libraries, authenticated applications, or full animation demos were visually inspected.

The named example is resolved to **[MotionSites](https://motionsites.ai/)**. Its public pages describe prompts and motion-led website direction. The prompts in Section 11 are original Mend specifications; no paid prompt or template purchase is implied.

| Selected reference | Relevant observation or research focus | Mend interpretation |
|---|---|---|
| [Linear redesign article](https://linear.app/now/how-we-redesigned-the-linear-ui) | Its team discusses alignment, chrome, hierarchy, and testing multiple interface states | Quiet navigation; consistent panel headers; stress-test the entire workbench |
| [MotionSites](https://motionsites.ai/motionsite) | Public positioning connects motion with typography, structure, and restraint | One clear visual direction; meaningful transitions; detailed prompts |
| [Mobbin](https://mobbin.com/) and [Nicelydone](https://nicelydone.club/) | Public app/flow libraries provide a research starting point | Use complete task journeys when evaluating layouts, not isolated hero screens |
| [Framer Marketplace](https://www.framer.com/marketplace/templates/) and [Land-book](https://land-book.com/) | Public template/gallery discovery | Explore composition and whitespace; adapt to a tool’s working density |
| [Carbon notifications](https://www.carbondesignsystem.com/building-blocks/core/components/notification/guidelines) | Public notification guidance | Put actionable run failures inline; reserve transient notices for small confirmations |
| [GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/) | Public form error pattern | Link a review summary to specific invalid fields and checks |
| [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) and [Tabs](https://www.radix-ui.com/primitives/docs/components/tabs) | Documented modal focus and tab interaction patterns | Keyboard-safe drawers and tabs; custom Mend styling |
| [Motion accessibility](https://motion.dev/docs/react-accessibility) and [transitions](https://motion.dev/docs/react-transitions) | Documented reduced-motion support and physics springs | Shared 100/10 spring; explicit motion fallback |
| [W3C WAI](https://www.w3.org/WAI/) | Accessibility standards and implementation guidance | Measured contrast, visible focus, semantic states, accessible targets |

These are design inputs, not evidence that any specific reference uses Mend’s colors, job logic, or receipt interaction. Gallery ideas are candidates; public primary guidance supports technical/accessibility decisions.

### Selection filter

Evaluate each idea for task clarity, evidence readability, originality within Mend’s identity, accessibility, mobile fit, and implementation cost. Keep an idea only when it improves the workbench without weakening an existing requirement.

Adopt precise alignment, progressive disclosure, paper depth, purposeful transitions, and readable status hierarchy. Exclude animated background video, cursor replacement, scroll hijacking, neon halos, excessive blur, ornamental bento metrics, constant text scrambling, sound effects, and robot chat avatars. Reference breadth should produce one coherent system rather than a mixture of template styles.

## 3. Visual system

### 3.1 Color and surface tokens

| Token | Value | Allowed use |
|---|---|---|
| `canvas` | `#F5F2EA` | Warm paper background |
| `surface` | `#FFFFFF` | Cards, code, receipt |
| `ink` | `#18201B` | Main text, active outlines, hard shadows |
| `accent` | `#FF5B23` | Primary action fill, working edge, active marker |
| `success` | `#183E32` | Check text/icons; dark success stamp with white text |
| `danger` | `#B42318` | Failure text/icons and inline alert edge |
| `muted` | `#5B615B` | Supporting text |
| `control-border` | `#717971` | Input outlines; not normal body text |
| `divider` | `#D8DDD5` | Decorative separation only |
| `success-tint` | `#EDF4EE` | Added diff lines and successful-check surface |
| `error-tint` | `#FFF0EC` | Removed diff lines and failure surface |

Use a static, small repeating noise asset at 5% opacity on the canvas only. It must be decorative, non-interactive, and absent from code, forms, and receipt text. No animated grain, filter over the entire app, or generated background image is required.

**Elevation:** Main task/code/printer panels use `8px 8px 0px #18201B`. Primary controls use `4px 4px 0px #18201B`. Smaller nested evidence rows have no offset shadow. Avoid stacking multiple large shadows inside the same panel.

**Shape:** Main panels: 20px radius and 2px ink border. Inputs/buttons: 12px radius. Small status pills may be fully rounded. Receipt paper uses 2–4px corners; a modest perforation edge is decorative and outside the readable content.

**Focus:** A 3px ink outline with a 3px paper/white gap, clear of surrounding borders and shadows. Focus is never indicated solely by orange fill.

### 3.2 Contrast verification

Calculated from the solid sRGB tokens using relative luminance; values are rounded for display. Actual rendered components, opacity, overlays, hover states, and textures still require verification.

| Foreground / background | Ratio | Decision |
|---|---|---|
| Ink / paper | 14.88:1 | Normal text allowed |
| Ink / white | 16.65:1 | Normal text allowed |
| Ink / orange | 5.37:1 | Primary button label allowed |
| White / orange | 3.10:1 | Do not use for normal-size button labels |
| Forest / white | 11.84:1 | Success text allowed |
| Red / white | 6.57:1 | Error text allowed |
| Muted / white | 6.35:1 | Supporting text allowed |
| Control border / white | 4.49:1 | Control boundary allowed; not normal text |
| Control border / paper | 4.01:1 | Control boundary allowed; not normal text |

Target WCAG 2.2 AA. The product’s 44px control target is a deliberate usability standard, stricter than the 24px AA minimum with exceptions described by W3C. Do not equate a token calculation with a conformance audit.

### 3.3 Typography and rhythm

| Role | Font / size / line height | Weight |
|---|---|---|
| Wordmark | Inter/system, 28 / 32px | 700 |
| New-task headline | Inter/system, 44 / 48px desktop; 32 / 36px mobile | 650–700 |
| Task title | Inter/system, 28 / 34px | 600 |
| Panel heading | Inter/system, 18 / 24px | 600 |
| Body and input | Inter/system, 16 / 24px | 400 |
| Labels and evidence | Inter/system, 14 / 20px | 500 |
| Code/logs | IBM Plex Mono/system mono, 14 / 22px | 400 |
| Metadata | Mono, 12 / 18px | 400 |

The 44px new-task headline is a dedicated entry-screen treatment; ordinary workbench titles retain the PRD’s 28–32px scale. Avoid tiny all-caps copy except short section markers. Long hashes wrap or truncate with a complete copy/expand action. Do not letter-space body text.

Spacing uses 4px increments: 8px between related labels, 16px within a component, 24px between sections, and 32px for major panel padding. Main mobile padding is 20px within cards and 16px at the page edge. Keep label baselines aligned across rails.

## 4. Layout and navigation

The workbench is the home screen. Use a compact header with the Mend wordmark, New task, Recent work, and account access. No landing-page detour is required.

### Layout measurements

| View | Grid and spacing |
|---|---|
| 1440px desktop reference | 40px outer margins; 1360px workspace; 224px context + 752px code + 336px evidence; two 24px gaps |
| 1280px desktop reference | 32px outer margins; 1216px workspace; 200px context + 656px code + 320px evidence; two 20px gaps |
| 1024–1279px | 24px outer margins; context becomes a drawer; flexible code area + 320px evidence; 24px gap |
| 768–1023px | 24px margins; one main column; evidence below code; context in a drawer |
| 320–767px | 16px margins; one column; Files / Changes / Checks tabs; all panels fit available width |

At desktop widths above 1440px, cap the workspace at 1440px and center it. The code pane absorbs remaining space. Do not preserve three columns if zoom or text enlargement makes the main pane unreadable; reflow according to available CSS width.

Header height is approximately 72px desktop and 64px mobile. Task summary follows in normal document flow with a compact sticky active-task control area where appropriate. Sticky elements must not hide focused controls or consume excessive short-screen height. Keep Stop visible, with a 44px target, without covering content.

Desktop panes may be resized within sensible minimums. Provide a keyboard-accessible separator and a Reset layout action; persist only layout preferences. On mobile, tab selection does not reset code, attempt selection, or log position.

## 5. Required screen specifications

### S01 — New task

**Goal:** Make the first useful action obvious.

Place one white raised card, approximately 760px maximum width, toward the main visual axis. A small “01 / Brief” marker introduces a 44px headline: **“Make something work.”** Keep the paper background visible around the card; use the empty space as part of the composition.

Inside: a labeled 180px-minimum textarea, curated starter choices, bounded pasted/file inputs, a concise execution-limit line, and **Review task**. Examples are explicit presets, not suggestions that overwrite existing text without confirmation.

Show size/type errors inline. Empty submission remains disabled with explanatory supporting text. An unsupported task should explain the supported Python scope. Preserve draft text through account access in session storage; do not cache source uploads by default.

### S02 — Contract review

**Goal:** Establish a clear, testable agreement before dispatch.

Use a review sheet within the same workspace: expected behavior, editable paths, entry point/runtime, named mandatory checks, limitations, and **60 seconds per job / 3 repairs maximum**. Technical details expand on demand; important limits remain visible.

Primary action: **Start Mend**. Secondary: **Edit brief**. A valid proposal is editable until Start. Start submits the expected contract version; a stale version returns an inline conflict and reloads the proposal for review.

Where live feasibility is blocked, disable live Start and display **“Live execution is not ready.”** Expandable details explain that the backend requests cancellation at 60 seconds and measured stop latency may make the hard bound infeasible; measured inference/provisioning must also fit the 10-minute total. Do not falsely claim a provider outage. A separate **Open labeled demo** action may show curated design/demo evidence without pretending to execute the submitted task.

### S03 — Writing and waiting

**Goal:** Explain activity without fabricating progress.

Condense the brief into the persistent task summary. Reveal context, code, and evidence regions once. In Writing, the code panel explains that no accepted patch is available yet; display validated source only after it is received. In Waiting, show the actual job submission/deadline data and honest elapsed time.

Use status words and a small activity indicator; do not show a percentage without a meaningful denominator. Overall elapsed time starts at contract freeze. A job countdown reflects the conservative persisted deadline, not an independently invented browser timer. Connection interruption has its own banner and does not change the backend state.

### S04 — Running checks

**Goal:** Keep the code readable while evidence arrives.

The code panel has Source / Changes tabs, file path, Copy code, and a stable scroll region. The evidence rail has named checks, a numbered attempt trail, and Checks / Logs / Details tabs. Only one tab family controls each region.

Required check rows use states: Not run, Running, Passed, Failed, Skipped, or Unavailable. Unknown/incomplete checks never appear passed. Show supplemental tests separately and identify model-proposed checks as such. Do not claim independent assurance from model-written checks alone.

Show **Run 1 of 4** independently from **Repairs used: 0 of 3**. Failed generations can consume repair budget without starting another run. Increment counters only from authoritative events.

### S05 — Repair in progress

**Goal:** Explain why another run exists.

Show the failing check first, then the affected file and focused diff. Example copy: **“The empty-input check failed. Preparing a repair.”** Keep earlier attempt markers available. New markers enter once; earlier failures remain visible even after a later pass.

Added and removed lines use pale forest/red fills, explicit `+`/`−` markers, and accessible labels. Do not rely on color alone. The selected file and editor position remain stable; long diffs have Previous change / Next change controls. On narrow screens, use a unified diff rather than squeezing two source panes together.

### S06 — Finalizing and successful handoff

**Goal:** Deliver exactly the checked snapshot.

The persisted backend `finalizing` state displays **“Saving the verified result…”** while retaining passed check evidence. No printed receipt or verified download is offered until persistence succeeds. If the budget expires, use **“Checks passed; receipt unavailable”** with retained diagnostics; do not label the tests failed.

After the committed receipt event, reveal the printer panel. Paper emerges downward through a fixed slot; the code pane remains the main artifact. The receipt’s first lines are **“Required checks passed”**, task title, and named check totals. Follow with runs/repairs, duration, snapshot reference, reproduction commands, and explicit omitted behavior.

Primary action: **Download code**. Secondary: **Review changes**, **View receipt**, and receipt JSON download. If artifact authorization or download fails, show a local error and retry without undoing the historical successful check result. If the artifact hash is wrong, block verified delivery and mark verification error.

Receipt content can be read immediately; animation cannot gate interaction or screen-reader access. Opening history shows the existing receipt without replaying the printing effect.

### S07 — Incomplete, stopping, and stopped

**Goal:** Preserve useful work and explain the next decision.

Keep the code/diff and evidence. Use an inline outcome panel for repair limit, repeated failure, total-task budget, job timeout, unavailable inference/runner, invalid patch, and unverifiable results. A timeout is not automatically a code defect; do not consume repairs to rewrite code merely because provisioning failed.

Primary action depends on the cause: **Edit task** for scope/check failure; **Retry as new task** for recoverable infrastructure failure. Secondary: **Download unverified code** where a source snapshot exists. No success receipt appears.

Stop records cancellation immediately without a confirmation dialog. **Stopping…** remains until termination is confirmed; failure to confirm is **“Termination not confirmed”**, with further work blocked. A completed task has no active Stop control. Closing a tab does not cancel execution.

### S08 — Recent work, receipt detail, access, and expiry

Recent work is a right-side drawer, at most 420px wide on desktop and full-width on small screens. Each row includes title, created date, state, and repairs used. It opens the existing task. P1 search/filtering is deferred; no non-working search field appears in the MVP.

Receipt detail at `/tasks/{id}/receipt` is a durable semantic document with source download, JSON download, check evidence, and reproduction details. Print styling removes controls and decorative shadows while preserving all evidence and caveats.

Account access returns to the preserved draft. Loading an owned task uses a quiet skeleton for layout stability. Unknown/unauthorized links reveal no task information. Expired work explains the 24-hour retention policy without promising recovery. Empty history offers New task.

## 6. Component system and variants

| Component | Required variants | Contract |
|---|---|---|
| `WorkbenchShell` | Entry, active, terminal, narrow | Shared landmarks, header, spacing, readable content order |
| `TaskCard` | Empty, filled, invalid, preparing, review | Tilt only on fine-pointer hover; stable typing and focus |
| `ActionButton` | Primary, secondary, danger; idle/loading/disabled/focus | 44px target; visible label; stable width during loading |
| `TaskStatus` | Every lifecycle state + independent connection status | Backend-driven words/icons; no optimistic completion |
| `ContractSheet` | Proposed, invalid, conflict, ready, frozen, blocked | Version displayed in details; Start only for reviewed valid version |
| `FileRail` | Empty, selected, changed, protected | Protected path identified; keyboard selection |
| `CodePanel` | No source, accepted source, unified diff, error | Selectable text; wrap toggle; copy feedback local to action |
| `AttemptTrail` | Current, failed, passed, stopped | Real execution ordinal; stable selection; evidence per attempt |
| `CheckRow` | Not run, running, passed, failed, skipped, unavailable | Name and outcome in text; required/supplemental distinction |
| `LogPanel` | Following, paused, disconnected, truncated, empty | Jump to latest; append without focus theft; text-only rendering |
| `PrinterReceipt` | Slot-only, finalizing, printing, printed, reduced-motion | Requires persisted receipt; no replay on restored completion |
| `OutcomePanel` | Limit, timeout, unavailable, invalid, verification error | Cause-specific explanation and next action |
| `RecentWorkDrawer` | Loading, empty, populated, expired, denied | Focus containment; Escape closes; focus returns to trigger |
| `Notice` | Inline actionable, persistent connection, transient confirmation | Never hide a terminal failure only inside a toast |

Use one icon family: lucide-react. Suggested icons are FileCode2, Files, Check, CircleAlert, Clock3, Square, Download, ReceiptText, ChevronDown, RotateCcw, Copy, and WifiOff. Resolve exact exports against the installed package before implementation; names here specify intended semantics, not a completed import audit.

Custom styles should sit on semantic, tested primitives where appropriate. Radix/headless patterns are reference options, not a requirement to install every component library in the atlas. Avoid accumulating GSAP, Rive, Lottie, and multiple animation runtimes; Framer Motion is the selected implementation.

## 7. Motion and 3D specification

| Interaction | Specification | Reduced-motion behavior |
|---|---|---|
| Entrance | Spring `type: spring`, stiffness 100, damping 10; translation ≤16px; 50ms stagger, capped at 200ms total delay | Immediate or ≤100ms opacity change |
| Hover depth | Perspective 1200px; rotateX/rotateY within ±3°; decorative layers ≤8px Z | No transforms |
| Card return | Shared spring back to neutral on pointer exit | Already neutral |
| Button press | Visual surface moves at most 2px toward shadow; hit target stays fixed | Static pressed-color/border feedback |
| Contract transition | Preserve task identity; small layout transition, no full-page wipe | Immediate layout update |
| Repair marker | One short entrance per new marker; stable existing trail | Immediate append |
| Receipt printing | Paper moves from above the slot to final position using shared spring; clip wrapper only | Paper immediately visible |
| Drawer | Restrained spatial entry using shared spring; backdrop does not blur page | Immediate open with focus management |

Physics springs do not receive an invented mandatory 120–180ms duration. Keep displacements small and validate settling on actual devices. All major entrance elements use the shared spring; incoming logs and already-mounted evidence do not repeatedly animate.

Suspend tilt while the textarea or interactive descendants are focused, while a menu is open, during drag selection, on coarse pointers, and under reduced motion. Pointer movement updates transforms without creating a React render for every pixel. Shadows and text stay crisp. The card must never clip a focus ring.

The receipt uses three layers: printer body, clipping viewport with paper, and foreground slot lip. Reserve the final receipt height to avoid moving nearby actions. Paper may have a fine perforation motif; hashes/checks remain on a flat, high-contrast surface. No confetti, autoplay sound, or printing delay that blocks downloads.

## 8. Accessibility and interaction rules

Use semantic header, navigation, main, section headings, forms, buttons, lists, and code regions. Decorative texture and receipt perforations are hidden from assistive technology. Do not announce the printer effect as evidence separate from its success status.

Tabs follow an established keyboard pattern: arrow keys change focus; activate using Enter/Space when loading is not immediate. Modals trap focus, support Escape, and restore focus to the opener. Resizable panes include keyboard controls and accessible names. A Skip to main content link appears on focus.

Associate errors with inputs and provide an error summary linking to invalid fields after attempted review/start. Do not autofocus every status change or yank focus into the receipt. Announce major state transitions through a polite live region; announce blocking errors once. Raw stdout remains selectable and silent by default.

Support 200% text zoom and reflow to 320 CSS pixels. Sticky elements leave focused content visible. Code may scroll within a labeled region because of its two-dimensional content; surrounding navigation and forms must reflow. Do not make tiny text the only way to fit mobile content.

Mend’s 44px targets apply to key controls and icon buttons; dense attempt rows provide equivalent padded hit areas. Focus, hover, selected, busy, disabled, empty, error, and reduced-motion variants must be represented in the component handoff.

## 9. Copy and evidence integrity

| Situation | Preferred copy |
|---|---|
| First draft | Writing the first draft |
| Runner provisioning | Waiting for the runner |
| Execution | Checking the work |
| Repair | Repairing the empty-input check |
| Persistence | Saving the verified result… |
| Success | Required checks passed |
| Repair exhaustion | Repair limit reached |
| Repeated failure | The same check is still failing |
| Connection loss | Connection interrupted. Reconnecting… |
| Cancellation pending | Stopping… |
| Cancellation unresolved | Termination not confirmed |
| Persistence budget expired | Checks passed; receipt unavailable |
| Live readiness blocked | Live execution is not ready |

Avoid “thinking deeply,” “AI magic,” “100% correct,” “production-ready,” and fabricated explanations of internal reasoning. Short summaries describe recorded failures and accepted patches; no chain-of-thought panel is part of the product.

Show actual model identity and job evidence in Details and the receipt, rather than hardcoding a provider/model badge before verification. Actual task results override curated examples. Date/time displays include understandable local formatting; evidence retains UTC timestamps and exact durations. A fixture always says **“Example data — design study”** or **“Demo — simulated evidence.”**

## 10. Performance and frontend handoff

Use transform/opacity for spatial motion, a small static texture, and a limited font set. Avoid full-screen video, heavyweight 3D libraries, runtime noise generation, and dependency additions solely for decoration. Lazy-load code highlighting and large history views; limit rendered log rows while preserving selectable/downloadable evidence and replay.

At a representative 1440px layout, reserve regions so new statuses and receipt printing do not unexpectedly move controls. Disable expensive motion for reduced motion and constrained devices; keep interaction immediate. Performance budgets are targets, not measured results: no visible layout shift from the receipt, responsive typing, and smooth small transforms on representative mobile hardware.

Frontend handoff must map `draft`, `ready`, `writing`, `waiting_runner`, `running`, `fixing`, `finalizing`, `passed`, `needs_help`, `runner_unavailable`, `stopping`, and `stopped` to explicit views. Connection, download, and local validation states are separate from backend lifecycle status.

`draft` and `finalizing` are persisted backend states included in the TRD Section 6.1 `tasks.status` check constraint. Show Draft after owned task creation commits `status: draft`; show Ready after validated proposal commit and Writing after explicit Start freezes the contract. A local unsaved input remains form state and is not a persisted task. Show Finalizing only after the backend commits a verified `running` → `finalizing` transition and emits its durable `state` event. Transient receipt-write failures keep that state. A committed `receipt` event transitions it to `passed`; budget expiry commits `needs_help` with a `failed` event and reason `receipt_unavailable`; cancellation commits `stopping`, then `stopped` after termination confirmation. Refresh/reconnect restores the stored status. Neither label is inferred from browser timers or passed check rows.

Live readiness requires the Phase 1 spike’s Nemotron 3 variant/live-call confirmation and measured inference, provisioning/queueing, and cancellation-to-confirmed-stop results. Keep live Start blocked when the strict 60-second bound or 10-minute total is infeasible; never present a configured native timeout or an API acknowledgement as successful enforcement.

The corrected API separates draft creation, contract update, and Start. The existing scaffold will require deliberate updates before live integration; this document does not claim those changes have been coded. SSE reconnect must replay authoritative event sequences without resubmitting tasks. Production authentication, source ownership, and artifact URLs are backend concerns reflected honestly in the interface.

## 11. Original generation prompts

Use the following prompts as reusable design instructions in a design assistant or subsequent implementation workflow. They are authored for Mend and are not copied MotionSites templates. Each prompt is constrained by the corrected PRD/TRD/AppFlow; no prompt may replace feasibility or success verification with visual simulation.

### Master design prompt

> Design Mend, a self-healing coding workbench, with an original Paper and Proof identity. Create a warm-paper canvas #F5F2EA with static noise at 5% opacity, crisp white main surfaces, #18201B text and 2px outlines, 20px panel corners, hard 8px offset shadows, and #FF5B23 primary buttons with ink labels. Use Inter and IBM Plex Mono. Make code the largest working surface; place compact task context on the left and checks/attempt evidence on the right. The signature objects are a slightly tilting task card, a readable repair trail, and a receipt printed downward from a physical slot. Produce all lifecycle states, mobile layouts, keyboard/focus variants, and reduced-motion alternatives. Use shared Framer Motion springs at stiffness 100 and damping 10 for major entrances. Keep logs stable. Show three repairs/four executions and 60-second job limits honestly; unresolved live feasibility disables Start. Success requires a saved verified receipt. No generic chat hero, purple/blue glow, glassmorphism, moving background, stock robot, KPI card grid, invented metrics, or fake provider activity. Reference clarity and alignment principles, while keeping all composition, copy, and branding specific to Mend.

### Entry and contract prompt

> Create the 1440px and 390px entry/review screens for Mend. Center a 760px maximum-width raised task card with “01 / Brief,” “Make something work,” a labeled generous textarea, two curated Python starters, bounded file input, and Review task. Review becomes a clear proposed-contract sheet with behavior, named checks, editable paths, runtime, limitations, and fixed budgets. Start Mend is separate from creating the draft. Include invalid input, stale-contract conflict, account return, and unresolved live-readiness variants. Maintain the same warm paper, ink, orange, spacing, focus, and radius tokens. Keep the layout useful without animation.

### Workbench and repair prompt

> Create Mend’s active workspace using the desktop grid and responsive rules in the brief. Render a stable source/unified diff surface, compact context rail, and readable Checks/Logs/Details evidence. Use factual state copy, actual-event placeholders, separate run and repair counts, and persistent Stop. Design initial writing, provisioning, running, repairing, disconnected/reconnecting, log-paused, truncated-output, and stopping views. Include a clear required/supplemental check distinction. Use only small motion for a new attempt; never replay whole panels or fake a progress percentage. On mobile, reflow to Files/Changes/Checks tabs with reachable Stop and preserved selection.

### Receipt and outcome prompt

> Design a distinct printer receipt panel for Mend beside the unchanged code surface. Include slot-only, Finalizing, live print, restored completion, reduced-motion, persistence failure, and incomplete outcome variants. The paper uses named check totals, runs/repairs, exact snapshot, reproduction commands, and omissions. Download code is the primary action once persistence and artifact verification succeed. Print once for a live committed receipt; history renders the receipt immediately. Failed or cancelled work offers explicitly unverified code without a success receipt. Use a subtle perforation edge, ink rules, and a forest stamp with readable contrast; no confetti, sound, or blocked downloads.

### Design review prompt

> Review every Mend frame against the corrected PRD, TRD, AppFlow, and UI/UX brief. Identify visual drift, unsupported evidence, missing lifecycle states, contradictory counters, optimistic cancellation, receipt-before-persistence, hidden focus, inadequate contrast, broken 320px reflow, repeated animation, or unclear next actions. Return concrete corrections linked to the affected component/state. Do not certify implementation, provider enforcement, accessibility conformance, or user outcomes from a static design board alone.

## 12. Design verification and acceptance

| Area | Acceptance evidence |
|---|---|
| Identity | Consistent tokens; custom task card, attempt trail, and receipt across screens |
| Task clarity | In a planned five-person session, at least four identify Review and Start without guidance |
| Repair comprehension | At least four of five explain the failed check and locate its repair evidence; record actual results |
| Success boundary | Required/supplemental/omitted checks and exact tested artifact are distinguishable |
| Safety behavior | Blocked Start, three-repair cap, timeout, stopping, and unresolved termination are represented honestly |
| Full states | All lifecycle, connection, form, artifact, history, auth, and expiry variants are specified |
| Accessibility | Keyboard/manual screen-reader checks, rendered contrast, zoom/reflow, target size, and reduced motion tested during implementation |
| Motion | Shared spring, restrained tilt, one-time receipt, stable logs; no action depends on animation |
| Responsive | Review at 1440, 1280, 1024, 768, 390, and 320 CSS pixels with long titles/logs/errors |
| Readiness | No screenshot or fixture presented as a live run; feasibility and implementation gates remain explicit |

User-session thresholds are proposed acceptance targets, not completed research. Static boards validate composition only. Runtime behavior requires end-to-end testing after implementation.

## 13. Deliverables and next stage

The stage-4 handoff consists of this brief, four visual design boards, the 120-source research index, and the audit record. PRD/TRD corrections are applied to their existing files at version 1.2; AppFlow remains at version 1.1.

The design file structure for subsequent editable frames is: Foundations → Components → Entry and Review → Active Work → Handoff and Outcomes → Mobile → Accessibility → Prototype. Name frames by screen ID, lifecycle state, width, and motion mode. Include every component variant, content limit, and event trigger; do not supply only the happy path.

**Next stage:** Backend Schema, with executable migrations, ownership policies, event sequencing, contract-freeze constraints, attempt limits, and receipt finalization. Resolve the measured cancellation-to-stop feasibility, Nemotron 3 variant/live API confirmation, and measured 10-minute budget fit before live execution work. No frontend or backend implementation is performed by this planning deliverable.

## 14. Primary technical and accessibility references

- [Nebius job management](https://docs.nebius.com/serverless/jobs/manage): native timeout bounds, CLI log following, cancellation.
- [Nebius job restart policy](https://docs.nebius.com/serverless/jobs/auto-restarts): explicit single-execution policy.
- [Next.js support policy](https://nextjs.org/support-policy): requested version’s support status.
- [Motion transitions](https://motion.dev/docs/react-transitions): physics spring configuration.
- [Motion accessibility](https://motion.dev/docs/react-accessibility): reduced-motion handling.
- [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): text contrast guidance.
- [WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): visible keyboard interaction.
- [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): minimum target guidance.
- [MDN server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): transport behavior and reconnect semantics.
