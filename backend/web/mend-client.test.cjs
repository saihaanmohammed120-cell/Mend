/** Dependency-free browser-boundary regression tests. No provider calls. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mend-client-test-'));
try {
  execFileSync(process.env.MEND_TSC_BIN || 'tsc', [
    '--strict', '--target', 'ES2020', '--module', 'commonjs', '--lib', 'ES2020,DOM',
    '--outDir', output, path.join(__dirname, 'mend-client.ts'),
  ], { stdio: 'pipe' });
} catch (error) {
  fs.rmSync(output, { recursive: true, force: true });
  process.stderr.write('TypeScript compilation failed. Install no packages automatically; provide tsc on PATH or set MEND_TSC_BIN to its existing executable.\n');
  if (error.stderr) process.stderr.write(error.stderr);
  if (error.stdout) process.stderr.write(error.stdout);
  throw error;
}
after(() => fs.rmSync(output, { recursive: true, force: true }));
const { MendClient, MendClientError, TASK_STATUSES } = require(path.join(output, 'mend-client.js'));
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture(t) {
  const previous = global.window;
  const current = { id: ID, status: 'running', contract: {}, contract_version: 1,
    source: 'local_test', live_verification: false };
  const session = { user_id: USER, csrf_token: 'a'.repeat(43), expires_at: Math.floor(Date.now() / 1000) + 60 };
  const state = { current, bodyCancelled: false, behavior: 'normal', calls: [], source: null };
  class Source {
    constructor(url, init) { this.url = url; this.init = init; this.listeners = {}; this.closed = false; state.source = this; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    emit(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); }
    close() { this.closed = true; }
  }
  const fetcher = async (route, options) => {
    state.calls.push({ route, options });
    if (options.signal.aborted) throw new DOMException('aborted', 'AbortError');
    if (state.behavior === 'bad-content') return new Response(new ReadableStream({
      cancel() { state.bodyCancelled = true; },
    }), { headers: { 'content-type': 'text/html' } });
    if (state.behavior === 'oversize') return new Response('{}', {
      headers: { 'content-type': 'application/json', 'content-length': '1048577' },
    });
    if (state.behavior === 'unauthorized') return new Response(JSON.stringify({ error: {
      code: 'unauthenticated', message: 'Session expired.',
    } }), { status: 401, headers: { 'content-type': 'application/json' } });
    let data = current;
    if (route === '/api/session') data = options.method === 'DELETE' ? { signed_out: true } : session;
    if (route.endsWith('/artifacts')) data = { bundle: {
      url: state.behavior === 'local-link' ? 'local_test://artifacts/x'
        : 'https://project.supabase.co/storage/v1/object/sign/mend-artifacts/x?token=short',
      expires_seconds: 60,
    } };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  global.window = { location: { protocol: 'https:' }, setTimeout, clearTimeout, fetch: fetcher };
  const client = new MendClient({ fetch: fetcher, eventSource: (url, init) => new Source(url, init) });
  t.after(() => {
    client.dispose();
    if (previous === undefined) delete global.window;
    else global.window = previous;
  });
  return { client, state, session };
}

function event(type, sequence, payload = { status: 'running' }) {
  return { lastEventId: String(sequence), data: JSON.stringify({
    task_id: ID, event_type: type, sequence, payload,
  }) };
}

test('Actual API routes, session exchange, CSRF, idempotency and 12 persisted states', async (t) => {
  const { client, state, session } = fixture(t);
  await client.exchangeSession('supabase-access-token');
  await client.create('clean rows', 'create-1');
  await client.propose(ID, 1); // null requests the actual service's curated contract.
  await client.start(ID, 1, 'start-1');
  await client.get(ID); await client.cancel(ID); await client.receipt(ID); await client.artifacts(ID);
  assert.equal(TASK_STATUSES.length, 12);
  assert.ok(TASK_STATUSES.includes('draft') && TASK_STATUSES.includes('finalizing'));
  for (const call of state.calls) {
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.route.startsWith('/api/'));
    assert.ok(!call.route.includes('access-token'));
  }
  for (const call of state.calls.filter(c => ['POST', 'PATCH'].includes(c.options.method) && c.route !== '/api/session'))
    assert.equal(call.options.headers['X-CSRF-Token'], session.csrf_token);
  const create = state.calls.find(c => c.route === '/api/tasks');
  assert.deepEqual(JSON.parse(create.options.body), { prompt: 'clean rows', runtime: 'python' });
  assert.equal(create.options.headers['Idempotency-Key'], 'create-1');
  assert.deepEqual(JSON.parse(state.calls.find(c => c.route.endsWith('/contract')).options.body), { expected_version: 1, contract: null });
  assert.equal(state.calls.find(c => c.route.endsWith('/start')).options.headers['Idempotency-Key'], 'start-1');
});

test('Cookie SSE replay cursor, duplicate suppression and terminal cleanup', async (t) => {
  const { client, state } = fixture(t);
  const events = [], connections = [];
  const watch = await client.watchTask(ID, {
    onTask: value => assert.equal(value.id, ID), onEvent: value => events.push(value),
    onConnection: value => connections.push(value),
  }, { after: '2' });
  assert.equal(state.source.url, `/api/tasks/${ID}/events?after=2`);
  assert.equal(state.source.init.withCredentials, true);
  state.source.emit('state', event('state', 3));
  state.source.emit('state', event('state', 3));
  assert.equal(events.length, 1); assert.equal(watch.cursor(), '3');
  state.source.emit('stopped', event('stopped', 4, { status: 'stopped' }));
  assert.equal(state.source.closed, true); assert.equal(watch.cursor(), '4');
  assert.equal(connections.at(-1), 'closed');
});

test('Bounded JSON response, non-HTTPS local link rejection and AbortSignal', async (t) => {
  const { client, state } = fixture(t);
  state.behavior = 'oversize';
  await assert.rejects(client.get(ID), e => e instanceof MendClientError && e.code === 'response_limit');
  state.behavior = 'local-link';
  await assert.rejects(client.artifacts(ID), e => e.code === 'invalid_download');
  state.behavior = 'normal';
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(client.get(ID, { signal: aborted.signal }), e => e.code === 'request_aborted');
});

test('Bounded stream errors, secure browser requirement and owned resource disposal', async (t) => {
  const { client, state } = fixture(t);
  const errors = [];
  await client.watchTask(ID, { onTask: () => {}, onEvent: () => {}, onError: e => errors.push(e) }, { maxReconnectErrors: 2 });
  state.source.emit('error'); state.source.emit('error');
  assert.equal(state.source.closed, true); assert.equal(errors[0].code, 'stream_unavailable');
  await client.watchTask(ID, { onTask: () => {}, onEvent: () => {} });
  client.dispose(); assert.equal(state.source.closed, true);
  global.window.location.protocol = 'http:';
  assert.throws(() => new MendClient(), e => e.code === 'secure_browser_required');
});


test('Completed task replays pending receipt and closes when already caught up', async (t) => {
  const { client, state } = fixture(t);
  state.current.status = 'passed';
  state.current.next_sequence = 6; // NEXT unused ID; receipt event ID is 5.
  const received = [];
  const handle = await client.watchTask(ID, { onTask() {}, onEvent: value => received.push(value) }, { after: '3' });
  assert.ok(state.source); assert.equal(state.source.closed, false);
  state.source.emit('log', event('log', 4, {}));
  state.source.emit('receipt', event('receipt', 5, { source: 'local_test', live_verification: false }));
  assert.equal(received.length, 2); assert.equal(handle.cursor(), '5'); assert.equal(state.source.closed, true);
  const previous = state.source;
  const caughtUp = await client.watchTask(ID, { onTask() {}, onEvent() { throw Error('Unexpected replay'); } }, { after: '5' });
  assert.equal(state.source, previous); assert.equal(caughtUp.cursor(), '5');
});

test('Terminal snapshot without a safely representable cursor retains replay', async (t) => {
  const { client, state } = fixture(t);
  state.current.status = 'stopped';
  state.current.next_sequence = Number.MAX_SAFE_INTEGER + 1;
  const handle = await client.watchTask(ID, { onTask() {}, onEvent() {} });
  assert.ok(state.source); assert.equal(state.source.closed, false); handle.close();
});

test('Header rejection cancels response body and aborts fetch ownership', async (t) => {
  const { client, state } = fixture(t);
  state.behavior = 'bad-content';
  await assert.rejects(client.get(ID), e => e.code === 'invalid_response');
  assert.equal(state.bodyCancelled, true);
  assert.equal(state.calls.at(-1).options.signal.aborted, true);
});

test('Consumer notification errors cannot break disposal or 401 handling', async (t) => {
  const { client, state } = fixture(t);
  const failing = { onTask() {}, onEvent() {}, onConnection(s) { if (s === 'closed') throw Error('Consumer notification'); } };
  await client.watchTask(ID, failing); const first = state.source;
  await client.watchTask(ID, { onTask() {}, onEvent() {} }); const second = state.source;
  assert.doesNotThrow(() => client.dispose()); assert.equal(first.closed, true); assert.equal(second.closed, true);
  await client.watchTask(ID, failing); const third = state.source;
  state.behavior = 'unauthorized';
  await assert.rejects(client.get(ID), e => e.code === 'unauthenticated' && e.status === 401);
  assert.equal(third.closed, true);
});

test('Consumer event failure preserves cursor for a fresh replay', async (t) => {
  const { client, state } = fixture(t);
  const errors = [];
  const handle = await client.watchTask(ID, { onTask() {}, onEvent() { throw Error('Consumer delivery'); },
    onError(e) { errors.push(e); throw Error('Error consumer'); } }, { after: '2' });
  assert.doesNotThrow(() => state.source.emit('state', event('state', 3)));
  assert.equal(handle.cursor(), '2'); assert.equal(state.source.closed, true);
  assert.equal(errors[0].code, 'consumer_failed');
});

test('Server owner changes retire prior account streams; prompt limits count UTF-8 bytes', async (t) => {
  const { client, state, session } = fixture(t);
  await client.watchTask(ID, { onTask() {}, onEvent() {} }); const previous = state.source;
  session.user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await client.getSession(); assert.equal(previous.closed, true);
  await assert.rejects(client.create('é'.repeat(4001), 'multibyte'), e => e.code === 'invalid_prompt');
  await client.create('é'.repeat(4000), 'max-bytes');
});
