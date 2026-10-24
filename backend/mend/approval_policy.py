"""Offline, source-bound review approval; never authority to execute or apply."""
from __future__ import annotations

import io
import re

from .bug_cases import review_bug_comparison
from .domain import MendError, SHA256_RE, canonical_json, sha256_bytes


_POLICY_FIELDS = {"kind", "schema_version", "policy_id", "case_sha256",
                  "max_changed_lines", "max_changed_bytes", "min_history_runs"}
_IDENTITY_FIELDS = {"task_id", "attempt_id", "job_id", "contract_sha256", "snapshot_sha256",
                    "protected_checks_sha256", "image_digest", "model_id"}


def evaluate_approval_policy(policy, case, candidate_source, evidence, expected_runs, *, signing_key):
    """Policy, expected identities and key must be supplied by a trusted operator.

    Reverify raw signed reports, not caller-supplied comparison status or risk
    scores. A successful result approves only review of these exact artifacts.
    """
    if (not isinstance(policy, dict) or set(policy) != _POLICY_FIELDS
            or policy.get("kind") != "mend_review_policy"
            or type(policy.get("schema_version")) is not int or policy["schema_version"] != 1
            or not isinstance(policy.get("policy_id"), str)
            or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", policy["policy_id"])
            or not isinstance(policy.get("case_sha256"), str)
            or not SHA256_RE.fullmatch(policy["case_sha256"])
            or any(type(policy.get(field)) is not int or not low <= policy[field] <= high
                   for field, low, high in (("max_changed_lines", 1, 400000),
                                             ("max_changed_bytes", 1, 400000),
                                             ("min_history_runs", 2, 100)))):
        raise MendError("invalid_review_policy", "Use one explicit version-one bounded review policy.")
    if sha256_bytes(canonical_json(case)) != policy["case_sha256"]:
        raise MendError("policy_case_mismatch", "The case is outside the operator-approved policy scope.", 409)
    for inventory in (evidence, expected_runs):
        if (not isinstance(inventory, dict) or set(inventory) != {"original", "candidate", "history"}
                or not isinstance(inventory["history"], list) or len(inventory["history"]) > 100):
            raise MendError("invalid_policy_inventory", "Explicit comparison and bounded history inventories are required.")
    for role in ("original", "candidate"):
        identity = expected_runs[role]
        if (not isinstance(identity, dict)
                or set(identity) != _IDENTITY_FIELDS | {"comparison_run_id", "execution_category"}):
            raise MendError("invalid_policy_inventory", "Operator-controlled comparative identities are required.")
    comparison = review_bug_comparison(case, candidate_source, evidence["original"], evidence["candidate"],
        signing_key=signing_key, original_identity=expected_runs["original"],
        candidate_identity=expected_runs["candidate"], candidate_history=evidence["history"],
        history_identities=expected_runs["history"])
    original = io.StringIO(case["intake"]["original_source"]).readlines()
    candidate = io.StringIO(candidate_source).readlines()
    # Conservative linear bound: count unchanged interior lines between separate edits too.
    start = 0
    while start < min(len(original), len(candidate)) and original[start] == candidate[start]:
        start += 1
    end = 0
    while (end < min(len(original), len(candidate)) - start
           and original[len(original) - end - 1] == candidate[len(candidate) - end - 1]):
        end += 1
    removed = original[start:len(original) - end]
    added = candidate[start:len(candidate) - end]
    risk = {"changed_lines": len(removed) + len(added),
            "changed_bytes": len(("".join(removed) + "".join(added)).encode("utf-8")),
            "observed_history_runs": comparison["check_history"]["observed_runs"]}
    reasons = []
    if comparison["status"] != "regression_demonstrated":
        reasons.append("authenticated_regression_not_demonstrated")
    if risk["observed_history_runs"] < policy["min_history_runs"]:
        reasons.append("insufficient_candidate_history")
    for metric in ("changed_lines", "changed_bytes"):
        if risk[metric] > policy["max_" + metric]:
            reasons.append(metric + "_exceeds_policy")
    return {
        "kind": "mend_policy_review", "schema_version": 1,
        "decision": "human_review_required" if reasons else "review_approved", "reasons": reasons,
        "policy_id": policy["policy_id"], "policy_sha256": sha256_bytes(canonical_json(policy)),
        "case_sha256": comparison["case_sha256"], "contract_sha256": comparison["contract_sha256"],
        "original_snapshot_sha256": comparison["original_snapshot_sha256"],
        "candidate_snapshot_sha256": comparison["candidate_snapshot_sha256"],
        "protected_checks_sha256": comparison["protected_checks_sha256"],
        "comparison_sha256": sha256_bytes(canonical_json(comparison)),
        "evidence_sha256": sha256_bytes(canonical_json(evidence)),
        "expected_runs_sha256": sha256_bytes(canonical_json(expected_runs)),
        "risk": risk, "comparison_status": comparison["status"],
        "history_gate_status": comparison["check_history"]["gate_status"],
        "authority": "operator_policy_and_configured_hmac_key", "execution_enabled": False,
        "apply_authorized": False, "live_verification": False,
        "omitted_verification": ["Semantic or security correctness beyond protected checks",
                                  "Completeness of operator-selected historical inventory",
                                  "Independent provider authority and infrastructure stop timing",
                                  "Public receipt signing and external repository application"],
    }
