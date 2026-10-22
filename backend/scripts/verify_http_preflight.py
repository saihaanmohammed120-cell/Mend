"""Run the existing real database-only application and verify its HTTP gate.

This probe never authenticates a fake actor, submits a job or enables live mode.
Database behavior and browser/provider verification require separate evidence.
"""
from __future__ import annotations

import argparse
import importlib.util
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def environment(path: Path) -> dict[str, str]:
    values = os.environ.copy()
    if not path.is_file():
        raise ValueError("private_environment_missing")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            raise ValueError("private_environment_invalid")
        key, value = stripped.split("=", 1)
        key, value = key.strip(), value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError("private_environment_invalid")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError("private_environment_invalid")
            value = value[1:-1]
        values[key] = value
    values["MEND_MODE"] = "database_only"
    values["MEND_LIVE_ENABLED"] = "false"
    return values


def read_endpoint(origin: str, path: str) -> dict:
    try:
        response = urllib.request.urlopen(origin + path, timeout=2)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(16385)
        if len(payload) > 16384:
            raise ValueError("http_response_too_large")
        body = json.loads(payload)
        if not isinstance(body, dict):
            raise ValueError("http_response_invalid")
        return {"http_status": response.code, "body": body}


def evidence_destination(output: Path, private_environment: Path) -> Path:
    # Resolve parents, but inspect the final directory entry without following it.
    lexical = Path(os.path.abspath(output))
    destination = lexical.parent.resolve() / lexical.name
    if destination.suffix != ".json" or destination == private_environment.resolve():
        raise ValueError("invalid_evidence_destination")
    try:
        metadata = destination.lstat()
    except FileNotFoundError:
        return destination
    try:
        aliases_environment = os.path.samefile(destination, private_environment)
    except FileNotFoundError:
        # Phase 1 prerequisites may intentionally use process-environment input.
        # An absent private file cannot be an alias of an existing report.
        aliases_environment = False
    if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink > 1
            or aliases_environment):
        raise ValueError("invalid_evidence_destination")
    return destination


def write_evidence(destination: Path, serialized: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".mend-evidence-", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
        # Replace the entry; never truncate a target inode that may have changed.
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def probe(root: Path, private_environment: Path) -> dict:
    if any(importlib.util.find_spec(name) is None for name in ("fastapi", "uvicorn")):
        raise ValueError("runtime_dependencies_missing")
    env = environment(private_environment)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "mend.bootstrap:create_app_from_env",
         "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"],
        cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 15
        origin = f"http://127.0.0.1:{port}"
        while True:
            try:
                health = read_endpoint(origin, "/healthz")
                break
            except (urllib.error.URLError, TimeoutError):
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise ValueError("application_startup_failed") from None
                time.sleep(0.1)
        readiness = read_endpoint(origin, "/readyz")
        if process.poll() is not None:
            raise ValueError("application_startup_failed")
        if health != {"http_status": 200, "body": {
            "status": "running", "mode": "database_only", "live_verification": False,
        }}:
            raise ValueError("health_contract_mismatch")
        body = readiness["body"]
        if (readiness["http_status"] != 503 or body.get("ready") is not False
                or body.get("mode") != "database_only"
                or not isinstance(body.get("blockers"), list)
                or "database_only_mode" not in body["blockers"]
                or "phase_1_release_evidence_required" not in body["blockers"]
                or body.get("provider_verification") != "not_established_by_this_endpoint"):
            raise ValueError("readiness_gate_mismatch")
        return {
            "status": "verified_http_preflight",
            "environment": "real_local_uvicorn_database_only",
            "dependencies": {name: version(name) for name in ("fastapi", "starlette", "uvicorn")},
            "health": health,
            "readiness": readiness,
            "database_behavior": "requires_independent_supabase_mcp_evidence",
            "authenticated_browser_flow": "unverified",
            "provider_execution": "unverified",
        }
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=root / ".env")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        destination = evidence_destination(args.output, args.env_file) if args.output is not None else None
        result = probe(root, args.env_file)
        serialized = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if destination is not None:
            write_evidence(destination, serialized)
    except Exception as error:
        known = {"private_environment_missing", "private_environment_invalid",
                 "runtime_dependencies_missing", "http_response_too_large",
                 "http_response_invalid", "application_startup_failed",
                 "health_contract_mismatch", "readiness_gate_mismatch",
                 "invalid_evidence_destination"}
        code = str(error) if isinstance(error, ValueError) and str(error) in known else "http_preflight_failed"
        # Transport, dependency and environment exceptions may contain secrets.
        print(json.dumps({"status": "blocked", "code": code, "http_preflight_verified": False}))
        return 1
    print(serialized, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
