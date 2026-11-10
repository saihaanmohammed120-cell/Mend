"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, LockKeyhole, RotateCcw } from "lucide-react";
import capture from "../lib/captured-example.json";
import { beginBugIntakeDownload, beginBugReviewRequestDownload, fingerprintBugIntake, prepareBugIntake, prepareBugReviewRequest, previewSource, serializeBugIntake, serializeBugReviewRequest, CHECK_IDS_CHARACTER_LIMIT, SOURCE_BYTE_LIMIT, TEXT_CHARACTER_LIMIT, type BugReviewDraft, type BugReviewRequest, type BugInputIdentity, type BugIntake, type IntakeIssues } from "../lib/bug-intake";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { Banner } from "@astryxdesign/core/Banner";
import { MendLink, MendButtonLink } from "./mend-link";
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
    // Limits are enforced by prepareBugIntake / prepareBugReviewRequest, not
    // by truncating input here: a field must be able to hold an over-limit
    // value so validation can report it, and Astryx TextArea maxLength is
    // display-only.
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
      <nav aria-label="Bug desk navigation" className="flex flex-wrap gap-3"><MendButtonLink href="/tools" label="Local tools" variant="secondary" /><MendButtonLink href="/sign-in" label="Workbench" variant="secondary" icon={<ArrowLeft size={15} aria-hidden="true" />} /></nav>
    </header>
    <div className="bug-canvas">
      <div className="bug-title-row"><div><h1>Bug intake</h1><p>Keep the original failure. Review what leaves your desk.</p></div><p className="bug-local"><LockKeyhole size={15} aria-hidden="true" /> Local only · nothing uploaded</p></div>
      <Stepper activeStep={stage} label="Local intake progress" className="bug-steps">
        {["Describe", "Review", "Export"].map((label, index) => <Step key={label} step={index} label={label} description={index < stage ? "Complete" : index === stage ? index === 2 ? "Download requested" : "Current step" : "Next"} status={index < stage ? "success" : undefined} aria-current={index === stage ? "step" : undefined} data-step-state={index < stage ? "complete" : index === stage ? "current" : "upcoming"} />)}
      </Stepper>
      <div className="bug-sheet">
        <section className="bug-editor" aria-labelledby="bug-editor-title">
          <div className="bug-section-heading"><h2 id="bug-editor-title">The original failure</h2>{empty ? <Button label="Load captured input" variant="secondary" size="sm" onClick={useExample} icon={<ArrowRight size={14} aria-hidden="true" />} /> : null}</div>
          <p className="bug-help">Add an error or one Python module. A reported error has not been reproduced yet.</p>
          <div role="form" aria-label="Prepare a local bug intake" className="bug-fields">
            {issueEntries.length ? <div ref={errors} className="bug-errors" tabIndex={-1} role="alert"><Banner status="error" title="Check the intake" collapsible={false}><ul>{issueEntries.map(field => <li key={field}><a href={`#bug-${field}`} onClick={event => { event.preventDefault(); focusField(field); }}>{issues[field]}</a></li>)}</ul></Banner></div> : null}
            <div className="bug-field"><TextArea id="bug-errorMessage" htmlName="errorMessage" label="Reported error" description="or provide source" ref={node => { fields.current.errorMessage = node; }} value={draft.errorMessage} onChange={value => change("errorMessage", value)} rows={3} maxLength={TEXT_CHARACTER_LIMIT} hasSpellCheck={false} placeholder="Paste the exact error or traceback." status={issues.errorMessage ? { type: "error", message: issues.errorMessage } : undefined} /></div>
            <div className="bug-field"><TextArea id="bug-expectedBehavior" htmlName="expectedBehavior" label="Expected behavior" isOptional ref={node => { fields.current.expectedBehavior = node; }} value={draft.expectedBehavior} onChange={value => change("expectedBehavior", value)} rows={3} maxLength={TEXT_CHARACTER_LIMIT} placeholder="What should have happened instead?" status={issues.expectedBehavior ? { type: "error", message: issues.expectedBehavior } : undefined} /></div>
            <details className="bug-source-editor"><summary>Add original Python source <span>{sourceBytes ? `${sourceBytes.toLocaleString()} bytes` : "Optional with an error"}</span></summary><div className="bug-source-fields">
              <div className="bug-field"><label htmlFor="bug-filePath">Python filename</label><input id="bug-filePath" name="filePath" ref={node => { fields.current.filePath = node; }} value={draft.filePath} onChange={event => change("filePath", event.target.value)} maxLength={67} autoComplete="off" placeholder="csv_tools.py" aria-invalid={Boolean(issues.filePath)} aria-describedby="bug-filePath-help" /><p id="bug-filePath-help" className={issues.filePath ? "bug-field-error" : "bug-help"}>{issues.filePath ?? "One .py module, without folders or dependencies."}</p></div>
              <div className="bug-field"><TextArea id="bug-source" htmlName="source" label="Original source" ref={node => { fields.current.source = node; }} value={draft.source} onChange={value => change("source", value)} rows={9} maxLength={SOURCE_BYTE_LIMIT} hasSpellCheck={false} aria-describedby="bug-source-bytes" status={issues.source ? { type: "error", message: issues.source } : undefined} description={issues.source ? undefined : "Preserved exactly, including blank lines. Remove credentials before sharing."} /><p id="bug-source-bytes" className="bug-byte-count">{sourceBytes.toLocaleString()} / {SOURCE_BYTE_LIMIT.toLocaleString()} UTF-8 bytes</p></div>
            </div></details>
            <div className="bug-actions"><Button label={packet ? "Review again" : "Review intake"} variant={packet ? "secondary" : "primary"} onClick={() => prepare()} icon={<ArrowRight size={16} aria-hidden="true" />} />{clearedDraft ? <Button label="Undo clear" variant="ghost" onClick={undoClear} icon={<RotateCcw size={14} aria-hidden="true" />} /> : <Button label="Clear fields" variant="ghost" onClick={clear} isDisabled={empty} icon={<RotateCcw size={14} aria-hidden="true" />} />}</div>
            <details className="bug-protected-editor"><summary>Propose protected checks <span>Optional · unapproved</span></summary><div className="bug-source-fields">
              <p className="bug-help">For offline contract preparation, add original source and expected behavior above, then propose test_regression.py and its named unittest checks. This page never runs or approves tests.</p>
              {([
                ["protectedTestSource", "Proposed test_regression.py source", 9, SOURCE_BYTE_LIMIT, "import unittest\nfrom csv_tools import clean_rows\n", "Preserved exactly. Both source files share the 200,000 UTF-8 byte limit."],
                ["requiredCheckIds", "Required unittest check IDs", 4, CHECK_IDS_CHARACTER_LIMIT, "test_regression.CsvChecks.test_empty_input", "One unique ID per line, up to 64. Names are proposals; test discovery has not run."],
                ["targetCheckId", "Target check ID", 2, 200, "test_regression.CsvChecks.test_empty_input", "Copy one required ID for the behavior the original module should fail."],
              ] as const).map(([field, label, rows, maxLength, placeholder, help]) => <div className="bug-field" key={field}><TextArea id={`bug-${field}`} htmlName={field} label={label} ref={node => { fields.current[field] = node; }} value={draft[field]} onChange={value => change(field, value)} rows={rows} maxLength={maxLength} placeholder={placeholder} hasSpellCheck={false} status={issues[field] ? { type: "error", message: issues[field] } : undefined} description={issues[field] ? undefined : help} /></div>)}
              <p className="bug-byte-count">{(sourceBytes + new TextEncoder().encode(draft.protectedTestSource).byteLength).toLocaleString()} / {SOURCE_BYTE_LIMIT.toLocaleString()} combined UTF-8 bytes</p>
              <Button label="Review protected-test request" variant="secondary" onClick={() => prepare(true)} icon={<ArrowRight size={16} aria-hidden="true" />} />
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
              ] as const).map(([field, value]) => <div key={field}><dt><Text type="label">{LABELS[field]}</Text><Button label="Change" variant="ghost" size="sm" aria-label={`Change ${LABELS[field].toLowerCase()}`} onClick={() => focusField(field)} /></dt><dd><Text type="body">{value ?? "Not supplied"}</Text></dd></div>)}</dl>
              <div className="bug-source-review"><div className="bug-review-label"><h3>Original source</h3><Button label="Change original source" variant="ghost" size="sm" onClick={() => focusField("source")} /></div>{preview ? <details className="bug-disclosure"><summary>Inspect exact source <span>{packet.file_path}</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed original source">{preview.lines.map((line, index) => <span key={index}><span className="bug-line-number" aria-hidden="true">{index + 1}</span><code>{line || " "}{"\n"}</code></span>)}</pre>{preview.truncated ? <p className="bug-help">Preview shortened. The JSON retains the complete original source.</p> : null}</details> : <p className="bug-help">No source supplied. This packet contains only the reported error and context.</p>}</div>
              <details className="bug-disclosure"><summary>Input identities <span>SHA-256 · local</span></summary>{identity && identity !== "unavailable" ? <dl className="bug-identities"><div><dt>Raw source SHA-256</dt><dd><code>{identity.original_source_sha256 ?? "No source supplied"}</code></dd></div><div><dt>Intake JSON SHA-256</dt><dd><code>{identity.intake_json_sha256}</code></dd></div></dl> : <p className="bug-help">{identity === "unavailable" ? "Fingerprints unavailable in this browser. Review again to retry; your packet is intact." : "Computing exact-byte fingerprints in this browser…"}</p>}<p className="bug-help">The JSON fingerprint includes its final newline. Fingerprints identify bytes; they do not prove a fix, signature or backend task identity.</p></details>
              <details className="bug-disclosure"><summary>Inspect intake JSON <span>Schema 1</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed intake JSON">{serializeBugIntake(packet)}</pre></details>
              {reviewRequest ? <div className="bug-protected-review"><h3>Proposed protected checks</h3><p className="bug-help">Unapproved and not executed. A reviewer must verify test source, discovery and behavior. This request contains no contract or backend identity.</p><dl className="bug-review-fields"><div><dt>Required unittest IDs<Button label="Change required checks" variant="ghost" size="sm" onClick={() => focusField("requiredCheckIds")} /></dt><dd>{reviewRequest.required_check_ids.join("\n")}</dd></div><div><dt>Target check<Button label="Change target check" variant="ghost" size="sm" onClick={() => focusField("targetCheckId")} /></dt><dd>{reviewRequest.target_check_id}</dd></div></dl><Button label="Change proposed test source" variant="ghost" size="sm" onClick={() => focusField("protectedTestSource")} /><details className="bug-disclosure"><summary>Inspect protected test source <span>test_regression.py</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed proposed test source">{previewSource(reviewRequest.protected_test_source).lines.join("\n")}</pre>{previewSource(reviewRequest.protected_test_source).truncated ? <p className="bug-help">Preview shortened. The request JSON retains the complete test source.</p> : null}</details><details className="bug-disclosure"><summary>Inspect review request JSON <span>Offline preparation input</span></summary><pre tabIndex={0} role="region" aria-label="Reviewed protected-test request JSON">{serializeBugReviewRequest(reviewRequest)}</pre></details><Button label="Download review request JSON" variant="primary" onClick={() => download(true)} icon={<Download size={16} aria-hidden="true" />} /><p className="bug-help">Save mend-bug-review-request.json for the offline prepare_bug_case CLI --request option. The browser does not contact the backend.</p></div> : null}
              <Button label="Download intake JSON" variant={reviewRequest ? "secondary" : "primary"} onClick={() => download()} icon={<Download size={16} aria-hidden="true" />} />
              <p className="bug-help bug-export-note">The intake JSON includes only the original failure and context. Proposed protected checks are exported separately as a review request.</p>
            </> : <div className="bug-review-empty"><h3>A handoff starts with inputs.</h3><ul><li>The exact error, in your own context.</li><li>The unchanged source, when available.</li><li>The result you expected instead.</li></ul><p>Review catches missing or invalid input. It does not diagnose the cause or establish a passing check.</p></div>}
          </section>
          <section className="bug-gate" aria-labelledby="bug-gate-title"><div className="bug-section-heading"><h2 id="bug-gate-title">Execution is gated</h2><LockKeyhole size={16} aria-hidden="true" /></div><dl><div><dt>Investigation</dt><dd>Not run</dd></div><div><dt>Patch</dt><dd>Not generated</dd></div><div><dt>Checks &amp; regression</dt><dd>Not run</dd></div></dl><p>A backend recipe requires separately reviewed protected test source, named acceptance checks and explicit contract approval. Exporting either JSON does not authorize or start execution.</p></section>
        </div>
      </div>
      <footer className="bug-footer"><p>Small scope. Original evidence. An explicit handoff.</p><MendLink href="/#worked-example" isStandalone>Inspect the captured example <span aria-hidden="true">→</span></MendLink></footer>
    </div>
  </main>;
}
