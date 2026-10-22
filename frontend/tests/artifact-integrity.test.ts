import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkArtifactFiles } from "../lib/artifact-integrity";
import manifest from "../lib/captured-file-digests.json";
import { prepareProofManifest } from "../scripts/prepare-proof-manifest.mjs";

function filesFetcher(transform?: (name: string, bytes: Uint8Array) => Uint8Array): typeof fetch {
  return async (input, init) => {
    const name = String(input);
    assert.ok(name.startsWith("/example/") && !name.includes(".."));
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    let bytes: Uint8Array = new Uint8Array(readFileSync(new URL(`../public${name}`, import.meta.url)));
    if (transform) bytes = transform(name, bytes);
    return new Response(new Uint8Array(bytes), { status: 200 });
  };
}

test("Actual artifact bytes match build fingerprints using real Web Crypto SHA-256", async () => {
  const result = await checkArtifactFiles({ signal: new AbortController().signal, fetcher: filesFetcher() });
  assert.equal(result.kind, "matched");
  assert.equal(result.files.length, manifest.files.length);
  for (const file of result.files) {
    assert.equal(file.status, "match");
    assert.equal(file.actual, manifest.files.find(entry => entry.name === file.name)?.sha256);
  }
});

test("A changed source byte is a mismatch even when all other artifact files match", async () => {
  const result = await checkArtifactFiles({ signal: new AbortController().signal, fetcher: filesFetcher((name, bytes) => {
    if (name.endsWith("csv_tools.py") && !name.endsWith("test_csv_tools.py")) { const changed = bytes.slice(); changed[0] ^= 1; return changed; }
    return bytes;
  }) });
  assert.equal(result.kind, "mismatch");
  assert.equal(result.files.find(file => file.name === "csv_tools.py")?.status, "mismatch");
  assert.equal(result.files.filter(file => file.status === "match").length, manifest.files.length - 1);
});

test("HTTP failures and oversized streamed responses cannot become matches", async () => {
  await assert.rejects(checkArtifactFiles({ signal: new AbortController().signal, fetcher: async () => new Response("missing", { status: 404 }) }), /could not be read/);
  await assert.rejects(checkArtifactFiles({ signal: new AbortController().signal, fetcher: async () => new Response(new Uint8Array(1024 * 1024 + 1)) }), /size limit/);
});

test("Cancellation before or during reads never yields a matching result", async () => {
  const cancelled = new AbortController(); cancelled.abort();
  let fetched = false;
  await assert.rejects(checkArtifactFiles({ signal: cancelled.signal, fetcher: async () => { fetched = true; return new Response("unexpected"); } }), { name: "AbortError" });
  assert.equal(fetched, false);
  const controller = new AbortController();
  await assert.rejects(checkArtifactFiles({ signal: controller.signal, fetcher: async () => { controller.abort(); return new Response("cancelled"); } }), { name: "AbortError" });
});

test("Manifest generation binds the local capture and protects proof inputs against output aliasing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "mend-integrity-"));
  try {
    const assets = path.join(root, "assets"); mkdirSync(assets);
    for (const file of manifest.files) writeFileSync(path.join(assets, file.name), readFileSync(new URL(`../public${file.path}`, import.meta.url)));
    const source = path.join(assets, "csv_tools.py"); const original = readFileSync(source);
    assert.throws(() => prepareProofManifest(assets, source), /must not replace/);
    assert.deepEqual(readFileSync(source), original);
    const output = path.join(root, "module.json");
    linkSync(source, output);
    assert.throws(() => prepareProofManifest(assets, output), /must not replace/);
    assert.deepEqual(readFileSync(source), original);
    rmSync(output);
    const publicManifest = path.join(assets, "integrity.json");
    linkSync(source, publicManifest);
    assert.throws(() => prepareProofManifest(assets, output), /must not replace/);
    assert.deepEqual(readFileSync(source), original);
    assert.equal(existsSync(output), false);
    rmSync(publicManifest);
    assert.deepEqual(prepareProofManifest(assets, output), manifest);
    assert.equal(readFileSync(output, "utf8"), readFileSync(path.join(assets, "integrity.json"), "utf8"));
    writeFileSync(source, "different source\n");
    rmSync(output); rmSync(path.join(assets, "integrity.json"));
    assert.throws(() => prepareProofManifest(assets, output), /do not match/);
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(path.join(assets, "integrity.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
