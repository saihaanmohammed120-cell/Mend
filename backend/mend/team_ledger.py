"""Explicit team sharing of persisted receipts, through the service-only RPC."""
from __future__ import annotations

import json
import re
from datetime import datetime
from uuid import UUID

from mend.domain import MendError
from mend.repository import SupabaseRepository

MAX_PAGE_SIZE = 100
MAX_CURSOR = 9_223_372_036_854_775_807
SUMMARY_FIELDS = frozenset({
    'receipt_id', 'task_id', 'source', 'status', 'contract_sha256',
    'snapshot_sha256', 'attempts', 'repair_count', 'duration_ms',
    'created_at', 'shared_at',
})


def _uuid(value: str) -> str:
    if not isinstance(value, str) or len(value) != 36:
        raise MendError('invalid_command', 'A canonical UUID is required.')
    try:
        if str(UUID(value)) == value:
            return value
    except ValueError:
        pass
    raise MendError('invalid_command', 'A canonical UUID is required.')


def _cursor(value: str | None) -> str | None:
    if value is None:
        return None
    if (not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,18}', value)
            or int(value) > MAX_CURSOR):
        raise MendError('invalid_command', 'Invalid ledger cursor.')
    return value


def _response_error() -> MendError:
    return MendError('database_response', 'Database returned an invalid ledger response.', 502)


def _summary(row: dict) -> dict:
    if not isinstance(row, dict) or set(row) != SUMMARY_FIELDS:
        raise _response_error()
    try:
        _uuid(row['receipt_id'])
        _uuid(row['task_id'])
        for field in ('created_at', 'shared_at'):
            value = row[field]
            if not isinstance(value, str) or len(value) > 40:
                raise ValueError
            if datetime.fromisoformat(value.replace('Z', '+00:00')).utcoffset() is None:
                raise ValueError
        if row['source'] != 'live' or row['status'] != 'passed':
            raise ValueError
        for field in ('contract_sha256', 'snapshot_sha256'):
            if not isinstance(row[field], str) or not re.fullmatch(r'[0-9a-f]{64}', row[field]):
                raise ValueError
        for field, minimum, maximum in (
                ('attempts', 1, 4), ('repair_count', 0, 3), ('duration_ms', 0, MAX_CURSOR)):
            if type(row[field]) is not int or not minimum <= row[field] <= maximum:
                raise ValueError
        if row['attempts'] > row['repair_count'] + 1:
            raise ValueError
    except (ValueError, MendError):
        raise _response_error() from None
    return dict(row)


class TeamLedger:
    """The caller supplies only a server-verified user identity, never a body claim.

    Reuse the repository's timeout, redirect rejection, response cap, safe errors
    and no-retry semantics. Membership and ownership stay authoritative in SQL.
    """

    def __init__(self, repository: SupabaseRepository):
        self.repository = repository

    def _call(self, action: str, payload: dict) -> dict:
        if action != 'list' and self.repository.read_only:
            raise MendError('database_write_hold', 'Database changes are on hold.', 503)
        data = json.dumps({'p_action': action, 'p_payload': payload},
                          separators=(',', ':'), allow_nan=False).encode('utf-8')
        result = self.repository._post(
            self.repository._url.removesuffix('mend_command') + 'mend_team_ledger', data)
        if not isinstance(result, dict):
            raise _response_error()
        return result

    def list_receipts(self, user_id: str, team_id: str, *, limit: int = 20,
                      cursor: str | None = None) -> dict:
        if type(limit) is not int or not 1 <= limit <= MAX_PAGE_SIZE:
            raise MendError('invalid_command', 'Ledger limit must be 1–100.')
        cursor = _cursor(cursor)
        result = self._call('list', {'user_id': _uuid(user_id), 'team_id': _uuid(team_id),
                                    'limit': limit, 'cursor': cursor})
        if (set(result) != {'receipts', 'next_cursor'}
                or not isinstance(result['receipts'], list)
                or len(result['receipts']) > limit):
            raise _response_error()
        try:
            next_cursor = _cursor(result['next_cursor'])
        except MendError:
            raise _response_error() from None
        if next_cursor is not None and (len(result['receipts']) != limit
                or (cursor is not None and int(next_cursor) >= int(cursor))):
            raise _response_error()
        receipts = [_summary(row) for row in result['receipts']]
        if len({row['receipt_id'] for row in receipts}) != len(receipts):
            raise _response_error()
        return {'receipts': receipts, 'next_cursor': next_cursor}

    def share(self, user_id: str, team_id: str, receipt_id: str) -> dict:
        return self._share('share', user_id, team_id, receipt_id)

    def unshare(self, user_id: str, team_id: str, receipt_id: str) -> dict:
        return self._share('unshare', user_id, team_id, receipt_id)

    def _share(self, action: str, user_id: str, team_id: str, receipt_id: str) -> dict:
        receipt_id = _uuid(receipt_id)
        result = self._call(action, {'user_id': _uuid(user_id), 'team_id': _uuid(team_id),
                                     'receipt_id': receipt_id})
        if (set(result) != {'shared', 'receipt_id'} or result['receipt_id'] != receipt_id
                or result['shared'] is not (action == 'share')):
            raise _response_error()
        return {'shared': result['shared'], 'receipt_id': receipt_id}
