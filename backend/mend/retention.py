"""Validate and summarize a bounded retention snapshot without deleting anything."""
from __future__ import annotations

from datetime import datetime
import uuid

from .domain import MendError

BLOCKERS = ("active_state", "active_lease", "unresolved_attempts", "storage_objects")


def summarize_retention(plan: dict) -> dict:
    """Return aggregate facts only; eligibility never authorizes a later deletion."""
    def invalid():
        return MendError("retention_response", "Retention inspection response is invalid.", 502)

    if not isinstance(plan, dict) or type(plan.get("schema_version")) is not int or plan["schema_version"] != 1:
        raise invalid()
    limit, tasks, has_more = plan.get("limit"), plan.get("tasks"), plan.get("has_more")
    if (type(limit) is not int or not 1 <= limit <= 100 or not isinstance(tasks, list)
            or len(tasks) > limit or type(has_more) is not bool):
        raise invalid()
    as_of = plan.get("as_of")
    try:
        if not isinstance(as_of, str) or len(as_of) > 64:
            raise ValueError()
        parsed = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError()
    except (ValueError, TypeError):
        raise invalid() from None

    seen, counts, eligible = set(), dict.fromkeys(BLOCKERS, 0), 0
    for task in tasks:
        if not isinstance(task, dict):
            raise invalid()
        identifier = task.get("task_id")
        try:
            if not isinstance(identifier, str) or str(uuid.UUID(identifier)) != identifier or identifier in seen:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise invalid() from None
        seen.add(identifier)
        blockers, ready = task.get("blockers"), task.get("purge_guard_satisfied")
        if (not isinstance(blockers, list) or len(blockers) > len(BLOCKERS)
                or any(not isinstance(item, str) or item not in BLOCKERS for item in blockers)
                or len(set(blockers)) != len(blockers) or type(ready) is not bool
                or ready != (not blockers)):
            raise invalid()
        eligible += int(ready)
        for blocker in blockers:
            counts[blocker] += 1
    return {
        "schema_version": 1, "source": "supabase_retention_plan_response", "mode": "read_only",
        "as_of": as_of, "checked_tasks": len(tasks), "limit": limit, "has_more": has_more,
        "metadata_purge_guard_satisfied": eligible, "blocked_tasks": len(tasks) - eligible,
        "blocker_counts": counts, "deletion_performed": False, "provider_execution": "not_run",
    }
