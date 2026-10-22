import assert from "node:assert/strict";
import test from "node:test";
import { parseEvent, type Receipt } from "../lib/protocol";
const receipt: Receipt = {
  receipt_id: "r1",
  task_id: "t1",
  source: "live",
  status: "passed",
  model: "test-model",
  job_id: "j1",
  snapshot_sha256: "b".repeat(64),
  checks: { passed: 6, failed: 0, total: 6 },
  attempts: 2,
  duration_ms: 5000,
  created_at: "2026-10-11T00:00:00Z",
};
test("only a complete passing receipt qualifies as success", () => {
  assert.equal(
    parseEvent(JSON.stringify({ type: "receipt", receipt }), "live").type,
    "receipt",
  );
  for (const checks of [
    { passed: 0, failed: 0, total: 0 },
    { passed: 5, failed: 1, total: 6 },
    { passed: 7, failed: 0, total: 6 },
  ]) {
    assert.throws(() =>
      parseEvent(
        JSON.stringify({ type: "receipt", receipt: { ...receipt, checks } }),
        "live",
      ),
    );
  }
  assert.throws(() =>
    parseEvent(
      JSON.stringify({
        type: "state",
        status: "success",
        attempt: 1,
        message: "Model says fixed",
      }),
      "live",
    ),
  );
});
test("sample receipts cannot masquerade as live execution", () => {
  assert.throws(() =>
    parseEvent(
      JSON.stringify({
        type: "receipt",
        receipt: { ...receipt, source: "demo" },
      }),
      "live",
    ),
  );
  assert.throws(() =>
    parseEvent(
      JSON.stringify({
        type: "receipt",
        receipt: { ...receipt, snapshot_sha256: "missing" },
      }),
      "live",
    ),
  );
});
test("rejects malformed and over-budget events; preserves stderr text", () => {
  assert.throws(() =>
    parseEvent(
      JSON.stringify({
        type: "state",
        status: ["running"],
        attempt: 1,
        message: "Invalid status shape",
      }),
      "live",
    ),
  );
  assert.throws(() => parseEvent("not json", "live"));
  assert.throws(() =>
    parseEvent(
      JSON.stringify({
        type: "log",
        attempt: 5,
        text: "error",
        stream: "stderr",
      }),
      "live",
    ),
  );
  assert.throws(() => parseEvent("x".repeat(270_001), "live"));
  const e = parseEvent(
    JSON.stringify({
      type: "log",
      attempt: 1,
      text: "<script>untrusted</script>",
      stream: "stderr",
    }),
    "live",
  );
  assert.equal(e.type, "log");
});
