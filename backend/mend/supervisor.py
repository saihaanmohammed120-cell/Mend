"""Trusted report verifier and non-authoritative container check probe.

The probe's stdout is diagnostics, never a receipt. A trusted controller outside
the generated-code process must sign evidence; no signing key enters this image.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import signal
import subprocess
import sys


class ReportError(ValueError):
    pass


def canonical(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                          allow_nan=False).encode("utf-8")
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise ReportError("Report must contain bounded finite UTF-8 JSON.") from None


def sign_report(report: dict, key: bytes) -> dict:
    if not isinstance(key, bytes) or len(key) < 32:
        raise ReportError("Trusted report signing key requires at least 32 bytes.")
    return {"report": report, "signature": hmac.new(key, canonical(report), hashlib.sha256).hexdigest()}


def verify_report(envelope: dict, key: bytes, expected: dict, contract: dict) -> dict:
    """Called only in trusted backend/controller; keys never enter candidate jobs."""
    if (not isinstance(expected, dict) or not isinstance(contract, dict)
            or not isinstance(contract.get("commands"), list)
            or not contract["commands"]
            or not isinstance(contract.get("required_check_ids"), list)
            or not contract["required_check_ids"]
            or any(not isinstance(value, str) for value in contract["required_check_ids"])
            or any(not isinstance(item, dict) or not isinstance(item.get("id"), str)
                   or not isinstance(item.get("argv"), list) or not item["argv"]
                   or any(not isinstance(arg, str) for arg in item["argv"]) for item in contract["commands"])):
        raise ReportError("Frozen report expectations are malformed.")
    if (len({item["id"] for item in contract["commands"]}) != len(contract["commands"])
            or len(set(contract["required_check_ids"])) != len(contract["required_check_ids"])):
        raise ReportError("Frozen report identities must be unique.")
    if not isinstance(envelope, dict) or set(envelope) != {"report", "signature"}:
        raise ReportError("Malformed trusted report envelope.")
    report, signature = envelope["report"], envelope["signature"]
    if not isinstance(report, dict) or len(canonical(report)) > 65536:
        raise ReportError("Trusted report is malformed or oversized.")
    if not isinstance(key, bytes) or len(key) < 32 or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{64}", signature):
        raise ReportError("Invalid trusted report authority.")
    actual = hmac.new(key, canonical(report), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(actual, signature):
        raise ReportError("Trusted report signature mismatch.")
    identities = ("task_id", "attempt_id", "job_id", "contract_sha256", "snapshot_sha256",
                  "protected_checks_sha256", "image_digest", "model_id")
    if any(not expected.get(field) or report.get(field) != expected[field] for field in identities):
        raise ReportError("Report does not match the frozen attempt identity.")
    if report.get("source") != "live" or report.get("complete") is not True:
        raise ReportError("Live report must be complete and explicitly sourced.")
    command_results = report.get("command_results")
    if not isinstance(command_results, list) or len(command_results) != len(contract["commands"]):
        raise ReportError("Required command evidence is incomplete.")
    commands = {item["id"]: item["argv"] for item in contract["commands"]}
    if any(not isinstance(item, dict) or not isinstance(item.get("command_id"), str) for item in command_results):
        raise ReportError("Command identities must be strings.")
    if len({item.get("command_id") for item in command_results if isinstance(item, dict)}) != len(commands):
        raise ReportError("Command identities are duplicated or missing.")
    for item in command_results:
        if (not isinstance(item, dict) or item.get("command_id") not in commands
                or item.get("argv") != commands[item["command_id"]]
                or type(item.get("exit_code")) is not int):
            raise ReportError("A required command was not recorded exactly as frozen.")
    checks = report.get("checks")
    required = set(contract["required_check_ids"])
    if not isinstance(checks, dict) or type(checks.get("total")) is not int or checks.get("total") != len(required):
        raise ReportError("Required check totals do not match.")
    results = checks.get("results")
    if not isinstance(results, list) or len(results) != len(required):
        raise ReportError("Required check evidence is incomplete.")
    if any(not isinstance(item, dict) or not isinstance(item.get("check_id"), str) for item in results):
        raise ReportError("Check identities must be strings.")
    if {item.get("check_id") for item in results if isinstance(item, dict)} != required:
        raise ReportError("Required check identities do not match.")
    if any(not isinstance(item, dict) or not isinstance(item.get("status"), str)
           or item["status"] not in {"passed", "failed", "skipped"} for item in results):
        raise ReportError("Required check results have an unknown status.")
    for status in ("passed", "failed", "skipped"):
        if type(checks.get(status)) is not int or checks[status] != sum(item["status"] == status for item in results):
            raise ReportError("Required check counts do not match individual results.")
    passed = checks["passed"] == len(required) and all(item["exit_code"] == 0 for item in command_results)
    if type(report.get("passed")) is not bool or report["passed"] != passed:
        raise ReportError("Report success flag disagrees with protected evidence.")
    return json.loads(canonical(report))


def probe(input_dir="/input", timeout=55.0) -> int:
    """Run only the curated command as non-root; output is explicitly untrusted.

    This child can influence its own unittest output, so no signed report is made.
    Local tests do not invoke this function against generated code on the host.
    """
    if os.geteuid() == 0:
        raise ReportError("Generated checks must not execute as root.")
    if isinstance(timeout, bool) or not isinstance(timeout, (float, int)) or not math.isfinite(timeout) or not 0 < timeout <= 55:
        raise ReportError("Probe timeout exceeds its bounded diagnostic scope.")
    with open(os.path.join(input_dir, "mend-manifest.json"), "rb") as handle:
        data = handle.read(65537)
    if len(data) > 65536:
        raise ReportError("Injected manifest exceeds provider bounds.")
    manifest = json.loads(data)
    expected = [{"id": "unit-tests", "argv": ["python", "-m", "unittest", "-v", "test_csv_tools"]}]
    if (not isinstance(manifest, dict) or not isinstance(manifest.get("contract"), dict)
            or manifest["contract"].get("commands") != expected):
        raise ReportError("Only the reviewed check command is executable.")
    print("Mend probe: diagnostic output only; trusted report required separately.", flush=True)
    process = subprocess.Popen(expected[0]["argv"],
        cwd=input_dir, env={"PATH": "/usr/local/bin:/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"},
        stdin=subprocess.DEVNULL, start_new_session=True)
    try:
        return process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        return 124
    finally:
        # Kill the original process group. Escaped descendants require verified
        # container/PID isolation; this helper alone is not that safety guarantee.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


if __name__ == "__main__":
    try:
        raise SystemExit(probe())
    except (ReportError, OSError, ValueError, KeyError):
        print("Mend probe could not execute the approved command.", file=sys.stderr)
        raise SystemExit(125)
