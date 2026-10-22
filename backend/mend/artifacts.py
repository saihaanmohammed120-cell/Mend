"""Deterministic source bundles and private immutable artifact transport."""
from __future__ import annotations

import io
import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

from .domain import MAX_ARTIFACT_BYTES, MAX_FILES, MAX_SOURCE_BYTES, MendError, safe_path, source_sha256, validate_files


def deterministic_zip(files: dict[str, str]) -> bytes:
    checked = validate_files(files)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for path, text in sorted(checked.items()):
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100444 << 16
            archive.writestr(info, text.encode("utf-8"))
    data = output.getvalue()
    if len(data) > MAX_ARTIFACT_BYTES:
        raise MendError("artifact_limit", "Bundle exceeds the artifact cap.")
    return data


def verify_bundle(bundle: bytes, expected_source_sha256: str) -> dict[str, str]:
    if not isinstance(bundle, bytes) or len(bundle) > MAX_ARTIFACT_BYTES:
        raise MendError("artifact_limit", "Bundle exceeds the artifact cap.")
    files, total = {}, 0
    try:
        with zipfile.ZipFile(io.BytesIO(bundle), "r") as archive:
            members = archive.infolist()
            if not 1 <= len(members) <= MAX_FILES:
                raise MendError("invalid_bundle", "Bundle file count is invalid.")
            for info in members:
                path = safe_path(info.filename)
                mode = info.external_attr >> 16
                if (path in files or info.is_dir() or info.flag_bits & 1
                        or mode & 0o170000 not in (0, 0o100000)
                        or info.compress_type != zipfile.ZIP_STORED):
                    raise MendError("invalid_bundle", "Bundle contains unsupported entries.")
                total += info.file_size
                if total > MAX_SOURCE_BYTES:
                    raise MendError("source_limit", "Bundle exceeds the source cap.")
                data = archive.read(info)
                if len(data) != info.file_size:
                    raise MendError("invalid_bundle", "Bundle entry size is inconsistent.")
                files[path] = data.decode("utf-8")
    except (zipfile.BadZipFile, UnicodeError, RuntimeError, OSError) as exc:
        raise MendError("invalid_bundle", "Bundle is not a valid UTF-8 source archive.") from exc
    if source_sha256(files) != expected_source_sha256:
        raise MendError("snapshot_mismatch", "Bundle does not match the tested source.", 409)
    if deterministic_zip(files) != bundle:
        raise MendError("invalid_bundle", "Bundle metadata must match the canonical archive.")
    return files


def _uuid(value: str) -> str:
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, AttributeError, TypeError) as exc:
        raise MendError("invalid_artifact_scope", "Artifact scope requires canonical UUIDs.") from exc
    return value


def artifact_key(task_id: str, user_id: str, key: str) -> str:
    return f"{_uuid(user_id)}/{_uuid(task_id)}/{safe_path(key)}"


def validate_storage_key(storage_key: str) -> str:
    if not isinstance(storage_key, str):
        raise MendError("invalid_artifact_scope", "Artifact key is invalid.")
    parts = storage_key.split("/", 2)
    if len(parts) != 3:
        raise MendError("invalid_artifact_scope", "Artifact key needs owner and task scope.")
    return artifact_key(parts[1], parts[0], parts[2])


def _check_data(data: bytes) -> bytes:
    if not isinstance(data, bytes) or not data or len(data) > MAX_ARTIFACT_BYTES:
        raise MendError("artifact_limit", "Artifact must contain 1–1048576 bytes.")
    return data


def _expiry(seconds: int) -> int:
    if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 300:
        raise MendError("invalid_expiry", "Download links must expire within 300 seconds.")
    return seconds


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise MendError("artifact_redirect", "Artifact transport redirects are forbidden.", 502)


class ArtifactStore:
    """Server-only Supabase Storage adapter.

    Service callers must authorize the task owner before reading or signing its
    persisted key. The adapter validates that keys carry owner/task UUID scope;
    browser-controlled bucket names or unvalidated keys must never reach it.
    """
    source = "live"

    def __init__(self, base_url: str, service_role_key: str, bucket: str = "mend-artifacts",
                 timeout: float = 15.0, max_bytes: int = MAX_ARTIFACT_BYTES):
        try:
            if not isinstance(base_url, str):
                raise ValueError()
            parsed = urllib.parse.urlsplit(base_url)
            if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                    or parsed.query or parsed.fragment or parsed.path not in ("", "/")
                    or parsed.port not in (None, 443)):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise MendError("artifact_config", "Artifact origin must be an HTTPS origin on port 443.", 503) from None
        if not isinstance(bucket, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,62}", bucket):
            raise MendError("artifact_config", "Artifact bucket is invalid.", 503)
        if (not isinstance(service_role_key, str) or not service_role_key
                or any(ord(char) < 33 or ord(char) > 126 for char in service_role_key)):
            raise MendError("artifact_config", "Artifact credentials are required.", 503)
        if (not isinstance(timeout, (int, float)) or isinstance(timeout, bool)
                or not 0 < timeout <= 60 or type(max_bytes) is not int
                or not 1 <= max_bytes <= MAX_ARTIFACT_BYTES):
            raise MendError("artifact_config", "Artifact transport bounds are invalid.", 503)
        self.base_url = base_url.rstrip("/")
        self.bucket, self.timeout, self.max_bytes = bucket, timeout, max_bytes
        self._key = service_role_key
        self._opener = urllib.request.build_opener(_NoRedirect())

    def _request(self, method: str, path: str, data: bytes | None = None,
                 content_type: str = "application/octet-stream", limit: int | None = None) -> bytes:
        request = urllib.request.Request(self.base_url + "/storage/v1/" + path, data=data,
                                        method=method, headers={"Authorization": "Bearer " + self._key,
                                        "apikey": self._key, "Content-Type": content_type,
                                        "x-upsert": "false"})
        bound = self.max_bytes if limit is None else limit
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                length = response.headers.get("Content-Length")
                if length and (not length.isdecimal() or int(length) > bound):
                    raise MendError("artifact_limit", "Artifact response exceeds its bound.", 502)
                result = response.read(bound + 1)
                if len(result) > bound:
                    raise MendError("artifact_limit", "Artifact response exceeds its bound.", 502)
                return result
        except urllib.error.HTTPError as exc:
            exc.close()
            if exc.code in (400, 409) and method == "POST" and path.startswith("object/") and not path.startswith("object/sign/"):
                raise MendError("artifact_write_rejected", "Immutable artifact write was rejected.", 409) from exc
            raise MendError("artifact_unavailable", "Private artifact service is unavailable.", 502) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise MendError("artifact_unavailable", "Private artifact service is unavailable.", 502) from exc

    def _path(self, storage_key: str) -> str:
        return self.bucket + "/" + urllib.parse.quote(validate_storage_key(storage_key), safe="/")

    def put(self, task_id: str, user_id: str, key: str, data: bytes) -> str:
        storage_key = artifact_key(task_id, user_id, key)
        data = _check_data(data)
        if len(data) > self.max_bytes:
            raise MendError("artifact_limit", "Artifact exceeds its configured cap.")
        self._request("POST", "object/" + self._path(storage_key), data, limit=16384)
        return storage_key

    def get(self, storage_key: str) -> bytes:
        return self._request("GET", "object/" + self._path(storage_key))

    def signed_download(self, storage_key: str, expires_seconds: int = 60) -> str:
        scoped = self._path(storage_key)
        response = self._request("POST", "object/sign/" + scoped,
                                 json.dumps({"expiresIn": _expiry(expires_seconds)}).encode(),
                                 "application/json", 16384)
        try:
            body = json.loads(response)
            signed = body.get("signedURL", body.get("signedUrl"))
            if not isinstance(signed, str) or len(signed) > 8192:
                raise ValueError()
            candidate = urllib.parse.urljoin(self.base_url + "/storage/v1/", signed.lstrip("/")
                if signed.startswith("/object/") else signed)
            parsed, origin = urllib.parse.urlsplit(candidate), urllib.parse.urlsplit(self.base_url)
            if ((parsed.scheme, parsed.netloc) != (origin.scheme, origin.netloc)
                    or parsed.path != "/storage/v1/object/sign/" + scoped
                    or not urllib.parse.parse_qs(parsed.query).get("token") or parsed.fragment):
                raise ValueError()
            return candidate
        except (ValueError, TypeError, AttributeError, UnicodeError) as exc:
            raise MendError("invalid_download_link", "Artifact service returned an invalid scoped link.", 502) from exc


class LocalArtifacts:
    """Explicit local_test in-memory artifacts; never a live evidence source."""
    source = "local_test"

    def __init__(self):
        self._files: dict[str, bytes] = {}
        self._lock = threading.Lock()

    def put(self, task_id: str, user_id: str, key: str, data: bytes) -> str:
        storage_key, data = artifact_key(task_id, user_id, key), _check_data(data)
        with self._lock:
            if storage_key in self._files:
                raise MendError("artifact_write_rejected", "Immutable artifact already exists.", 409)
            self._files[storage_key] = data
        return storage_key

    def get(self, storage_key: str) -> bytes:
        validate_storage_key(storage_key)
        with self._lock:
            if storage_key not in self._files:
                raise MendError("artifact_not_found", "Local test artifact was not found.", 404)
            return self._files[storage_key]

    def signed_download(self, storage_key: str, expires_seconds: int = 60) -> str:
        self.get(storage_key)
        return "local_test://artifacts/" + storage_key + "?expires_seconds=" + str(_expiry(expires_seconds))
