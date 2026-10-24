/** Server-only transport. Incoming headers never choose the backend destination. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function allowedRoute(path: string, method: string): boolean {
  if (path === "session") return ["GET", "POST", "DELETE"].includes(method);
  if (path === "bug-cases/prepare") return method === "POST";
  if (path === "tasks") return method === "POST";
  if (new RegExp(`^tasks/${UUID}$`).test(path)) return method === "GET";
  if (new RegExp(`^tasks/${UUID}/contract$`).test(path)) return method === "PATCH";
  if (new RegExp(`^tasks/${UUID}/(start|cancel)$`).test(path)) return method === "POST";
  return new RegExp(`^tasks/${UUID}/(events|receipt|artifacts)$`).test(path) && method === "GET";
}
export function backendOrigin(): string {
  const configured = process.env.MEND_BACKEND_URL;
  if (!configured) throw new Error("Backend origin is not configured");
  const value = new URL(configured);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(value.hostname);
  if (value.username || value.password || value.pathname !== "/" || value.search || value.hash ||
      !(value.protocol === "https:" || (local && value.protocol === "http:"))) throw new Error("Invalid backend origin");
  return value.origin;
}
function error(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function proxy(request: Request, segments: string[]): Promise<Response> {
  const path = segments.join("/");
  if (!allowedRoute(path, request.method)) return error("not_found", "This API route is unavailable.", 404);
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== "after") || (query.has("after") &&
      (!path.endsWith("/events") || !/^[0-9]{1,19}$/.test(query.get("after")!))))
    return error("invalid_cursor", "The replay cursor is invalid.", 400);
  let origin: string;
  try { origin = backendOrigin(); } catch { return error("backend_configuration", "The backend is not configured.", 503); }
  const headers = new Headers({ Accept: request.headers.get("accept")?.includes("text/event-stream") ? "text/event-stream" : "application/json" });
  for (const name of ["origin", "cookie", "content-type", "x-csrf-token", "idempotency-key", "last-event-id"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name)!);
  let body: ArrayBuffer | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) abort(); else request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, path.endsWith("/events") ? 920_000 : 20_000);
  let streaming = false;
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const reader = request.body?.getReader(); const parts: Uint8Array[] = []; let size = 0;
      const cancelRead = () => { void reader?.cancel().catch(() => undefined); };
      controller.signal.addEventListener("abort", cancelRead, { once: true });
      if (reader) try { if (controller.signal.aborted) { await reader.cancel(); controller.signal.throwIfAborted(); }
        while (true) { const item = await reader.read(); controller.signal.throwIfAborted(); if (item.done) break;
        size += item.value.length; if (size > 65_536) return error("body_limit", "The request exceeds its limit.", 413); parts.push(item.value); }
      } finally { controller.signal.removeEventListener("abort", cancelRead); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      body = bytes.buffer;
    }
    controller.signal.throwIfAborted();
    const result = await fetch(origin + "/api/" + path + (query.size ? "?" + query.toString() : ""), {
      method: request.method, headers, body, cache: "no-store", redirect: "error", signal: controller.signal,
    });
    const out = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "x-accel-buffering"]) if (result.headers.has(name)) out.set(name, result.headers.get(name)!);
    for (const cookie of result.headers.getSetCookie()) out.append("Set-Cookie", cookie);
    if (!result.body) return new Response(null, { status: result.status, headers: out });
    const reader = result.body.getReader();
    streaming = true;
    const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener("abort", abort); controller.abort(); };
    return new Response(new ReadableStream({
      async pull(stream) { try { const item = await reader.read(); if (item.done) { cleanup(); reader.releaseLock(); stream.close(); } else stream.enqueue(item.value); }
        catch { cleanup(); reader.releaseLock(); stream.error(new Error("Backend stream interrupted")); } },
      async cancel() { cleanup(); await reader.cancel().catch(() => undefined); },
    }), { status: result.status, headers: out });
  } catch { return error("backend_unavailable", "The backend could not be reached.", 503); }
  finally { if (!streaming) { clearTimeout(timer); request.signal.removeEventListener("abort", abort); controller.abort(); } }
}
