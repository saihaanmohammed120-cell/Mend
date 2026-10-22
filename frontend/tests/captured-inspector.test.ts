import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as inspector from "../lib/captured-inspector";
import capture from "../lib/captured-example.json";

test("Captured source numbering retains internal empty lines and the actual return guard", () => {
  assert.deepEqual(inspector.numberedSource("first\n\nthird\n").map(line => [line.number, line.text]), [[1, "first"], [2, ""], [3, "third"]]);
  assert.deepEqual(inspector.numberedSource(""), []);
  const comparison = inspector.compareCapturedSource(capture.before_source, capture.after_source);
  for (const lines of [comparison.before, comparison.after]) {
    assert.deepEqual(lines.map(line => line.number), Array.from({ length: lines.length }, (_, i) => i + 1));
  }
  assert.equal(comparison.after[2].text, "        return [], 0");
  assert.deepEqual(comparison.after.filter(line => line.changed).map(line => line.text), ["    if not rows:", "        return [], 0"]);
  assert.equal(comparison.before.filter(line => line.changed).length, 0);
  const patch = readFileSync(new URL("../public/example/repair.diff", import.meta.url), "utf8");
  assert.deepEqual(patch.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).map(line => line.slice(1)), comparison.after.filter(line => line.changed).map(line => line.text));
});

test("Source comparison distinguishes insertion, removal and separated changes", () => {
  const result = inspector.compareCapturedSource("one\ntwo\nthree\nfour\n", "one\nnew\nthree\nlast\n");
  assert.deepEqual(result.before.filter(line => line.changed).map(line => line.text), ["two", "four"]);
  assert.deepEqual(result.after.filter(line => line.changed).map(line => line.text), ["new", "last"]);
});

test("Tab navigation wraps, reaches endpoints and leaves unrelated keys untouched", () => {
  assert.equal(inspector.inspectionTabDestination("ArrowLeft", 0, 4), 3);
  assert.equal(inspector.inspectionTabDestination("ArrowRight", 3, 4), 0);
  assert.equal(inspector.inspectionTabDestination("Home", 2, 4), 0);
  assert.equal(inspector.inspectionTabDestination("End", 0, 4), 3);
  assert.equal(inspector.inspectionTabDestination("Tab", 1, 4), null);
  assert.equal(inspector.inspectionTabDestination("ArrowRight", 0, 0), null);
});

type Element = { type: unknown; props: Record<string, unknown> };
function workspace() {
  const cells: unknown[] = [];
  let index = 0;
  let tree: Element;
  let focused: number | null = null;
  const react = {
    useId: () => "test-capture",
    useState(initial: unknown) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = initial;
      return [cells[cell], (next: unknown) => { cells[cell] = next; }];
    },
    useRef(initial: unknown) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = { current: initial };
      return cells[cell];
    },
  };
  const output = ts.transpileModule(readFileSync(new URL("../components/captured-workspace.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { CapturedWorkspace?: () => Element } = {};
  vm.runInNewContext(output, { exports, require(id: string) {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
    if (id === "../lib/captured-example.json") return { default: capture };
    if (id === "../lib/captured-inspector") return inspector;
    if (id === "./provenance-receipt") return { ProvenanceReceipt: "ProvenanceReceipt" };
    if (id === "./command-copy") return { CommandCopy: "CommandCopy" };
    if (id === "lucide-react") return new Proxy({}, { get: (_, key) => key });
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const nodes = (node: unknown = tree): Element[] => {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [element, ...nodes(element.props.children ?? null)];
  };
  const tabs = () => nodes().filter(node => node.props.role === "tab");
  function render() {
    index = 0; tree = exports.CapturedWorkspace!();
    tabs().forEach((tab, i) => (tab.props.ref as (node: unknown) => void)({ focus: () => { focused = i; } }));
  }
  render();
  return { tabs, render, nodes, get focused() { return focused; } };
}

test("Actual workspace handlers keep one selected focusable tab and expose only its evidence panel", () => {
  const h = workspace();
  const expectActive = (selected: string) => {
    const tabs = h.tabs();
    const active = tabs.filter(tab => tab.props["aria-selected"] === true);
    assert.equal(active.length, 1);
    assert.equal(active[0].props.children, selected);
    assert.equal(tabs.filter(tab => tab.props.tabIndex === 0).length, 1);
    const panels = h.nodes().filter(node => node.props.role === "tabpanel");
    assert.equal(panels.filter(panel => panel.props.hidden === false).length, 1);
    for (const tab of tabs) {
      const panel = panels.find(panel => panel.props.id === tab.props["aria-controls"]);
      assert.ok(panel);
      assert.equal(panel.props["aria-labelledby"], tab.props.id);
      assert.equal(panel.props.hidden, !tab.props["aria-selected"]);
    }
  };
  expectActive("Patch");
  (h.tabs()[2].props.onClick as () => void)(); h.render(); expectActive("Checks");
  let prevented = 0;
  const press = (key: string, index: number) => {
    (h.tabs()[index].props.onKeyDown as (event: unknown) => void)({ key, preventDefault: () => { prevented++; } });
    h.render();
  };
  press("End", 2); expectActive("Provenance"); assert.equal(h.focused, 3);
  press("ArrowRight", 3); expectActive("Before"); assert.equal(h.focused, 0);
  press("ArrowLeft", 0); expectActive("Provenance"); assert.equal(h.focused, 3);
  press("Home", 3); expectActive("Before"); assert.equal(h.focused, 0);
  press("Tab", 0); expectActive("Before"); assert.equal(prevented, 4);
  assert.ok(!h.nodes().some(node => node.type === "form"));
});
