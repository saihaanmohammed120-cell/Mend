import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as intake from "../lib/bug-intake";
import capture from "../lib/captured-example.json";

type Element = { type: unknown; props: Record<string, unknown> };
function caseWorkflow() {
  const cells: unknown[] = [];
  let index = 0, tree: Element, focused = "", clicked = 0, removed = 0, failDownload = false;
  let effects: Array<() => void | (() => void)> = [], cleanup: Array<() => void> = [];
  const blobs: Blob[] = [], revoked: string[] = [];
  const timers = new Map<number, () => void>();
  const sourceDisclosure = { open: false };
  const react = {
    useId: () => "local-test",
    useState(initial: unknown) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = initial;
      return [cells[cell], (next: unknown) => { cells[cell] = typeof next === "function" ? next(cells[cell]) : next; }];
    },
    useRef(initial: unknown) { const cell = index++; if (!(cell in cells)) cells[cell] = { current: initial }; return cells[cell]; },
    useEffect(effect: () => void | (() => void)) { effects.push(effect); },
  };
  const output = ts.transpileModule(readFileSync(new URL("../components/repair-case.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { RepairCase?: () => Element } = {};
  vm.runInNewContext(output, {
    exports, Blob, Map,
    URL: { createObjectURL: (blob: Blob) => { blobs.push(blob); return `blob:case-${blobs.length}`; }, revokeObjectURL: (url: string) => revoked.push(url) },
    document: { body: { appendChild() {} }, createElement: () => ({ href: "", download: "", click() { if (failDownload) throw new Error("Blocked download"); clicked++; }, remove() { removed++; } }) },
    setTimeout: (callback: () => void) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    require(id: string) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
      if (id === "../lib/bug-intake") return intake;
      if (id === "../lib/captured-example.json") return { default: capture };
      if (id === "./repair-case.css") return {};
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
  const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
  function render() {
    index = 0; effects = []; tree = exports.RepairCase!();
    for (const node of nodes()) {
      const target = { focus: () => { focused = String(node.props.name ?? node.props.className); }, closest: () => node.props.name === "source" ? sourceDisclosure : null };
      if (typeof node.props.ref === "function") node.props.ref(target);
      else if (node.props.ref && typeof node.props.ref === "object") (node.props.ref as { current: unknown }).current = target;
    }
    cleanup = effects.map(effect => effect()).filter((value): value is () => void => typeof value === "function");
  }
  function button(label: string) {
    const found = nodes().find(node => node.type === "button" && text(node).trim() === label);
    assert.ok(found, `Missing button ${label}`); return found;
  }
  function change(name: keyof intake.BugDraft, value: string) {
    const field = nodes().find(node => node.props.name === name)!;
    (field.props.onChange as (event: unknown) => void)({ target: { value } }); render();
  }
  function click(label: string) { (button(label).props.onClick as () => void)(); render(); }
  function prepare() { click("Review the case"); }
  render();
  return { nodes, text: () => text(tree), change, click, prepare, blobs, revoked, timers, sourceDisclosure,
    get focused() { return focused; }, get clicked() { return clicked; }, get removed() { return removed; },
    failNextDownload() { failDownload = true; }, unmount() { cleanup.forEach(dispose => dispose()); } };
}

test("Case workflow rejects empty input, focuses errors and never creates execution evidence", () => {
  const h = caseWorkflow(); h.prepare();
  assert.equal(h.focused, "case-errors");
  assert.ok(h.text().includes("Add an error message or a small Python sample."));
  assert.ok(!h.nodes().some(node => node.type === "button" && h.text().includes("Download case JSON")));
  assert.equal(h.blobs.length, 0);
  assert.ok(!h.nodes().some(node => node.type === "form" || node.props.type === "submit"), "Local inputs must have no native submission path before hydration.");
});

test("Actual case handlers preserve original source, export only validated input and invalidate stale packets", async () => {
  const h = caseWorkflow();
  h.click("Use the captured CSV case"); h.prepare();
  assert.equal(h.focused, "case-review");
  h.click("Download case JSON");
  const exported = JSON.parse(await h.blobs[0].text());
  assert.equal(exported.original_source, capture.before_source);
  assert.equal(exported.reported_error, "IndexError: list index out of range");
  assert.deepEqual(exported.evidence, { investigation: "not_run", execution: "not_run", regression: "not_generated" });
  assert.equal(h.clicked, 1); assert.equal(h.removed, 1);
  assert.ok(h.text().includes("Download requested. No backend task was created and no checks ran."));
  h.change("expectedBehavior", "A different expected outcome");
  assert.ok(!h.text().includes("Download case JSON"));
  assert.ok(h.text().includes("The validated case will appear here."));
  h.unmount(); assert.equal(h.timers.size, 0); assert.deepEqual(h.revoked, ["blob:case-1"]);
});

test("Source errors inside a closed disclosure open the field before focusing it", () => {
  const h = caseWorkflow(); h.change("filePath", "example.py"); h.change("source", "x".repeat(intake.SOURCE_BYTE_LIMIT + 1)); h.prepare();
  const sourceError = h.nodes().find(node => node.type === "a" && String(node.props.href).endsWith("-source"));
  assert.ok(sourceError);
  (sourceError.props.onClick as (event: unknown) => void)({ preventDefault() {} });
  assert.equal(h.sourceDisclosure.open, true); assert.equal(h.focused, "source");
});

test("A blocked case download retains review data and releases the acquired object URL", () => {
  const h = caseWorkflow(); h.change("errorMessage", "Example failure"); h.prepare(); h.failNextDownload(); h.click("Download case JSON");
  assert.ok(h.text().includes("The download could not start."));
  assert.ok(h.text().includes("Example failure"));
  assert.deepEqual(h.revoked, ["blob:case-1"]); assert.equal(h.timers.size, 0);
  h.click("Clear fields"); assert.ok(!h.text().includes("Example failure")); assert.equal(h.focused, "errorMessage");
});

test("Undo clear restores exact draft inputs without restoring an old validated packet", async () => {
  const h = caseWorkflow(); h.click("Use the captured CSV case"); h.prepare();
  h.click("Clear fields");
  assert.ok(h.text().includes("Undo clear"));
  assert.ok(!h.text().includes("Download case JSON"));
  h.click("Undo clear");
  const source = h.nodes().find(node => node.props.name === "source")!;
  assert.equal(source.props.value, capture.before_source);
  assert.ok(!h.text().includes("Download case JSON"));
  h.prepare(); h.click("Download case JSON");
  assert.equal(JSON.parse(await h.blobs[0].text()).original_source, capture.before_source);
  h.unmount();
});

test("New input retires undo and field-specific review actions target the intended input", () => {
  const h = caseWorkflow(); h.change("errorMessage", "Old problem"); h.click("Clear fields");
  h.change("errorMessage", "New problem"); assert.ok(!h.text().includes("Undo clear"));
  h.prepare();
  const sourceChange = h.nodes().find(node => node.props["aria-label"] === "Change original source")!;
  (sourceChange.props.onClick as () => void)();
  assert.equal(h.focused, "source"); assert.equal(h.sourceDisclosure.open, true);
  const expectedChange = h.nodes().find(node => node.props["aria-label"] === "Change expected behavior")!;
  (expectedChange.props.onClick as () => void)();
  assert.equal(h.focused, "expectedBehavior");
  assert.ok(h.text().includes("No source is included."));
});

test("Case progress advances only after validation and a requested download, then resets after edits", () => {
  const h = caseWorkflow();
  const expectStep = (number: number, states: string[]) => {
    const steps = h.nodes().filter(node => node.props["data-step-state"]);
    assert.deepEqual(steps.map(node => node.props["data-step-state"]), states);
    assert.equal(steps.filter(node => node.props["aria-current"] === "step").length, 1);
    assert.equal(steps[number].props["aria-current"], "step");
  };
  expectStep(0, ["current", "upcoming", "upcoming"]);
  h.prepare(); expectStep(0, ["current", "upcoming", "upcoming"]);
  h.change("errorMessage", "IndexError: list index out of range");
  h.prepare(); expectStep(1, ["complete", "current", "upcoming"]);
  assert.ok(h.text().includes("Current step"));
  h.click("Download case JSON"); expectStep(2, ["complete", "complete", "current"]);
  assert.ok(h.text().includes("Requested"));
  h.change("expectedBehavior", "Return an empty result");
  expectStep(0, ["current", "upcoming", "upcoming"]);
  h.prepare(); h.failNextDownload(); h.click("Download case JSON");
  expectStep(1, ["complete", "current", "upcoming"]);
  h.unmount();
});
