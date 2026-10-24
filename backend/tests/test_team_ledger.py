"""Offline transport/projection checks; SQL assertions are not database evidence."""
import io
import json
from pathlib import Path
import unittest
import urllib.error

from mend.domain import MendError
from mend.repository import SupabaseRepository
from mend.team_ledger import MAX_CURSOR, SUMMARY_FIELDS, TeamLedger

USER = '11111111-1111-4111-8111-111111111111'
TEAM = '22222222-2222-4222-8222-222222222222'
RECEIPT = '33333333-3333-4333-8333-333333333333'
TASK = '44444444-4444-4444-8444-444444444444'


class Response(io.BytesIO):
    status = 200


def summary():
    return dict(receipt_id=RECEIPT, task_id=TASK, source='live', status='passed',
                contract_sha256='a' * 64, snapshot_sha256='b' * 64,
                attempts=1, repair_count=0, duration_ms=10,
                created_at='2026-10-24T10:00:00+00:00',
                shared_at='2026-10-24T10:01:00+00:00')


class TeamLedgerTests(unittest.TestCase):
    def ledger(self, response=None, *, read_only=False, opener=None):
        self.calls = []
        def request(req, timeout):
            self.calls.append((req, timeout))
            return Response(json.dumps(response).encode())
        return TeamLedger(SupabaseRepository('https://example.supabase.co', 'server-fixture',
                          read_only=read_only, opener=opener or request))

    def test_service_transport_and_empty_page_on_write_hold(self):
        expected = {'receipts': [], 'next_cursor': None}
        ledger = self.ledger(expected, read_only=True)
        self.assertEqual(ledger.list_receipts(USER, TEAM), expected)
        req, timeout = self.calls[0]
        self.assertEqual(req.full_url, 'https://example.supabase.co/rest/v1/rpc/mend_team_ledger')
        self.assertEqual(req.get_header('Authorization'), 'Bearer server-fixture')
        self.assertEqual(timeout, 10)
        self.assertEqual(json.loads(req.data), {'p_action': 'list', 'p_payload':
            {'user_id': USER, 'team_id': TEAM, 'limit': 20, 'cursor': None}})

    def test_mutations_never_reach_transport_on_write_hold(self):
        ledger = self.ledger({}, read_only=True)
        for method in (ledger.share, ledger.unshare):
            with self.assertRaises(MendError) as caught:
                method(USER, TEAM, RECEIPT)
            self.assertEqual(caught.exception.code, 'database_write_hold')
        self.assertEqual(self.calls, [])

    def test_invalid_ids_limits_and_cursors_rejected_before_transport(self):
        ledger = self.ledger({})
        for value in (None, '', 'x', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
                      USER.replace('-', ''), [USER], ' ' + USER):
            with self.subTest(value=value), self.assertRaises(MendError):
                ledger.list_receipts(value, TEAM)
        for value in (0, -1, 101, True, 1.5, '20', None):
            with self.subTest(limit=value), self.assertRaises(MendError):
                ledger.list_receipts(USER, TEAM, limit=value)
        for value in ('', '0', '-1', '01', '+1', '1.0', ' 1', '1\n', 1, True,
                      str(MAX_CURSOR + 1), '1' * 10000):
            with self.subTest(cursor=str(value)[:30]), self.assertRaises(MendError):
                ledger.list_receipts(USER, TEAM, cursor=value)
        self.assertEqual(self.calls, [])

    def test_valid_page_has_exact_projection_and_decreasing_cursor(self):
        expected = {'receipts': [summary()], 'next_cursor': '8'}
        ledger = self.ledger(expected)
        self.assertEqual(ledger.list_receipts(USER, TEAM, limit=1, cursor='9'), expected)
        self.assertEqual(set(expected['receipts'][0]), SUMMARY_FIELDS)

    def test_private_fields_wrong_source_and_corrupt_summaries_fail_closed(self):
        for changes in ({'prompt': 'private'}, {'receipt_json': {'private': True}},
                        {'job_id': 'private'}, {'source': 'sample'}, {'status': 'failed'},
                        {'duration_ms': True}, {'attempts': 0}, {'attempts': 4},
                        {'contract_sha256': 'secret'}, {'task_id': 'private'},
                        {'created_at': '2026-10-24T10:00:00'}, {'shared_at': []}):
            row = summary()
            row.update(changes)
            ledger = self.ledger({'receipts': [row], 'next_cursor': None})
            with self.subTest(changes=changes), self.assertRaises(MendError) as caught:
                ledger.list_receipts(USER, TEAM)
            self.assertEqual(caught.exception.status, 502)
            self.assertNotIn('private', str(caught.exception))

    def test_invalid_envelopes_page_sizes_and_cursor_regressions_fail_closed(self):
        for response in ([], {}, {'receipts': [], 'next_cursor': None, 'prompt': 'private'},
                         {'receipts': {}, 'next_cursor': None},
                         {'receipts': [summary(), summary()], 'next_cursor': None},
                         {'receipts': [], 'next_cursor': '8'},
                         {'receipts': [summary()], 'next_cursor': '9'},
                         {'receipts': [summary()], 'next_cursor': '0'}):
            ledger = self.ledger(response)
            with self.subTest(response=response), self.assertRaises(MendError):
                ledger.list_receipts(USER, TEAM, limit=1, cursor='9')
        ledger = self.ledger({'receipts': [summary(), summary()], 'next_cursor': None})
        with self.assertRaises(MendError):
            ledger.list_receipts(USER, TEAM, limit=2)

    def test_share_and_unshare_bind_actual_receipt_identity(self):
        for action in ('share', 'unshare'):
            result = {'shared': action == 'share', 'receipt_id': RECEIPT}
            ledger = self.ledger(result)
            self.assertEqual(getattr(ledger, action)(USER, TEAM, RECEIPT), result)
            self.assertEqual(json.loads(self.calls[0][0].data), {'p_action': action,
                'p_payload': {'user_id': USER, 'team_id': TEAM, 'receipt_id': RECEIPT}})
        for response in ({'shared': True, 'receipt_id': TASK},
                         {'shared': 1, 'receipt_id': RECEIPT},
                         {'shared': False, 'receipt_id': RECEIPT},
                         {'shared': True, 'receipt_id': RECEIPT, 'prompt': 'private'}):
            with self.subTest(response=response), self.assertRaises(MendError):
                self.ledger(response).share(USER, TEAM, RECEIPT)

    def test_membership_or_ownership_denial_uses_safe_existing_transport_error(self):
        calls = []
        def denied(*args, **kwargs):
            calls.append(1)
            raise urllib.error.HTTPError('https://private', 400, 'private SQL', {},
                io.BytesIO(b'{"code":"M4031","message":"private membership"}'))
        ledger = self.ledger(opener=denied)
        for method, arguments in ((ledger.list_receipts, (USER, TEAM)),
                                  (ledger.share, (USER, TEAM, RECEIPT))):
            with self.assertRaises(MendError) as caught:
                method(*arguments)
            self.assertEqual(caught.exception.status, 404)
            self.assertNotIn('private', str(caught.exception))
        self.assertEqual(len(calls), 2)

    def test_sql_source_has_membership_ownership_retention_and_privilege_fences(self):
        sql = (Path(__file__).resolve().parents[1] /
               'migrations/20261024110336_team_receipt_ledger.sql').read_text()
        for fragment in ('ON DELETE CASCADE', 'team_memberships_no_update',
                         'team_receipt_shares_no_update', 'team_receipt_shares_guard',
                         't.user_id=actor', 't.user_id=NEW.shared_by',
                         't.expires_at>statement_timestamp()', 's.id<before_id',
                         "page_limit NOT BETWEEN 1 AND 100", "LIMIT page_limit+1",
                         'FROM PUBLIC,anon,authenticated,service_role',
                         'LANGUAGE sql SECURITY INVOKER', "SET search_path = ''",
                         'GRANT EXECUTE ON FUNCTION public.mend_team_ledger(text,jsonb) TO service_role'):
            self.assertIn(fragment, sql)
        self.assertNotIn('UPDATE mend_private.release_gate', sql)
        self.assertNotIn('GRANT SELECT', sql)
        self.assertNotIn("'receipt_json'", sql)


if __name__ == '__main__':
    unittest.main()
