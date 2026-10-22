"""FastAPI HTTP boundary; provider work remains owned by durable workers."""
from __future__ import annotations

import asyncio
from contextlib import suppress
import json
import math
import time
from .auth import CSRF_COOKIE, SESSION_COOKIE, uuid_string, verify_csrf, verify_origin
from .domain import MendError, public_payload


_SECURITY_HEADERS = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}


def replay_cursor(header, query):
    # Last-Event-ID wins on reconnect; query is for a fresh client's initial replay.
    value = header if header is not None else (query if query is not None else '0')
    if not isinstance(value, str) or not value.isascii() or not value.isdecimal() or len(value) > 19:
        raise MendError('invalid_cursor', 'The replay cursor must be a nonnegative integer.')
    result = int(value)
    if result > 9223372036854775807:
        raise MendError('invalid_cursor', 'The replay cursor is out of range.')
    return result


def event_bytes(event, previous):
    if not isinstance(event, dict):
        raise MendError('invalid_event', 'The stored event is invalid.', 500)
    sequence, event_type = event.get('sequence'), event.get('event_type')
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise MendError('invalid_event', 'The stored event sequence is invalid.', 500)
    if sequence <= previous:
        return None
    if event_type not in ('state', 'log', 'receipt', 'failed', 'stopped'):
        raise MendError('invalid_event', 'The stored event type is invalid.', 500)
    try:
        # SSE is a finite JSON wire payload, not a canonical hash identity.
        # Real monetary usage may contain finite fractional values.
        payload = json.dumps(public_payload(event), ensure_ascii=False, allow_nan=False,
                             sort_keys=True, separators=(',', ':'))
        return f'id: {sequence}\nevent: {event_type}\ndata: {payload}\n\n'.encode('utf-8')
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise MendError('invalid_event', 'The stored event cannot be serialized safely.', 500) from None


async def bounded_json(request, maximum):
    if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
        raise MendError('invalid_content_type', 'JSON content is required.', 415)
    length = request.headers.get('content-length')
    if length is not None:
        try:
            if int(length) < 0 or int(length) > maximum:
                raise ValueError()
        except ValueError:
            raise MendError('body_limit', 'The request body exceeds its limit.', 413) from None
    content = bytearray()
    try:
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                content.extend(chunk)
                if len(content) > maximum:
                    raise MendError('body_limit', 'The request body exceeds its limit.', 413)
    except TimeoutError:
        raise MendError('body_timeout', 'The request body deadline was exceeded.', 408) from None
    try:
        def pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise ValueError()
                result[key] = value
            return result
        def invalid_number(_):
            raise ValueError()
        def finite_float(value):
            parsed = float(value)
            if not math.isfinite(parsed):
                raise ValueError()
            return parsed
        body = json.loads(bytes(content), object_pairs_hook=pairs,
                          parse_constant=invalid_number, parse_float=finite_float)
        if not isinstance(body, dict):
            raise ValueError()
        return body
    except (ValueError, UnicodeError, RecursionError):
        raise MendError('invalid_json', 'A finite JSON object with unique keys is required.') from None


def exact_fields(body, required, optional=()):
    if not set(required) <= body.keys() or not body.keys() <= set(required) | set(optional):
        raise MendError('invalid_request', 'The request fields are invalid.')


def version(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 2147483647:
        raise MendError('invalid_version', 'A positive contract version is required.')
    return value


def idempotency(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 128 or not all(33 <= ord(c) <= 126 for c in value):
        raise MendError('invalid_idempotency_key', 'A bounded Idempotency-Key header is required.')
    return value


async def sse_stream(service, task_id, identity, request, after, heartbeat_seconds=15.0, clock=time.time):
    iterator = service.events(task_id, identity.user_id, after=after).__aiter__()
    pending = None
    last = after
    try:
        while clock() < identity.expires_at and not await request.is_disconnected():
            if pending is None:
                pending = asyncio.create_task(iterator.__anext__())
            remaining = max(0.01, identity.expires_at - clock())
            done, _ = await asyncio.wait({pending}, timeout=min(heartbeat_seconds, remaining))
            # Authorization and connection state may change while awaiting logs.
            if clock() >= identity.expires_at or await request.is_disconnected():
                return
            if not done:
                yield b': keepalive\n\n'
                continue
            try:
                event = pending.result()
            except StopAsyncIteration:
                return
            pending = None
            encoded = event_bytes(event, last)
            if clock() >= identity.expires_at:
                return
            if encoded is not None:
                last = event['sequence']
                yield encoded
    finally:
        if pending is not None:
            pending.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await pending
        close = getattr(iterator, 'aclose', None)
        if close:
            await close()


def create_app(service, settings, authenticator):
    """Instantiate only with genuine FastAPI dependencies and explicit adapters."""
    from fastapi import FastAPI, Request
    from fastapi.exceptions import RequestValidationError
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, StreamingResponse
    from starlette.exceptions import HTTPException

    settings.validate_auth()
    app = FastAPI(title='Mend', version='0.1.0', docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'],
                       allow_headers=['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'Last-Event-ID', 'Authorization'])

    @app.middleware('http')
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.update(_SECURITY_HEADERS)
        return response

    @app.exception_handler(MendError)
    async def safe_error(request, error):
        return JSONResponse({'error': {'code': error.code, 'message': error.message}}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse({'error': {'code': 'invalid_request', 'message': 'Request parameters are invalid.'}}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return JSONResponse({'error': {'code': 'http_error', 'message': 'The request could not be completed.'}}, status_code=error.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error(request, error):
        # Framework server errors are handled outside user middleware, so its
        # cache/security/CORS headers cannot be assumed on this response.
        headers = dict(_SECURITY_HEADERS)
        origin = request.headers.get('origin')
        if origin in settings.allowed_origins:
            headers.update({'Access-Control-Allow-Origin': origin,
                            'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin'})
        return JSONResponse({'error': {'code': 'internal_error', 'message': 'The request could not be completed.'}},
                            status_code=500, headers=headers)

    def route(path, methods):
        def register(function):
            # Avoid postponed local-import annotations confusing FastAPI's resolver.
            function.__annotations__['request'] = Request
            app.add_api_route(path, function, methods=methods)
            return function
        return register

    async def identity(request, mutation=False):
        origin = request.headers.get('origin')
        if mutation or origin:
            verify_origin(origin, settings)
        result = await authenticator.authenticate(request.cookies.get(SESSION_COOKIE))
        if mutation:
            verify_csrf(result, request.headers.get('x-csrf-token'), request.cookies.get(CSRF_COOKIE))
        return result

    def response(value, status=200):
        return JSONResponse(public_payload(value), status_code=status)

    @route('/healthz', ['GET'])
    async def health(request):
        return JSONResponse({'status': 'running', 'mode': settings.mode, 'live_verification': False})

    @route('/readyz', ['GET'])
    async def ready(request):
        from .readiness import inspect_readiness
        value = await inspect_readiness(service.store, settings)
        return JSONResponse(value, status_code=200 if value['ready'] else 503)

    @route('/api/session', ['POST'])
    async def session(request):
        verify_origin(request.headers.get('origin'), settings)
        body = await bounded_json(request, 12000)
        exact_fields(body, (), ('access_token',))
        authorization = request.headers.get('authorization', '')
        bearer = authorization[7:] if authorization.startswith('Bearer ') else None
        token = body.get('access_token', bearer)
        if bearer is not None and 'access_token' in body and body['access_token'] != bearer:
            raise MendError('invalid_session', 'Conflicting session credentials are invalid.', 401)
        cookie, actor = await authenticator.exchange(token)
        output = JSONResponse({'user_id': actor.user_id, 'csrf_token': actor.csrf_token, 'expires_at': actor.expires_at})
        output.set_cookie(SESSION_COOKIE, cookie, max_age=settings.session_seconds, secure=True, httponly=True, samesite='strict', path='/')
        output.set_cookie(CSRF_COOKIE, actor.csrf_token, max_age=settings.session_seconds, secure=True, httponly=False, samesite='strict', path='/')
        return output

    @route('/api/session', ['GET'])
    async def session_info(request):
        actor = await identity(request)
        return JSONResponse({'user_id': actor.user_id, 'csrf_token': actor.csrf_token, 'expires_at': actor.expires_at})

    @route('/api/session', ['DELETE'])
    async def logout(request):
        await identity(request, True)
        output = JSONResponse({'signed_out': True})
        output.delete_cookie(SESSION_COOKIE, path='/', secure=True, httponly=True, samesite='strict')
        output.delete_cookie(CSRF_COOKIE, path='/', secure=True, samesite='strict')
        return output

    @route('/api/bug-cases/prepare', ['POST'])
    async def prepare_bug_contract(request):
        await identity(request, True)
        body = await bounded_json(request, settings.max_body_bytes)
        exact_fields(body, ('intake', 'protected_test_source', 'required_check_ids', 'target_check_id'))
        from .bug_cases import prepare_bug_case
        # This stateless review has its own explicit schema; task public_payload
        # deliberately still accepts only the reviewed live CSV contract.
        return JSONResponse(prepare_bug_case(**body))

    @route('/api/tasks', ['POST'])
    async def create_task(request):
        actor = await identity(request, True)
        body = await bounded_json(request, settings.max_body_bytes)
        exact_fields(body, ('prompt',), ('runtime',))
        prompt = body['prompt']
        try:
            valid_prompt = isinstance(prompt, str) and bool(prompt.strip()) and len(prompt.encode('utf-8')) <= 8000
        except UnicodeError:
            valid_prompt = False
        if not valid_prompt:
            raise MendError('invalid_prompt', 'A nonempty UTF-8 prompt of at most 8000 bytes is required.')
        if body.get('runtime', 'python') != 'python':
            raise MendError('unsupported_runtime', 'Only the reviewed Python contract is supported.')
        key = idempotency(request.headers.get('idempotency-key'))
        return response(await service.create(actor.user_id, prompt, key, runtime='python'), 201)

    @route('/api/tasks/{task_id}', ['GET'])
    async def get_task(request, task_id: str):
        actor = await identity(request)
        return response(await service.get(uuid_string(task_id), actor.user_id))

    @route('/api/tasks/{task_id}/contract', ['PATCH'])
    async def contract(request, task_id: str):
        actor = await identity(request, True)
        body = await bounded_json(request, settings.max_body_bytes)
        exact_fields(body, ('expected_version', 'contract'))
        return response(await service.propose(uuid_string(task_id), actor.user_id, version(body['expected_version']), body['contract']))

    @route('/api/tasks/{task_id}/start', ['POST'])
    async def start(request, task_id: str):
        actor = await identity(request, True)
        body = await bounded_json(request, 1024)
        exact_fields(body, ('expected_version',))
        idempotency(request.headers.get('idempotency-key'))
        return response(await service.start(uuid_string(task_id), actor.user_id, version(body['expected_version'])), 202)

    @route('/api/tasks/{task_id}/cancel', ['POST'])
    async def cancel(request, task_id: str):
        actor = await identity(request, True)
        body = await bounded_json(request, 1024)
        exact_fields(body, ())
        return response(await service.cancel(uuid_string(task_id), actor.user_id), 202)

    @route('/api/tasks/{task_id}/receipt', ['GET'])
    async def receipt(request, task_id: str):
        actor = await identity(request)
        return response(await service.receipt(uuid_string(task_id), actor.user_id))

    @route('/api/tasks/{task_id}/artifacts', ['GET'])
    async def artifacts(request, task_id: str):
        actor = await identity(request)
        return response(await service.artifacts(uuid_string(task_id), actor.user_id))

    @route('/api/tasks/{task_id}/events', ['GET'])
    async def events(request, task_id: str):
        actor = await identity(request)
        uuid_string(task_id)
        after = replay_cursor(request.headers.get('last-event-id'), request.query_params.get('after'))
        await service.get(task_id, actor.user_id)  # Authorize before sending stream headers.
        return StreamingResponse(sse_stream(service, task_id, actor, request, after), media_type='text/event-stream',
                                 headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity'})

    return app
