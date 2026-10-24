"""Explicit local HTTP-chain fixture. Never an application deployment entry point."""
import base64
import os

from mend.api import create_app
from mend.auth import SupabaseAuthenticator
from mend.config import Settings
from mend.service import TaskService


def create_fixture():
    if os.environ.get('MEND_HTTP_CHAIN_FIXTURE') != '1':
        raise RuntimeError('HTTP fixture requires explicit test opt-in')

    class IdentityFixture:
        async def request(self, method, url, **kwargs):
            if (method != 'GET' or url != 'https://supabase.fixture.test/auth/v1/user'
                    or kwargs['headers']['Authorization'] != 'Bearer fixture-access-token'):
                raise AssertionError('Unexpected fixture identity request')
            return {'id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}

    class NoDatabase:
        def call(self, *args, **kwargs):
            raise AssertionError('HTTP fixture must not access a database')

    class LedgerFixture:
        def list_receipts(self, user_id, team_id, *, limit, cursor):
            from mend.domain import MendError
            if user_id != 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' or team_id != 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':
                raise MendError('not_found', 'Team is unavailable.', 404)
            return {'receipts': [], 'next_cursor': None}
        def share(self, *args):
            raise AssertionError('Held ledger writes reached transport')
        unshare = share

    settings = Settings(mode='database_only', public_origin='https://mend-chain.test',
                        allowed_origins=('https://mend-chain.test',),
                        supabase_url='https://supabase.fixture.test',
                        supabase_service_role_key='fixture-only-key',
                        session_seal_key=base64.urlsafe_b64encode(b'f' * 32).decode())
    return create_app(TaskService(NoDatabase(), None, None, None, {'live_enabled': False}),
                      settings, SupabaseAuthenticator(settings, IdentityFixture()), team_ledger=LedgerFixture())
