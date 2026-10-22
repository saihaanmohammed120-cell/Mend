import test from "node:test";
import assert from "node:assert/strict";
import { appendEvent, applyEvent, clearReview, logText, persistReview, restoreReview, reviewRequest, summarizeReceipt, validateReceipt, type PendingReview, type StreamEvent } from "../lib/evidence";
import type { JsonObject, Task } from "../lib/mend-client";

const task: Task = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "running", contract_version: 1,
  contract: { required_check_ids: ["empty", "duplicates"] }, contract_sha256: "c".repeat(64) };
const receipt: JsonObject = { task_id: task.id, status: "passed", source: "live", live_verification: true,
  contract_sha256: task.contract_sha256, snapshot_sha256: "a".repeat(64), bundle_verified_sha256: "a".repeat(64),
  checks: { total: 2, passed: 2, failed: 0, skipped: 0, results: [{ check_id: "empty", status: "passed" }, { check_id: "duplicates", status: "passed" }] },
  attempts: 2, repair_count: 1 };
const event = (id: number, message = "output"): StreamEvent => ({ id: String(id), type: "log", data: { task_id: task.id, message, payload: {} } });

test("Ambiguous creation reuses the exact key and rejects changed prompts until reconciliation", () => {
  let keys = 0;
  const first = reviewRequest(null, " Clean rows ", () => `key-${++keys}`);
  const retry = reviewRequest(first, "Clean rows", () => `key-${++keys}`);
  assert.equal(first, retry);
  assert.equal(keys, 1);
  assert.throws(() => reviewRequest(first, "Different task", () => `key-${++keys}`), /pending task/);
  assert.equal(keys, 1);
});
test("Event replay does not duplicate accepted evidence, and bounded logs keep the newest entries", () => {
  const first = appendEvent([], event(1));
  assert.equal(appendEvent(first, event(1)), first);
  let events: StreamEvent[] = [];
  for (let id = 1; id <= 205; id++) events = appendEvent(events, event(id));
  assert.equal(events.length, 200);
  assert.equal(events[0].id, "6");
  assert.equal(events.at(-1)?.id, "205");
  assert.match(logText(event(300, "x".repeat(5000))), /Output shortened/);
  assert.ok(logText(appendEvent([], event(300, "x".repeat(5000)))[0]).length < 4100);
});
test("Real backend message envelope displays text and foreign task events never change status", () => {
  assert.equal(logText(event(1, "stderr: empty input")), "stderr: empty input");
  assert.throws(() => applyEvent(task, { id: "2", type: "state", data: { task_id: "other", payload: { status: "passed" } } }), /another task/);
  const stopping = applyEvent(task, { id: "2", type: "state", data: { task_id: task.id, payload: { status: "stopping" } } });
  assert.equal(stopping.status, "stopping");
  assert.equal(task.status, "running");
});
test("Passing receipts require live evidence, matching task, exact frozen checks and bundle consistency", () => {
  assert.equal(validateReceipt(receipt, task), receipt);
  assert.throws(() => validateReceipt({ ...receipt, source: "local_test" }, task), /not live/);
  assert.throws(() => validateReceipt({ ...receipt, task_id: "other" }, task), /not live/);
  assert.throws(() => validateReceipt({ ...receipt, bundle_verified_sha256: "b".repeat(64) }, task), /bundle evidence/);
  assert.throws(() => validateReceipt({ ...receipt, checks: { total: 2, passed: 2, failed: 0, skipped: 0,
    results: [{ check_id: "empty", status: "passed" }, { check_id: "empty", status: "passed" }] } }, task), /identities/);
  assert.throws(() => validateReceipt({ ...receipt, checks: { total: 2, passed: 1, failed: 0, skipped: 1, results: [] } }, task), /every frozen check/);
});
test("Receipt summary preserves observed checks and refuses invented counts or live attribution", () => {
  const summary = summarizeReceipt(receipt);
  assert.deepEqual(summary.checks.map(check => check.id), ["empty", "duplicates"]);
  assert.equal(summary.repairCount, 1);
  assert.equal(summary.attempts, 2);
  assert.equal(summarizeReceipt({ status: "passed", source: "local_test" }).live, false);
  assert.equal(summarizeReceipt({ repair_count: "3", attempts: -1 }).repairCount, null);
  assert.equal(summarizeReceipt({ repair_count: "3", attempts: -1 }).attempts, null);
});
test("Pending-review cache survives reload for verified owner and is removed for another owner", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const request = { prompt: "Clean rows", key: "original-key", taskId: task.id };
  persistReview(storage, task.id, request);
  assert.deepEqual(restoreReview(storage, task.id), request);
  assert.equal(restoreReview(storage, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), null);
  assert.equal(values.size, 0);
  persistReview(storage, task.id, request); clearReview(storage); assert.equal(values.size, 0);
});
test("Pending-review cache rejects corrupt identities and oversized prompts, and excludes extra fields", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  assert.throws(() => persistReview(storage, task.id, { prompt: "é".repeat(4001), key: "original" }), /invalid/);
  assert.throws(() => persistReview(storage, task.id, { prompt: "Clean", key: "with space" }), /invalid/);
  assert.throws(() => persistReview(storage, task.id, { prompt: "Clean", key: "original", taskId: "not-uuid" }), /invalid/);
  persistReview(storage, task.id, { prompt: "Clean", key: "original", accessToken: "never-persist" } as PendingReview);
  assert.equal([...values.values()][0].includes("never-persist"), false);
  const key = [...values.keys()][0]; values.set(key, "{" );
  assert.equal(restoreReview(storage, task.id), null); assert.equal(values.size, 0);
});
