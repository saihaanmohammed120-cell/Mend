"""Explicit real repository write/read probe; never uses local stores or providers."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mend.bootstrap import database_repository_from_env
from mend.domain import MendError
from mend.service import TaskService


async def verify(owner):
    repository = database_repository_from_env()
    service = TaskService(repository, None, None, None, {"live_enabled": False})
    marker = "phase2-database-probe-" + str(uuid.uuid4())
    created = await service.create(owner, "Mend Phase 2 database connectivity verification", marker)
    task = await service.get(created["id"], owner)
    if task["id"] != created["id"] or task["status"] != "draft":
        raise MendError("verification_failed", "Persisted task did not match the draft write.", 502)
    replay = await service.create(owner, "Mend Phase 2 database connectivity verification", marker)
    if replay["id"] != task["id"]:
        raise MendError("verification_failed", "Idempotency returned a different task.", 502)
    events = await asyncio.to_thread(repository.call, "events", {
        "task_id": task["id"], "user_id": owner, "after": 0, "limit": 100,
    })
    if not any(event.get("event_type") == "state" and
               event.get("payload", {}).get("status") == "draft" for event in events):
        raise MendError("verification_failed", "Initial persisted state event was absent.", 502)
    return {"source": "real_supabase_repository", "database_write_verified": True,
            "task_id": task["id"], "status": task["status"], "idempotency_verified": True,
            "initial_state_event_verified": True, "provider_execution": "skipped",
            "cleanup": "Draft retained for independent MCP inspection; no jobs were submitted."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", required=True,
                        help="Existing authorized Supabase Auth user UUID; never fabricate an owner.")
    args = parser.parse_args()
    try:
        owner = str(uuid.UUID(args.user_id))
        if owner != args.user_id:
            raise ValueError()
    except ValueError:
        parser.error("--user-id must be a canonical UUID")
    try:
        result = asyncio.run(verify(owner))
    except MendError as error:
        print(json.dumps({"status": "BLOCKED", "code": error.code,
                          "database_write_verified": False}))
        return 2
    except Exception:
        # Connection exceptions can contain credential-bearing transport details.
        print(json.dumps({"status": "FAIL", "code": "unexpected_verification_failure",
                          "database_write_verified": False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
