"""Bounded HTTPS JSON transport. Credentials never follow redirects."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import math
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


class TransportError(RuntimeError):
    def __init__(self, code: str, message: str, status: int | None = None,
                 retryable: bool = False):
        super().__init__(message)
        self.code, self.status, self.retryable = code, status, retryable


def strict_json(data: str | bytes):
    """Reject duplicate keys/non-finite numbers instead of silently overwriting."""
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate JSON field")
            result[key] = value
        return result

    def constant(_):
        raise ValueError("non-finite JSON number")

    def finite_float(value):
        parsed = float(value)
        if not math.isfinite(parsed):
            raise ValueError("non-finite JSON number")
        return parsed

    return json.loads(data, object_pairs_hook=pairs, parse_constant=constant,
                      parse_float=finite_float)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class JsonTransport:
    """No implicit retries; every caller must reserve its own retry budget.

    A bounded executor caps abandoned blocking work. Cancellation closes a
    response as soon as urllib returns; it cannot undo an accepted provider
    request or interrupt operating-system DNS resolution. Do not retry an
    ambiguous POST merely because its local waiter expired.
    """
    def __init__(self, allowed_hosts, *, opener=None, max_workers: int = 4):
        if not isinstance(max_workers, int) or not 1 <= max_workers <= 8:
            raise ValueError("max_workers must be between one and eight")
        self.allowed_hosts = frozenset(allowed_hosts)
        if not self.allowed_hosts or any(
            not isinstance(host, str) or not host or host != host.lower()
            or any(char in host for char in "/:@\\ ") for host in self.allowed_hosts
        ):
            raise ValueError("explicit lowercase host allowlist required")
        self.opener = opener or urllib.request.build_opener(
            urllib.request.ProxyHandler({}), _NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )
        self._executor = ThreadPoolExecutor(max_workers=max_workers,
                                            thread_name_prefix="mend-http")
        self._slots = threading.BoundedSemaphore(max_workers)
        self._closed = False

    def close(self):
        self._closed = True
        self._executor.shutdown(wait=False, cancel_futures=True)

    def validate_url(self, url: str):
        try:
            parts = urllib.parse.urlsplit(url)
            valid = (parts.scheme == "https" and parts.hostname in self.allowed_hosts
                     and parts.username is None and parts.password is None
                     and parts.port in (None, 443) and not parts.fragment
                     and not any(char.isspace() or ord(char) < 32 for char in url))
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise TransportError("unsafe_endpoint", "Provider endpoint is not permitted.")

    async def request(self, method, url, headers=None, json_body=None,
                      timeout=30.0, max_bytes=1_048_576):
        self.validate_url(url)
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            raise TransportError("invalid_request", "Unsupported HTTP method.")
        if (not isinstance(timeout, (int, float)) or isinstance(timeout, bool)
                or not math.isfinite(timeout) or not 0 < timeout <= 120):
            raise TransportError("invalid_request", "Request deadline is invalid.")
        if (not isinstance(max_bytes, int) or isinstance(max_bytes, bool)
                or not 1 <= max_bytes <= 4_194_304):
            raise TransportError("invalid_request", "Response limit is invalid.")
        clean_headers = {"Accept": "application/json", "Accept-Encoding": "identity"}
        for name, value in (headers or {}).items():
            if (not isinstance(name, str) or not isinstance(value, str)
                    or not name or any(ord(c) < 32 or ord(c) == 127 for c in name + value)
                    or any(c in name for c in " :")):
                raise TransportError("invalid_request", "HTTP header is invalid.")
            clean_headers[name] = value
        body = None
        if json_body is not None:
            try:
                body = json.dumps(json_body, ensure_ascii=False,
                                  allow_nan=False, separators=(",", ":")).encode("utf-8")
            except (ValueError, TypeError, UnicodeError, RecursionError):
                raise TransportError("invalid_request", "Request JSON is invalid.") from None
            if len(body) > 1_048_576:
                raise TransportError("request_too_large", "Request exceeds the byte limit.")
            clean_headers["Content-Type"] = "application/json"
        if self._closed:
            raise TransportError("transport_closed", "Provider transport is closed.")
        if not self._slots.acquire(blocking=False):
            raise TransportError("transport_busy", "Provider concurrency limit reached.")
        stop = threading.Event()
        deadline = time.monotonic() + float(timeout)
        try:
            future = asyncio.get_running_loop().run_in_executor(
                self._executor, self._sync_request, method, url, clean_headers,
                body, deadline, max_bytes, stop,
            )
        except RuntimeError:
            self._slots.release()
            raise TransportError("transport_closed", "Provider transport is closed.") from None
        # Consume an exception from work finishing after its caller was cancelled.
        future.add_done_callback(lambda done: None if done.cancelled() else done.exception())
        try:
            return await asyncio.wait_for(asyncio.shield(future), float(timeout))
        except asyncio.TimeoutError:
            stop.set()
            raise TransportError("provider_timeout", "Provider request deadline expired.") from None
        except asyncio.CancelledError:
            stop.set()
            raise

    def _sync_request(self, method, url, headers, body, deadline, max_bytes, stop):
        response = None
        def remaining():
            left = deadline - time.monotonic()
            if stop.is_set() or left <= 0:
                raise TransportError("provider_timeout", "Provider request deadline expired.")
            return left
        try:
            request = urllib.request.Request(url, data=body, headers=headers, method=method)
            response = self.opener.open(request, timeout=remaining())
            remaining()
            status = response.getcode()
            if type(status) is not int:
                raise TransportError("invalid_response", "Provider HTTP status is invalid.")
            if not 200 <= status < 300:
                raise TransportError("provider_http_error", "Provider rejected the request.",
                                     status=status, retryable=status in {429, 502, 503, 504})
            length = response.headers.get("Content-Length")
            if length is not None:
                try:
                    declared = int(length)
                except (TypeError, ValueError):
                    raise TransportError("invalid_response", "Provider response framing is invalid.") from None
                if declared < 0 or declared > max_bytes:
                    raise TransportError("response_too_large", "Provider response exceeds the byte limit.")
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise TransportError("invalid_response", "Compressed provider response is unsupported.")
            chunks, size = [], 0
            reader = getattr(response, "read1", response.read)
            while True:
                left = remaining()
                # urllib exposes its TLS socket through this path. Updating its
                # timeout prevents each body read receiving a fresh full budget.
                sock = getattr(getattr(getattr(response, "fp", None), "raw", None), "_sock", None)
                if sock is not None:
                    sock.settimeout(left)
                chunk = reader(min(65536, max_bytes + 1 - size))
                remaining()
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise TransportError("response_too_large", "Provider response exceeds the byte limit.")
                chunks.append(chunk)
            try:
                result = strict_json(b"".join(chunks).decode("utf-8"))
            except (ValueError, UnicodeError, RecursionError):
                raise TransportError("invalid_response", "Provider returned invalid JSON.") from None
            if not isinstance(result, (dict, list)):
                raise TransportError("invalid_response", "Provider JSON must be an object or array.")
            return result
        except urllib.error.HTTPError as error:
            status = error.code
            try:
                error.close()
            except Exception:
                # An exception raised inside this handler would bypass the
                # sibling error handlers and expose raw cleanup details.
                pass
            raise TransportError("provider_http_error", "Provider rejected the request.",
                                 status=status, retryable=status in {429, 502, 503, 504}) from None
        except (TimeoutError, socket.timeout):
            raise TransportError("provider_timeout", "Provider request deadline expired.") from None
        except (urllib.error.URLError, OSError, ValueError):
            raise TransportError("provider_unreachable", "Provider request could not be completed.") from None
        except TransportError:
            raise
        except Exception:
            raise TransportError("invalid_response", "Provider response could not be read safely.") from None
        finally:
            try:
                if response is not None:
                    response.close()
            except Exception:
                # Cleanup must not expose provider details or leak a slot.
                pass
            finally:
                self._slots.release()
