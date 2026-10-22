"""Fail-closed Nebius Jobs adapter; console output is never verification evidence."""
from __future__ import annotations

import asyncio
import base64
import codecs
import datetime as dt
import inspect
import re
import signal
import time
from urllib.parse import urlencode

from .domain import MendError, canonical_json, source_sha256, validate_contract, validate_files
from .transport import JsonTransport, TransportError
from .termination import confirmed_stop

API = "https://api.nebius.cloud/ai/v1/jobs"
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$")


def identifier(value: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise MendError("runner_identifier", "Provider identifiers are invalid.", 502)
    return value


def timestamp(value: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError
        return parsed
    except (AttributeError, TypeError, ValueError) as exc:
        raise MendError("runner_deadline", "A persisted timezone-aware deadline is required.", 409) from exc


def metadata(job: dict) -> dict:
    value = job.get("metadata") if isinstance(job, dict) else None
    if not isinstance(value, dict):
        raise MendError("runner_ambiguous", "Provider job metadata is not recognizable.", 502)
    return value


def async_reader(reader) -> bool:
    return reader is None or inspect.iscoroutinefunction(reader) or inspect.iscoroutinefunction(getattr(reader, "__call__", None))


class NebiusRunner:
    source = "live"

    def __init__(self, token: str, project_id: str, image: str, *, subnet_id: str,
                 platform: str, preset: str, release_enabled: bool = False,
                 transport=None, report_reader=None, termination_reader=None, evidence_readers=None,
                 reader_timeout=3.0, cli_path="nebius", cli_env=None, clock=None):
        if not isinstance(token, str) or not token or any(char in token for char in "\r\n"):
            raise MendError("runner_credentials", "Nebius Cloud access token is required.", 503)
        self.project_id = identifier(project_id)
        if not isinstance(image, str) or not re.fullmatch(r"[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}", image):
            raise MendError("runner_image", "Runner image must be pinned by SHA-256 digest.", 503)
        self.image, self.image_digest = image, image.rsplit("@", 1)[1]
        self.subnet_id, self.platform, self.preset = map(identifier, (subnet_id, platform, preset))
        if evidence_readers is not None:
            if getattr(evidence_readers, "project_id", None) != self.project_id:
                raise MendError("runner_reader", "Paired evidence readers must match the configured provider project.", 503)
            if report_reader is not None or termination_reader is not None:
                raise MendError("runner_reader", "Paired evidence readers cannot be mixed with individual readers.", 503)
            report_reader = getattr(evidence_readers, "report", None)
            termination_reader = getattr(evidence_readers, "termination", None)
            if report_reader is None or termination_reader is None:
                raise MendError("runner_reader", "Paired report and termination readers are required.", 503)
        if not async_reader(report_reader) or not async_reader(termination_reader):
            raise MendError("runner_reader", "Trusted evidence readers must be asynchronous and bounded.", 503)
        if isinstance(reader_timeout, bool) or not isinstance(reader_timeout, (int, float)) or not 0 < reader_timeout <= 10:
            raise MendError("runner_reader", "Evidence reader timeout is invalid.", 503)
        self.report_reader, self.termination_reader, self.reader_timeout = report_reader, termination_reader, reader_timeout
        self.cli_path = cli_path
        # Validate configuration before allocating an owned transport.
        self.cli_env = dict(cli_env or {})
        if any(key not in {"PATH", "HOME", "XDG_CONFIG_HOME", "NEBIUS_PROFILE", "LANG"} for key in self.cli_env):
            raise MendError("runner_cli_environment", "CLI environment contains unapproved variables.", 503)
        self.release_enabled = bool(release_enabled)
        self.transport = transport or JsonTransport({"api.nebius.cloud"})
        self._owns_transport = transport is None
        self.headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
        self.clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))

    async def _jobs(self):
        deadline, items, token, seen = time.monotonic() + 10.0, [], "", set()
        for _ in range(10):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MendError("runner_ambiguous", "Provider listing exhausted its deadline.", 502)
            query = {"parentId": self.project_id, "pageSize": 100}
            if token:
                query["pageToken"] = token
            response = await self.transport.request("GET", API + "?" + urlencode(query),
                headers=self.headers, timeout=remaining)
            page = response.get("items") if isinstance(response, dict) else None
            if not isinstance(page, list) or len(items) + len(page) > 1000:
                raise MendError("runner_ambiguous", "Provider listing exceeded its count or schema boundary.", 502)
            for job in page:
                metadata(job)
            items.extend(page)
            next_token = response.get("nextPageToken", "")
            if not isinstance(next_token, str) or len(next_token) > 4096 or next_token in seen:
                raise MendError("runner_ambiguous", "Provider pagination is malformed or cyclic.", 502)
            if not next_token:
                return items
            seen.add(next_token)
            token = next_token
        raise MendError("runner_ambiguous", "Provider listing exceeded its page boundary.", 502)

    async def reconcile(self, submission_key: str) -> dict:
        """Read-only recovery. Listing absence never authorizes a second create."""
        name = "mend-" + identifier(submission_key)
        try:
            matches = [job for job in await self._jobs() if isinstance(job, dict)
                       and metadata(job).get("name") == name]
            if len(matches) != 1:
                return {"status": "ambiguous", "job_id": None,
                        "reason": "submission_not_unique" if matches else "submission_not_visible"}
            job_id = identifier(metadata(matches[0]).get("id"))
        except (MendError, TransportError):
            return {"status": "ambiguous", "job_id": None, "reason": "provider_listing_unavailable"}
        return {"status": "found", "job_id": job_id,
                "reference": API + "?" + urlencode({"parentId": self.project_id}) + "#" + job_id}

    async def submit(self, task: dict, attempt: dict, files: dict, contract: dict) -> str:
        if not self.release_enabled:
            raise MendError("runner_release_gate", "Live execution is blocked pending measured safety evidence.", 503)
        validate_contract(contract)
        checked = validate_files(files)
        if source_sha256(checked) != attempt.get("snapshot_sha256"):
            raise MendError("runner_snapshot", "Dispatched source does not match the persisted snapshot.", 409)
        if any(checked.get(path) != text for path, text in contract["protected_files"].items()):
            raise MendError("runner_protected", "Protected checks were altered.", 409)
        if self.clock() >= timestamp(attempt.get("deadline_at")):
            raise MendError("runner_deadline", "Dispatch deadline has already elapsed.", 409)
        if not attempt.get("dispatch_requested_at"):
            raise MendError("runner_deadline", "Dispatch must be committed before provider submission.", 409)
        if task.get("cancel_requested_at"):
            raise MendError("runner_cancelled", "Cancellation blocks new provider submission.", 409)
        name = "mend-" + identifier(attempt.get("submission_key"))
        matches = [job for job in await self._jobs() if isinstance(job, dict)
                   and metadata(job).get("name") == name]
        if len(matches) > 1:
            raise MendError("runner_ambiguous", "Multiple jobs match the persisted submission key.", 502)
        if matches:
            return identifier(metadata(matches[0]).get("id"))
        injected = []
        for path, text in checked.items():
            raw = text.encode("utf-8")
            if len(raw) > 65536:
                raise MendError("runner_file_limit", "Nebius injected files are limited to 64 KiB each.", 400)
            injected.append({"containerPath": "/input/" + path,
                             "content": base64.b64encode(raw).decode("ascii")})
        manifest = {"task_id": task["id"], "attempt_id": attempt["id"],
                    "snapshot_sha256": attempt["snapshot_sha256"], "contract": contract}
        manifest_bytes = canonical_json(manifest)
        if len(manifest_bytes) > 65536:
            raise MendError("runner_file_limit", "Injected manifest exceeds 64 KiB.")
        injected.append({"containerPath": "/input/mend-manifest.json",
                         "content": base64.b64encode(manifest_bytes).decode("ascii")})
        body = {"metadata": {"parentId": self.project_id, "name": name}, "spec": {
            "image": self.image, "containerCommand": "python", "args": "-I /opt/mend/probe.py",
            "workingDir": "/input", "timeout": "3600s", "subnetId": self.subnet_id,
            "platform": self.platform, "preset": self.preset, "injectedFiles": injected,
            "environmentVariables": [], "preemptible": False,
        }}
        remaining = (timestamp(attempt["deadline_at"]) - self.clock()).total_seconds()
        if remaining <= 0:
            raise MendError("runner_deadline", "Reconciliation exhausted the dispatch deadline.", 409)
        response = await self.transport.request("POST", API, headers=self.headers,
                                                json_body=body, timeout=min(10.0, remaining))
        # An operation ID is not a job ID. Reconciliation must determine the resource.
        # Create normally returns Operation, so confirm resource identity by a
        # read-only name lookup rather than interpreting any operation metadata.
        found = await self.reconcile(attempt["submission_key"])
        if found["status"] != "found":
            raise MendError("runner_ambiguous", "Submission acknowledgment contains no confirmed job identity.", 502)
        return found["job_id"]

    async def observe(self, job_id: str) -> dict:
        identifier(job_id)
        matches = [job for job in await self._jobs() if isinstance(job, dict)
                   and metadata(job).get("id") == job_id]
        if len(matches) != 1:
            return {"status": "unknown", "job_id": job_id, "resolution_evidence": "provider_not_reconciled"}
        job = matches[0]
        state_record = job.get("status", {})
        if not isinstance(state_record, dict):
            return {"status": "unknown", "job_id": job_id, "resolution_evidence": "unknown_status_schema"}
        state = state_record.get("state")
        if not isinstance(state, str):
            state = "STATE_UNSPECIFIED"
        observed = self.clock()
        result = {"job_id": job_id, "status": "unknown", "provider_state": state,
                  "job_terminal": False, "termination_verified": False,
                  "provider_stopped_at": None, "resolution_evidence": "provider_list_observation"}
        if state in {"PROVISIONING", "STARTING", "IMAGE_PULLING"}:
            result["status"] = "submitted"
        elif state == "RUNNING":
            result["status"] = "running"
        elif state in {"COMPLETED", "FAILED", "CANCELLED", "ERROR"}:
            result.update(job_terminal=True, terminal_observed_at=observed.isoformat().replace("+00:00", "Z"),
                          job_observation_evidence={"kind": "job_terminal_observation",
                            "reference": API + "?" + urlencode({"parentId": self.project_id}) + "#" + job_id,
                            "provider_state": state})
            # SDK finishedAt describes workload completion, NOT VM termination.
            finished = state_record.get("finishedAt")
            if finished:
                try:
                    timestamp(finished)
                    result["workload_finished_at"] = finished
                    result["finished_at"] = finished
                except MendError:
                    result["diagnostic"] = "invalid_workload_timestamp"
            if self.termination_reader is not None:
                try:
                    termination = await asyncio.wait_for(self.termination_reader(job_id), self.reader_timeout)
                    proof = termination.get("verification") if isinstance(termination, dict) else None
                    reference = proof.get("reference") if isinstance(proof, dict) else None
                    checked = dict(termination) if isinstance(termination, dict) else {}
                    if result.get("workload_finished_at"):
                        checked["workload_finished_at"] = result["workload_finished_at"]
                    stop = confirmed_stop(checked, job_id, self.clock(), proof_key="verification", require_terminal=False)
                    if stop is None:
                        raise MendError("runner_termination", "Termination authority did not establish this job's stop.", 502)
                    result.update(provider_stopped_at=termination["provider_stopped_at"],
                        termination_verified=True, termination_evidence=proof,
                        resolution_evidence={"kind": "provider_terminal", "reference": reference,
                                             "provider_state": state, "verification": proof})
                except Exception:
                    result["diagnostic"] = "termination_evidence_unavailable"
            if not result["termination_verified"]:
                result.setdefault("diagnostic", "vm_termination_unverified")
            if self.report_reader is not None and state in {"COMPLETED", "FAILED"}:
                try:
                    report = await asyncio.wait_for(self.report_reader(job_id), self.reader_timeout)
                    if not isinstance(report, dict) or not isinstance(report.get("runner_report"), dict):
                        raise MendError("runner_report", "Trusted report is unavailable.", 502)
                    result.update(runner_report=report["runner_report"], report_storage_key=report.get("report_storage_key"))
                    if result["termination_verified"] and isinstance(report.get("report_evidence"), dict):
                        result["resolution_evidence"]["report_verification"] = report["report_evidence"]
                    command_results = report["runner_report"].get("command_results", [])
                    if isinstance(command_results, list) and len(command_results) == 1 and isinstance(command_results[0], dict):
                        code = command_results[0].get("exit_code")
                        if type(code) is int:
                            result["exit_code"] = code
                except Exception:
                    result["report_diagnostic"] = "trusted_report_unavailable"
            else:
                result["report_diagnostic"] = "trusted_report_transport_unconfigured"
            if result["termination_verified"]:
                if state == "CANCELLED":
                    result["status"] = "cancelled"
                elif state == "ERROR" or not result.get("runner_report"):
                    result["status"] = "infrastructure_failed"
                else:
                    result["status"] = "passed" if state == "COMPLETED" and result["runner_report"].get("passed") is True else "failed"
        return result

    async def cancel(self, job_id: str) -> dict:
        response = await self.transport.request("POST", API + "/cancel", headers=self.headers,
                                                json_body={"id": identifier(job_id)}, timeout=10.0)
        return {"acknowledged": True, "job_id": job_id, "stopped": False,
                "operation_id": response.get("id") if isinstance(response, dict) else None}

    async def stream_logs(self, job_id: str, *, max_bytes=256000, timeout=60.0):
        identifier(job_id)
        if not 1 <= max_bytes <= 256000 or not 0 < timeout <= 60:
            raise MendError("runner_log_limits", "Log limits exceed the frozen budget.")
        try:
            process = await asyncio.create_subprocess_exec(self.cli_path, "ai", "job", "logs", job_id,
                "--follow", "--tail", "1000", stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, env=self.cli_env, start_new_session=True)
        except OSError:
            raise MendError("runner_log_transport", "The configured provider log CLI could not start.", 503) from None
        size, deadline = 0, time.monotonic() + timeout
        decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        eof = False
        try:
            while size < max_bytes:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    chunk = await asyncio.wait_for(process.stdout.read(min(4096, max_bytes - size)), remaining)
                except asyncio.TimeoutError:
                    break
                if not chunk:
                    eof = True
                    break
                size += len(chunk)
                message = decoder.decode(chunk)
                if message:
                    yield {"stream": "stdout", "message": message,
                           "provider_stream": "unattributed", "history_tail_lines": 1000}
            if eof:
                message = decoder.decode(b"", final=True)
                if message:
                    yield {"stream": "stdout", "message": message,
                           "provider_stream": "unattributed", "history_tail_lines": 1000}
                try:
                    code = await asyncio.wait_for(process.wait(), min(1.0, max(0.001, deadline - time.monotonic())))
                except asyncio.TimeoutError:
                    raise MendError("runner_log_transport", "Provider log CLI closed output without a confirmed exit.", 502) from None
                if code != 0:
                    raise MendError("runner_log_transport", "Provider log CLI failed; log delivery is incomplete.", 502)
            if size >= max_bytes:
                yield {"stream": "system", "message": "Output truncated at the 256KB attempt budget.", "truncated": True}
        finally:
            if process.returncode is None:
                try:
                    import os
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    await asyncio.wait_for(process.wait(), 1.0)
                except asyncio.TimeoutError:
                    import os
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    await process.wait()

    def close(self):
        if self._owns_transport:
            self.transport.close()
