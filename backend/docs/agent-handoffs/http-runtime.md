# HTTP runtime handoff — 12 October 2026

## Part 1 — context and dependencies

Scope: the existing `tests/test_http.py`, declared dependencies in `pyproject.toml`, the `create_app(service, settings, authenticator)` and `create_app_from_env()` interfaces, README verification instructions, and the baseline AppFlow's task/contract/start/receipt/SSE journey. The coordinator subsequently authorized one CI step in `.github/workflows/checks.yml`. The API and bootstrap implementations and existing HTTP suite were not changed.

The prerequisite worker was consulted before loading dependencies. Its read-only inventory found no genuine FastAPI, Starlette, httpx or uvicorn in the available primary/system Python runtimes and no local framework wheel/source bundle. No dependency installation, browser sign-in, provider request or secret output was performed. The active Python's installed cryptography is 50.0.1. The coordinator reconciled the declaration to `cryptography==50.0.1` and reran all 19 authentication tests successfully in 0.038s. Genuine HTTP integration remains blocked by the missing framework packages.

FastAPI and cryptography are declared production dependencies; httpx is declared in the test extra. Starlette is a FastAPI transitive dependency. The exact in-process HTTP suite does not require a uvicorn server. Production bootstrap obtains configuration from environment injection and authenticates against Supabase; this verification driver does not construct that production bootstrap or require account credentials.

## Part 2 — code delivered

`scripts/verify_http_runtime.py` preflights installed distributions and real package imports for FastAPI, Starlette, httpx and cryptography. An imported module must resolve to a file recorded by its installed distribution, rejecting untracked local replacements. Import errors report their exception type without printing exception values. This is an installed-package provenance check, not a signed-package authenticity check or a dependency resolver/version constraint validator; install `.[test]` to obtain the declared versions.

With prerequisites present, the driver discovers only the unchanged `test_http.py` suite using an absolute repository path. It requires all three canonical `HttpIntegrationTests` test IDs before running the suite with standard unittest. Exit 0 requires those tests to be collected, a successful suite, and zero skips. Test failures/errors exit 1. Missing/unimportable dependencies, untracked imports, empty collection, missing required test IDs or skipped tests report `HTTP_RUNTIME BLOCKED` and exit 2. No fake framework is supplied and no dependency is installed implicitly.

`tests/test_http_runtime_driver.py` contains nine standard-library checks for blocked-before-discovery behavior, passing/failing/skipped/empty result handling, blocking a missing canonical test before execution, exact existing-suite discovery, rejecting shadow modules, and redacting import-error values. These use injected verifier control-flow results and ordinary unittest cases; they are verifier tests, not FastAPI integration evidence.

`.github/workflows/checks.yml` now invokes `python scripts/verify_http_runtime.py` in a separate step immediately after unittest. Standard unittest exits 0 when HTTP tests are skipped, which previously allowed a green CI result without genuine HTTP requests. The explicit verifier makes absent dependencies, missing canonical tests and skipped HTTP tests fail CI via exit 2. All remaining workflow steps are preserved.

## Part 3 — actual verification checkpoint

Executed on 12 October 2026 from the repository root:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_http_runtime_driver.py -v
Ran 9 tests in 0.010s
OK
Exit: 0

PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/verify_http_runtime.py
HTTP_RUNTIME BLOCKED: genuine dependency preflight failed
  fastapi: distribution not installed
  starlette: distribution not installed
  httpx: distribution not installed
Install the declared test environment with: python -m pip install '.[test]'
Exit: 2

PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_http.py -v
Ran 3 tests in 0.000s
OK (skipped=3)
Exit: 0
```

The three skipped HTTP tests did not execute any request. The new driver's exit 2 is the actionable integration status; the standard unittest skip result cannot establish HTTP success. The checkpoint completes the scoped deliverables while preserving the dependency blocker.

The workflow was syntax-checked locally with the already installed PyYAML 6.0.3 parser; its local-test step order was also checked to confirm the verifier immediately follows unittest and precedes the existing rehearsal. The check exited 0 with `syntax parse OK; verifier ordering and preserved rehearsal/browser command confirmed`. The GitHub Actions workflow itself was not executed here. No parser or dependency installation was performed.

## Part 4 — integration handoff and remaining evidence

In a permitted environment, install the declared package/test environment and run:

```bash
python -m pip install '.[test]'
python scripts/verify_http_runtime.py
```

The existing suite exercises genuine FastAPI TestClient/Starlette/httpx routing with explicit non-live identity/model/runner/store fixtures: session exchange and secure-cookie retention, task creation, contract proposal, explicit start, service execution, local receipt, terminal SSE delivery, readiness remaining blocked, CSRF/origin/oversized-prompt rejection, and overflowing numeric JSON rejection. Its receipts remain `source=local_test` and `live_verification=false`.

A later pass would establish these exact in-process HTTP paths only. It would not establish live Supabase identity, actual provider execution, reverse-proxy/HTTPS behavior, deployed browser flow, PostgreSQL behavior, or the live release safety gates. Environment keys and credentials remain private server configuration; this driver takes none and performs no login. If a genuine-runtime failure occurs, report its reproduction to the coordinator before changing existing HTTP tests or implementation.
