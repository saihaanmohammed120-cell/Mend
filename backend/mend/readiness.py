"""Configuration and actual database responses remain distinct from provider proof."""
from datetime import datetime, timezone

from .repository import SupabaseRepository


async def inspect_readiness(store, settings):
    blockers = list(settings.live_blockers())
    database = {"status": "not_checked", "source": "none", "release_gate": "unknown"}
    if settings.mode in ("database_only", "live"):
        try:
            if not isinstance(store, SupabaseRepository):
                raise ValueError()
            value = await store.runtime_probe()
            if (not isinstance(value, dict) or type(value.get("schema_version")) is not int
                    or value["schema_version"] != 1 or type(value.get("gate_present")) is not bool
                    or type(value.get("live_execution_enabled")) is not bool
                    or (not value["gate_present"] and value["live_execution_enabled"])):
                raise ValueError()
            gate = "unknown" if not value["gate_present"] else "enabled" if value["live_execution_enabled"] else "disabled"
            database = {"status": "verified", "source": "supabase_rpc", "release_gate": gate}
            if gate != "enabled":
                blockers.append("database_release_gate_disabled" if gate == "disabled" else "database_release_gate_missing")
        except Exception:
            database = {"status": "unavailable", "source": "none", "release_gate": "unknown"}
            blockers.append("database_unavailable")
    else:
        blockers.append("database_not_checked")
    return {"ready": not blockers, "mode": settings.mode, "blockers": list(dict.fromkeys(blockers)),
            "database": database, "checked_at": datetime.now(timezone.utc).isoformat(),
            "provider_verification": "not_established_by_this_endpoint"}
