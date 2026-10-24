"""Bounded multi-file Python review contracts; never execute or apply source."""
from __future__ import annotations

import difflib
import io
import json
import keyword
import re

from .domain import (MAX_FILES, MAX_SOURCE_BYTES, MendError, canonical_json, safe_path,
                     sha256_bytes, source_sha256, validate_files)


MAX_REPOSITORY_JSON_BYTES = 3_000_000
_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_DEPENDENCY_PARTS = {"node_modules", "venv", "site_packages", "vendor", "__pycache__"}
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)),
             *(f"lpt{i}" for i in range(1, 10))}


def prepare_repository_case(files, editable_paths, required_check_ids):
    """Freeze explicitly supplied source and proposed tests; inspect no disk paths."""
    files = validate_files(files)
    for path in files:
        safe_path(path)
        parts = path[:-3].split("/")
        if (not path.endswith(".py") or any(not _NAME.fullmatch(p) or keyword.iskeyword(p)
                or p.lower() in _DEPENDENCY_PARTS | _RESERVED for p in parts)
                or parts[-1] in {"setup", "conftest", "sitecustomize", "usercustomize"}
                or path == "unittest.py"):
            raise MendError("repository_path", "Use safe importable Python source paths without dependencies or hooks.")
        if any("/".join(parts[:index]) + "/__init__.py" not in files for index in range(1, len(parts))):
            raise MendError("repository_package", "Every supplied directory needs a supplied package __init__.py.")
        if parts[-1] != "__init__" and path[:-3] + "/__init__.py" in files:
            raise MendError("repository_package", "A module and package cannot share an import name.")
    if len({path.lower() for path in files}) != len(files):
        raise MendError("repository_path", "Case-insensitive source path aliases are forbidden.")
    tests = {path: content for path, content in files.items() if path.startswith("tests/")}
    if "tests/__init__.py" not in tests:
        raise MendError("repository_tests", "A protected tests package is required.")
    if (not isinstance(editable_paths, list) or not editable_paths
            or any(not isinstance(p, str) or p not in files or p in tests
                   or p.rsplit("/", 1)[-1].startswith("test_") for p in editable_paths)
            or len(set(editable_paths)) != len(editable_paths)):
        raise MendError("repository_editable", "Select unique existing source paths outside protected tests.")
    if (not isinstance(required_check_ids, list) or not 1 <= len(required_check_ids) <= 64
            or any(not isinstance(c, str) or len(c) > 200 for c in required_check_ids)
            or len(set(required_check_ids)) != len(required_check_ids)):
        raise MendError("repository_checks", "Unique bounded unittest check IDs are required.")
    for check in required_check_ids:
        parts = check.split(".")
        path = "/".join(parts[:-2]) + ".py"
        if (len(parts) < 4 or any(not _NAME.fullmatch(p) or keyword.iskeyword(p) for p in parts)
                or path not in tests or not parts[-3].startswith("test_") or not parts[-1].startswith("test")):
            raise MendError("repository_checks", "Checks must name methods in supplied protected tests/test_ modules.")
    protected = {path: files[path] for path in sorted(files) if path not in editable_paths}
    contract = {
        "schema_version": 1, "template_id": "python-repository-review-v1", "runtime": "python",
        "snapshot_paths": sorted(files), "editable_paths": sorted(editable_paths), "protected_files": protected,
        "commands": [{"id": "unit-tests", "argv": ["python", "-m", "unittest", "discover", "-s", "tests",
                                                   "-t", ".", "-p", "test_*.py", "-v"]}],
        "required_command_ids": ["unit-tests"], "required_check_ids": sorted(required_check_ids),
        "limits": {"max_files": MAX_FILES, "max_source_bytes": MAX_SOURCE_BYTES},
    }
    return json.loads(canonical_json({
        "kind": "mend_repository_case", "schema_version": 1, "original_files": files, "contract": contract,
        "contract_sha256": sha256_bytes(canonical_json(contract)), "snapshot_sha256": source_sha256(files),
        "protected_checks_sha256": source_sha256(tests), "protected_files_sha256": source_sha256(protected),
        "execution_enabled": False, "approval_status": "not_approved", "live_verification": False,
    }))


def review_repository_candidate(case, candidate_files, *, expected_case_sha256):
    """Operator pins the base case; candidate supplies an exact replacement map."""
    if sha256_bytes(canonical_json(case)) != expected_case_sha256:
        raise MendError("repository_case_mismatch", "The base case differs from the operator-selected case.", 409)
    try:
        rebuilt = prepare_repository_case(case["original_files"], case["contract"]["editable_paths"],
                                          case["contract"]["required_check_ids"])
        if canonical_json(case) != canonical_json(rebuilt):
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise MendError("repository_contract_changed", "The frozen repository contract has changed.", 409) from None
    candidate = validate_files(candidate_files)
    original, protected = case["original_files"], case["contract"]["protected_files"]
    if set(candidate) != set(original):
        raise MendError("repository_paths_changed", "Candidate must preserve every frozen path without additions.", 409)
    if any(candidate[path] != source for path, source in protected.items()):
        raise MendError("repository_protected_changed", "Protected source and tests must remain byte-identical.", 409)
    changed = [path for path in sorted(candidate) if candidate[path] != original[path]]
    if not changed:
        raise MendError("empty_patch", "A changed editable source file is required.")
    diff = []
    for path in changed:
        for line in difflib.unified_diff(io.StringIO(original[path]).readlines(), io.StringIO(candidate[path]).readlines(),
                                         fromfile="a/" + path, tofile="b/" + path):
            diff.append(line)
            if not line.endswith("\n"):
                diff.append("\n\\ No newline at end of file\n")
    return {
        "kind": "mend_repository_candidate_review", "schema_version": 1, "status": "candidate_diff_prepared",
        "case_sha256": expected_case_sha256, "contract_sha256": case["contract_sha256"],
        "original_snapshot_sha256": case["snapshot_sha256"], "candidate_snapshot_sha256": source_sha256(candidate),
        "protected_checks_sha256": case["protected_checks_sha256"],
        "protected_files_sha256": case["protected_files_sha256"], "changed_paths": changed, "diff": "".join(diff),
        "execution_enabled": False, "approval_status": "not_approved", "apply_authorized": False,
        "live_verification": False, "repair_demonstrated": False,
        "omitted_verification": ["Python parsing, importability and actual test discovery/results",
                                 "External dependencies and repository-wide behavior", "Live repair and stop proof",
                                 "Patch application and public receipt signing"],
    }
