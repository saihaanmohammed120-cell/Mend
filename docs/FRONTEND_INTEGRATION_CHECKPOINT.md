# Mend — authenticated frontend integration checkpoint

Date: 2026-10-12

## Verified backend application write

**EVIDENCE S87/S90/S93 — Supabase MCP owner check, shell verifier, independent Supabase MCP query:** the supplied owner UUID exists. Private server credentials were loaded into the ignored backend environment, never into frontend source or browser variables. The existing `verify_app_database.py` ran against the real repository and returned exit 0 with:

```json
{"cleanup":"Draft retained for independent MCP inspection; no jobs were submitted.","database_write_verified":true,"idempotency_verified":true,"initial_state_event_verified":true,"provider_execution":"skipped","source":"real_supabase_repository","status":"draft","task_id":"96deff11-c0e2-4299-b5f0-b4f0a5020b7a"}
```

Independent database result:

```json
[{"app_write_verification":{"status":"draft","task_id":"96deff11-c0e2-4299-b5f0-b4f0a5020b7a","repair_count":0,"execution_count":0,"initial_draft_events":1}}]
```

This is real TaskService → SupabaseRepository → hosted Postgres evidence. It is not an authenticated browser mutation or provider execution. The retained draft supports independent inspection and has not executed any job.

## Frontend source delivered

The workbench now contains sign-in, prompt drafting, persisted task creation, actual curated-contract review, exact checks/commands, owner task recovery by UUID, state/log evidence and persisted receipt/download surfaces. Browser rendering and authenticated UI operation remain unverified. The inherited fixture workbench is preserved separately at `/sample`; its receipts cannot be interpreted as live evidence.

Routes:

| Route | Purpose |
| --- | --- |
| `/` | Authenticated task workbench and sign-in surface |
| `/sign-in` | Account entry with tab-local draft retention |
| `/tasks/[id]` | Restore an owner-authorized persisted task |
| `/sample` | Clearly labelled simulated fixture |
| `/api/[...path]` | Allowlisted same-origin proxy to existing FastAPI endpoints |
| `/api/runtime` | Safe wrapper for the actual backend `/readyz` response |

No owner-history, arbitrary repository, source/snapshot API, invented code or passing check was added. The supported live contract remains `csv-cleaner-v1`; the prompt does not alter its protected suite. Creating/reviewing a task does not start execution.

## Preserved design and interaction rules

The source uses the Paper and Proof canvas/surface/ink/orange tokens, static canvas-only noise, hard panel/button shadows, ink borders and panel radii. New typography follows the baseline scales and system fallback fonts. Existing spring and imperative pointer-tilt utilities are reused; pointer movement does not update React state. Rendered token accuracy, responsive behavior, focus visibility, tilt smoothness and receipt printing remain unverified without Playwright MCP.

Real SSE data uses the backend envelope, synchronous acceptance before replay-cursor advancement and bounded logs. Cancellation never optimistically reports stopped. Uncertain creation retains its identity for reconciliation. Receipt display requires matching task/contract/check identities and persisted live evidence. Reopened receipts do not reprint; signed links expire from state and are requested afresh.

## Bugs fixed during integration

- **FastAPI factory startup:** the installed version removed `app.add_event_handler`. A composed async lifespan now preserves the existing lifecycle and closes runtime resources on normal/failing startup/shutdown.
- **Bridge build lint:** the expiry timer now uses a stable holder, retaining early-close behavior without an invalid const conversion or weakening lint settings.
- **Proxy body typing:** bounded request bytes use an ArrayBuffer compatible with the installed fetch types.
- **Task switch races:** independent view identity and abort cleanup prevent stale receipt responses, including an A → B → A transition.
- **Download lifetime:** signed links are transient and disappear on expiry or task/owner changes.
- **Local HTTPS:** privileged port binding was denied. Explicit loopback HTTPS uses unprivileged port 8443; remote-origin rules and exact Origin/CSRF matching remain enforced.

## Observed HTTP boundary checks

**EVIDENCE — shell, self-contained local API + Next HTTPS probe:** the workbench, sample, sign-in and task routes returned HTTP 200 HTML responses. `/api/runtime` returned database-only mode with ready false. Anonymous session/task requests were rejected. These are HTTP observations; no rendered-browser or authenticated frontend mutation is claimed. Raw output is retained in `backend/docs/verification/frontend-http-smoke.txt`.

## Local run preparation

Install the backend's declared dependencies and frontend lockfile dependencies in their respective directories. Copy environment examples privately and fill only the required values. The frontend receives an enabled publishable key; the server credential and session seal remain backend-only.

Backend terminal:

```bash
cd backend
set -a
. ./.env
set +a
python3 -m uvicorn mend.bootstrap:create_app_from_env --factory --host 127.0.0.1 --port 8000
```

Set backend `MEND_PUBLIC_ORIGIN` and `MEND_ALLOWED_ORIGINS` explicitly to `https://localhost:8443`. Keep database-only mode and live execution disabled.

Separate frontend terminal:

```bash
cd frontend
npm ci
mkdir -p .certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout .certs/localhost.key -out .certs/localhost.crt -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1
chmod 600 .certs/localhost.key
npm run dev -- -H 127.0.0.1 -p 8443 --experimental-https --experimental-https-key .certs/localhost.key --experimental-https-cert .certs/localhost.crt
```

Use a locally trusted development certificate to open the HTTPS origin. An owner UUID or service credential does not substitute for a real browser Auth session; sign-in requires an existing project Auth account. No account password is embedded in the repository.

## Remaining evidence boundaries

Contract-review continuation, 2026-10-13: the existing real backend service proposed the retained task's curated CSV contract. Independent Supabase MCP inspection confirmed ready status, contract version 2, the exact required checks/command, an unfrozen contract and its ready-state event. Stale version submission and application Start were rejected; no execution or repair attempt occurred. These are application-service/RPC observations, not browser interactions or passing acceptance checks. Raw evidence is retained in `backend/docs/verification/contract-review-live.json`; current resume state is in `MEND_STATE_SAVE.md`.

Later bounded continuation: `frontend/app/api/runtime/route.ts` now rejects contradictory readiness responses, including ready=true in database-only mode or with unresolved blockers. The old behavior was reproduced by an injected-response regression before fixing it. Context7 documentation was fetched before the edit. Latest shell verification completed TypeScript, all 26 frontend tests and production build with exit 0. This supersedes the earlier frontend test subtotal below; it is not browser or provider proof. The real Supabase draft was rechecked and live execution remained false. See the separately saved `MEND_STATE_SAVE.md` for the resume gate.

Earlier recorded frontend-integration checks (historical; latest rerun is described above):

```text
Frontend TypeScript check: exit 0
Frontend tests: 24 passed, 0 failed, 0 skipped
Next production build and lint/type validation: exit 0
Backend lifecycle/bootstrap tests: 16 passed
Browser bridge boundary tests: 10 passed
Authentication tests: 19 passed
Database-only configuration tests: 6 passed
Frontend source and compiled-browser-bundle server-secret scans: passed
```

These local regressions use injected boundaries where indicated in their source; they are not browser rendering or provider evidence. The real hosted application write is independently recorded above. Private environment files have owner-only permissions and are excluded from the source archive, along with dependencies, certificates and build output.

Playwright MCP is unavailable, so visual and browser interaction claims remain unverified. The authenticated browser → proxy → API → database story is not yet recorded. No Nebius/Nemotron spike, provider-backed repair, live receipt, code download, cloud deployment or public GitHub state is certified by this checkpoint.
