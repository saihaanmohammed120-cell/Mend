'use strict';

const { parseReceipt, readBounded, verifyWorkspace, renderReceipt, MAX_RECEIPT_BYTES } = require('./receipt');

function activate(context) {
  const vscode = require('vscode');
  const output = vscode.window.createOutputChannel('Mend Receipts');
  context.subscriptions.push(output, vscode.commands.registerCommand('mend.openReceipt', async (receiptUri, workspaceUri) => {
    // Clear previous results before a cancellation or failure can leave them looking current.
    output.clear();
    try {
      const selected = receiptUri ? [receiptUri] : await vscode.window.showOpenDialog({
        title: 'Select an exported Mend backend receipt', canSelectMany: false,
        canSelectFiles: true, canSelectFolders: false, filters: { 'Mend receipt JSON': ['json'] }
      });
      if (!selected?.length) return;
      if (selected[0].scheme !== 'file') throw new Error('Choose a local file receipt.');
      const receipt = parseReceipt(await readBounded(selected[0].fsPath, MAX_RECEIPT_BYTES));
      const folders = (vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file');
      let folder;
      if (workspaceUri) folder = folders.find(item => item.uri.toString() === workspaceUri.toString());
      else if (folders.length === 1) folder = folders[0];
      else if (folders.length > 1) folder = (await vscode.window.showQuickPick(folders.map(item => ({ label: item.name, folder: item })), { title: 'Select workspace folder to compare' }))?.folder;
      if ((workspaceUri || folders.length) && !folder) return;
      const comparison = folder ? await verifyWorkspace(receipt, folder.uri.fsPath) : undefined;
      const report = renderReceipt(receipt, comparison);
      output.append(report);
      output.show(false);
      return report;
    } catch {
      const message = 'Inspection failed: receipt unsupported or invalid, or workspace files unreadable/unsafe. No verification result is available. See Mend receipt documentation for supported schema and limits.';
      output.appendLine(message);
      output.show(false);
      await vscode.window.showErrorMessage(message);
      return undefined;
    }
  }));
}

module.exports = { activate };
