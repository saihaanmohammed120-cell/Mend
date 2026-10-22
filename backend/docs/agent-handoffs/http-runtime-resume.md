# HTTP runtime resume — 12 October 2026

## Part 1 — boundaries and dependencies

This resumed pass owns only `tests/test_http.py`, `scripts/verify_http_runtime.py`, `tests/test_http_runtime_driver.py` and this handoff. It addresses error/skip classification; it does not change API, bootstrap, authentication, providers, package declarations, CI or other source. Genuine FastAPI, Starlette and httpx remain absent in this runtime. Missing dependencies remain an explicit BLOCKED result, and the actual HTTP test class still skips truthfully when framework distributions and modules are absent. No registry downloads, installations, external requests, browser login or credentials were used.

Two confirmed control-flow defects were identified. First, `all(find_spec(...))` treated a missing importable module as ordinary absence even when distribution metadata showed an installed package, and short-circuited before inspecting later packages. A corrupt installed distribution could therefore produce a successful unittest command with skipped HTTP tests. Second, verifier preflight classified installed-package import/provenance failures as BLOCKED, and discovery import errors could be reduced to missing required test IDs instead of reported as failures. These defects were reproduced through dependency-detection and unittest-loader control fixtures; this is not a claim that broken framework packages are installed here.

## Part 2 — complete code

The HTTP suite now checks every framework's module availability without short-circuiting. When an importable module is absent, it checks installed distribution metadata: genuinely absent packages retain the class skip; metadata for an installed package without an importable module raises a clear ImportError. Ordinary genuine framework imports and API construction remain in the existing setup; their errors are not caught or converted into skips.

Verifier preflight returns separate installed versions, absent-package blockers and installed-package errors. Unusable installed imports, untracked module files and failed metadata inspection now produce `HTTP_RUNTIME FAIL` and exit 1, including when other packages are absent. Only genuine distribution absence produces the prerequisite BLOCKED/exit 2 path. Existing suite failures/errors remain exit 1; missing canonical test IDs, zero collected tests and actual skips remain BLOCKED/exit 2; a pass still requires all three canonical HTTP tests and zero skips.

The suite loader now checks unittest's `loader.errors` and raises a safe import failure instead of treating a failed discovery import as a missing-test blocker. The entrypoint catches suite-loading exceptions and reports only their type with exit 1. No mock or substitute framework is supplied to execute HTTP requests.

Five meaningful regressions were added to the existing nine verifier checks: genuine absence still permits the truthful skip; a later corrupt distribution is caught despite an earlier absent package; installed-package errors take failure precedence over missing packages; loader errors cannot look like successful discovery; and suite import errors exit 1 without printing exception values.

## Part 3 — security/error review and actual tests

Reviewed error paths for accidental success, failure-versus-blocker classification, partial dependency absence, corruption hidden by short-circuit evaluation, discovery failures masked by required-ID checks, exception-value disclosure and false HTTP evidence. Dependency imports and suite-loading failures print exception types without values. The regression fixtures inject package-discovery/metadata/loader results and ordinary unittest control cases; they do not stand in for framework execution. The existing three request tests retain their original assertions and fixture boundaries.

Actual commands and results from 12 October 2026:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_http_runtime_driver.py -v
Ran 14 tests in 0.007s
OK
Exit: 0

PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_http.py -v
Ran 3 tests in 0.000s
OK (skipped=3)
Exit: 0

PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/verify_http_runtime.py
HTTP_RUNTIME BLOCKED: genuine dependency preflight failed
  fastapi: distribution not installed
  starlette: distribution not installed
  httpx: distribution not installed
Install the declared test environment with: python -m pip install '.[test]'
Exit: 2
```

All 14 available control/error regressions passed. The three genuine HTTP tests did not execute requests; their skips remain truthful, and the verifier still blocks HTTP acceptance. No genuine-runtime API failure was observed or fixed in this pass.

## Part 4 — handoff

Run `python scripts/verify_http_runtime.py` after installing the declared `.[test]` environment through a permitted dependency route. The previously added CI verifier step will now distinguish unavailable prerequisites from broken installed packages or suite imports. This resumed pass did not execute GitHub Actions. A later successful result establishes only the existing in-process HTTP paths with explicitly non-live adapters; live Supabase/provider, browser/proxy/TLS and release-safety evidence remain separate.

The preflight helper's internal return shape changed from two values to three: `(installed, blockers, errors)`; its entrypoint and all owned callers are updated. The original `http-runtime.md` remains the earlier dated checkpoint; this resume records the changed error classification and latest verification.
