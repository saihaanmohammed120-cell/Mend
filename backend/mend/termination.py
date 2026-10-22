"""Validate stop observations from configured trusted readers, never workload stdout.

These checks bind a record; they do not establish a reader's external authority.
"""
from datetime import datetime, timezone


def aware(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("A timezone-aware timestamp is required")
    return value.astimezone(timezone.utc)


def confirmed_stop(record, job_id, observed_at, *, proof_key="termination_evidence",
                   not_before=None, require_terminal=True):
    """Return the bound stop time, or None for absent/contradictory proof."""
    if (not isinstance(record, dict) or not isinstance(job_id, str) or not job_id
            or record.get("job_id") != job_id or record.get("termination_verified") is not True
            or ("stopped" in record and record["stopped"] is not True)
            or ("job_terminal" in record and record["job_terminal"] is not True)
            or (require_terminal and record.get("job_terminal") is not True)):
        return None
    proof = record.get(proof_key)
    reference = proof.get("reference") if isinstance(proof, dict) else None
    if (not isinstance(proof, dict) or proof.get("kind") != "independent_termination"
            or not isinstance(reference, str) or not reference.strip() or len(reference) > 2048
            or any(ord(character) < 32 for character in reference)):
        return None
    try:
        stopped = aware(record.get("provider_stopped_at"))
        if stopped > aware(observed_at) or (not_before is not None and stopped < aware(not_before)):
            return None
        for key in ("workload_finished_at", "finished_at"):
            if record.get(key) is not None and stopped < aware(record[key]):
                return None
    except (ValueError, TypeError, OverflowError):
        return None
    return stopped
