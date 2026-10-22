/** A local review packet, never an execution request or verification receipt. */
export interface BugDraft {
  filePath: string;
  errorMessage: string;
  source: string;
  expectedBehavior: string;
}
export interface BugIntake {
  kind: "mend_bug_intake";
  schema_version: 1;
  file_path: string | null;
  reported_error: string | null;
  original_source: string | null;
  expected_behavior: string | null;
  evidence: {
    investigation: "not_run";
    execution: "not_run";
    regression: "not_generated";
  };
}
export type IntakeIssues = Partial<Record<keyof BugDraft, string>>;
export const SOURCE_BYTE_LIMIT = 200_000;
export const TEXT_CHARACTER_LIMIT = 8_000;
export const PREVIEW_LINE_LIMIT = 200;
export const PREVIEW_CHARACTER_LIMIT = 20_000;
function validText(value: string): boolean {
  if (value.includes("\0")) return false;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}

export function prepareBugIntake(draft: BugDraft):
  | { ok: true; packet: BugIntake }
  | { ok: false; issues: IntakeIssues } {
  const issues: IntakeIssues = {};
  for (const key of ["filePath", "errorMessage", "source", "expectedBehavior"] as const) {
    if (typeof draft[key] !== "string" || !validText(draft[key])) {
      issues[key] = "Use valid text without NUL characters or broken Unicode.";
    }
  }
  if (Object.keys(issues).length) return { ok: false, issues };
  const hasSource = draft.source.length > 0;
  const hasCode = Boolean(draft.source.trim());
  const error = draft.errorMessage.trim();
  const path = draft.filePath.trim();
  if (!hasCode && !error) issues.errorMessage = "Add an error message or a small Python sample.";
  if ((hasSource || path) && !/^[A-Za-z_][A-Za-z0-9_]{0,63}\.py$/.test(path)) {
    issues.filePath = "Use one Python filename, such as csv_tools.py, without folders.";
  }
  if (new TextEncoder().encode(draft.source).byteLength > SOURCE_BYTE_LIMIT) {
    issues.source = "Keep the source within the local intake size limit.";
  }
  for (const key of ["errorMessage", "expectedBehavior"] as const) {
    if (draft[key].length > TEXT_CHARACTER_LIMIT) issues[key] = "Shorten the text before preparing the packet.";
  }
  if (Object.keys(issues).length) return { ok: false, issues };
  return {
    ok: true,
    packet: {
      kind: "mend_bug_intake",
      schema_version: 1,
      file_path: path || null,
      reported_error: error ? draft.errorMessage : null,
      original_source: hasSource ? draft.source : null,
      expected_behavior: draft.expectedBehavior.trim() || null,
      evidence: { investigation: "not_run", execution: "not_run", regression: "not_generated" },
    },
  };
}

export function serializeBugIntake(packet: BugIntake): string {
  return JSON.stringify(packet, null, 2) + "\n";
}

export interface BugInputIdentity {
  intake_json_sha256: string;
  original_source_sha256: string | null;
}

/** Fingerprints exact UTF-8 bytes, independently of any backend whole-file identity. */
export async function fingerprintBugIntake(packet: BugIntake): Promise<BugInputIdentity> {
  const hash = async (value: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  };
  const [intake, source] = await Promise.all([
    hash(serializeBugIntake(packet)),
    packet.original_source === null ? null : hash(packet.original_source),
  ]);
  return { intake_json_sha256: intake, original_source_sha256: source };
}

export interface BugDownloadEnvironment {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => Pick<HTMLAnchorElement, "href" | "download" | "click" | "remove">;
  appendAnchor: (anchor: Pick<HTMLAnchorElement, "href" | "download" | "click" | "remove">) => void;
}

/** On success the caller owns the URL; failures release every acquired resource. */
export function beginBugIntakeDownload(packet: BugIntake, browser: BugDownloadEnvironment): string {
  const url = browser.createObjectURL(new Blob([serializeBugIntake(packet)], { type: "application/json" }));
  let anchor: ReturnType<BugDownloadEnvironment["createAnchor"]> | null = null;
  let handedOff = false;
  try {
    anchor = browser.createAnchor();
    anchor.href = url;
    anchor.download = "mend-bug-intake.json";
    browser.appendAnchor(anchor);
    anchor.click();
    anchor.remove();
    anchor = null;
    handedOff = true;
    return url;
  } finally {
    try {
      anchor?.remove();
    } finally {
      if (!handedOff) browser.revokeObjectURL(url);
    }
  }
}

export function previewSource(source: string): { lines: string[]; truncated: boolean } {
  let clipped = source.slice(0, PREVIEW_CHARACTER_LIMIT);
  const last = clipped.charCodeAt(clipped.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) clipped = clipped.slice(0, -1);
  const lines = clipped.split("\n");
  return {
    lines: lines.slice(0, PREVIEW_LINE_LIMIT),
    truncated: clipped.length < source.length || lines.length > PREVIEW_LINE_LIMIT,
  };
}
