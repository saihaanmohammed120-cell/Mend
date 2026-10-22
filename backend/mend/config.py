"""Fail-closed, environment-only deployment configuration."""
from __future__ import annotations

import base64
import os
import ipaddress
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from .domain import MendError


def https_origin(value: str) -> str:
    try:
        if (not isinstance(value, str) or not value
                or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value)):
            raise ValueError()
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None
                or parsed.password is not None or parsed.path not in ('', '/')
                or parsed.query or parsed.fragment):
            raise ValueError()
        # Explicit loopback HTTPS origins support unprivileged development ports.
        # Remote origins retain the inherited default-port constraint.
        if parsed.port not in (None, 443) and not (
                parsed.hostname in ('localhost', '127.0.0.1', '::1') and parsed.port >= 1024):
            raise ValueError()
        hostname = parsed.hostname
        if ':' in hostname:
            if '%' in hostname:
                raise ValueError()
            hostname = '[' + ipaddress.IPv6Address(hostname).compressed + ']'
        else:
            hostname = hostname.encode('idna').decode('ascii').lower()
            if (len(hostname) > 253 or not all(
                    re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label)
                    for label in hostname.split('.'))):
                raise ValueError()
        port = '' if parsed.port in (None, 443) else ':' + str(parsed.port)
        return 'https://' + hostname + port
    except (ValueError, UnicodeError, TypeError):
        raise MendError('invalid_configuration', 'HTTPS origins without credentials are required.', 503) from None


@dataclass(frozen=True)
class Settings:
    mode: str = 'local_test'
    public_origin: str = ''
    allowed_origins: tuple[str, ...] = ()
    supabase_url: str = ''
    supabase_service_role_key: str = field(default='', repr=False)
    session_seal_key: str = field(default='', repr=False)
    token_factory_key: str = field(default='', repr=False)
    token_factory_url: str = 'https://api.tokenfactory.nebius.com'
    model_id: str = 'nvidia/nemotron-3-super-120b-a12b'
    nebius_iam_token: str = field(default='', repr=False)
    nebius_project_id: str = ''
    runner_image_digest: str = ''
    live_enabled: bool = False
    session_seconds: int = 900
    task_timeout_seconds: int = 600
    job_timeout_seconds: int = 60
    max_repairs: int = 3
    max_tokens: int = 30000
    max_body_bytes: int = 65536

    def __post_init__(self):
        # Browser Origin serialization has no path/default HTTPS port and uses
        # canonical host casing. Direct construction and environment loading
        # must produce the same exact CORS/CSRF allowlist.
        if self.public_origin:
            object.__setattr__(self, 'public_origin', https_origin(self.public_origin))
        if self.supabase_url:
            object.__setattr__(self, 'supabase_url', https_origin(self.supabase_url))
        if not isinstance(self.allowed_origins, (tuple, list)):
            raise MendError('invalid_configuration', 'Allowed origins must be an explicit sequence.', 503)
        object.__setattr__(self, 'allowed_origins',
                           tuple(dict.fromkeys(https_origin(value) for value in self.allowed_origins)))

    @classmethod
    def from_env(cls, env=None):
        e = os.environ if env is None else env
        origin = e.get('MEND_PUBLIC_ORIGIN', '')
        origins = tuple(v.strip() for v in e.get('MEND_ALLOWED_ORIGINS', origin).split(',') if v.strip())
        mode = e.get('MEND_MODE', 'local_test')
        if mode not in ('local_test', 'database_only', 'live') or e.get('MEND_LIVE_ENABLED', 'false') not in ('true', 'false'):
            raise MendError('invalid_configuration', 'Mode and live release settings are invalid.', 503)
        return cls(mode=mode, public_origin=origin, allowed_origins=origins,
                   supabase_url=e.get('SUPABASE_URL', ''),
                   supabase_service_role_key=e.get('SUPABASE_SERVICE_ROLE_KEY', ''),
                   session_seal_key=e.get('MEND_SESSION_SEAL_KEY', ''),
                   token_factory_key=e.get('NEBIUS_TOKEN_FACTORY_API_KEY', ''),
                   token_factory_url=e.get('NEBIUS_TOKEN_FACTORY_URL', cls.token_factory_url),
                   model_id=e.get('NEBIUS_MODEL_ID', cls.model_id),
                   nebius_iam_token=e.get('NEBIUS_IAM_TOKEN', ''),
                   nebius_project_id=e.get('NEBIUS_PROJECT_ID', ''),
                   runner_image_digest=e.get('MEND_RUNNER_IMAGE_DIGEST', ''),
                   live_enabled=e.get('MEND_LIVE_ENABLED', 'false') == 'true')

    def validate_auth(self):
        origin = https_origin(self.public_origin)
        if not self.allowed_origins or origin not in tuple(https_origin(v) for v in self.allowed_origins):
            raise MendError('invalid_configuration', 'The public origin must be explicitly allowed.', 503)
        https_origin(self.supabase_url)
        if not self.supabase_service_role_key:
            raise MendError('missing_configuration', 'Authentication configuration is incomplete.', 503)
        try:
            raw = base64.urlsafe_b64decode(self.session_seal_key.encode('ascii'))
        except (ValueError, UnicodeError):
            raw = b''
        if len(raw) != 32:
            raise MendError('invalid_configuration', 'A 32-byte base64 session seal key is required.', 503)
        if not 60 <= self.session_seconds <= 900:
            raise MendError('invalid_configuration', 'Session duration must be 60–900 seconds.', 503)
        return raw

    def live_blockers(self):
        blockers = []
        if self.mode != 'live':
            blockers.append('database_only_mode' if self.mode == 'database_only' else 'local_test_mode')
        if not self.live_enabled:
            blockers.append('phase_1_release_evidence_required')
        for value, code in ((self.token_factory_key, 'token_factory_not_configured'),
                            (self.nebius_iam_token, 'cloud_iam_not_configured'),
                            (self.nebius_project_id, 'cloud_project_not_configured'),
                            (self.runner_image_digest, 'runner_image_not_configured')):
            if not value:
                blockers.append(code)
        return blockers
