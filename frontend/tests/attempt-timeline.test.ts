import test from "node:test";
import assert from "node:assert/strict";
import { attemptTimeline } from "../lib/attempt-timeline";
import type { Task, JsonObject } from "../lib/mend-client";
import type { StreamEvent } from "../lib/evidence";

const task: Task = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "running", contract_version: 1,
  source: "local_test", live_verification: false, contract: { required_check_ids: ["empty", "duplicates"] } };
const first = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", second = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function observation(id = first, ordinal = 1, resolved = false): StreamEvent {
  return { id: "1", type: "log", data: { task_id: task.id, attempt_id: id, stream: "system", payload: {
    schema_version: 1, code: resolved ? "attempt_resolved" : "attempt_reserved", ordinal,
    snapshot_sha256: "a".repeat(64), model_id: "fixture-model", attempt_status: resolved ? "failed" : "reserved",
    checks: resolved ? { total: 2, passed: 1, failed: 1, skipped: 0,
      results: [{ check_id: "empty", status: "failed" }, { check_id: "duplicates", status: "passed" }] } : null,
  } } };
}
test("Timeline shows only explicit owned observations, not plausible log prose or task counters", () => {
  const raw: StreamEvent = { id: "9", type: "log", data: { task_id: task.id, stream: "stdout", message: "Attempt 1 passed all checks" } };
  assert.deepEqual(attemptTimeline(task, [raw]), []);
  assert.deepEqual(attemptTimeline(null, [observation()]), []);
  const other = observation(); other.data.task_id = second;
  assert.deepEqual(attemptTimeline(task, [other]), []);
  const reserved = attemptTimeline(task, [observation()])[0];
  assert.equal(reserved.resolved, false); assert.equal(reserved.checks, null);
});
test("Timeline retains failed check identity, attempt order and a partial outcome-only replay", () => {
  const next = observation(second, 2, true), payload = next.data.payload as JsonObject;
  payload.attempt_status = "passed"; payload.checks = { total: 2, passed: 2, failed: 0, skipped: 0,
    results: [{ check_id: "empty", status: "passed" }, { check_id: "duplicates", status: "passed" }] };
  const rows = attemptTimeline(task, [next, observation(), observation(first, 1, true)]);
  assert.deepEqual(rows.map(r => r.status), ["failed", "passed"]);
  assert.deepEqual(rows[0].checks?.filter(c => c.status === "failed"), [{ id: "empty", status: "failed" }]);
  assert.equal(rows[1].reserved, false);
});
test("Duplicate checks, incomplete summaries and inconsistent identities cannot show passing checks", () => {
  for (const mutate of [
    (p: JsonObject) => { (p.checks as JsonObject).total = 1; },
    (p: JsonObject) => { (p.checks as JsonObject).results = [{ check_id: "empty", status: "failed" }, { check_id: "empty", status: "passed" }]; },
  ]) {
    const event = observation(first, 1, true); mutate(event.data.payload as JsonObject);
    assert.equal(attemptTimeline(task, [event])[0].checks, null);
  }
  const changed = observation(first, 1, true); (changed.data.payload as JsonObject).snapshot_sha256 = "b".repeat(64);
  assert.equal(attemptTimeline(task, [observation(), changed])[0].inconsistent, true);
  const duplicate = attemptTimeline(task, [observation(), observation(second, 1, true)]);
  assert.ok(duplicate.every(row => row.inconsistent && !row.checks));
  const conflicting = observation(first, 1, true); (conflicting.data.payload as JsonObject).checks = null;
  assert.equal(attemptTimeline(task, [observation(first, 1, true), conflicting])[0].inconsistent, true);
});
