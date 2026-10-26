"""Explicit connectivity-only deployment while credentials and release evidence are pending."""
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api import _SECURITY_HEADERS
from .config import Settings
from .domain import MendError


def create_app_from_env():
    setup = os.environ.get('MEND_SETUP_ONLY', 'false')
    if setup not in ('true', 'false'):
        raise MendError('invalid_configuration', 'Setup-only setting must be true or false.', 503)
    if setup == 'false':
        from .bootstrap import create_app_from_env as create_runtime
        return create_runtime()

    settings = Settings.from_env()
    if settings.mode != 'database_only' or settings.live_enabled or settings.database_writes_enabled:
        raise MendError('invalid_configuration', 'Setup-only requires database-only mode and both holds.', 503)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware('http')
    async def setup_response(request: Request, call_next):
        # Never dispatch auth/tasks, read request bodies, or construct runtime adapters here.
        status = 503
        body = {'error': {'code': 'backend_setup_only',
                          'message': 'Backend setup is incomplete. Sign-in and tasks are unavailable.'}}
        if request.method == 'GET' and request.url.path == '/healthz':
            status, body = 200, {'ok': True, 'mode': 'setup_only'}
        elif request.method == 'GET' and request.url.path == '/readyz':
            body = {'ready': False, 'mode': 'setup_only',
                    'blockers': ['backend_setup_only', 'authentication_unavailable',
                                 'database_not_checked', 'database_write_hold',
                                 'phase_1_release_evidence_required'],
                    'database': {'status': 'not_checked', 'source': 'none', 'release_gate': 'unknown'},
                    'checked_at': datetime.now(timezone.utc).isoformat(),
                    'provider_verification': 'not_established_by_this_endpoint'}
        return JSONResponse(body, status_code=status, headers=_SECURITY_HEADERS)

    return app
