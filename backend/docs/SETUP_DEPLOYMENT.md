# Connect the hosted app while execution is held

`mend.deployment:create_app_from_env` supports an explicit, restricted setup service. It does not substitute a fixture database or authentication system. The original `mend.bootstrap:create_app_from_env` and its credential checks remain unchanged.

Start from the repository root using Python 3.12:

```sh
python -m pip install --require-hashes -r backend/requirements.runtime.lock
python -m pip install --no-deps --no-build-isolation ./backend
MEND_SETUP_ONLY=true MEND_MODE=database_only MEND_LIVE_ENABLED=false MEND_DATABASE_WRITES_ENABLED=false python -m uvicorn mend.deployment:create_app_from_env --factory --host 0.0.0.0 --port "$PORT"
```

The setup service constructs no runtime, database, storage, authentication or provider adapters. It reads no request bodies and issues no cookies. Only GET `/healthz` reports process liveness (200). GET `/readyz` returns an explicit `setup_only` report with `ready: false` (503), database `not_checked`, and both holds. Every other method/path returns a generic setup error (503), including sign-in, task and documentation routes. No CORS access is granted; the Next server makes the connection.

Set only the **server-side** Vercel `MEND_BACKEND_URL` to the actual HTTPS Render origin and redeploy. Never prefix it or any private key with `NEXT_PUBLIC_`. Mend's sign-in page exposes connection details and rechecking, but disables credential entry in setup mode. Local preparation and inspection tools still work.

On Render use the Free web service plan, the two build commands above, and the Uvicorn start command with the four explicit setup/hold environment variables. The repository's `.python-version` selects the latest platform-supported Python3.12 patch; inspect the build log for the resolved version. `$PORT` is supplied by Render. TCP health verifies process availability; `/readyz` intentionally fails execution readiness. Free instances can sleep, so the first status check may time out during a cold start; recheck after the service wakes. No disk, worker, cron, database or paid upgrade is needed for this stage.

## Activation remains separate

Adding a key does not automatically enable anything. With `MEND_SETUP_ONLY=false` (the default), the deployment factory delegates to the strict original factory and propagates all failures without setup fallback. It needs genuine Supabase server credentials and the session sealing key. Removing setup mode requires a deliberate deployment and verification; it does not lift the database or provider hold. Real sign-in, task persistence and provider execution remain unverified until separately permitted and tested. Never claim a health response, connection report or static deployment proves a successful repair.
