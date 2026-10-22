"use client";

import React from "react";
import { motion } from "framer-motion";
import { useMotionPreference } from "../lib/use-motion-preference";
import { ArrowDownRight, ArrowUpRight, Check, FileCheck2, LockKeyhole } from "lucide-react";
import { projectHeroEvidence } from "../lib/hero-evidence";
import { CapturedWorkspace } from "./captured-workspace";
import { SPRING } from "../lib/motion";
import type { Workbench } from "../lib/use-workbench";
import "./proof-hero.css";

type ProofHeroProps = Pick<Workbench, "task" | "receipt" | "events" | "runtime" | "connection" | "receiptFresh">;
const SEQUENCE = ["Task", "Write", "Run", "Diagnose", "Repair", "Receipt"];


export function ProofHero({ task, receipt, events, runtime, connection, receiptFresh }: ProofHeroProps) {
  const reduced = useMotionPreference();
  const evidence = projectHeroEvidence({ task, receipt, events });
  const recorded = evidence.kind === "verified";
  const unavailable = runtime !== null && !runtime.ready;
  const status = recorded ? "Checks recorded" : unavailable ? "Live execution unavailable" : task ? "Task connected" : runtime?.ready ? "Runner ready · no task running" : "Live connection not established";
  const state = task?.status;
  const activeStage = state === "writing" ? "Write" : state === "running" || state === "waiting_runner" ? "Run" : state === "fixing" ? "Repair" : state === "finalizing" || recorded ? "Receipt" : task ? "Task" : null;

  return (
    <><section className="mend-proof-hero" aria-labelledby="workbench-title" data-testid="proof-hero">
      <div className="proof-copy">
        <p className="proof-kicker"><span aria-hidden="true" />MEND / PAPER AND PROOF</p>
        <h1 id="workbench-title">Code that runs.<br /><em>Proof to keep.</em></h1>
        <p className="proof-intro">A patch can look right and still fail. Follow the actual run, then keep its verification receipt. Ship with evidence instead of taking a diff on faith.</p>
        <a className="proof-primary" href="#worked-example" data-primary-cta="true">See a real repair, start to finish <ArrowDownRight size={20} aria-hidden="true" /></a>
        <p className="proof-availability">Captured CSV-cleaner example</p>
        <p className="proof-authorship">This is a curated patch, not a model-generated repair.</p>

        <dl className="proof-limits">
          <div><dt>60s / job required</dt><dd>Stop latency unverified</dd></div>
          <div><dt>Up to 3 repairs</dt><dd>Bounded repair loop</dd></div>
          <div><dt>Named checks</dt><dd>Specific test results</dd></div>
        </dl>
        <div className="proof-event">
          <p>Built for the <strong>Nebius × NVIDIA<br />Global AI Hackathon</strong></p>
          <p>Coding &amp; Agentic Engineering<br /><span>Submission deadline: <time dateTime="2026-10-30T10:00:00-07:00">30 Oct 2026 · 10:00 PDT</time></span></p>
        </div>
      </div>

      <div className="proof-evidence-stack">
      <CapturedWorkspace />
      <details className="proof-live-slot" open={task !== null || recorded} data-testid="live-run-slot"><summary><span>Live execution slot</span><span>{recorded ? "Recorded task evidence" : unavailable ? "Not connected" : task ? "Current task" : "Awaiting a task"}</span><ArrowDownRight size={16} aria-hidden="true" /></summary><p className="proof-slot-note"><a className="proof-evidence-tag" href="#evidence-nebius">Nebius execution · see legend</a></p>
      <section id="live-run" tabIndex={-1} className="proof-live" aria-labelledby="proof-run-title" data-testid="live-run-panel">
        <div className="proof-toolbar"><span><span className="proof-status-dot" aria-hidden="true" />EXECUTION / EVIDENCE</span><span className="proof-status">{recorded ? "Recorded" : "Awaiting evidence"}</span></div>
        <div className="proof-run-heading">
          <div><p className="proof-small-label">THE LIVE REPAIR LOOP</p><h2 id="proof-run-title">{task ? "The current task" : "The run and its record."}</h2></div>
          <FileCheck2 size={30} strokeWidth={1.35} aria-hidden="true" />
        </div>
        <ol className="proof-sequence" aria-label="Intended execution sequence; highlighted stage comes from the task state">
          {SEQUENCE.map((label, i) => <li key={label} aria-current={activeStage === label ? "step" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{label}</li>)}
        </ol>
        <div className="proof-connection" role="status"><span className={recorded ? "proof-verified" : ""}>{recorded ? <Check size={16} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}{status}</span><span className="proof-stream">SSE: {connection}</span></div>
        <div className="proof-console" aria-label="Actual task output">
          <div className="proof-console-heading"><span>STDOUT / STDERR</span><span>{task ? "Current task" : "No job attached"}</span></div>
          <pre tabIndex={0} role="region" aria-label="Current task stdout and stderr">{evidence.logLines.length ? evidence.logLines.join("\n\n") : task ? "No live output received for this task." : "No live output received.\nNo Nebius job has run in this view."}</pre>
        </div>
        <div className="proof-printer" aria-label="Verification receipt">
          <div className="proof-slot" aria-hidden="true" />
          <div className="proof-paper-window">
            <motion.article className="proof-paper" key={evidence.receiptId ?? "no-receipt"} initial={recorded && receiptFresh && reduced === false ? { y: "-105%" } : false} animate={{ y: 0 }} transition={reduced === false ? SPRING : { duration: 0 }}>
              <div className="proof-receipt-title"><span>MEND / SLSA PROVENANCE</span><strong>{evidence.kind === "rejected" ? "Evidence rejected" : "Not issued"}</strong></div>
              <dl className="proof-receipt-grid">
                <div><dt>SOURCE REPOSITORY</dt><dd>Not recorded</dd></div>
                <div><dt>SOURCE COMMIT</dt><dd>Not recorded</dd></div>
                <div><dt>BUILD PLATFORM</dt><dd>Not recorded</dd></div>
                <div><dt>ENTRYPOINT / PARAMETERS / TRIGGER</dt><dd>Not recorded</dd></div>
                <div><dt>SIGSTORE SIGNATURE</dt><dd>Not available</dd></div>
                <div><dt>TRANSPARENCY LOG</dt><dd>No entry issued</dd></div>
              </dl>
              {recorded ? <><p className="proof-snapshot">SOURCE SNAPSHOT SHA-256<br /><code>{evidence.snapshot}</code></p><ul className="proof-checks" aria-label="Exact recorded checks">{evidence.checks.map(check => <li key={check.id}><Check size={14} aria-hidden="true" /><code>{check.id}</code><span>{check.status}</span></li>)}</ul></> : <p className="proof-unissued">Standard provenance stays unissued until the actual run has source identity and a verified Sigstore bundle. No signing identity or transparency-log entry is fabricated.</p>}
            </motion.article>
          </div>
        </div>
      </section>
      </details>
      <details className="proof-boundaries"><summary>What this build can prove <ArrowUpRight size={14} aria-hidden="true" /></summary><div><p>The captured CSV example records actual local Python checks against the included source. It does not establish model-generated repair, Nebius execution, or general coverage. Large files, streaming input, malformed CSV, and production deployment were not checked.</p><p>The 60-second job budget is a required bound, not a measured guarantee. A backend deadline worker must request cancellation; cancel-to-stop latency remains unverified. The repair loop is capped at three repair attempts. Token Factory is the intended inference layer; Serverless Jobs execute the code. Live execution requires that path and its safety evidence.</p><p>The captured example includes an unsigned in-toto/SLSA document. Keyless signing tooling is included, but signing is blocked until an OIDC identity is available. Signed provenance for live backend tasks, hallucination-checked diagnoses and tiered merge approval are not implemented in the inspected path. No automatic merge is available here. A source snapshot hash is not a Git commit or a receipt signature.</p></div></details>
      </div>
    </section>
    <aside className="proof-evidence-legend" id="proof-reading" aria-labelledby="proof-reading-title">
      <div className="proof-evidence-key-heading"><h2 id="proof-reading-title">What’s real on this page</h2><p>Three kinds of evidence.<br />Each with its own limits.</p></div>
      <dl>
        <div id="evidence-local"><dt>Captured local example</dt><dd><strong>Real local checks.</strong><p>A curated CSV patch, checked against the same tests before and after.</p><a href="#worked-example">Inspect the example <span aria-hidden="true">↗</span></a></dd></div>
        <div id="evidence-provenance"><dt>SLSA provenance</dt><dd><strong>Real document. Unsigned.</strong><p>The source identity is recorded. No signing identity or public log entry is claimed.</p><a href="/example/provenance.json" download>Download the record <span aria-hidden="true">↓</span></a></dd></div>
        <div id="evidence-nebius"><dt>Nebius execution</dt><dd><strong>{task || recorded ? "See the live execution slot." : "Not yet connected."}</strong><p>Local checks do not establish a live provider run or measured stop timing.</p><a href="#live-run">Inspect the live slot <span aria-hidden="true">↗</span></a></dd></div>
      </dl>
    </aside></>
  );
}
