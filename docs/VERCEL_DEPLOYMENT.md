# Vercel frontend deployment

This deploys the Next.js frontend, including the local protected-test review at `/fix`. It does not deploy FastAPI, create database records or enable Nebius execution. The existing ChatGPT Site is a separate static deployment.

## Import the existing source

1. Open https://vercel.com/new and select the intended workspace.
2. Import `saihaanmohammed120-cell/Mend`; use project name `mend` if available.
3. Set **Root Directory** to `frontend` and **Framework Preset** to Next.js. Use Node.js 24.x (the source requires at least 22.13).
4. The committed `frontend/vercel.json` selects `npm ci` and `npm run build`. Leave the Output Directory at the framework default. Do not import `backend` as this project's root.
5. Keep `MEND_MODE=database_only`, `MEND_LIVE_ENABLED=false` and `NEXT_TELEMETRY_DISABLED=1` as non-secret project environment settings for production/preview. These settings do not supply or enable a backend. Leave `MEND_BACKEND_URL` and browser Auth settings unset for this frontend-only release; add no database, session or provider secrets.
6. Deploy the intended reviewed Git commit, retain its actual deployment URL and check its build status before sharing. Confirm public access intentionally if Vercel deployment protection is enabled; do not distribute an expiring owner-session link as the judge URL.

Repository access for Vercel is independent of the ChatGPT Codex GitHub connector. If Vercel cannot import the repository, complete Vercel's GitHub authorization for this existing repository rather than creating a duplicate or changing its license.

## Verify the deployed result

- Open `/`, `/fix` and `/sample` in a fresh signed-out browser. `/fix` needs no account and makes no API/storage handoff.
- At desktop and mobile widths, load captured input, review it and export intake JSON. Open proposed protected checks, enter test source, named unittest IDs and a target included in that list, then review/download `mend-bug-review-request.json`.
- Edit a field: the old reviewed export must disappear. Clear/Undo must restore inputs but require fresh review. Duplicate IDs and an absent target must remain errors. Reload clears the inputs. Test keyboard focus and reduced motion.
- Confirm exported source/test content against the input bytes, then run the existing offline CLI `--request` workflow from [BUG_CASE_REVIEW.md](BUG_CASE_REVIEW.md). Preparation stays unsigned, unapproved and unexecuted.
- The captured example remains local/unsigned and the sample remains simulated. `/api/runtime` must report unavailable/blocked when no backend is configured. Sign-in/task operations are unavailable in this frontend-only release; do not present that as a working authenticated repair service.

## Resume authenticated integration separately

FastAPI needs its own reviewed HTTPS host, server-only authentication/session configuration and same-site API proxy settings. Configure `MEND_BACKEND_URL` only after that backend exists and its ownership/CSRF/cookie behavior is verified. Vercel frontend deployment does not establish hosted PostgreSQL behavior, independent report/stop authority, provider isolation, timing feasibility or a live repair receipt. The explicit provider and hosted-database holds remain active until separately lifted.

Primary references: [Vercel monorepo imports](https://vercel.com/docs/monorepos), [vercel.json configuration](https://vercel.com/docs/project-configuration/vercel-json).
