# Mend release access — 21 October 2026

Read `AGENTS.md` and `outputs/MEND_PROJECT_CONTEXT.md`. This pass inspected release access, the prepared publication candidate and Linux CI, then added the authorized required HTTP CI gate. No app files, remote source, access settings, databases or provider resources were changed. Final publication waits for the root task's source freeze.

## Fresh GitHub observations

| Item | Current read-only result |
| --- | --- |
| Repository | `saihaanmohammed120-cell/Mend`, ID `1423579239`, public, not archived |
| Default branch | `main` |
| Current main | `e1f6b0cb182663ebb6bb62527ada672306c2a062` |
| Current tree | `25ee7c17027c2c4dacc8590bc2007991c8eeade0` |
| Current contents | Only `LICENSE`, 1,075 bytes |
| License blob | `c067ba002ec00824f58a2f057d29fdaff3b1a4b7` |
| User permissions | admin, maintain, push, pull, triage true |
| Accessible connector installations | `[]` |
| Installed connector accounts | `[]` |
| Installation testing override | `allow_all_repositories_for_testing=false` |
| Actions runs | `total_count=0`, `workflow_runs=[]` |

Connector installation access has not visibly recovered. The earlier write returned `403 Resource not accessible by integration`; this pass did not retry a write or claim a fresh 403. User admin/push permissions do not prove connector installation permissions. Public read access works.

The public workflow-runs endpoint was readable. The workflows collection URL was rejected by the connector's URL allowlist; that rejection does not establish that Actions is disabled.

## Candidate and publication mechanics

`work/public-mend-fullstack-20261020/PUBLICATION_MANIFEST.json` has 436 payload entries; all candidate files match their recorded SHA-256 values. Including the manifest, the candidate has 437 packaged files. Its root MIT license hashes to the exact current public Git blob. Preserve its published author notice and `licenses/Mend-Contributors-MIT.txt` when refreshing from canonical source.

At the inspection instant, common candidate/canonical files differed only in the deliberately preserved root license. Seventeen candidate-only files retain imported reports, dated verification and the contributor notice. This comparison does not freeze canonical source; the root task is editing it. Existing `work/publish-payload` is historical and must not be reused as the final payload.

The connector provides `create_blob`, `create_tree`, `create_commit`, `update_ref`, public Git-data fetch and blob/file readback. After installation access is restored and the root confirms the final source snapshot:

1. Refresh the clean candidate from that snapshot, retaining notices and approved handoff evidence. Rebuild its manifest and package checks; exclude dependencies, private environment values, keys, caches and runtime state. Preserve binary and captured-evidence bytes.
2. Re-read `main` and its tree. Treat this note's hashes as observations, not authority to overwrite a newer branch.
3. Upload exact file bytes through blob creation (`base64` for binary), recording returned blob IDs. Create an overlay tree against the newly read remote base tree so unrelated concurrent files are retained. Preserve the existing license.
4. Create a commit whose parent is the re-read main commit. Update `main` with `force=false` and `expected_sha` set to that same parent. Stop and reconcile if the branch moved; do not force past a changed branch.
5. Fetch the resulting recursive tree and exact blobs/files at the new commit. Compare every published path, Git blob ID and per-file digest with the manifest, including licenses and binary assets. Publication is complete only after successful readback.
6. Observe the push-triggered Linux workflow for that exact commit. Publishing `.github/workflows/checks.yml` may require workflow-file permission in addition to repository contents access; this pass has not established either connector write permission.

No branch/commit/tree/blob mutation was attempted. No stale candidate was published.

## Linux CI readiness and limits

Canonical and candidate `.github/workflows/checks.yml` both prepare offline Ubuntu 24.04 jobs, with read-only repository permissions and checkout credentials disabled. Global flags keep `MEND_MODE=database_only`, `MEND_LIVE_ENABLED=false` and Next telemetry disabled.

- Backend: Python 3.12, `pip install '.[test]'`, compile check and the complete unittest discovery. Linux supplies the POSIX ownership, executable and symlink semantics unavailable in the earlier Windows run.
- Frontend: Node 24, lockfile-based `npm ci`, Next type generation, typecheck, lint, unit tests, Chromium installation and Playwright. The Playwright web-server command builds the production app before starting it. Workspace browser tests use explicit synthetic HTTPS/API fixtures; they do not establish real Supabase authentication.
- The real PostgreSQL fixture explicitly skips without `MEND_TEST_DATABASE_DSN`; no DSN or isolated-database opt-in is supplied by this workflow. A green offline run would not establish migrated PostgreSQL behavior. Do not add database credentials or run that fixture under the current database hold.
- The HTTP suite permits explicit skips if genuine HTTP packages are missing. The existing `backend/scripts/verify_http_runtime.py` fails closed for missing dependencies, required tests or skipped HTTP cases. The canonical workflow now requires `python scripts/verify_http_runtime.py` after dependency installation/compile and before full unittest discovery. No continue-on-error bypass was added.

Fresh validation: parsed the workflow YAML and asserted exact backend command ordering, existing driver path, offline flags and fail-closed step status. Ran the actual existing HTTP driver using the backend virtual environment: five genuine HTTP tests passed, zero skips. Observed package versions were FastAPI 0.148.0, Starlette 1.9.0, httpx 0.28.1 and cryptography 50.0.1. Starlette emits an existing TestClient/httpx deprecation warning. This local driver result is separate from a Linux CI result. Only canonical `.github/workflows/checks.yml` was changed; the publication candidate must receive that change during the root task's refresh.

Local Linux execution was not possible through the discovered tools: `wsl --list --quiet` reports WSL is not installed, and Docker is absent from PATH. No WSL installation, container service, remote runner, paid resource or alternative provisioning was attempted. Existing Windows results do not replace Linux CI; there are currently zero public Actions runs.

## Blockers and immediately available work

Source publication remains blocked by missing visible GitHub connector installation access, with final-tree coordination also required. Restore the existing app installation's access to this existing repository, then perform guarded publication and readback; no new repository is needed. While access is unresolved, finish the canonical offline changes and refresh/validate the final candidate, including the required HTTP CI gate. Genuine provider execution, model discovery, jobs, database changes, signing and recording remain outside this pass.

## Bounded Codebase Memory recheck

The [original publisher's latest release](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.12.1) is still v0.12.1, confirmed through the latest-release redirect and live GitHub release API. No newer published Windows build was found. The cached Windows archive SHA-256 is `4e4e0f16b45233af5c757a1fcbe3c3b16e9056375b1fbe2ce020b6de75dedcc0`, matching the publisher's current release-asset digest. The installed executable matches the archive bytes; its SHA-256 is `39f6a789cd858d7428561ac5afaefb9a47b018dcba0ad6fa41ae71a45e0ed656`.

Fresh executable checks: `--version` reports 0.12.1 and help works; `config list` still exits with `secure CLI coordination could not be created (project-locks)`, while MCP stdio startup exits 1 with `client exact-build admission failed`. The small startup probe sent no repository path and created no source index. Root cause is not established. No checksum mismatch or newer release supplies an identifiable bounded reinstall/fix, so this pass stopped without replacing the verified binary, registering the failing server, indexing Mend, changing broad permissions or bypassing security checks. Codebase Memory remains non-operational and is not a claimed available capability.
