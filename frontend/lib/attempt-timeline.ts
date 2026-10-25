import type { StreamEvent } from "./evidence";
import { logText, objectValue } from "./evidence";
import type { Task } from "./mend-client";

export interface AttemptRow {
  id: string; ordinal: number; snapshot: string; model: string; status: string;
  reserved: boolean; resolved: boolean; inconsistent: boolean;
  checks: Array<{ id: string; status: string }> | null; diagnostic: string | null;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OUTCOMES = new Set(["passed", "failed", "timed_out", "cancelled", "infrastructure_failed"]);

/** Project explicit persisted observations only; never infer attempts from phase transitions or log prose. */
export function attemptTimeline(task: Task | null, events: StreamEvent[]): AttemptRow[] {
  if (!task) return [];
  const rows = new Map<string, AttemptRow>();
  const required = task.contract.required_check_ids;
  for (const event of events) {
    const p = objectValue(event.data.payload), id = event.data.attempt_id;
    if (event.type !== "log" || event.data.task_id !== task.id || event.data.stream !== "system" ||
        !p || p.schema_version !== 1 || !["attempt_reserved", "attempt_resolved"].includes(String(p.code)) ||
        typeof id !== "string" || !UUID.test(id) || !Number.isSafeInteger(p.ordinal) || Number(p.ordinal) < 1 || Number(p.ordinal) > 4 ||
        typeof p.snapshot_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(p.snapshot_sha256) ||
        typeof p.model_id !== "string" || !p.model_id || p.model_id.length > 512 ||
        (p.code === "attempt_reserved" ? p.attempt_status !== "reserved" : !OUTCOMES.has(String(p.attempt_status)))) continue;
    let row = rows.get(id);
    if (!row) {
      row = { id, ordinal: Number(p.ordinal), snapshot: p.snapshot_sha256, model: p.model_id,
        status: "reserved", reserved: false, resolved: false, inconsistent: false, checks: null, diagnostic: null };
      for (const previous of rows.values()) if (previous.ordinal === row.ordinal) previous.inconsistent = row.inconsistent = true;
      rows.set(id, row);
    }
    if (row.ordinal !== p.ordinal || row.snapshot !== p.snapshot_sha256 || row.model !== p.model_id) row.inconsistent = true;
    if (p.code === "attempt_reserved") row.reserved = true;
    else {
      const previousChecks = row.resolved ? JSON.stringify(row.checks) : undefined;
      if (row.resolved && row.status !== p.attempt_status) row.inconsistent = true;
      row.resolved = true; row.status = String(p.attempt_status);
      const checks = objectValue(p.checks), results = Array.isArray(checks?.results) ? checks.results.map(objectValue) : [];
      const valid = checks && Array.isArray(required) && required.length > 0 && new Set(required).size === required.length &&
        results.length === required.length && checks.total === required.length &&
        [checks.passed, checks.failed, checks.skipped].every(n => Number.isSafeInteger(n) && Number(n) >= 0) &&
        Number(checks.passed) + Number(checks.failed) + Number(checks.skipped) === checks.total &&
        results.every(r => r && typeof r.check_id === "string" && required.includes(r.check_id) && ["passed", "failed", "skipped"].includes(String(r.status))) &&
        new Set(results.map(r => r?.check_id)).size === required.length &&
        ["passed", "failed", "skipped"].every(status => results.filter(r => r?.status === status).length === checks[status]);
      row.checks = valid ? results.map(r => ({ id: String(r!.check_id), status: String(r!.status) })) : null;
      if (previousChecks !== undefined && previousChecks !== JSON.stringify(row.checks)) row.inconsistent = true;
      if (row.checks && ((row.status === "passed" && row.checks.some(c => c.status !== "passed")) ||
          (row.status === "failed" && !row.checks.some(c => c.status === "failed")))) row.inconsistent = true;
    }
  }
  for (const event of events) {
    const row = rows.get(String(event.data.attempt_id));
    if (row && event.data.task_id === task.id && event.type === "log" &&
        ["stdout", "stderr"].includes(String(event.data.stream))) row.diagnostic = logText(event).slice(0, 2000) || null;
  }
  return [...rows.values()].sort((a, b) => a.ordinal - b.ordinal).map(row => row.inconsistent ? { ...row, checks: null } : row);
}
