import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
