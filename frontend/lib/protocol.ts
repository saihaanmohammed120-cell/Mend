export type RunMode = "demo" | "live";
export type RunStatus =
  | "idle"
  | "writing"
  | "queued"
  | "running"
  | "fixing"
  | "stopping"
  | "success"
  | "failed"
  | "stopped";
export type StreamStatus =
  | "offline"
  | "connecting"
  | "connected"
  | "reconnecting";
export interface Receipt {
  receipt_id: string;
  task_id: string;
  source: RunMode;
  status: "passed";
  model: string;
  job_id: string;
  snapshot_sha256: string;
  checks: { passed: number; failed: number; total: number };
  attempts: number;
  duration_ms: number;
  created_at: string;
}
export type WorkEvent =
  | {
      type: "state";
      status: "writing" | "queued" | "running" | "fixing";
      attempt: number;
      message: string;
    }
  | { type: "log"; text: string; stream: "stdout" | "stderr"; attempt: number }
  | { type: "receipt"; receipt: Receipt }
  | { type: "failed"; message: string }
  | { type: "stopped"; message: string };
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown, limit = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}
function integer(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
  );
}
export function isReceipt(value: unknown, mode: RunMode): value is Receipt {
  if (!object(value) || !object(value.checks)) return false;
  const c = value.checks;
  return (
    value.source === mode &&
    value.status === "passed" &&
    string(value.receipt_id) &&
    string(value.task_id) &&
    string(value.model) &&
    string(value.job_id) &&
    typeof value.snapshot_sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.snapshot_sha256) &&
    integer(c.total, 1) &&
    integer(c.passed) &&
    c.passed === c.total &&
    c.failed === 0 &&
    integer(value.attempts, 1) &&
    value.attempts <= 4 &&
    integer(value.duration_ms) &&
    string(value.created_at) &&
    Number.isFinite(Date.parse(value.created_at))
  );
}
/* Validate untrusted SSE JSON. A model's success text is not a receipt. */
export function parseEvent(raw: string, mode: RunMode): WorkEvent {
  if (raw.length > 270_000)
    throw new Error("Stream event exceeded the output limit.");
  const v: unknown = JSON.parse(raw);
  if (!object(v)) throw new Error("Invalid stream event.");
  if (v.type === "receipt" && isReceipt(v.receipt, mode))
    return { type: "receipt", receipt: v.receipt };
  if ((v.type === "failed" || v.type === "stopped") && string(v.message, 2000))
    return { type: v.type, message: v.message };
  if (!integer(v.attempt, 1) || v.attempt > 4)
    throw new Error("Invalid attempt number.");
  if (
    v.type === "state" &&
    typeof v.status === "string" &&
    ["writing", "queued", "running", "fixing"].includes(String(v.status)) &&
    string(v.message, 2000)
  )
    return {
      type: "state",
      status: v.status as "writing" | "queued" | "running" | "fixing",
      attempt: v.attempt,
      message: v.message,
    };
  if (
    v.type === "log" &&
    string(v.text, 256_000) &&
    (v.stream === "stdout" || v.stream === "stderr")
  )
    return { type: "log", text: v.text, stream: v.stream, attempt: v.attempt };
  throw new Error("Invalid event or incomplete verification receipt.");
}
export function isBusy(status: RunStatus) {
  return ["writing", "queued", "running", "fixing", "stopping"].includes(
    status,
  );
}
export const STATUS_LABELS: Record<RunStatus, string> = {
  idle: "Ready when you are",
  writing: "Writing the first draft",
  queued: "Waiting for the runner",
  running: "Running checks",
  fixing: "Making a repair",
  stopping: "Stopping the runner",
  success: "Passed the listed checks",
  failed: "Needs your attention",
  stopped: "Task stopped",
};
