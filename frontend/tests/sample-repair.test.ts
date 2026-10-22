import assert from "node:assert/strict";
import test from "node:test";
import { AFTER_SOURCE, BEFORE_SOURCE, createSampleBundle, numberedSource, REGRESSION_SOURCE, SAMPLE_CHECKS, SAMPLE_PHASES } from "../lib/sample-repair";

test("original source preserves the blank third line and valid comment", () => {
  const lines = numberedSource(BEFORE_SOURCE);
  assert.deepEqual(lines.map((line) => line.number), [1, 2, 3, 4, 5]);
  assert.equal(lines[1].text.trim(), "# Empty-input guard missing");
  assert.equal(lines[2].text, "");
  assert.equal(lines[3].text.trim(), "total = sum(values)");
});

test("patched source includes a complete empty-input guard with continuous numbers", () => {
  const lines = numberedSource(AFTER_SOURCE);
  assert.deepEqual(lines.map((line) => line.number), [1, 2, 3, 4, 5]);
  assert.equal(lines[1].text, "    if not values:");
  assert.equal(lines[2].text, "        return 0");
  assert.equal(lines[4].text.trim(), "return total / len(values)");
});

test("bundle has an explicit non-execution receipt and isolated copy of named checks", () => {
  const bundle = createSampleBundle();
  assert.equal(bundle.source, "demo");
  assert.equal(bundle.execution, "not_run");
  assert.equal(bundle.receipt.result, "illustrative_only");
  assert.equal(bundle.receipt.execution, "not_run");
  assert.match(bundle.receipt.notice, /No inference, isolated job, or live verification/);
  assert.deepEqual(bundle.receipt.checks, [...SAMPLE_CHECKS]);
  bundle.receipt.checks.pop();
  assert.equal(createSampleBundle().receipt.checks.length, 6);
  assert.equal(Object.isFrozen(SAMPLE_CHECKS), true);
  assert.equal(bundle.files.before["sales.py"], BEFORE_SOURCE);
  assert.equal(bundle.files.after["sales.py"], AFTER_SOURCE);
});

test("every named check is included in the downloadable regression suite", () => {
  for (const check of SAMPLE_CHECKS) assert.ok(REGRESSION_SOURCE.includes(`def ${check}(self):`));
  assert.match(REGRESSION_SOURCE, /assertEqual\(average_sales\(\[\]\), 0\)/);
  assert.equal(new Set(SAMPLE_CHECKS).size, SAMPLE_CHECKS.length);
});

test("phase descriptions retain the boundary between illustration and live execution", () => {
  assert.equal(SAMPLE_PHASES[0].code, BEFORE_SOURCE);
  assert.ok(SAMPLE_PHASES.slice(1).every((phase) => phase.code === AFTER_SOURCE));
  assert.match(SAMPLE_PHASES[2].log, /not a live test result/);
  assert.match(SAMPLE_PHASES[3].log, /execution: not_run/);
});
