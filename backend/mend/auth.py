"""Supabase identity verification and encrypted browser sessions."""
from __future__ import annotations

import base64
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from uuid import UUID
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import Settings
from .domain import MendError, canonical_json

SESSION_COOKIE = '__Host-mend-session'
CSRF_COOKIE = '__Host-mend-csrf'
_AAD = b'mend.session.v1'


def uuid_string(value):
    try:
        if not isinstance(value, str):
            raise ValueError()
        parsed = UUID(value)
        if str(parsed) != value:
            raise ValueError()
        return value
    except (ValueError, AttributeError):
        raise MendError('invalid_id', 'A canonical UUID is required.') from None


@dataclass(frozen=True)
class Identity:
    user_id: str
    access_token: str
    csrf_token: str
    expires_at: int


class SessionCodec:
    def __init__(self, key: bytes, lifetime=900, clock=time.time):
        if len(key) != 32 or not 60 <= lifetime <= 900:
            raise MendError('invalid_configuration', 'Session configuration is invalid.', 503)
        self.cipher = AESGCM(key)
        self.lifetime, self.clock = lifetime, clock

    def issue(self, user_id, access_token):
        uuid_string(user_id)
        if not isinstance(access_token, str) or not 1 <= len(access_token) <= 8192:
            raise MendError('invalid_session', 'Access token is invalid.', 401)
        now = int(self.clock())
        identity = Identity(user_id, access_token, secrets.token_urlsafe(32), now + self.lifetime)
        payload = canonical_json({'v': 1, 'sub': user_id, 'token': access_token,
                                  'csrf': identity.csrf_token, 'iat': now, 'exp': identity.expires_at})
        nonce = secrets.token_bytes(12)
        cookie = base64.urlsafe_b64encode(nonce + self.cipher.encrypt(nonce, payload, _AAD)).decode('ascii')
        # Browsers generally enforce a 4096-byte cookie limit. Avoid silently losing sessions.
        if len(cookie) > 3800:
            raise MendError('invalid_session', 'Access token is too large for the secure session.', 401)
        return cookie, identity

    def open(self, cookie):
        try:
            if not isinstance(cookie, str) or not 1 <= len(cookie) <= 3800:
                raise ValueError()
            raw = base64.b64decode(cookie.encode('ascii'), altchars=b'-_', validate=True)
            value = json.loads(self.cipher.decrypt(raw[:12], raw[12:], _AAD))
            now = int(self.clock())
            if (value['v'] != 1 or not isinstance(value['iat'], int) or isinstance(value['iat'], bool)
                    or not isinstance(value['exp'], int) or isinstance(value['exp'], bool)
                    or value['exp'] <= now or value['iat'] > now + 5
                    or not 0 < value['exp'] - value['iat'] <= self.lifetime
                    or not isinstance(value['token'], str) or not 1 <= len(value['token']) <= 8192
                    or not isinstance(value['csrf'], str) or not 32 <= len(value['csrf']) <= 64):
                raise ValueError()
            return Identity(uuid_string(value['sub']), value['token'], value['csrf'], value['exp'])
        except (ValueError, KeyError, TypeError, UnicodeError, InvalidTag, MendError):
            raise MendError('unauthenticated', 'The session is missing, invalid, or expired.', 401) from None


class SupabaseAuthenticator:
    def __init__(self, settings: Settings, transport, clock=time.time):
        self.settings, self.transport = settings, transport
        self.codec = SessionCodec(settings.validate_auth(), settings.session_seconds, clock)

    async def verify_token(self, access_token):
        if (not isinstance(access_token, str) or not 1 <= len(access_token) <= 8192
                or any(ord(c) < 33 or ord(c) > 126 for c in access_token)):
            raise MendError('unauthenticated', 'A valid access token is required.', 401)
        try:
            result = await self.transport.request('GET', self.settings.supabase_url.rstrip('/') + '/auth/v1/user',
                headers={'Authorization': 'Bearer ' + access_token,
                         'apikey': self.settings.supabase_service_role_key}, timeout=5.0, max_bytes=32768)
        except Exception as exc:
            # Do not reveal token, request URL, SQL details, or a provider response body.
            if getattr(exc, 'status', None) in (400, 401, 403):
                raise MendError('unauthenticated', 'The session could not be verified.', 401) from None
            raise MendError('identity_unavailable', 'Identity verification is temporarily unavailable.', 503) from None
        try:
            return uuid_string(result['id'])
        except (KeyError, TypeError, MendError):
            raise MendError('unauthenticated', 'The session could not be verified.', 401) from None

    async def exchange(self, access_token):
        user_id = await self.verify_token(access_token)
        return self.codec.issue(user_id, access_token)

    async def authenticate(self, cookie):
        identity = self.codec.open(cookie)
        verified_id = await self.verify_token(identity.access_token)
        # Server verification is bounded but can cross the issued cookie's expiry.
        # A verified access token does not renew this separate browser session.
        if self.codec.clock() >= identity.expires_at:
            raise MendError('unauthenticated', 'The session is missing, invalid, or expired.', 401)
        if not hmac.compare_digest(identity.user_id, verified_id):
            raise MendError('unauthenticated', 'The session could not be verified.', 401)
        return identity


def verify_origin(origin, settings):
    if not origin or origin not in settings.allowed_origins:
        raise MendError('origin_denied', 'This browser origin is not allowed.', 403)


def verify_csrf(identity, header, cookie):
    if (not isinstance(header, str) or not isinstance(cookie, str)
            or len(header) > 128 or len(cookie) > 128
            or not hmac.compare_digest(identity.csrf_token.encode('utf-8'), header.encode('utf-8'))
            or not hmac.compare_digest(identity.csrf_token.encode('utf-8'), cookie.encode('utf-8'))):
        raise MendError('csrf_denied', 'The request requires a valid CSRF token.', 403)
