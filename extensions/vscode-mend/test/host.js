'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run() {
  const vscode = require('vscode');
  const root = process.env.MEND_IDE_SMOKE_ROOT;
  assert.ok(root, 'MEND_IDE_SMOKE_ROOT must identify an isolated exported test fixture.');
  const folder = vscode.workspace.workspaceFolders?.[0];
  const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  assert.ok(folder && normalized(folder.uri.fsPath) === normalized(path.join(root, 'workspace')));
  const extension = vscode.extensions.getExtension('mend-local.mend-receipts');
  assert.ok(extension, 'Development extension is loaded.');
  await extension.activate();
  assert.ok((await vscode.commands.getCommands()).includes('mend.openReceipt'));
  const uri = vscode.Uri.file(path.join(root, 'receipt.json'));
  const report = await vscode.commands.executeCommand('mend.openReceipt', uri, folder.uri);
  assert.match(report, /Exact source binding: MATCH at inspection time/);
  assert.match(report, /Protected check content: MATCHES/);
  assert.match(report, /Evidence label: local_test/);
  assert.match(report, /UNSIGNED \/ UNAUTHENTICATED/);
  assert.match(report, /Recorded final-attempt identity: consistent/);
  const filename = path.join(root, 'workspace', 'csv_tools.py');
  const original = await fs.readFile(filename);
  try {
    await fs.appendFile(filename, '# isolated extension-host test edit\n');
    const changed = await vscode.commands.executeCommand('mend.openReceipt', uri, folder.uri);
    assert.match(changed, /Exact source binding: MISMATCH/);
  } finally { await fs.writeFile(filename, original); }
  await fs.writeFile(path.join(root, 'host-result.json'), JSON.stringify({
    passed: true, host: vscode.version, checks: ['activation', 'command registration', 'actual backend receipt', 'exact source match', 'protected-check match', 'unsigned label', 'internal final identity', 'source mismatch after edit'], report
  }, null, 2) + '\n');
  console.log('Mend IDE host smoke passed: activation, backend receipt, source/check binding, mismatch, unsigned labels.');
}

module.exports = { run };
