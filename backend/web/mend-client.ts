/** Mend browser bridge. Same-origin cookies; never provider credentials or token URLs. */
export const TASK_STATUSES = [
  "draft", "ready", "writing", "waiting_runner", "running", "fixing", "finalizing",
  "passed", "needs_help", "runner_unavailable", "stopping", "stopped",
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface Task extends JsonObject {
  id: string;
  status: TaskStatus;
  contract: JsonObject;
  contract_version: number;
}
export interface Session { user_id: string; csrf_token: string; expires_at: number }
export interface SignedArtifact { url: string; expires_seconds: number }
export interface Artifacts { bundle?: SignedArtifact; diff?: SignedArtifact }
export type EventType = "state" | "log" | "receipt" | "failed" | "stopped";
export interface MendEvent { id: string; type: EventType; data: JsonObject }
export interface WatchHandlers {
  onTask(task: Task): void;
  onEvent(event: MendEvent): void;
  onError?(error: MendClientError): void;
  onConnection?(state: "connecting" | "open" | "reconnecting" | "closed"): void;
}
export interface WatchHandle { close(): void; cursor(): string }
export interface WatchOptions { after?: string; signal?: AbortSignal; maxReconnectErrors?: number }
export interface RequestOptions { signal?: AbortSignal }
export class MendClientError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(message);
    this.name = "MendClientError";
  }
}
const TERMINAL = new Set<TaskStatus>(["passed", "needs_help", "runner_unavailable", "stopped"]);
const EVENT_TYPES: EventType[] = ["state", "log", "receipt", "failed", "stopped"];
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function task(value: unknown): Task {
  if (!object(value) || typeof value.id !== "string" || !UUID.test(value.id)
      || !TASK_STATUSES.includes(value.status as TaskStatus) || !object(value.contract)
      || !Number.isSafeInteger(value.contract_version) || Number(value.contract_version) < 1) {
    throw new MendClientError("invalid_response", "The task response is invalid.");
  }
  return value as Task;
}
function taskPath(id: string): string {
  if (!UUID.test(id)) throw new MendClientError("invalid_id", "A canonical task UUID is required.");
  return "/api/tasks/" + id;
}
function version(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 2147483647)
    throw new MendClientError("invalid_version", "A positive contract version is required.");
  return value;
}
function idempotency(value: string): string {
  if (!/^[\x21-\x7e]{1,128}$/.test(value))
    throw new MendClientError("invalid_idempotency_key", "A bounded Idempotency-Key is required.");
  return value;
}
function cursor(value: string): string {
  if (!/^[0-9]{1,19}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new MendClientError("invalid_cursor", "A nonnegative replay cursor is required.");
  return BigInt(value).toString();
}
function session(value: unknown): Session {
  if (!object(value) || typeof value.user_id !== "string" || !UUID.test(value.user_id)
      || typeof value.csrf_token !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(value.csrf_token)
      || !Number.isSafeInteger(value.expires_at) || Number(value.expires_at) <= Date.now() / 1000) {
    throw new MendClientError("invalid_session", "The server session is invalid or expired.", 401);
  }
  return value as unknown as Session;
}

export class MendClient {
  private csrf: string | null = null;
  private expiresAt = 0;
  private sessionOwner: string | null = null;
  private readonly fetcher: typeof fetch;
  private readonly sourceFactory: (url: string, init: EventSourceInit) => EventSource;
  private readonly watches = new Set<WatchHandle>();

  constructor(dependencies: {
    fetch?: typeof fetch;
    eventSource?: (url: string, init: EventSourceInit) => EventSource;
  } = {}) {
    if (typeof window === "undefined" || window.location.protocol !== "https:")
      throw new MendClientError("secure_browser_required", "Mend requires a same-origin HTTPS browser.");
    this.fetcher = dependencies.fetch ?? window.fetch.bind(window);
    this.sourceFactory = dependencies.eventSource ?? ((url, init) => new EventSource(url, init));
  }

  private clearSession(): void {
    this.csrf = null;
    this.expiresAt = 0;
    this.sessionOwner = null;
    for (const watch of [...this.watches]) watch.close();
  }

  private async request(path: string, method: string, body?: JsonObject,
                        options: RequestOptions = {}, headers: Record<string, string> = {}): Promise<Json> {
    if (!path.startsWith("/api/") || path.startsWith("//"))
      throw new MendClientError("invalid_route", "Only same-origin Mend API routes are allowed.");
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), 15000);
    let response: Response | undefined;
    try {
      response = await this.fetcher(path, {
        method, headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (response.status === 401) this.clearSession();
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        throw new MendClientError("invalid_response", "The API returned an unexpected response.", response.status);
      const declared = response.headers.get("content-length");
      if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES))
        throw new MendClientError("response_limit", "The API response exceeds its limit.", response.status);
      if (!response.body) throw new MendClientError("invalid_response", "The API response is empty.", response.status);
      const reader = response.body.getReader();
      let size = 0;
      const parts: Uint8Array[] = [];
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new MendClientError("response_limit", "The API response exceeds its limit.", response.status);
          parts.push(item.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new MendClientError("invalid_response", "The API returned invalid JSON.", response.status); }
      if (!response.ok) {
        if (response.status === 401) this.clearSession();
        const error = object(payload) && object(payload.error) ? payload.error : null;
        throw new MendClientError(
          error && typeof error.code === "string" && /^[a-z0-9_]{1,64}$/.test(error.code) ? error.code : "request_failed",
          error && typeof error.message === "string" && error.message.length <= 500 ? error.message : "The request could not be completed.",
          response.status);
      }
      return payload as Json;
    } catch (error) {
      if (error instanceof MendClientError) throw error;
      if (controller.signal.aborted) throw new MendClientError("request_aborted", "The request was cancelled or timed out.");
      throw new MendClientError("network_error", "The API could not be reached.");
    } finally {
      controller.abort();
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
      window.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async exchangeSession(accessToken: string, options: RequestOptions = {}): Promise<Session> {
    if (!/^[\x21-\x7e]{1,8192}$/.test(accessToken))
      throw new MendClientError("invalid_session", "A valid Supabase access token is required.", 401);
    const result = session(await this.request("/api/session", "POST", { access_token: accessToken }, options));
    this.clearSession();
    this.csrf = result.csrf_token;
    this.expiresAt = result.expires_at;
    this.sessionOwner = result.user_id;
    return result;
  }

  async getSession(options: RequestOptions = {}): Promise<Session> {
    const result = session(await this.request("/api/session", "GET", undefined, options));
    if (this.sessionOwner !== null && this.sessionOwner !== result.user_id) this.clearSession();
    this.csrf = result.csrf_token;
    this.expiresAt = result.expires_at;
    this.sessionOwner = result.user_id;
    return result;
  }

  private async mutationHeaders(options: RequestOptions): Promise<Record<string, string>> {
    if (!this.csrf || this.expiresAt <= Date.now() / 1000) await this.getSession(options);
    return { "X-CSRF-Token": this.csrf! };
  }

  async logout(options: RequestOptions = {}): Promise<void> {
    await this.request("/api/session", "DELETE", undefined, options, await this.mutationHeaders(options));
    this.clearSession();
  }

  async create(prompt: string, key: string, options: RequestOptions = {}): Promise<Task> {
    if (!prompt.trim() || new TextEncoder().encode(prompt).byteLength > 8000)
      throw new MendClientError("invalid_prompt", "A Python task prompt of 1–8000 bytes is required.");
    return task(await this.request("/api/tasks", "POST", { prompt, runtime: "python" }, options,
      { ...await this.mutationHeaders(options), "Idempotency-Key": idempotency(key) }));
  }
  async get(id: string, options: RequestOptions = {}): Promise<Task> {
    return task(await this.request(taskPath(id), "GET", undefined, options));
  }
  async propose(id: string, expectedVersion: number, contract: JsonObject | null = null, options: RequestOptions = {}): Promise<Task> {
    return task(await this.request(taskPath(id) + "/contract", "PATCH",
      { expected_version: version(expectedVersion), contract }, options, await this.mutationHeaders(options)));
  }
  async start(id: string, expectedVersion: number, key: string, options: RequestOptions = {}): Promise<Task> {
    return task(await this.request(taskPath(id) + "/start", "POST", { expected_version: version(expectedVersion) }, options,
      { ...await this.mutationHeaders(options), "Idempotency-Key": idempotency(key) }));
  }
  async cancel(id: string, options: RequestOptions = {}): Promise<Task> {
    return task(await this.request(taskPath(id) + "/cancel", "POST", {}, options, await this.mutationHeaders(options)));
  }
  async receipt(id: string, options: RequestOptions = {}): Promise<JsonObject> {
    const result = await this.request(taskPath(id) + "/receipt", "GET", undefined, options);
    if (!object(result)) throw new MendClientError("invalid_response", "The receipt response is invalid.");
    return result;
  }
  async artifacts(id: string, options: RequestOptions = {}): Promise<Artifacts> {
    const result = await this.request(taskPath(id) + "/artifacts", "GET", undefined, options);
    if (!object(result)) throw new MendClientError("invalid_response", "The artifact response is invalid.");
    const validated: Artifacts = {};
    for (const name of ["bundle", "diff"] as const) {
      if (result[name] === undefined) continue;
      const link = result[name];
      if (!object(link) || typeof link.url !== "string" || !Number.isInteger(link.expires_seconds)
          || Number(link.expires_seconds) < 1 || Number(link.expires_seconds) > 300)
        throw new MendClientError("invalid_download", "The download link is invalid.");
      let url: URL;
      try { url = new URL(link.url); } catch { throw new MendClientError("invalid_download", "The download link is invalid."); }
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        throw new MendClientError("invalid_download", "Only signed HTTPS downloads are supported; local test artifacts are not live downloads.");
      validated[name] = { url: url.href, expires_seconds: Number(link.expires_seconds) };
    }
    return validated;
  }

  async watchTask(id: string, handlers: WatchHandlers, options: WatchOptions = {}): Promise<WatchHandle> {
    taskPath(id);
    let last = cursor(options.after ?? "0");
    const maxErrors = options.maxReconnectErrors ?? 3;
    if (!Number.isInteger(maxErrors) || maxErrors < 1 || maxErrors > 10)
      throw new MendClientError("invalid_retry_limit", "The stream retry limit must be 1–10.");
    const currentSession = await this.getSession(options);
    const snapshot = await this.get(id, options);
    try { handlers.onTask(snapshot); }
    catch { throw new MendClientError("consumer_failed", "The task consumer could not process the snapshot."); }
    const latest = typeof snapshot.next_sequence === "number" && Number.isSafeInteger(snapshot.next_sequence)
      && snapshot.next_sequence >= 1 ? BigInt(snapshot.next_sequence - 1) : null;
    let closed = false;
    let source: EventSource | null = null;
    const expiryTimer: { value?: number } = {};
    let errors = 0;
    const notifyConnection = (state: "connecting" | "open" | "reconnecting" | "closed") => {
      try { handlers.onConnection?.(state); } catch { /* Notifications cannot interrupt resource cleanup. */ }
    };
    const notifyError = (error: MendClientError) => {
      try { handlers.onError?.(error); } catch { /* Consumer failures never own the stream lifecycle. */ }
    };
    const handle: WatchHandle = {
      close: () => {
        if (closed) return;
        closed = true;
        try { source?.close(); } catch { /* Complete all remaining cleanup even if an adapter fails. */ }
        if (expiryTimer.value !== undefined) window.clearTimeout(expiryTimer.value);
        options.signal?.removeEventListener("abort", abort);
        this.watches.delete(handle);
        notifyConnection("closed");
      },
      cursor: () => last,
    };
    const abort = () => handle.close();
    if (options.signal?.aborted || (TERMINAL.has(snapshot.status) && latest !== null && BigInt(last) >= latest)) {
      handle.close();
      return handle;
    }
    this.watches.add(handle);
    options.signal?.addEventListener("abort", abort, { once: true });
    expiryTimer.value = window.setTimeout(() => {
      handle.close();
      notifyError(new MendClientError("session_expired", "The session expired; sign in before reconnecting.", 401));
    }, Math.max(1, (currentSession.expires_at * 1000) - Date.now()));
    try {
      source = this.sourceFactory(taskPath(id) + "/events?after=" + encodeURIComponent(last), { withCredentials: true });
      notifyConnection("connecting");
      source.addEventListener("open", () => {
        if (!closed) { errors = 0; notifyConnection("open"); }
      });
      source.addEventListener("error", () => {
        if (closed) return;
        errors += 1;
        if (errors >= maxErrors) {
          handle.close();
          notifyError(new MendClientError("stream_unavailable", "The event stream could not reconnect; refresh session and resume from the saved cursor."));
        } else notifyConnection("reconnecting");
      });
      for (const type of EVENT_TYPES) source.addEventListener(type, (raw) => {
        if (closed) return;
        let next: string;
        let data: JsonObject;
        try {
          const message = raw as MessageEvent<string>;
          next = cursor(message.lastEventId);
          if (BigInt(next) <= BigInt(last)) return;
          if (new TextEncoder().encode(message.data).byteLength > MAX_RESPONSE_BYTES) throw new Error("event limit");
          const parsed: unknown = JSON.parse(message.data);
          if (!object(parsed) || parsed.task_id !== id || parsed.event_type !== type
              || typeof parsed.sequence !== "number" || !Number.isInteger(parsed.sequence) || parsed.sequence < 1
              || (Number.isSafeInteger(parsed.sequence) && BigInt(parsed.sequence).toString() !== next)) throw new Error("event identity");
          if (type === "state" && (!object(parsed.payload) || !TASK_STATUSES.includes(parsed.payload.status as TaskStatus)))
            throw new Error("unknown state");
          data = parsed;
        } catch {
          handle.close();
          notifyError(new MendClientError("invalid_event", "The event stream returned invalid data."));
          return;
        }
        try { handlers.onEvent({ id: next, type, data }); }
        catch {
          handle.close();
          notifyError(new MendClientError("consumer_failed", "The event consumer could not process the event; resume from the unchanged cursor."));
          return;
        }
        last = next;
        const payload = object(data.payload) ? data.payload : {};
        if (type === "receipt" || type === "failed" || type === "stopped"
            || (typeof payload.status === "string" && TERMINAL.has(payload.status as TaskStatus))) handle.close();
      });
    } catch (error) {
      handle.close();
      throw error instanceof MendClientError ? error : new MendClientError("stream_unavailable", "The event stream could not be opened.");
    }
    return handle;
  }

  dispose(): void { this.clearSession(); }
}
