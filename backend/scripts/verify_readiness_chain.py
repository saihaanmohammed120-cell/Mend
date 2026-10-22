"""Observe the real local Next → FastAPI → Supabase readiness path without writes."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.verify_http_preflight import environment, evidence_destination, write_evidence


def read_endpoint(origin, path):
    # Allow the backend's ten-second probe deadline and frontend proxy to report.
    try:
        response = urllib.request.urlopen(origin + path, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(8193)
        if len(payload) > 8192:
            raise ValueError("readiness_report_too_large")
        value = json.loads(payload)
        if not isinstance(value, dict):
            raise ValueError("readiness_report_invalid")
        return {"http_status": response.code, "body": value}


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def wait_for(process, origin, path):
    deadline = time.monotonic() + 20
    while True:
        try:
            return read_endpoint(origin, path)
        except (urllib.error.URLError, TimeoutError):
            if process.poll() is not None or time.monotonic() >= deadline:
                raise ValueError("readiness_server_unavailable") from None
            time.sleep(0.1)


def probe(private_environment):
    backend_env = environment(private_environment)
    backend_origin = f"http://127.0.0.1:{free_port()}"
    frontend_port = free_port()
    frontend_origin = f"http://127.0.0.1:{frontend_port}"
    # Never pass the backend's service credential environment to the frontend.
    frontend_env = {key: value for key, value in os.environ.items()
                    if not key.startswith(("MEND_", "SUPABASE_", "NEBIUS_"))}
    frontend_env["MEND_BACKEND_URL"] = backend_origin
    processes = []
    try:
        api = subprocess.Popen([sys.executable, "-m", "uvicorn", "mend.bootstrap:create_app_from_env", "--factory",
                                "--host", "127.0.0.1", "--port", backend_origin.rsplit(":", 1)[1], "--no-access-log"],
                               cwd=ROOT, env=backend_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(api)
        wait_for(api, backend_origin, "/healthz")
        frontend = ROOT.parent / "frontend"
        ui = subprocess.Popen(["node", str(frontend / "node_modules/next/dist/bin/next"), "start", "--hostname",
                               "127.0.0.1", "--port", str(frontend_port)], cwd=frontend, env=frontend_env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(ui)
        backend = read_endpoint(backend_origin, "/readyz")
        client = wait_for(ui, frontend_origin, "/api/runtime")
        for report in (backend, client):
            body = report["body"]
            if (body.get("ready") is not False or body.get("mode") != "database_only"
                    or body.get("database") != {"status": "verified", "source": "supabase_rpc", "release_gate": "disabled"}
                    or "database_release_gate_disabled" not in body.get("blockers", [])
                    or not isinstance(body.get("checked_at"), str)):
                raise ValueError("real_database_readiness_mismatch")
        if backend["http_status"] != 503 or client["http_status"] != 200 or client["body"].get("api_status") != "reachable":
            raise ValueError("readiness_transport_mismatch")
        allowed = {"ready", "mode", "blockers", "database", "checked_at", "api_status", "provider_verification"}
        if any(set(report["body"]) - allowed for report in (backend, client)):
            raise ValueError("unexpected_readiness_fields")
        return {"status": "verified_read_only_readiness_chain", "environment": "local_production_next_and_uvicorn_real_supabase",
                "backend": backend, "frontend": client, "database_mutation": False, "provider_execution": "unverified",
                "public_backend_deployment": "unverified", "browser_panel_acceptance": "unverified"}
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        destination = evidence_destination(args.output, args.env_file)
        result = probe(args.env_file)
        write_evidence(destination, json.dumps(result, indent=2) + "\n")
    except Exception:
        print(json.dumps({"status": "failed", "reason": "readiness_chain_not_verified"}))
        return 1
    print(json.dumps({"status": result["status"], "ready": False, "database_verified": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
