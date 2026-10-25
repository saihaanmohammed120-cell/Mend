"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, LockKeyhole, RotateCcw } from "lucide-react";
import capture from "../lib/captured-example.json";
import { beginBugIntakeDownload, beginBugReviewRequestDownload, fingerprintBugIntake, prepareBugIntake, prepareBugReviewRequest, previewSource, serializeBugIntake, serializeBugReviewRequest, CHECK_IDS_CHARACTER_LIMIT, SOURCE_BYTE_LIMIT, TEXT_CHARACTER_LIMIT, type BugReviewDraft, type BugReviewRequest, type BugInputIdentity, type BugIntake, type IntakeIssues } from "../lib/bug-intake";
import "./bug-desk.css";

const EMPTY: BugReviewDraft = { filePath: "", errorMessage: "", source: "", expectedBehavior: "", protectedTestSource: "", requiredCheckIds: "", targetCheckId: "" };
const FIELDS = ["errorMessage", "expectedBehavior", "filePath", "source", "protectedTestSource", "requiredCheckIds", "targetCheckId"] as const;
const LABELS = { errorMessage: "Reported error", expectedBehavior: "Expected behavior", filePath: "Python filename", source: "Original source" };

/** Inputs remain in page memory; this desk has no task or execution transport. */
export function BugDesk() {
  const [draft, setDraft] = useState<BugReviewDraft>(EMPTY);
  const [clearedDraft, setClearedDraft] = useState<BugReviewDraft | null>(null);
  const [issues, setIssues] = useState<IntakeIssues>({});
  const [packet, setPacket] = useState<BugIntake | null>(null);
  const [reviewRequest, setReviewRequest] = useState<BugReviewRequest | null>(null);
  const [identity, setIdentity] = useState<BugInputIdentity | "unavailable" | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "requested" | "failed">("idle");
  const fields = useRef<Partial<Record<keyof BugReviewDraft, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const errors = useRef<HTMLDivElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const identityRevision = useRef(0);
  const pendingDownloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (Object.keys(issues).length) errors.current?.focus();
    else if (packet) review.current?.focus();
  }, [issues, packet]);
  useEffect(() => {
    const pending = pendingDownloads.current;
    const revision = identityRevision;
    return () => {
      revision.current++;
      for (const [url, timer] of pending) { clearTimeout(timer); URL.revokeObjectURL(url); }
      pending.clear();
    };
  }, []);

  function invalidateReview() {
    identityRevision.current++;
    setPacket(null); setReviewRequest(null); setIdentity(null); setIssues({}); setDownloadState("idle");
  }
  function change(field: keyof BugReviewDraft, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setClearedDraft(null); invalidateReview();
  }
  function focusField(field: keyof BugReviewDraft) {
    const node = fields.current[field];
    const disclosure = node?.closest("details");
    if (disclosure) disclosure.open = true;
    node?.focus();
  }
  function prepare(withProtectedTests = false) {
    invalidateReview();
    const result = withProtectedTests ? prepareBugReviewRequest(draft) : prepareBugIntake(draft);
    if (!result.ok) { setIssues(result.issues); return; }
    const prepared = "request" in result ? result.request.intake : result.packet;
    if ("request" in result) setReviewRequest(result.request);
    const sourceDisclosure = fields.current.source?.closest("details");
    if (sourceDisclosure && prepared.original_source !== null) sourceDisclosure.open = true;
    setPacket(prepared);
    const revision = identityRevision.current;
    void fingerprintBugIntake(prepared).then(value => {
      if (identityRevision.current === revision) setIdentity(value);
    }).catch(() => { if (identityRevision.current === revision) setIdentity("unavailable"); });
  }
  function useExample() {
    invalidateReview(); setClearedDraft(null);
    setDraft({ ...EMPTY, filePath: "csv_tools.py", errorMessage: "IndexError: list index out of range", source: capture.before_source, expectedBehavior: "Return an empty result and zero missing values when no rows are supplied." });
    focusField("errorMessage");
  }
  function clear() {
    if (!FIELDS.some(field => draft[field].length)) return;
    setClearedDraft({ ...draft }); setDraft(EMPTY); invalidateReview(); focusField("errorMessage");
  }
  function undoClear() {
    if (!clearedDraft) return;
    setDraft(clearedDraft); setClearedDraft(null); invalidateReview(); focusField("errorMessage");
  }
  function download(protectedRequest = false) {
    if (!packet) return;
    let url: string | null = null;
    try {
      const browser = {
        createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: value => URL.revokeObjectURL(value),
        createAnchor: () => document.createElement("a"), appendAnchor: anchor => document.body.appendChild(anchor as HTMLAnchorElement),
      } satisfies import("../lib/bug-intake").BugDownloadEnvironment;
      if (protectedRequest && !reviewRequest) return;
      url = protectedRequest ? beginBugReviewRequestDownload(reviewRequest!, browser) : beginBugIntakeDownload(packet, browser);
      const owned = url;
      const timer = setTimeout(() => { URL.revokeObjectURL(owned); pendingDownloads.current.delete(owned); }, 1000);
      pendingDownloads.current.set(owned, timer); setDownloadState("requested");
    } catch {
      if (url !== null) URL.revokeObjectURL(url);
      setDownloadState("failed");
    }
  }

  const preview = packet?.original_source != null ? previewSource(packet.original_source) : null;
  const sourceBytes = new TextEncoder().encode(draft.source).byteLength;
  const empty = !FIELDS.some(field => draft[field].length);
  const issueEntries = FIELDS.filter(field => issues[field]);
  const stage = !packet ? 0 : downloadState === "requested" ? 2 : 1;

  return <main className="mend-bug-desk" data-testid="bug-desk">
    <header className="bug-topbar flex-wrap">
      <Link href="/" className="bug-brand" aria-label="Mend home"><span className="bug-brand-mark" aria-hidden="true" /><span>mend</span><span className="bug-brand-note">Paper &amp; proof.</span></Link>
      <nav aria-label="Bug desk navigation" className="flex flex-wrap gap-3"><Link href="/tools" className="bug-button bug-secondary">Local tools</Link><Link href="/sign-in" className="bug-button bug-secondary"><ArrowLeft size={15} aria-hidden="true" /> Workbench</Link></nav>
    </header>
    <div className="bug-canvas">
      <div className="bug-title-row"><div><h1>Bug intake</h1><p>Keep the original failure. Review what leaves your desk.</p></div><p className="bug-local"><LockKeyhole size={15} aria-hidden="true" /> Local only · nothing uploaded</p></div>
      <ol className="bug-steps" aria-label="Local intake progress">{["Describe", "Review", "Export"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} data-step-state={index < stage ? "complete" : index === stage ? "current" : "upcoming"}><strong>{label}</strong><span>{index < stage ? "Complete" : index === stage ? index === 2 ? "Download requested" : "Current step" : "Next"}</span></li>)}</ol>
      <div className="bug-sheet">
        <section className="bug-editor" aria-labelledby="bug-editor-title">
          <div className="bug-section-heading"><h2 id="bug-editor-title">The original failure</h2>{empty ? <button type="button" className="bug-button bug-secondary" onClick={useExample}>Load captured input <ArrowRight size={14} aria-hidden="true" /></button> : null}</div>
          <p className="bug-help">Add an error or one Python module. A reported error has not been reproduced yet.</p>
          <div role="form" aria-label="Prepare a local bug intake" className="bug-fields">
            {issueEntries.length ? <div ref={errors} className="bug-errors" role="alert" tabIndex={-1}><h3>Check the intake</h3><ul>{issueEntries.map(field => <li key={field}><a href={`#bug-${field}`} onClick={event => { event.preventDefault(); focusField(field); }}>{issues[field]}</a></li>)}</ul></div> : null}
            <div className="bug-field"><label htmlFor="bug-errorMessage">Reported error <span>or provide source</span></label><textarea id="bug-errorMessage" name="errorMessage" ref={node => { fields.current.errorMessage = node; }} value={draft.errorMessage} onChange={event => change("errorMessage", event.target.value)} rows={3} maxLength={TEXT_CHARACTER_LIMIT} spellCheck={false} placeholder="Paste the exact error or traceback." aria-invalid={Boolean(issues.errorMessage)} aria-describedby={issues.errorMessage ? "bug-errorMessage-issue" : undefined} />{issues.errorMessage ? <p id="bug-errorMessage-issue" className="bug-field-error">{issues.errorMessage}</p> : null}</div>
            <div className="bug-field"><label htmlFor="bug-expectedBehavior">Expected behavior <span>optional</span></label><textarea id="bug-expectedBehavior" name="expectedBehavior" ref={node => { fields.current.expectedBehavior = node; }} value={draft.expectedBehavior} onChange={event => change("expectedBehavior", event.target.value)} rows={3} maxLength={TEXT_CHARACTER_LIMIT} placeholder="What should have happened instead?" aria-invalid={Boolean(issues.expectedBehavior)} aria-describedby={issues.expectedBehavior ? "bug-expectedBehavior-issue" : undefined} />{issues.expectedBehavior ? <p id="bug-expectedBehavior-issue" className="bug-field-error">{issues.expectedBehavior}</p> : null}</div>
            <details className="bug-source-editor"><summary>Add original Python source <span>{sourceBytes ? `${sourceBytes.toLocaleString()} bytes` : "Optional with an error"}</span></summary><div className="bug-source-fields">
              <div className="bug-field"><label htmlFor="bug-filePath">Python filename</label><input id="bug-filePath" name="filePath" ref={node => { fields.current.filePath = node; }} value={draft.filePath} onChange={event => change("filePath", event.target.value)} maxLength={67} autoComplete="off" placeholder="csv_tools.py" aria-invalid={Boolean(issues.filePath)} aria-describedby="bug-filePath-help" /><p id="bug-filePath-help" className={issues.filePath ? "bug-field-error" : "bug-help"}>{issues.filePath ?? "One .py module, without folders or dependencies."}</p></div>
              <div className="bug-field"><label htmlFor="bug-source">Original source</label><textarea id="bug-source" name="source" ref={node => { fields.current.source = node; }} value={draft.source} onChange={event => change("source", event.target.value)} rows={9} maxLength={SOURCE_BYTE_LIMIT} spellCheck={false} aria-invalid={Boolean(issues.source)} aria-describedby="bug-source-help bug-source-bytes" /><p id="bug-source-bytes" className="bug-byte-count">{sourceBytes.toLocaleString()} / {SOURCE_BYTE_LIMIT.toLocaleString()} UTF-8 bytes</p><p id="bug-source-help" className={issues.source ? "bug-field-error" : "bug-help"}>{issues.source ?? "Preserved exactly, including blank lines. Remove credentials before sharing."}</p></div>
            </div></details>
            <div className="bug-actions"><button type="button" className={`bug-button ${packet ? "bug-secondary" : "bug-primary"}`} onClick={() => prepare()}>{packet ? "Review again" : "Review intake"}<ArrowRight size={16} aria-hidden="true" /></button>{clearedDraft ? <button type="button" className="bug-text-action" onClick={undoClear}><RotateCcw size={14} aria-hidden="true" /> Undo clear</button> : <button type="button" className="bug-text-action" onClick={clear} disabled={empty}>Clear fields</button>}</div>
            <details className="bug-protected-editor"><summary>Propose protected checks <span>Optional · unapproved</span></summary><div className="bug-source-fields">
              <p className="bug-help">For offline contract preparation, add original source and expected behavior above, then propose test_regression.py and its named unittest checks. This page never runs or approves tests.</p>
              {([
                ["protectedTestSource", "Proposed test_regression.py source", 9, SOURCE_BYTE_LIMIT, "import unittest\nfrom csv_tools import clean_rows\n", "Preserved exactly. Both source files share the 200,000 UTF-8 byte limit."],
                ["requiredCheckIds", "Required unittest check IDs", 4, CHECK_IDS_CHARACTER_LIMIT, "test_regression.CsvChecks.test_empty_input", "One unique ID per line, up to 64. Names are proposals; test discovery has not run."],
                ["targetCheckId", "Target check ID", 2, 200, "test_regression.CsvChecks.test_empty_input", "Copy one required ID for the behavior the original module should fail."],
              ] as const).map(([field, label, rows, maxLength, placeholder, help]) => <div className="bug-field" key={field}><label htmlFor={`bug-${field}`}>{label}</label><textarea id={`bug-${field}`} name={field} ref={node => { fields.current[field] = node; }} value={draft[field]} onChange={event => change(field, event.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder} spellCheck={false} aria-invalid={Boolean(issues[field])} aria-describedby={`bug-${field}-help`} /><p id={`bug-${field}-help`} className={issues[field] ? "bug-field-error" : "bug-help"}>{issues[field] ?? help}</p></div>)}
              <p className="bug-byte-count">{(sourceBytes + new TextEncoder().encode(draft.protectedTestSource).byteLength).toLocaleString()} / {SOURCE_BYTE_LIMIT.toLocaleString()} combined UTF-8 bytes</p>
              <button type="button" className="bug-button bug-secondary" onClick={() => prepare(true)}>Review protected-test request <ArrowRight size={16} aria-hidden="true" /></button>
            </div></details>
            <p className="bug-privacy">Inputs stay in this page’s memory. Reloading or leaving clears them. Download the reviewed JSON to keep a copy. JavaScript is required for local review and export.</p>
          </div>
        </section>
        <div className="bug-review-column">
          <section ref={review} className="bug-review" aria-labelledby="bug-review-title" tabIndex={-1}>
            <div className="bug-section-heading"><h2 id="bug-review-title">Review packet</h2><span className="bug-packet-kind">{reviewRequest ? "Proposed · not approved" : "Intake · not a receipt"}</span></div>
            <p role="status" aria-live="polite" aria-atomic="true" className="bug-review-status">{!packet ? "Your reviewed inputs will appear here. Nothing has been sent." : downloadState === "failed" ? "Download could not start. Your review is intact; retry below." : downloadState === "requested" ? "Download requested. No task was created and no checks ran." : "Prepared locally. Inspect the inputs before exporting."}</p>
            {packet ? <>
              <dl className="bug-review-fields">{([
                ["errorMessage", packet.reported_error], ["expectedBehavior", packet.expected_behavior], ["filePath", packet.file_path],
              ] as const).map(([field, value]) => <div key={field}><dt><span>{LABELS[field]}</span><button type="button" className="bug-text-action" aria-label={`Change ${LABELS[field].toLowerCase()}`} onClick={() => focusField(field)}>Change</button></dt><dd>{value ?? "Not supplied"}</dd></div>)}</dl>
              <div className="bug-source-review"><div className="bug-review-label"><h3>Original source</h3><button type="button" className="bug-text-action" onClick={() => focusField("source")}>Change original source</button></div>{preview ? <details className="bug-disclosure"><summary>Inspect exact source <span>{packet.file_path}</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed original source">{preview.lines.map((line, index) => <span key={index}><span className="bug-line-number" aria-hidden="true">{index + 1}</span><code>{line || "\u00a0"}{"\n"}</code></span>)}</pre>{preview.truncated ? <p className="bug-help">Preview shortened. The JSON retains the complete original source.</p> : null}</details> : <p className="bug-help">No source supplied. This packet contains only the reported error and context.</p>}</div>
              <details className="bug-disclosure"><summary>Input identities <span>SHA-256 · local</span></summary>{identity && identity !== "unavailable" ? <dl className="bug-identities"><div><dt>Raw source SHA-256</dt><dd><code>{identity.original_source_sha256 ?? "No source supplied"}</code></dd></div><div><dt>Intake JSON SHA-256</dt><dd><code>{identity.intake_json_sha256}</code></dd></div></dl> : <p className="bug-help">{identity === "unavailable" ? "Fingerprints unavailable in this browser. Review again to retry; your packet is intact." : "Computing exact-byte fingerprints in this browser…"}</p>}<p className="bug-help">The JSON fingerprint includes its final newline. Fingerprints identify bytes; they do not prove a fix, signature or backend task identity.</p></details>
              <details className="bug-disclosure"><summary>Inspect intake JSON <span>Schema 1</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed intake JSON">{serializeBugIntake(packet)}</pre></details>
              {reviewRequest ? <div className="bug-protected-review"><h3>Proposed protected checks</h3><p className="bug-help">Unapproved and not executed. A reviewer must verify test source, discovery and behavior. This request contains no contract or backend identity.</p><dl className="bug-review-fields"><div><dt>Required unittest IDs<button type="button" className="bug-text-action" onClick={() => focusField("requiredCheckIds")}>Change required checks</button></dt><dd>{reviewRequest.required_check_ids.join("\n")}</dd></div><div><dt>Target check<button type="button" className="bug-text-action" onClick={() => focusField("targetCheckId")}>Change target check</button></dt><dd>{reviewRequest.target_check_id}</dd></div></dl><button type="button" className="bug-text-action" onClick={() => focusField("protectedTestSource")}>Change proposed test source</button><details className="bug-disclosure"><summary>Inspect protected test source <span>test_regression.py</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed proposed test source">{previewSource(reviewRequest.protected_test_source).lines.join("\n")}</pre>{previewSource(reviewRequest.protected_test_source).truncated ? <p className="bug-help">Preview shortened. The request JSON retains the complete test source.</p> : null}</details><details className="bug-disclosure"><summary>Inspect review request JSON <span>Offline preparation input</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed protected-test request JSON">{serializeBugReviewRequest(reviewRequest)}</pre></details><button type="button" className="bug-button bug-primary bug-export" onClick={() => download(true)}><Download size={16} aria-hidden="true" /> Download review request JSON</button><p className="bug-help">Save mend-bug-review-request.json for the offline prepare_bug_case CLI --request option. The browser does not contact the backend.</p></div> : null}
              <button type="button" className={`bug-button ${reviewRequest ? "bug-secondary" : "bug-primary"} bug-export`} onClick={() => download()}><Download size={16} aria-hidden="true" /> Download intake JSON</button>
              <p className="bug-help bug-export-note">The intake JSON includes only the original failure and context. Proposed protected checks are exported separately as a review request.</p>
            </> : <div className="bug-review-empty"><h3>A handoff starts with inputs.</h3><ul><li>The exact error, in your own context.</li><li>The unchanged source, when available.</li><li>The result you expected instead.</li></ul><p>Review catches missing or invalid input. It does not diagnose the cause or establish a passing check.</p></div>}
          </section>
          <section className="bug-gate" aria-labelledby="bug-gate-title"><div className="bug-section-heading"><h2 id="bug-gate-title">Execution is gated</h2><LockKeyhole size={16} aria-hidden="true" /></div><dl><div><dt>Investigation</dt><dd>Not run</dd></div><div><dt>Patch</dt><dd>Not generated</dd></div><div><dt>Checks &amp; regression</dt><dd>Not run</dd></div></dl><p>A backend recipe requires separately reviewed protected test source, named acceptance checks and explicit contract approval. Exporting either JSON does not authorize or start execution.</p></section>
        </div>
      </div>
      <footer className="bug-footer"><p>Small scope. Original evidence. An explicit handoff.</p><Link href="/#worked-example" className="bug-text-action">Inspect the captured example <ArrowRight size={14} aria-hidden="true" /></Link></footer>
    </div>
  </main>;
}
