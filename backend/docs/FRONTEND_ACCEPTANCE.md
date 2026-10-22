# Mend frontend integration acceptance — 12 October 2026

This is a concrete handoff for the next integrated frontend module, based on the preserved TRD v1.2, UI/UX Brief v1.2 and App Flow. It does not revise their tokens, type scales, motion, state machine or evidence rules. The existing published Site is a simulated demonstration; the browser bridge is implemented, but no live frontend/backend connection is claimed. A separate local Next.js 14 sample workbench was recovered at `../mend-workbench`. Its fixture SSE protocol differs from the audited backend protocol; it must remain demo-only until explicit session/contract/Start/bridge integration is completed.

## Next module and boundaries

Next frontend implementation target: a client-side workbench controller consuming `web/mend-client.ts`, followed by screen bindings. The controller owns one authenticated task view, pending mutations, stream handle, replay cursor, selected attempt/file/tab and log scroll preference. Presentational components consume that view. Provider credentials, worker identity, internal storage keys and model calls never enter the browser.

The controller starts only inside an HTTPS browser after session establishment, never at server-module import. One `MendClient` instance owns the view. Scope outgoing requests and streams to the task and authenticated account; abort requests and close the stream on task switch/unmount. Disposing a view does not cancel the remote job. Stop explicitly calls `cancel`.

No draft is represented as remote progress. No frontend countdown, animation or successful HTTP response substitutes for actual check evidence. Disabled live Start must carry the exact backend release reason inline while preserving the reviewed task.

## Screens and actual API sequence

| Screen / App Flow | Existing bridge calls | Visible result and acceptance |
|---|---|---|
| Entry `/` | `getSession`; `create(prompt,creationKey)` only after Review task | Labelled prompt; 8000 UTF-8-byte cap; empty input disables review; typing alone starts nothing. Keep the creation key for a deliberate uncertain retry |
| Contract `/tasks/{id}` | `get(id)`; `propose(id,contract_version,null)` for the curated contract | Present behavior, editable source, protected named checks, commands, runtime and limits before Start. No invented model-generated contract |
| Explicit Start | `start(id,currentVersion,startKey)` | Freeze once on the server; disable duplicate submission until reconciliation. Reuse the same Start key on an uncertain retry; never create a replacement task automatically |
| Active task `/tasks/{id}` | `watchTask(id,handlers,{after,signal})`; `get(id)` for reconciliation | Accepted snapshot first; persisted events thereafter. Preserve task title, selected file/attempt, log position and separate run/repair counts |
| Stop | `cancel(id)` | Display the returned durable state; show Stopping until confirmed stopped. A click, fetch timeout or disconnected stream never proves remote termination |
| Successful handoff | Committed `receipt` event or persisted receipt in reopened task; `receipt(id)`; `artifacts(id)` | Named check outcomes, snapshot/reproduction/limitations and authorized downloads. Print once only for newly committed evidence; history/replay opens flat |
| Session access | Existing authenticated sign-in yields token; `exchangeSession(token)`; `logout` | No fabricated login provider. Tokens are neither stored in browser storage nor placed in URLs; CSRF/session are managed by the bridge |

## Persisted state mapping

`draft` and `finalizing` are persisted backend states in the delivered enum. The frontend does not invent additional task statuses.

| State | Label / action contract |
|---|---|
| `draft` | Brief saved; prepare/review the proposed contract |
| `ready` | Ready for review; explicit Start subject to the actual release gate |
| `writing` | Writing the first draft; show accepted data only |
| `waiting_runner` | Waiting for the runner; distinguish provisioning from execution |
| `running` | Checking the work; show actual commands/outcomes/logs |
| `fixing` | Repairing the failed check; display consumed repair reservation |
| `finalizing` | Saving the verified result; retain check evidence and withhold printed success until receipt commit |
| `passed` | Required checks passed; fetch the stored receipt and authorized artifacts |
| `needs_help` | Incomplete; render the persisted reason and retain named evidence |
| `runner_unavailable` | The runner is unavailable; no success receipt |
| `stopping` | Stopping; prevent new dispatch and wait for confirmed outcome |
| `stopped` | Stopped; retain available evidence and disable Stop |

Connection state is independent: `connecting`, `open`, `reconnecting`, `closed`. A closed stream never changes task state to stopped. Terminal stream closure still leaves the final view readable.

## Exact SSE binding and stable rendering

- `onTask(task)` accepts the authoritative snapshot. It must not restart work or replay printing. Any embedded persisted receipt is rendered as existing evidence.
- `onEvent(event)` receives `{id,type,data}`; the application payload is under `event.data.payload`. Event `id` is the decimal-string replay cursor, not the numeric JSON sequence. Supported types are `state`, `log`, `receipt`, `failed`, `stopped`.
- `onEvent` is synchronous. It must durably accept the event into the current view before returning because the bridge advances its cursor only after successful delivery. An asynchronous callback must not be treated as an awaited commit. A consumer failure closes the stream with the previous cursor intact.
- `onConnection(state)` changes only the connection indicator. `onError(error)` presents the safe error without discarding accepted evidence.
- The returned handle supplies `close()` and `cursor()`. Retain the exact cursor for deliberate resume via `after`; the bridge owns deduplication, native reconnect and session-expiry closure.
- Batch evidence rendering once per frame while preserving the accepted event order. Do not use every log as a component entrance, reset the code pane, force scroll or trigger a new print. Maintain a visible truncation marker; log and code text must be rendered as text, not HTML.
- Keep a tail-follow preference: append normally while following; when scrolling away, preserve position and expose Jump to latest. Count newly accepted log lines without inventing a completion percentage.
- Source/diff numbering must include blank physical lines. If a diagnostic annotation occupies a source row, it must be valid commented source or visibly separate from source numbering. Preserve the existing failed annotation correction.

## Handoff, downloads and evidence honesty

Success printing requires a committed receipt, correct task identity and truthful `source` / `live_verification`. A `local_test` result keeps a visible local-evidence label. A task state alone is insufficient to create a new receipt. A finalizing persistence failure shows “Checks passed; receipt unavailable” when the backend records that reason, without relabeling the checks as failed.

Use only authorized `artifacts(id)` results. The bridge accepts bounded-expiry signed HTTPS URLs and rejects local-test schemes. Request a fresh link on expiry rather than retaining it indefinitely. Use no-referrer links; signed URLs must not enter logs, analytics or persistent browser storage. JSON receipt export uses the exact persisted receipt, never reconstructed success claims.

### Confirmed API gaps for App Flow completion

These are missing capabilities, not browser bugs or already implemented features:

1. Recent work needs an owner-authorized paginated task-list API. The delivered bridge exposes no history-list method; no invented `/api/tasks/history` endpoint is assumed.
2. Interactive per-attempt source/diff viewing needs a bounded owner-authorized snapshot response or signed immutable snapshot download. The current task response supplies attempt metadata, not a general source-code retrieval API. Logs must not be used to manufacture source.
3. App Flow’s Unverified latest code download for incomplete tasks is not currently supported: `TaskService.artifacts` requires a stored receipt. A separate authorized endpoint must preserve snapshot identity and an explicit unverified label. The verified artifact route must not be relaxed.
4. Physical retention deletion is not yet wired; logical access expiry must not be advertised as confirmed physical deletion.
5. Deployment support/version choice for the requested legacy Next.js 14 baseline remains explicit. This handoff makes no silent version migration.

These gaps should be implemented as scoped modules with ownership/security regressions before advertising a complete App Flow. Core completed files should not be rewritten merely to change their visual presentation.

## Interaction acceptance using unchanged design rules

| Journey | Concrete acceptance |
|---|---|
| First ten seconds | The existing silent failure→patch→pass→receipt demo stays visibly simulated; the numbered four-step flow and real limits remain near the top. No fabricated testimonials/statistics/scarcity |
| Keyboard | Every review/Start/Stop/tab/attempt/download action works without hover. Focus follows intentional screen transitions, remains visible and never lands behind a sticky control |
| Touch | Stable panels and full-size actions; no tilt dependence; tabs preserve editor/attempt/log selection |
| Reduced motion | No pointer tilt; prompt readable immediately; receipt result available immediately; no required animation delay |
| Fine pointer tilt | Preserve cached wrapper bounds, imperative ref transforms, frame batching, interpolation, ±3° cap and same-frame shadow updates. No React pixel-state updates or active transform transition |
| Receipt | Existing slot/clipping mechanics and shared spring remain; print only on a new committed receipt and once per task/receipt identity |
| Mobile 320–767px | Preserve Brief §4 one-column layout and Files/Changes/Checks tabs. No page overflow; source/logs scroll inside their panels; Stop stays available |
| Enlarged text / narrower available width | Reflow from columns before code becomes unreadable; no clipped evidence or hidden focus |
| Canvas/cards/focus | Use Brief §3.1 unchanged and verify computed styles on actual components: paper canvas, canvas-only static texture, white readable surfaces, specified borders/shadows/radii/focus gap |
| Token contrast | Brief §3.2 table remains untouched. Token ratios do not stand in for component/opacity/focus verification |
| Evidence announcements | Announce meaningful task-state and receipt changes politely; do not announce every stdout line. Connection/error messages remain actionable and persistent |

## Verification status and next order

This document was checked against the delivered bridge types/callbacks, current `TaskService` methods and baseline documents. It is a requirements/contract handoff, not a browser accessibility audit or evidence that screens were built. No UI tokens or Site files changed.

Execution order: genuine HTTP and isolated database verification → Nebius feasibility/termination/report/isolation gates → missing owner-authorized flow APIs → client workbench controller and screen bindings → authenticated end-to-end receipt/download verification → judge access and recording. Local frontend state mechanics may be tested before provider readiness, but live Start and live-evidence claims remain blocked.
