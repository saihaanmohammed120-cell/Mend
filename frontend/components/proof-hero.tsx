"use client";

import React from "react";
import NextLink from "next/link";
import { motion } from "framer-motion";
import { useMotionPreference } from "../lib/use-motion-preference";
import { ArrowDownRight, ArrowUpRight, FileCheck2 } from "lucide-react";
import { projectHeroEvidence } from "../lib/hero-evidence";
import { CapturedWorkspace } from "./captured-workspace";
import { SPRING } from "../lib/motion";
import type { Workbench } from "../lib/use-workbench";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Badge } from "@astryxdesign/core/Badge";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Link } from "@astryxdesign/core/Link";
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
  const activeIndex = activeStage === null ? -1 : SEQUENCE.indexOf(activeStage);

  return (
    <><section className="mend-proof-hero" aria-labelledby="workbench-title" data-testid="proof-hero">
      <div className="proof-copy">
        <p className="proof-kicker"><span aria-hidden="true" />MEND / PAPER AND PROOF</p>
        <h1 id="workbench-title">Code that runs.<br /><em>Proof to keep.</em></h1>
        <div className="proof-start-row">
          <Text type="large" as="p">Bring a failing Python case. Review its source and checks, then keep a handoff you can inspect.</Text>
          <div className="proof-start-actions"><a className="proof-primary" href="/fix" data-primary-cta="true">Prepare a bug <ArrowUpRight size={20} aria-hidden="true" /></a><Button label="Explore the checked example" variant="ghost" href="#worked-example" icon={<ArrowDownRight size={20} aria-hidden="true" />} /></div>
        </div>
        <Text type="body" as="p">Local review works without an account. Live repair is not connected.</Text>
      </div>

      <div className="proof-evidence-stack">
      <p className="proof-authorship">This is a curated patch, not a model-generated repair.</p>
      <CapturedWorkspace />
      <details className="proof-live-slot" open={task !== null || recorded} data-testid="live-run-slot"><summary><span>Live execution slot</span><span>{recorded ? "Recorded task evidence" : unavailable ? "Not connected" : task ? "Current task" : "Awaiting a task"}</span><ArrowDownRight size={16} aria-hidden="true" /></summary><p className="proof-slot-note"><Link href="#evidence-nebius">Nebius execution · see legend</Link></p>
      <section id="live-run" tabIndex={-1} className="proof-live" aria-labelledby="proof-run-title" data-testid="live-run-panel">
        <div className="proof-toolbar"><span><span className="proof-status-dot" aria-hidden="true" />EXECUTION / EVIDENCE</span><Badge variant={recorded ? "success" : "neutral"} label={recorded ? "Recorded" : "Awaiting evidence"} /></div>
        <div className="proof-run-heading">
          <div><Text type="label">THE LIVE REPAIR LOOP</Text><Heading level={2}>{task ? "The current task" : "The run and its record."}</Heading></div>
          <FileCheck2 size={30} strokeWidth={1.35} aria-hidden="true" />
        </div>
        <Stepper activeStep={activeIndex >= 0 ? activeIndex : 0} label="Intended execution sequence; highlighted stage comes from the task state">
          {SEQUENCE.map((label, i) => <Step key={label} step={i} label={label} status={activeIndex >= 0 && i < activeIndex ? "success" : undefined} />)}
        </Stepper>
        <div className="proof-connection" role="status"><Badge variant={recorded ? "success" : "neutral"} label={status} /><Text type="supporting">SSE: {connection}</Text></div>
        <div className="proof-console" tabIndex={0} role="region" aria-label="Current task stdout and stderr">
          <div className="proof-console-heading"><span>STDOUT / STDERR</span><span>{task ? "Current task" : "No job attached"}</span></div>
          <CodeBlock code={evidence.logLines.length ? evidence.logLines.join("\n\n") : task ? "No live output received for this task." : "No live output received.\nNo Nebius job has run in this view."} language="plaintext" hasCopyButton width="100%" />
        </div>
        <div className="proof-printer" aria-label="Verification receipt">
          <div className="proof-slot" aria-hidden="true" />
          <div className="proof-paper-window">
            <motion.article className="proof-paper" key={evidence.receiptId ?? "no-receipt"} initial={recorded && receiptFresh && reduced === false ? { y: "-105%" } : false} animate={{ y: 0 }} transition={reduced === false ? SPRING : { duration: 0 }}>
              <div className="proof-receipt-title"><span>MEND / SLSA PROVENANCE</span><strong>{evidence.kind === "rejected" ? "Evidence rejected" : "Not issued"}</strong></div>
              <dl className="proof-receipt-grid">
                <div><dt><Text type="label">SOURCE REPOSITORY</Text></dt><dd><Text type="body">Not recorded</Text></dd></div>
                <div><dt><Text type="label">SOURCE COMMIT</Text></dt><dd><Text type="body">Not recorded</Text></dd></div>
                <div><dt><Text type="label">BUILD PLATFORM</Text></dt><dd><Text type="body">Not recorded</Text></dd></div>
                <div><dt><Text type="label">ENTRYPOINT / PARAMETERS / TRIGGER</Text></dt><dd><Text type="body">Not recorded</Text></dd></div>
                <div><dt><Text type="label">SIGSTORE SIGNATURE</Text></dt><dd><Text type="body">Not available</Text></dd></div>
                <div><dt><Text type="label">TRANSPARENCY LOG</Text></dt><dd><Text type="body">No entry issued</Text></dd></div>
              </dl>
              {recorded ? <><p className="proof-snapshot">SOURCE SNAPSHOT SHA-256<br /><code>{evidence.snapshot}</code></p><ul className="proof-checks" aria-label="Exact recorded checks">{evidence.checks.map(check => <li key={check.id}><Text type="code">{check.id}</Text><Badge variant={check.status === "passed" ? "success" : "error"} label={check.status} /></li>)}</ul></> : <Text type="body" as="p">Standard provenance stays unissued until the actual run has source identity and a verified Sigstore bundle. No signing identity or transparency-log entry is fabricated.</Text>}
            </motion.article>
          </div>
        </div>
      </section>
      </details>
      <details className="proof-boundaries"><summary>What this build can prove <ArrowUpRight size={14} aria-hidden="true" /></summary><div><dl className="proof-limits"><div><dt>60s / job required</dt><dd>Stop latency unverified</dd></div><div><dt>Up to 3 repairs</dt><dd>Bounded repair loop</dd></div><div><dt>Named checks</dt><dd>Specific test results</dd></div></dl><div className="proof-event"><p>Built for the <strong>Nebius × NVIDIA Global AI Hackathon</strong></p><p>Coding &amp; Agentic Engineering · <time dateTime="2026-10-30T10:00:00-07:00">30 Oct 2026 · 10:00 PDT</time></p></div><Text type="body" as="p">The captured CSV example shows real local Python checks. It does not prove model-generated repair or Nebius execution. Large files, streaming input, malformed CSV, and production deployment were not checked.</Text><Text type="body" as="p">The 60-second job budget is a limit, not a measured speed. A backend worker must request cancellation; cancel-to-stop latency remains unverified. The repair loop caps at three attempts. Token Factory is the intended inference layer; Serverless Jobs execute the code. Live execution requires that path and its safety evidence.</Text><Text type="body" as="p">The captured example includes an unsigned in-toto/SLSA document. Signing is blocked until an OIDC identity is available. Signed provenance, hallucination-checked diagnoses, and tiered merge approval are not implemented. No automatic merge is available. A source snapshot hash is not a Git commit or receipt signature.</Text></div></details>
      </div>
    </section>
    <aside className="proof-evidence-legend" id="proof-reading" aria-labelledby="proof-reading-title">
      <div className="proof-evidence-key-heading"><Heading level={2}>What’s real on this page</Heading><Text type="body" as="p">Three kinds of evidence.<br />Each with its own limits.</Text></div>
      <dl>
        <div id="evidence-local"><dt>Captured local example</dt><dd><strong>Real local checks.</strong><p>A curated CSV patch, checked against the same tests before and after.</p><Link href="#worked-example">Inspect the example <span aria-hidden="true">↗</span></Link></dd></div>
        <div id="evidence-provenance"><dt>SLSA provenance</dt><dd><strong>Real document. Unsigned.</strong><p>The source identity is recorded. No signing identity or public log entry is claimed.</p><Link href="/example/provenance.json" download>Download the record <span aria-hidden="true">↓</span></Link></dd></div>
        <div id="evidence-nebius"><dt>Nebius execution</dt><dd><strong>{task || recorded ? "See the live execution slot." : "Not yet connected."}</strong><p>Local checks do not establish a live provider run or measured stop timing.</p><Link href="#live-run" onClick={() => document.querySelector<HTMLDetailsElement>(".proof-live-slot")?.setAttribute("open", "")}>Inspect the live slot <span aria-hidden="true">↗</span></Link></dd></div>
      </dl>
    </aside></>
  );
}
