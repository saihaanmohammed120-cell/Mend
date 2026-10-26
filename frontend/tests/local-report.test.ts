import test from "node:test";
import assert from "node:assert/strict";
import { compareRepository, inspectReceipt, sha256 } from "../lib/local-review";
import { repositoryReport, policyReport, receiptReport } from "../lib/local-report";
import provenance from "../lib/captured-provenance.json";

test("Saved local reports bind current identities/limits and exclude source and execution authority", async () => {
  const review = await compareRepository({ "app.py": "# PRIVATE ORIGINAL\nx=1\n", "test_app.py": "# tests\n" }, { "app.py": "# PRIVATE CANDIDATE\nx=2\n", "test_app.py": "# tests\n" }, []);
  const repo = repositoryReport(review), policy = policyReport(review, 1, 20);
  assert.equal(repo.data.original_snapshot_sha256, review.originalHash);
  assert.deepEqual(repo.data.changed_paths, ["app.py"]);
  assert.deepEqual(policy.data.limits, { max_changed_lines: 1, max_changed_bytes: 20 });
  assert.equal(policy.data.preview.withinThresholds, false);
  assert.throws(() => policyReport(review, NaN, 20));
  const json = JSON.stringify(provenance), identity = await sha256(json);
  const receipt = receiptReport(await inspectReceipt(provenance, null), identity);
  assert.equal(receipt.data.reviewed_record_json_sha256, identity);
  assert.equal(receipt.data.inspection.sourceMatches, null);
  assert.throws(() => receiptReport(receipt.data.inspection, "missing"));
  for (const report of [repo, policy, receipt]) {
    assert.equal(report.kind, "mend_local_review_report"); assert.equal(report.source_text_included, false);
    assert.equal(report.execution, "not_run"); assert.equal(report.approval, "not_approved"); assert.equal(report.live_verification, false);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
    assert.equal(report.signature_verification, "not_performed");
  }
});
