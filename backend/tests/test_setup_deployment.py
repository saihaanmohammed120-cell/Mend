"""Setup mode serves status only; it must never silently replace the real runtime."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from mend.deployment import create_app_from_env
from mend.domain import MendError


ENV = {'MEND_SETUP_ONLY': 'true', 'MEND_MODE': 'database_only',
       'MEND_LIVE_ENABLED': 'false', 'MEND_DATABASE_WRITES_ENABLED': 'false'}


class DeploymentTests(unittest.TestCase):
    def test_setup_serves_status_without_runtime_auth_or_database(self):
        with patch.dict('os.environ', ENV, clear=True), \
                patch('mend.bootstrap.build_runtime', side_effect=AssertionError('Runtime constructed')):
            with TestClient(create_app_from_env()) as client:
                self.assertEqual(client.get('/healthz').json(), {'ok': True, 'mode': 'setup_only'})
                response = client.get('/readyz')
                self.assertEqual(response.status_code, 503)
                report = response.json()
                self.assertFalse(report['ready'])
                self.assertEqual(report['mode'], 'setup_only')
                self.assertEqual(report['database'], {'status': 'not_checked', 'source': 'none', 'release_gate': 'unknown'})
                self.assertIn('authentication_unavailable', report['blockers'])
                self.assertIn('database_write_hold', report['blockers'])
                self.assertIn('phase_1_release_evidence_required', report['blockers'])
                for method, path in [('POST', '/api/session'), ('GET', '/api/session'),
                                     ('DELETE', '/api/session'), ('POST', '/api/tasks'),
                                     ('PATCH', '/api/tasks/anything/contract'), ('GET', '/openapi.json'),
                                     ('GET', '/docs'), ('POST', '/healthz'), ('OPTIONS', '/readyz')]:
                    denied = client.request(method, path, content=b'{"private":"DO_NOT_ECHO"}',
                                            headers={'Origin': 'https://untrusted.example'})
                    self.assertEqual(denied.status_code, 503, (method, path))
                    self.assertEqual(denied.json()['error']['code'], 'backend_setup_only')
                    self.assertNotIn('DO_NOT_ECHO', denied.text)
                    self.assertNotIn('set-cookie', denied.headers)
                    self.assertNotIn('access-control-allow-origin', denied.headers)
                    self.assertEqual(denied.headers['cache-control'], 'no-store')
                    self.assertEqual(denied.headers['x-content-type-options'], 'nosniff')

    def test_default_and_explicit_false_use_strict_original_factory_without_fallback(self):
        for env in ({}, {'MEND_SETUP_ONLY': 'false'}):
            with self.subTest(env=env), patch.dict('os.environ', env, clear=True), \
                    patch('mend.bootstrap.create_app_from_env', side_effect=MendError('missing_configuration', 'Missing auth.', 503)) as factory:
                with self.assertRaises(MendError):
                    create_app_from_env()
                factory.assert_called_once_with()

    def test_setup_refuses_conflicting_or_invalid_flags(self):
        for changed in ({'MEND_SETUP_ONLY': ''}, {'MEND_SETUP_ONLY': 'TRUE'}, {'MEND_MODE': 'local_test'},
                        {'MEND_MODE': 'live'}, {'MEND_LIVE_ENABLED': 'true'},
                        {'MEND_DATABASE_WRITES_ENABLED': 'true'}, {'MEND_DATABASE_WRITES_ENABLED': 'yes'}):
            with self.subTest(changed=changed), patch.dict('os.environ', {**ENV, **changed}, clear=True):
                with self.assertRaises(MendError):
                    create_app_from_env()

    def test_setup_does_not_promote_when_a_credential_is_added(self):
        with patch.dict('os.environ', {**ENV, 'SUPABASE_SERVICE_ROLE_KEY': 'fixture-not-a-real-key'}, clear=True):
            with TestClient(create_app_from_env()) as client:
                self.assertFalse(client.get('/readyz').json()['ready'])
                self.assertEqual(client.post('/api/session').status_code, 503)

    def test_setup_rejects_without_consuming_a_request_body(self):
        def unread_body():
            raise AssertionError('Setup mode consumed the request body')
            yield b''

        with patch.dict('os.environ', ENV, clear=True):
            with TestClient(create_app_from_env()) as client:
                self.assertEqual(client.post('/api/session', content=unread_body()).status_code, 503)
