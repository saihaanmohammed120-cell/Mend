"""Explicit fixture adapters; simulate orchestration without executing model code."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from .domain import MendError, STARTER_SOURCE


class FixtureModel:
    source = "local_test"
    pricing_available = True

    def __init__(self, fail_patch=False, always_fail=False):
        self.calls = 0
        self.fail_patch, self.always_fail = fail_patch, always_fail

    def reservation(self, contract, prompt, files, diagnostics=None, max_output_tokens=2500):
        return {"token_count": 1000, "cost": 0.0}

    async def generate(self, contract, prompt, files, diagnostics=None, **kwargs):
        self.calls += 1
        if self.fail_patch and diagnostics is not None:
            error = MendError("model_output_invalid", "Fixture malformed patch.")
            error.usage = {"input_tokens": 20, "output_tokens": 50, "cost": 0.0}
            raise error
        if diagnostics is None or self.always_fail:
            code = STARTER_SOURCE.replace("this starter deliberately", f"fixture generation {self.calls} deliberately")
        else:
            code = STARTER_SOURCE.replace("    # Empty-input guard missing: this starter deliberately fails that check.\n", "    if not rows:\n        return [], 0\n")
        return dict(files={"csv_tools.py": code}, model_id="local_test/nemotron-fixture", model_request_id=str(uuid.uuid4()),
                    input_tokens=20, output_tokens=50, cost=0.0)


class FixtureRunner:
    source = "local_test"
    image_digest = "local_test/supervisor@sha256:" + "a" * 64

    def __init__(self, clock=None, hang=False, ambiguous_stop=False, bad_report=False):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.hang, self.ambiguous_stop, self.bad_report = hang, ambiguous_stop, bad_report
        self.jobs, self.cancelled, self.submissions = {}, [], 0

    async def submit(self, task, attempt, files, contract):
        self.submissions += 1
        job_id = "local_test-" + str(uuid.uuid4())
        failed = "    if not rows:\n" not in files["csv_tools.py"]
        self.jobs[job_id] = dict(task=task, attempt=attempt, failed=failed, contract=contract, stopped=False)
        return job_id

    async def observe(self, job_id):
        job = self.jobs.get(job_id)
        if job is None:
            return {"status": "unknown", "reason": "local_fixture_state_unavailable"}
        if self.hang and not job["stopped"]:
            return {"status": "running"}
        if job["stopped"] and self.ambiguous_stop:
            return {"status": "unknown"}
        timestamp = self.clock().isoformat().replace("+00:00", "Z")
        if job["stopped"]:
            return dict(status="cancelled", provider_stopped_at=timestamp, finished_at=timestamp, exit_code=None,
                        resolution_evidence={"kind": "provider_terminal", "reference": "local_test:fixture/" + job_id})
        task, attempt, contract = job["task"], job["attempt"], job["contract"]
        failed = job["failed"]
        checks = contract["required_check_ids"]
        report = dict(source="local_test", complete=True, passed=not failed, task_id=task["id"], attempt_id=attempt["id"],
            contract_sha256=task["contract_sha256"], protected_checks_sha256=task["protected_checks_sha256"],
            snapshot_sha256=attempt["snapshot_sha256"], image_digest=attempt["image_digest"],
            model_id=attempt["model_id"], job_id=job_id,
            command_results=[{"command_id": "unit-tests", "argv": contract["commands"][0]["argv"], "exit_code": int(failed)}],
            checks=dict(total=4, passed=3 if failed else 4, failed=int(failed), skipped=0, check_ids=checks,
                results=[{"check_id": item, "status": "failed" if failed and item.endswith("test_empty_input") else "passed"} for item in checks]))
        if self.bad_report:
            report["snapshot_sha256"] = "f" * 64
        return dict(status="failed" if failed else "passed", finished_at=timestamp, provider_stopped_at=timestamp,
                    exit_code=int(failed), runner_report=report, report_storage_key=None,
                    resolution_evidence={"kind": "provider_terminal", "reference": "local_test:fixture/" + job_id})

    async def cancel(self, job_id):
        if job_id not in self.jobs:
            raise MendError("runner_unavailable", "Local fixture state cannot prove cancellation.", 502)
        self.cancelled.append(job_id)
        self.jobs[job_id]["stopped"] = True
        return {"acknowledged": True}

    async def reconcile(self, submission_key):
        matches = [job_id for job_id, job in self.jobs.items() if job["attempt"]["submission_key"] == submission_key]
        return {"status": "found", "job_id": matches[0]} if len(matches) == 1 else {"status": "ambiguous", "job_id": None}

    async def stream_logs(self, job_id):
        yield {"stream": "stdout", "provider_stream": "unattributed", "message": "LOCAL TEST: fixture checks observed; no model code executed.\n"}
        await asyncio.sleep(0)
