"""Offline Python bug contracts and source-bound comparative report validation.

No code is executed, persisted, or sent to a provider here. This recipe is not
accepted by the existing live CSV task engine until its release gates are met.
"""
from __future__ import annotations

import difflib
import io
import json
import keyword
import re

from .domain import MendError, canonical_json, sha256_bytes, source_sha256, validate_files
from .check_history import analyze_check_history
from .supervisor import ReportError, verify_report


_INTAKE_FIELDS = {"kind", "schema_version", "file_path", "reported_error", "original_source",
                  "expected_behavior", "evidence"}
_NOT_RUN = {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}
_CHECK_ID = re.compile(r"test_regression\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*")


def prepare_bug_case(intake, protected_test_source, required_check_ids, target_check_id):
    """Freeze a proposed contract; this is preparation, never execution approval."""
    if (not isinstance(intake, dict) or set(intake) != _INTAKE_FIELDS
            or intake.get("kind") != "mend_bug_intake"
            or type(intake.get("schema_version")) is not int or intake["schema_version"] != 1
            or intake.get("evidence") != _NOT_RUN):
        raise MendError("invalid_bug_intake", "A version-one, unexecuted bug intake is required.")
    path = intake.get("file_path")
    if (not isinstance(path, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}\.py", path)
            or keyword.iskeyword(path[:-3]) or path in {"test_regression.py", "__init__.py"}):
        raise MendError("invalid_bug_path", "Use one importable Python module distinct from the protected regression.")
    for field in ("reported_error", "expected_behavior"):
        value = intake.get(field)
        if value is None and field == "reported_error":
            continue
        if (not isinstance(value, str) or len(value) > 8000 or "\x00" in value
                or (field == "expected_behavior" and not value.strip())):
            raise MendError("invalid_bug_text", "A bounded expected behavior and optional error are required.")
    source = intake.get("original_source")
    if (not isinstance(source, str) or not source.strip()
            or not isinstance(protected_test_source, str) or not protected_test_source.strip()):
        raise MendError("incomplete_bug_case", "Original source and proposed protected regression are required.")
    original_files = validate_files({path: source, "test_regression.py": protected_test_source})
    if (not isinstance(required_check_ids, list) or not 1 <= len(required_check_ids) <= 64
            or any(not isinstance(item, str) or len(item) > 200 or not _CHECK_ID.fullmatch(item)
                   for item in required_check_ids)
            or len(set(required_check_ids)) != len(required_check_ids)
            or not isinstance(target_check_id, str) or target_check_id not in required_check_ids):
        raise MendError("invalid_bug_checks", "Unique named regression checks and one target check are required.")
    contract = {
        "schema_version": 1, "template_id": "python-module-v1", "runtime": "python",
        "entry_point": path, "editable_paths": [path],
        "protected_files": {"test_regression.py": protected_test_source},
        "commands": [{"id": "unit-tests", "argv": ["python", "-m", "unittest", "-v", "test_regression"]}],
        "required_command_ids": ["unit-tests"], "required_check_ids": list(required_check_ids),
        "target_check_id": target_check_id,
        "allocation": {"reproduction": 1, "candidate": 2, "comparative_regression": 1},
        "limits": {"max_executions": 4, "max_repairs": 1, "job_timeout_seconds": 60,
                   "task_timeout_seconds": 600, "max_tokens": 30000, "max_files": 2,
                   "max_source_bytes": 200000, "max_log_bytes": 256000},
        "omitted_checks": ["Arbitrary repositories and dependencies", "Repository patch application",
                           "Live execution, stop timing and public receipt signing"],
    }
    prepared = {
        "kind": "mend_bug_contract", "schema_version": 1, "intake": intake, "contract": contract,
        "intake_sha256": sha256_bytes(canonical_json(intake)),
        "contract_sha256": sha256_bytes(canonical_json(contract)),
        "original_source_sha256": source_sha256({path: source}),
        "snapshot_sha256": source_sha256(original_files),
        "protected_checks_sha256": source_sha256(contract["protected_files"]),
        "execution_enabled": False, "approval_status": "not_approved", "live_verification": False,
        "allocation_feasibility": "unmeasured",
    }
    # Canonical serialization validates text at the boundary and breaks aliases.
    return json.loads(canonical_json(prepared))


def review_bug_comparison(case, candidate_source, original_envelope, candidate_envelope,
                          *, signing_key, original_identity, candidate_identity,
                          candidate_history=None, history_identities=None):
    """Validate two controller-authenticated observations against a frozen case.

    Identities and the key must come from trusted backend/controller state, not
    the browser or a candidate workload. HMAC authentication alone does not
    establish provider independence, stop timing, or a public signing identity.
    """
    try:
        contract = case["contract"]
        rebuilt = prepare_bug_case(case["intake"], contract["protected_files"]["test_regression.py"],
                                   contract["required_check_ids"], contract["target_check_id"])
        if canonical_json(case) != canonical_json(rebuilt):
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise MendError("invalid_bug_contract", "The proposed case contract has changed.", 409) from None
    path = contract["entry_point"]
    original_source = case["intake"]["original_source"]
    candidate = validate_files({path: candidate_source, **contract["protected_files"]})
    if not candidate_source.strip() or candidate_source == original_source:
        raise MendError("empty_patch", "A nonempty changed candidate is required.")
    for identity, snapshot, role in ((original_identity, case["snapshot_sha256"], "original"),
                                     (candidate_identity, source_sha256(candidate), "candidate")):
        if (not isinstance(identity, dict)
                or identity.get("comparison_run_id") != role
                or identity.get("execution_category") != "comparative_regression"
                or identity.get("snapshot_sha256") != snapshot
                or identity.get("contract_sha256") != case["contract_sha256"]
                or identity.get("protected_checks_sha256") != case["protected_checks_sha256"]
                or any(not isinstance(identity.get(field), str) or not 1 <= len(identity[field]) <= 512
                       or any(ord(c) <= 32 for c in identity[field])
                       for field in ("task_id", "attempt_id", "job_id", "image_digest", "model_id"))):
            raise MendError("comparison_identity", "Comparison does not match the frozen source and checks.", 409)
    if any(original_identity[field] != candidate_identity[field]
           for field in ("task_id", "attempt_id", "job_id", "image_digest", "model_id")):
        raise MendError("comparison_identity", "Both snapshots must use the same reserved comparative job.", 409)
    try:
        original = verify_report(original_envelope, signing_key, original_identity, contract)
        fixed = verify_report(candidate_envelope, signing_key, candidate_identity, contract)
        for report, identity in ((original, original_identity), (fixed, candidate_identity)):
            if any(report.get(field) != identity[field] for field in ("comparison_run_id", "execution_category")):
                raise ReportError("Comparative run role does not match the reserved job.")
    except ReportError:
        raise MendError("comparison_report", "Comparison evidence is unauthenticated, incomplete or inconsistent.", 409) from None
    history = None
    if candidate_history is not None or history_identities is not None:
        history = analyze_check_history(candidate_history, history_identities, contract, signing_key=signing_key)
        cohort = history["cohort"]
        if cohort is not None and any(cohort[field] != candidate_identity[field] for field in cohort):
            raise MendError("comparison_identity", "History must describe this exact candidate and checks.", 409)
    target = next(item for item in original["checks"]["results"]
                  if item["check_id"] == contract["target_check_id"])
    if not fixed["passed"]:
        status = "candidate_failed"
    elif target["status"] != "failed":
        status = "not_demonstrated"
    elif (target.get("failure_kind") != "behavioral_assertion"
          or original["checks"]["skipped"] != 0
          or original["command_results"][0]["exit_code"] != 1):
        status = "failure_not_established"
    else:
        status = "regression_demonstrated"
    if history is not None and history["gate_status"] != "passed":
        status = "candidate_history_blocked" if history["gate_status"] == "blocked" else "candidate_history_inconclusive"
    diff = []
    for line in difflib.unified_diff(io.StringIO(original_source).readlines(),
                                    io.StringIO(candidate_source).readlines(),
                                    fromfile="a/" + path, tofile="b/" + path):
        diff.append(line)
        if not line.endswith("\n"):
            diff.append("\n\\ No newline at end of file\n")
    return {
        "kind": "mend_bug_comparison", "schema_version": 1,
        "case_sha256": sha256_bytes(canonical_json(case)), "contract_sha256": case["contract_sha256"],
        "task_id": original_identity["task_id"], "attempt_id": original_identity["attempt_id"],
        "job_id": original_identity["job_id"], "execution_category": "comparative_regression",
        "comparison_run_ids": ["original", "candidate"],
        "original_snapshot_sha256": case["snapshot_sha256"], "candidate_snapshot_sha256": source_sha256(candidate),
        "protected_checks_sha256": case["protected_checks_sha256"], "status": status,
        "diff": "".join(diff), "original_checks": original["checks"], "candidate_checks": fixed["checks"],
        "authority": "configured_hmac_keys", "live_verification": False, "apply_authorized": False,
        "check_history": history,
        "omitted_verification": ["Independent provider authority", "Infrastructure stop timing",
                                 "Public receipt signature", "External repository application"],
    }
