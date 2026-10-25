import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as projection from "../lib/hero-evidence";
import capturedExample from "../lib/captured-example.json";
import provenance from "../lib/captured-provenance.json";
import { createHash } from "node:crypto";
import { SPRING } from "../lib/motion";
import * as inspector from "../lib/captured-inspector";
import * as motionPreference from "../lib/use-motion-preference";
import * as artifactIntegrity from "../lib/artifact-integrity";
import { TrustBadge } from "../components/trust-badge";
import type { JsonObject, Task } from "../lib/mend-client";

const require = createRequire(import.meta.url);
const integrityOutput = ts.transpileModule(readFileSync(new URL("../components/artifact-integrity-check.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const integrityExports: { ArtifactIntegrityCheck?: React.ComponentType } = {};
vm.runInNewContext(integrityOutput, { exports: integrityExports, require(id: string) {
  if (id === "../lib/artifact-integrity") return artifactIntegrity;
  if (id === "./trust-badge") return { TrustBadge };
  return require(id);
} });
const provenanceOutput = ts.transpileModule(readFileSync(new URL("../components/provenance-receipt.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const provenanceExports: { ProvenanceReceipt?: React.ComponentType } = {};
vm.runInNewContext(provenanceOutput, { exports: provenanceExports, require(id: string) {
  if (id === "../lib/captured-provenance.json") return { default: provenance };
  if (id === "./artifact-integrity-check") return integrityExports;
  return require(id);
} });
const commandOutput = ts.transpileModule(readFileSync(new URL("../components/command-copy.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const commandExports: { CommandCopy?: React.ComponentType } = {};
vm.runInNewContext(commandOutput, { exports: commandExports, require(id: string) {
  if (id === "./command-copy.css") return {};
  return require(id);
} });
const workspaceOutput = ts.transpileModule(readFileSync(new URL("../components/captured-workspace.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const workspaceExports: { CapturedWorkspace?: React.ComponentType } = {};
vm.runInNewContext(workspaceOutput, { exports: workspaceExports, require(id: string) {
  if (id === "../lib/captured-example.json") return { default: capturedExample };
  if (id === "../lib/captured-inspector") return inspector;
  if (id === "./provenance-receipt") return provenanceExports;
  if (id === "./command-copy") return commandExports;
  return require(id);
} });
const output = ts.transpileModule(readFileSync(new URL("../components/proof-hero.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports: { ProofHero?: React.ComponentType<Record<string, unknown>> } = {};
vm.runInNewContext(output, { exports, require(id: string) {
  if (id === "./proof-hero.css") return {};
  if (id === "./provenance-receipt") return provenanceExports;
  if (id === "./command-copy") return commandExports;
  if (id === "./captured-workspace") return workspaceExports;
  if (id === "../lib/hero-evidence") return projection;
  if (id === "../lib/motion") return { SPRING };
  if (id === "../lib/use-motion-preference") return motionPreference;
  if (id === "../lib/captured-example.json") return { default: capturedExample };
  return require(id);
} });
const render = (task: Task | null = null, receipt: JsonObject | null = null) => renderToStaticMarkup(React.createElement(exports.ProofHero!, {
  task, receipt, events: [], runtime: { ready: false, mode: "test_unavailable", blockers: [] }, connection: "closed", receiptFresh: false,
}));
const task: Task = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "passed", contract_version: 1,
  contract: { required_check_ids: ["empty_input"] } };
const receipt: JsonObject = { receipt_id: "receipt-test", task_id: task.id, status: "passed", source: "live", live_verification: true,
  created_at: "2026-10-15T15:00:00Z", snapshot_sha256: "a".repeat(64), bundle_verified_sha256: "a".repeat(64),
  checks: { total: 1, passed: 1, failed: 0, skipped: 0, results: [{ check_id: "empty_input", status: "passed" }] } };

test("Hero server render prioritizes local intake and retains honest captured and live evidence", () => {
  const html = render();
  assert.equal((html.match(/data-primary-cta="true"/g) ?? []).length, 1);
  assert.ok(html.includes('href="#worked-example"'));
  assert.ok(html.indexOf('id="worked-example"') < html.indexOf('data-testid="live-run-slot"'));
  assert.ok(!html.includes('class="proof-live-slot" open=""'));
  assert.ok(html.includes('Prepare a bug'));
  assert.ok(html.includes('href="/fix"'));
  assert.match(html, /class="proof-authorship">This is a curated patch, not a model-generated repair\.<\/p>/);
  assert.equal(html.split("This is a curated patch, not a model-generated repair.").length - 1, 1);
  assert.ok(html.indexOf('class="proof-authorship"') < html.indexOf('role="tablist"'));
  assert.match(html, /<\/section><aside class="proof-evidence-legend"/);
  assert.equal(html.split('id="proof-reading"').length - 1, 1);
  for (const key of ["local", "provenance", "nebius"]) {
    assert.ok(html.includes(`id="evidence-${key}"`));
    assert.ok(html.includes(`href="#evidence-${key}"`));
  }
  assert.ok(html.includes("Real local checks.") && html.includes("Real document.") && html.includes("Not yet connected."));
  assert.ok(html.includes(capturedExample.source_sha256));
  assert.ok(html.includes('id="live-run"'));
  assert.ok(html.includes("Code that runs."));
  assert.ok(html.includes("Live execution unavailable"));
  assert.ok(html.includes("No Nebius job has run in this view."));
  assert.ok(html.includes('tabindex="0" role="region" aria-label="Current task stdout and stderr"'));
  assert.ok(html.includes("Not issued"));
  assert.ok(!html.includes("Checks recorded"));
  assert.ok(html.includes("test_empty_input"));
  assert.ok(html.includes("4 of 4 checks passed"));
  const limits = html.slice(html.indexOf('class="proof-limits"'), html.indexOf('class="proof-event"'));
  assert.ok(limits.includes("60s / job required"));
  assert.ok(limits.includes("Stop latency unverified"));
  assert.ok(html.includes("cancel-to-stop latency remains unverified"));
});
test("Hero server render never turns a simulated receipt into a passing run", () => {
  const html = render(task, { ...receipt, source: "demo", signature: "fabricated-signature" }).split('id="live-run"')[1];
  assert.ok(html.includes("Evidence rejected"));
  assert.ok(!html.includes("fabricated-signature"));
  assert.ok(!html.includes("a".repeat(64)));
  assert.ok(!html.includes("empty_input"));
});
test("Hero server render shows only actual validated receipt values, with explicit signing and commit gaps", () => {
  const html = render(task, { ...receipt, signature: "untrusted-signature", commit_hash: "b".repeat(40) });
  assert.ok(html.includes("Checks recorded"));
  assert.ok(!html.includes("2026-10-15T15:00:00Z"));
  assert.ok(html.includes("Not issued"));
  assert.ok(html.includes("empty_input"));
  assert.ok(html.includes("a".repeat(64)));
  assert.ok(html.includes("SOURCE SNAPSHOT SHA-256"));
  assert.ok(html.includes("SIGSTORE SIGNATURE"));
  assert.ok(html.includes("Not available"));
  assert.ok(!html.includes("untrusted-signature"));
  assert.ok(!html.includes("b".repeat(40)));
});

// Check the actual captured file, not a hand-entered pass count or source hash.
test("Captured example binds the before-failure and after-pass output to exact source bytes", () => {
  assert.equal(capturedExample.source, "captured_local");
  assert.equal(capturedExample.live_verification, false);
  assert.equal(createHash("sha256").update(capturedExample.after_source).digest("hex"), capturedExample.source_sha256);
  assert.equal(capturedExample.before.returncode, 1);
  assert.equal(capturedExample.after.returncode, 0);
  assert.ok(capturedExample.before.stderr.includes("IndexError: list index out of range"));
  assert.equal(capturedExample.after.checks.results.length, capturedExample.after.checks.total);
  for (const check of capturedExample.after.checks.results) {
    assert.equal(check.status, "passed");
    assert.ok(capturedExample.after.stderr.includes(check.check_id));
  }
  assert.ok(capturedExample.after.stderr.endsWith("OK\n"));
  assert.ok(Date.parse(capturedExample.captured_at) >= Date.parse(capturedExample.after.finished_at));
});

test("Captured raw-output regions can receive keyboard focus without changing the recorded output", () => {
  const html = renderToStaticMarkup(React.createElement(workspaceExports.CapturedWorkspace!));
  for (const label of ["Recorded before stderr", "Recorded after stderr"]) {
    const tag = html.match(new RegExp(`<pre[^>]*aria-label="${label}"[^>]*>`))?.[0];
    assert.ok(tag, label);
    assert.ok(tag.includes('tabindex="0"') && tag.includes('role="region"'));
  }
  assert.ok(html.includes('IndexError: list index out of range'));
  assert.ok(html.includes('test_empty_input'));
});

test("Flow server render has real fail/repair/rerun edges and no bypass to receipt", () => {
  const flowOutput = ts.transpileModule(readFileSync(new URL("../components/proof-flow.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const flowExports: { ProofFlow?: React.ComponentType } = {};
  vm.runInNewContext(flowOutput, { exports: flowExports, require(id: string) {
    return id === "./proof-flow.css" ? {} : require(id);
  } });
  const html = renderToStaticMarkup(React.createElement(flowExports.ProofFlow!));
  for (const edge of ["task-write", "write-run", "run-diagnose", "diagnose-repair", "repair-run", "run-receipt"]) {
    assert.equal((html.match(new RegExp(`data-edge="${edge}"`, "g")) ?? []).length, 2);
  }
  assert.ok(!html.includes('data-edge="repair-receipt"'));
  assert.ok(html.includes("Planned Nebius workflow · see legend"));
  assert.ok(html.includes('href="#evidence-nebius"'));
  assert.equal((html.match(/class="proof-flow-stage-number"/g) ?? []).length, 4);
  assert.equal((html.match(/role="img"/g) ?? []).length, 2);
});

 test("Standards receipt renders the actual unsigned document and cannot invent a Sigstore identity", () => {
  const html = renderToStaticMarkup(React.createElement(provenanceExports.ProvenanceReceipt!));
  assert.ok(html.includes('data-signature-state="unsigned"'));
  assert.ok(html.includes(provenance._type) && html.includes(provenance.predicateType));
  assert.ok(html.includes(provenance.subject[0].digest.sha256));
  assert.ok(html.includes(provenance.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit!));
  assert.ok(html.includes("SLSA provenance") && html.includes("Not signed"));
  assert.ok(!html.includes("Signed with Sigstore"));
  assert.ok(html.includes('href="/example/provenance.json"'));
  assert.ok(html.includes('Not checked in this browser.'));
  assert.ok(html.includes('Check file hashes'));
  assert.ok(html.includes('href="/example/integrity.json"'));
  assert.ok(html.includes('File consistency only.'));
  assert.ok(!html.includes('data-integrity="match"'));
  assert.ok(!html.includes('The fetched files match this build’s recorded hashes.')); 
 });

 test("Roadmap separates actual tools from remaining live and hosted work", () => {
  const output = ts.transpileModule(readFileSync(new URL("../components/proof-roadmap.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { ProofRoadmap?: React.ComponentType } = {};
  vm.runInNewContext(output, { exports, require(id: string) { return id === "./proof-roadmap.css" ? {} : require(id); } });
  const html = renderToStaticMarkup(React.createElement(exports.ProofRoadmap!));
  assert.equal((html.match(/<article>/g) ?? []).length, 6);
  assert.ok(!html.includes("Not yet built"));
  assert.ok(html.includes("What’s ready. What’s next."));
  assert.ok(html.includes("Live repair and dependency execution remain pending."));
  assert.ok(html.includes("CI running · enforcement pending"));
  assert.ok(html.includes("Offline review gate available"));
  assert.ok(html.includes("API implemented · hosting pending"));
  assert.ok(html.includes("Offline analyzer available"));
  assert.ok(html.includes("Local extension available"));
  assert.equal((html.match(/class="proof-roadmap-guide"/g) ?? []).length, 6);
  assert.ok(!/<(?:button|input|select|textarea)\b|role="button"|tabindex=/i.test(html));
 });
