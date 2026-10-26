import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("setup connectivity does not suggest that auth, task review or database verification work", async () => {
  const { RuntimeConnection } = await import("../components/runtime-connection");
  const html = renderToStaticMarkup(createElement(RuntimeConnection, { checking: false, onRecheck: () => {}, runtime: {
    ready: false, mode: "setup_only", blockers: ["backend_setup_only"], api_status: "reachable",
    database: { status: "not_checked", source: "none", release_gate: "unknown" }, checked_at: null,
  } }));
  assert.match(html, /Reached/);
  assert.match(html, /Sign-in and saved tasks are unavailable/);
  assert.match(html, /database has not been checked; writes remain on hold/);
  assert.match(html, /Start disabled/);
  assert.doesNotMatch(html, /Task review can prepare a contract|Supabase responded|Execution available/);
});

test("Connection panel distinguishes API/database success from locked execution", async () => {
  assert.ok(existsSync(new URL("../components/runtime-connection.tsx", import.meta.url)), "Connection panel is missing");
  const { RuntimeConnection } = await import("../components/runtime-connection");
  const html = renderToStaticMarkup(createElement(RuntimeConnection, { checking: false, onRecheck: () => {}, runtime: {
    ready: false, mode: "database_only", blockers: ["database_release_gate_disabled"], api_status: "reachable",
    database: { status: "verified", source: "supabase_rpc", release_gate: "disabled" }, checked_at: "2026-10-17T16:00:00Z",
  } }));
  assert.match(html, /App API/); assert.match(html, /Reached/);
  assert.match(html, /Supabase responded/); assert.match(html, /Execution locked/);
  assert.match(html, /2026-10-17T16:00:00Z/);
  assert.match(html, /Recheck connections/);
  assert.doesNotMatch(html, /checks passed|repair verified/i);
});

test("Unknown connections are not shown as successful, and busy recheck is disabled", async () => {
  assert.ok(existsSync(new URL("../components/runtime-connection.tsx", import.meta.url)), "Connection panel is missing");
  const { RuntimeConnection } = await import("../components/runtime-connection");
  const html = renderToStaticMarkup(createElement(RuntimeConnection, { checking: true, onRecheck: () => {}, runtime: null }));
  assert.match(html, /Not checked/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /Supabase responded|Last backend check:/);
});
