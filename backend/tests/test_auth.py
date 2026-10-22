import asyncio
import base64
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from mend.api import bounded_json, event_bytes, exact_fields, replay_cursor, sse_stream
from mend.auth import Identity, SessionCodec, SupabaseAuthenticator, uuid_string, verify_csrf, verify_origin
from mend.config import Settings
from mend.domain import MendError

USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
TOKEN = 'opaque.valid.token'


def settings():
    return Settings(public_origin='https://mend.example', allowed_origins=('https://mend.example',),
                    supabase_url='https://project.supabase.co', supabase_service_role_key='private-test-key',
                    session_seal_key=base64.urlsafe_b64encode(b'k' * 32).decode())


class Transport:
    def __init__(self):
        self.user, self.calls = USER, []
        self.error = None

    async def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.error:
            raise self.error
        return {'id': self.user}


class Request:
    def __init__(self, chunks=(), headers=None):
        self.chunks = chunks
        self.headers = headers or {'content-type': 'application/json'}

    async def stream(self):
        for chunk in self.chunks:
            yield chunk

    async def is_disconnected(self):
        return False


class AuthTests(unittest.TestCase):
    def test_encryption_roundtrip_and_no_plain_token(self):
        codec = SessionCodec(b'x' * 32, clock=lambda: 100)
        cookie, identity = codec.issue(USER, TOKEN)
        self.assertNotIn(TOKEN.encode(), base64.urlsafe_b64decode(cookie))
        self.assertEqual(codec.open(cookie), identity)
        second, _ = codec.issue(USER, TOKEN)
        self.assertNotEqual(cookie, second)

    def test_tampering_wrong_key_and_expiry_fail_closed(self):
        now = [100]
        codec = SessionCodec(b'x' * 32, clock=lambda: now[0])
        cookie, _ = codec.issue(USER, TOKEN)
        raw = bytearray(base64.urlsafe_b64decode(cookie))
        raw[-1] ^= 1
        for damaged in (base64.urlsafe_b64encode(raw).decode(), 'not-base64!', '', None):
            with self.assertRaises(MendError) as caught:
                codec.open(damaged)
            self.assertEqual(caught.exception.code, 'unauthenticated')
        with self.assertRaises(MendError):
            SessionCodec(b'y' * 32, clock=lambda: 100).open(cookie)
        now[0] = 1000
        with self.assertRaises(MendError):
            codec.open(cookie)

    def test_cookie_size_budget(self):
        codec = SessionCodec(b'x' * 32)
        with self.assertRaises(MendError):
            codec.issue(USER, 'x' * 4000)

    def test_csrf_is_bound_to_session_and_origin_exact(self):
        identity = Identity(USER, TOKEN, 'x' * 43, 1000)
        verify_csrf(identity, 'x' * 43, 'x' * 43)
        verify_origin('https://mend.example', settings())
        for header, cookie in ((None, 'x' * 43), ('y' * 43, 'x' * 43), ('x' * 43, 'y' * 43), ('é' * 43, 'x' * 43)):
            with self.assertRaises(MendError):
                verify_csrf(identity, header, cookie)
        for origin in (None, 'null', 'https://mend.example.attacker.test', 'http://mend.example'):
            with self.assertRaises(MendError):
                verify_origin(origin, settings())

    def test_configuration_no_secrets_in_readiness(self):
        config = Settings.from_env({})
        self.assertFalse(config.live_enabled)
        self.assertEqual(config.mode, 'local_test')
        self.assertIn('phase_1_release_evidence_required', config.live_blockers())
        self.assertNotIn('private-test-key', json.dumps(settings().live_blockers()))
        self.assertNotIn('private-test-key', repr(settings()))
        settings().validate_auth()
        for env in ({'MEND_MODE': 'production'}, {'MEND_LIVE_ENABLED': 'TRUE'}):
            with self.assertRaises(MendError):
                Settings.from_env(env)
        with self.assertRaises(MendError):
            Settings().validate_auth()
        with self.assertRaises(MendError):
            Settings(public_origin='http://localhost').validate_auth()

    def test_origins_normalize_equally_from_environment_and_direct_settings(self):
        key = base64.urlsafe_b64encode(b'k' * 32).decode()
        direct = Settings(public_origin='https://MEND.EXAMPLE:443/',
                          allowed_origins=('https://MEND.EXAMPLE:443/', 'https://mend.example'),
                          supabase_url='https://PROJECT.SUPABASE.CO/',
                          supabase_service_role_key='fixture', session_seal_key=key)
        loaded = Settings.from_env({'MEND_PUBLIC_ORIGIN': 'https://MEND.EXAMPLE:443/',
            'MEND_ALLOWED_ORIGINS': 'https://MEND.EXAMPLE:443/, https://mend.example',
            'SUPABASE_URL': 'https://PROJECT.SUPABASE.CO/',
            'SUPABASE_SERVICE_ROLE_KEY': 'fixture', 'MEND_SESSION_SEAL_KEY': key})
        for config in (direct, loaded):
            self.assertEqual(config.public_origin, 'https://mend.example')
            self.assertEqual(config.allowed_origins, ('https://mend.example',))
            self.assertEqual(config.supabase_url, 'https://project.supabase.co')
            config.validate_auth()
            verify_origin('https://mend.example', config)
            with self.assertRaises(MendError):
                verify_origin('https://mend.example.attacker.test', config)

    def test_origins_reject_credentials_controls_and_nonorigin_paths(self):
        for origin in ('https://user@host.test', 'https://host.test/path',
                       'https://host.test?x=1', 'https://host.test#fragment',
                       'https://host.test:8443', 'https://host.test\n',
                       'https://bad host.test', 'https://host.test\\other',
                       'https://', 'http://host.test'):
            with self.subTest(origin=origin), self.assertRaises(MendError):
                Settings(public_origin=origin)

    def test_ids_and_cursor_validation(self):
        self.assertEqual(uuid_string(USER), USER)
        self.assertEqual(replay_cursor('12', '8'), 12)
        self.assertEqual(replay_cursor(None, None), 0)
        for value in ('-1', '1\nevent: bad', '9223372036854775808', '０', ' 1', ''):
            with self.assertRaises(MendError):
                replay_cursor(value, None)
        for value in ('../x', USER.upper(), None):
            with self.assertRaises(MendError):
                uuid_string(value)

    def test_sse_wire_ids_json_and_no_worker_credentials(self):
        event = {'sequence': 3, 'event_type': 'log', 'message': 'line\nnext', 'lease_token': 'secret',
                 'payload': {'worker_id': 'secret', 'status': 'running'}}
        encoded = event_bytes(event, 2)
        self.assertTrue(encoded.startswith(b'id: 3\nevent: log\ndata: '))
        self.assertNotIn(b'secret', encoded)
        self.assertIn(b'line\\nnext', encoded)
        self.assertIsNone(event_bytes(event, 3))
        with self.assertRaises(MendError):
            event_bytes({'sequence': 4, 'event_type': 'log\ndata: attack'}, 3)


    def test_receipt_sse_preserves_finite_fractional_usage(self):
        event = {'sequence': 9, 'event_type': 'receipt', 'payload': {
            'source': 'local_test', 'status': 'passed', 'receipt_json': {
                'usage': {'tokens': 6000, 'cost': 0.00125, 'actual_cost': 0.00075,
                          'actual_tokens': 4200}}}}
        encoded = event_bytes(event, 8)
        data = next(line[6:] for line in encoded.decode().splitlines() if line.startswith('data: '))
        restored = json.loads(data)
        self.assertEqual(restored['payload']['receipt_json']['usage']['cost'], 0.00125)
        self.assertEqual(restored['payload']['receipt_json']['usage']['actual_cost'], 0.00075)
        for bad in (float('nan'), float('inf'), -float('inf')):
            event['payload']['receipt_json']['usage']['cost'] = bad
            with self.assertRaises(MendError):
                event_bytes(event, 8)


class AsyncAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_server_identity_reverified_and_subject_bound(self):
        transport = Transport()
        auth = SupabaseAuthenticator(settings(), transport, clock=lambda: 100)
        cookie, actor = await auth.exchange(TOKEN)
        self.assertEqual((await auth.authenticate(cookie)).user_id, USER)
        self.assertEqual(len(transport.calls), 2)
        args, kwargs = transport.calls[-1]
        self.assertEqual(args[0], 'GET')
        self.assertEqual(kwargs['timeout'], 5.0)
        self.assertEqual(kwargs['max_bytes'], 32768)
        transport.user = OTHER
        with self.assertRaises(MendError):
            await auth.authenticate(cookie)

    async def test_identity_verification_cannot_renew_or_cross_issued_session_expiry(self):
        for finished_at in (159, 159.999, 160, 161):
            with self.subTest(finished_at=finished_at):
                now = [100]
                class ExpiryBoundaryTransport(Transport):
                    async def request(self, *args, **kwargs):
                        now[0] = finished_at
                        return await super().request(*args, **kwargs)
                config = Settings(public_origin='https://mend.example',
                    allowed_origins=('https://mend.example',),
                    supabase_url='https://project.supabase.co',
                    supabase_service_role_key='fixture-server-key',
                    session_seal_key=base64.urlsafe_b64encode(b'k' * 32).decode(),
                    session_seconds=60)
                transport = ExpiryBoundaryTransport()
                auth = SupabaseAuthenticator(config, transport, clock=lambda: now[0])
                cookie, issued = auth.codec.issue(USER, TOKEN)
                self.assertEqual(issued.expires_at, 160)
                now[0] = 159
                if finished_at >= issued.expires_at:
                    with self.assertRaises(MendError) as caught:
                        await auth.authenticate(cookie)
                    self.assertEqual(caught.exception.code, 'unauthenticated')
                    self.assertEqual(caught.exception.status, 401)
                else:
                    authenticated = await auth.authenticate(cookie)
                    self.assertEqual(authenticated, issued)
                    self.assertEqual(authenticated.expires_at, 160)
                self.assertEqual(len(transport.calls), 1)

    async def test_provider_errors_redacted_and_bad_tokens_not_dispatched(self):
        transport = Transport()
        auth = SupabaseAuthenticator(settings(), transport)
        for token in ('a\r\nb', None, '', 'x' * 8193):
            with self.assertRaises(MendError):
                await auth.verify_token(token)
        self.assertEqual(transport.calls, [])
        transport.error = RuntimeError('PRIVATE_TOKEN_AND_PROVIDER_BODY')
        with self.assertRaises(MendError) as caught:
            await auth.verify_token(TOKEN)
        self.assertEqual(caught.exception.status, 503)
        self.assertNotIn('PRIVATE', str(caught.exception))
        transport.error = SimpleError(401)
        with self.assertRaises(MendError) as caught:
            await auth.verify_token(TOKEN)
        self.assertEqual(caught.exception.status, 401)

    async def test_bodies_bounded_and_duplicate_nonfinite_rejected(self):
        self.assertEqual(await bounded_json(Request([b'{"prompt":"x"}']), 100), {'prompt': 'x'})
        for content in (b'{"a":1,"a":2}', b'{"a":NaN}', b'[]', b'not-json'):
            with self.assertRaises(MendError):
                await bounded_json(Request([content]), 100)
        with self.assertRaises(MendError) as caught:
            await bounded_json(Request([b'{"long":', b'"12345"}']), 10)
        self.assertEqual(caught.exception.status, 413)
        with self.assertRaises(MendError):
            await bounded_json(Request([b'{}'], {'content-type': 'text/plain'}), 100)
        with self.assertRaises(MendError):
            exact_fields({'user_id': OTHER}, ())

    async def test_overflowing_json_numbers_rejected_without_rejecting_finite_costs(self):
        for content in (b'{"value":1e999}', b'{"value":-1e999}',
                        b'{"nested":[1e999]}', b'{"value":Infinity}'):
            with self.subTest(content=content), self.assertRaises(MendError) as caught:
                await bounded_json(Request([content]), 100)
            self.assertEqual(caught.exception.code, 'invalid_json')
        body = await bounded_json(Request([b'{"cost":0.00125,"value":1e100}']), 100)
        self.assertEqual(body['cost'], 0.00125)
        json.dumps(body, allow_nan=False)

    async def test_sse_drops_event_that_arrives_after_session_expiry(self):
        now = [100]
        closed = []
        class Service:
            async def events(self, *args, **kwargs):
                try:
                    now[0] = 102
                    yield {'sequence': 1, 'event_type': 'log', 'message': 'private event'}
                finally:
                    closed.append(True)
        chunks = [item async for item in sse_stream(Service(), USER,
            Identity(USER, TOKEN, 'x' * 43, 101), Request(), 0, clock=lambda: now[0])]
        self.assertEqual(chunks, [])
        self.assertEqual(closed, [True])

    async def test_sse_drops_event_if_session_expires_during_serialization(self):
        now = [100]
        class Service:
            async def events(self, *args, **kwargs):
                yield {'sequence': 1, 'event_type': 'log', 'message': 'private event'}
        def encode_after_expiry(event, previous):
            result = event_bytes(event, previous)
            now[0] = 102
            return result
        with patch('mend.api.event_bytes', side_effect=encode_after_expiry):
            chunks = [item async for item in sse_stream(Service(), USER,
                Identity(USER, TOKEN, 'x' * 43, 101), Request(), 0, clock=lambda: now[0])]
        self.assertEqual(chunks, [])

    async def test_sse_drops_event_if_client_disconnects_during_wait(self):
        disconnected = [False]
        closed = []
        class DisconnectRequest(Request):
            async def is_disconnected(self):
                return disconnected[0]
        class Service:
            async def events(self, *args, **kwargs):
                try:
                    disconnected[0] = True
                    yield {'sequence': 1, 'event_type': 'log', 'message': 'private event'}
                finally:
                    closed.append(True)
        chunks = [item async for item in sse_stream(Service(), USER,
            Identity(USER, TOKEN, 'x' * 43, 1000), DisconnectRequest(), 0, clock=lambda: 100)]
        self.assertEqual(chunks, [])
        self.assertEqual(closed, [True])

    async def test_sse_heartbeat_replay_dedup_and_cleanup(self):
        state = {'closed': False}
        class Service:
            async def events(self, task_id, user_id, after=0):
                self.args = (task_id, user_id, after)
                try:
                    yield {'sequence': 1, 'event_type': 'state', 'payload': {'status': 'running'}}
                    await asyncio.sleep(.015)
                    yield {'sequence': 2, 'event_type': 'log', 'message': 'real fixture log'}
                    yield {'sequence': 2, 'event_type': 'log', 'message': 'duplicate'}
                    yield {'sequence': 3, 'event_type': 'receipt', 'payload': {'source': 'local_test'}}
                finally:
                    state['closed'] = True
        service = Service()
        actor = Identity(USER, TOKEN, 'x' * 43, 1000)
        chunks = [item async for item in sse_stream(service, USER, actor, Request(), 1,
                                                    heartbeat_seconds=.005, clock=lambda: 100)]
        self.assertTrue(any(item == b': keepalive\n\n' for item in chunks))
        self.assertEqual(sum(item.startswith(b'id: 2\n') for item in chunks), 1)
        self.assertFalse(any(item.startswith(b'id: 1\n') for item in chunks))
        self.assertTrue(state['closed'])
        self.assertEqual(service.args, (USER, USER, 1))

    async def test_sse_disconnect_cleans_generator_without_cancelling_job(self):
        entered = asyncio.Event()
        closed = asyncio.Event()
        class Service:
            async def events(self, *args, **kwargs):
                try:
                    entered.set()
                    await asyncio.sleep(100)
                    yield {}
                finally:
                    closed.set()
        stream = sse_stream(Service(), USER, Identity(USER, TOKEN, 'x' * 43, 1000),
                            Request(), 0, heartbeat_seconds=.001, clock=lambda: 100)
        self.assertEqual(await anext(stream), b': keepalive\n\n')
        await stream.aclose()
        self.assertTrue(entered.is_set())
        self.assertTrue(closed.is_set())


class SimpleError(Exception):
    def __init__(self, status):
        self.status = status


if __name__ == '__main__':
    unittest.main()
