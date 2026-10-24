# Backend integration — 24 October 2026

## Delivered behavior

The existing FastAPI backend handles secure session exchange, owner-scoped task/contract reads and mutations, events, receipts and private downloads. This pass closes the production Next proxy's missing allowlist entry for `POST /api/bug-cases/prepare`. That endpoint authenticates the sealed session, verifies Origin and CSRF, validates the exact request schema and returns an unapproved, non-executing bug contract. It persists no task or source. GET and unexpected subpaths remain blocked.

`MEND_DATABASE_WRITES_ENABLED` is a separate, strict `true`/`false` environment setting, default `false`. With a hosted database mode, the HTTP boundary rejects task creation, contract edits, Start and Cancel while this hold remains. The Supabase repository independently rejects every dispatcher action except `get_task` and `events` before network transport. The fixed runtime and retention probes remain read-only. Session exchange/logout and stateless contract preparation do not write Mend tables. Setting this flag is an operator action requiring the existing database hold to be lifted; it does not enable provider execution. `local_test` keeps its existing synthetic lifecycle for tests.

## Reproduce actual frontend/backend transport

From `frontend`, install the existing dependencies, build, and run:

```bash
npm ci
npm run build
MEND_TEST_PYTHON=/absolute/path/to/backend-test-python node scripts/verify-backend-chain.mjs
```

The script owns and closes loopback Next production and Uvicorn processes. It refuses existing HTTP servers, supplies only synthetic test settings and exercises the real Next route handler, proxy transport, FastAPI HTTP stack and sealed session codec. It checks unauthenticated access, two secure cookies, authenticated session retrieval, missing-CSRF/wrong-Origin denial, exact UTF-8 preparation, invalid check rejection, held database writes and cookie deletion. The identity authority is explicitly a fixture, not real Supabase Auth. It does not establish browser HTTPS cookie acceptance, execute source, call a hosted database/provider or manufacture a repair receipt.

CI also provisions a disposable PostgreSQL 16 service, builds only synthetic Auth/Storage prerequisites, applies all existing migrations and runs the existing rollback-only database fixture through the strict driver. No hosted DSN, Supabase key or production migration is used. The legacy `MEND_TEST_DATABASE_DSN` variable must contain only a database name; host, port, user, password and TLS use standard libpq `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGSSLMODE` variables. Full conninfo strings previously failed when placed in `PGDATABASE`; they now fail preflight without printing their contents. This verifies PostgreSQL mechanics against synthetic prerequisites; real hosted Auth, Storage and full concurrency remain separate checks. Consult the exact-commit Actions result for actual execution outcomes.

## Render configuration prepared; private key required

The user approved Render workspace `My Workspace` (`tea-db77rt7avr4c73a0ojr0`) for a free Mend backend. No other existing service should be repurposed. Use public repository `https://github.com/saihaanmohammed120-cell/Mend`, branch `main` and native Python runtime. Select an explicitly verified supported Python 3.12 patch at deployment; the hash-locked requirements and CI target Python 3.12.

Build command:

```bash
cd backend && python -m pip install --require-hashes -r requirements.runtime.lock && python -m pip install --no-deps --no-build-isolation .
```

Start command:

```bash
python -m uvicorn mend.bootstrap:create_app_from_env --factory --host 0.0.0.0 --port "$PORT" --no-access-log
```

Privately configure `SUPABASE_SERVICE_ROLE_KEY` and `MEND_SESSION_SEAL_KEY`, plus these non-secret values:

```dotenv
MEND_MODE=database_only
MEND_LIVE_ENABLED=false
MEND_DATABASE_WRITES_ENABLED=false
MEND_PUBLIC_ORIGIN=https://mend-smasher.vercel.app
MEND_ALLOWED_ORIGINS=https://mend-smasher.vercel.app
SUPABASE_URL=https://uwkdrmdflzverflcfkgk.supabase.co
```

API startup intentionally fails closed without its server credential/seal key. The available Supabase connector exposes publishable keys only; public keys cannot replace the database service credential. The key must be supplied privately from the project's API Keys settings. No live server or authenticated hosted journey is claimed until that configuration and health/negative-auth/readiness checks actually pass.

After startup, set Vercel's server-only `MEND_BACKEND_URL` to the verified HTTPS backend origin. Set the existing browser Auth URL and publishable-key fields using the matching project, then redeploy and check same-origin sessions, CSRF, blocked task writes and stateless preparation through Vercel. Provider keys stay unset. Use `/healthz` for process health; `/readyz` must retain 503 and live/readiness blockers while the holds remain. A healthy process is not release permission. Free Render services can sleep, so cold-start behavior must be assessed separately.

## Remaining boundaries

Both existing holds remain: no live Nebius/model/job/cancellation work and no hosted database writes/migrations. A full provider-backed repair, independently established stop timing, trusted evidence production, live signing and final judge walkthrough remain incomplete. Never infer these from HTTP tests, a configured flag or a local fixture receipt.
