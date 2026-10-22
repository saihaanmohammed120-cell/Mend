# Core Contracts handoff

## Part 1 — Context isolation and dependencies

Inputs: governing TRD v1.2 and implementation BLUEPRINT; Python dictionaries from service/inference/runner. Outputs: safe errors, strictly curated contract, immutable source hashes, allowlisted complete-file replacements, deterministic verified bundles and scoped artifact transport. Owned files: mend/domain.py, mend/patches.py, mend/artifacts.py, tests/test_core.py, this handoff. Standard library only; no untrusted source execution or live provider verification. No changes to another agent's files.

The curated CSV contract keeps protected checks in the canonical frozen contract. All proposed contracts must equal that trusted template; arbitrary model-supplied commands or editable paths are rejected. This deliberately narrows the MVP and does not imply sandbox isolation or the strict remote 60-second guarantee.

## Part 2 — Modular synthesis

Implemented:
- `MendError(code, message, status=400)` with safe public message/code.
- Canonical UTF-8 JSON uses sorted string keys, compact separators, integer-only numbers, and a 64-level nesting cap. Source hash is SHA-256 of `{"schema_version":1,"files":{sorted path/text}}` serialized with that canonical function.
- `curated_contract()`, `validate_contract(contract)`, `initial_files(contract=None)`, `protected_checks_sha256(contract)`. The intentionally failing starter is seeded curated demonstration material, never inference evidence. Required qualified check IDs and command IDs are frozen. Source/log caps are decimal 200000/256000 bytes, preserving migration 001.
- `validate_replacements(contract,current_files,replacements,expected_source_sha256=None)` checks frozen contract, exact allowed file set, protected bytes, optional snapshot identity, safe paths, text/budget limits and actual changes.
- `deterministic_zip(files)` emits sorted, uncompressed, read-only regular files with fixed timestamps. `verify_bundle(bundle,expected_source_sha256)` rejects traversal, duplicates, encrypted/compressed/symlink entries, oversized data and noncanonical metadata/trailing payload. It returns the exact verified source map.
- `ArtifactStore(base_url,service_role_key,bucket='mend-artifacts',timeout=15.0,max_bytes=1048576)` provides synchronous `put(task_id,user_id,key,data)`, `get(storage_key)`, `signed_download(storage_key,expires_seconds=60)`. Production transport uses HTTPS Supabase private Storage with server-only credential injection; writes reject overwrite, redirects are blocked, requests/responses are bounded and signed URL origin/object scope is checked. Link expiry is 1–300 seconds.
- `LocalArtifacts()` provides the same synchronous methods but explicitly identifies itself as `local_test` and returns only `local_test://` links.
- `public_payload(value)` uses explicit public record fields, preserves validated file maps and the exact reviewed contract, and excludes raw storage keys, worker leases and credentials.

## Part 3 — Security, resource review and real local verification

No untrusted source is imported or executed. ZIP data is processed in memory; no extraction occurs. Artifact keys require canonical owner/task UUIDs and safe relative paths. A backend caller **must first authorize the task owner** before loading or signing its stored key: service-role transport cannot derive user identity from a storage key, and structural scope validation is not authorization. Bucket provisioning/private-policy verification and credential grants remain deployment tasks. No provider requests were made; mocked HTTPS responses test protocol construction, not live Supabase integration. No assertion establishes Nebius timeout, isolation, model availability, or production readiness.

Initial synthesis tests exposed integration risks identified by root review: canonical evidence accepted floats and public serialization could drop dynamic file keys. Both were corrected with regression coverage. Reviewed transport redirect leakage, body bounds, duplicate archive entries, immutable writes, stale hashes and protected-file changes.

Command: `python -m unittest discover -s tests -p test_core.py -v`

Actual local output:
```text
test_archive_rejects_traversal_duplicates_symlinks_and_compression ... ok
test_bundle_is_deterministic_and_matches_snapshot ... ok
test_canonical_evidence_rejects_nested_floats_and_non_json_types ... ok
test_canonical_hash_order_and_content ... ok
test_contract_protects_commands_checks_limits ... ok
test_local_artifacts_immutable_scoped_and_labeled ... ok
test_protected_source_and_stale_hash ... ok
test_safe_public_fields_keep_frozen_contract_without_secrets ... ok
test_supabase_transport_paths_and_immutable_upload ... ok
test_transport_response_is_bounded_and_redirects_forbidden ... ok
test_unsafe_replacements ... ok
Ran 11 tests in 0.015s
OK
```

## Part 4 — Pipeline convergence

The core interfaces above are ready for inference structured replacements, runner protected checks, service snapshot/receipt construction, and API public serialization. Network artifact methods are synchronous; an async service must offload them to a bounded executor rather than block its event loop. Canonical hashing never processes floating-point cost data: cost provenance belongs in usage/receipt fields and uses distinct JSON transport serialization. Receipt creation must verify the downloaded bundle against the provider-tested source hash. Live release gates remain closed until measured remote evidence establishes all governing v1.2 requirements. No direct database/storage deployment occurred.
