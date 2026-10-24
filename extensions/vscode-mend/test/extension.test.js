'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const contract = require('../contract-v1.json');
const { canonical, sourceHash } = require('../receipt');

function uri(filename) { return { scheme: 'file', fsPath: filename, toString() { return filename; } }; }
function controller(folders = []) {
  const state = { output: 'old success', errors: [], pickerCalls: 0 };
  const output = { clear() { state.output = ''; }, append(value) { state.output += value; }, appendLine(value) { state.output += value + '\n'; }, show() {}, dispose() {} };
  const vscode = {
    commands: { registerCommand(name, action) { assert.equal(name, 'mend.openReceipt'); state.run = action; return { dispose() {} }; } },
    workspace: { workspaceFolders: folders },
    window: {
      createOutputChannel(name) { assert.equal(name, 'Mend Receipts'); return output; },
      async showOpenDialog() { return state.selected; },
      async showQuickPick(items) { state.pickerCalls++; return items[state.folderIndex || 0]; },
      async showErrorMessage(value) { state.errors.push(value); }
    }
  };
  const load = Module._load;
  try {
    Module._load = function(name, ...args) { return name === 'vscode' ? vscode : load.call(this, name, ...args); };
    const context = { subscriptions: [] };
    require('../extension').activate(context);
    assert.equal(context.subscriptions.length, 2);
  } finally { Module._load = load; }
  return state;
}

test('cancelled native receipt picker clears stale results without a read or error', async () => {
  const state = controller();
  assert.equal(await state.run(), undefined);
  assert.equal(state.output, ''); assert.deepEqual(state.errors, []);
});

test('invalid local input and non-file URI fail closed without echoing input or retaining success', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mend-ide-command-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'receipt.json');
  await fs.writeFile(filename, '{"secret":"never echo this"}');
  const state = controller(); state.selected = [uri(filename)];
  assert.equal(await state.run(), undefined);
  assert.match(state.output, /Inspection failed/);
  assert.doesNotMatch(state.output, /never echo this|old success/);
  assert.equal(state.errors.length, 1);
  await state.run({ scheme: 'https', fsPath: filename });
  assert.equal(state.errors.length, 2);
});

test('native multi-root picker compares chosen folder and shows unsigned source-binding report', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mend-ide-command-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const selectedRoot = path.join(root, 'selected'); await fs.mkdir(selectedRoot);
  const files = { 'csv_tools.py': 'fixture\n', ...contract.protected_files };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(selectedRoot, name), content);
  const id = '00000000-0000-4000-8000-000000000001';
  const receipt = { schema_version: 1, source: 'local_test', live_verification: false, status: 'passed',
    receipt_id: id, task_id: id, final_attempt_id: id,
    contract_sha256: createHash('sha256').update(canonical(contract)).digest('hex'),
    snapshot_sha256: sourceHash(files), bundle_verified_sha256: sourceHash(files),
    model_id: 'local_test/model', job_id: 'local_test/job', image_digest: 'local_test/image' };
  const filename = path.join(root, 'receipt.json'); await fs.writeFile(filename, JSON.stringify(receipt));
  const state = controller([{ name: 'Other', uri: uri(root) }, { name: 'Selected', uri: uri(selectedRoot) }]);
  state.selected = [uri(filename)]; state.folderIndex = 1;
  const report = await state.run();
  assert.equal(state.pickerCalls, 1);
  assert.match(report, /Exact source binding: MATCH at inspection time/);
  assert.match(report, /UNSIGNED \/ UNAUTHENTICATED/);
  assert.equal(state.output, report); assert.deepEqual(state.errors, []);
});
