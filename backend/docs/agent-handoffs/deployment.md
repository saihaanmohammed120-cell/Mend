# Deployment/documentation handoff

## Part 1 — boundaries and dependencies

Owned files: README.md, docs/DEPLOYMENT.md, docs/PITCH.md, deploy/api.Dockerfile, deploy/compose.yaml, .github/workflows/checks.yml, .gitignore and .env.example. Inputs were the actual API, settings, inference, runner, artifacts, worker/bootstrap exports and inherited BLUEPRINT. Root owns bootstrap, worker and local rehearsal; this agent did not modify those modules. Database followup changes were separately approved and recorded in database.md.

Output purpose: reproducible setup instructions and honest submission preparation, not a completed deployment. Existing static site/brand/audience remain unchanged. MIT license already exists.

## Part 2 — complete files

Server Dockerfile builds declared Python dependencies, runs non-root and launches the actual factory. Compose runs API, orchestrator and an independent deadline worker; named volume shares durable local SQLite and disk artifact bytes, host API binding is loopback, root filesystem read-only, capabilities dropped. Server-only env injection excludes any generated-code runner container. Runner image remains separate. Docker base is deliberately documented as unpinned until resolved release digest.

CI installs declared dependencies, compiles modules, runs unittest discovery and the labeled local rehearsal. It does not hide PostgreSQL skips or claim a live model/job test. .env.example contains only empty secret/account/price fields and live-disabled defaults. .gitignore excludes private env files, DBs, logs, keys and private evidence.

README and deployment guide distinguish implementation from live release. They document real auth, HTTPS same-site cookie routing/EventSource, DB application/permission verification, true timing gates, actual source receipt and private artifacts. Pitch includes a bounded three-minute recording sequence and a concise truthful script; no invented traction, success rates or claims of a working live run.

## Part 3 — actual checks

The documentation/configuration check executed with Python and available PyYAML:

```text
README.md nonempty; no placeholder markers
docs/DEPLOYMENT.md nonempty; no placeholder markers
docs/PITCH.md nonempty; no placeholder markers
deploy/api.Dockerfile nonempty; no placeholder markers
deploy/compose.yaml nonempty; no placeholder markers
.github/workflows/checks.yml nonempty; no placeholder markers
.gitignore nonempty; no placeholder markers
.env.example nonempty; no placeholder markers
Compose YAML parsed; three server services, no credential-bearing runner
CI YAML parsed
```

Actual image builds, docker compose runtime, GitHub Actions execution, FastAPI server integration, PostgreSQL migrations and provider deployment were **not run** in this scope. Existing backend output is recorded in the respective module handoffs and root's integrated verification report; the pitch never invents a count.

## Part 4 — convergence

Entry points match root's code: `mend.bootstrap:create_app_from_env`, `python -m mend.worker --role orchestrator|deadline`, and `python scripts/local_rehearsal.py`. Bootstrap disk fixture artifacts use MEND_LOCAL_ARTIFACT_ROOT and SQLite uses MEND_LOCAL_DATABASE. Browser auth always requires real Supabase; no fake identity is introduced to make the API appear ready.

Live report transport/isolation/stop measurement gates remain unresolved; bootstrap explicitly rejects live-enabled startup. Local mock provider state is process-local and cannot demonstrate provider restart recovery. Local artifact URIs remain test identifiers, not real download URLs. No secrets were populated, cloud resources provisioned, public repo created or existing site audience altered.
