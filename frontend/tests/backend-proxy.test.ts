import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedRoute, backendOrigin, proxy } from "../lib/backend-proxy";
const id = "96deff11-c0e2-4299-b5f0-b4f0a5020b7a";
test("proxy exposes existing routes and excludes missing history/source APIs", () => {
  assert.equal(allowedRoute(`tasks/${id}/contract`, "PATCH"), true);
  assert.equal(allowedRoute(`tasks/${id}/history`, "GET"), false);
  assert.equal(allowedRoute("tasks", "GET"), false);
  assert.equal(allowedRoute("tasks/../../session", "POST"), false);
});
test("proxy refuses credential-bearing or unencrypted remote destinations", () => {
  const previous = process.env.MEND_BACKEND_URL;
  try {
    for (const origin of ["http://remote.test", "https://secret@remote.test", "https://remote.test/path"])
      { process.env.MEND_BACKEND_URL = origin; assert.throws(backendOrigin); }
    process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000"; assert.equal(backendOrigin(), "http://127.0.0.1:8000");
  } finally { if (previous === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previous; }
});
test("proxy rejects an unexpected cursor before forwarding", async () => {
  const response = await proxy(new Request("https://mend.test/api/tasks?after=0", { method: "POST", body: "{}" }), ["tasks"]);
  assert.equal(response.status, 400);
});
test("proxy streams bytes and preserves separate sealed session cookies", async () => {
  const previousURL = process.env.MEND_BACKEND_URL; const previousFetch = globalThis.fetch;
  let forwarded: RequestInit | undefined;
  try {
    process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
    globalThis.fetch = async (_url, init) => {
      forwarded = init;
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.append("Set-Cookie", "__Host-mend-session=sealed; Secure; HttpOnly; Path=/");
      headers.append("Set-Cookie", "__Host-mend-csrf=csrf; Secure; Path=/");
      return new Response('{"user_id":"owner"}', { headers });
    };
    const response = await proxy(new Request("https://mend.test/api/session", { headers: { Cookie: "__Host-mend-session=old" } }), ["session"]);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(new Headers(forwarded?.headers).get("cookie"), "__Host-mend-session=old");
    assert.equal(await response.text(), '{"user_id":"owner"}');
  } finally { globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previousURL; }
});

test("already-cancelled streamed input is released without waiting or forwarding", async () => {
  const previousURL = process.env.MEND_BACKEND_URL; const previousFetch = globalThis.fetch;
  const abort = new AbortController(); abort.abort();
  let cancelled = false, forwarded = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({ start(value) { streamController = value; }, cancel() { cancelled = true; } });
  try {
    process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
    globalThis.fetch = async () => { forwarded = true; return new Response("{}"); };
    const request = new Request("https://mend.test/api/session", {
      method: "POST", body, signal: abort.signal, duplex: "half",
    } as RequestInit & { duplex: "half" });
    const pending = proxy(request, ["session"]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 100); })]);
    clearTimeout(timer);
    if (!response) { streamController!.close(); await pending; assert.fail("Cancelled input remained pending"); }
    assert.equal(response.status, 503);
    assert.equal(cancelled, true);
    assert.equal(forwarded, false);
    assert.equal(body.locked, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previousURL;
  }
});

test("cancellation during input reading prevents backend forwarding", async () => {
  const previousURL = process.env.MEND_BACKEND_URL; const previousFetch = globalThis.fetch;
  const abort = new AbortController();
  let cancelled = false, forwarded = false;
  const body = new ReadableStream<Uint8Array>({ pull() { abort.abort(); }, cancel() { cancelled = true; } });
  try {
    process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
    globalThis.fetch = async () => { forwarded = true; return new Response("{}"); };
    const response = await proxy(new Request("https://mend.test/api/session", {
      method: "POST", body, signal: abort.signal, duplex: "half",
    } as RequestInit & { duplex: "half" }), ["session"]);
    assert.equal(response.status, 503);
    assert.equal(cancelled, true);
    assert.equal(forwarded, false);
    assert.equal(body.locked, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL; else process.env.MEND_BACKEND_URL = previousURL;
  }
});
