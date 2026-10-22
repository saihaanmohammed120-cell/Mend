import test from "node:test";
import { setImmediate as settle } from "node:timers/promises";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
function commandControl(writeText?: (value: string) => Promise<void>) {
  const cells: unknown[] = [];
  let index = 0, mounted = false, tree: Element, stateWrites = 0;
  let effect: (() => void | (() => void)) | undefined, dispose: (() => void) | undefined;
  const output = ts.transpileModule(readFileSync(new URL("../components/command-copy.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { CommandCopy?: () => Element; CAPTURED_COMMAND?: string } = {};
  vm.runInNewContext(output, { exports, navigator: { clipboard: writeText ? { writeText } : undefined }, require(id: string) {
    if (id === "react") return {
      useId: () => "copy-test",
      useState(initial: unknown) { const cell = index++; if (!(cell in cells)) cells[cell] = initial; return [cells[cell], (next: unknown) => { stateWrites++; cells[cell] = next; }]; },
      useRef(initial: unknown) { const cell = index++; if (!(cell in cells)) cells[cell] = { current: initial }; return cells[cell]; },
      useEffect(callback: () => void | (() => void)) { if (!mounted) effect = callback; },
    };
    if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
    if (id === "./command-copy.css") return {};
    if (id === "lucide-react") return new Proxy({}, { get: (_, key) => key });
    throw new Error(`Unexpected dependency ${id}`);
  } });
  const nodes = (node: unknown = tree): Element[] => {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element; return [element, ...nodes(element.props.children ?? null)];
  };
  const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
  function render() { index = 0; tree = exports.CommandCopy!(); if (!mounted) { const cleanup = effect?.(); if (typeof cleanup === "function") dispose = cleanup; mounted = true; } }
  render();
  return { render, nodes, text: () => text(tree), command: exports.CAPTURED_COMMAND,
    click() { (nodes().find(node => node.type === "button")!.props.onClick as () => void)(); render(); },
    unmount() { dispose?.(); }, get stateWrites() { return stateWrites; } };
}

test("Copy reports success only after the actual writer promise resolves", async () => {
  let release!: () => void;
  const writes: string[] = [];
  const h = commandControl(value => { writes.push(value); return new Promise<void>(resolve => { release = resolve; }); });
  assert.ok(!h.text().includes("Command copied"));
  h.click(); h.click();
  assert.equal(writes.length, 1); assert.equal(writes[0], h.command);
  assert.ok(h.text().includes("Waiting for clipboard permission."));
  release(); await settle(); h.render();
  assert.ok(h.text().includes("Command copied. No checks were run."));
  assert.equal(h.nodes().find(node => node.type === "input")?.props.value, writes[0]);
  h.unmount();
});

test("Unavailable or rejected clipboard access retains a selectable command and never claims copied", async () => {
  for (const writer of [undefined, async () => { throw new Error("Permission denied"); }]) {
    const h = commandControl(writer); h.click(); await settle(); h.render();
    assert.ok(h.text().includes("Copy unavailable.")); assert.ok(!h.text().includes("Command copied"));
    const input = h.nodes().find(node => node.type === "input")!;
    assert.equal(input.props.readOnly, true);
    let selected = false;
    (input.props.onFocus as (event: unknown) => void)({ currentTarget: { select: () => { selected = true; } } });
    assert.equal(selected, true); h.unmount();
  }
});

test("A late clipboard response cannot update an unmounted control", async () => {
  let release!: () => void;
  const h = commandControl(() => new Promise<void>(resolve => { release = resolve; }));
  h.click(); h.unmount(); const before = h.stateWrites;
  release(); await settle();
  assert.equal(h.stateWrites, before);
});
