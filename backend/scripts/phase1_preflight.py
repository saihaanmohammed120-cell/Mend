"""Redacted local prerequisites for the real inference/job measurement spike.

No provider calls, cloud resources, task mutations or release-gate changes occur.
Configured credentials are not authenticated evidence. Top-level status covers
the standalone timing spike; production-runner configuration is separate and
never establishes runtime release readiness.
"""
from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from mend.config import Settings
from scripts.verify_http_preflight import environment, evidence_destination, write_evidence

REQUIRED = (
    "NEBIUS_TOKEN_FACTORY_API_KEY", "NEBIUS_IAM_TOKEN", "NEBIUS_PROJECT_ID",
    "NEBIUS_SUBNET_ID", "NEBIUS_PLATFORM", "NEBIUS_PRESET",
    "MEND_INPUT_PRICE_PER_MILLION", "MEND_OUTPUT_PRICE_PER_MILLION", "MEND_PRICE_PROVENANCE",
    "MEND_SPIKE_IMAGE", "MEND_TASK_COST_CAP", "MEND_SPIKE_PROBE_APPROVED",
)
RUNTIME_REQUIRED = ("MEND_RUNNER_IMAGE_DIGEST",)
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$")


def inspect_configuration(values: dict[str, str], *, cli_present: bool,
                          dependencies_present: bool) -> dict:
    present = {key: isinstance(values.get(key), str) and bool(values[key].strip())
               for key in REQUIRED + RUNTIME_REQUIRED}
    missing = [key for key in REQUIRED if not present[key]]
    invalid = []
    for key in ("NEBIUS_PROJECT_ID", "NEBIUS_SUBNET_ID", "NEBIUS_PLATFORM", "NEBIUS_PRESET"):
        if present[key] and not IDENTIFIER.fullmatch(values[key]):
            invalid.append(key)
    image_pattern = r"[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}"
    if present["MEND_SPIKE_IMAGE"] and not re.fullmatch(image_pattern, values["MEND_SPIKE_IMAGE"]):
        invalid.append("MEND_SPIKE_IMAGE")
    runtime_invalid = []
    if present["MEND_RUNNER_IMAGE_DIGEST"] and not re.fullmatch(image_pattern, values["MEND_RUNNER_IMAGE_DIGEST"]):
        runtime_invalid.append("MEND_RUNNER_IMAGE_DIGEST")
    if present["MEND_SPIKE_PROBE_APPROVED"] and values["MEND_SPIKE_PROBE_APPROVED"] != "true":
        invalid.append("MEND_SPIKE_PROBE_APPROVED")
    for key in ("NEBIUS_TOKEN_FACTORY_API_KEY", "NEBIUS_IAM_TOKEN"):
        if present[key] and (len(values[key]) > 8192 or any(ord(c) < 33 or ord(c) > 126 for c in values[key])):
            invalid.append(key)
    for key in ("MEND_INPUT_PRICE_PER_MILLION", "MEND_OUTPUT_PRICE_PER_MILLION", "MEND_TASK_COST_CAP"):
        if present[key]:
            try:
                if len(values[key]) > 128:
                    raise ValueError()
                price = Decimal(values[key])
                represented = float(price)
                if (not price.is_finite() or price < 0 or not math.isfinite(represented)
                        or (price != 0 and represented == 0)
                        or (key == "MEND_TASK_COST_CAP" and price <= 0)):
                    raise ValueError()
            except (InvalidOperation, ValueError, OverflowError):
                invalid.append(key)
    model = values.get("NEBIUS_MODEL_ID", Settings.model_id)
    if not isinstance(model, str) or not re.fullmatch(r"nvidia/[A-Za-z0-9._/-]{1,180}", model) or "nemotron" not in model.lower():
        invalid.append("NEBIUS_MODEL_ID")
    endpoint = values.get("NEBIUS_TOKEN_FACTORY_URL", Settings.token_factory_url)
    if not isinstance(endpoint, str) or endpoint.rstrip("/") not in (
            "https://api.tokenfactory.nebius.com", "https://api.tokenfactory.nebius.com/v1"):
        invalid.append("NEBIUS_TOKEN_FACTORY_URL")
    blockers = ["missing:" + key for key in missing] + ["invalid:" + key for key in invalid]
    if not cli_present:
        blockers.append("nebius_cli_missing_for_job_logs")
    if not dependencies_present:
        blockers.append("backend_runtime_dependencies_missing")
    return {
        "schema_version": 1,
        "scope": "local_phase1_spike_prerequisites_only",
        "status": "blocked" if blockers else "configured_unverified",
        "configuration_presence": present,
        "invalid_fields": invalid,
        "blockers": blockers,
        "nebius_cli_present": cli_present,
        "backend_dependencies_present": dependencies_present,
        "credentials_redacted": True,
        "configured_limits": {
            "job_seconds": Settings.job_timeout_seconds,
            "task_seconds": Settings.task_timeout_seconds,
            "max_repairs": Settings.max_repairs,
            "token_cap": Settings.max_tokens,
            "provider_feasibility": "unverified",
        },
        "live_observations": {
            "model_discovery": "not_run",
            "inference": "not_run",
            "job_provisioning": "not_run",
            "cancel_to_stop_seconds": None,
            "verified_fix_receipt": "not_produced",
        },
        "submission_state": {
            "public_repo": "requires_github_mcp_evidence",
            "walkthrough": "unverified",
            "browser_acceptance": "requires_playwright_mcp_evidence",
        },
        "live_release_enabled_by_probe": False,
        "runtime_integration": {
            "runner_configuration_presence": {key: present[key] for key in RUNTIME_REQUIRED},
            "runner_invalid_fields": runtime_invalid,
            "release_readiness": "unverified_not_established_by_spike_configuration",
            "trusted_report_transport": "unverified_requires_integration",
            "independent_stop_evidence": "unverified_requires_integration",
            "monetary_task_cap": "requires_service_and_release_gate_evidence",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        destination = evidence_destination(args.output, args.env_file) if args.output else None
        values = environment(args.env_file) if args.env_file.is_file() else os.environ.copy()
        result = inspect_configuration(values,
            cli_present=shutil.which("nebius", path=values.get("PATH")) is not None,
            dependencies_present=all(importlib.util.find_spec(name) is not None for name in ("fastapi", "uvicorn")))
        serialized = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if destination is not None:
            write_evidence(destination, serialized)
    except Exception:
        print(json.dumps({"status": "blocked", "code": "local_preflight_failed",
                          "credentials_redacted": True, "live_release_enabled_by_probe": False}))
        return 1
    print(serialized, end="")
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
