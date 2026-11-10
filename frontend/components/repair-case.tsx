"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, FileJson2, LockKeyhole, RotateCcw } from "lucide-react";
import capture from "../lib/captured-example.json";
import { beginBugIntakeDownload, prepareBugIntake, previewSource, serializeBugIntake, type BugDraft, type BugIntake, type IntakeIssues } from "../lib/bug-intake";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import "./repair-case.css";

const EMPTY: BugDraft = { filePath: "", errorMessage: "", source: "", expectedBehavior: "" };
const FIELDS = ["errorMessage", "filePath", "source", "expectedBehavior"] as const;

/** A browser-local intake and export. It cannot initiate a task or issue a receipt. */
export function RepairCase() {
  const [draft, setDraft] = useState<BugDraft>(EMPTY);
  const [clearedDraft, setClearedDraft] = useState<BugDraft | null>(null);
  const [packet, setPacket] = useState<BugIntake | null>(null);
  const [issues, setIssues] = useState<IntakeIssues>({});
  const [downloadState, setDownloadState] = useState<"idle" | "requested" | "failed">("idle");
  const identity = `case-${useId()}`;
  const fields = useRef<Partial<Record<keyof BugDraft, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const errors = useRef<HTMLDivElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (Object.keys(issues).length) errors.current?.focus();
    else if (packet) review.current?.focus();
  }, [issues, packet]);
  useEffect(() => {
    const pending = downloads.current;
    return () => { for (const [url, timer] of pending) { clearTimeout(timer); URL.revokeObjectURL(url); } pending.clear(); };
  }, []);

  function change(field: keyof BugDraft, value: string) {
    // Limits are enforced by prepareBugIntake, not by truncating input here:
    // the field must be able to hold an over-limit value so validation can
    // report it, and Astryx TextArea maxLength is display-only.
    setDraft(previous => ({ ...previous, [field]: value }));
    setClearedDraft(null);
    setPacket(null); setIssues({}); setDownloadState("idle");
  }
  function focusField(field: keyof BugDraft) {
    const node = fields.current[field];
    const disclosure = node?.closest("details");
    if (disclosure) disclosure.open = true;
    node?.focus();
  }
  function prepare() {
    const result = prepareBugIntake(draft);
    setDownloadState("idle");
    if (!result.ok) { setPacket(null); setIssues(result.issues); return; }
    setIssues({}); setPacket(result.packet);
  }
  function useExample() {
    setClearedDraft(null);
    setDraft({ filePath: "csv_tools.py", errorMessage: "IndexError: list index out of range", source: capture.before_source, expectedBehavior: "Return an empty result and zero missing values when no rows are supplied." });
    setPacket(null); setIssues({}); setDownloadState("idle");
    fields.current.errorMessage?.focus();
  }
  function clear() {
    if (!FIELDS.some(field => draft[field].length)) return;
    setClearedDraft({ ...draft });
    setDraft(EMPTY); setPacket(null); setIssues({}); setDownloadState("idle");
    fields.current.errorMessage?.focus();
  }
  function undoClear() {
    if (!clearedDraft) return;
    setDraft(clearedDraft); setClearedDraft(null);
    setPacket(null); setIssues({}); setDownloadState("idle");
    fields.current.errorMessage?.focus();
  }
  function download() {
    if (!packet) return;
    let url: string | null = null;
    try {
      url = beginBugIntakeDownload(packet, {
        createObjectURL: blob => URL.createObjectURL(blob),
        revokeObjectURL: value => URL.revokeObjectURL(value),
        createAnchor: () => document.createElement("a"),
        appendAnchor: anchor => document.body.appendChild(anchor as HTMLAnchorElement),
      });
      const owned = url;
      const timer = setTimeout(() => { URL.revokeObjectURL(owned); downloads.current.delete(owned); }, 1000);
      downloads.current.set(owned, timer);
      setDownloadState("requested");
    } catch {
      if (url !== null) URL.revokeObjectURL(url);
      setDownloadState("failed");
    }
  }

  const preview = packet?.original_source !== null && packet?.original_source !== undefined ? previewSource(packet.original_source) : null;
  const empty = !FIELDS.some(field => draft[field].length);
  const issueEntries = FIELDS.filter(field => issues[field]);
  const currentStep = !packet ? 0 : downloadState === "requested" ? 2 : 1;
  const stepDescriptions = ["Describe", "Review", "Download"].map((_, index) => index < currentStep ? "Complete" : index === currentStep ? index === 2 ? "Requested" : "Current step" : "Next");
  return <section className="mend-repair-case" id="prepare-case" aria-labelledby={`${identity}-title`} data-testid="repair-case">
    <div className="case-overview"><p className="case-eyebrow"><span aria-hidden="true" />A CASE OF ITS OWN / LOCAL WORKFLOW</p><h2 id={`${identity}-title`}>Bring the next bug.</h2><p>Capture the error, keep the original source, and prepare a reviewable case file. The case file is prepared in this browser.</p><p className="case-local-note"><LockKeyhole size={15} aria-hidden="true" />Fields stay in this page’s memory. Clear supports Undo until the next edit or reload. Preparing or downloading a case sends nothing to Mend.</p></div>
    <Stepper activeStep={currentStep} label="Local case preparation" className="case-steps">
      {["Describe", "Review", "Download"].map((label, index) => <Step key={label} step={index} label={label} description={stepDescriptions[index]} status={index < currentStep ? "success" : undefined} aria-current={index === currentStep ? "step" : undefined} data-step-state={index < currentStep ? "complete" : index === currentStep ? "current" : "upcoming"} />)}
    </Stepper>
    <div className="case-grid">
      <div className="case-form" role="form" aria-label="Prepare a local repair case">
        <div className="case-form-heading"><h3>The original problem.</h3>{empty ? <Button label="Use the captured CSV case" variant="ghost" size="sm" onClick={useExample} icon={<ArrowDownRight size={14} aria-hidden="true" />} /> : null}</div>
        <p className="case-help">Add an error or a Python sample. Expected behavior helps make the intended outcome explicit.</p>
        {issueEntries.length ? <div ref={errors} className="case-errors" tabIndex={-1} role="alert"><Banner status="error" title="Check the case details" collapsible={false}><ul>{issueEntries.map(field => <li key={field}><a href={`#${identity}-${field}`} onClick={event => { event.preventDefault(); focusField(field); }}>{issues[field]}</a></li>)}</ul></Banner></div> : null}
        <div className="case-field"><TextArea id={`${identity}-errorMessage`} htmlName="errorMessage" label="Reported error" description="or provide source below" ref={node => { fields.current.errorMessage = node; }} value={draft.errorMessage} onChange={value => change("errorMessage", value)} rows={3} maxLength={8000} placeholder="Paste the exact error or traceback." hasSpellCheck={false} status={issues.errorMessage ? { type: "error", message: issues.errorMessage } : undefined} /></div>
        <div className="case-field"><label htmlFor={`${identity}-filePath`}>Python filename <span>required with source</span></label><input id={`${identity}-filePath`} name="filePath" ref={node => { fields.current.filePath = node; }} value={draft.filePath} onChange={event => change("filePath", event.target.value)} maxLength={68} placeholder="csv_tools.py" autoComplete="off" spellCheck={false} aria-invalid={Boolean(issues.filePath)} aria-describedby={`${identity}-filePath-help`} /><p id={`${identity}-filePath-help`} className={issues.filePath ? "case-field-issue" : "case-help"}>{issues.filePath ?? "One Python module; no folder paths or dependencies."}</p></div>
        <details className="case-source-entry"><summary>Original source <span>optional with an error</span></summary><div className="case-field"><TextArea id={`${identity}-source`} htmlName="source" label="Original Python source" isLabelHidden ref={node => { fields.current.source = node; }} value={draft.source} onChange={value => change("source", value)} rows={7} maxLength={200000} hasSpellCheck={false} placeholder="Paste the original code, including the failing lines." status={issues.source ? { type: "error", message: issues.source } : undefined} description={issues.source ? undefined : "Source is preserved exactly. Remove credentials before sharing any exported file."} /></div></details>
        <div className="case-field"><TextArea id={`${identity}-expectedBehavior`} htmlName="expectedBehavior" label="Expected behavior" isOptional ref={node => { fields.current.expectedBehavior = node; }} value={draft.expectedBehavior} onChange={value => change("expectedBehavior", value)} rows={2} maxLength={8000} placeholder="What should have happened?" status={issues.expectedBehavior ? { type: "error", message: issues.expectedBehavior } : undefined} /></div>
        <div className="case-actions"><Button label="Review the case" variant="primary" onClick={prepare} icon={<ArrowRight size={16} aria-hidden="true" />} /><Button label="Clear fields" variant="ghost" onClick={clear} isDisabled={empty} icon={<RotateCcw size={14} aria-hidden="true" />} /></div>
        {clearedDraft ? <div className="case-recovery" role="status"><p>Fields cleared. Restore is available until the next edit or reload.</p><Button label="Undo clear" variant="ghost" onClick={undoClear} icon={<RotateCcw size={14} aria-hidden="true" />} /></div> : null}
      </div>
      <div className="case-review" ref={review} tabIndex={-1} aria-labelledby={`${identity}-review-title`}>
        <div className="case-review-heading"><FileJson2 size={22} aria-hidden="true" /><span className="case-eyebrow">LOCAL CASE FILE / NOT A RECEIPT</span></div><h3 id={`${identity}-review-title`}>{packet ? "Ready to review." : "First the facts. Then the fix."}</h3>
        <p role="status" aria-live="polite" className="case-review-status">{!packet ? "The validated case will appear here. No investigation or execution has run." : downloadState === "failed" ? "The download could not start. The reviewed case is retained; retry the download." : downloadState === "requested" ? "Download requested. No backend task was created and no checks ran." : "Case prepared locally. Review the contents before exporting."}</p>
        {packet ? <>
          <dl className="case-review-fields">
            {([
              ["errorMessage", "Reported error", packet.reported_error],
              ["filePath", "Python filename", packet.file_path],
              ["expectedBehavior", "Expected behavior", packet.expected_behavior],
              ["source", "Original source", packet.original_source === null ? null : "Included exactly in case JSON"],
            ] as const).map(([field, label, value]) => <div key={field}>
              <dt><Text type="label">{label}</Text><Button label="Change" variant="ghost" size="sm" aria-label={`Change ${label.toLowerCase()}`} onClick={() => focusField(field)} icon={<ArrowRight size={13} aria-hidden="true" />} /></dt>
              <dd><Text type="body">{value ?? "Not supplied"}</Text></dd>
            </div>)}
          </dl>
          {preview ? <details className="case-preview"><summary>Inspect original source <span>{packet.file_path}</span></summary><CodeBlock code={preview.lines.map(line => line || " ").join("\n")} language="python" hasLineNumbers hasCopyButton width="100%" />{preview.truncated ? <p className="case-help">Preview shortened. The JSON export retains the complete original source.</p> : null}</details> : <p className="case-source-gap">No source is included. This case contains only the supplied error and context.</p>}
          <details className="case-json"><summary>Inspect case JSON</summary><CodeBlock code={serializeBugIntake(packet)} language="json" hasCopyButton width="100%" /></details>
          <div className="case-evidence-state"><Text type="supporting">Investigation: not run</Text><Text type="supporting">Execution: not run</Text><Text type="supporting">Regression: not generated</Text></div>
          <Button label="Download case JSON" variant="primary" onClick={download} icon={<ArrowDownRight size={16} aria-hidden="true" />} />
        </> : <div className="case-empty"><span className="case-empty-mark" aria-hidden="true">m.</span><p>A clear error.<br />The unchanged source.<br />An explicit expected result.</p><span>These are inputs, not execution evidence.</span></div>}
        <p className="case-boundary">This local workflow does not diagnose, repair, execute, merge or sign anything. The exported JSON is an intake packet, not verified code or a verification receipt.</p>
      </div>
    </div>
    <noscript><p className="case-help">JavaScript is required to prepare a local case. The captured code and evidence downloads above remain available.</p></noscript>
  </section>;
}
