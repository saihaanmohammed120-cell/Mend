# Core and browser fixes — 12 October 2026

## Part 1 — Read-only audit and dependency map

Completed read-only review before modification, using the existing blueprint/TRD and Paper and Proof handoff. Reviewed domain/hash/path helpers, replacements, ZIP validation, Supabase artifact transport, DiskTestArtifacts, browser session/SSE ownership and saved regression tests. Initial probes made no filesystem changes: Python used -B, Node directly transformed TypeScript in memory. Verified terminal replay skipped, invalid response bodies not cancelled, and throwing consumer notifications left a stream open. Constructor/path failure normalization was also inconsistent. Existing core suite remained 11/11 passing, showing those additional cases needed regression coverage.

Authorized fix scope: domain public next_sequence only; ArtifactStore constructor validation; DiskTestArtifacts class only; corresponding targeted tests; browser bridge/tests/documentation. Runtime assembly and live Site/design tokens remain untouched. Root coordinates LocalTestStore's next-unused sequence semantics with SQL.

## Part 2 — Implemented corrections

- Authorized public tasks expose `next_sequence` as an integer. Production semantics remain next unused ID; latest committed ID is one less. Browser safely representable values determine whether a terminal snapshot has pending replay; missing/unsafe values keep replay open. Local store must use the same semantics.
- Browser always aborts request ownership and cancels unlocked response bodies, including header rejection. Close/error notifications are isolated from resource cleanup. All watches close on disposal/401/account change. The application replay cursor advances after successful synchronous event delivery; failures retain its previous value and get a distinct consumer_failed code. SSE event size uses UTF-8 byte count.
- Artifact configuration failures consistently become artifact_config/503: malformed origins, non-443 or malformed ports, invalid types, header control characters, invalid integer byte bounds and timeouts. Credentials stay injected and are never printed.
- Disk fixture artifacts walk directories from descriptor-relative no-follow opens. Readers use nonblocking/no-follow opens, require a regular file and enforce the byte cap. Publication writes/fsyncs an exclusive temporary file, then links it without overwrite using the same opened directory descriptor and fsyncs the directory. Symlink replacement cannot redirect the write; temporary files/descriptors are cleaned on failures. Path/read errors become safe MendError values. Local URIs remain explicitly local_test.

## Part 3 — Actual focused verification

Commands:
```text
PYTHONDONTWRITEBYTECODE=1 python -B -m unittest discover -s tests -p test_core.py -v
PYTHONDONTWRITEBYTECODE=1 python -B -m unittest discover -s tests -p test_bootstrap.py -v
MEND_TSC_BIN=<existing-tsc-executable> node --test web/mend-client.test.cjs
```

Actual outputs:
```text
Core: Ran 13 tests in 0.009s
OK
Bootstrap: Ran 9 tests in 0.007s
OK
✔ Actual API routes, session exchange, CSRF, idempotency and 12 persisted states (9.39199ms)
✔ Cookie SSE replay cursor, duplicate suppression and terminal cleanup (1.677363ms)
✔ Bounded JSON response, non-HTTPS local link rejection and AbortSignal (2.229326ms)
✔ Bounded stream errors, secure browser requirement and owned resource disposal (1.372292ms)
✔ Completed task replays pending receipt and closes when already caught up (0.975442ms)
✔ Terminal snapshot without a safely representable cursor retains replay (0.613647ms)
✔ Header rejection cancels response body and aborts fetch ownership (0.662159ms)
✔ Consumer notification errors cannot break disposal or 401 handling (4.155795ms)
✔ Consumer event failure preserves cursor for a fresh replay (0.693447ms)
✔ Server owner changes retire prior account streams; prompt limits count UTF-8 bytes (0.975432ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 940.30735
```

Regression checks include FIFO/directory/final-symlink rejection, a simulated parent-directory rebind at the publication boundary, unchanged outside bytes, no temporary leftovers, safe permission errors and stable Linux descriptor counts. Browser tests compile actual TypeScript into an isolated temporary directory, then exercise injected boundaries. No generated source was executed, no provider request was made, and no real authentication/download was simulated as live evidence.

## Part 4 — Convergence and remaining gates

Changed files are mend/domain.py, mend/artifacts.py, DiskTestArtifacts within mend/bootstrap.py, tests/test_core.py, tests/test_bootstrap.py, web/mend-client.ts, web/mend-client.test.cjs, web/README.md and this handoff. Root's full-suite integration must verify the coordinated LocalTestStore sequence change. Filesystem behavior requires Linux/POSIX directory descriptors and no-follow flags, matching the deployment container; it is not a claim of Windows compatibility. Production Supabase/private Storage, browser proxy/SSE, Nebius isolation, model availability and measured strict 60-second stopping remain unverified release gates. Existing static Site is unchanged.
