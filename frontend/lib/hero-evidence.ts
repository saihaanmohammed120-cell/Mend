import { logText, objectValue, validateReceipt } from "./evidence";
import type { JsonObject, MendEvent, Task } from "./mend-client";

export interface HeroEvidence {
  kind: "empty" | "pending" | "rejected" | "verified";
  receiptId: string | null;
  recordedAt: string | null;
  snapshot: string | null;
  checks: { id: string; status: string }[];
  passed: number | null;
  total: number | null;
  logLines: string[];
}

function recordedTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
    ? value : null;
}

function plainLog(event: MendEvent): string {
  // Logs remain diagnostics, even when a terminal uses ANSI styling.
  const clean = logText(event)
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  return clean.length > 2000 ? clean.slice(0, 2000) + "\n[Output shortened in this view]" : clean;
}

/** Projects accepted API evidence only; no independent execution or signature verification is implied. */
export function projectHeroEvidence({ task, receipt, events }: {
  task: Task | null;
  receipt: JsonObject | null;
  events: MendEvent[];
}): HeroEvidence {
  const logLines = task ? events.filter(event => event.type === "log" && event.data.task_id === task.id)
    .slice(-12).map(plainLog).filter(Boolean) : [];
  const result: HeroEvidence = { kind: task ? "pending" : "empty", receiptId: null, recordedAt: null,
    snapshot: null, checks: [], passed: null, total: null, logLines };
  if (!receipt) return result;
  if (!task || task.status !== "passed") return { ...result, kind: "rejected" };
  try {
    validateReceipt(receipt, task);
  } catch {
    return { ...result, kind: "rejected" };
  }
  const checks = objectValue(receipt.checks)!;
  const results = checks.results as JsonObject[];
  return { ...result, kind: "verified",
    receiptId: typeof receipt.receipt_id === "string" && receipt.receipt_id.length > 0 && receipt.receipt_id.length <= 128
      ? receipt.receipt_id : null,
    recordedAt: recordedTimestamp(receipt.created_at), snapshot: receipt.snapshot_sha256 as string,
    checks: results.map(check => ({ id: check.check_id as string, status: check.status as string })),
    passed: checks.passed as number, total: checks.total as number };
}
