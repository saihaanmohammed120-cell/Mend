#!/usr/bin/env python3
"""Run the existing genuine HTTP suite; unavailable prerequisites exit 2."""
from __future__ import annotations

import importlib
import importlib.metadata
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PACKAGES = ("fastapi", "starlette", "httpx", "cryptography")
REQUIRED_TEST_IDS = frozenset({
    "test_http.HttpIntegrationTests.test_http_to_store_repair_receipt_and_sse_roundtrip",
    "test_http.HttpIntegrationTests.test_real_http_rejects_csrf_wrong_origin_and_oversized_prompt",
    "test_http.HttpIntegrationTests.test_real_http_rejects_overflowing_numeric_json",
})


def preflight():
    """Require installed distributions and imports from their recorded files."""
    installed, blockers, errors = {}, [], []
    for name in REQUIRED_PACKAGES:
        try:
            distribution = importlib.metadata.distribution(name)
        except importlib.metadata.PackageNotFoundError:
            blockers.append(f"{name}: distribution not installed")
            continue
        except Exception as error:
            errors.append(f"{name}: distribution inspection failed ({type(error).__name__})")
            continue
        try:
            module = importlib.import_module(name)
            origin = getattr(module, "__file__", None)
            recorded = distribution.files
            if origin is None or not recorded or Path(origin).resolve() not in {
                Path(distribution.locate_file(item)).resolve() for item in recorded
            }:
                errors.append(f"{name}: import is not a recorded distribution file")
                continue
        except Exception as error:
            # Import failures can contain configuration values; report only type.
            errors.append(f"{name}: import failed ({type(error).__name__})")
            continue
        installed[name] = distribution.version
    return installed, blockers, errors


def load_http_suite():
    # Resolve the repository independently of the caller's working directory.
    sys.path.insert(0, str(ROOT))
    loader = unittest.TestLoader()
    suite = loader.discover(str(ROOT / "tests"), pattern="test_http.py")
    if loader.errors:
        raise ImportError("Existing HTTP suite could not be imported.")
    return suite


def test_ids(suite):
    identifiers = set()
    for case in suite:
        if isinstance(case, unittest.TestSuite):
            identifiers.update(test_ids(case))
        else:
            identifiers.add(case.id())
    return identifiers


def main(stream=None):
    stream = sys.stderr if stream is None else stream
    installed, blockers, errors = preflight()
    if errors:
        print("HTTP_RUNTIME FAIL: installed dependency preflight failed", file=stream)
        for error in errors:
            print(f"  {error}", file=stream)
        for blocker in blockers:
            print(f"  {blocker}", file=stream)
        return 1
    if blockers:
        print("HTTP_RUNTIME BLOCKED: genuine dependency preflight failed", file=stream)
        for blocker in blockers:
            print(f"  {blocker}", file=stream)
        print("Install the declared test environment with: python -m pip install '.[test]'", file=stream)
        return 2
    print("HTTP_RUNTIME dependencies: " + ", ".join(
        f"{name}={installed[name]}" for name in REQUIRED_PACKAGES
    ), file=stream)
    try:
        suite = load_http_suite()
    except Exception as error:
        print(f"HTTP_RUNTIME FAIL: HTTP suite loading failed ({type(error).__name__})", file=stream)
        return 1
    if suite.countTestCases() == 0:
        print("HTTP_RUNTIME BLOCKED: test_http.py collected no tests", file=stream)
        return 2
    missing = REQUIRED_TEST_IDS - test_ids(suite)
    if missing:
        print(f"HTTP_RUNTIME BLOCKED: {len(missing)} required HTTP test(s) missing", file=stream)
        for identifier in sorted(missing):
            print(f"  {identifier}", file=stream)
        return 2
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    if not result.wasSuccessful():
        print("HTTP_RUNTIME FAIL: existing HTTP suite failed", file=stream)
        return 1
    if result.skipped:
        print(f"HTTP_RUNTIME BLOCKED: {len(result.skipped)} HTTP test(s) skipped", file=stream)
        return 2
    print(f"HTTP_RUNTIME PASS: {result.testsRun} genuine HTTP tests, zero skips", file=stream)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
