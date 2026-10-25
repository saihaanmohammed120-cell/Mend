import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as sample from "../lib/sample-repair";

type Element = { type: unknown; props: Record<string, unknown> };
const DRAFT_KEY = "mend:task-draft:v1";

/** Runs the actual component with deterministic hook/storage boundaries, not a browser renderer. */
function component(name: "RepairPreview" | "Workbench", saved = new Map<string, string>(), props = {}, runOverrides = {}) {
  const filename = name === "Workbench" ? "workbench" : "repair-preview";
  const cells: unknown[] = [];
  let index = 0, reduced: boolean | null = false, hydrated = false, inEffect = false;
  let effectUpdates = 0, denied = false;
  const effects: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  const storage = {
    getItem(key: string) { if (denied) throw new Error("Storage denied"); return saved.get(key) ?? null; },
    setItem(key: string, value: string) { if (denied) throw new Error("Storage denied"); saved.set(key, value); },
    removeItem(key: string) { if (denied) throw new Error("Storage denied"); saved.delete(key); },
  };
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in cells)) cells[position] = initial;
      return [cells[position], (value: unknown) => {
        if (inEffect) effectUpdates++;
        cells[position] = typeof value === "function" ? value(cells[position]) : value;
      }];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in cells)) cells[position] = { current: initial };
      return cells[position];
    },
    useEffect(callback: () => void) { effects.push(callback); },
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown, getServerSnapshot: () => unknown) {
      return hydrated ? getSnapshot() : getServerSnapshot();
    },
  };
  const emptyRun = { session: null, busy: false, booting: false, task: null, runtime: null,
    receipt: null, events: [], connection: "closed", error: null, logout: async () => {}, ...runOverrides };
  const output = ts.transpileModule(readFileSync(new URL(`../components/${filename}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, (props: object) => Element> = {};
  vm.runInNewContext(output, {
    exports, TextEncoder, sessionStorage: storage,
    window: { sessionStorage: storage, setTimeout: (callback: () => void) => { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id) },
    require(id: string) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) };
      if (id === "framer-motion") return { useReducedMotion: () => reduced, motion: new Proxy({}, { get: (_, key) => key }), AnimatePresence: "AnimatePresence" };
      if (id === "@/lib/sample-repair") return sample;
      if (id === "@/lib/use-motion-preference") {
        const hookExports = {};
        const hook = ts.transpileModule(readFileSync(new URL("../lib/use-motion-preference.ts", import.meta.url), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        vm.runInNewContext(hook, { exports: hookExports,
          require: (dependency: string) => {
            if (dependency === "react") return react;
            throw new Error(`Unexpected motion-hook dependency: ${dependency}`);
          },
          window: { matchMedia: () => ({ matches: reduced !== false }) },
        });
        return hookExports;
      }
      if (id === "@/lib/motion") return { entrance: () => ({}), SPRING: {} };
      if (id === "@/lib/use-workbench") return { useWorkbench: () => emptyRun };
      if (id === "@/lib/pointer-tilt" || id === "@/lib/evidence") return {};
      if (id === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      if (id === "./proof-hero") return { ProofHero: "ProofHero" };
      if (id === "./proof-flow") return { ProofFlow: "ProofFlow" };
      if (id === "./proof-roadmap") return { ProofRoadmap: "ProofRoadmap" };
      if (id === "./repair-case") return { RepairCase: "RepairCase" };
      if (id === "./runtime-connection") return { RuntimeConnection: "RuntimeConnection" };
      if (id === "./attempt-timeline") return { AttemptTimeline: "AttemptTimeline" };
      if (id === "./trust-badge") return { TrustBadge: "TrustBadge" };
      if (id === "next/link") return { default: "a" };
      throw new Error(`Unexpected component dependency: ${id}`);
    },
  });
  let tree!: Element;
  function render(client = hydrated) { hydrated = client; index = 0; effects.length = 0; tree = exports[name](props); }
  function nodes(node: unknown = tree): Element[] {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [element, ...nodes(element.props.children ?? null)];
  }
  render();
  return { render, saved, timers, setReduced(value: boolean | null) { reduced = value; }, denyStorage() { denied = true; },
    nodes,
    get effectUpdates() { return effectUpdates; },
    commitEffects() { for (const effect of effects) { inEffect = true; try { effect(); } finally { inEffect = false; } } },
    find(predicate: (node: Element) => boolean) { const found = nodes().find(predicate); assert.ok(found, "Expected rendered element"); return found; },
  };
}

test("preview hydrates paused, derives normal-motion autoplay and never copies preference in an effect", () => {
  const h = component("RepairPreview");
  assert.equal(h.find(node => node.props["aria-label"] === "Play demo").type, "button");
  h.render(true); h.commitEffects();
  assert.equal(h.effectUpdates, 0);
  h.render();
  assert.equal(h.find(node => node.props["aria-label"] === "Pause demo").type, "button");
});

test("compact sign-in puts credentials first and preserves the saved draft", () => {
  const saved = new Map([[DRAFT_KEY, "Saved task"]]);
  const h = component("Workbench", saved, { view: "workspace" });
  h.render(true);
  assert.equal(h.find(node => node.props.id === "signin-email").type, "input");
  assert.equal(h.nodes().some(node => node.props.id === "task-prompt" || node.type === "ProofHero" || node.type === "ProofFlow" || node.type === "RepairCase" || node.type === "ProofRoadmap"), false);
  assert.equal(h.saved.get(DRAFT_KEY), "Saved task");
});

test("compact signed-in workspace restores the editor, while a saved task view keeps its evidence first", () => {
  const signedIn = { session: { user_id: "owner" } };
  const h = component("Workbench", new Map([[DRAFT_KEY, "Saved task"]]), { view: "workspace" }, signedIn);
  h.render(true);
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, "Saved task");
  assert.equal(h.nodes().some(node => node.props.id === "signin-email"), false);
  const task = component("Workbench", new Map(), { view: "workspace", initialTaskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, signedIn);
  assert.equal(task.nodes().some(node => node.props.id === "task-prompt" || node.type === "ProofHero"), false);
  assert.ok(task.find(node => node.props["aria-labelledby"] === "evidence-title"));
});

test("manual Next stays paused when the initially unknown motion preference resolves", () => {
  const h = component("RepairPreview"); h.setReduced(null); h.render(true);
  const next = h.find(node => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Next step"));
  (next.props.onClick as () => void)();
  h.setReduced(false); h.render(); h.commitEffects(); h.render();
  assert.equal(h.find(node => node.props["aria-label"] === "Play demo").type, "button");
  assert.equal(h.find(node => node.props["data-testid"] === "repair-phase").props["data-phase"], "patch");
});

test("reduced motion pauses startup but explicit Play and Pause remain available", () => {
  const h = component("RepairPreview"); h.setReduced(true); h.render(true); h.commitEffects(); h.render();
  (h.find(node => node.props["aria-label"] === "Play demo").props.onClick as () => void)(); h.render();
  (h.find(node => node.props["aria-label"] === "Pause demo").props.onClick as () => void)(); h.render();
  h.setReduced(false); h.render(); h.commitEffects(); h.render();
  assert.equal(h.find(node => node.props["aria-label"] === "Play demo").type, "button");
});

test("draft hydration restores valid storage without overwriting it or issuing effect state updates", () => {
  const h = component("Workbench", new Map([[DRAFT_KEY, "Saved task"]]));
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, "");
  h.commitEffects(); assert.equal(h.saved.get(DRAFT_KEY), "Saved task");
  h.render(true); h.commitEffects();
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, "Saved task");
  assert.equal(h.effectUpdates, 0);
});

test("draft edits persist and clear through events; oversized UTF-8 drafts do not restore", () => {
  const h = component("Workbench", new Map([[DRAFT_KEY, "😀".repeat(2001)]])); h.render(true);
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, "");
  const change = (value: string) => { (h.find(node => node.props.id === "task-prompt").props.onChange as (event: unknown) => void)({ target: { value } }); h.render(); };
  change("Updated task"); assert.equal(h.saved.get(DRAFT_KEY), "Updated task");
  const boundary = "😀".repeat(2000);
  change(boundary); assert.equal(h.saved.get(DRAFT_KEY), boundary);
  change(`${boundary}x`); assert.equal(h.saved.has(DRAFT_KEY), false);
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, `${boundary}x`);
  change(""); assert.equal(h.saved.has(DRAFT_KEY), false);
  h.denyStorage(); change("Still editable");
  assert.equal(h.find(node => node.props.id === "task-prompt").props.value, "Still editable");
});
