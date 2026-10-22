/** Bounded, allowlisted status only. A database handshake is never a repair receipt. */
export interface DatabaseStatus { status: "verified" | "unavailable" | "not_checked"; source: "supabase_rpc" | "none"; release_gate: "enabled" | "disabled" | "unknown" }
export interface RuntimeDetails { api_status: "reachable" | "unavailable"; database: DatabaseStatus; checked_at: string | null }
export const UNAVAILABLE_RUNTIME = { ready: false, mode: "unavailable", blockers: ["backend_unavailable"],
  api_status: "unavailable" as const, database: { status: "not_checked", source: "none", release_gate: "unknown" } as DatabaseStatus, checked_at: null };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export async function boundedReadiness(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing runtime report");
  let size = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8192) throw new Error("Runtime report too large");
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function normalizeReadiness(value: unknown, upstreamOK: boolean) {
  if (!record(value) || typeof value.ready !== "boolean" || !["local_test", "database_only", "live"].includes(String(value.mode)) ||
      !Array.isArray(value.blockers) || value.blockers.length > 32 || !value.blockers.every(code => typeof code === "string" && /^[a-z0-9_]{1,64}$/.test(code)))
    return UNAVAILABLE_RUNTIME;
  const d = value.database;
  const valid = record(d) && ["verified", "unavailable", "not_checked"].includes(String(d.status)) &&
    ["supabase_rpc", "none"].includes(String(d.source)) && ["enabled", "disabled", "unknown"].includes(String(d.release_gate)) &&
    (d.status === "verified" ? d.source === "supabase_rpc" : d.source === "none" && d.release_gate === "unknown");
  const database: DatabaseStatus = valid ? {
    status: d.status as DatabaseStatus["status"], source: d.source as DatabaseStatus["source"],
    release_gate: d.release_gate as DatabaseStatus["release_gate"],
  } : UNAVAILABLE_RUNTIME.database;
  const timestamp = typeof value.checked_at === "string" && value.checked_at.length <= 64 &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value.checked_at) && Number.isFinite(Date.parse(value.checked_at)) ? value.checked_at : null;
  const ready = upstreamOK && value.ready && value.mode === "live" && value.blockers.length === 0 &&
    database.status === "verified" && database.release_gate === "enabled" && timestamp !== null &&
    value.provider_verification === "not_established_by_this_endpoint";
  const blockers: string[] = [...value.blockers];
  if (!ready && blockers.length === 0) blockers.push("runtime_not_ready");
  return { ready, mode: value.mode as string, blockers, api_status: "reachable" as const, database, checked_at: timestamp };
}
