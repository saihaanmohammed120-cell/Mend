'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { constants } = require('node:fs');
const contract = require('./contract-v1.json');
const MAX_RECEIPT_BYTES = 1048576;
const MAX_SOURCE_BYTES = 200000;
const hashPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function safePath(value) {
  requireValue(typeof value === 'string' && value.length <= 180 && /^[A-Za-z0-9_./-]+$/.test(value)
    && !value.startsWith('/') && !value.startsWith('-')
    && value.split('/').every(part => part && !part.startsWith('.')), 'Unsafe source path.');
  // Windows normalizes trailing dots and reserved devices; neither is a source file.
  requireValue(value.split('/').every(part => !part.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)), 'Unsafe source path.');
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function sourceHash(files) {
  const paths = Object.keys(files);
  requireValue(paths.length >= 1 && paths.length <= 20, 'Source requires 1–20 files.');
  let bytes = 0;
  for (const name of paths) {
    safePath(name);
    requireValue(typeof files[name] === 'string' && !files[name].includes('\0') && !hasLoneSurrogate(files[name]), 'Source must be valid UTF-8 text without NUL.');
    bytes += Buffer.byteLength(files[name], 'utf8');
  }
  requireValue(bytes <= MAX_SOURCE_BYTES, 'Source exceeds 200,000 bytes.');
  return sha256(canonical({ schema_version: 1, files }));
}

function hasLoneSurrogate(value) {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}

function checkJson(value, depth = 0) {
  requireValue(depth <= 64, 'Receipt nesting exceeds 64 levels.');
  if (typeof value === 'string') requireValue(!hasLoneSurrogate(value), 'Receipt contains invalid Unicode.');
  if (typeof value === 'number') requireValue(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'Receipt contains an unsupported number.');
  if (value && typeof value === 'object') for (const item of Object.values(value)) checkJson(item, depth + 1);
}

function parseReceipt(bytes) {
  requireValue(bytes.byteLength <= MAX_RECEIPT_BYTES, 'Receipt exceeds 1 MiB.');
  let receipt;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Receipt must be valid UTF-8 JSON.'); }
  checkJson(receipt);
  requireValue(receipt && !Array.isArray(receipt) && typeof receipt === 'object', 'Receipt must be a JSON object.');
  requireValue(receipt.schema_version === 1 && receipt.status === 'passed', 'Only backend schema-1 passed receipts are supported.');
  requireValue(['live', 'local_test'].includes(receipt.source) && receipt.live_verification === (receipt.source === 'live'), 'Receipt evidence labels are unsupported or contradictory.');
  for (const field of ['receipt_id', 'task_id', 'final_attempt_id']) requireValue(typeof receipt[field] === 'string' && uuidPattern.test(receipt[field]), 'Receipt has an invalid identity.');
  for (const field of ['contract_sha256', 'snapshot_sha256', 'bundle_verified_sha256']) requireValue(typeof receipt[field] === 'string' && hashPattern.test(receipt[field]), 'Receipt has an invalid SHA-256 identity.');
  for (const field of ['model_id', 'job_id', 'image_digest']) requireValue(typeof receipt[field] === 'string' && /^[\x20-\x7E]{1,200}$/.test(receipt[field]), 'Receipt has an invalid execution label.');
  requireValue(receipt.contract_sha256 === sha256(canonical(contract)), 'Unsupported contract: only reviewed csv-cleaner-v1 is supported.');
  requireValue(receipt.bundle_verified_sha256 === receipt.snapshot_sha256, 'Receipt bundle and snapshot identities disagree.');
  return receipt;
}

function sameSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length && actual.every(item => expected.includes(item));
}

function checkAssertions(receipt) {
  const checks = receipt.checks;
  const ids = contract.required_check_ids;
  const checksConsistent = !!checks && checks.total === ids.length && checks.passed === ids.length
    && checks.failed === 0 && checks.skipped === 0 && sameSet(checks.check_ids, ids)
    && Array.isArray(checks.results) && sameSet(checks.results.map(item => item?.check_id), ids)
    && checks.results.every(item => item.status === 'passed');
  const history = receipt.receipt_json?.attempt_history;
  const matches = Array.isArray(history) ? history.filter(item => item?.id === receipt.final_attempt_id) : [];
  const attempt = matches.length === 1 ? matches[0] : null;
  const identityConsistent = !!attempt && ['snapshot_sha256', 'model_id', 'job_id', 'image_digest'].every(field => attempt[field] === receipt[field])
    && attempt.task_id === receipt.task_id && attempt.status === 'passed' && attempt.exit_code === 0;
  return { checksConsistent, identityConsistent };
}

async function readBounded(filename, limit) {
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    requireValue(info.isFile() && info.size <= limit, 'Selected file is not a bounded regular file.');
    const bytes = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, size);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    requireValue(size <= limit, 'Selected file exceeds the size limit.');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

async function readWorkspaceFile(root, relative) {
  safePath(relative);
  const canonicalRoot = await fs.realpath(root);
  let candidate = canonicalRoot;
  for (const part of relative.split('/')) {
    candidate = path.join(candidate, part);
    requireValue(!(await fs.lstat(candidate)).isSymbolicLink(), 'Symbolic links are not supported for source verification.');
  }
  const resolved = await fs.realpath(candidate);
  const relation = path.relative(canonicalRoot, resolved);
  requireValue(relation && !relation.startsWith('..' + path.sep) && relation !== '..' && !path.isAbsolute(relation), 'Source path escaped selected workspace.');
  const content = await readBounded(resolved, MAX_SOURCE_BYTES);
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content);
}

async function verifyWorkspace(receipt, root) {
  const names = [...contract.editable_paths, ...Object.keys(contract.protected_files)];
  const files = Object.create(null);
  for (const name of names) files[name] = await readWorkspaceFile(root, name);
  const snapshot = sourceHash(files);
  const protectedFiles = Object.fromEntries(Object.keys(contract.protected_files).map(name => [name, files[name]]));
  return {
    snapshot,
    sourceMatches: snapshot === receipt.snapshot_sha256,
    checksMatch: sourceHash(protectedFiles) === sourceHash(contract.protected_files),
    paths: names
  };
}

function renderReceipt(receipt, workspace) {
  const assertions = checkAssertions(receipt);
  return [
    'Mend — local receipt inspection',
    'UNSIGNED / UNAUTHENTICATED: no public receipt signature is verified.',
    receipt.source === 'local_test' ? 'Evidence label: local_test (fixture claim; no live execution established).' : 'Evidence label: live (untrusted claim; no live execution established).',
    'Receipt ID: ' + receipt.receipt_id,
    'Task ID: ' + receipt.task_id,
    'Final attempt ID: ' + receipt.final_attempt_id,
    'Claimed model: ' + JSON.stringify(receipt.model_id),
    'Claimed job: ' + JSON.stringify(receipt.job_id),
    'Claimed image: ' + JSON.stringify(receipt.image_digest),
    'Supported contract: csv-cleaner-v1; contract hash matches bundled reference.',
    'Receipt snapshot: ' + receipt.snapshot_sha256,
    'Recorded check assertions: ' + (assertions.checksConsistent ? 'consistent (4 passed, 0 failed, 0 skipped).' : 'INCONSISTENT / INCOMPLETE.'),
    'Recorded final-attempt identity: ' + (assertions.identityConsistent ? 'consistent within this unsigned JSON.' : 'UNVERIFIABLE / INCONSISTENT.'),
    ...(workspace ? [
      'Workspace snapshot: ' + workspace.snapshot,
      'Exact source binding: ' + (workspace.sourceMatches ? 'MATCH at inspection time.' : 'MISMATCH.'),
      'Protected check content: ' + (workspace.checksMatch ? 'MATCHES bundled reviewed contract.' : 'MISMATCH.'),
      'Files compared: ' + workspace.paths.join(', '),
      'Only these two contracted files are hashed; other workspace files are outside this binding.'
    ] : ['Workspace binding: NOT CHECKED. Open a local folder and run the command again.']),
    'No code or receipt commands executed. No network, telemetry, or workspace writes.',
    'A matching hash establishes content equality only; it does not establish test execution, trusted job identity, stop timing, approval, signing, or production readiness.',
    'Files can change after this inspection. Run the command again after edits.'
  ].join('\n') + '\n';
}

module.exports = { MAX_RECEIPT_BYTES, canonical, sourceHash, safePath, parseReceipt, checkAssertions, readBounded, readWorkspaceFile, verifyWorkspace, renderReceipt };
