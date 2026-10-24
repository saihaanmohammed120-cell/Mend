'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const contract = require('../contract-v1.json');
const { MAX_RECEIPT_BYTES, canonical, sourceHash, safePath, parseReceipt, checkAssertions, readBounded, readWorkspaceFile, verifyWorkspace, renderReceipt } = require('../receipt');

const files = { 'csv_tools.py': 'def clean_rows(rows):\n    return [], 0\n', ...contract.protected_files };
function receipt() {
  const id = '00000000-0000-4000-8000-000000000001';
  return {
    schema_version: 1, source: 'local_test', live_verification: false, status: 'passed',
    receipt_id: id, task_id: id, final_attempt_id: id,
    contract_sha256: createHash('sha256').update(canonical(contract)).digest('hex'),
    snapshot_sha256: sourceHash(files), bundle_verified_sha256: sourceHash(files),
    model_id: 'local_test/model', job_id: 'local_test/job', image_digest: 'local_test/image',
    checks: { total: 4, passed: 4, failed: 0, skipped: 0, check_ids: contract.required_check_ids,
      results: contract.required_check_ids.map(check_id => ({ check_id, status: 'passed' })) },
    receipt_json: { attempt_history: [{ id, task_id: id, status: 'passed', exit_code: 0,
      snapshot_sha256: sourceHash(files), model_id: 'local_test/model', job_id: 'local_test/job', image_digest: 'local_test/image' }] }
  };
}
function parse(value) { return parseReceipt(Buffer.from(JSON.stringify(value))); }
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mend-ide-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(root, name), content);
  return root;
}

test('schema-1 exported receipt parses without trusting its labels', () => {
  assert.equal(parse(receipt()).source, 'local_test');
  const live = receipt(); live.source = 'live'; live.live_verification = true; live.signed = true;
  assert.match(renderReceipt(parse(live)), /UNSIGNED \/ UNAUTHENTICATED/);
  assert.match(renderReceipt(parse(live)), /live \(untrusted claim/);
  assert.doesNotMatch(renderReceipt(parse(live)), /signature verified/);
});

test('unsupported schema, contract and contradictory labels fail closed', () => {
  for (const patch of [ { schema_version: 2 }, { status: 'running' }, { source: 'verified' },
    { live_verification: true }, { receipt_id: [receipt().receipt_id] }, { contract_sha256: 'a'.repeat(64) },
    { bundle_verified_sha256: 'b'.repeat(64) }, { model_id: 'live\nVERIFIED' } ]) {
    assert.throws(() => parse({ ...receipt(), ...patch }));
  }
});

test('JSON input is bounded, valid UTF-8, shallow enough, and Unicode safe', () => {
  for (const bytes of [Buffer.alloc(MAX_RECEIPT_BYTES + 1), Buffer.from([0xff]), Buffer.from('{'), Buffer.from('[]')]) assert.throws(() => parseReceipt(bytes));
  const value = receipt(); value.unknown = JSON.parse('['.repeat(66) + '0' + ']'.repeat(66));
  assert.throws(() => parse(value), /nesting/);
  value.unknown = '\ud800'; assert.throws(() => parse(value), /Unicode/);
});

test('canonical manifest matches backend golden vectors and preserves Unicode/control text', () => {
  // Generated with backend mend.domain.source_sha256, independently of this implementation.
  assert.equal(createHash('sha256').update(canonical(contract)).digest('hex'), 'c3b9aade1196264a86e097c09e44060a85fb0dd9da25ebf65651f19e81147297');
  assert.equal(sourceHash({ 'b.py': 'b', 'a.py': 'a' }), '208022a4229c57069b0562f272ea307ca484303abf56b281de582c5fdc2346ba');
  assert.equal(sourceHash({ 'a.py': 'Mira 🙂\r\n\t\u0001\u2028' }), '69856dc61c68bb312ce1af10ce9bdeb13ac83b622ff88ddf97fa7149db553e20');
  assert.throws(() => sourceHash({ 'a.py': '\ud800' }));
  assert.throws(() => sourceHash({ 'a.py': '\0' }));
  assert.throws(() => sourceHash({ 'a.py': 'x'.repeat(200001) }));
});

test('path traversal, platform aliases, hidden paths and absolute paths are rejected', () => {
  for (const name of ['../a.py', '/a.py', 'a/../../b', 'C:/a.py', 'a\\b.py', '.env', 'a/.git/x', 'a//b', 'a/./b', 'a.', 'NUL.py', 'a/COM1.txt', '-flag']) assert.throws(() => safePath(name));
  assert.equal(safePath('src/csv_tools.py'), 'src/csv_tools.py');
});

test('exact selected workspace binding detects source edits and protected-check edits', async t => {
  const root = await workspace(t);
  assert.equal((await verifyWorkspace(parse(receipt()), root)).sourceMatches, true);
  await fs.appendFile(path.join(root, 'csv_tools.py'), '# changed\n');
  let result = await verifyWorkspace(parse(receipt()), root);
  assert.equal(result.sourceMatches, false); assert.equal(result.checksMatch, true);
  await fs.appendFile(path.join(root, 'test_csv_tools.py'), '# changed\n');
  result = await verifyWorkspace(parse(receipt()), root);
  assert.equal(result.checksMatch, false);
});

test('BOM, CRLF and invalid UTF-8 cannot silently produce a false content match', async t => {
  const root = await workspace(t);
  await fs.writeFile(path.join(root, 'csv_tools.py'), '\ufeff' + files['csv_tools.py']);
  assert.equal((await verifyWorkspace(parse(receipt()), root)).sourceMatches, false);
  await fs.writeFile(path.join(root, 'csv_tools.py'), files['csv_tools.py'].replaceAll('\n', '\r\n'));
  assert.equal((await verifyWorkspace(parse(receipt()), root)).sourceMatches, false);
  await fs.writeFile(path.join(root, 'csv_tools.py'), Buffer.from([0xff]));
  await assert.rejects(verifyWorkspace(parse(receipt()), root));
});

test('missing, oversized and linked source files fail closed', async t => {
  const root = await workspace(t);
  await assert.rejects(readWorkspaceFile(root, '../outside.py'));
  await assert.rejects(readWorkspaceFile(root, 'missing.py'));
  await fs.writeFile(path.join(root, 'large.py'), 'x'.repeat(200001));
  await assert.rejects(readWorkspaceFile(root, 'large.py'));
  await assert.rejects(readBounded(root, MAX_RECEIPT_BYTES));
  // Junctions work on Windows without granting symlink privileges.
  await fs.symlink(root, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readWorkspaceFile(root, 'linked/csv_tools.py'), /Symbolic links/);
});

test('duplicate checks and inconsistent final-attempt records never appear verified', () => {
  const value = receipt();
  assert.deepEqual(checkAssertions(value), { checksConsistent: true, identityConsistent: true });
  value.checks.results[0] = value.checks.results[1];
  value.receipt_json.attempt_history[0].job_id = 'other';
  assert.deepEqual(checkAssertions(value), { checksConsistent: false, identityConsistent: false });
  const report = renderReceipt(value);
  assert.match(report, /INCONSISTENT \/ INCOMPLETE/);
  assert.match(report, /UNVERIFIABLE \/ INCONSISTENT/);
  assert.match(report, /does not establish test execution/);
});

test('receipt commands and unknown labels are never rendered as executable UI', () => {
  const value = receipt(); value.reproduction = { commands: [{ argv: ['DELETE EVERYTHING'] }] };
  value.prompt = 'UNTRUSTED ASSERTION'; value.signed = true;
  const report = renderReceipt(parse(value));
  assert.doesNotMatch(report, /DELETE EVERYTHING|UNTRUSTED ASSERTION/);
  assert.match(report, /No code or receipt commands executed/);
});
