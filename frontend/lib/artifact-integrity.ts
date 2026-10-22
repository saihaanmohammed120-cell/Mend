import manifest from "./captured-file-digests.json";

const MAX_FILE_BYTES = 1024 * 1024;
const ALLOWED = new Set(["/example/csv_tools.py", "/example/test_csv_tools.py", "/example/captured-run.json", "/example/provenance.json"]);
export type FileIntegrityResult = {
  kind: "matched" | "mismatch";
  files: Array<{ name: string; expected: string; actual: string; status: "match" | "mismatch" }>;
};
type Options = { signal: AbortSignal; fetcher?: typeof fetch };

async function boundedBytes(response: Response, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!response.ok || response.redirected || !response.body) throw new Error("A proof file could not be read. Reload the page and retry.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Check cancelled.", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error("A proof file exceeds the check's size limit. No match was established.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (signal.aborted) throw new DOMException("Check cancelled.", "AbortError");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

/** Reads only the fixed local proof artifacts and compares bytes with build-recorded hashes. */
export async function checkArtifactFiles({ signal, fetcher = fetch }: Options): Promise<FileIntegrityResult> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser hashing is unavailable. Open this page over HTTPS and retry.");
  if (manifest.schema_version !== 1 || manifest.scope !== "captured_local_file_integrity" || manifest.signature_verification !== false ||
      manifest.files.length !== ALLOWED.size || new Set(manifest.files.map(file => file.path)).size !== ALLOWED.size ||
      manifest.files.some(file => !ALLOWED.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256))) {
    throw new Error("The file fingerprint record is invalid. No match was established.");
  }
  const files: FileIntegrityResult["files"] = [];
  for (const file of manifest.files) {
    if (signal.aborted) throw new DOMException("Check cancelled.", "AbortError");
    const response = await fetcher(file.path, { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
    const bytes = await boundedBytes(response, signal);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    if (signal.aborted) throw new DOMException("Check cancelled.", "AbortError");
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    files.push({ name: file.name, expected: file.sha256, actual, status: actual === file.sha256 && bytes.byteLength === file.bytes ? "match" : "mismatch" });
  }
  return { kind: files.every(file => file.status === "match") ? "matched" : "mismatch", files };
}
