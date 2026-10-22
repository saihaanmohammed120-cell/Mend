"""Bounded, credential-private Supabase command transport."""
from __future__ import annotations

import json
import asyncio
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from mend.domain import MendError
from mend.transport import strict_json

ACTIONS = frozenset({
    'create_task', 'get_task', 'propose_contract', 'start_task', 'claim_worker',
    'set_state', 'reserve_repair', 'reserve_attempt', 'dispatch', 'attach_job',
    'resolve_attempt', 'usage', 'output', 'events', 'request_cancel', 'finish_stop',
    'finalize', 'due', 'pending', 'deadline_cancel',
})
MAX_REQUEST_BYTES = 1_048_576
MAX_RESPONSE_BYTES = 2_097_152
PROBE_DEADLINE_SECONDS = 10.0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise MendError('database_redirect', 'Database redirect rejected.', 502)


class SupabaseRepository:
    """No retries: a transport timeout may follow a committed transaction."""

    def __init__(self, url: str, service_role_key: str, *, timeout: float = 10.0,
                 opener: Callable | None = None):
        try:
            parsed = urllib.parse.urlsplit(url)
            host = parsed.hostname
            port = parsed.port
        except (TypeError, ValueError):
            raise MendError('configuration', 'Supabase URL must be an HTTPS origin.', 503) from None
        if (parsed.scheme != 'https' or not host or parsed.username or
                parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/') or
                port not in (None, 443) or any(c.isspace() or ord(c)<32 for c in url)):
            raise MendError('configuration', 'Supabase URL must be an HTTPS origin.', 503)
        if not isinstance(service_role_key, str) or not service_role_key or any(c in service_role_key for c in '\r\n'):
            raise MendError('configuration', 'Supabase server credential is missing or invalid.', 503)
        if not 0 < timeout <= 30:
            raise MendError('configuration', 'Database timeout must be within 30 seconds.', 503)
        self._url = url.rstrip('/') + '/rest/v1/rpc/mend_command'
        self._key = service_role_key
        self._timeout = timeout
        self._open = opener or urllib.request.build_opener(_NoRedirect()).open
        self._probe_inflight = threading.Lock()

    def call(self, action: str, payload: dict) -> dict | list:
        if not isinstance(action, str) or action not in ACTIONS or not isinstance(payload, dict):
            raise MendError('invalid_command', 'Invalid database command.')
        try:
            data = json.dumps({'p_action': action, 'p_payload': payload},
                              separators=(',', ':'), allow_nan=False).encode('utf-8')
        except (TypeError, ValueError, UnicodeError, RecursionError):
            raise MendError('invalid_command', 'Database payload is not valid JSON.') from None
        if len(data) > MAX_REQUEST_BYTES:
            raise MendError('payload_too_large', 'Database request exceeds its limit.', 413)
        return self._post(self._url, data)

    def retention_plan(self, limit: int = 20) -> dict | list:
        """Read-only service RPC; deliberately not a deletion command."""
        if type(limit) is not int or not 1 <= limit <= 100:
            raise MendError('invalid_command', 'Retention inspection limit must be 1–100.')
        data = json.dumps({'p_limit': limit}, separators=(',', ':')).encode('utf-8')
        return self._post(self._url.removesuffix('mend_command') + 'mend_retention_plan', data)

    async def runtime_probe(self) -> dict | list:
        """Deadline for callers; at most one blocking probe per repository.

        urllib cannot cancel an in-progress read. Keep its slot occupied until
        that read actually ends, including after timeout or caller cancellation.
        Subsequent health requests fail closed without queuing more threads.
        """
        if not self._probe_inflight.acquire(blocking=False):
            raise MendError('database_probe_busy', 'Database status is unavailable.', 503)
        def request():
            try:
                return self._post(self._url.removesuffix('mend_command') + 'mend_runtime_probe', b'{}', timeout=PROBE_DEADLINE_SECONDS)
            finally:
                self._probe_inflight.release()
        try:
            future = asyncio.get_running_loop().run_in_executor(None, request)
        except BaseException:
            self._probe_inflight.release()
            raise
        # shield ensures cancellation never frees an unfinished transport slot.
        # Retrieve a late exception to avoid an unobserved-future warning.
        future.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
        return await asyncio.wait_for(asyncio.shield(future), timeout=PROBE_DEADLINE_SECONDS)

    def _post(self, url: str, data: bytes, *, timeout: float | None = None) -> dict | list:
        request = urllib.request.Request(url, data=data, method='POST', headers={
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'apikey': self._key, 'Authorization': 'Bearer ' + self._key,
        })
        try:
            with self._open(request, timeout=self._timeout if timeout is None else timeout) as response:
                if response.status != 200:
                    raise MendError('database_unavailable', 'Database response was unsuccessful.', 503)
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise MendError('database_response_limit', 'Database response exceeds its limit.', 502)
            value = strict_json(raw)
            if not isinstance(value, (dict, list)):
                raise MendError('database_response', 'Database returned an invalid response.', 502)
            return value
        except urllib.error.HTTPError as error:
            # Do not log/return URLs, SQL DETAIL, credential headers or response bodies.
            try:
                body = error.read(4096)
                decoded = strict_json(body)
                code = decoded.get('code') if isinstance(decoded, dict) else None
                if not isinstance(code, str):
                    code = None
            except (ValueError, AttributeError, UnicodeError, OSError, RecursionError):
                code = None
            finally:
                error.close()
            mapping = {
                'M4001': ('invalid_command', 'Database command validation failed.', 400),
                'M4031': ('not_found', 'Task is unavailable.', 404),
                'M4091': ('conflict', 'Task changed or its worker lease expired.', 409),
                'M4121': ('release_blocked', 'Live execution release evidence is missing.', 503),
                '23505': ('conflict', 'Operation conflicts with an existing reservation.', 409),
                '23514': ('conflict', 'Operation violates a task safety constraint.', 409),
                'P0001': ('conflict', 'Operation violates a task safety rule.', 409),
            }
            selected = mapping.get(code, ('database_unavailable', 'Database request failed.', 503))
            raise MendError(*selected) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise MendError('database_unavailable', 'Database transport failed; reconcile before retrying.', 503) from None
        except (ValueError, UnicodeError, RecursionError):
            raise MendError('database_response', 'Database returned invalid JSON.', 502) from None
