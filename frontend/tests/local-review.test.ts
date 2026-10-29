import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseLocalJson, sourceFiles, sourceHash, changedSpan, compareRepository, previewPolicy, inspectReceipt, sha256, canonicalJson, readSourceMapFile, MAX_JSON_BYTES } from "../lib/local-review";
import contract from "../lib/receipt-contract.json";
import capture from "../lib/captured-example.json";
import provenance from "../lib/captured-provenance.json";
const require = createRequire(import.meta.url);
const ide = require("../../extensions/vscode-mend/receipt.js");
const original = { "csv_tools.py": capture.before_source, ...contract.protected_files };
const candidate = { ...original, "csv_tools.py": capture.after_source };

test("Browser source identity agrees with the existing IDE implementation, preserving exact UTF-8/CRLF/BOM", async () => {
  assert.deepEqual(contract, JSON.parse(readFileSync(new URL("../../extensions/vscode-mend/contract-v1.json", import.meta.url), "utf8")));
  for (const files of [original, candidate, { "unicode.py": "\uFEFF# café 🌿\r\nx = 1\r\n" }]) assert.equal(await sourceHash(files), ide.sourceHash(files));
  assert.notEqual(await sourceHash({ "x.py": "x\n" }), await sourceHash({ "x.py": "x\r\n" }));
});
test("Local JSON rejects duplicate/escaped keys, malformed Unicode, unsafe numbers, depth and oversized inputs", () => {
  for (const input of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":1e400}', '{"x":9007199254740993}', '{"x":"\\ud800"}', "[".repeat(66) + "0" + "]".repeat(66)]) assert.throws(() => parseLocalJson(input));
  assert.throws(() => parseLocalJson('{"a":1}', 2));
  assert.deepEqual(parseLocalJson('{"text":"escaped \\\" { a: x }","a":{"a":1}}'), { text: 'escaped " { a: x }', a: { a: 1 } });
});
test("Source maps reject path aliases, traversal, devices, non-text and byte overflow", () => {
  for (const files of [{ "../x.py": "x" }, { "C:/x.py": "x" }, { "CON.py": "x" }, { "x.py": "\0" }, { "x.py": "\ud800" }, { "a.py": "x", "A.py": "y" }, { "x.py": "🌿".repeat(50_001) }, { "x.py": 3 }]) assert.throws(() => sourceFiles(files));
});
test("Source-map file import retains nested paths and exact source bytes, rejecting invalid files before replacement", async () => {
  const sources = { "app/value.py": "\uFEFF# café 🌿\r\nx = 1\r\n", "tests/test_value.py": "# protected\n" };
  const selected = new File(["\uFEFF", JSON.stringify(sources)], "files.json", { type: "application/json" });
  const imported = await readSourceMapFile(selected);
  assert.deepEqual(imported, sources);
  assert.equal(await sourceHash(imported), await sourceHash(sources));
  for (const text of ['{"app/value.py":"x","app/\\u0076alue.py":"y"}', '{"../value.py":"x"}', '{"schema_version":1,"files":{}}', '{"value.py":"\\ud800"}', '{"value.py":"' + "a".repeat(200_001) + '"}']) {
    await assert.rejects(readSourceMapFile(new File([text], "invalid.json")));
  }
  await assert.rejects(readSourceMapFile(new File([new Uint8Array([0xff])], "invalid.json")));
  let read = false;
  await assert.rejects(readSourceMapFile({ size: MAX_JSON_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } } as File), /exceeds/);
  assert.equal(read, false);
});
test("Repository comparison detects protected edits, path changes and exact source spans without execution", async () => {
  const review = await compareRepository(original, candidate, ["test_csv_tools.py"]);
  assert.deepEqual(review.changed.map(row => row.path), ["csv_tools.py"]);
  assert.deepEqual(review.protectedChanged, []);
  assert.equal(review.originalHash, ide.sourceHash(original));
  assert.equal(review.candidateHash, ide.sourceHash(candidate));
  const tampered = await compareRepository(original, { ...candidate, "test_csv_tools.py": "# changed\n" }, []);
  assert.deepEqual(tampered.protectedChanged, ["test_csv_tools.py"]);
  assert.equal(previewPolicy(tampered, 400_000, 400_000).withinThresholds, false);
  await assert.rejects(compareRepository(original, { "new.py": "x" }, []), /preserve every/);
  const span = changedSpan("a\nb\nc\nd\ne\n", "a\nB\nc\nD\ne\n");
  assert.equal(span.changedLines, 6); assert.equal(span.changedBytes, 12);
  assert.equal(changedSpan("", "x").changedLines, 1);
  assert.equal(changedSpan("x\n", "x").changedLines, 2);
});
test("Policy is only a preview and stays unapproved even within chosen thresholds", async () => {
  const review = await compareRepository(original, candidate, []);
  const result = previewPolicy(review, 400_000, 400_000);
  assert.equal(result.withinThresholds, true); assert.equal(result.approval, "not_approved"); assert.equal(result.execution, "not_run");
  assert.equal(previewPolicy(review, 1, 1).withinThresholds, false);
  assert.throws(() => previewPolicy(review, NaN, 4000));
  assert.equal(previewPolicy(await compareRepository(original, original, []), 40, 4000).withinThresholds, false);
});
test("Real captured SLSA document binds only supplied subject bytes, with no check/signature inference", async () => {
  const absent = await inspectReceipt(provenance, null);
  assert.equal(absent.sourceMatches, null); assert.equal(absent.checksConsistent, null);
  const match = await inspectReceipt(provenance, candidate);
  assert.equal(match.sourceMatches, true); assert.equal(match.protectedMatches, null);
  assert.equal((await inspectReceipt(provenance, original)).sourceMatches, false);
  assert.equal((await inspectReceipt(provenance, { "other.py": "x" })).sourceMatches, null);
  const partial = structuredClone(provenance); partial.subject.push({ name: "other.py", digest: { sha256: "a".repeat(64) } });
  assert.equal((await inspectReceipt(partial, original)).sourceMatches, false);
  const duplicate = structuredClone(provenance); duplicate.subject.push(duplicate.subject[0]);
  await assert.rejects(inspectReceipt(duplicate, null), /Duplicate/);
});
test("Backend receipt inspection matches the existing unsigned IDE verifier and refuses contradictory claims", async () => {
  const snapshot = await sourceHash(candidate), id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const receipt = { schema_version: 1, status: "passed", source: "local_test", live_verification: false,
    receipt_id: id, task_id: id, final_attempt_id: id, contract_sha256: await sha256(canonicalJson(contract)),
    snapshot_sha256: snapshot, bundle_verified_sha256: snapshot, model_id: "fixture-only", job_id: "fixture-only", image_digest: "fixture-only",
    checks: { ...capture.after.checks, check_ids: contract.required_check_ids },
    receipt_json: { attempt_history: [{ id, task_id: id, status: "passed", exit_code: 0, snapshot_sha256: snapshot, model_id: "fixture-only", job_id: "fixture-only", image_digest: "fixture-only" }] } };
  const parsed = ide.parseReceipt(Buffer.from(JSON.stringify(receipt)));
  const inspected = await inspectReceipt(receipt, candidate);
  assert.equal(inspected.checksConsistent, ide.checkAssertions(parsed).checksConsistent);
  assert.equal(inspected.identityConsistent, true); assert.equal(inspected.sourceMatches, true); assert.equal(inspected.protectedMatches, true);
  assert.equal((await inspectReceipt(receipt, original)).sourceMatches, false);
  const claims = await inspectReceipt({ ...receipt, source: "live", live_verification: true }, candidate);
  assert.match(claims.sourceClaim, /untrusted uploaded claim/);
  await assert.rejects(inspectReceipt({ ...receipt, live_verification: true }, candidate), /contradictory/);
  await assert.rejects(inspectReceipt({ ...receipt, contract_sha256: "a".repeat(64) }, null), /Only the reviewed/);
});
