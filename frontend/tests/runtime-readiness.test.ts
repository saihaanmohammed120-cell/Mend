import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/runtime/route";
import { normalizeReadiness } from "../lib/runtime-readiness";

test("setup service is reachable but cannot permit a start even with contradictory evidence", () => {
  for (const upstreamOK of [true, false]) {
    const report = normalizeReadiness({ ready: true, mode: "setup_only", blockers: [],
      database: { status: "verified", source: "supabase_rpc", release_gate: "enabled" },
      checked_at: "2026-10-26T10:00:00Z", provider_verification: "not_established_by_this_endpoint" }, upstreamOK);
    assert.equal(report.api_status, "reachable");
    assert.equal(report.mode, "setup_only");
    assert.equal(report.ready, false);
    assert.equal(report.database.status, "not_checked");
    assert.deepEqual(report.blockers, ["runtime_not_ready"]);
  }
});

test("contradictory upstream readiness cannot enable Start", async () => {
  const previousFetch = globalThis.fetch;
  const previousURL = process.env.MEND_BACKEND_URL;
  process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
  try {
    for (const value of [
      { ready: true, mode: "database_only", blockers: [] },
      { ready: true, mode: "live", blockers: ["phase_1_release_evidence_required"] },
      { ready: true, mode: "unknown_mode", blockers: [] },
    ]) {
      globalThis.fetch = async () => Response.json(value);
      const result = await GET();
      assert.equal((await result.json()).ready, false, JSON.stringify(value));
    }
  } finally { globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previousURL; }
});

test("consistent live configuration passes through while failures stay blocked", async () => {
  const previousFetch = globalThis.fetch;
  const previousURL = process.env.MEND_BACKEND_URL;
  process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
  try {
    globalThis.fetch = async () => Response.json({ ready: true, mode: "live", blockers: [],
      checked_at: "2026-10-17T16:00:00Z", provider_verification: "not_established_by_this_endpoint",
      database: { status: "verified", source: "supabase_rpc", release_gate: "enabled" } });
    const allowed = await GET();
    assert.equal((await allowed.json()).ready, true);
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    globalThis.fetch = async () => Response.json({ ready: true, mode: "live", blockers: [] }, { status: 503 });
    assert.equal((await (await GET()).json()).ready, false);
    globalThis.fetch = async () => { throw new Error("transport down"); };
    assert.equal((await (await GET()).json()).ready, false);
  } finally { globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previousURL; }
});

test("configuration flags without a real database probe stay blocked", async () => {
  const oldFetch = globalThis.fetch, oldURL = process.env.MEND_BACKEND_URL;
  process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
  try {
    for (const database of [undefined, { status: "verified", source: "supabase_rpc", release_gate: "disabled" },
      { status: "not_checked", source: "none", release_gate: "unknown" }]) {
      globalThis.fetch = async () => Response.json({ ready: true, mode: "live", blockers: [], database,
        checked_at: "2026-10-17T16:00:00Z", provider_verification: "not_established_by_this_endpoint" });
      assert.equal((await (await GET()).json()).ready, false);
    }
  } finally { globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = oldURL; }
});

test("a valid blocked backend report preserves API/database facts and drops private fields", async () => {
  const oldFetch = globalThis.fetch, oldURL = process.env.MEND_BACKEND_URL;
  process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
  try {
    globalThis.fetch = async () => Response.json({ ready: false, mode: "database_only",
      blockers: ["database_release_gate_disabled"], checked_at: "2026-10-17T16:00:00Z",
      database: { status: "verified", source: "supabase_rpc", release_gate: "disabled", private_key: "DO_NOT_EXPORT_NESTED" },
      provider_verification: "not_established_by_this_endpoint", private_key: "DO_NOT_EXPORT" }, { status: 503 });
    const result = await (await GET()).json();
    assert.equal(result.api_status, "reachable");
    assert.equal(result.database.status, "verified");
    assert.equal(result.checked_at, "2026-10-17T16:00:00Z");
    assert.equal(JSON.stringify(result).includes("DO_NOT_EXPORT"), false);
  } finally { globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = oldURL; }
});

test("oversized upstream readiness is cancelled instead of buffered and trusted", { timeout: 1500 }, async () => {
  const oldFetch = globalThis.fetch, oldURL = process.env.MEND_BACKEND_URL;
  process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
  let cancelled = false;
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"ready":true,"padding":"' + "a".repeat(9000))); },
      cancel() { cancelled = true; },
    }));
    const result = await GET();
    assert.equal((await result.json()).ready, false);
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = oldURL; }
});
