import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { MendClientError, type JsonObject, type Task, type WatchHandlers } from "../lib/mend-client";
import * as evidence from "../lib/evidence";
import type { Workbench } from "../lib/use-workbench";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const task = (id = A, status: Task["status"] = "ready"): Task => ({ id, status, contract_version: 1,
  contract: { required_check_ids: ["empty"] }, contract_sha256: "c".repeat(64) });
const receipt = (id = A): JsonObject => ({ task_id: id, status: "passed", source: "live", live_verification: true,
  contract_sha256: "c".repeat(64), snapshot_sha256: "a".repeat(64), bundle_verified_sha256: "a".repeat(64),
  checks: { total: 1, passed: 1, failed: 0, skipped: 0, results: [{ check_id: "empty", status: "passed" }] } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** Executes the real hook body with a small hook lifecycle fixture, not a DOM renderer. */
function harness(initialTaskId?: string, saved = new Map<string, string>()) {
  const cells: unknown[] = [];
  const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let index = 0; let effectIndex = 0; let dirty = false;
  let output!: Workbench;
  const pendingEffects: Array<() => void> = [];
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, position) => Object.is(value, b[position]));
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in cells)) cells[position] = initial;
      return [cells[position], (value: unknown) => { cells[position] = value; dirty = true; }];
    },
    useRef(initial: unknown) { const position = index++; if (!(position in cells)) cells[position] = { current: initial }; return cells[position]; },
    useCallback(callback: unknown, deps: unknown[]) {
      const position = index++;
      const cell = cells[position] as { callback: unknown; deps: unknown[] } | undefined;
      if (!cell || !same(cell.deps, deps)) cells[position] = { callback, deps };
      return (cells[position] as { callback: unknown }).callback;
    },
    useEffect(callback: () => (() => void) | void, deps: unknown[]) {
      const position = effectIndex++;
      const effect = effects[position];
      if (!effect || !same(effect.deps, deps)) pendingEffects.push(() => {
        effect?.cleanup?.(); effects[position] = { deps, cleanup: callback() || undefined };
      });
    },
  };
  const activeWatches: Array<{ handlers: WatchHandlers; signal?: AbortSignal; closed: boolean }> = [];
  const creations: Array<{ prompt: string; key: string }> = [];
  const receiptSignals: AbortSignal[] = [];
  const tasks = new Map<string, Task>([[A, task()], [B, task(B)]]);
  let creationFailure = false;
  let creationFailureStatus = 0;
  let receiptHandler: (id: string) => Promise<JsonObject> = async id => receipt(id);
  let runtime = { ready: false, mode: "database_only", blockers: ["Provider execution disabled"] };
  let starts = 0;
  let runtimeFailure = false;
  let timerId = 0;
  const timers = new Map<number, () => void>();
  class Client {
    async getSession() { return { user_id: OWNER, csrf_token: "c".repeat(43), expires_at: Math.floor(Date.now() / 1000) + 60 }; }
    async exchangeSession() { return this.getSession(); }
    async logout() { return; }
    async get(id: string) { return tasks.get(id)!; }
    async create(prompt: string, key: string) {
      creations.push({ prompt, key });
      if (creationFailure) { creationFailure = false; throw new MendClientError(creationFailureStatus === 401 ? "unauthenticated" : "network_error", "Connection interrupted", creationFailureStatus); }
      const value = task(A, "draft"); tasks.set(A, value); return value;
    }
    async propose(id: string) { const value = task(id); tasks.set(id, value); return value; }
    async start(id: string) { starts++; const value = task(id, "running"); tasks.set(id, value); return value; }
    async cancel(id: string) { const value = task(id, "stopping"); tasks.set(id, value); return value; }
    async receipt(id: string, options: { signal: AbortSignal }) { receiptSignals.push(options.signal); return receiptHandler(id); }
    async artifacts() { return { bundle: { url: "https://mend.supabase.co/code?token=short", expires_seconds: 60 } }; }
    async watchTask(id: string, handlers: WatchHandlers, options: { signal: AbortSignal }) {
      const entry = { handlers, signal: options.signal, closed: false }; activeWatches.push(entry);
      handlers.onTask(tasks.get(id)!);
      const close = () => { entry.closed = true; handlers.onConnection?.("closed"); };
      options.signal.addEventListener("abort", close, { once: true });
      return { close, cursor: () => "0" };
    }
    dispose() { for (const watch of activeWatches) watch.closed = true; }
  }
  const controllerModule = { exports: {} as { useWorkbench: (id?: string) => Workbench } };
  const source = ts.transpileModule(readFileSync(new URL("../lib/use-workbench.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: controllerModule.exports, module: controllerModule, AbortController, TextEncoder, Error, crypto: { randomUUID: () => "test-key-1" },
    window: { sessionStorage: { getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) } },
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: async () => { if (runtimeFailure) throw new Error("Runtime connection unavailable"); return { ok: true, json: async () => runtime }; },
    require: (name: string) => name === "react" ? react : name === "./evidence" ? evidence : name === "./auth"
      ? { signIn: async () => "access-token" } : { MendClient: Client, MendClientError },
  });
  const render = () => { index = 0; effectIndex = 0; dirty = false; output = controllerModule.exports.useWorkbench(initialTaskId); while (pendingEffects.length) pendingEffects.shift()!(); };
  render();
  const flush = async () => {
    for (let step = 0; step < 10; step++) { await new Promise<void>(resolve => setImmediate(resolve)); if (dirty) render(); }
  };
  return {
    flush, get value() { if (dirty) render(); return output; }, tasks, activeWatches, creations, receiptSignals,
    failCreation(status = 0) { creationFailure = true; creationFailureStatus = status; },
    setRuntime(value: typeof runtime) { runtime = value; }, failRuntime() { runtimeFailure = true; }, get starts() { return starts; },
    setReceipt(handler: typeof receiptHandler) { receiptHandler = handler; },
    expireDownloads() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
    get pendingTimers() { return timers.size; },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

test("Controller retries ambiguous create with original key and blocks a changed prompt", async () => {
  const h = harness(); await h.flush(); h.failCreation();
  await h.value.review("Clean rows"); await h.flush();
  assert.equal(h.creations.length, 1);
  await h.value.review("Different prompt"); await h.flush();
  assert.equal(h.creations.length, 1);
  assert.match(h.value.error!, /pending task/);
  await h.value.review("Clean rows"); await h.flush();
  assert.equal(h.creations.length, 2);
  assert.equal(h.creations[0].key, h.creations[1].key);
  assert.equal(h.value.task?.status, "ready");
  h.unmount();
});

test("Setup report prevents restoring a contradictory session and blocks authentication", async () => {
  const h = harness(A);
  h.setRuntime({ ready: false, mode: "setup_only", blockers: ["backend_setup_only"] });
  await h.flush();
  assert.equal(h.value.booting, false);
  assert.equal(h.value.session, null);
  assert.equal(h.value.task, null);
  assert.equal(h.value.error, null);
  assert.equal(h.activeWatches.length, 0);
  await h.value.signIn("account@example.test", "fixture-password"); await h.flush();
  assert.match(h.value.error ?? "", /Sign-in is unavailable/);
  assert.equal(h.value.session, null);
  h.unmount();
});

test("Rechecking a backend now in setup mode clears task evidence and closes its stream", async () => {
  const h = harness(A); await h.flush();
  assert.ok(h.value.session); assert.ok(h.value.task);
  h.setRuntime({ ready: false, mode: "setup_only", blockers: ["backend_setup_only"] });
  await h.value.refresh(); await h.flush();
  assert.equal(h.value.session, null); assert.equal(h.value.task, null);
  assert.equal(h.value.receipt, null); assert.equal(h.value.busy, false);
  assert.equal(h.value.runtime?.mode, "setup_only");
  assert.ok(h.activeWatches.every(watch => watch.closed));
  h.unmount();
});
test("A failed explicit connection recheck clears the old readiness snapshot", async () => {
  const h = harness();
  await h.flush();
  assert.ok(h.value.runtime);
  h.failRuntime();
  await h.value.refresh();
  await h.flush();
  assert.equal(h.value.runtime, null);
  assert.match(h.value.error ?? "", /Runtime connection unavailable/);
  h.unmount();
});

test("A failed pre-start connection check clears an earlier ready snapshot", async () => {
  const h = harness(A); await h.flush();
  h.setRuntime({ ready: true, mode: "live", blockers: [] });
  await h.value.refresh(); await h.flush();
  assert.equal(h.value.runtime?.ready, true);
  h.failRuntime(); await h.value.start(); await h.flush();
  assert.equal(h.starts, 0); assert.equal(h.value.runtime, null);
  h.unmount();
});

test("Controller blocks provider start when runtime is unavailable and keeps cancellation as stopping", async () => {
  const h = harness(A); await h.flush();
  await h.value.start(); await h.flush();
  assert.equal(h.starts, 0); assert.match(h.value.error!, /disabled/);
  h.setRuntime({ ready: true, mode: "live", blockers: [] });
  await h.value.start(); await h.flush(); assert.equal(h.value.task?.status, "running");
  await h.value.cancel(); await h.flush(); assert.equal(h.value.task?.status, "stopping");
  assert.equal(h.value.receipt, null);
  h.unmount(); assert.ok(h.activeWatches.every(watch => watch.closed));
});
test("Controller task switching aborts receipt reads and rejects stale A-to-B-to-A response", async () => {
  const h = harness(); await h.flush(); h.tasks.set(A, task(A, "passed"));
  const first = deferred<JsonObject>(); const second = deferred<JsonObject>(); let reads = 0;
  h.setReceipt(async () => (++reads === 1 ? first.promise : second.promise));
  await h.value.load(A); await h.flush();
  await h.value.load(B); await h.flush();
  assert.equal(h.receiptSignals[0].aborted, true);
  await h.value.load(A); await h.flush(); first.resolve(receipt(A)); await h.flush();
  assert.equal(h.value.receipt, null);
  second.resolve(receipt(A)); await h.flush();
  const received = h.value.receipt as JsonObject | null;
  assert.equal(received?.task_id, A); assert.equal(h.value.receiptFresh, false);
  h.unmount();
});
test("Controller refreshes receipt-only event from authoritative task and prints only new evidence", async () => {
  const h = harness(A); await h.flush(); h.tasks.set(A, task(A, "passed"));
  const handler = h.activeWatches.at(-1)!.handlers;
  handler.onEvent({ id: "5", type: "receipt", data: { task_id: A, payload: receipt(A) } });
  await h.flush(); assert.equal(h.value.task?.status, "passed"); assert.equal(h.value.receiptFresh, true);
  await h.value.refresh(); await h.flush(); assert.equal(h.value.receiptFresh, false);
  h.unmount();
});
test("Controller removes transient signed download URLs at expiry and clears timers on task change", async () => {
  const h = harness(); await h.flush(); h.tasks.set(A, task(A, "passed"));
  await h.value.load(A); await h.flush();
  await h.value.download(); await h.flush(); assert.ok(h.value.downloads?.bundle); assert.equal(h.pendingTimers, 1);
  h.expireDownloads(); await h.flush(); assert.equal(h.value.downloads, null);
  await h.value.download(); await h.flush();
  await h.value.load(B); await h.flush(); assert.equal(h.value.downloads, null); assert.equal(h.pendingTimers, 0);
  h.unmount();
});
test("Controller reload restores uncertain-create identity and explicit logout clears the cache", async () => {
  const saved = new Map<string, string>();
  const first = harness(undefined, saved); await first.flush(); first.failCreation();
  await first.value.review("Clean rows"); await first.flush();
  const original = first.creations[0].key; assert.equal(saved.size, 1); first.unmount();
  const restored = harness(undefined, saved); await restored.flush();
  await restored.value.review("Different task"); await restored.flush(); assert.equal(restored.creations.length, 0);
  await restored.value.review("Clean rows"); await restored.flush(); assert.equal(restored.creations[0].key, original);
  assert.equal(saved.size, 0);
  restored.failCreation(); await restored.value.review("Next task"); await restored.flush(); assert.equal(saved.size, 1);
  await restored.value.logout(); await restored.flush(); assert.equal(saved.size, 0);
  restored.unmount();
});
test("Controller retains unresolved identity through expiry and same-owner reauthentication", async () => {
  const saved = new Map<string, string>();
  const h = harness(undefined, saved); await h.flush(); h.failCreation(401);
  await h.value.review("Clean rows"); await h.flush();
  assert.equal(h.value.session, null); assert.equal(saved.size, 1);
  const original = h.creations[0].key;
  await h.value.signIn("account@example.test", "fixture-password"); await h.flush();
  await h.value.review("Clean rows"); await h.flush();
  assert.equal(h.creations[1].key, original); assert.equal(saved.size, 0);
  h.unmount();
});
