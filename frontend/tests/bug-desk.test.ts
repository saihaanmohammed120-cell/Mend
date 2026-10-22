import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as intake from "../lib/bug-intake";
import capture from "../lib/captured-example.json";

type Element = { type: unknown; props: Record<string, unknown> };
const identity: intake.BugInputIdentity = { intake_json_sha256: "b".repeat(64), original_source_sha256: "a".repeat(64) };

function desk(fingerprint: (packet: intake.BugIntake) => Promise<intake.BugInputIdentity> = async () => identity) {
  const cells: unknown[] = [], cleanups = new Map<number, () => void>();
  let index = 0, tree: Element, focused = "", failDownload = false;
  let effects: Array<() => void> = [];
  const blobs: Blob[] = [], revoked: string[] = [];
  const timers = new Map<number, () => void>();
  const disclosure = { open: false };
  const react = {
    useState(initial: unknown) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = initial;
      return [cells[cell], (next: unknown) => { cells[cell] = typeof next === "function" ? next(cells[cell]) : next; }];
    },
    useRef(initial: unknown) { const cell = index++; if (!(cell in cells)) cells[cell] = { current: initial }; return cells[cell]; },
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const cell = index++, previous = cells[cell] as unknown[] | undefined;
      if (previous && deps.length === previous.length && deps.every((value, i) => value === previous[i])) return;
      cells[cell] = deps;
      effects.push(() => { cleanups.get(cell)?.(); const cleanup = callback(); if (cleanup) cleanups.set(cell, cleanup); });
    },
  };
  const output = ts.transpileModule(readFileSync(new URL("../components/bug-desk.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { BugDesk?: () => Element } = {};
  vm.runInNewContext(output, {
    exports, Blob, Map, TextEncoder,
    URL: { createObjectURL: (blob: Blob) => { blobs.push(blob); return `blob:desk-${blobs.length}`; }, revokeObjectURL: (url: string) => revoked.push(url) },
    document: { body: { appendChild() {} }, createElement: () => ({ href: "", download: "", click() { if (failDownload) throw new Error("Download blocked"); }, remove() {} }) },
    setTimeout: (callback: () => void) => { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id),
    require(id: string) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
      if (id === "../lib/bug-intake") return { ...intake, fingerprintBugIntake: fingerprint };
      if (id === "../lib/captured-example.json") return { default: capture };
      if (id === "./bug-desk.css") return {};
      if (id === "next/link") return { default: "a" };
      if (id === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  const nodes = (node: unknown = tree): Element[] => {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [element, ...nodes(element.props.children ?? null)];
  };
  const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
  function render() {
    index = 0; effects = []; tree = exports.BugDesk!();
    for (const node of nodes()) {
      const target = { focus: () => { focused = String(node.props.name ?? node.props.className); }, closest: () => ["source", "filePath"].includes(String(node.props.name)) ? disclosure : null };
      if (typeof node.props.ref === "function") node.props.ref(target);
      else if (node.props.ref && typeof node.props.ref === "object") (node.props.ref as { current: unknown }).current = target;
    }
    effects.forEach(effect => effect());
  }
  function click(label: string) {
    const button = nodes().find(node => node.type === "button" && (node.props["aria-label"] === label || text(node).trim() === label));
    assert.ok(button, `Missing button ${label}`); (button.props.onClick as () => void)(); render();
  }
  function change(field: keyof intake.BugDraft, value: string) {
    const node = nodes().find(node => node.props.name === field)!;
    (node.props.onChange as (event: unknown) => void)({ target: { value } }); render();
  }
  render();
  return { nodes, click, change, blobs, revoked, timers, disclosure, text: () => text(tree),
    get focused() { return focused; }, failDownloads() { failDownload = true; },
    async settle() { await Promise.resolve(); await Promise.resolve(); render(); }, unmount() { cleanups.forEach(cleanup => cleanup()); } };
}

test("bug desk validates locally with focused errors and no native source submission path", () => {
  const h = desk(); h.click("Review intake");
  assert.equal(h.focused, "bug-errors");
  assert.ok(h.text().includes("Add an error message or a small Python sample."));
  assert.equal(h.nodes().some(node => node.type === "form" || node.props.type === "submit"), false);
  assert.ok(h.text().includes("Execution is gated")); assert.equal(h.blobs.length, 0);
});

test("review preserves captured original input, exports schema one and retires review after edits", async () => {
  const h = desk(); h.click("Load captured input"); h.click("Review intake"); await h.settle();
  assert.equal(h.focused, "bug-review"); assert.ok(h.text().includes(identity.intake_json_sha256));
  h.click("Download intake JSON");
  const packet = JSON.parse(await h.blobs[0].text());
  assert.equal(packet.original_source, capture.before_source);
  assert.deepEqual(packet.evidence, { investigation: "not_run", execution: "not_run", regression: "not_generated" });
  assert.equal(packet.schema_version, 1); assert.ok(h.text().includes("Download requested. No task was created and no checks ran."));
  h.click("Change original source"); assert.equal(h.focused, "source"); assert.equal(h.disclosure.open, true);
  h.change("source", "Changed original bytes");
  assert.ok(!h.text().includes("Download intake JSON")); assert.ok(!h.text().includes(identity.intake_json_sha256));
  h.unmount(); assert.equal(h.timers.size, 0); assert.deepEqual(h.revoked, ["blob:desk-1"]);
});

test("late fingerprints cannot overwrite a newer review or reappear after edits", async () => {
  const pending: Array<(value: intake.BugInputIdentity) => void> = [];
  const h = desk(() => new Promise(resolve => pending.push(resolve)));
  h.change("errorMessage", "First failure"); h.click("Review intake");
  h.change("errorMessage", "Second failure"); h.click("Review intake");
  const newer = { intake_json_sha256: "c".repeat(64), original_source_sha256: null };
  pending[1](newer); await h.settle(); pending[0](identity); await h.settle();
  assert.ok(h.text().includes(newer.intake_json_sha256)); assert.ok(!h.text().includes(identity.intake_json_sha256));
  h.click("Review again"); h.change("expectedBehavior", "Changed during fingerprinting"); pending[2](identity); await h.settle();
  assert.ok(!h.text().includes(identity.intake_json_sha256)); assert.ok(!h.text().includes("Download intake JSON"));
});

test("clear and undo preserve exact input but require a fresh review", async () => {
  const h = desk(); h.change("filePath", "sample.py"); h.change("source", "# 😀\r\n\r\nprint('é')\r\n"); h.click("Review intake");
  h.click("Clear fields"); h.click("Undo clear");
  assert.equal(h.focused, "errorMessage"); assert.ok(!h.text().includes("Download intake JSON"));
  h.click("Review intake"); h.click("Download intake JSON");
  assert.equal(JSON.parse(await h.blobs[0].text()).original_source, "# 😀\r\n\r\nprint('é')\r\n");
  h.unmount();
});

test("unavailable fingerprints and blocked downloads retain the reviewed input honestly", async () => {
  const h = desk(async () => { throw new Error("Crypto unavailable"); });
  h.change("errorMessage", "Exact error"); h.click("Review intake"); await h.settle();
  assert.ok(h.text().includes("Fingerprints unavailable in this browser."));
  h.failDownloads(); h.click("Download intake JSON");
  assert.ok(h.text().includes("Download could not start. Your review is intact; retry below."));
  assert.ok(h.text().includes("Exact error")); assert.equal(h.timers.size, 0); assert.deepEqual(h.revoked, ["blob:desk-1"]);
});
