"""Scheduler payload regressions using explicitly local fixture adapters."""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
from pathlib import Path
import unittest
import uuid
from datetime import datetime, timezone

from mend.domain import canonical_json, curated_contract, initial_files, protected_checks_sha256, source_sha256
from mend.fakes import FixtureModel, FixtureRunner
from mend.local_store import LocalTestStore
from mend.repository import SupabaseRepository, MAX_RESPONSE_BYTES


def wire_bytes(value):
    return json.dumps(value,separators=(',',':'),allow_nan=False).encode('utf-8')


async def populate_pending_fixture(store, count=20, diagnostic_bytes=60000):
    """Create real local-store transitions; fake runners never execute programs."""
    identifiers = []
    for index in range(count):
        owner, worker = str(uuid.uuid4()), str(uuid.uuid4())
        task = store.call('create_task', {'user_id':owner,'prompt':'Clean CSV rows',
                                        'idempotency_key':'scheduler-fixture-'+str(index)})
        contract = curated_contract()
        task = store.call('propose_contract', {'task_id':task['id'],'user_id':owner,
                         'expected_version':task['contract_version'],'contract':contract})
        task = store.call('start_task', {'task_id':task['id'],'user_id':owner,
                         'expected_version':task['contract_version'],
                         'contract_sha256':hashlib.sha256(canonical_json(contract)).hexdigest(),
                         'protected_checks_sha256':protected_checks_sha256(contract)})
        store.call('claim_worker', {'task_id':task['id'],'worker_id':worker,'seconds':30})
        def action(name, **fields):
            return store.call(name, dict(task_id=task['id'],worker_id=worker,**fields))
        model, runner = FixtureModel(), FixtureRunner(clock=store.clock)
        files, diagnostics = initial_files(contract), None
        for ordinal in (1, 2):
            if ordinal == 2:
                action('reserve_repair')
            generated = await model.generate(contract, task['prompt'], files, diagnostics=diagnostics)
            files.update(generated['files'])
            attempt = action('reserve_attempt', submission_key=str(uuid.uuid4()),
                             model_id=generated['model_id'],model_request_id=generated['model_request_id'],
                             snapshot_sha256=source_sha256(files),
                             snapshot_storage_key=owner+'/'+task['id']+'/snapshots/'+str(ordinal)+'.zip',
                             image_digest=runner.image_digest)
            action('set_state',status='waiting_runner')
            attempt = action('dispatch',attempt_id=attempt['id'])
            job_id = await runner.submit(task,attempt,files,contract)
            attempt = action('attach_job',attempt_id=attempt['id'],job_id=job_id)
            action('set_state',status='running')
            evidence = await runner.observe(job_id)
            # A bounded structured diagnostic is permitted by the report format.
            evidence['runner_report']['fixture_diagnostic'] = 'x'*diagnostic_bytes
            report_size = len(canonical_json(evidence['runner_report']))
            if report_size>65536:
                raise AssertionError('Fixture exceeds the real 64KiB report limit.')
            diagnostics = evidence['runner_report']
            action('resolve_attempt',attempt_id=attempt['id'],**evidence,
                   failure_signature='fixture-empty-input' if ordinal==1 else None,
                   diagnostic_evidence_sha256=hashlib.sha256(canonical_json(diagnostics)).hexdigest())
        action('set_state',status='finalizing')
        identifiers.append(task['id'])
    return identifiers


class PendingDispatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.store = LocalTestStore(clock=lambda:datetime(2026,10,13,tzinfo=timezone.utc))

    def tearDown(self):
        self.store.close()

    async def test_large_valid_histories_do_not_overflow_scheduler_response(self):
        ids = await populate_pending_fixture(self.store)
        # Full task views remain available by owned reads, not polling payloads.
        full = [task for task in self.store._all() if task['id'] in ids]
        self.assertGreater(len(wire_bytes(full)),MAX_RESPONSE_BYTES)
        pending = self.store.call('pending',{'limit':20})
        self.assertEqual({item['id'] for item in pending},set(ids))
        self.assertTrue(all(set(item)=={'id','status','created_at'} for item in pending))
        self.assertLess(len(wire_bytes(pending)),MAX_RESPONSE_BYTES)
        class Response(io.BytesIO):
            status=200
        repo = SupabaseRepository('https://example.supabase.co','local-test-server-key',
                  opener=lambda *a,**k:Response(wire_bytes(pending)))
        self.assertEqual(repo.call('pending',{'limit':20}),pending)
        self.assertEqual(len(full[0]['attempts']),2)
        self.assertEqual(full[0]['attempts'][-1]['status'],'passed')
        self.assertIsNone(full[0]['receipt'])
        self.assertIs(full[0]['live_verification'],False)

    async def test_limit_order_exclusions_and_cancelled_draft(self):
        # Source order is oldest created_at, then id to break timestamp ties.
        store = self.store
        owners = [str(uuid.uuid4()) for _ in range(4)]
        for index, status in enumerate(('draft','ready','stopping','stopped')):
            task = store.call('create_task', {'user_id':owners[index],'prompt':status,'idempotency_key':status})
            if status=='ready':
                store.call('propose_contract', {'task_id':task['id'],'user_id':owners[index],
                           'expected_version':1,'contract':curated_contract()})
            if status in ('stopping','stopped'):
                store.call('request_cancel', {'task_id':task['id'],'user_id':owners[index],'reason':'user_cancelled'})
                if status=='stopped':
                    worker=str(uuid.uuid4())
                    store.call('claim_worker', {'task_id':task['id'],'worker_id':worker})
                    store.call('finish_stop', {'task_id':task['id'],'worker_id':worker,'reason':'user_cancelled'})
        more = await populate_pending_fixture(store,count=3,diagnostic_bytes=0)
        all_pending = store.call('pending', {'limit':100})
        self.assertEqual(len(all_pending),4)
        self.assertEqual([x['status'] for x in all_pending].count('stopping'),1)
        self.assertEqual(all_pending,sorted(all_pending,key=lambda x:(x['created_at'],x['id'])))
        self.assertEqual(store.call('pending',{'limit':2}),all_pending[:2])
        self.assertTrue(set(more)<={x['id'] for x in all_pending})

    def test_sql_pending_is_compact_and_preserves_action_boundaries(self):
        sql=Path('migrations/002_backend_rpc.sql').read_text()
        branch=sql.split("ELSIF p_action='pending' THEN",1)[1].split('RETURN result;',1)[0]
        self.assertNotIn('task_view',branch)
        self.assertIn('jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id)',branch)
        self.assertIn('SELECT id,status,created_at FROM public.tasks',branch)
        self.assertIn('ORDER BY created_at,id LIMIT n',branch)
        self.assertIn("'writing','waiting_runner','running','fixing','finalizing','stopping'",branch)
        self.assertNotIn("'draft'",branch)
        self.assertNotIn("'ready'",branch)


if __name__=='__main__':
    unittest.main()
