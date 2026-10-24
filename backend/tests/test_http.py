"""Genuine FastAPI HTTP integration; absent frameworks produce explicit skips."""
import asyncio
import base64
import importlib.metadata
import importlib.util
import unittest
import uuid
from unittest.mock import patch

def http_dependencies_available():
    available = True
    for module in ("fastapi", "starlette", "httpx"):
        if importlib.util.find_spec(module) is None:
            try:
                importlib.metadata.distribution(module)
            except importlib.metadata.PackageNotFoundError:
                available = False
            else:
                raise ImportError(f"Installed {module} distribution has no importable module.")
    return available


HTTP_AVAILABLE = http_dependencies_available()


@unittest.skipUnless(HTTP_AVAILABLE, "FastAPI/Starlette/httpx unavailable; genuine HTTP integration pending.")
class HttpIntegrationTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from mend.api import create_app
        from mend.artifacts import LocalArtifacts
        from mend.auth import SupabaseAuthenticator
        from mend.config import Settings
        from mend.fakes import FixtureModel, FixtureRunner
        from mend.local_store import LocalTestStore
        from mend.service import TaskService
        self.user = str(uuid.uuid4())
        self.auth_requests = []
        owner, records = self.user, self.auth_requests
        class IdentityFixture:
            async def request(self, method, url, **kwargs):
                if method != "GET" or url != "https://supabase.test/auth/v1/user":
                    raise AssertionError("Unexpected identity boundary")
                if kwargs["headers"]["Authorization"] != "Bearer fixture-access-token":
                    raise AssertionError("Unexpected fixture credential")
                records.append(url)
                return {"id": owner}
        settings = Settings(public_origin="https://MEND.TEST:443/", allowed_origins=("https://MEND.TEST:443/",),
            supabase_url="https://supabase.test", supabase_service_role_key="fixture-server-key",
            session_seal_key=base64.urlsafe_b64encode(b"f" * 32).decode())
        self.store = LocalTestStore()
        self.service = TaskService(self.store, FixtureModel(), FixtureRunner(), LocalArtifacts())
        self.authenticator = SupabaseAuthenticator(settings, IdentityFixture())
        app = create_app(self.service, settings, self.authenticator)
        self.client = TestClient(app, base_url="https://mend.test")
        session = self.client.post("/api/session", headers={"Origin": "https://mend.test"},
                                   json={"access_token": "fixture-access-token"})
        self.assertEqual(session.status_code, 200)
        self.headers = {"Origin": "https://mend.test", "X-CSRF-Token": session.json()["csrf_token"],
                        "Idempotency-Key": str(uuid.uuid4())}

    def tearDown(self):
        self.client.close()
        self.store.close()

    def test_hosted_database_hold_blocks_task_mutations_but_preserves_stateless_review(self):
        from dataclasses import replace
        from fastapi.testclient import TestClient
        from mend.api import create_app
        from mend.bug_cases import prepare_bug_case
        settings = replace(self.authenticator.settings, mode='database_only')
        body = {'intake': {'kind': 'mend_bug_intake', 'schema_version': 1,
                'file_path': 'helper.py', 'original_source': 'def value(): return 0\n',
                'reported_error': None, 'expected_behavior': 'Return one',
                'evidence': {'investigation': 'not_run', 'execution': 'not_run', 'regression': 'not_generated'}},
                'protected_test_source': '# Proposed checks\n',
                'required_check_ids': ['test_regression.Checks.test_value'],
                'target_check_id': 'test_regression.Checks.test_value'}
        with TestClient(create_app(self.service, settings, self.authenticator), base_url='https://mend.test') as client:
            client.cookies.update(self.client.cookies)
            with patch.object(self.store, 'call', side_effect=AssertionError('Database hold reached transport')):
                identifier = str(uuid.uuid4())
                for method, path in [('POST', '/api/tasks'), ('PATCH', f'/api/tasks/{identifier}/contract'),
                                     ('POST', f'/api/tasks/{identifier}/start'), ('POST', f'/api/tasks/{identifier}/cancel')]:
                    response = client.request(method, path, headers=self.headers, json={})
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json()['error']['code'], 'database_write_hold')
                prepared = client.post('/api/bug-cases/prepare', headers=self.headers, json=body)
                self.assertEqual(prepared.status_code, 200)
                self.assertEqual(prepared.json(), prepare_bug_case(**body))
                self.assertEqual(client.get('/api/session').status_code, 200)
                logout = client.delete('/api/session', headers=self.headers)
                self.assertEqual(logout.status_code, 200)
                self.assertEqual(client.get('/api/session').status_code, 401)

    def test_bug_contract_preparation_requires_csrf_and_has_no_worker_or_store_side_effect(self):
        intake = {"kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py",
                  "original_source": "def value(): return 0\n", "reported_error": "Wrong value",
                  "expected_behavior": "Return one",
                  "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}}
        body = {"intake": intake, "protected_test_source": "# proposed checks\n",
                "required_check_ids": ["test_regression.Checks.test_value"],
                "target_check_id": "test_regression.Checks.test_value"}
        with patch.object(self.service, 'create', side_effect=AssertionError('No persisted task')):
            response = self.client.post('/api/bug-cases/prepare', headers=self.headers, json=body)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertFalse(result['execution_enabled'])
        self.assertEqual(result['approval_status'], 'not_approved')
        self.assertIn('protected_files', result['contract'])
        self.assertEqual(result['intake'], intake)
        rejected = self.client.post('/api/bug-cases/prepare', headers={'Origin': 'https://mend.test'}, json=body)
        self.assertEqual(rejected.status_code, 403)
        body['intake']['evidence']['execution'] = 'passed'
        rejected = self.client.post('/api/bug-cases/prepare', headers=self.headers, json=body)
        self.assertEqual(rejected.status_code, 400)

    def test_http_to_store_repair_receipt_and_sse_roundtrip(self):
        response = self.client.post("/api/tasks", headers=self.headers, json={"prompt": "Clean CSV rows"})
        self.assertEqual(response.status_code, 201)
        task = response.json()
        identifier = task["id"]
        response = self.client.patch(f"/api/tasks/{identifier}/contract", headers=self.headers,
            json={"expected_version": task["contract_version"], "contract": None})
        self.assertEqual(response.status_code, 200)
        task = response.json()
        response = self.client.post(f"/api/tasks/{identifier}/start", headers=self.headers,
                                   json={"expected_version": task["contract_version"]})
        self.assertEqual(response.status_code, 202)
        asyncio.run(self.service.run_task(identifier))
        receipt = self.client.get(f"/api/tasks/{identifier}/receipt")
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt.json()["source"], "local_test")
        self.assertIs(receipt.json()["live_verification"], False)
        stream = self.client.get(f"/api/tasks/{identifier}/events")
        self.assertEqual(stream.status_code, 200)
        self.assertIn("event: receipt\n", stream.text)
        self.assertGreaterEqual(len(self.auth_requests), 6)
        self.assertEqual(self.client.get("/readyz").status_code, 503)

    def test_real_http_rejects_csrf_wrong_origin_and_oversized_prompt(self):
        self.assertEqual(self.client.post("/api/tasks", headers={"Origin": "https://mend.test"},
            json={"prompt": "Clean CSV rows"}).status_code, 403)
        headers = {**self.headers, "Origin": "https://untrusted.test"}
        self.assertEqual(self.client.post("/api/tasks", headers=headers,
            json={"prompt": "Clean CSV rows"}).status_code, 403)
        response = self.client.post("/api/tasks", headers=self.headers, json={"prompt": "a" * 8001})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_prompt")

    def test_real_http_rejects_overflowing_numeric_json(self):
        response = self.client.post('/api/tasks', headers={**self.headers, 'Content-Type': 'application/json'},
                                    content=b'{"prompt":1e999}')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_json')

    def test_real_http_expired_during_identity_verification_is_unauthenticated(self):
        from mend.auth import SESSION_COOKIE
        issued = self.authenticator.codec.open(self.client.cookies.get(SESSION_COOKIE))
        now = [issued.expires_at - 1]
        self.authenticator.codec.clock = lambda: now[0]
        async def late_identity(*args, **kwargs):
            now[0] = issued.expires_at
            return {'id': self.user}
        with patch.object(self.authenticator.transport, 'request', side_effect=late_identity) as request:
            response = self.client.get('/api/session')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'unauthenticated')
        self.assertEqual(request.await_count, 1)
        self.assertEqual(self.authenticator.codec.lifetime, 900)

    def test_real_http_unexpected_errors_keep_security_and_strict_cors_headers(self):
        from fastapi.testclient import TestClient
        from mend.config import Settings
        expected_headers = {
            'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        }
        with TestClient(self.client.app, base_url='https://mend.test',
                        raise_server_exceptions=False) as client:
            for origin in ('https://mend.test', 'https://untrusted.test', None):
                with self.subTest(origin=origin), patch.object(Settings, 'live_blockers',
                        side_effect=RuntimeError('fixture-private-provider-body')):
                    response = client.get('/readyz', headers={'Origin': origin} if origin else {})
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json(), {'error': {'code': 'internal_error',
                    'message': 'The request could not be completed.'}})
                self.assertNotIn('fixture-private', response.text)
                for name, expected in expected_headers.items():
                    self.assertEqual(response.headers.get(name), expected)
                if origin == 'https://mend.test':
                    self.assertEqual(response.headers.get('access-control-allow-origin'), origin)
                    self.assertEqual(response.headers.get('access-control-allow-credentials'), 'true')
                    self.assertIn('Origin', response.headers.get('vary', ''))
                else:
                    self.assertIsNone(response.headers.get('access-control-allow-origin'))
                    self.assertIsNone(response.headers.get('access-control-allow-credentials'))
