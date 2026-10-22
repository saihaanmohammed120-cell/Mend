"""SQLite-backed, deliberately non-production orchestration test store."""
from __future__ import annotations

import copy
import json
import math
import os
import re
import sqlite3
import stat
import threading
import uuid
from datetime import datetime, timedelta, timezone

from .domain import MendError

TERMINAL = {"passed", "needs_help", "runner_unavailable", "stopped"}
CANCEL_REASONS = {"user_cancelled", "job_timeout", "task_timeout", "termination_unconfirmed", "retention_expired"}
NEXT_STATES = {
    "draft": {"ready", "needs_help", "stopping"}, "ready": {"draft", "writing", "needs_help", "stopping"},
    "writing": {"waiting_runner", "needs_help", "runner_unavailable", "stopping"},
    "waiting_runner": {"running", "needs_help", "runner_unavailable", "stopping"},
    "running": {"fixing", "finalizing", "needs_help", "runner_unavailable", "stopping"},
    "fixing": {"waiting_runner", "needs_help", "runner_unavailable", "stopping"},
    "finalizing": {"passed", "needs_help", "stopping"}, "stopping": {"stopped"}}


def utcnow():
    return datetime.now(timezone.utc)


def stamp(value):
    return value.isoformat().replace("+00:00", "Z")


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class LocalTestStore:
    """Atomic fixture persistence; never writes production receipt evidence."""
    source = "local_test"

    def __init__(self, path=":memory:", clock=utcnow):
        self.clock = clock
        self.lock = threading.RLock()
        self._closed = False
        self._fd = None
        if path != ":memory:":
            path = os.path.abspath(os.fspath(path))
            parent = os.stat(os.path.dirname(path), follow_symlinks=False)
            if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
                raise MendError("store_path", "Local persistence requires an owned directory without shared write permission.", 503)
            try:
                self._fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                info = os.fstat(self._fd)
                if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                    raise MendError("store_path", "Local persistence requires a private owned regular file.", 503)
            except (OSError, MendError) as exc:
                if self._fd is not None:
                    os.close(self._fd)
                    self._fd = None
                if isinstance(exc, MendError):
                    raise
                raise MendError("store_path", "Local persistence path could not be opened safely.", 503) from exc
        try:
            self.db = sqlite3.connect(path, check_same_thread=False)
            if self._fd is not None:
                after = os.stat(path, follow_symlinks=False)
                if (after.st_dev, after.st_ino) != (info.st_dev, info.st_ino):
                    raise MendError("store_path", "Local persistence path changed during opening.", 503)
            self.db.execute("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL)")
            self.db.execute("CREATE TABLE IF NOT EXISTS events (task_id TEXT, sequence INTEGER, value TEXT, PRIMARY KEY(task_id,sequence))")
            self.db.execute("CREATE TABLE IF NOT EXISTS local_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            version = self.db.execute("SELECT value FROM local_metadata WHERE key='schema_version'").fetchone()
            if version is None and self.db.execute("SELECT count(*) FROM tasks").fetchone()[0]:
                raise MendError("local_schema_upgrade", "Legacy local fixture data requires an explicit version upgrade before reuse.", 503)
            if version is not None and version[0] != "2":
                raise MendError("local_schema_upgrade", "Unsupported local persistence version.", 503)
            self.db.execute("INSERT OR IGNORE INTO local_metadata VALUES ('schema_version','2')")
            self.db.commit()
        except BaseException:
            if hasattr(self, "db"):
                self.db.close()
            if self._fd is not None:
                os.close(self._fd)
                self._fd = None
            raise

    def close(self):
        with self.lock:
            if not self._closed:
                self._closed = True
                self.db.close()
                if self._fd is not None:
                    os.close(self._fd)
                    self._fd = None

    def _save(self, task):
        self.db.execute("INSERT OR REPLACE INTO tasks VALUES (?,?)", (task["id"], json.dumps(task, allow_nan=False)))

    def _all(self):
        return [json.loads(row[0]) for row in self.db.execute("SELECT value FROM tasks")]

    def _event(self, task, event_type, message="", stream="system", attempt_id=None, payload=None):
        sequence = task.get("next_sequence", 1)
        task["next_sequence"] = sequence + 1
        event = dict(task_id=task["id"], sequence=sequence, event_type=event_type,
                     message=message, stream=stream, attempt_id=attempt_id,
                     payload=payload or {}, truncated=False, created_at=stamp(self.clock()))
        self.db.execute("INSERT INTO events VALUES (?,?,?)", (task["id"], sequence, json.dumps(event)))
        return event

    def call(self, action, payload):
        with self.lock:
            if self._closed:
                raise MendError("store_closed", "Local test persistence has shut down.", 503)
            self.db.execute("BEGIN IMMEDIATE")
            try:
                result = self._call(action, dict(payload))
                self.db.commit()
                return copy.deepcopy(result)
            except BaseException:
                self.db.rollback()
                raise

    def _call(self, action, p):
        now = self.clock()
        if action == "create_task":
            for task in self._all():
                if task["user_id"] == p["user_id"] and task["idempotency_key"] == p["idempotency_key"]:
                    if task["prompt"] != p["prompt"]:
                        raise MendError("idempotency_conflict", "Idempotency key already belongs to a different task.", 409)
                    return task
            task = dict(id=str(uuid.uuid4()), user_id=p["user_id"], prompt=p["prompt"],
                        runtime=p.get("runtime", "python"), idempotency_key=p["idempotency_key"],
                        source="local_test", live_verification=False, status="draft", contract={},
                        contract_version=1, contract_frozen_at=None, repair_count=0, execution_count=0,
                        max_repairs=3, job_timeout_seconds=60, usage={"tokens": 0, "cost": 0.0, "api_retry_count": 0},
                        attempts=[], receipt=None, cancel_requested_at=None, task_deadline_at=None,
                        next_sequence=1, local_schema_version=2,
                        created_at=stamp(now), updated_at=stamp(now), expires_at=stamp(now + timedelta(hours=24)))
            self._event(task, "state", payload={"status": "draft"})
            self._save(task)
            return task
        if action in {"due", "pending"}:
            if action == "pending":
                limit = p.get("limit", 20)
                if type(limit) is not int or not 1 <= limit <= 100:
                    raise MendError("invalid_limit", "Pending limit must be between 1 and 100.")
                # Do not hydrate protected source or attempt reports on every scheduler poll.
                rows = self.db.execute(
                    """SELECT id,json_extract(value,'$.status'),json_extract(value,'$.created_at')
                       FROM tasks WHERE json_extract(value,'$.status') IN (?,?,?,?,?,?)
                       ORDER BY json_extract(value,'$.created_at'),id LIMIT ?""",
                    ("writing","waiting_runner","running","fixing","finalizing","stopping",limit))
                return [dict(id=row[0],status=row[1],created_at=row[2]) for row in rows]
            tasks = self._all()
            records = []
            for task in tasks:
                if task["status"] in TERMINAL:
                    continue
                whole_due = (task.get("cancel_requested_at") or parse(task["expires_at"]) <= now or
                             task.get("task_deadline_at") and parse(task["task_deadline_at"]) <= now)
                unresolved = [a for a in task["attempts"] if not a.get("resolved_at")]
                for attempt in unresolved:
                    if whole_due or attempt.get("deadline_at") and parse(attempt["deadline_at"]) <= now:
                        records.append({"task_id": task["id"], "attempt_id": attempt["id"]})
                if whole_due and not unresolved and task["status"] not in {"draft", "ready"}:
                    records.append({"task_id": task["id"], "attempt_id": None})
            return records[:100]
        task = next((t for t in self._all() if t["id"] == p.get("task_id")), None)
        if task is None:
            raise MendError("not_found", "Task not found.", 404)
        original_status = task["status"]
        user = p.get("user_id")
        worker = p.get("worker_id")
        if user is not None and user != task["user_id"]:
            raise MendError("not_found", "Task not found.", 404)
        if user is not None and action in {"get_task", "events", "propose_contract", "start_task"} and parse(task["expires_at"]) <= now:
            raise MendError("not_found", "Task not found.", 404)
        if action == "claim_worker":
            if task["status"] in TERMINAL:
                return {"claimed": False}
            occupied = task.get("lease_until") and parse(task["lease_until"]) > now
            if occupied and task.get("worker_id") != worker:
                return {"claimed": False}
            seconds = p.get("seconds", 30)
            if not worker or type(seconds) is not int or not 1 <= seconds <= 60:
                raise MendError("invalid_lease", "Worker and lease bounds are required.")
            task["worker_id"] = worker
            task["lease_until"] = stamp(now + timedelta(seconds=seconds))
            self._save(task)
            return {"claimed": True}
        if action == "deadline_cancel":
            attempt = next((a for a in task["attempts"] if a["id"] == p.get("attempt_id")), None)
            whole_due = (task.get("cancel_requested_at") or parse(task["expires_at"]) <= now or
                         task.get("task_deadline_at") and parse(task["task_deadline_at"]) <= now)
            due = (task["status"] not in TERMINAL and ((attempt and not attempt.get("resolved_at") and
                   (whole_due or attempt.get("deadline_at") and parse(attempt["deadline_at"]) <= now)) or
                   p.get("attempt_id") is None and whole_due and not any(not a.get("resolved_at") for a in task["attempts"])))
            if not due:
                return {"cancel_requested": False}
            reason = (task.get("stop_reason") if task.get("cancel_requested_at") else
                      "retention_expired" if parse(task["expires_at"]) <= now else
                      "task_timeout" if task.get("task_deadline_at") and parse(task["task_deadline_at"]) <= now else "job_timeout")
            task.update(cancel_requested_at=task.get("cancel_requested_at") or stamp(now), status="stopping", stop_reason=reason)
            self._event(task, "state", payload={"status": "stopping"})
            self._save(task)
            return {**(attempt or {"task_id": task["id"], "attempt_id": None}), "cancel_requested": True, "reason": reason}
        owner_actions = {"get_task", "events", "propose_contract", "start_task", "request_cancel"}
        if action not in owner_actions or user is None:
            if not worker or worker != task.get("worker_id") or parse(task.get("lease_until", stamp(now))) <= now:
                raise MendError("lease_lost", "Worker lease is absent or expired.", 409)
        if action == "get_task":
            return task
        if action == "events":
            if type(p.get("after", 0)) is not int or p.get("after", 0) < 0 or type(p.get("limit", 100)) is not int or not 1 <= p.get("limit", 100) <= 100:
                raise MendError("invalid_limit", "Event cursor and limit are invalid.")
            return [json.loads(row[0]) for row in self.db.execute(
                "SELECT value FROM events WHERE task_id=? AND sequence>? ORDER BY sequence LIMIT ?",
                (task["id"], p.get("after", 0), min(p.get("limit", 100), 100)))]
        if action == "propose_contract":
            if task["status"] not in {"draft", "ready"} or p["expected_version"] != task["contract_version"]:
                raise MendError("contract_conflict", "Contract is frozen or stale.", 409)
            task.update(contract=p["contract"], contract_version=task["contract_version"] + 1, status="ready")
        elif action == "start_task":
            if (task["contract_frozen_at"] and task["contract_sha256"] == p["contract_sha256"]
                    and task["protected_checks_sha256"] == p["protected_checks_sha256"]
                    and p["expected_version"] == task["contract_version"]):
                return task
            if task["status"] != "ready" or p["expected_version"] != task["contract_version"]:
                raise MendError("contract_conflict", "Task is not ready or version is stale.", 409)
            if now + timedelta(seconds=600) > parse(task["expires_at"]):
                raise MendError("retention_window", "Task retention cannot fit the full task budget.", 409)
            active = sum(bool(t["user_id"] == task["user_id"] and t["task_deadline_at"] and t["status"] not in TERMINAL) for t in self._all())
            if active >= 2:
                raise MendError("concurrency_limit", "Two tasks are already active.", 409)
            task.update(status="writing", contract_frozen_at=stamp(now), task_deadline_at=stamp(now + timedelta(seconds=600)),
                        contract_sha256=p["contract_sha256"], protected_checks_sha256=p["protected_checks_sha256"])
        elif action == "request_cancel":
            if task["status"] in TERMINAL:
                return task
            if task["status"] not in TERMINAL:
                reason = p.get("reason", "user_cancelled")
                if reason not in CANCEL_REASONS:
                    raise MendError("invalid_cancel_reason", "Cancellation reason is unsupported.")
                task.update(status="stopping", cancel_requested_at=task.get("cancel_requested_at") or stamp(now),
                            stop_reason=task.get("stop_reason") or reason)
                diagnostic = p.get("diagnostic_code")
                if isinstance(diagnostic, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,79}", diagnostic) and diagnostic not in task.get("diagnostic_codes", []):
                    task.setdefault("diagnostic_codes", []).append(diagnostic)
                    self._event(task, "state", payload={"status": "stopping", "code": diagnostic})
        elif action == "finish_stop":
            if task["status"] == "stopped":
                return task
            if task["status"] != "stopping":
                raise MendError("invalid_state", "Cancellation intent is required before stopping.", 409)
            if any(not a.get("resolved_at") for a in task["attempts"]):
                raise MendError("unresolved_job", "Provider stop is not confirmed.", 409)
            task.update(status="stopped", stop_reason=p.get("reason", "cancelled"), completed_at=stamp(now))
        elif action == "set_state":
            if task["status"] in TERMINAL or task["cancel_requested_at"]:
                raise MendError("terminal_task", "Task cannot advance.", 409)
            status = p["status"]
            if status not in {"writing", "waiting_runner", "running", "fixing", "finalizing", "needs_help", "runner_unavailable"}:
                raise MendError("invalid_state", "Invalid worker state.")
            if status in TERMINAL and any(not a.get("resolved_at") for a in task["attempts"]):
                raise MendError("unresolved_job", "Provider stop is not confirmed.", 409)
            task.update(status=status, stop_reason=p.get("stop_reason"))
            if status in TERMINAL:
                task["completed_at"] = stamp(now)
        elif action == "usage":
            tokens, cost, retry = p.get("token_count", 0), p.get("cost"), p.get("api_retry_increment", 0)
            actual_tokens, actual_cost = p.get("actual_tokens", 0), p.get("actual_cost", 0.0)
            if (type(tokens) is not int or tokens < 0 or type(actual_tokens) is not int or actual_tokens < 0
                    or type(retry) is not int or retry not in {0, 1}
                    or any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in (cost, actual_cost))):
                raise MendError("invalid_usage", "Usage must be bounded and priced.")
            if task["status"] in TERMINAL or not task.get("contract_frozen_at"):
                raise MendError("invalid_state", "Started nonterminal tasks alone can account usage.", 409)
            if tokens and (task.get("cancel_requested_at") or parse(task["task_deadline_at"]) <= now):
                raise MendError("task_timeout", "New generation is blocked after cancellation or task deadline.", 409)
            usage = task["usage"]
            if usage["tokens"] + tokens > 30000 or usage["api_retry_count"] + retry > 2:
                raise MendError("budget_exceeded", "Task usage budget exceeded.", 409)
            usage["tokens"] += tokens
            usage["cost"] += cost
            usage["api_retry_count"] += retry
            usage["actual_tokens"] = usage.get("actual_tokens", 0) + actual_tokens
            usage["actual_cost"] = usage.get("actual_cost", 0.0) + actual_cost
            if usage["actual_tokens"] > usage["tokens"] or usage["actual_cost"] > usage["cost"]:
                raise MendError("reservation_exceeded", "Provider usage exceeds reservations.", 409)
        elif action == "reserve_repair":
            if (task["repair_count"] >= 3 or task["cancel_requested_at"] or task["status"] not in {"running", "fixing"}
                    or parse(task["task_deadline_at"]) <= now or not task["attempts"]
                    or task["attempts"][-1]["status"] != "failed" or any(not a.get("resolved_at") for a in task["attempts"])):
                raise MendError("repair_limit", "Three repair attempts exhausted.", 409)
            task["repair_count"] += 1
            task["status"] = "fixing"
        elif action == "reserve_attempt":
            if (task["cancel_requested_at"] or task["status"] not in {"writing", "fixing"} or parse(task["task_deadline_at"]) <= now
                    or task["execution_count"] >= 4 or task["execution_count"] >= task["repair_count"] + 1):
                raise MendError("attempt_limit", "No execution slot is available.", 409)
            if any(not a.get("resolved_at") for a in task["attempts"]):
                raise MendError("unresolved_job", "Prior job is unresolved.", 409)
            task["execution_count"] += 1
            attempt = {k: p[k] for k in ("submission_key", "model_id", "model_request_id", "snapshot_sha256", "snapshot_storage_key", "image_digest")}
            attempt.update(id=str(uuid.uuid4()), task_id=task["id"], ordinal=task["execution_count"], status="reserved", job_id=None,
                           created_at=stamp(now), resolved_at=None)
            task["attempts"].append(attempt)
            self._save(task)
            return attempt
        elif action in {"dispatch", "attach_job", "resolve_attempt", "output"}:
            attempt = next((a for a in task["attempts"] if a["id"] == p.get("attempt_id")), None)
            if attempt is None:
                raise MendError("not_found", "Attempt not found.", 404)
            if action == "dispatch":
                if task["cancel_requested_at"] or task["status"] != "waiting_runner" or parse(task["task_deadline_at"]) <= now:
                    raise MendError("dispatch_conflict", "Dispatch cannot be repeated.", 409)
                if attempt.get("dispatch_requested_at"):
                    return {**attempt, "new_dispatch": False}
                attempt.update(dispatch_requested_at=stamp(now), deadline_at=stamp(now + timedelta(seconds=60)))
                attempt["new_dispatch"] = True
            elif action == "attach_job":
                if attempt.get("job_id") and attempt["job_id"] != p["job_id"]:
                    raise MendError("job_conflict", "Attempt already has a job.", 409)
                attempt.update(job_id=p["job_id"], status="submitted", submitted_at=p.get("submitted_at", stamp(now)))
            elif action == "resolve_attempt":
                resolution = p.get("resolution_evidence")
                kind = resolution.get("kind") if isinstance(resolution, dict) else resolution
                if not p.get("provider_stopped_at") and kind not in {"creation_absence_confirmed", "never_dispatched", "provider_absent"}:
                    raise MendError("unresolved_job", "Provider stop is not confirmed.", 409)
                if attempt.get("resolved_at"):
                    if attempt["status"] != p.get("status") or attempt.get("resolution_evidence") != p.get("resolution_evidence"):
                        raise MendError("resolution_conflict", "Attempt was resolved with different evidence.", 409)
                    return attempt
                if not isinstance(resolution, dict) or not resolution.get("reference"):
                    raise MendError("invalid_evidence", "Resolution must include trusted evidence identity.", 409)
                if attempt.get("job_id"):
                    if (kind != "provider_terminal" or not p.get("finished_at") or not p.get("provider_stopped_at")
                            or parse(p["finished_at"]) < parse(attempt["dispatch_requested_at"])
                            or parse(p["provider_stopped_at"]) < parse(p["finished_at"])
                            or parse(p["provider_stopped_at"]) > now):
                        raise MendError("invalid_evidence", "Provider chronology is invalid.", 409)
                elif kind == "never_dispatched" and attempt.get("dispatch_requested_at"):
                    raise MendError("invalid_evidence", "A dispatched attempt cannot claim it was never submitted.", 409)
                attempt.update({k: v for k, v in p.items() if k not in {"task_id", "attempt_id", "worker_id"}})
                attempt["resolved_at"] = stamp(now)
            else:
                attribution = p.get("provider_stream")
                if attribution is not None and attribution not in {"unattributed", "stdout", "stderr"}:
                    raise MendError("invalid_attribution", "Provider stream attribution is unsupported.")
                metadata = {"provider_stream": attribution} if attribution is not None else {}
                if p.get("truncated") is True:
                    if attempt.get("log_truncated"):
                        return {"sequence": None}
                    attempt["log_truncated"] = True
                    event = self._event(task, "log", "Output truncated after 256 KB.", "system", attempt["id"], metadata)
                    event["truncated"] = True
                    self.db.execute("UPDATE events SET value=? WHERE task_id=? AND sequence=?", (json.dumps(event), task["id"], event["sequence"]))
                    self._save(task)
                    return {"sequence": event["sequence"]}
                if p.get("stream") not in {"stdout", "stderr"}:
                    raise MendError("invalid_stream", "Only source stdout/stderr can be appended.")
                message = p.get("message", "").replace("\x00", "")
                remaining = max(0, 256000 - attempt.get("log_bytes", 0))
                data = message.encode("utf-8")[:remaining]
                message = data.decode("utf-8", errors="ignore")
                if not remaining or attempt.get("log_truncated"):
                    return {"sequence": None}
                attempt["log_bytes"] = attempt.get("log_bytes", 0) + len(data)
                event = self._event(task, "log", message, p.get("stream", "stdout"), attempt["id"], metadata)
                if len(p.get("message", "").encode("utf-8")) > remaining:
                    attempt["log_truncated"] = True
                    marker = self._event(task, "log", "Output truncated after 256 KB.", "system", attempt["id"], metadata)
                    marker["truncated"] = True
                    self.db.execute("UPDATE events SET value=? WHERE task_id=? AND sequence=?", (json.dumps(marker), task["id"], marker["sequence"]))
                self._save(task)
                return {"sequence": event["sequence"]}
            self._save(task)
            return attempt
        elif action == "finalize":
            if task["receipt"]:
                return task["receipt"]
            if task["status"] != "finalizing" or task["cancel_requested_at"]:
                raise MendError("finalization_blocked", "Task cannot finalize.", 409)
            if parse(task["task_deadline_at"]) <= now or parse(task["expires_at"]) <= now:
                raise MendError("finalization_blocked", "Task or retention deadline expired.", 409)
            receipt = p["receipt"]
            if receipt.get("source") != "local_test" or receipt.get("live_verification") is not False:
                raise MendError("test_evidence_only", "Local test receipts cannot claim live verification.", 409)
            final = task["attempts"][-1]
            if final["status"] != "passed" or not final.get("resolved_at"):
                raise MendError("finalization_blocked", "Passing provider evidence is required.", 409)
            task.update(receipt=receipt, status="passed", completed_at=stamp(now))
            self._event(task, "receipt", payload=receipt)
            self._save(task)
            return receipt
        else:
            raise MendError("invalid_action", "Unsupported test-store action.")
        if task["status"] != original_status and task["status"] not in NEXT_STATES.get(original_status, set()):
            raise MendError("invalid_state", "Task state transition is invalid.", 409)
        task["updated_at"] = stamp(now)
        self._event(task, "stopped" if task["status"] == "stopped" else "state", payload={"status": task["status"]})
        self._save(task)
        return {"repair_count": task["repair_count"]} if action == "reserve_repair" else task
