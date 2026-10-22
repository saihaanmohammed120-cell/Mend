"""Read authenticated controller records, never workload output or cancel acks.

The operator must establish both external authorities and keep their distinct
keys outside candidate jobs. Authentication cannot establish provider isolation
or the meaning of an infrastructure observation; live release remains blocked.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import math
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from .config import https_origin
from .domain import (MendError, SHA256_RE, canonical_json, protected_checks_sha256,
                     validate_contract)
from .runner import async_reader, identifier
from .supervisor import ReportError, canonical, verify_report
from .termination import aware, confirmed_stop
from .transport import JsonTransport


class PersistedTaskContext:
    """Bind a worker-authorized persisted task read to one configured task.

    task_reader(task_id) must read durable state and enforce its owner or worker
    lease. This adapter never accepts identity from the evidence endpoint.
    """

    def __init__(self, task_id, *, project_id, task_reader):
        self.task_id, self.project_id = identifier(task_id), identifier(project_id)
        if task_reader is None or not async_reader(task_reader):
            raise MendError("evidence_configuration", "An authorized asynchronous persisted task reader is required.", 503)
        self._task_reader = task_reader

    async def __call__(self, job_id):
        identifier(job_id)
        task = await self._task_reader(self.task_id)
        if (not isinstance(task, dict) or task.get("id") != self.task_id
                or task.get("source") != "live"
                or not isinstance(task.get("attempts"), list)
                or not 1 <= len(task["attempts"]) <= 4
                or any(not isinstance(attempt, dict) for attempt in task["attempts"])):
            raise ValueError("Invalid persisted task context")
        matches = [attempt for attempt in task["attempts"] if attempt.get("job_id") == job_id]
        if len(matches) != 1 or matches[0].get("task_id") != self.task_id:
            raise ValueError("Job is not uniquely attached to the configured task")
        # Detach durable identity before any controller transport can mutate it.
        return json.loads(canonical_json({"project_id": self.project_id, "task": task, "attempt": matches[0]}))


class TrustedEvidenceReaders:
    """Explicit injection only: no environment discovery or live-gate changes.

    context_reader(job_id) supplies trusted persisted {task, attempt, project_id}.
    The endpoint cannot choose its own expected source/attempt identity. Both
    endpoints return {report, signature}, using supervisor canonical HMAC-SHA256;
    the termination key must be independent of the protected-report key.
    """

    def __init__(self, origin, *, project_id, report_key, termination_key, access_token,
                 context_reader, transport=None, timeout=3.0, clock=None):
        self.origin = https_origin(origin)
        self.project_id = identifier(project_id)
        if (urlsplit(self.origin).port not in (None, 443)
                or any(not isinstance(key, bytes) or len(key) < 32 for key in (report_key, termination_key))
                or hmac.compare_digest(report_key, termination_key)
                or context_reader is None or not async_reader(context_reader)
                or not isinstance(access_token, str) or not access_token
                or any(ord(char) < 33 or ord(char) > 126 for char in access_token)
                or isinstance(timeout, bool) or not isinstance(timeout, (int, float))
                or not math.isfinite(timeout) or not 0 < timeout <= 10):
            raise MendError("evidence_configuration", "Distinct trusted authorities and bounded async reads are required.", 503)
        self._report_key, self._termination_key = report_key, termination_key
        self._headers = {"Authorization": "Bearer " + access_token}
        self._context_reader, self.timeout = context_reader, timeout
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.transport = transport or JsonTransport({urlsplit(self.origin).hostname})
        self._owns_transport = transport is None

    async def _context(self, job_id):
        context = await self._context_reader(job_id)
        if not isinstance(context, dict):
            raise ValueError("Missing persisted context")
        task, attempt = context["task"], context["attempt"]
        contract = validate_contract(task["contract"])
        expected = {key: attempt[key] for key in ("job_id", "model_id", "image_digest", "snapshot_sha256")}
        expected.update(task_id=task["id"], attempt_id=attempt["id"],
            contract_sha256=task["contract_sha256"], protected_checks_sha256=task["protected_checks_sha256"],
            provider_project_id=identifier(context["project_id"]), execution_ordinal=attempt["ordinal"])
        if (expected["job_id"] != job_id or expected["provider_project_id"] != self.project_id
                or attempt.get("task_id") != task["id"]
                or type(attempt["ordinal"]) is not int or not 1 <= attempt["ordinal"] <= contract["limits"]["max_executions"]
                or any(not isinstance(expected[key], str) or not expected[key] or len(expected[key]) > 2048
                       for key in expected if key != "execution_ordinal")
                or any(not SHA256_RE.fullmatch(expected[key]) for key in
                       ("contract_sha256", "protected_checks_sha256", "snapshot_sha256"))
                or expected["contract_sha256"] != hashlib.sha256(canonical_json(contract)).hexdigest()
                or expected["protected_checks_sha256"] != protected_checks_sha256(contract)
                or not re.fullmatch(r"sha256:[0-9a-f]{64}", expected["image_digest"])
                or task.get("source", "live") != "live" or attempt.get("source", "live") != "live"):
            raise ValueError("Invalid persisted identity")
        dispatched = aware(attempt["dispatch_requested_at"])
        if dispatched > aware(attempt["deadline_at"]) or dispatched > aware(self.clock()):
            raise ValueError("Invalid dispatch chronology")
        return expected, contract, dispatched

    @staticmethod
    def _envelope(envelope, key):
        if (not isinstance(envelope, dict) or set(envelope) != {"report", "signature"}
                or len(canonical(envelope)) > 70000 or not isinstance(envelope["report"], dict)
                or not isinstance(envelope["signature"], str)
                or not re.fullmatch(r"[0-9a-f]{64}", envelope["signature"])):
            raise ReportError("Invalid authenticated envelope")
        actual = hmac.new(key, canonical(envelope["report"]), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(actual, envelope["signature"]):
            raise ReportError("Untrusted evidence signature")
        # Detach returned data from injected transports and mutable buffers.
        return json.loads(canonical(envelope["report"]))

    @staticmethod
    def _metadata(record, expected):
        if (type(record.get("schema_version")) is not int or record["schema_version"] != 1
                or record.get("source") != "live"
                or any(type(record.get(key)) is not type(value) or record.get(key) != value for key, value in expected.items())
                or any(not isinstance(record.get(key), str) or not record[key].strip() or len(record[key]) > 200
                       or any(ord(char) < 32 or ord(char) == 127 for char in record[key])
                       for key in ("observer_id", "observer_version"))):
            raise ReportError("Evidence does not match the persisted execution")

    async def _read(self, job_id, kind):
        async def bounded_read():
            identifier(job_id)
            expected, contract, dispatched = await self._context(job_id)
            endpoint = self.origin + "/v1/mend/jobs/" + job_id + "/" + kind
            envelope = await self.transport.request("GET", endpoint, headers=self._headers,
                timeout=self.timeout, max_bytes=70000)
            key = self._report_key if kind == "report" else self._termination_key
            record = self._envelope(envelope, key)
            self._metadata(record, expected)
            authority = {"envelope_sha256": hashlib.sha256(canonical(envelope)).hexdigest(),
                         "observer_id": record["observer_id"], "observer_version": record["observer_version"]}
            if kind == "report":
                verified = verify_report(envelope, key, expected, contract)
                return {"runner_report": verified, "report_storage_key": None,
                        "report_evidence": {"kind": "authenticated_controller_report", "reference": endpoint, **authority}}
            if (any(not isinstance(record.get(name), str) or not record[name].strip() or len(record[name]) > 2048
                    or any(ord(char) < 32 or ord(char) == 127 for char in record[name])
                    for name in ("resource_id", "observation_api"))
                    or record.get("workload_finished_at") is None
                    or aware(record["workload_finished_at"]) < dispatched
                    or confirmed_stop(record, job_id, self.clock(), proof_key="verification", not_before=dispatched) is None):
                raise ReportError("Independent infrastructure stop is unproven")
            record["verification"] = {**record["verification"], **authority,
                                      "resource_id": record["resource_id"], "observation_api": record["observation_api"]}
            return record
        try:
            return await asyncio.wait_for(bounded_read(), self.timeout)
        except asyncio.CancelledError:
            raise
        except Exception:
            raise MendError("evidence_unavailable", "Authenticated evidence is unavailable or does not match this execution.", 502) from None

    async def report(self, job_id):
        return await self._read(job_id, "report")

    async def termination(self, job_id):
        return await self._read(job_id, "termination")

    def close(self):
        if self._owns_transport:
            self.transport.close()
