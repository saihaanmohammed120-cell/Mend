/** Production Next proxy -> genuine Uvicorn/FastAPI, with fixture identity only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve, delimiter } from 'node:path';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const backend = resolve(frontend, '../backend');
const python = process.env.MEND_TEST_PYTHON;
assert(python, 'Set MEND_TEST_PYTHON to the installed backend test Python executable.');
const children = [];
const backendOrigin = 'http://127.0.0.1:8371';
const origin = 'http://127.0.0.1:4184';
const browserOrigin = 'https://mend-chain.test';
const environment = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...environment, ...env }, stdio: 'ignore', windowsHide: true });
  child.on('error', error => { child.startError = error; });
  children.push(child);
  return child;
}
async function waitFor(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert(!child.startError && child.exitCode === null && child.signalCode === null, 'Isolated test server exited.');
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await result.body?.cancel();
      if (result.ok) return;
    } catch { /* The owned child may still be starting. */ }
    await pause(200);
  }
  throw new Error('Isolated test server did not become healthy.');
}
async function requireUnused(url) {
  let occupied = false;
  try { const result = await fetch(url, { signal: AbortSignal.timeout(1000) }); await result.body?.cancel(); occupied = true; } catch {}
  assert(!occupied, 'Refusing to reuse an existing server.');
}
async function request(path, method = 'GET', body, headers = {}) {
  return fetch(origin + '/api/' + path, { method, redirect: 'error',
    signal: AbortSignal.timeout(5000), headers: { Origin: browserOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

try {
  await requireUnused(backendOrigin + '/healthz');
  await requireUnused(origin + '/sample');
  const api = start(python, ['-m', 'uvicorn', 'proxy_fixture_app:create_fixture', '--factory',
    '--host', '127.0.0.1', '--port', '8371', '--no-access-log'], backend,
    { PYTHONPATH: [backend, resolve(backend, 'tests')].join(delimiter), MEND_HTTP_CHAIN_FIXTURE: '1' });
  await waitFor(backendOrigin + '/healthz', api);
  const next = start(process.execPath, [resolve(frontend, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', '4184'], frontend,
    { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', MEND_BACKEND_URL: backendOrigin });
  await waitFor(origin + '/sample', next);
  assert.equal((await request('session')).status, 401);
  const signedIn = await request('session', 'POST', { access_token: 'fixture-access-token' });
  assert.equal(signedIn.status, 200);
  const identity = await signedIn.json();
  const setCookies = signedIn.headers.getSetCookie();
  assert.equal(setCookies.length, 2);
  for (const cookie of setCookies) assert.match(cookie, /Secure/);
  assert.match(setCookies.find(cookie => cookie.startsWith('__Host-mend-session=')), /HttpOnly/);
  const cookie = setCookies.map(value => value.split(';')[0]).join('; ');
  const headers = { Cookie: cookie, 'X-CSRF-Token': identity.csrf_token };
  assert.equal((await request('session', 'GET', undefined, headers)).status, 200);
  const body = { intake: { kind: 'mend_bug_intake', schema_version: 1, file_path: 'helper.py',
    original_source: 'def value(): return 0\n# exact UTF-8: é 😀\n', reported_error: null,
    expected_behavior: 'Return one', evidence: { investigation: 'not_run', execution: 'not_run', regression: 'not_generated' } },
    protected_test_source: '# Proposed, unexecuted UTF-8: é 😀\n',
    required_check_ids: ['test_regression.Checks.test_value'], target_check_id: 'test_regression.Checks.test_value' };
  assert.equal((await request('bug-cases/prepare', 'POST', body, { Cookie: cookie })).status, 403);
  assert.equal((await request('bug-cases/prepare', 'POST', body, { ...headers, Origin: 'https://wrong.test' })).status, 403);
  const prepared = await request('bug-cases/prepare', 'POST', body, headers);
  assert.equal(prepared.status, 200);
  const result = await prepared.json();
  assert.deepEqual(result.intake, body.intake);
  assert.equal(result.contract.protected_files['test_regression.py'], body.protected_test_source);
  assert.deepEqual(result.contract.required_check_ids, body.required_check_ids);
  assert.equal(result.approval_status, 'not_approved');
  assert.equal(result.execution_enabled, false);
  assert.equal(result.live_verification, false);
  assert.match(result.contract_sha256, /^[0-9a-f]{64}$/);
  const held = await request('tasks', 'POST', { prompt: 'Held task' }, headers);
  assert.equal(held.status, 503);
  assert.equal((await held.json()).error.code, 'database_write_hold');
  const duplicate = { ...body, required_check_ids: [...body.required_check_ids, ...body.required_check_ids] };
  assert.equal((await request('bug-cases/prepare', 'POST', duplicate, headers)).status, 400);
  assert.equal((await request('bug-cases/prepare', 'GET', undefined, headers)).status, 404);
  const logout = await request('session', 'DELETE', undefined, headers);
  assert.equal(logout.status, 200);
  assert(logout.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  console.log('PASS: production Next -> Uvicorn/FastAPI session, CSRF, exact UTF-8 preparation, validation, database hold, logout.');
  console.log('Scope: local HTTP integration with fixture identity; no real Auth, database or provider call; HTTPS browser behavior not established.');
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), pause(1500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}
