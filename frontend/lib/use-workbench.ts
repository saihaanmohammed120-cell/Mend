"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MendClient, MendClientError, type Artifacts, type JsonObject, type Session, type Task, type WatchHandle } from "./mend-client";
import { signIn as authenticate } from "./auth";
import { appendEvent, applyEvent, clearReview, persistReview, restoreReview, reviewRequest, validateReceipt, type PendingReview, type StreamEvent } from "./evidence";
import type { RuntimeDetails } from "./runtime-readiness";

export interface Runtime extends Partial<RuntimeDetails> { ready: boolean; mode: string; blockers: string[] }
interface State {
  session: Session | null; booting: boolean; busy: boolean; task: Task | null; error: string | null;
  connection: string; events: StreamEvent[]; receipt: JsonObject | null; receiptFresh: boolean;
  downloads: Artifacts | null; runtime: Runtime | null;
}
export interface Workbench extends State {
  review(prompt: string): Promise<void>; signIn(email: string, password: string): Promise<void>;
  logout(): Promise<void>; load(id: string): Promise<void>; start(): Promise<void>; cancel(): Promise<void>;
  download(): Promise<void>; refresh(): Promise<void>; clearError(): void;
}
const EMPTY: State = { session: null, booting: true, busy: false, task: null, error: null,
  connection: "closed", events: [], receipt: null, receiptFresh: false, downloads: null, runtime: null };
const TERMINAL = new Set(["passed", "needs_help", "runner_unavailable", "stopped"]);
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export function useWorkbench(initialTaskId?: string): Workbench {
  const [state, setState] = useState<State>(EMPTY);
  const snapshot = useRef(state);
  const client = useRef<MendClient | null>(null);
  const alive = useRef(false);
  const epoch = useRef(0);
  const viewEpoch = useRef(0);
  const watch = useRef<WatchHandle | null>(null);
  const watchAbort = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);
  const pending = useRef<PendingReview | null>(null);
  const startKey = useRef<{ taskId: string; version: number; key: string } | null>(null);
  const receiptRead = useRef<{ taskId: string; promise: Promise<void> } | null>(null);
  const receiptAbort = useRef<AbortController | null>(null);
  const downloadExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((patch: Partial<State>) => {
    snapshot.current = { ...snapshot.current, ...patch };
    if (alive.current) setState(snapshot.current);
  }, []);
  const closeWatch = useCallback(() => {
    viewEpoch.current += 1;
    if (downloadExpiry.current !== null) clearTimeout(downloadExpiry.current);
    downloadExpiry.current = null; update({ downloads: null });
    receiptAbort.current?.abort(); receiptAbort.current = null; receiptRead.current = null;
    watchAbort.current?.abort(); watchAbort.current = null;
    watch.current?.close(); watch.current = null;
  }, [update]);
  const clearOwner = useCallback(() => {
    epoch.current += 1; closeWatch(); operation.current?.abort(); operation.current = null;
    pending.current = null; startKey.current = null; receiptRead.current = null;
    update({ session: null, task: null, events: [], receipt: null, receiptFresh: false, downloads: null, busy: false, connection: "closed" });
  }, [closeWatch, update]);
  const readReceipt = useCallback(async (id: string, fresh: boolean, generation: number, view: number) => {
    if (receiptRead.current?.taskId === id) return receiptRead.current.promise;
    const controller = new AbortController(); receiptAbort.current = controller;
    const promise = (async () => {
      try {
        const value = await client.current!.receipt(id, { signal: controller.signal });
        if (alive.current && epoch.current === generation && viewEpoch.current === view && !controller.signal.aborted && snapshot.current.task?.id === id)
          update({ receipt: validateReceipt(value, snapshot.current.task), receiptFresh: fresh });
      } catch (error) {
        if (alive.current && epoch.current === generation && viewEpoch.current === view && !controller.signal.aborted && snapshot.current.task?.id === id) {
          receiptRead.current = null;
          update({ error: message(error) });
        }
      }
    })();
    receiptRead.current = { taskId: id, promise };
    return promise;
  }, [update]);
  const attach = useCallback(async (id: string, generation: number, preserve = false) => {
    const after = preserve ? watch.current?.cursor() ?? snapshot.current.events.at(-1)?.id ?? "0" : "0";
    closeWatch();
    const view = viewEpoch.current;
    const controller = new AbortController(); watchAbort.current = controller;
    let freshReceiptAllowed = false;
    if (!preserve) { receiptRead.current = null; update({ task: null, events: [], receipt: null, receiptFresh: false, downloads: null }); }
    const current = () => alive.current && epoch.current === generation && viewEpoch.current === view && !controller.signal.aborted;
    const handle = await client.current!.watchTask(id, {
      onTask: task => {
        if (!current()) return;
        freshReceiptAllowed = task.status !== "passed";
        update({ task });
        if (task.status === "passed") void readReceipt(id, false, generation, view);
      },
      onEvent: event => {
        if (!current()) throw new Error("The task view changed before this event was accepted.");
        const task = snapshot.current.task;
        if (!task || task.id !== id) throw new Error("The task snapshot is unavailable.");
        // Commit to the ref synchronously; MendClient advances its cursor only after this callback returns.
        update({ events: appendEvent(snapshot.current.events, event), task: applyEvent(task, event) });
        if (event.type === "receipt" || event.type === "failed" || event.type === "stopped" ||
          (event.type === "state" && TERMINAL.has(snapshot.current.task!.status))) {
          void client.current!.get(id, { signal: controller.signal }).then(value => {
            if (current()) { update({ task: value }); if (value.status === "passed") void readReceipt(id, freshReceiptAllowed, generation, view); }
          }).catch(error => { if (current()) update({ error: message(error) }); });
        }
      },
      onConnection: connection => { if (current()) update({ connection }); },
      onError: error => {
        if (!current()) return;
        if (error.status === 401) { clearOwner(); update({ error: "The session expired. Sign in to resume." }); }
        else update({ error: message(error) });
      },
    }, { after, signal: controller.signal });
    if (current()) watch.current = handle; else handle.close();
  }, [clearOwner, closeWatch, readReceipt, update]);
  const readRuntime = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/runtime", { credentials: "same-origin", cache: "no-store", redirect: "error", signal });
    if (!response.ok) throw new Error("Runtime readiness could not be checked.");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("ready" in result) || typeof result.ready !== "boolean" ||
      !("mode" in result) || typeof result.mode !== "string" || !("blockers" in result) ||
      !Array.isArray(result.blockers) || result.blockers.some(value => typeof value !== "string"))
      throw new Error("Runtime readiness returned an invalid response.");
    return result as Runtime;
  }, []);
  const run = useCallback(async (action: (api: MendClient, signal: AbortSignal, generation: number) => Promise<void>) => {
    if (operation.current || !client.current || snapshot.current.booting) return;
    const controller = new AbortController(); operation.current = controller;
    const generation = epoch.current; update({ busy: true, error: null });
    try { await action(client.current, controller.signal, generation); }
    catch (error) {
      if (alive.current && epoch.current === generation) {
        if (error instanceof MendClientError && error.status === 401) clearOwner();
        update({ error: message(error) });
      }
    } finally {
      if (operation.current === controller) { operation.current = null; update({ busy: false }); }
    }
  }, [clearOwner, update]);
  useEffect(() => {
    alive.current = true;
    update({ booting: true, task: null, events: [], receipt: null, receiptFresh: false, downloads: null, connection: "closed" });
    const generation = ++epoch.current;
    const controller = new AbortController();
    let api: MendClient;
    try { api = new MendClient(); client.current = api; }
    catch (error) { update({ booting: false, error: message(error) }); return () => { alive.current = false; }; }
    void (async () => {
      try {
        const [sessionResult, runtimeResult] = await Promise.allSettled([
          api.getSession({ signal: controller.signal }), readRuntime(controller.signal),
        ]);
        if (!alive.current || generation !== epoch.current) return;
        if (runtimeResult.status === "fulfilled") {
          update({ runtime: runtimeResult.value });
          if (runtimeResult.value.mode === "setup_only") { update({ session: null, error: null }); return; }
        }
        else update({ error: message(runtimeResult.reason) });
        if (sessionResult.status === "fulfilled") {
          pending.current = restoreReview(window.sessionStorage, sessionResult.value.user_id);
          update({ session: sessionResult.value });
          if (initialTaskId) await attach(initialTaskId, generation);
        } else if (!(sessionResult.reason instanceof MendClientError && sessionResult.reason.status === 401))
          update({ error: message(sessionResult.reason) });
      } catch (error) { if (alive.current && generation === epoch.current) update({ error: message(error) }); }
      finally { if (alive.current && generation === epoch.current) update({ booting: false }); }
    })();
    return () => { alive.current = false; epoch.current += 1; controller.abort(); operation.current?.abort(); operation.current = null; closeWatch(); api.dispose(); client.current = null; };
  }, [attach, closeWatch, initialTaskId, readRuntime, update]);

  const signIn = useCallback((email: string, password: string) => run(async (api, signal, generation) => {
    if (snapshot.current.runtime?.mode === "setup_only") throw new Error("Sign-in is unavailable while backend setup is pending.");
    const accessToken = await authenticate(email, password, signal);
    const session = await api.exchangeSession(accessToken, { signal });
    if (generation !== epoch.current || !alive.current) return;
    closeWatch(); pending.current = restoreReview(window.sessionStorage, session.user_id); startKey.current = null; receiptRead.current = null;
    update({ session, task: null, events: [], receipt: null, receiptFresh: false, downloads: null, connection: "closed" });
    if (initialTaskId) await attach(initialTaskId, generation);
  }), [attach, closeWatch, initialTaskId, run, update]);
  const logout = useCallback(() => run(async (api, signal) => { await api.logout({ signal }); clearReview(window.sessionStorage); clearOwner(); }), [clearOwner, run]);
  const load = useCallback((id: string) => run(async (_api, _signal, generation) => {
    await attach(id, generation);
  }), [attach, run]);
  const review = useCallback((prompt: string) => run(async (api, signal, generation) => {
    if (!snapshot.current.session) throw new Error("Sign in before describing a task.");
    const request = reviewRequest(pending.current, prompt, () => crypto.randomUUID()); pending.current = request;
    // Write before dispatch: a missing response must remain reconcilable after a page reload.
    persistReview(window.sessionStorage, snapshot.current.session.user_id, request);
    closeWatch(); update({ task: null, events: [], receipt: null, receiptFresh: false, downloads: null, connection: "closed" });
    let task: Task;
    try { task = request.taskId ? await api.get(request.taskId, { signal }) : await api.create(request.prompt, request.key, { signal }); }
    catch (error) {
      if (error instanceof MendClientError && [400, 403, 404, 422].includes(error.status)) { pending.current = null; clearReview(window.sessionStorage); }
      throw error;
    }
    request.taskId = task.id;
    if (snapshot.current.session) persistReview(window.sessionStorage, snapshot.current.session.user_id, request);
    if (generation !== epoch.current) return;
    update({ task });
    let proposed: Task;
    try { proposed = task.status === "draft" ? await api.propose(task.id, task.contract_version, null, { signal }) : task; }
    catch (error) {
      if (error instanceof MendClientError && error.status === 409) {
        const latest = await api.get(task.id, { signal });
        if (generation === epoch.current) update({ task: latest });
        if (latest.status !== "draft") { pending.current = null; clearReview(window.sessionStorage); await attach(latest.id, generation); return; }
      }
      throw error;
    }
    if (generation !== epoch.current) return;
    pending.current = null; clearReview(window.sessionStorage); startKey.current = null; update({ task: proposed }); await attach(proposed.id, generation);
  }), [attach, closeWatch, run, update]);
  const start = useCallback(() => run(async (api, signal, generation) => {
    const task = snapshot.current.task;
    if (!task || task.status !== "ready") throw new Error("Review a ready contract before starting.");
    update({ runtime: null });
    const runtime = await readRuntime(signal);
    if (generation !== epoch.current) return;
    update({ runtime });
    if (!runtime.ready) throw new Error(runtime.blockers.join(" ") || "Execution is unavailable in this runtime.");
    if (!startKey.current || startKey.current.taskId !== task.id || startKey.current.version !== task.contract_version)
      startKey.current = { taskId: task.id, version: task.contract_version, key: crypto.randomUUID() };
    const value = await api.start(task.id, task.contract_version, startKey.current.key, { signal });
    if (generation === epoch.current) { update({ task: value }); await attach(task.id, generation, true); }
  }), [attach, readRuntime, run, update]);
  const cancel = useCallback(() => run(async (api, signal, generation) => {
    const task = snapshot.current.task; if (!task) throw new Error("Load a task before requesting a stop.");
    const value = await api.cancel(task.id, { signal });
    if (generation === epoch.current) { update({ task: value }); await attach(task.id, generation, true); }
  }), [attach, run, update]);
  const download = useCallback(() => run(async (api, signal, generation) => {
    const task = snapshot.current.task;
    if (!task || task.status !== "passed" || !snapshot.current.receipt) throw new Error("A completed receipt is required before downloading verified code.");
    const requestedAt = Date.now();
    const downloads = await api.artifacts(task.id, { signal });
    if (generation !== epoch.current || !alive.current) return;
    if (downloadExpiry.current !== null) clearTimeout(downloadExpiry.current);
    downloadExpiry.current = null;
    const lifetimes = Object.values(downloads).map(link => link.expires_seconds);
    const remaining = lifetimes.length ? Math.min(...lifetimes) * 1000 - (Date.now() - requestedAt) : 0;
    if (remaining <= 0) { update({ downloads: null }); throw new Error("The download links expired. Request fresh links."); }
    update({ downloads });
    downloadExpiry.current = setTimeout(() => {
      downloadExpiry.current = null;
      if (alive.current && generation === epoch.current && snapshot.current.task?.id === task.id) update({ downloads: null });
    }, remaining);
  }), [run, update]);
  const refresh = useCallback(() => run(async (_api, signal, generation) => {
    update({ runtime: null });
    const runtime = await readRuntime(signal);
    if (generation !== epoch.current) return;
    update({ runtime });
    if (runtime.mode === "setup_only") { clearOwner(); return; }
    if (snapshot.current.task) await attach(snapshot.current.task.id, generation, true);
  }), [attach, clearOwner, readRuntime, run, update]);
  const clearError = useCallback(() => update({ error: null }), [update]);
  return { ...state, review, signIn, logout, load, start, cancel, download, refresh, clearError };
}
