"""Bounded repair orchestration; persisted evidence precedes every side effect."""
from __future__ import annotations

import asyncio
import contextlib
import difflib
import hashlib
import json
import math
import re
import uuid
from datetime import datetime, timezone

from .artifacts import deterministic_zip, verify_bundle
from .domain import (MendError, canonical_json, curated_contract, initial_files,
                     protected_checks_sha256, public_payload, source_sha256,
                     validate_contract)
from .patches import validate_replacements
from .termination import confirmed_stop

TERMINAL = {"passed", "needs_help", "runner_unavailable", "stopped"}


def now():
    return datetime.now(timezone.utc)


def parse(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed
    except (TypeError, AttributeError, ValueError) as exc:
        raise MendError("invalid_timestamp", "Evidence timestamp must include a valid timezone.", 409) from exc


def semantic_diagnostics(value):
    """Retain actual diagnostic content without volatile evidence identities."""
    volatile = {"task_id", "attempt_id", "job_id", "model_id", "model_request_id", "snapshot_sha256",
                "contract_sha256", "protected_checks_sha256", "image_digest", "source", "created_at", "updated_at",
                "started_at", "finished_at", "provider_stopped_at", "duration_ms", "duration_seconds", "timestamp"}
    if isinstance(value, dict):
        result = {key: semantic_diagnostics(item) for key, item in value.items() if key not in volatile}
        for key in ("check_ids", "required_check_ids", "results", "command_results", "commands"):
            if key in result and isinstance(result[key], list):
                def identity(item):
                    name = item.get("check_id", item.get("command_id", item.get("id", ""))) if isinstance(item, dict) else item
                    return (str(name), json.dumps(item, sort_keys=True, separators=(",", ":"), allow_nan=False))
                result[key] = sorted(result[key], key=identity)
        return result
    if isinstance(value, list):
        return [semantic_diagnostics(item) for item in value]
    return value


def failure_signature(report, exit_code):
    commands = report.get("command_results", report.get("commands", []))
    summary = {"checks": report.get("checks"), "commands":
        [{"id": item.get("command_id", item.get("id")), "exit_code": item.get("exit_code")} for item in commands],
        "exit_code": exit_code}
    return hashlib.sha256(canonical_json(semantic_diagnostics(summary))).hexdigest()


class TaskService:
    def __init__(self, store, model, runner, artifact_store, config=None, clock=None):
        self.store, self.model, self.runner, self.artifacts_store = store, model, runner, artifact_store
        self.config, self.clock = config or {}, clock or now
        self.worker_id = str(uuid.uuid4())
        self._running = set()

    def _config(self, name, default=None):
        return self.config.get(name, default) if isinstance(self.config, dict) else getattr(self.config, name, default)

    async def _call(self, action, **payload):
        return await asyncio.to_thread(self.store.call, action, payload)

    async def _worker(self, action, task_id, **payload):
        return await self._call(action, task_id=task_id, worker_id=self.worker_id, **payload)

    async def create(self, user_id, prompt, idempotency_key, runtime="python"):
        try:
            size = len(prompt.encode("utf-8")) if isinstance(prompt, str) else 0
        except UnicodeError as exc:
            raise MendError("invalid_task", "Task prompt must contain valid UTF-8 text.") from exc
        if not isinstance(prompt, str) or not prompt.strip() or size > 8000 or runtime != "python":
            raise MendError("invalid_task", "A Python task prompt of 1–8000 bytes is required.")
        if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 200:
            raise MendError("invalid_task", "A bounded idempotency key is required.")
        return public_payload(await self._call("create_task", user_id=user_id, prompt=prompt,
                                               idempotency_key=idempotency_key, runtime=runtime))

    async def propose(self, task_id, user_id, expected_version, contract=None):
        contract = validate_contract(curated_contract() if contract is None else contract)
        return public_payload(await self._call("propose_contract", task_id=task_id, user_id=user_id,
                                              expected_version=expected_version, contract=contract))

    async def start(self, task_id, user_id, expected_version):
        task = await self._call("get_task", task_id=task_id, user_id=user_id)
        contract = validate_contract(task["contract"])
        local = getattr(self.store, "source", "live") == "local_test"
        if not local and not self._config("live_enabled", False):
            raise MendError("release_blocked", "Live execution awaits reviewed provider evidence.", 503)
        for adapter in (self.model, self.runner, self.artifacts_store):
            if not local and getattr(adapter, "source", "live") != "live":
                raise MendError("mixed_evidence", "Test adapters cannot participate in live execution.", 503)
        return public_payload(await self._call("start_task", task_id=task_id, user_id=user_id,
            expected_version=expected_version, contract_sha256=hashlib.sha256(canonical_json(contract)).hexdigest(),
            protected_checks_sha256=protected_checks_sha256(contract)))

    async def get(self, task_id, user_id):
        return public_payload(await self._call("get_task", task_id=task_id, user_id=user_id))

    async def cancel(self, task_id, user_id):
        return public_payload(await self._call("request_cancel", task_id=task_id, user_id=user_id, reason="user_cancelled"))

    async def receipt(self, task_id, user_id):
        task = await self._call("get_task", task_id=task_id, user_id=user_id)
        if not task.get("receipt"):
            raise MendError("receipt_unavailable", "No verified receipt exists for this task.", 409)
        return public_payload(task["receipt"])

    async def artifacts(self, task_id, user_id):
        task = await self._call("get_task", task_id=task_id, user_id=user_id)
        receipt = task.get("receipt")
        if not receipt:
            raise MendError("artifact_unavailable", "Artifacts require a verified receipt.", 409)
        result = {}
        for label in ("bundle", "diff"):
            key = receipt.get(label + "_storage_key")
            if key:
                expected = user_id + "/" + task_id + "/"
                if not key.startswith(expected):
                    raise MendError("artifact_scope", "Persisted artifact scope is invalid.", 500)
                reserve = float(getattr(self.artifacts_store, "timeout", 0.0))
                ttl = min(60, math.floor((parse(task["expires_at"]) - self.clock()).total_seconds() - reserve))
                if ttl < 1:
                    raise MendError("artifact_expired", "Artifact retention leaves no safe download window.", 410)
                result[label] = {"url": await asyncio.to_thread(self.artifacts_store.signed_download, key, ttl), "expires_seconds": ttl}
        return result

    async def events(self, task_id, user_id, after=0):
        if not isinstance(after, int) or after < 0:
            raise MendError("invalid_sequence", "Event cursor must be a nonnegative integer.")
        while True:
            records = await self._call("events", task_id=task_id, user_id=user_id, after=after, limit=100)
            for record in records:
                after = record["sequence"]
                yield public_payload(record)
            task = await self._call("get_task", task_id=task_id, user_id=user_id)
            if task["status"] in TERMINAL and len(records) < 100:
                return
            await asyncio.sleep(self._config("poll_interval_seconds", 0.2))

    async def _heartbeat(self, task_id):
        while True:
            await asyncio.sleep(10)
            result = await self._call("claim_worker", task_id=task_id, worker_id=self.worker_id, seconds=30)
            if not result["claimed"]:
                raise MendError("lease_lost", "Another worker owns this task.", 409)

    def _remaining(self, task):
        return (parse(task["task_deadline_at"]) - self.clock()).total_seconds()

    async def _current(self, task_id):
        return await self._worker("get_task", task_id)

    async def _log_job(self, task_id, attempt):
        async for record in self.runner.stream_logs(attempt["job_id"]):
            attribution = record.get("provider_stream")
            metadata = {"provider_stream": attribution} if attribution in {"unattributed", "stdout", "stderr"} else {}
            if record.get("truncated") is True:
                await self._worker("output", task_id, attempt_id=attempt["id"], stream="system",
                                   message="Output truncated after 256 KB.", truncated=True, **metadata)
                continue
            if record.get("stream", "stdout") not in {"stdout", "stderr"}:
                raise MendError("invalid_log_stream", "Runner output has an unsupported stream.", 502)
            await self._worker("output", task_id, attempt_id=attempt["id"],
                               stream=record.get("stream", "stdout"), message=record.get("message", ""), **metadata)

    def _stop_confirmed(self, attempt, evidence):
        if getattr(self.store, "source", "live") != "live":
            # Explicit local fixtures can never issue a live receipt.
            return bool(evidence.get("provider_stopped_at"))
        resolution = evidence.get("resolution_evidence")
        if not isinstance(resolution, dict) or resolution.get("kind") != "provider_terminal":
            return False
        checked = dict(evidence)
        proof = resolution.get("verification")
        if evidence.get("resolved_at") and evidence.get("id") == attempt.get("id"):
            # Recovery uses assertions persisted by _resolve, not a bare marker.
            if (not isinstance(proof, dict) or proof.get("job_id") != attempt.get("job_id")
                    or proof.get("provider_stopped_at") != evidence.get("provider_stopped_at")):
                return False
            checked.setdefault("termination_verified", proof.get("termination_verified"))
            checked.setdefault("job_terminal", proof.get("job_terminal"))
            checked.setdefault("termination_evidence", proof)
        authority = checked.get("termination_evidence")
        if (not isinstance(authority, dict) or proof != authority
                or resolution.get("reference") != authority.get("reference")):
            return False
        return confirmed_stop(checked, attempt.get("job_id"), self.clock(),
                              not_before=attempt.get("dispatch_requested_at")) is not None

    def _require_stop_history(self, task, *, final_attempt_id=None):
        if getattr(self.store, "source", "live") == "live":
            for attempt in task["attempts"]:
                if (attempt.get("job_id") and attempt.get("id") != final_attempt_id
                        and not self._stop_confirmed(attempt, attempt)):
                    raise MendError("termination_unproven", "A prior execution lacks bound independent stop evidence.", 409)

    async def _finish_stop(self, task_id, *, reason):
        current = await self._current(task_id)
        try:
            self._require_stop_history(current)
        except MendError:
            return False
        await self._worker("finish_stop", task_id, reason=reason)
        return True

    async def _resolve(self, task_id, attempt, evidence):
        if attempt.get("job_id") and not self._stop_confirmed(attempt, evidence):
            raise MendError("termination_unproven", "Independent stop evidence is not bound to this execution.", 409)
        resolution = evidence.get("resolution_evidence")
        if attempt.get("job_id") and getattr(self.store, "source", "live") == "live":
            resolution = {**resolution, "verification": {**evidence["termination_evidence"],
                "job_id": attempt["job_id"], "provider_stopped_at": evidence["provider_stopped_at"],
                "termination_verified": True, "job_terminal": True}}
        if evidence.get("status") == "failed":
            report = evidence.get("runner_report") or {}
            evidence["failure_signature"] = failure_signature(report, evidence.get("exit_code"))
            evidence["diagnostic_evidence_sha256"] = hashlib.sha256(canonical_json(semantic_diagnostics(report))).hexdigest()
        return await self._worker("resolve_attempt", task_id, attempt_id=attempt["id"],
            status=evidence["status"], exit_code=evidence.get("exit_code"),
            finished_at=evidence.get("finished_at"), provider_stopped_at=evidence.get("provider_stopped_at"),
            runner_report=evidence.get("runner_report"), report_storage_key=evidence.get("report_storage_key"),
            resolution_evidence=resolution, failure_signature=evidence.get("failure_signature"),
            diagnostic_evidence_sha256=evidence.get("diagnostic_evidence_sha256"))

    async def _cancel_attempt(self, task_id, attempt, reason, perform_cancel=True):
        allowed = {"user_cancelled", "job_timeout", "task_timeout", "termination_unconfirmed", "retention_expired"}
        canonical_reason = reason if reason in allowed else "termination_unconfirmed"
        diagnostic = reason if reason not in allowed and isinstance(reason, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,79}", reason) else None
        payload = {"reason": canonical_reason}
        if diagnostic:
            payload["diagnostic_code"] = diagnostic
        await self._worker("request_cancel", task_id, **payload)
        current = await self._current(task_id)
        latest = next((a for a in current["attempts"] if a["id"] == attempt["id"]), attempt)
        if latest.get("resolved_at"):
            try:
                self._require_stop_history(current)
            except MendError:
                return False
            if current["status"] == "stopping":
                return await self._finish_stop(task_id, reason=current.get("stop_reason") or canonical_reason)
            return True
        attempt = latest
        if not attempt.get("job_id"):
            if not attempt.get("dispatch_requested_at"):
                await self._resolve(task_id, attempt, {"status": "cancelled", "resolution_evidence":
                    {"kind": "never_dispatched", "reference": "db:dispatch_requested_at:null"}})
                return await self._finish_stop(task_id, reason=canonical_reason)
            # Dispatch ambiguity cannot be turned into proof of job absence.
            return False
        if perform_cancel:
            try:
                await self.runner.cancel(attempt["job_id"])
            except MendError:
                # A rejected cancellation does not invalidate independent stop proof.
                pass
        evidence = await self.runner.observe(attempt["job_id"])
        if not self._stop_confirmed(attempt, evidence):
            return False
        evidence["status"] = "timed_out" if canonical_reason == "job_timeout" else "cancelled"
        await self._resolve(task_id, attempt, evidence)
        self._require_stop_history(await self._current(task_id))
        return await self._finish_stop(task_id, reason=current.get("stop_reason") or canonical_reason)

    async def _observe_attempt(self, task_id, attempt, heartbeat):
        logging = asyncio.create_task(self._log_job(task_id, attempt))
        try:
            while True:
                task = await self._current(task_id)
                if heartbeat.done():
                    await heartbeat
                if task.get("cancel_requested_at") or self._remaining(task) <= 0 or self.clock() >= parse(attempt["deadline_at"]):
                    reason = (task.get("stop_reason") or "user_cancelled") if task.get("cancel_requested_at") else "job_timeout"
                    await self._cancel_attempt(task_id, attempt, reason)
                    return None
                evidence = await self.runner.observe(attempt["job_id"])
                if self._stop_confirmed(attempt, evidence):
                    return evidence
                await asyncio.sleep(self._config("poll_interval_seconds", 0.2))
        finally:
            logging.cancel()
            with contextlib.suppress(asyncio.CancelledError, MendError):
                await logging

    async def deadline_tick(self):
        semaphore = asyncio.Semaphore(4)
        async def cancel_due(due):
            async with semaphore:
                try:
                    await self._cancel_due(due)
                except MendError:
                    # One unavailable attempt must not obstruct other deadlines.
                    return
        await asyncio.gather(*(cancel_due(due) for due in await self._call("due")))

    async def _cancel_due(self, due):
        task_id = due["task_id"]
        attempt_id = due.get("attempt_id", due.get("id"))
        try:
            attempt = await self._call("deadline_cancel", task_id=task_id, attempt_id=attempt_id)
            if attempt.get("cancel_requested") is False:
                return
            # Cancellation is an independent safety action; never waits for an
            # unrelated worker lease. Only subsequent mutations need fencing.
            if attempt.get("job_id"):
                try:
                    await self.runner.cancel(attempt["job_id"])
                except MendError:
                    pass
        except MendError:
            return
        claimed = await self._call("claim_worker", task_id=task_id, worker_id=self.worker_id, seconds=30)
        if not claimed["claimed"]:
            return
        task = await self._current(task_id)
        if task_id in self._running:
            return
        if attempt_id is None:
            self._require_stop_history(task)
            if not any(not a.get("resolved_at") for a in task["attempts"]):
                await self._finish_stop(task_id, reason=task.get("stop_reason") or "task_timeout")
            return
        attempt = next(a for a in task["attempts"] if a["id"] == attempt_id)
        try:
            await self._cancel_attempt(task_id, attempt, task.get("stop_reason") or "job_timeout", perform_cancel=False)
        except MendError:
            # Durable stopping remains visible until reconciliation proves exit.
            return

    def _verify_report(self, task, attempt, evidence):
        report = evidence.get("runner_report")
        if (not isinstance(report, dict) or report.get("complete") is not True or report.get("passed") is not True
                or type(evidence.get("exit_code")) is not int or evidence["exit_code"] != 0):
            raise MendError("invalid_report", "A complete passing supervisor report is required.", 409)
        identities = {"task_id": task["id"], "attempt_id": attempt["id"],
                      "contract_sha256": task["contract_sha256"], "snapshot_sha256": attempt["snapshot_sha256"],
                      "protected_checks_sha256": task["protected_checks_sha256"], "image_digest": attempt["image_digest"],
                      "model_id": attempt["model_id"], "job_id": attempt["job_id"]}
        if any(report.get(key) != value for key, value in identities.items()):
            raise MendError("evidence_mismatch", "Supervisor evidence identity differs from this execution.", 409)
        source = getattr(self.store, "source", "live")
        if report.get("source") != source:
            raise MendError("mixed_evidence", "Supervisor evidence source is invalid.", 409)
        checks, contract = report.get("checks", {}), task["contract"]
        required = contract["required_check_ids"]
        commands = report.get("command_results", report.get("commands", []))
        if (not isinstance(checks, dict) or not isinstance(checks.get("results"), list)
                or any(not isinstance(item, dict) for item in checks["results"])
                or not isinstance(commands, list) or any(not isinstance(item, dict) for item in commands)
                or any(type(checks.get(key)) is not int for key in ("total", "passed", "failed", "skipped"))):
            raise MendError("invalid_report", "Supervisor check evidence has invalid types.", 409)
        observed_ids = checks.get("check_ids", [item.get("check_id") for item in checks.get("results", [])])
        if not isinstance(observed_ids, list) or any(not isinstance(item, str) for item in observed_ids):
            raise MendError("invalid_report", "Check identities must be an explicit string list.", 409)
        if (len(observed_ids) != len(required) or set(observed_ids) != set(required) or checks.get("total") != len(required)
                or checks.get("passed") != len(required) or checks.get("failed") != 0 or checks.get("skipped") != 0
                or {c.get("command_id", c.get("id")) for c in commands} != set(contract["required_command_ids"])
                or len(commands) != len(contract["required_command_ids"])
                or any(type(c.get("exit_code")) is not int or c["exit_code"] != 0 for c in commands)):
            raise MendError("checks_incomplete", "Every frozen command and protected check must pass.", 409)
        frozen_commands = {item["id"]: item["argv"] for item in contract["commands"]}
        if any(c.get("argv") != frozen_commands.get(c.get("command_id", c.get("id")))
               or ("status" in c and c["status"] != "passed")
               or ("id" in c and "command_id" in c and c["id"] != c["command_id"])
               for c in commands):
            raise MendError("command_mismatch", "Command arguments must match the frozen contract exactly.", 409)
        results = checks.get("results", [])
        if len(results) != len(required) or {r.get("check_id") for r in results} != set(required) or any(r.get("status") != "passed" for r in results):
            raise MendError("checks_incomplete", "Individual check evidence is incomplete.", 409)
        if not self._stop_confirmed(attempt, evidence):
            raise MendError("termination_unproven", "Independent stop evidence is not bound to this execution.", 409)
        self._require_stop_history(task, final_attempt_id=attempt["id"])
        stopped = evidence.get("provider_stopped_at")
        if (not stopped or not evidence.get("finished_at") or parse(stopped) > parse(attempt["deadline_at"])
                or parse(evidence["finished_at"]) > parse(attempt["deadline_at"])
                or parse(evidence["finished_at"]) < parse(attempt["dispatch_requested_at"])
                or parse(stopped) < parse(evidence["finished_at"])):
            raise MendError("deadline_unproven", "Provider execution exceeded the recorded deadline.", 409)
        if any(a.get("provider_stopped_at") and a.get("deadline_at")
               and parse(a["provider_stopped_at"]) > parse(a["deadline_at"])
               for a in task["attempts"]):
            raise MendError("deadline_unproven", "A prior execution exceeded its deadline.", 409)
        return report

    async def _put_immutable(self, task_id, user_id, key, data) -> tuple[str, bytes | None]:
        try:
            storage_key = await asyncio.to_thread(self.artifacts_store.put, task_id, user_id, key, data)
            # Submitted bytes are not evidence that Storage retained those bytes.
            return storage_key, None
        except MendError as exc:
            if exc.code != "artifact_write_rejected":
                raise
            storage_key = user_id + "/" + task_id + "/" + key
            existing = await asyncio.to_thread(self.artifacts_store.get, storage_key)
            if existing != data:
                raise MendError("artifact_conflict", "Immutable artifact differs from final evidence.", 409) from exc
            return storage_key, existing

    async def _finalize(self, task_id, attempt, evidence, files):
        task = await self._current(task_id)
        report = self._verify_report(task, attempt, evidence)
        if task.get("cancel_requested_at") or self._remaining(task) <= 0:
            raise MendError("finalization_blocked", "Cancellation or total task deadline blocks success.", 409)
        await self._worker("set_state", task_id, status="finalizing")
        bundle = deterministic_zip(files)
        key, roundtrip = await self._put_immutable(task_id, task["user_id"], "final/bundle.zip", bundle)
        if roundtrip is None:
            roundtrip = await asyncio.to_thread(self.artifacts_store.get, key)
        verify_bundle(roundtrip, attempt["snapshot_sha256"])
        diff = "".join(difflib.unified_diff(initial_files(task["contract"])["csv_tools.py"].splitlines(True),
                         files["csv_tools.py"].splitlines(True), fromfile="starter/csv_tools.py", tofile="final/csv_tools.py"))
        diffkey, _ = await self._put_immutable(task_id, task["user_id"], "final/patch.diff", (diff or "No source changes.\n").encode())
        task = await self._current(task_id)
        source = getattr(self.store, "source", "live")
        receipt = dict(receipt_id=str(uuid.uuid4()), schema_version=1, source=source, status="passed", live_verification=source == "live",
            task_id=task_id, final_attempt_id=attempt["id"], contract_sha256=task["contract_sha256"],
            snapshot_sha256=attempt["snapshot_sha256"], bundle_verified_sha256=attempt["snapshot_sha256"],
            model_id=attempt["model_id"], job_id=attempt["job_id"], image_digest=attempt["image_digest"],
            checks=report["checks"], omitted_checks=task["contract"]["omitted_checks"], attempts=task["execution_count"],
            repair_count=task["repair_count"], duration_ms=max(0, int((self.clock() - parse(task["contract_frozen_at"])).total_seconds() * 1000)),
            bundle_storage_key=key, diff_storage_key=diffkey,
            reproduction={"commands": task["contract"]["commands"], "runtime": "python", "image_digest": attempt["image_digest"]},
            receipt_json={"limits": task["contract"]["limits"], "attempt_history": task["attempts"], "usage": task["usage"]})
        return await self._worker("finalize", task_id, receipt=receipt)

    async def _generate(self, task, files, diagnostics):
        remaining = self._remaining(task)
        if remaining <= 0:
            raise MendError("task_timeout", "Total task deadline expired.", 409)
        reservation = self.model.reservation(task["contract"], task["prompt"], files, diagnostics, 2500)
        if reservation.get("cost") is None:
            raise MendError("pricing_unavailable", "Configured price provenance is required before inference.", 503)
        limit = self._config("max_task_cost", None)
        if getattr(self.store, "source", "live") != "local_test" and limit is None:
            raise MendError("budget_unconfigured", "A monetary task cap must be configured.", 503)
        if limit is not None and task["usage"]["cost"] + reservation["cost"] > limit:
            raise MendError("budget_exceeded", "Monetary task cap would be exceeded.", 409)
        # Conservative reservations remain spent after crashes and malformed output.
        await self._worker("usage", task["id"], **reservation, api_retry_increment=0)
        timeout = min(remaining, self._config("inference_timeout_seconds", 30.0))
        try:
            generated = await asyncio.wait_for(self.model.generate(task["contract"], task["prompt"], files,
                diagnostics=diagnostics, max_output_tokens=2500, timeout=timeout), timeout=timeout)
        except MendError as exc:
            if getattr(exc, "usage", None):
                await self._record_actual(task, reservation, exc.usage)
            raise
        await self._record_actual(task, reservation, generated)
        return validate_replacements(task["contract"], files, generated["files"], source_sha256(files)), generated

    async def _record_actual(self, task, reservation, generated):
        if generated.get("cost") is None:
            raise MendError("pricing_unavailable", "Unpriced generation cannot produce live evidence.", 503)
        counts = (generated.get("input_tokens"), generated.get("output_tokens"))
        if any(type(count) is not int or count < 0 for count in counts):
            raise MendError("invalid_usage", "Provider token measurements must be nonnegative integers.", 409)
        actual_tokens = sum(counts)
        if (type(actual_tokens) is not int or actual_tokens < 0 or
                not isinstance(generated["cost"], (int, float)) or isinstance(generated["cost"], bool)
                or not math.isfinite(generated["cost"]) or generated["cost"] < 0):
            raise MendError("invalid_usage", "Provider usage must be finite nonnegative measurements.", 409)
        if actual_tokens > reservation["token_count"] or generated["cost"] > reservation["cost"]:
            reconciliation = {"code": "usage_reconciliation_required", "actual_tokens": actual_tokens,
                              "actual_cost": generated["cost"], "reserved_tokens": reservation["token_count"],
                              "reserved_cost": reservation["cost"]}
            await self._worker("set_state", task["id"], status="needs_help",
                               stop_reason=json.dumps(reconciliation, sort_keys=True, separators=(",", ":"), allow_nan=False))
            raise MendError("reservation_exceeded", "Provider usage exceeded its conservative reservation.", 409)
        await self._worker("usage", task["id"], token_count=0, cost=0.0,
                           actual_tokens=actual_tokens, actual_cost=generated["cost"], api_retry_increment=0)

    async def run_task(self, task_id):
        if task_id in self._running:
            return
        self._running.add(task_id)
        heartbeat = None
        try:
            claimed = await self._call("claim_worker", task_id=task_id, worker_id=self.worker_id, seconds=30)
            if not claimed["claimed"]:
                return
            heartbeat = asyncio.create_task(self._heartbeat(task_id))
            await self._run(task_id, heartbeat)
        except asyncio.CancelledError:
            raise
        except (MendError, TimeoutError) as exc:
            if getattr(exc, "code", None) == "lease_lost":
                # A stale worker must not perform compensating mutations.
                return
            task = await self._current(task_id)
            unresolved = [a for a in task["attempts"] if not a.get("resolved_at")]
            if unresolved:
                await self._cancel_attempt(task_id, unresolved[-1], getattr(exc, "code", "timeout"))
            elif task.get("cancel_requested_at"):
                await self._finish_stop(task_id, reason=task.get("stop_reason", "cancelled"))
            elif task["status"] not in TERMINAL:
                await self._worker("set_state", task_id, status="needs_help", stop_reason=getattr(exc, "code", "timeout"))
        finally:
            try:
                if heartbeat is not None:
                    heartbeat.cancel()
                    with contextlib.suppress(asyncio.CancelledError, MendError):
                        await heartbeat
            finally:
                self._running.discard(task_id)

    async def _run(self, task_id, heartbeat):
        task = await self._current(task_id)
        if task["status"] in TERMINAL:
            return
        # Recovery observes/reconciles prior dispatch instead of creating a duplicate.
        unresolved = [a for a in task["attempts"] if not a.get("resolved_at")]
        if unresolved:
            attempt = unresolved[-1]
            if not attempt.get("dispatch_requested_at"):
                await self._cancel_attempt(task_id, attempt, "worker_recovery")
                return
            if not attempt.get("job_id"):
                reconciled = await self.runner.reconcile(attempt["submission_key"])
                if reconciled.get("status") != "found" or not reconciled.get("job_id"):
                    await self._worker("request_cancel", task_id, reason="termination_unconfirmed", diagnostic_code="ambiguous_dispatch")
                    return
                attempt = await self._worker("attach_job", task_id, attempt_id=attempt["id"], job_id=reconciled["job_id"])
            evidence = await self._observe_attempt(task_id, attempt, heartbeat)
            if evidence is None:
                return
            await self._resolve(task_id, attempt, evidence)
            task = await self._current(task_id)
        self._require_stop_history(task)
        if task.get("cancel_requested_at"):
            await self._finish_stop(task_id, reason=task.get("stop_reason") or "user_cancelled")
            return
        files, diagnostics, prior_signature, prior_diagnostics = initial_files(task["contract"]), None, None, None
        if task["attempts"]:
            previous = task["attempts"][-1]
            files = verify_bundle(await asyncio.to_thread(self.artifacts_store.get, previous["snapshot_storage_key"]), previous["snapshot_sha256"])
            if previous["status"] == "passed":
                await self._finalize(task_id, previous, previous, files)
                return
            diagnostics = previous.get("runner_report")
            prior_signature = previous.get("failure_signature")
            prior_diagnostics = previous.get("diagnostic_evidence_sha256")
        while True:
            if heartbeat.done():
                await heartbeat
            task = await self._current(task_id)
            if task.get("cancel_requested_at"):
                await self._finish_stop(task_id, reason=task.get("stop_reason", "cancelled"))
                return
            if task["execution_count"]:
                await self._worker("reserve_repair", task_id)
                task = await self._current(task_id)
            try:
                candidate, generated = await self._generate(task, files, diagnostics)
            except MendError as exc:
                if task["execution_count"] and exc.code in {"invalid_patch", "empty_patch", "protected_path", "source_limit", "model_output_invalid"}:
                    diagnostics = {"code": exc.code, "message": exc.message}
                    continue
                raise
            files = candidate
            snapshot = source_sha256(files)
            submission_key = str(uuid.uuid4())
            key = await asyncio.to_thread(self.artifacts_store.put, task_id, task["user_id"], "snapshots/" + submission_key + ".zip", deterministic_zip(files))
            attempt = await self._worker("reserve_attempt", task_id, submission_key=submission_key,
                model_id=generated["model_id"], model_request_id=generated.get("model_request_id"),
                snapshot_sha256=snapshot, snapshot_storage_key=key, source_file_count=len(files),
                source_bytes=sum(len(content.encode()) for content in files.values()), image_digest=self.runner.image_digest)
            await self._worker("set_state", task_id, status="waiting_runner")
            attempt = await self._worker("dispatch", task_id, attempt_id=attempt["id"])
            if attempt.get("new_dispatch") is False:
                raise MendError("ambiguous_dispatch", "Dispatch was already reserved; reconciliation is required.", 409)
            remaining = min(60.0, self._remaining(await self._current(task_id)))
            job_id = await asyncio.wait_for(self.runner.submit(task, attempt, files, task["contract"]), timeout=max(0.01, remaining))
            attempt = await self._worker("attach_job", task_id, attempt_id=attempt["id"], job_id=job_id)
            await self._worker("set_state", task_id, status="running")
            evidence = await self._observe_attempt(task_id, attempt, heartbeat)
            if evidence is None:
                return
            attempt = await self._resolve(task_id, attempt, evidence)
            if evidence["status"] == "passed":
                await self._finalize(task_id, attempt, evidence, files)
                return
            if evidence["status"] != "failed":
                await self._worker("set_state", task_id, status="runner_unavailable", stop_reason="runner_failure")
                return
            diagnostics = evidence.get("runner_report") or {"status": evidence["status"]}
            signature = evidence["failure_signature"]
            diagnostic_hash = evidence["diagnostic_evidence_sha256"]
            if signature == prior_signature and diagnostic_hash == prior_diagnostics:
                await self._worker("set_state", task_id, status="needs_help", stop_reason="repeated_failure_without_new_evidence")
                return
            prior_signature = signature
            prior_diagnostics = diagnostic_hash
