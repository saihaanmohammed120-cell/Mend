import { MendClientError } from "./mend-client";

/** Token remains in memory only until exchange into the backend's sealed cookie. */
export async function signIn(email: string, password: string, signal?: AbortSignal): Promise<string> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key || !key.startsWith("sb_publishable_"))
    throw new MendClientError("auth_configuration", "Account access is not configured.");
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash)
    throw new MendClientError("auth_configuration", "Account access requires a configured HTTPS origin.");
  if (!email.trim() || !password) throw new MendClientError("invalid_sign_in", "Enter an email and password.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(parsed.origin + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ email: email.trim(), password }), signal: controller.signal,
      credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
    });
    if (!response.ok) { await response.body?.cancel(); throw new MendClientError("sign_in_failed", "Sign-in failed. Check the account credentials.", response.status); }
    if (!response.body) throw new MendClientError("invalid_session", "Account access returned no session.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 32_768) throw new MendClientError("invalid_session", "Account response exceeded its limit.");
        chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || !("access_token" in value) || typeof value.access_token !== "string" || value.access_token.length > 8192)
      throw new MendClientError("invalid_session", "Account access returned an invalid session.");
    return value.access_token;
  } catch (error) {
    if (error instanceof MendClientError) throw error;
    throw new MendClientError(controller.signal.aborted ? "request_aborted" : "sign_in_failed",
      controller.signal.aborted ? "Sign-in was cancelled or timed out." : "Account access could not be reached.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
