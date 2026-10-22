import { TASK_STATUSES, type JsonObject, type MendEvent, type Task, type TaskStatus } from "./mend-client";

export type StreamEvent = MendEvent;
export function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
export function formatStatus(status: TaskStatus): string {
  return ({ draft: "Draft", ready: "Ready for review", writing: "Writing code", waiting_runner: "Waiting for isolated job",
    running: "Checks running", fixing: "Repairing", finalizing: "Verifying artifacts", passed: "Checks passed",
    needs_help: "Needs help", runner_unavailable: "Runner unavailable", stopping: "Stop requested", stopped: "Stopped" })[status];
}
export function appendEvent(events: StreamEvent[], event: StreamEvent, cap = 200): StreamEvent[] {
  if (!Number.isSafeInteger(cap) || cap < 1) throw new Error("A positive event limit is required.");
  if (events.some(item => item.id === event.id)) return events;
  const bounded = event.type === "log" ? { ...event, data: { ...event.data, message: logText(event) } } : event;
  return [...events, bounded].slice(-cap);
}
export function applyEvent(task: Task, event: StreamEvent): Task {
  if (event.data.task_id !== task.id) throw new Error("The event belongs to another task.");
  const payload = objectValue(event.data.payload);
  if (event.type === "state" && payload && TASK_STATUSES.includes(payload.status as TaskStatus))
    return { ...task, status: payload.status as TaskStatus };
  return task;
}
export function logText(event: StreamEvent): string {
  const payload = objectValue(event.data.payload);
  const text = typeof event.data.message === "string" ? event.data.message : typeof payload?.text === "string" ? payload.text : typeof payload?.message === "string" ? payload.message : "";
  return text.length > 4000 ? text.slice(0, 4000) + "\n[Output shortened in this view]" : text;
}
export function summarizeReceipt(receipt: JsonObject) {
  const checks = objectValue(receipt.checks);
  const results = Array.isArray(checks?.results) ? checks.results : [];
  return {
    live: receipt.source === "live" && receipt.live_verification === true,
    checks: results.flatMap(item => {
      const result = objectValue(item);
      return result && typeof result.check_id === "string" && typeof result.status === "string"
        ? [{ id: result.check_id, status: result.status }] : [];
    }),
    repairCount: Number.isSafeInteger(receipt.repair_count) && Number(receipt.repair_count) >= 0 ? Number(receipt.repair_count) : null,
    attempts: Number.isSafeInteger(receipt.attempts) && Number(receipt.attempts) >= 0 ? Number(receipt.attempts) : null,
  };
}

/** This validates the API evidence envelope; it is not an independent re-execution of checks. */
export function validateReceipt(receipt: JsonObject, task: Task): JsonObject {
  if (receipt.task_id !== task.id || receipt.status !== "passed" || receipt.source !== "live" || receipt.live_verification !== true)
    throw new Error("The receipt is not live passing evidence for this task.");
  const required = task.contract.required_check_ids;
  const checks = objectValue(receipt.checks);
  const results = Array.isArray(checks?.results) ? checks.results : [];
  if (!Array.isArray(required) || required.length === 0 || required.some(id => typeof id !== "string") ||
      new Set(required).size !== required.length || results.length !== required.length ||
      checks?.total !== required.length || checks?.passed !== required.length || checks?.failed !== 0 || checks?.skipped !== 0)
    throw new Error("The receipt does not cover every frozen check.");
  const ids = results.map(item => {
    const value = objectValue(item);
    if (!value || value.status !== "passed" || typeof value.check_id !== "string")
      throw new Error("The receipt contains incomplete individual check evidence.");
    return value.check_id;
  });
  if (new Set(ids).size !== required.length || required.some(id => !ids.includes(String(id))))
    throw new Error("The receipt check identities do not match the frozen contract.");
  if (typeof task.contract_sha256 === "string" && receipt.contract_sha256 !== task.contract_sha256)
    throw new Error("The receipt belongs to a different frozen contract.");
  if (typeof receipt.snapshot_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.snapshot_sha256) ||
      receipt.bundle_verified_sha256 !== receipt.snapshot_sha256)
    throw new Error("The receipt lacks consistent bundle evidence.");
  return receipt;
}

export interface PendingReview { prompt: string; key: string; taskId?: string }
export interface ReviewStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const REVIEW_CACHE = "mend.pending-review.v1";
const OWNER_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function validReview(value: unknown): value is PendingReview {
  const record = objectValue(value);
  return !!record && typeof record.prompt === "string" && record.prompt.trim() === record.prompt && record.prompt.length > 0 &&
    new TextEncoder().encode(record.prompt).byteLength <= 8000 && typeof record.key === "string" && /^[\x21-\x7e]{1,128}$/.test(record.key) &&
    (record.taskId === undefined || typeof record.taskId === "string" && OWNER_UUID.test(record.taskId));
}
export function restoreReview(storage: ReviewStorage, owner: string): PendingReview | null {
  if (!OWNER_UUID.test(owner)) throw new Error("A server-verified owner UUID is required.");
  const raw = storage.getItem(REVIEW_CACHE);
  if (raw === null) return null;
  try {
    if (new TextEncoder().encode(raw).byteLength > 52000) throw new Error("cache limit");
    const parsed: unknown = JSON.parse(raw);
    const record = objectValue(parsed);
    if (!record || record.owner_id !== owner || !validReview(record)) throw new Error("invalid owner or pending request");
    return { prompt: record.prompt as string, key: record.key as string,
      ...(typeof record.taskId === "string" ? { taskId: record.taskId } : {}) };
  } catch { storage.removeItem(REVIEW_CACHE); return null; }
}
export function persistReview(storage: ReviewStorage, owner: string, review: PendingReview): void {
  if (!OWNER_UUID.test(owner) || !validReview(review)) throw new Error("The pending request is invalid.");
  storage.setItem(REVIEW_CACHE, JSON.stringify({ owner_id: owner, prompt: review.prompt, key: review.key,
    ...(review.taskId ? { taskId: review.taskId } : {}) }));
}
export function clearReview(storage: ReviewStorage): void { storage.removeItem(REVIEW_CACHE); }
/** An ambiguous creation must reuse its key, even if no task response reached the browser. */
export function reviewRequest(previous: PendingReview | null, prompt: string, makeKey: () => string): PendingReview {
  const normalized = prompt.trim();
  if (!normalized || new TextEncoder().encode(normalized).byteLength > 8000) throw new Error("Describe a task in 1–8000 bytes.");
  if (previous && previous.prompt !== normalized) throw new Error("Retry the pending task before changing the prompt; its creation may already have succeeded.");
  return previous ?? { prompt: normalized, key: makeKey() };
}
