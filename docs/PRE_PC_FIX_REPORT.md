# Mend - pre-PC security and bug-fix checkpoint

Date: 13 October 2026. Governing baseline: PRD/TRD/UI/UX v1.2, existing canonical CSV recipe and Paper and Proof. This slice reviews the two newly attached videos, fixes reproduced local defects and records actual verification. It does not certify an error-free service or unlock live execution.

## Video review and applicable guidance

**EVIDENCE S165 - exec_command ffprobe/ffmpeg and view_image:** local copies of `VID_20261013_062630_399.mp4` and `VID_20261013_003850_932.mp4` were inspected through timestamped frame sequences. The first video's visible sections cover SQL injection, XSS, CSRF, upload validation, SSRF, object authorization, rate limiting, password/MFA/server permissions/RLS, secrets/storage, CORS, webhooks, source maps, sensitive data and vulnerable dependencies. The second shows animation/component references including Animaster Lab, Skiper UI and Vengeance UI. These are reference labels, not adopted packages or verified endorsements.

The displayed guidance was reviewed across the videos. Audio narration was not transcribed: no callable transcription tool or local speech-recognition package was available in the checked environment. No unobserved spoken instruction is invented. Reference motion informs restraint and interaction quality; existing colors, fonts, hard shadows, spring/tilt/reduced-motion rules remain the product constraints. No gallery template or ornamental motion was copied into the application.

Security guidance is mapped to actual boundaries: structured RPC input instead of user SQL; escaped React source/error text; exact owner/origin/CSRF rules; server-only secrets; bounded source/requests; allowlisted provider/backend destinations; private storage; real RLS and RPC-grant inspection. Source inspection and narrow regressions do not establish comprehensive live exploit resistance. Rate-limit/MFA/production traffic policies and full browser/owner isolation acceptance remain unverified release work. No webhook endpoint exists to which a signature feature was added.

**EVIDENCE S166 - Context7 resolve-library-id and query-docs:** exact Next.js and FastAPI documentation preceded corresponding edits. The Supabase skill guided the read-only database permission inspection; no database schema or Supabase client API was changed.

### Original Error / Problem Statement

Confirmed reproductions:

- A failed Bug Desk `anchor.click()` left its anchor and object URL allocated.
- An already-aborted streamed proxy request could remain waiting for input because the cancellation listener was registered after abort. Cancellation during input reading could also reach the forwarding boundary without an explicit abort check.
- A valid browser cookie could expire while upstream identity verification awaited, yet authentication returned the expired identity.
- Unexpected API exceptions bypassed user middleware and returned sanitized HTTP 500 bodies without the expected security/cache/CORS headers.
- The prerequisites scanner could report locally configured despite missing the standalone spike image, positive cost cap and explicit image approval.
- Replacing an existing evidence JSON file raised FileNotFoundError when the optional private environment file was absent.
- The environment's virtualenv interpreter links were broken after the runtime change; the declared HTTP dependencies were unavailable until restoration.

The dependency audit separately identified unresolved advisories in the legacy framework/tooling. Findings are package advisories, not proof that every exploit is reachable in Mend. They must not be mislabeled as fixed because local tests pass.

### Files Impacted

- `backend/mend/auth.py`, `api.py`; `backend/tests/test_auth.py`, `test_http.py`; dated Auth/API handoff.
- `backend/scripts/phase1_preflight.py`, `verify_http_preflight.py`; `backend/tests/test_phase1_preflight.py`, `test_http_preflight.py`.
- `frontend/lib/backend-proxy.ts`; `frontend/tests/backend-proxy.test.ts`.
- `frontend/lib/bug-intake.ts`, `components/bug-desk.tsx`; `frontend/tests/bug-intake.test.ts`.
- `frontend/next.config.mjs`, `package-lock.json`, `README.md`; implementation-overlay documentation and this checkpoint.
- `backend/docs/verification/video-security-*` contains actual current outputs. The ignored `.venv` was restored, not included in source delivery.

### Plain-English Explanation

Download cleanup now has explicit ownership. Exceptions release acquired resources; successful object URLs transfer to the component for delayed or unmount cleanup. A failure displays a generic retry alert and retains the prepared packet. Original source/error preservation and local-only privacy remain unchanged.

The proxy now checks cancellation before waiting and after input reads, releases the reader and refuses to forward cancelled input. Regression output distinguishes local injected fetch boundaries from actual browser disconnect behavior, which remains unverified.

Authentication checks the original cookie deadline again after server verification returns. A valid access token does not implicitly renew this separate browser session. Unexpected errors explicitly carry no-store, nosniff, no-referrer and CSP headers. Credentialed CORS is granted only to an exact allowed origin; untrusted or missing origins receive no origin grant. Real framework tests use injected backing, not an invented hosted auth session.

The spike scanner now checks its own digest-pinned image, finite positive representable cap and explicit approval. The production runner image is a separate runtime-integration field, so it neither substitutes for the timing image nor blocks an otherwise configured standalone timing probe. Configured still means unverified: no account call, paid job, stop measurement or release enablement occurs. Missing optional environment files no longer prevent safe replacement of existing evidence; alias and atomic publication protections remain.

Safe dependency updates within existing ranges were applied and installed. The unused image optimization API was disabled with `images.unoptimized=true`, and production browser source maps remain explicitly disabled. This closes that unused route; it does not resolve all Next.js advisories. The required Next.js 14 baseline was not silently replaced by a breaking framework migration.

### Code Diff

These excerpts describe the actual changed boundaries; complete source is included in the refreshed package.

```diff
 # Auth: upstream verification must not outlive the issued cookie.
  verified_id = await self.verify_token(identity.access_token)
+ if self.codec.clock() >= identity.expires_at:
+     raise MendError('unauthenticated', 'The session is missing, invalid, or expired.', 401)

 # Unexpected API errors bypass middleware headers.
- return JSONResponse({'error': {'code': 'internal_error', 'message': 'The request could not be completed.'}}, status_code=500)
+ return JSONResponse({'error': {'code': 'internal_error', 'message': 'The request could not be completed.'}}, status_code=500, headers=headers)
+ # headers retain security policy; exact trusted Origin alone receives CORS.

 # Proxy input cancellation.
- const item = await reader.read();
+ if (controller.signal.aborted) { await reader.cancel(); controller.signal.throwIfAborted(); }
+ const item = await reader.read(); controller.signal.throwIfAborted();
+ controller.signal.throwIfAborted(); // also before backend forwarding

 # Bug Desk resource ownership.
- anchor.click(); anchor.remove(); setTimeout(revoke, 1000);
+ beginBugIntakeDownload(packet, browser);
+ // Exception-safe URL/anchor cleanup; component owns successful URLs/timers.

 # Prerequisites: timing image is distinct from the production runner image.
+ MEND_SPIKE_IMAGE, MEND_TASK_COST_CAP, MEND_SPIKE_PROBE_APPROVED
+ runtime_integration.runner_configuration_presence

 # Safe evidence update with no optional private file.
- aliases_environment = os.path.samefile(destination, private_environment)
+ try: aliases_environment = os.path.samefile(destination, private_environment)
+ except FileNotFoundError: aliases_environment = False

 # Close the unused image optimizer; retain source-map hygiene.
+ images: { unoptimized: true },
+ productionBrowserSourceMaps: false,
```

### Actual Test and Verification Output

**EVIDENCE S167-S170 - agent and root exec_command:** scoped before-fix reproductions and actual regressions were performed; no success transcript was fabricated. The root aggregate result is below and includes the scoped cases, so their counts must not be added again.

**EVIDENCE S174 - exec_command/write_stdin:**

```text
$ .venv/bin/python -m unittest discover -s tests -v
Ran 224 tests in 2.237s
OK (skipped=1)
Derived: 223 passed, 1 skipped, no failures.

$ npm test
tests 43
pass 43
fail 0
skipped 0

$ npm run typecheck
exit 0

$ npm run build
exit 0
Compiled successfully; production route output includes /fix.
```

The skipped case still requires a separate isolated PostgreSQL DSN. Genuine FastAPI HTTP tests ran with actual framework dependencies and local injected backing. Provider fakes and local store cases are not Nebius end-to-end evidence.

**EVIDENCE S171 - exec_command, restored real local Uvicorn:** health HTTP 200 in database_only mode; readiness HTTP 503 with ready=false and provider release blockers. Dependencies imported after interpreter repair and declared dependency installation. No synthetic actor was used to claim browser sign-in.

**EVIDENCE S175 - exec_command, real local Next production server:** `/fix` returned HTTP 200 and expected local-packet/execution-gated/planned-regression markup. The disabled `/_next/image` endpoint returned HTTP 404. Download interaction and visual correctness remain unverified without Playwright MCP.

**EVIDENCE S172 - actual Supabase MCP execute_sql:**

```json
[{"video_security_read":{"rls":[{"table":"logs","enabled":true},{"table":"receipts","enabled":true},{"table":"task_attempts","enabled":true},{"table":"tasks","enabled":true}],"bucket":[{"name":"mend-artifacts","public":false}],"rpc_browser_access":{"anon":false,"service_role":true,"authenticated":false},"live_execution_enabled":false}}]
```

This confirms current metadata/grants only. No write, full cross-owner browser test or provider behavior is claimed by it.

**EVIDENCE S169/S171 - actual current prerequisites command:** exit 2, blocked. Provider credentials/project/placement/pricing, spike image/cap/approval and CLI remain absent. Model discovery, inference and provisioning are not_run; cancellation-to-stop is null; verified receipt not_produced; release remains disabled. Runtime dependencies are now present.

**EVIDENCE S173 - npm audit JSON and primary advisory pages:** final audit reports 12 affected dependency entries: 2 moderate, 9 high and 1 critical. These are not distinct proven exploits. A compatible lockfile update did not eliminate them. Next.js 14 is unsupported, and reviewed critical advisories list patched releases on supported major lines rather than a patched 14.x release. No zero-vulnerability claim is made.

Primary references reviewed in this turn:

- https://nextjs.org/support-policy
- https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/advisories/GHSA-p293-qw3h-jr36
- https://github.com/advisories/GHSA-fxqj-rqcc-2cmp

### Deployment and Demo Checklist

- Supported patched framework/toolchain migration is a blocking documented architecture delta; validate async route parameters, React/motion compatibility, CSS output, full regressions and browser behavior before public application deployment. Keeping the legacy stack cannot become a claim that advisories are resolved.
- Public deployment traffic limits, account MFA policy, credential rotation and complete owner/storage/browser acceptance remain unverified. Previously exposed server credentials need account-side rotation before release; no credential values appear in deliverables.
- Connect Playwright when explicit PC access is announced, then record real sign-in/task review/recovery, keyboard/mobile/reduced motion, download cleanup and receipt behavior. Current callable inventory exposes no Playwright tools.
- Supply provider secrets/configuration privately; integrate independent termination measurement and minimum trusted report authority. Measure actual inference/provisioning/cancellation and total-budget fit before opening live Start.
- No paid provider call, database mutation, published-Site edit, cloud deployment, remote CI run or public repo verification occurred in this slice. The existing demo remains simulated; new frontend changes remain local.
- Generic bug diagnosis, real patch reports, comparative regression execution, independent reviewer and task graphs remain planned/unimplemented. Animation references do not change that boundary.

## State save

Resume from supported dependency migration and the pending PC/provider gates, using the existing architecture and completed files. The new report complements the full project PDF rather than replacing its historical evidence cutoff. Current raw outputs and fixes are in the source package; no promise of an error-free product or universal security is made.
