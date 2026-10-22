"""Read-only consistency gate for controller-authenticated protected checks."""
from __future__ import annotations

from .domain import MendError, SHA256_RE, canonical_json, sha256_bytes
from .supervisor import ReportError, canonical, verify_report


_IDENTITIES = {"task_id", "attempt_id", "job_id", "contract_sha256", "snapshot_sha256",
               "protected_checks_sha256", "image_digest", "model_id"}
_COHORT = ("task_id", "contract_sha256", "snapshot_sha256", "protected_checks_sha256",
           "image_digest", "model_id")


def analyze_check_history(envelopes, expected_runs, contract, *, signing_key):
    """Expected runs/contract/key must come from operator-controlled state.

    This consumes an explicit historical inventory; it never schedules retries,
    removes tests, authorizes execution or proves that no other runs exist.
    """
    if (not isinstance(envelopes, list) or not isinstance(expected_runs, list)
            or len(envelopes) != len(expected_runs) or len(envelopes) > 100
            or not isinstance(contract, dict)
            or not isinstance(signing_key, bytes) or len(signing_key) < 32):
        raise MendError("invalid_check_history", "Use a bounded report inventory and trusted authority.")
    check_ids = contract.get("required_check_ids")
    if (not isinstance(check_ids, list) or not 1 <= len(check_ids) <= 64
            or any(not isinstance(x, str) or not 1 <= len(x) <= 200
                   or any(ord(c) < 32 for c in x) for x in check_ids)
            or len(set(check_ids)) != len(check_ids)
            or not isinstance(contract.get("commands"), list) or not contract["commands"]):
        raise MendError("invalid_check_history", "Frozen protected checks and commands are required.")
    contract_bytes = canonical_json(contract)
    if len(contract_bytes) > 262144:
        raise MendError("invalid_check_history", "Frozen contract exceeds the history bound.")
    contract_hash = sha256_bytes(contract_bytes)
    reports, jobs = [], set()
    try:
        if len(canonical(envelopes)) > 2_097_152:
            raise ReportError("History exceeds its review bound.")
        for expected, envelope in zip(expected_runs, envelopes):
            if (not isinstance(expected, dict) or set(expected) != _IDENTITIES
                    or any(not isinstance(v, str) or not 1 <= len(v) <= 512
                           or any(ord(c) <= 32 for c in v) for v in expected.values())
                    or any(not SHA256_RE.fullmatch(expected[f]) for f in
                           ("contract_sha256", "snapshot_sha256", "protected_checks_sha256"))
                    or expected["contract_sha256"] != contract_hash
                    or (expected_runs and any(expected[f] != expected_runs[0][f] for f in _COHORT))
                    or expected["job_id"] in jobs):
                raise ReportError("History mixes contexts or repeats a job.")
            jobs.add(expected["job_id"])
            reports.append(verify_report(envelope, signing_key, expected, contract))
    except (ReportError, KeyError):
        raise MendError("untrusted_check_history", "Reports must authenticate and match distinct frozen runs.", 409) from None
    checks = []
    for check_id in check_ids:
        statuses = [next(item["status"] for item in report["checks"]["results"]
                         if item["check_id"] == check_id) for report in reports]
        counts = {status: statuses.count(status) for status in ("passed", "failed", "skipped")}
        if counts["passed"] and counts["failed"]:
            classification = "inconsistent"
        elif len(reports) < 2 or counts["skipped"]:
            classification = "inconclusive"
        elif counts["failed"]:
            classification = "consistent_failure"
        else:
            classification = "observed_consistent_pass"
        checks.append({"check_id": check_id, "classification": classification, "counts": counts})
    blocked = any(c["classification"] in {"inconsistent", "consistent_failure"} for c in checks)
    command_failed = any(item["exit_code"] != 0 for report in reports for item in report["command_results"])
    inconclusive = any(c["classification"] == "inconclusive" for c in checks)
    # A skipped check is incomplete evidence even if its command exits nonzero.
    gate = "blocked" if blocked or (command_failed and not inconclusive) else "inconclusive" if inconclusive else "passed"
    return {
        "kind": "mend_check_history", "schema_version": 1,
        "contract_sha256": contract_hash,
        "cohort": {field: expected_runs[0][field] for field in _COHORT} if expected_runs else None,
        "observed_runs": len(reports), "checks": checks, "gate_status": gate,
        "command_failure_observed": command_failed,
        "quarantine_candidates": [c["check_id"] for c in checks if c["classification"] == "inconsistent"],
        "tests_excluded": False, "absence_of_flakiness_proven": False,
        "inventory_completeness_proven": False, "authority": "configured_hmac_key",
        "live_verification": False, "apply_authorized": False,
        "report_sha256": [sha256_bytes(canonical(e)) for e in envelopes],
        "history_sha256": sha256_bytes(canonical({"expected_runs": expected_runs, "reports": envelopes})),
    }
