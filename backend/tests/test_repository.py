"""Real stdlib adapter tests; SQL checks here are structural, not database execution."""
import io
import json
import os
import shutil
import subprocess
from pathlib import Path
import unittest
import urllib.error

from mend.domain import MendError
from mend.repository import SupabaseRepository, ACTIONS, MAX_RESPONSE_BYTES


class Response(io.BytesIO):
    status = 200


class RepositoryTests(unittest.TestCase):
    def test_exact_rpc_headers_and_envelope(self):
        seen = []
        def open_request(request, timeout):
            seen.append((request, timeout))
            return Response(b'{"claimed":true}')
        repo = SupabaseRepository('https://example.supabase.co', 'test-server-only', opener=open_request)
        self.assertEqual(repo.call('claim_worker', {'task_id': 't'}), {'claimed': True})
        req, timeout = seen[0]
        self.assertEqual(req.full_url, 'https://example.supabase.co/rest/v1/rpc/mend_command')
        self.assertEqual(req.method, 'POST')
        self.assertEqual(timeout, 10)
        self.assertEqual(req.get_header('Authorization'), 'Bearer test-server-only')
        self.assertEqual(json.loads(req.data), {'p_action': 'claim_worker', 'p_payload': {'task_id': 't'}})

    def test_redirect_prone_or_non_origin_config_rejected(self):
        for url in ('http://example.com', 'https://secret@example.com',
                    'https://example.com/rest', 'https://example.com?secret=x', '//example.com',
                    'https://example.com:bad', 'https://example.com:99999',
                    'https://example.com:444', 'https://example.com\t'):
            with self.subTest(url=url), self.assertRaises(MendError):
                SupabaseRepository(url, 'test')
        with self.assertRaises(MendError):
            SupabaseRepository('https://example.com', 'test\nheader')

    def test_invalid_command_and_nan_never_call_network(self):
        def unexpected(*args, **kwargs):
            self.fail('invalid payload reached network')
        repo = SupabaseRepository('https://example.com', 'test', opener=unexpected)
        for action, payload in [('delete_all', {}), ('usage', {'cost': float('nan')}), ('get_task', [])]:
            with self.assertRaises(MendError):
                repo.call(action, payload)

    def test_response_bounded_and_closed(self):
        response = Response(b' ' * (MAX_RESPONSE_BYTES + 1))
        repo = SupabaseRepository('https://example.com', 'test', opener=lambda *a, **k: response)
        with self.assertRaises(MendError) as raised:
            repo.call('pending', {})
        self.assertEqual(raised.exception.code, 'database_response_limit')
        self.assertTrue(response.closed)

    def test_safe_http_failure_maps_code_not_private_detail(self):
        def denied(*args, **kwargs):
            raise urllib.error.HTTPError('https://private.example', 400, 'secret', {},
                io.BytesIO(b'{"code":"M4091","message":"secret key and SQL detail"}'))
        repo = SupabaseRepository('https://example.com', 'test', opener=denied)
        with self.assertRaises(MendError) as raised:
            repo.call('dispatch', {})
        self.assertEqual(raised.exception.status, 409)
        self.assertNotIn('secret', str(raised.exception))
        self.assertNotIn('private.example', str(raised.exception))

    def test_transport_failure_not_retried_after_ambiguous_commit(self):
        seen = []
        def timeout(*args, **kwargs):
            seen.append(1)
            raise TimeoutError('sensitive provider traceback')
        repo = SupabaseRepository('https://example.com', 'test', opener=timeout)
        with self.assertRaises(MendError) as raised:
            repo.call('dispatch', {})
        self.assertEqual(len(seen), 1)
        self.assertIn('reconcile', str(raised.exception))
        self.assertNotIn('sensitive', str(raised.exception))

    def test_non_object_response_rejected(self):
        for data in (b'null', b'"secret"', b'not json'):
            repo = SupabaseRepository('https://example.com', 'test', opener=lambda *a, **k: Response(data))
            with self.assertRaises(MendError):
                repo.call('pending', {})

    def test_strict_response_numbers_and_duplicate_fields(self):
        for data in (b'{"cost":NaN}', b'{"cost":Infinity}', b'{"cost":1e10000}',
                     b'{"nested":[{"cost":-1e10000}]}', b'{"a":1,"a":2}'):
            with self.subTest(data=data):
                repo = SupabaseRepository('https://example.com', 'test',
                                          opener=lambda *a, **k: Response(data))
                with self.assertRaises(MendError) as raised:
                    repo.call('pending', {})
                self.assertEqual(raised.exception.code, 'database_response')

    def test_duplicate_error_code_cannot_choose_error_mapping(self):
        def malformed(*a, **k):
            raise urllib.error.HTTPError('https://example.com', 400, 'private detail', {},
                io.BytesIO(b'{"code":"M4031","code":"M4001"}'))
        repo = SupabaseRepository('https://example.com', 'test', opener=malformed)
        with self.assertRaises(MendError) as raised:
            repo.call('get_task', {})
        self.assertEqual(raised.exception.code, 'database_unavailable')
        self.assertNotIn('private detail', str(raised.exception))

    def test_provider_stream_attribution_wire_and_sql_allowlist(self):
        sent = []
        def open_request(request, timeout):
            sent.append(json.loads(request.data))
            return Response(b'{"sequence":8}')
        repo = SupabaseRepository('https://example.com', 'test', opener=open_request)
        payload = {'task_id':'task','attempt_id':'attempt','worker_id':'worker',
                   'stream':'stdout','message':'combined CLI output','provider_stream':'unattributed'}
        self.assertEqual(repo.call('output',payload),{'sequence':8})
        self.assertEqual(sent[0]['p_payload']['provider_stream'],'unattributed')
        sql = Path('migrations/002_backend_rpc.sql').read_text()
        self.assertIn("p_provider_stream NOT IN ('unattributed','stdout','stderr')", sql)
        self.assertIn("jsonb_build_object('provider_stream',p_provider_stream)", sql)
        self.assertIn("jsonb_build_object('provider_stream',p_payload->>'provider_stream')", sql)
        self.assertIn("kept,body) RETURNING sequence", sql)
        self.assertIn("'Output truncated after 256 KB.',true,body) RETURNING sequence", sql)
        self.assertIn('REVOKE ALL ON FUNCTION mend_private.append_output', sql)

    def test_retention_truncation_and_exact_report_sql_guards(self):
        sql = Path('migrations/002_backend_rpc.sql').read_text()
        self.assertIn("clock_timestamp()+interval '10 minutes'>t.expires_at", sql)
        self.assertIn("t.expires_at<=clock_timestamp() OR t.cancel_requested_at", sql)
        self.assertIn("p_action='deadline_cancel' AND p_payload->>'attempt_id' IS NULL", sql)
        self.assertIn("WHEN t.expires_at<=clock_timestamp() THEN 'retention_expired'", sql)
        for identity in ('source', 'task_id', 'model_id', 'image_digest'):
            self.assertIn("a.runner_report->>'" + identity + "' IS DISTINCT FROM", sql)
        self.assertIn("a.runner_report->'complete' IS DISTINCT FROM 'true'::jsonb", sql)
        self.assertIn("p_payload->'truncated'='true'::jsonb", sql)
        self.assertIn("IF a.log_truncated THEN RETURN", sql)
        self.assertIn("'system','Output truncated after 256 KB.',true", sql)
        self.assertIn("payload->>'diagnostic_code'=p_payload->>'diagnostic_code'", sql)
        # Finalization mutations still require the ordinary worker fence.
        self.assertLess(sql.index('t.lease_owner IS DISTINCT FROM worker_uuid'),
                        sql.index("ELSIF p_action='finalize' THEN"))

    def test_rpc_migration_action_coverage_and_privilege_fences(self):
        sql = Path('migrations/002_backend_rpc.sql').read_text()
        for action in ACTIONS:
            self.assertIn("'" + action + "'", sql)
        self.assertIn('SET search_path = \'\'', sql)
        self.assertIn("t.lease_owner IS DISTINCT FROM worker_uuid", sql)
        self.assertIn('REVOKE UPDATE(prompt,contract', sql)
        self.assertIn('REVOKE SELECT ON public.tasks FROM authenticated', sql)
        self.assertIn('FROM PUBLIC, anon, authenticated', sql)
        self.assertIn('TO service_role', sql)
        self.assertIn("'new_dispatch',false", sql)
        self.assertIn("'new_dispatch',true", sql)
        self.assertIn("coalesce(result->>'check_id',result->>'id')", sql)
        self.assertIn("coalesce(command->>'command_id',command->>'id')", sql)
        self.assertIn("'cancel_requested',false", sql)
        self.assertIn('a.id AS attempt_id', sql)
        self.assertIn("command ? 'status' AND command->>'status'", sql)
        self.assertIn("frozen->'argv' IS NOT DISTINCT FROM command->'argv'", sql)

    def test_inherited_guard_rules_retained(self):
        sql = Path('migrations/001_mend.sql').read_text()
        for invariant in ('task_one_unresolved_attempt', 'cancelled task cannot pass',
                          'persist finalizing before receipt', 'two active tasks per user',
                          'job deadline cannot reset', 'required command missing',
                          'cancellation acknowledgement is not provider stop confirmation'):
            self.assertIn(invariant, sql)


# Transactional fixtures for an isolated, migrated Supabase-compatible PostgreSQL.
# Synthetic provider identities here are test evidence, never live release evidence.
DATABASE_FIXTURE = r"""
BEGIN;
DO $fixture$
DECLARE owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
 task_json jsonb; task_id uuid; fixture_attempt uuid; worker uuid:=gen_random_uuid(); result jsonb;
BEGIN
 INSERT INTO auth.users(id,email) VALUES (owner_a,owner_a::text||'@mend-fixture.invalid'),
  (owner_b,owner_b::text||'@mend-fixture.invalid');
 UPDATE mend_private.release_gate SET live_execution_enabled=false WHERE singleton;
 task_json:=public.mend_command('create_task',jsonb_build_object('user_id',owner_a,
  'prompt','fixture task','idempotency_key','fixture-1'));
 task_id:=(task_json->>'id')::uuid;
 IF task_json ? 'lease_owner' THEN RAISE EXCEPTION 'worker lease leaked'; END IF;
 result:=public.mend_command('create_task',jsonb_build_object('user_id',owner_a,
  'prompt','fixture task','idempotency_key','fixture-1'));
 IF result->>'id'<>task_id::text THEN RAISE EXCEPTION 'idempotency failed'; END IF;
 BEGIN
  PERFORM public.mend_command('get_task',jsonb_build_object('task_id',task_id,'user_id',owner_b));
  RAISE EXCEPTION 'ownership bypassed';
 EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
 result:=public.mend_command('propose_contract',jsonb_build_object('task_id',task_id,
  'user_id',owner_a,'expected_version',1,'contract',jsonb_build_object(
   'required_check_ids',jsonb_build_array('fixture-check'),
   'required_command_ids',jsonb_build_array('fixture-command'))));
 BEGIN
  PERFORM public.mend_command('start_task',jsonb_build_object('task_id',task_id,
   'user_id',owner_a,'expected_version',2,'contract_sha256',repeat('a',64),
   'protected_checks_sha256',repeat('b',64)));
  RAISE EXCEPTION 'release gate bypassed';
 EXCEPTION WHEN SQLSTATE 'M4121' THEN NULL; END;
 UPDATE mend_private.release_gate SET live_execution_enabled=true,monetary_cap=100,
  evidence_reference='fixture only: rolled back, not release evidence' WHERE singleton;
 result:=public.mend_command('start_task',jsonb_build_object('task_id',task_id,
  'user_id',owner_a,'expected_version',2,'contract_sha256',repeat('a',64),
  'protected_checks_sha256',repeat('b',64)));
 BEGIN
  PERFORM public.mend_command('usage',jsonb_build_object('task_id',task_id,
   'worker_id',gen_random_uuid(),'token_count',1,'cost',0));
  RAISE EXCEPTION 'unowned lease accepted';
 EXCEPTION WHEN SQLSTATE 'M4091' THEN NULL; END;
 result:=public.mend_command('claim_worker',jsonb_build_object('task_id',task_id,'worker_id',worker));
 IF result->>'claimed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'claim failed'; END IF;
 result:=public.mend_command('reserve_attempt',jsonb_build_object('task_id',task_id,'worker_id',worker,
  'submission_key','fixture-attempt-'||task_id::text,'model_id','nvidia/nemotron-3-super-120b-a12b',
  'snapshot_sha256',repeat('c',64),'snapshot_storage_key',owner_a::text||'/'||task_id::text||'/snapshots/fixture.zip',
  'source_file_count',1,'source_bytes',100,'image_digest','sha256:'||repeat('d',64)));
 fixture_attempt:=(result->>'id')::uuid;
 result:=public.mend_command('output',jsonb_build_object('task_id',task_id,'attempt_id',fixture_attempt,
  'worker_id',worker,'stream','stdout','message','fixture diagnostic','provider_stream','unattributed'));
 result:=public.mend_command('output',jsonb_build_object('task_id',task_id,'attempt_id',fixture_attempt,
  'worker_id',worker,'stream','system','truncated',true,'message','caller text must never appear',
  'provider_stream','unattributed'));
 result:=public.mend_command('output',jsonb_build_object('task_id',task_id,'attempt_id',fixture_attempt,
  'worker_id',worker,'stream','system','truncated',true,'message','caller text must never appear',
  'provider_stream','unattributed'));
 IF (SELECT count(*) FROM public.logs l WHERE l.attempt_id=fixture_attempt AND truncated)=0 THEN
  RAISE EXCEPTION 'truncation marker missing'; END IF;
 IF result->'sequence' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION 'truncation marker duplicated'; END IF;
 IF (SELECT count(*) FROM public.logs l WHERE l.attempt_id=fixture_attempt AND
  l.payload->>'provider_stream'='unattributed')<>2 THEN
  RAISE EXCEPTION 'provider stream provenance missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.logs WHERE message='caller text must never appear') THEN
  RAISE EXCEPTION 'candidate source substituted for trusted marker'; END IF;
 PERFORM public.mend_command('usage',jsonb_build_object('task_id',task_id,
  'worker_id',worker,'token_count',30000,'cost',1));
 BEGIN
  PERFORM public.mend_command('usage',jsonb_build_object('task_id',task_id,
   'worker_id',worker,'token_count',1,'cost',0));
  RAISE EXCEPTION 'token cap exceeded';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM public.mend_command('request_cancel',jsonb_build_object('task_id',task_id,
  'user_id',owner_a,'reason','user_cancelled'));
 BEGIN
  PERFORM public.mend_command('set_state',jsonb_build_object('task_id',task_id,
   'worker_id',worker,'status','finalizing'));
  RAISE EXCEPTION 'cancellation overwritten';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='cancellation overwritten' THEN RAISE; END IF;
 END;
 PERFORM public.mend_command('resolve_attempt',jsonb_build_object('task_id',task_id,
  'attempt_id',fixture_attempt,'worker_id',worker,'status','cancelled',
  'resolution_evidence',jsonb_build_object('kind','never_dispatched','reference','fixture:dispatch-null')));
 PERFORM public.mend_command('finish_stop',jsonb_build_object('task_id',task_id,
  'worker_id',worker,'reason','user_cancelled'));
 result:=public.mend_command('events',jsonb_build_object('task_id',task_id,'user_id',owner_a));
 IF jsonb_array_length(result)<5 THEN RAISE EXCEPTION 'events missing'; END IF;
 IF has_column_privilege('service_role','public.tasks','status','UPDATE') THEN
  RAISE EXCEPTION 'unfenced mutation grant retained'; END IF;
 IF has_column_privilege('authenticated','public.tasks','lease_owner','SELECT') THEN
  RAISE EXCEPTION 'lease token readable'; END IF;
END $fixture$;
ROLLBACK;
"""


class DatabaseExecutionTests(unittest.TestCase):
    def test_transactional_database_fixture(self):
        fixture_env = getattr(self, 'fixture_environment', os.environ)
        dsn = fixture_env.get('MEND_TEST_DATABASE_DSN', '')
        if not dsn.strip():
            self.skipTest('No isolated PostgreSQL DSN; migration execution pending.')
        self.assertTrue(fixture_env.get('MEND_TEST_DATABASE_ISOLATED') == '1',
                        'Database fixture requires explicit isolated test environment opt-in.')
        psql = getattr(self, 'fixture_psql', None) or shutil.which(
            'psql', path=fixture_env.get('PATH', os.defpath))
        self.assertTrue(psql, 'Database fixture requires genuine psql; runtime unavailable.')
        # PSQL receives the DSN through environment, not process args or printed logs.
        env = dict(fixture_env, PGDATABASE=dsn, PGCONNECT_TIMEOUT='5',
                   PGOPTIONS='-c statement_timeout=25000 -c lock_timeout=5000')
        result = None
        try:
            result = subprocess.run([psql, '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
                                    input=DATABASE_FIXTURE, text=True, capture_output=True,
                                    env=env, timeout=30)
        except (OSError, subprocess.TimeoutExpired, UnicodeError):
            pass
        # Raise outside the except block so private exception context is not
        # chained into unittest output, including captured connection failures.
        if result is None:
            self.fail('Database fixture unavailable or timed out; inspect private DB logs.')
        self.assertEqual(result.returncode, 0, 'Database fixture failed; inspect private DB logs.')


if __name__ == '__main__':
    unittest.main()
