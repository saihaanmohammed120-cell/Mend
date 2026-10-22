import test from "node:test";
import assert from "node:assert/strict";
import { projectHeroEvidence } from "../lib/hero-evidence";
import type { JsonObject, MendEvent, Task } from "../lib/mend-client";

const task: Task = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "passed", contract_version: 1,
  contract: { required_check_ids: ["empty", "duplicates"] }, contract_sha256: "c".repeat(64) };
const receipt: JsonObject = { receipt_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", task_id: task.id,
  status: "passed", source: "live", live_verification: true, created_at: "2026-10-15T15:00:00Z",
  contract_sha256: task.contract_sha256, snapshot_sha256: "a".repeat(64), bundle_verified_sha256: "a".repeat(64),
  checks: { total: 2, passed: 2, failed: 0, skipped: 0,
    results: [{ check_id: "empty", status: "passed" }, { check_id: "duplicates", status: "passed" }] } };
const project = (value: JsonObject | null = receipt, current: Task | null = task, events: MendEvent[] = []) =>
  projectHeroEvidence({ task: current, receipt: value, events });
const log = (id: number, message: string, owner = task.id): MendEvent =>
  ({ id: String(id), type: "log", data: { task_id: owner, message } });

test("Hero starts empty and never presents counters without a validated receipt", () => {
  assert.equal(project(null, null).kind, "empty");
  const pending = project(null, { ...task, status: "running" });
  assert.equal(pending.kind, "pending");
  assert.equal(pending.passed, null); assert.equal(pending.total, null);
  assert.deepEqual(pending.checks, []); assert.equal(pending.snapshot, null);
  assert.equal(project(null).kind, "pending");
});
test("Hero requires passed task plus exact frozen live check evidence", () => {
  const result = project();
  assert.equal(result.kind, "verified");
  assert.equal(result.receiptId, receipt.receipt_id);
  assert.equal(result.recordedAt, receipt.created_at);
  assert.equal(result.snapshot, receipt.snapshot_sha256);
  assert.equal(result.passed, 2); assert.equal(result.total, 2);
  assert.deepEqual(result.checks, [{ id: "empty", status: "passed" }, { id: "duplicates", status: "passed" }]);
  assert.equal(project(receipt, { ...task, status: "running" }).kind, "rejected");
});
test("Synthetic receipts and foreign task evidence never acquire success markers", () => {
  for (const candidate of [{ ...receipt, source: "demo" }, { ...receipt, source: "local_test" },
    { ...receipt, task_id: "foreign" }, { ...receipt, live_verification: false }]) {
    const result = project(candidate);
    assert.equal(result.kind, "rejected"); assert.equal(result.passed, null);
    assert.equal(result.receiptId, null); assert.equal(result.recordedAt, null); assert.deepEqual(result.checks, []);
  }
  assert.equal(project(receipt, null).kind, "rejected");
});
test("Incomplete checks and inconsistent source bundle are rejected", () => {
  assert.equal(project({ ...receipt, checks: { total: 2, passed: 2, failed: 0, skipped: 0,
    results: [{ check_id: "empty", status: "passed" }, { check_id: "empty", status: "passed" }] } }).kind, "rejected");
  assert.equal(project({ ...receipt, bundle_verified_sha256: "b".repeat(64) }).kind, "rejected");
});
test("Missing or malformed receipt timestamps never become invented timestamps", () => {
  const { created_at: ignored, ...withoutTimestamp } = receipt;
  void ignored;
  assert.equal(project(withoutTimestamp).recordedAt, null);
  for (const value of ["bad", "2026-10-15", "2026-10-15T15:00:00", "2026-02-30T15:00:00Z", "2026-10-15T24:00:00Z", 123])
    assert.equal(project({ ...receipt, created_at: value }).recordedAt, null);
  assert.equal(project({ ...receipt, created_at: "2026-10-15T20:30:00+05:30" }).recordedAt, "2026-10-15T20:30:00+05:30");
});
test("Arbitrary signature and commit fields are never projected as proof", () => {
  const output = project({ ...receipt, signature: "invented", commit_hash: "invented", signed: true });
  assert.equal(output.kind, "verified");
  assert.equal("signature" in output, false); assert.equal("commit_hash" in output, false);
  assert.equal(JSON.stringify(output).includes("invented"), false);
});
test("Only matching task log events become bounded plain text", () => {
  const events = [log(1, "foreign", "other"), { id: "2", type: "state" as const, data: { task_id: task.id, message: "state" } },
    log(3, "\u001b[31mactual stderr\u001b[0m\u0000")];
  assert.deepEqual(project(null, task, events).logLines, ["actual stderr"]);
  assert.deepEqual(project(null, null, events).logLines, []);
  const output = project(null, task, Array.from({ length: 30 }, (_, index) => log(index, `${index}:` + "x".repeat(5000))));
  assert.equal(output.logLines.length, 12);
  assert.ok(output.logLines[0].startsWith("18:"));
  assert.ok(output.logLines.every(line => line.length <= 2100));
});
