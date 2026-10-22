import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beginBugIntakeDownload, fingerprintBugIntake, prepareBugIntake, previewSource, serializeBugIntake, PREVIEW_LINE_LIMIT, PREVIEW_CHARACTER_LIMIT, type BugDraft, type BugDownloadEnvironment } from "../lib/bug-intake";

const blank: BugDraft = { filePath: "", errorMessage: "", source: "", expectedBehavior: "" };

test("local identities bind exact UTF-8 source and downloaded JSON without changing schema one", async () => {
  const result = prepareBugIntake({ ...blank, filePath: "sample.py", source: "# 😀\r\nprint('é')\r\n", errorMessage: "Reported error" });
  if (!result.ok) throw new Error("Expected valid intake");
  const exported = serializeBugIntake(result.packet);
  const identity = await fingerprintBugIntake(result.packet);
  assert.equal(identity.original_source_sha256, createHash("sha256").update(result.packet.original_source!).digest("hex"));
  assert.equal(identity.intake_json_sha256, createHash("sha256").update(exported).digest("hex"));
  assert.equal(serializeBugIntake(result.packet), exported);
  assert.equal(Object.keys(JSON.parse(exported)).includes("identity"), false);
  const changed = await fingerprintBugIntake({ ...result.packet, expected_behavior: "Changed expectation" });
  assert.equal(changed.original_source_sha256, identity.original_source_sha256);
  assert.notEqual(changed.intake_json_sha256, identity.intake_json_sha256);
  assert.notEqual((await fingerprintBugIntake({ ...result.packet, original_source: result.packet.original_source!.replaceAll("\r\n", "\n") })).original_source_sha256, identity.original_source_sha256);
});

test("an error-only fingerprint keeps missing source distinct from an empty file", async () => {
  const result = prepareBugIntake({ ...blank, errorMessage: "Reported error" });
  if (!result.ok) throw new Error("Expected valid intake");
  assert.equal((await fingerprintBugIntake(result.packet)).original_source_sha256, null);
  assert.equal((await fingerprintBugIntake({ ...result.packet, original_source: "" })).original_source_sha256, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("empty intake cannot masquerade as a prepared case", () => {
  assert.equal(prepareBugIntake(blank).ok, false);
});

test("error-only packet records absent source and no execution evidence", () => {
  const result = prepareBugIntake({ ...blank, errorMessage: "  ZeroDivisionError: division by zero\n" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid intake");
  assert.equal(result.packet.reported_error, "  ZeroDivisionError: division by zero\n");
  assert.equal(result.packet.original_source, null);
  assert.equal(result.packet.file_path, null);
  assert.deepEqual(result.packet.evidence, { investigation: "not_run", execution: "not_run", regression: "not_generated" });
  assert.equal(result.packet.kind, "mend_bug_intake");
});

test("original source and blank lines survive JSON export unchanged", () => {
  const source = "def average(values):\r\n\r\n    return sum(values) / len(values)\r\n";
  const result = prepareBugIntake({ ...blank, filePath: "average.py", source });
  if (!result.ok) throw new Error("Expected valid intake");
  assert.equal(result.packet.original_source, source);
  assert.deepEqual(JSON.parse(serializeBugIntake(result.packet)), result.packet);
});

test("source must identify a single safe Python module", () => {
  for (const filePath of ["", "../secret.py", "/tmp/code.py", "folder/code.py", ".hidden.py", "code\\path.py", "app.ts", "-app.py"]) {
    const result = prepareBugIntake({ ...blank, filePath, source: "print('sample')" });
    assert.equal(result.ok, false, filePath);
    if (!result.ok) assert.ok(result.issues.filePath);
  }
});

test("UTF-8 byte limits apply independently of textarea character limits", () => {
  const result = prepareBugIntake({ ...blank, filePath: "app.py", source: "é".repeat(100_001) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.source);
});

test("invalid Unicode and NUL source are rejected before export", () => {
  for (const source of ["\ud800", "\udfff", "print('sample')\0"]) {
    const result = prepareBugIntake({ ...blank, filePath: "app.py", source });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.source);
  }
});

test("reported error and expected behavior are bounded", () => {
  for (const field of ["errorMessage", "expectedBehavior"] as const) {
    const result = prepareBugIntake({ ...blank, errorMessage: "reported failure", [field]: "a".repeat(8001) });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues[field]);
  }
});

test("whitespace source accompanying an error is preserved as original evidence", () => {
  const result = prepareBugIntake({ ...blank, filePath: "empty.py", source: " \n\n", errorMessage: "Module does not define the required function" });
  if (!result.ok) throw new Error("Expected valid intake");
  assert.equal(result.packet.original_source, " \n\n");
});

test("preview limits rows without changing the exported source", () => {
  const source = "x\n".repeat(90_000);
  const result = prepareBugIntake({ ...blank, filePath: "app.py", source });
  if (!result.ok) throw new Error("Expected valid intake");
  const preview = previewSource(source);
  assert.equal(preview.lines.length, PREVIEW_LINE_LIMIT);
  assert.equal(preview.truncated, true);
  assert.equal(JSON.parse(serializeBugIntake(result.packet)).original_source, source);
});

test("preview bounds long lines and preserves blank-line numbering inputs", () => {
  const preview = previewSource("x".repeat(PREVIEW_CHARACTER_LIMIT + 1));
  assert.equal(preview.lines[0].length, PREVIEW_CHARACTER_LIMIT);
  assert.equal(preview.truncated, true);
  assert.deepEqual(previewSource("a\n\nc\n"), { lines: ["a", "", "c", ""], truncated: false });
});

test("preview truncation does not split a Unicode surrogate pair", () => {
  const preview = previewSource("x".repeat(PREVIEW_CHARACTER_LIMIT - 1) + "😀end");
  assert.equal(preview.lines[0], "x".repeat(PREVIEW_CHARACTER_LIMIT - 1));
  assert.equal(preview.truncated, true);
});

function downloadFixture(failure?: "create" | "append" | "click" | "remove" | "url") {
  const events: string[] = [];
  let blob: Blob | null = null;
  const anchor = {
    href: "", download: "",
    click() { events.push("click"); if (failure === "click") throw new Error("download denied"); },
    remove() { events.push("remove"); if (failure === "remove") throw new Error("remove denied"); },
  };
  const browser: BugDownloadEnvironment = {
    createObjectURL(value) { events.push("url"); if (failure === "url") throw new Error("URL unavailable"); blob = value; return "blob:local-intake"; },
    revokeObjectURL(value) { assert.equal(value, "blob:local-intake"); events.push("revoke"); },
    createAnchor() { events.push("create"); if (failure === "create") throw new Error("anchor unavailable"); return anchor; },
    appendAnchor(value) { assert.equal(value, anchor); events.push("append"); if (failure === "append") throw new Error("append denied"); },
  };
  return { events, browser, anchor, getBlob: () => blob };
}

test("successful download removes the anchor and hands URL ownership to the caller", async () => {
  const result = prepareBugIntake({ ...blank, filePath: "sample.py", source: "# 😀\n\nprint('<script>literal</script>')\n", errorMessage: "  Original error\n" });
  if (!result.ok) throw new Error("Expected valid intake");
  const fixture = downloadFixture();
  assert.equal(beginBugIntakeDownload(result.packet, fixture.browser), "blob:local-intake");
  assert.deepEqual(fixture.events, ["url", "create", "append", "click", "remove"]);
  assert.equal(fixture.anchor.href, "blob:local-intake");
  assert.equal(fixture.anchor.download, "mend-bug-intake.json");
  const blob = fixture.getBlob();
  assert.ok(blob);
  assert.equal(blob.type, "application/json");
  assert.equal(await blob.text(), serializeBugIntake(result.packet));
});

test("download failures release the URL and remove any acquired anchor", () => {
  const result = prepareBugIntake({ ...blank, errorMessage: "reported error" });
  if (!result.ok) throw new Error("Expected valid intake");
  for (const failure of ["create", "append", "click"] as const) {
    const fixture = downloadFixture(failure);
    assert.throws(() => beginBugIntakeDownload(result.packet, fixture.browser));
    assert.equal(fixture.events.filter((event) => event === "revoke").length, 1, failure);
    if (failure !== "create") assert.ok(fixture.events.includes("remove"), failure);
  }
});

test("failed anchor removal cannot prevent object URL revocation", () => {
  const result = prepareBugIntake({ ...blank, errorMessage: "reported error" });
  if (!result.ok) throw new Error("Expected valid intake");
  const fixture = downloadFixture("remove");
  assert.throws(() => beginBugIntakeDownload(result.packet, fixture.browser));
  assert.equal(fixture.events.at(-1), "revoke");
});

test("failed URL creation acquires no anchor or pending download", () => {
  const result = prepareBugIntake({ ...blank, errorMessage: "reported error" });
  if (!result.ok) throw new Error("Expected valid intake");
  const fixture = downloadFixture("url");
  assert.throws(() => beginBugIntakeDownload(result.packet, fixture.browser));
  assert.deepEqual(fixture.events, ["url"]);
});
