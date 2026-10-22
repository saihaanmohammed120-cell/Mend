# Mend implementation overlay — 11 October 2026

This overlay implements the user's newly authorized autonomous build. It preserves TRD/Design Brief v1.2; the original tutorial's point 6, Implementation Plan, was recovered by frame review during the later report pass. Stage 5's schema is inherited as migration 001. Baseline documents are copied byte-for-byte and remain governing requirements.

## Target and honesty boundary

Track: Coding and Agentic Engineering. Model family: NVIDIA Nemotron 3; candidate `nvidia/nemotron-3-super-120b-a12b`, with account-level model discovery and a real inference spike required. Existing static Paper and Proof UI remains the visual reference. FastAPI, Supabase/PostgreSQL, Token Factory inference, Serverless Jobs, real SSE, and private artifacts remain the production architecture. No provider calls or paid resources are authorized with invented credentials. Test doubles are dependency-injected, explicitly local_test, and cannot create production live receipts. A separate NVIDIA API key is not required merely to call an NVIDIA model through Token Factory; Cloud IAM, Token Factory and Supabase credentials are distinct.

Live jobs remain disabled until termination, isolation, logs, model availability and total-budget evidence is reviewed. Cancellation at 60 seconds with any positive stop delay cannot demonstrate a strict 60-second bound. The local suite tests mechanics, not that provider guarantee. No promise of unerasable memory, continuous model self-training, actual CodeRabbit service use, or indefinite unattended execution is made; the blueprint and handoffs provide durable, reviewable continuity.

## Four-part handoff required of every agent

1. Document inputs, outputs, dependencies and owned files before coding.
2. Implement complete bounded functions; no TODO or placeholder implementation.
3. Review errors, security, resource ownership and cleanup; run actual available tests.
4. Record integration contract, real stdout and unresolved provider/dependency gates under docs/agent-handoffs.

## Agent boundaries

| Agent | Owned files | Dependencies / deliverable |
|---|---|---|
| Core Contracts | mend/domain.py, mend/patches.py, mend/artifacts.py, tests/test_core.py | Common errors, hashes, curated contract, safe structured replacements, artifact identity |
| Database | mend/repository.py, migrations/002_backend_rpc.sql, tests/test_repository.py | Supabase RPC transport and atomic service-role action dispatcher; inherited 001 audit |
| Inference | mend/transport.py, mend/inference.py, tests/test_inference.py | Bounded stdlib HTTP, account model check, real chat completion, strict structured replacement response |
| Runner | mend/runner.py, mend/supervisor.py, tests/test_runner.py, deploy/runner.Dockerfile | Real documented Nebius job create/cancel/list, bounded CLI log transport, protected supervisor |
| Orchestration | mend/service.py, mend/local_store.py, mend/fakes.py, tests/test_service.py | Bounded generation/run/repair, worker/deadline recovery, labeled test store/adapters |
| Auth/API | mend/auth.py, mend/api.py, mend/config.py, tests/test_auth.py | Supabase identity, encrypted secure cookie, CSRF, API validation, SSE replay |

Agents may create their own handoff file and scoped tests. No agent edits another's files. Interface changes require a root message before cross-module edits. A later review/deployment agent receives a released slot. No unrelated UI redesign or brand-token edits are permitted.

## Shared wire contract

Use JSON dictionaries at component boundaries, UTC ISO8601 timestamps ending in Z, UUID strings, lowercase SHA-256. `MendError(code, message, status=400)` is the common safe exception in mend.domain. Production store is `SupabaseRepository.call(action: str, payload: dict) -> dict | list`; it posts to `/rest/v1/rpc/mend_command` with `{p_action: action, p_payload: payload}`. LocalTestStore implements the same method with SQLite transaction locking and `source=local_test`. Neither client nor model chooses internal actions/status/worker identifiers.

Task response fields mirror tasks; add `attempts` as an ordered array and `receipt` when reading. Returned tasks may expose `source` (`live` or `local_test`) and `live_verification` only truthfully. Sanitized public responses remove lease tokens and raw provider credentials. Local test-store receipts are never inserted into the production receipts table.

Every action requiring task ownership checks payload.user_id; system/worker mutations require a matching unexpired payload.worker_id lease under the task lock. The service-only deadline_cancel safety action deliberately bypasses a regular worker lease after rechecking the due, unresolved attempt under task-then-attempt locks. READ COMMITTED applies. Exceptions map to stable safe codes; API never returns raw SQL/provider errors.

| Store action | Payload | Return |
|---|---|---|
| create_task | user_id,prompt,idempotency_key,runtime=python | task |
| get_task | task_id,user_id (system worker may omit internally) | task + attempts + receipt |
| propose_contract | task_id,user_id,expected_version,contract | task |
| start_task | task_id,user_id,expected_version,contract_sha256,protected_checks_sha256 | frozen task; database release gate enforced |
| claim_worker | task_id,worker_id,seconds=30 | {claimed:boolean} |
| set_state | task_id,worker_id,status,stop_reason optional | task |
| reserve_repair | task_id,worker_id | {repair_count:integer} |
| reserve_attempt | task_id,worker_id,submission_key,model_id,model_request_id,snapshot_sha256,snapshot_storage_key,source_file_count,source_bytes,image_digest | attempt |
| dispatch | task_id,attempt_id,worker_id | attempt; persist dispatch/deadline before network |
| attach_job | task_id,attempt_id,worker_id,job_id,submitted_at optional | attempt |
| resolve_attempt | task_id,attempt_id,worker_id,status,exit_code,finished_at,provider_stopped_at,runner_report,report_storage_key,resolution_evidence,failure_signature,diagnostic_evidence_sha256; nullable fields only where valid | attempt |
| usage | task_id,worker_id,token_count,cost,actual_tokens/actual_cost optional,api_retry_increment=0 | task; reservations and actual usage remain separate |
| output | task_id,attempt_id,worker_id,stream,message | {sequence:integer or null} |
| events | task_id,user_id,after=0,limit=100 | ordered events |
| request_cancel | task_id,user_id (system may omit internally),reason=user_cancelled | task |
| finish_stop | task_id,worker_id,reason | task; no unresolved attempts |
| finalize | task_id,worker_id,receipt | stored receipt; idempotent by task_id |
| due | no payload secrets; server clock authority | unresolved attempts past deadline with task identity |
| deadline_cancel | task_id,attempt_id; server-only, due recheck under locks | durable cancel intent plus attempt, without waiting for orchestrator lease |
| pending | limit=20 | nonterminal started tasks for lease/reconciliation |

Inference adapter `TokenFactoryClient.generate(contract,prompt,files,diagnostics=None,max_output_tokens=4096,timeout=30.0)` is async and returns `{files: {relative_path: UTF8 text}, model_id, model_request_id, input_tokens, output_tokens, cost}`. Cost requires configured price provenance, not invented pricing. No silent inference fallback in live mode. Core `validate_replacements` permits only contract editable paths, rejects traversal/binaries/oversize/protected changes, and merges replacements into the current source.

Runner `NebiusRunner.submit(task,attempt,files,contract) -> job_id` is async, with submission-key reconciliation. `reconcile(submission_key)` is read-only and never treats an incomplete listing as proof of absence. `observe(job_id)` returns status and provider evidence; `cancel(job_id)` acknowledges only. `stream_logs(job_id)` yields `{stream,message}`. Signed report validation exists, but a genuinely trusted external report producer/transport is not yet wired. The container probe runs approved checks as diagnostics only: imported candidate code can influence its own unittest process, so stdout never constitutes verification evidence. Bootstrap blocks live release while this trust boundary and provider isolation remain unresolved. No untrusted code is executed directly on the host during local testing.

Artifact helpers calculate a canonical source manifest hash from sorted path/text pairs and construct deterministic ZIP bytes. `ArtifactStore.put(task_id,user_id,key,bytes)->storage_key`, `get(storage_key)->bytes`, and `signed_download(storage_key,expires_seconds)->str` use private Storage, reject overwrite and cross-owner paths; LocalArtifacts is explicit local_test only. Bundle bytes must round-trip to the tested manifest before receipt construction.

TaskService public async methods: create(user_id,prompt,idempotency_key,runtime='python'), propose(task_id,user_id,expected_version,contract), start(task_id,user_id,expected_version), get(task_id,user_id), cancel(task_id,user_id), receipt(task_id,user_id), artifacts(task_id,user_id), events(task_id,user_id,after=0) async iterator. Internal run_task(task_id) and deadline_tick() are worker entry points. Constructor accepts store, model, runner, artifact_store, config/clock as injected dependencies. Configuration defaults must fail closed. API can import TaskService lazily until implementation exists.

## Dependency and verification constraints

FastAPI, Starlette, uvicorn, HTTPX, pytest and PostgreSQL drivers were absent at initial inspection. Pydantic and cryptography are available. Implement provider transport using stdlib urllib and core tests with unittest. FastAPI remains a declared production dependency; do not replace it with a fake framework and call integration verified. Run any real framework tests only if a legitimate dependency route becomes available. No external package fetching outside the permitted network boundary. PostgreSQL migration/runtime verification remains pending without a real database.

## Release evidence to retain

Actual local unittest output, inherited demo checks, syntax compilation, source manifest, changed-file diff, deployment dry-run configuration, migration limitations, and exact unavailable live gates. The public README/license/video plan must distinguish implemented code from successful live integration. The current private Site audience is preserved; judge access requires a deliberate sharing/test-access choice later.
