"""Trusted curated MVP contract and canonical evidence identities."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from pathlib import PurePosixPath
from typing import Any

MAX_FILES = 20
MAX_SOURCE_BYTES = 200000
MAX_ARTIFACT_BYTES = 1024 * 1024
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class MendError(Exception):
    """Safe, stable boundary exception; raw provider details stay private."""
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def canonical_json(value: Any) -> bytes:
    # Canonical evidence deliberately excludes floats: pricing/cost provenance
    # is carried separately and must not change hashes through float formatting.
    def check(item: Any, depth: int = 0) -> None:
        if depth > 64:
            raise MendError("invalid_json", "Canonical JSON nesting is too deep.")
        if item is None or isinstance(item, (str, bool, int)):
            return
        if isinstance(item, dict):
            if any(not isinstance(key, str) for key in item):
                raise MendError("invalid_json", "Canonical JSON keys must be strings.")
            for child in item.values():
                check(child, depth + 1)
            return
        if isinstance(item, list):
            for child in item:
                check(child, depth + 1)
            return
        raise MendError("invalid_json", "Canonical evidence permits JSON values with integers only.")
    check(value)
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                          allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise MendError("invalid_json", "Value must be integer-only UTF-8 JSON.") from exc


def sha256_bytes(data: bytes) -> str:
    if not isinstance(data, bytes):
        raise MendError("invalid_bytes", "Evidence must be bytes.")
    return hashlib.sha256(data).hexdigest()


def safe_path(path: str) -> str:
    if (not isinstance(path, str) or not path or len(path) > 180
            or not re.fullmatch(r"[A-Za-z0-9_./-]+", path)
            or path.startswith(("/", "-")) or "\\" in path):
        raise MendError("invalid_path", "Source paths must be safe relative paths.")
    parts = path.split("/")
    if any(part in ("", ".", "..") or part.startswith(".") for part in parts):
        raise MendError("invalid_path", "Traversal and hidden paths are forbidden.")
    if str(PurePosixPath(path)) != path:
        raise MendError("invalid_path", "Source path is not canonical.")
    return path


def validate_files(files: dict[str, str]) -> dict[str, str]:
    if not isinstance(files, dict) or not 1 <= len(files) <= MAX_FILES:
        raise MendError("source_limit", "Source requires 1–20 files.")
    total = 0
    checked = {}
    for path, content in files.items():
        safe_path(path)
        if not isinstance(content, str) or "\x00" in content:
            raise MendError("invalid_source", "Source must contain UTF-8 text without NUL bytes.")
        try:
            encoded = content.encode("utf-8")
        except UnicodeError as exc:
            raise MendError("invalid_source", "Source must contain valid UTF-8 text.") from exc
        total += len(encoded)
        if total > MAX_SOURCE_BYTES:
            raise MendError("source_limit", "Source exceeds the 200KB cap.")
        checked[path] = content
    return checked


def source_sha256(files: dict[str, str]) -> str:
    # Content itself is in the sorted manifest, preventing path/content ambiguity.
    checked = validate_files(files)
    return sha256_bytes(canonical_json({"schema_version": 1, "files": checked}))


PROTECTED_TESTS = '''import unittest
from csv_tools import clean_rows


class CsvChecks(unittest.TestCase):
    def test_empty_input(self):
        self.assertEqual(clean_rows([]), ([], 0))

    def test_duplicate_rows(self):
        row = {"name": "Mira", "age": "20"}
        self.assertEqual(clean_rows([row, dict(row)]), ([row], 0))

    def test_missing_values(self):
        rows = [{"name": "", "age": "20"}, {"name": "Mira", "age": None}]
        self.assertEqual(clean_rows(rows), (rows, 2))

    def test_field_order(self):
        rows = [{"name": "Mira", "age": "20"}, {"name": "Ravi", "age": "21"}]
        cleaned, _ = clean_rows(rows)
        self.assertEqual([tuple(row) for row in cleaned], [("name", "age"), ("name", "age")])
        with self.assertRaises(ValueError):
            clean_rows([rows[0], {"age": "20", "name": "Mira"}])


if __name__ == "__main__":
    unittest.main()
'''

STARTER_SOURCE = '''def clean_rows(rows):
    # Empty-input guard missing: this starter deliberately fails that check.
    fields = tuple(rows[0])
    cleaned = []
    seen = set()
    missing = 0
    for row in rows:
        if tuple(row) != fields:
            raise ValueError("Rows must share the same fields and field order")
        key = tuple(row[field] for field in fields)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(dict(row))
        missing += sum(value is None or value == "" for value in key)
    return cleaned, missing
'''


def curated_contract() -> dict:
    return {
        "schema_version": 1, "template_id": "csv-cleaner-v1", "runtime": "python",
        "entry_point": "csv_tools.py", "editable_paths": ["csv_tools.py"],
        "protected_files": {"test_csv_tools.py": PROTECTED_TESTS},
        "required_command_ids": ["unit-tests"],
        "commands": [{"id": "unit-tests", "argv": ["python", "-m", "unittest", "-v", "test_csv_tools"]}],
        "required_check_ids": ["test_csv_tools.CsvChecks." + name for name in (
            "test_empty_input", "test_duplicate_rows", "test_missing_values", "test_field_order")],
        "limits": {"max_repairs": 3, "max_executions": 4, "job_timeout_seconds": 60,
                   "task_timeout_seconds": 600, "max_tokens": 30000,
                   "max_files": MAX_FILES, "max_source_bytes": MAX_SOURCE_BYTES,
                   "max_log_bytes": 256000},
        "omitted_checks": ["Arbitrary repositories, dependencies, and production readiness are outside this curated contract."],
    }


def validate_contract(contract: dict) -> dict:
    if not isinstance(contract, dict) or canonical_json(contract) != canonical_json(curated_contract()):
        raise MendError("invalid_contract", "Only the reviewed CSV-cleaner contract is supported.")
    return copy.deepcopy(contract)


def initial_files(contract: dict | None = None) -> dict[str, str]:
    checked = validate_contract(curated_contract() if contract is None else contract)
    return {"csv_tools.py": STARTER_SOURCE, **checked["protected_files"]}


def protected_checks_sha256(contract: dict) -> str:
    return source_sha256(validate_contract(contract)["protected_files"])


# Database-shaped records are serialized using explicit fields, not a denylist.
_PUBLIC_KEYS = frozenset('''id receipt_id task_id user_id parent_task_id prompt runtime status
contract contract_version contract_frozen_at contract_sha256 protected_checks_sha256 max_repairs
job_timeout_seconds repair_count execution_count usage stop_reason cancel_requested_at task_deadline_at
created_at updated_at completed_at expires_at source live_verification attempts receipt ordinal
model_id model_request_id snapshot_sha256 image_digest dispatch_requested_at deadline_at submitted_at
started_at finished_at provider_stopped_at exit_code failure_signature runner_report schema_version
checks omitted_checks duration_ms reproduction receipt_json final_attempt_id job_id input_tokens
output_tokens tokens cost actual_tokens actual_cost api_retry_count next_sequence sequence event_type stream provider_stream message payload truncated
limits template_id entry_point editable_paths protected_files commands argv required_check_ids required_command_ids max_executions
task_timeout_seconds max_tokens max_files max_source_bytes max_log_bytes files name path content
passed failed skipped total complete check_ids results check_id command_id command_results duration_seconds stdout stderr
reason code detail model artifacts bundle diff url expires_seconds attempt_history bundle_verified_sha256
'''.split())


def public_payload(value: Any) -> Any:
    """Allowlisted public records; never expose storage or worker authority."""
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key == "diagnostic_code":
                if "code" in value and value["code"] != item:
                    raise MendError("invalid_public_payload", "Response diagnostics are inconsistent.", 500)
                result["code"] = public_payload(item)
                continue
            if key == "api_retries":
                if "api_retry_count" in value and value["api_retry_count"] != item:
                    raise MendError("invalid_public_payload", "Response retry accounting is inconsistent.", 500)
                result["api_retry_count"] = public_payload(item)
                continue
            if key not in _PUBLIC_KEYS:
                continue
            if key == "contract" and item:
                result[key] = validate_contract(item)
            elif key in ("files", "protected_files"):
                result[key] = validate_files(item)
            else:
                result[key] = public_payload(item)
        return result
    if isinstance(value, (list, tuple)):
        return [public_payload(item) for item in value]
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    raise MendError("invalid_public_payload", "Response contains an unsupported value.", 500)
