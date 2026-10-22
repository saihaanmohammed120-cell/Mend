"""Complete-file replacement boundary; generated code is never executed here."""
from __future__ import annotations

from .domain import MendError, safe_path, source_sha256, validate_contract, validate_files


def validate_replacements(contract: dict, current_files: dict[str, str],
                          replacements: dict[str, str],
                          expected_source_sha256: str | None = None) -> dict[str, str]:
    approved = validate_contract(contract)
    current = validate_files(current_files)
    allowed = set(approved["editable_paths"])
    protected = approved["protected_files"]
    if set(current) != allowed | set(protected):
        raise MendError("unexpected_source", "Source must match the frozen contract file set.")
    if any(current.get(path) != text for path, text in protected.items()):
        raise MendError("protected_changed", "Protected checks were changed.")
    if expected_source_sha256 is not None and source_sha256(current) != expected_source_sha256:
        raise MendError("snapshot_mismatch", "Replacement targets a different source snapshot.", 409)
    if not isinstance(replacements, dict) or not replacements:
        raise MendError("invalid_patch", "At least one complete source replacement is required.")
    for path in replacements:
        safe_path(path)
        if path not in allowed:
            raise MendError("protected_path", "Replacement path is outside the frozen editable set.")
    candidate = validate_files({**current, **replacements})
    if candidate == current:
        raise MendError("empty_patch", "Replacement did not change the source.")
    return candidate
