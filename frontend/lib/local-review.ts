import contract from "./receipt-contract.json";

export type Files = Record<string, string>;
export const MAX_FILES = 20, MAX_SOURCE_BYTES = 200_000, MAX_JSON_BYTES = 3_000_000;
const encoder = new TextEncoder();
const hashPattern = /^[a-f0-9]{64}$/;
const badUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function record(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Use a JSON object.");
  return value as Record<string, unknown>;
}
function validJson(value: unknown, depth = 0): void {
  requireValue(depth <= 64, "JSON nesting exceeds 64 levels.");
  if (typeof value === "string") requireValue(!badUnicode.test(value), "Broken Unicode is not supported.");
  if (typeof value === "number") requireValue(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), "Unsupported JSON number.");
  if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { validJson(key, depth + 1); validJson(item, depth + 1); }
}

/** Bounded JSON with duplicate keys rejected, including escaped aliases. Never evaluates input. */
export function parseLocalJson(text: string, maximum = MAX_JSON_BYTES): unknown {
  requireValue(encoder.encode(text).byteLength <= maximum, "JSON exceeds its size limit.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Use valid JSON. Source maps look like {\"module.py\": \"source text\"}."); }
  const stack: Array<Set<string> | null> = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{" || char === "[") { stack.push(char === "{" ? new Set() : null); requireValue(stack.length <= 64, "JSON nesting exceeds 64 levels."); }
    else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
      const start = index++;
      while (index < text.length && text[index] !== '"') { if (text[index] === "\\") index++; index++; }
      let next = index + 1; while (/\s/.test(text[next] ?? "")) next++;
      if (text[next] === ":") {
        const key: string = JSON.parse(text.slice(start, index + 1));
        const keys = stack.at(-1); requireValue(keys && !keys.has(key), "Duplicate JSON keys are not supported."); keys.add(key);
      }
    }
  }
  validJson(value); return value;
}

export function safeSourcePath(path: string): void {
  requireValue(path.length <= 180 && /^[A-Za-z_][A-Za-z0-9_]*(\/[A-Za-z_][A-Za-z0-9_]*)*\.py$/.test(path), "Use relative .py paths without dots, drives or traversal.");
  requireValue(!path.slice(0, -3).split("/").some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|node_modules|venv|site_packages|vendor|__pycache__)$/i.test(part)), "Dependency and reserved-device paths are not supported.");
  requireValue(!/^(setup|conftest|sitecustomize|usercustomize)\.py$/.test(path.split("/").at(-1)!) && path !== "unittest.py", "Python hooks and unittest.py are outside this review scope.");
}
export function sourceFiles(value: unknown): Files {
  const files = record(value), paths = Object.keys(files);
  requireValue(paths.length >= 1 && paths.length <= MAX_FILES, "Supply 1–20 Python files.");
  requireValue(new Set(paths.map(path => path.toLowerCase())).size === paths.length, "Case-insensitive path aliases are not supported.");
  let bytes = 0;
  for (const path of paths) {
    safeSourcePath(path);
    const source = files[path];
    requireValue(typeof source === "string" && !source.includes("\0") && !badUnicode.test(source), "Sources must be valid text without NUL or broken Unicode.");
    bytes += encoder.encode(source).byteLength;
  }
  requireValue(bytes <= MAX_SOURCE_BYTES, "Keep each snapshot within 200,000 UTF-8 source bytes.");
  return files as Files;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value);
}
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function sourceHash(files: Files): Promise<string> { return sha256(canonicalJson({ schema_version: 1, files: sourceFiles(files) })); }

/** Same conservative prefix/suffix span used by the backend policy; linear in source length. */
export function changedSpan(before: string, after: string) {
  const original = before.match(/[^\n]*\n|[^\n]+$/g) ?? [], candidate = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let start = 0, end = 0;
  while (start < Math.min(original.length, candidate.length) && original[start] === candidate[start]) start++;
  while (end < Math.min(original.length, candidate.length) - start && original[original.length - end - 1] === candidate[candidate.length - end - 1]) end++;
  const removed = original.slice(start, original.length - end), added = candidate.slice(start, candidate.length - end);
  return { startLine: start + 1, removed: removed.join(""), added: added.join(""), changedLines: removed.length + added.length, changedBytes: encoder.encode(removed.join("") + added.join("")).byteLength };
}
export interface RepositoryReview {
  originalHash: string; candidateHash: string; protectedPaths: string[]; protectedChanged: string[];
  changed: Array<ReturnType<typeof changedSpan> & { path: string }>;
  changedLines: number; changedBytes: number;
}
export async function compareRepository(original: Files, candidate: Files, protectedPaths: string[]): Promise<RepositoryReview> {
  sourceFiles(original); sourceFiles(candidate);
  const paths = Object.keys(original).sort();
  requireValue(canonicalJson(paths) === canonicalJson(Object.keys(candidate).sort()), "Candidate must preserve every original path without additions or removals.");
  const locked = [...new Set([...protectedPaths, ...paths.filter(path => path.startsWith("tests/") || path.split("/").at(-1)!.startsWith("test_"))])].sort();
  requireValue(locked.length > 0 && locked.length < paths.length && locked.every(path => Object.hasOwn(original, path)), "Keep at least one existing protected path and one editable source path.");
  const changed = paths.filter(path => original[path] !== candidate[path]).map(path => ({ path, ...changedSpan(original[path], candidate[path]) }));
  const [originalHash, candidateHash] = await Promise.all([sourceHash(original), sourceHash(candidate)]);
  return { originalHash, candidateHash, protectedPaths: locked, protectedChanged: locked.filter(path => original[path] !== candidate[path]), changed,
    changedLines: changed.reduce((sum, row) => sum + row.changedLines, 0), changedBytes: changed.reduce((sum, row) => sum + row.changedBytes, 0) };
}
export function previewPolicy(review: RepositoryReview, maxLines: number, maxBytes: number) {
  requireValue([maxLines, maxBytes].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 400_000), "Policy limits must be whole numbers from 1 to 400,000.");
  const reasons = [];
  if (!review.changed.length) reasons.push("No changed source to review.");
  if (review.protectedChanged.length) reasons.push("Protected files changed.");
  if (review.changedLines > maxLines) reasons.push("Changed-line span exceeds your limit.");
  if (review.changedBytes > maxBytes) reasons.push("Changed-byte span exceeds your limit.");
  return { withinThresholds: reasons.length === 0, reasons, approval: "not_approved", execution: "not_run" } as const;
}

export interface ReceiptInspection {
  format: "SLSA statement" | "Backend receipt"; sourceClaim: string; checksConsistent: boolean | null;
  identityConsistent: boolean | null; sourceMatches: boolean | null; protectedMatches: boolean | null;
  expectedSnapshot: string | null; computedSnapshot: string | null;
  files: Array<{ path: string; expected: string; actual: string | null; matches: boolean | null }>;
}
/** Consistency/content inspection only. No signature, job, test execution or stop authority is trusted. */
export async function inspectReceipt(value: unknown, sources: Files | null): Promise<ReceiptInspection> {
  validJson(value); const receipt = record(value);
  if (sources) sourceFiles(sources);
  if (receipt._type === "https://in-toto.io/Statement/v1") {
    record(receipt.predicate);
    requireValue(receipt.predicateType === "https://slsa.dev/provenance/v1" && Array.isArray(receipt.subject) && receipt.subject.length >= 1 && receipt.subject.length <= 20, "Use a bounded SLSA v1 statement with SHA-256 Python subjects.");
    const seen = new Set<string>();
    const files = await Promise.all(receipt.subject.map(async item => {
      const subject = record(item), digest = record(subject.digest);
      requireValue(typeof subject.name === "string" && typeof digest.sha256 === "string" && hashPattern.test(digest.sha256), "Each subject needs a source path and SHA-256.");
      safeSourcePath(subject.name); requireValue(!seen.has(subject.name.toLowerCase()), "Duplicate receipt subjects are not supported."); seen.add(subject.name.toLowerCase());
      const actual = sources && Object.hasOwn(sources, subject.name) ? await sha256(sources[subject.name]) : null;
      return { path: subject.name, expected: digest.sha256, actual, matches: actual === null ? null : actual === digest.sha256 };
    }));
    return { format: "SLSA statement", sourceClaim: "Uploaded SLSA statement · unauthenticated", checksConsistent: null, identityConsistent: null,
      sourceMatches: files.some(file => file.matches === false) ? false : files.every(file => file.matches === true) ? true : null, protectedMatches: null, expectedSnapshot: null, computedSnapshot: null, files };
  }
  requireValue(receipt.schema_version === 1 && receipt.status === "passed", "Use a backend schema-1 passed receipt or a SLSA v1 statement.");
  requireValue((receipt.source === "live" || receipt.source === "local_test") && receipt.live_verification === (receipt.source === "live"), "Receipt evidence labels are unsupported or contradictory.");
  for (const field of ["receipt_id", "task_id", "final_attempt_id"]) requireValue(typeof receipt[field] === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(receipt[field]), "Receipt has an invalid identity.");
  for (const field of ["contract_sha256", "snapshot_sha256", "bundle_verified_sha256"]) requireValue(typeof receipt[field] === "string" && hashPattern.test(receipt[field]), "Receipt has an invalid SHA-256 identity.");
  for (const field of ["model_id", "job_id", "image_digest"]) requireValue(typeof receipt[field] === "string" && /^[\x20-\x7E]{1,200}$/.test(receipt[field]), "Receipt has an invalid execution label.");
  requireValue(receipt.contract_sha256 === await sha256(canonicalJson(contract)), "Only the reviewed csv-cleaner-v1 backend contract is supported.");
  requireValue(receipt.bundle_verified_sha256 === receipt.snapshot_sha256, "Receipt bundle and snapshot identities disagree.");
  const checks = receipt.checks && typeof receipt.checks === "object" ? receipt.checks as Record<string, unknown> : {};
  const ids = contract.required_check_ids, sameSet = (values: unknown) => Array.isArray(values) && values.length === ids.length && new Set(values).size === ids.length && values.every(id => ids.includes(id));
  const results = Array.isArray(checks.results) ? checks.results : [];
  const checksConsistent = checks.total === ids.length && checks.passed === ids.length && checks.failed === 0 && checks.skipped === 0 && sameSet(checks.check_ids) &&
    results.every(item => item && typeof item === "object" && item.status === "passed") && sameSet(results.map(item => item?.check_id));
  const history = receipt.receipt_json && typeof receipt.receipt_json === "object" ? (receipt.receipt_json as Record<string, unknown>).attempt_history : null;
  const matches = Array.isArray(history) ? history.filter(item => item && item.id === receipt.final_attempt_id) : [];
  const attempt = matches.length === 1 ? matches[0] : null;
  const identityConsistent = !!attempt && ["snapshot_sha256", "model_id", "job_id", "image_digest", "task_id"].every(key => attempt[key] === receipt[key]) && attempt.status === "passed" && attempt.exit_code === 0;
  let computedSnapshot: string | null = null, protectedMatches: boolean | null = null;
  if (sources) {
    const names = [...contract.editable_paths, ...Object.keys(contract.protected_files)];
    requireValue(canonicalJson(Object.keys(sources).sort()) === canonicalJson(names.sort()), "Select exactly the two contracted CSV source/test files for this receipt.");
    computedSnapshot = await sourceHash(sources);
    const protectedFiles = Object.fromEntries(Object.keys(contract.protected_files).map(path => [path, sources[path]]));
    protectedMatches = await sourceHash(protectedFiles) === await sourceHash(contract.protected_files);
  }
  return { format: "Backend receipt", sourceClaim: `${receipt.source} · untrusted uploaded claim, not verified execution`, checksConsistent, identityConsistent,
    sourceMatches: computedSnapshot === null ? null : computedSnapshot === receipt.snapshot_sha256, protectedMatches, expectedSnapshot: String(receipt.snapshot_sha256), computedSnapshot, files: [] };
}

/** Validate selected source-map JSON before replacing any current source input. */
export async function readSourceMapFile(file: File): Promise<Files> {
  requireValue(file.size <= MAX_JSON_BYTES, "Source-map JSON exceeds 3,000,000 bytes.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  return sourceFiles(parseLocalJson(text));
}

/** File selection stays local and exact UTF-8 bytes (including a BOM) are preserved. */
export async function readSourceFiles(files: File[]): Promise<Files> {
  requireValue(files.length >= 1 && files.length <= MAX_FILES && files.reduce((sum, file) => sum + file.size, 0) <= MAX_SOURCE_BYTES, "Select 1–20 Python files, up to 200,000 bytes combined.");
  const result: Files = Object.create(null);
  for (const file of files) {
    const path = file.webkitRelativePath || file.name; safeSourcePath(path);
    requireValue(!Object.hasOwn(result, path), "Duplicate selected paths are not supported.");
    result[path] = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
  }
  return sourceFiles(result);
}
