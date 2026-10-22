"use client";

import React, { useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, FileCheck2 } from "lucide-react";
import capture from "../lib/captured-example.json";
import { compareCapturedSource, inspectionTabDestination, type SourceLine } from "../lib/captured-inspector";
import { ProvenanceReceipt } from "./provenance-receipt";
import { CommandCopy } from "./command-copy";

const TABS = [
  { id: "before", label: "Before" },
  { id: "patch", label: "Patch" },
  { id: "checks", label: "Checks" },
  { id: "provenance", label: "Provenance" },
] as const;
type InspectionTab = typeof TABS[number]["id"];
const source = compareCapturedSource(capture.before_source, capture.after_source);

function SourceListing({ lines, version, context = false }: { lines: SourceLine[]; version: "before" | "after"; context?: boolean }) {
  return <div className={`proof-source-file${context ? " proof-source-context" : ""}`}>
    <div className="proof-source-caption"><span>csv_tools.py</span><span>{context ? "Opening lines / exact source" : version === "before" ? "Complete original source" : "Complete checked source"}</span></div>
    <pre className="proof-source-code" tabIndex={context ? undefined : 0} role={context ? undefined : "region"} aria-label={`${version === "before" ? "Original" : "Patched"} Python ${context ? "context" : "source"}`}><code>{lines.map(line => <span key={line.number} className={`proof-source-line${line.changed ? " proof-source-changed" : ""}`} data-line={context ? undefined : line.number} data-context-line={context ? line.number : undefined} data-change={!context && line.changed ? version === "after" ? "added" : "removed" : undefined} data-context-change={context && line.changed ? version === "after" ? "added" : "removed" : undefined}><span className="proof-source-number" aria-hidden="true">{line.number}</span><span className="proof-source-content">{line.text || "\u00a0"}{"\n"}</span></span>)}</code></pre>
  </div>;
}

/** Read-only inspection of a captured local run. Switching views never initiates execution. */
export function CapturedWorkspace() {
  const [active, setActive] = useState<InspectionTab>("patch");
  const identity = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const prefix = `capture-${identity}`;
  const added = source.after.filter(line => line.changed).length;
  const removed = source.before.filter(line => line.changed).length;

  function onTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const destination = inspectionTabDestination(event.key, index, TABS.length);
    if (destination === null) return;
    event.preventDefault();
    setActive(TABS[destination].id);
    buttons.current[destination]?.focus();
  }

  return <section id="worked-example" tabIndex={-1} className="proof-capture" aria-labelledby="capture-title" data-evidence-source="captured_local">
    <div className="proof-toolbar"><span><span className="proof-status-dot" aria-hidden="true" />CAPTURED EXAMPLE / PYTHON</span><span className="proof-status">Actual local output</span></div>
    <div className="proof-run-heading"><div><p className="proof-small-label">CSV CLEANER / EMPTY INPUT</p><h2 id="capture-title">One failure. A checked fix.</h2></div><FileCheck2 size={30} strokeWidth={1.35} aria-hidden="true" /></div>
    <p className="proof-capture-note"><a className="proof-evidence-tag" href="#evidence-local">Captured local</a><span>Same checks, before and after the guard.</span></p>
    <dl className="proof-case-summary" aria-label="Captured result summary">
      <div><dt>BEFORE / EXIT {capture.before.returncode}</dt><dd>{capture.before.checks.passed} / {capture.before.checks.total} passed</dd></div>
      <div className="proof-case-passed"><dt>AFTER / EXIT {capture.after.returncode}</dt><dd><Check size={14} aria-hidden="true" />{capture.after.checks.passed} of {capture.after.checks.total} checks passed</dd></div>
      <div><dt>PROVENANCE</dt><dd>Unsigned</dd></div>
    </dl>
    <div className="proof-inspection-tabs" role="tablist" aria-label="Inspect captured repair evidence" aria-orientation="horizontal">
      {TABS.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} ref={node => { buttons.current[index] = node; }} onClick={() => setActive(tab.id)} onKeyDown={event => onTabKey(event, index)}>{tab.label}</button>)}
    </div>
    <noscript><style>{'#worked-example [role="tablist"]{display:none!important}#worked-example [role="tabpanel"][hidden]{display:block!important}'}</style><p className="proof-no-script">All evidence views are expanded because JavaScript is disabled.</p></noscript>

    <div className="proof-workspace-panel" role="tabpanel" id={`${prefix}-panel-before`} aria-labelledby={`${prefix}-tab-before`} hidden={active !== "before"} tabIndex={0} data-inspection="before">
      <div className="proof-inspection-heading"><h3>Empty-input check failed</h3><span className="proof-small-label">ORIGINAL SOURCE</span></div>
      <p className="proof-recorded-error"><code>IndexError: list index out of range</code></p>
      <p className="proof-inspection-note">Source observation: <code>rows[0]</code> is read before an empty list is handled. The recorded <code>test_empty_input</code> failure points to that access.</p>
      <SourceListing lines={source.before.slice(0, 5)} version="before" context />
      <details className="proof-complete-source" data-source-disclosure="before"><summary>Read complete original source <ArrowDownRight size={14} aria-hidden="true" /></summary><SourceListing lines={source.before} version="before" /></details>
      <details className="proof-output-disclosure"><summary>Read the original error output <ArrowUpRight size={14} aria-hidden="true" /></summary><pre tabIndex={0} role="region" aria-label="Recorded before stderr">{capture.before.stderr}</pre>{capture.before.stdout ? <pre tabIndex={0} role="region" aria-label="Before stdout">{capture.before.stdout}</pre> : <p>Before stdout: empty.</p>}</details>
    </div>

    <div className="proof-workspace-panel" role="tabpanel" id={`${prefix}-panel-patch`} aria-labelledby={`${prefix}-tab-patch`} hidden={active !== "patch"} tabIndex={0} data-inspection="patch">
      <div className="proof-inspection-heading"><h3>Handle the empty case first.</h3><span className="proof-change-count">+{added} / −{removed} lines</span></div>
      <p className="proof-inspection-note">The guard returns before <code>rows[0]</code>.</p>
      <SourceListing lines={source.after.slice(0, 5)} version="after" context />
      <details className="proof-complete-source" data-source-disclosure="after"><summary>Read complete checked source <ArrowDownRight size={14} aria-hidden="true" /></summary><SourceListing lines={source.after} version="after" /></details>
      <a className="proof-artifact-link" href="/example/repair.diff" download>Download the patch <ArrowDownRight size={14} aria-hidden="true" /></a>
    </div>

    <div className="proof-workspace-panel" role="tabpanel" id={`${prefix}-panel-checks`} aria-labelledby={`${prefix}-tab-checks`} hidden={active !== "checks"} tabIndex={0} data-inspection="checks">
      <div className="proof-inspection-heading"><h3>Exact checks that ran</h3><span className="proof-small-label">SAME CHECKS / BOTH RUNS</span></div>
      <div className="proof-check-comparison"><table><caption className="proof-visually-hidden">Captured local checks before and after the patch</caption><thead><tr><th scope="col">Check</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{capture.after.checks.results.map(check => {
        const before = capture.before.checks.results.find(result => result.check_id === check.check_id);
        return <tr key={check.check_id}><th scope="row"><code>{check.check_id}</code></th><td data-outcome={before?.status}>{before?.status ?? "Not recorded"}</td><td data-outcome={check.status}>{check.status}</td></tr>;
      })}</tbody></table></div>
      <p className="proof-inspection-note"><a className="proof-evidence-tag" href="#evidence-local">Captured local</a> · CSV-cleaner scope</p>
      <div className="proof-reproduce"><span className="proof-small-label">REPRODUCE FROM THE DOWNLOADED BUNDLE</span><CommandCopy /></div>
      <a className="proof-artifact-link" href="/example/test_csv_tools.py" download>Read the test file <ArrowDownRight size={14} aria-hidden="true" /></a>
      <details className="proof-output-disclosure"><summary>Inspect the before / after output <ArrowUpRight size={14} aria-hidden="true" /></summary><p>Literal unittest stderr from the captured local run.</p><h4>Before / exit {capture.before.returncode}</h4><pre tabIndex={0} role="region" aria-label="Recorded before stderr">{capture.before.stderr}</pre>{capture.before.stdout ? <pre tabIndex={0} role="region" aria-label="Before stdout">{capture.before.stdout}</pre> : <p>Before stdout: empty.</p>}<h4>After / exit {capture.after.returncode}</h4><pre tabIndex={0} role="region" aria-label="Recorded after stderr">{capture.after.stderr}</pre>{capture.after.stdout ? <pre tabIndex={0} role="region" aria-label="After stdout">{capture.after.stdout}</pre> : <p>After stdout: empty.</p>}</details>
    </div>

    <div className="proof-workspace-panel proof-provenance-panel" role="tabpanel" id={`${prefix}-panel-provenance`} aria-labelledby={`${prefix}-tab-provenance`} hidden={active !== "provenance"} tabIndex={0} data-inspection="provenance"><ProvenanceReceipt /></div>

    <div className="proof-capture-footer">
      <p className="proof-snapshot">CHECKED SOURCE / SHA-256<br /><code>{capture.source_sha256}</code></p>
      <p className="proof-capture-time">Captured <time dateTime={capture.captured_at}>{capture.captured_at}</time></p>
      <div className="proof-capture-downloads"><a href="/example/mend-example.zip" download>Download checked code <ArrowDownRight size={14} aria-hidden="true" /></a><a href="/example/captured-run.json" download>Raw capture <ArrowDownRight size={14} aria-hidden="true" /></a></div>
      <p className="proof-inspection-note"><a className="proof-evidence-tag" href="#evidence-provenance">Unsigned provenance</a></p>
    </div>
  </section>;
}
