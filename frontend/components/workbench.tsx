"use client";

import Link from "next/link";
import { ProofHero } from "./proof-hero";
import { ProofFlow } from "./proof-flow";
import { ProofRoadmap } from "./proof-roadmap";
import { RepairCase } from "./repair-case";
import { RuntimeConnection } from "./runtime-connection";
import { AttemptTimeline } from "./attempt-timeline";
import { TrustBadge } from "./trust-badge";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreference } from "@/lib/use-motion-preference";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronRight, FileCode2, Fingerprint, LockKeyhole, LockKeyholeOpen, LogOut, Printer, RefreshCw, Square, Terminal, X } from "lucide-react";
import { entrance, SPRING } from "@/lib/motion";
import { createPointerTilt } from "@/lib/pointer-tilt";
import { useWorkbench } from "@/lib/use-workbench";
import { formatStatus, logText, summarizeReceipt } from "@/lib/evidence";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Badge } from "@astryxdesign/core/Badge";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { MendLink, MendButtonLink } from "./mend-link";

const DRAFT_KEY = "mend:task-draft:v1";
function readDraft(): string {
  try {
    const saved = window.sessionStorage.getItem(DRAFT_KEY);
    return saved && new TextEncoder().encode(saved).byteLength <= 8000 ? saved : "";
  } catch { return ""; }
}
function subscribeDraft(notify: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key === DRAFT_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}
const emptyDraft = () => "";
const ACTIVE = new Set(["writing", "waiting_runner", "running", "fixing", "finalizing", "stopping"]);
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, fallback = "Not recorded"): string { return typeof value === "string" ? value : fallback; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function printable(value: unknown): string { return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "Not recorded"; }
function integer(value: unknown): string { return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "Not recorded"; }

export function Workbench({ initialTaskId, view = "landing" }: { initialTaskId?: string; view?: "landing" | "workspace" }) {
  const run = useWorkbench(initialTaskId);
  const reduced = useMotionPreference();
  const savedDraft = useSyncExternalStore(subscribeDraft, readDraft, emptyDraft);
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const prompt = editedPrompt ?? savedDraft;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const promptForm = useRef<HTMLFormElement>(null);
  const child = entrance(reduced);
  const bytes = new TextEncoder().encode(prompt).byteLength;
  const task = run.task;
  const contract = object(task?.contract);
  const limits = object(contract.limits);
  const commands = Array.isArray(contract.commands) ? contract.commands.map(object) : [];
  const checkIds = strings(contract.required_check_ids);
  const protectedPaths = Object.keys(object(contract.protected_files));
  const recordedReceipt = run.receipt;
  const summary = recordedReceipt ? summarizeReceipt(recordedReceipt) : null;
  const receipt = recordedReceipt && summary?.live && recordedReceipt.status === "passed" &&
    recordedReceipt.task_id === task?.id && task?.status === "passed" && checkIds.length > 0 &&
    summary.checks.length === checkIds.length && new Set(summary.checks.map((check) => check.id)).size === checkIds.length &&
    summary.checks.every((check) => check.status === "passed" && checkIds.includes(check.id)) ? recordedReceipt : null;
  const state = task?.status ?? "draft";
  const active = ACTIVE.has(state);
  const ready = run.runtime?.ready === true;
  const setupOnly = run.runtime?.mode === "setup_only";

  function setPrompt(value: string) {
    setEditedPrompt(value);
    try {
      if (value && new TextEncoder().encode(value).byteLength <= 8000) window.sessionStorage.setItem(DRAFT_KEY, value);
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* A denied storage write must not prevent editing or a task review. */ }
  }
  useEffect(() => {
    const outer = host.current, card = surface.current;
    if (!outer || !card) return;
    const tilt = createPointerTilt(card, () => outer.getBoundingClientRect(), {
      request: callback => window.requestAnimationFrame(callback),
      cancel: frame => window.cancelAnimationFrame(frame),
    });
    const allowed = (event: PointerEvent) => !reduced && event.pointerType === "mouse" && event.buttons === 0 && matchMedia("(hover: hover) and (pointer: fine)").matches && !outer.contains(document.activeElement);
    const enter = (event: PointerEvent) => tilt.enter(allowed(event));
    const move = (event: PointerEvent) => { if (allowed(event)) tilt.move(event.clientX, event.clientY); else tilt.flatten(); };
    const leave = () => tilt.leave();
    const flatten = () => tilt.flatten();
    outer.addEventListener("pointerenter", enter); outer.addEventListener("pointermove", move); outer.addEventListener("pointerleave", leave);
    outer.addEventListener("pointercancel", flatten); outer.addEventListener("pointerdown", flatten); outer.addEventListener("focusin", flatten);
    window.addEventListener("resize", flatten); window.addEventListener("scroll", flatten, true);
    return () => {
      tilt.dispose(); outer.removeEventListener("pointerenter", enter); outer.removeEventListener("pointermove", move); outer.removeEventListener("pointerleave", leave);
      outer.removeEventListener("pointercancel", flatten); outer.removeEventListener("pointerdown", flatten); outer.removeEventListener("focusin", flatten);
      window.removeEventListener("resize", flatten); window.removeEventListener("scroll", flatten, true);
    };
  }, [reduced, run.session]);

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (run.session && !run.busy && !active && prompt.trim() && bytes <= 8000) void run.review(prompt);
  };
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (setupOnly) return;
    try { await run.signIn(email, password); } finally { setPassword(""); }
  };
  const logout = async () => {
    setPrompt(""); setPassword(""); setEmail("");
    await run.logout();
  };
  const downloadReceipt = () => {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `mend-${task?.id ?? "task"}-receipt.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <motion.main initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.05 } } }} className="mend-workbench paper-noise relative min-h-screen px-4 pb-16 pt-6 font-sans sm:px-8">
      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.header variants={child} className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/25 pb-5">
          <Link href="/" aria-label="Mend workbench" className="focus-ring flex min-h-11 items-center gap-3 rounded-lg">
            <span className="proof-wordmark-mark" aria-hidden="true" />
            <span className="proof-wordmark">mend<span className="ml-3 hidden font-mono text-xs font-normal leading-[18px] tracking-normal text-muted sm:inline">Paper &amp; proof.</span></span>
          </Link>
          <nav aria-label="Workbench navigation" className="flex flex-wrap items-center gap-3">
            <MendButtonLink href="/tools" label="Local tools" variant="secondary" /><MendButtonLink href="/help" label="Guides" variant="secondary" />
            {view === "landing" || initialTaskId ? <MendButtonLink href="/sign-in" label={initialTaskId ? "New task" : "Open workspace"} variant="primary" icon={<ArrowRight size={16} aria-hidden="true" />} /> : null}
            <MendLink href="/fix" isStandalone>Bug intake · local draft <FileCode2 size={15} aria-hidden="true" /></MendLink>
            <MendLink href="/sample" isStandalone>Simulated sample <ArrowUpRight size={15} aria-hidden="true" /></MendLink>
            {run.session ? <Button label="Sign out" variant="secondary" isDisabled={run.busy} onClick={() => void logout()} icon={<LogOut size={16} aria-hidden="true" />} /> : <span className="inline-flex items-center gap-2 text-sm text-muted"><LockKeyhole size={15} aria-hidden="true" /> {run.booting ? "Checking session…" : "Sign in to save a task"}</span>}
          </nav>
        </motion.header>

        {view === "landing" ? <><ProofHero task={run.task} receipt={run.receipt} events={run.events} runtime={run.runtime} connection={run.connection} receiptFresh={run.receiptFresh} /><ProofFlow /></> : <div className="py-8"><Text type="label">MEND / PAPER AND PROOF</Text><Heading level={1}>{initialTaskId ? "Your task, with its paper trail." : run.session ? "Your workspace." : "Sign in to your workspace."}</Heading><Text type="body" as="p">{initialTaskId ? "Sign in as the task owner to recover its contract, events and verified receipt." : "Review a CSV-cleaner task, approve its exact checks, then follow the evidence."}</Text></div>}

        {view === "landing" || run.session ? <RuntimeConnection runtime={run.runtime} checking={run.booting || run.busy} onRecheck={() => void run.refresh()} /> : null}

        {run.error ? <motion.div variants={child} role="alert" className="mb-8"><Banner status="error" title={run.error} collapsible={false} endContent={<Button label="Dismiss error" variant="ghost" isIconOnly icon={<X size={18} aria-hidden="true" />} onClick={() => void run.clearError()} />} /></motion.div> : null}

        <div className={view === "workspace" && !run.session ? "mx-auto max-w-xl" : "grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]"}>
          <div className="min-w-0 space-y-8">
            {view === "landing" || (run.session && !initialTaskId) ? <motion.div ref={host} variants={child} style={{ perspective: 1200 }} className="min-w-0">
              <div ref={surface} style={{ transformStyle: "preserve-3d", willChange: "transform" }} className="panel p-5 sm:p-8">
                <div className="mb-6 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-orange"><FileCode2 size={21} aria-hidden="true" /></span><div><Text type="label">01 / THE TASK</Text><Heading level={2}>Start with the outcome.</Heading></div></div><Badge variant="neutral" label="Python" /></div>
                <form ref={promptForm} onSubmit={review} aria-busy={run.busy}>
                  <div onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); promptForm.current?.requestSubmit(); } }}><TextArea id="task-prompt" label="What should the CSV cleaner do?" rows={6} value={prompt} onChange={setPrompt} isDisabled={run.busy || active} isRequired aria-describedby="prompt-hint prompt-bytes" placeholder="Clean duplicate CSV rows, count missing values, keep field order, and handle empty input." /></div>
                  <div className="mt-2 flex justify-between gap-3 text-xs leading-[18px]"><span className="text-muted">Ctrl / ⌘ + Enter to review</span><span id="prompt-bytes" className={`font-mono ${bytes > 8000 ? "text-failure" : "text-muted"}`}>{bytes.toLocaleString()} / 8,000 UTF-8 bytes</span></div>
                  <p id="prompt-hint" className="mt-4 text-[16px] leading-[24px] text-muted">Current scope: the curated <code className="font-mono text-xs">csv-cleaner-v1</code> contract. Freeform prompts do not add arbitrary files or checks. Review the returned contract before Start.</p>
                  <Button type="submit" label={run.busy ? "Working…" : run.session ? "Review task" : "Sign in to review task"} variant="primary" isDisabled={!run.session || run.booting || run.busy || active || !prompt.trim() || bytes > 8000} icon={<ArrowRight size={18} aria-hidden="true" />} width="100%" />
                  {prompt ? <Button label="Discard saved draft" variant="ghost" isDisabled={run.busy || active} onClick={() => setPrompt("")} /> : null}
                  <Text type="supporting" as="p">Review saves a task and proposes its contract. It does not run code.</Text>
                </form>
              </div>
            </motion.div> : null}

            {!run.session ? <motion.section variants={child} aria-labelledby="signin-title" className="panel p-5 sm:p-8"><div className="mb-5 flex items-center gap-3"><LockKeyhole size={20} aria-hidden="true" /><Heading level={2}>A workspace of one.</Heading></div><Text type="body" as="p">Sign in with an existing Mend account to save and recover its tasks. The task draft stays in this browser tab through sign-in.</Text><form onSubmit={(event) => void signIn(event)} className="space-y-4"><TextInput id="signin-email" label="Email" type="email" autoComplete="username" isRequired isDisabled={run.busy || run.booting || setupOnly} value={email} onChange={setEmail} /><TextInput id="signin-password" label="Password" type="password" autoComplete="current-password" isRequired isDisabled={run.busy || run.booting || setupOnly} value={password} onChange={setPassword} /><Button type="submit" label={setupOnly ? "Backend setup pending" : "Sign in"} variant="secondary" isDisabled={run.busy || run.booting || setupOnly || !email.trim() || !password} icon={<ArrowRight size={16} aria-hidden="true" />} width="100%" /></form>{setupOnly ? <p role="status" className="mt-4 text-base leading-6 text-muted">Sign-in is unavailable while backend setup is pending. Prepare a bug or use the local tools above.</p> : null}<Text type="supporting" as="p">Passwords are not saved in browser storage. Server credentials stay outside this page.</Text></motion.section> : null}

            {view === "workspace" && !run.session ? <details className="rounded-xl border border-line bg-paper p-4"><summary>Backend connection details</summary><div className="mt-4"><RuntimeConnection runtime={run.runtime} checking={run.booting || run.busy} onRecheck={() => void run.refresh()} /></div></details> : null}

            {task ? <motion.section variants={child} className="panel overflow-hidden" aria-labelledby="contract-title"><div className="border-b-2 border-ink p-5 sm:p-8"><Text type="label">02 / THE AGREEMENT</Text><Heading level={2}>Know what will be checked.</Heading><Text type="body" as="p">This is the persisted contract returned by the backend. Start freezes this version; protected checks cannot be edited by the agent.</Text><div className="mt-4 flex flex-wrap gap-2"><Badge variant="neutral" label={text(contract.template_id)} /><Badge variant="neutral" label={`Version ${task.contract_version}`} /></div></div><div className="space-y-6 p-5 sm:p-8"><div><Heading level={3}>Requested outcome</Heading><p className="mt-2 whitespace-pre-wrap break-words text-[16px] leading-[24px]">{text(task.prompt)}</p></div><div className="grid gap-4 sm:grid-cols-2" aria-label="File editing permissions"><div className="border border-control bg-white p-4" data-testid="editable-files"><Heading level={3}><LockKeyholeOpen size={18} aria-hidden="true" /> Editable files</Heading><Text type="body" as="p">Unlocked · agent may edit</Text><ul className="mt-3 space-y-2">{strings(contract.editable_paths).map((path) => <li key={path} className="break-all font-mono text-[14px] leading-[22px]">{path}</li>)}</ul></div><div className="border border-line bg-ink/5 p-4" data-testid="protected-files"><Heading level={3}><LockKeyhole size={18} aria-hidden="true" /> Protected files</Heading><Text type="body" as="p">Locked · agent cannot edit</Text><ul className="mt-3 space-y-2">{protectedPaths.map((path) => <li key={path} className="break-all font-mono text-[14px] leading-[22px]">{path}</li>)}</ul></div></div><div><Heading level={3}>Exact required checks</Heading><ol className="mt-3 space-y-2">{checkIds.map((id, index) => <li key={id} className="flex items-start gap-3 text-sm leading-5"><span className="font-mono text-muted">{index + 1}.</span><code className="break-all font-mono">{id}</code></li>)}</ol></div><div><Heading level={3}>Reproduction commands</Heading>{commands.map((command, index) => <CodeBlock key={index} code={strings(command.argv).join(" ")} language="bash" hasCopyButton={false} width="100%" />)}</div><div className="grid grid-cols-3 gap-3 border-y border-line py-4 text-xs leading-[18px]"><div><strong className="block">{integer(limits.job_timeout_seconds)}s</strong>Required job deadline</div><div><strong className="block">{integer(limits.max_repairs)}</strong>Repair limit</div><div><strong className="block">{integer(limits.max_executions)}</strong>Execution limit</div></div><div><Heading level={3}>Outside this agreement</Heading>{strings(contract.omitted_checks).map((item, index) => <Text key={index} type="body" as="p">{item}</Text>)}</div><Button label={ready ? "Approve contract & start" : "Start locked — provider gates pending"} variant="primary" onClick={() => void run.start()} isDisabled={run.busy || !ready || !run.session || task.status !== "ready"} icon={<ArrowRight size={18} aria-hidden="true" />} width="100%" /></div></motion.section> : null}
          </div>

          {view === "landing" || run.session ? <div className="min-w-0 space-y-8">
            <motion.section variants={child} className="panel p-5 sm:p-8" aria-labelledby="evidence-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><Text type="label">03 / THE EVIDENCE</Text><Heading level={2}>Nothing up the sleeve.</Heading></div><Terminal size={23} aria-hidden="true" /></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3"><span aria-live="polite" aria-atomic="true" className="text-sm font-semibold leading-5">{task ? formatStatus(state) : "No persisted task yet"}</span><Text type="supporting">Stream: {run.connection}</Text></div>{task ? <><Text type="code" as="p">TASK {task.id}</Text><div className="mt-4 flex flex-wrap gap-3"><Button label="Refresh" variant="secondary" isDisabled={run.busy} onClick={() => void run.refresh()} icon={<RefreshCw size={15} aria-hidden="true" />} />{active ? <Button label={state === "stopping" ? "Retry cancellation" : "Stop task"} variant="secondary" isDisabled={run.busy} onClick={() => void run.cancel()} icon={<Square size={14} aria-hidden="true" />} /> : null}</div></> : null}<TrustBadge scope="task" /><AttemptTimeline task={task} events={run.events} /><div className="mt-6 border-t border-line pt-5"><Heading level={3}>Persisted event log</Heading><Text type="supporting" as="p">Backend events appear as plain text. A log message is a diagnostic, not a verified check result.</Text>{run.events.length ? <CodeBlock code={run.events.map((event) => `${event.id} / ${event.type}\n${event.type === "log" ? logText(event) : printable(event.data)}`).join("\n\n")} language="plaintext" hasCopyButton width="100%" maxHeight={340} /> : <Text type="body" as="p">{task ? "No persisted events received. Refresh can recover the current task." : "Review a task to begin its paper trail. No execution logs have been recorded here."}</Text>}</div><div className="mt-5 rounded-xl border border-line p-4"><Heading level={3}><FileCode2 size={16} aria-hidden="true" /> Code appears with actual artifacts.</Heading><Text type="body" as="p">No source endpoint is available for this workspace yet. This panel does not substitute sample code or an invented diff for a real execution snapshot.</Text></div></motion.section>

            <motion.section variants={child} className="panel p-5 sm:p-8" aria-labelledby="handoff-title"><div className="mb-5 flex items-center justify-between gap-3"><div><Text type="label">04 / THE HANDOFF</Text><Heading level={2}>Proof, then paper.</Heading></div><Printer size={23} aria-hidden="true" /></div><div className="relative rounded-xl border border-line p-3 pb-0"><div aria-hidden="true" className="absolute left-4 right-4 top-4 z-20 h-3 rounded-full bg-ink" /><div className="relative overflow-hidden px-1 pb-3 pt-3"><AnimatePresence initial={false} mode="wait">{receipt && summary ? <motion.article key={text(receipt.receipt_id, task?.id)} initial={run.receiptFresh ? { y: reduced ? 0 : "-110%", opacity: 1 } : false} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.12 } }} transition={reduced ? { duration: 0 } : SPRING} className="receipt-paper bg-white px-3 pb-9 pt-8 font-mono sm:px-6"><div className="flex items-start justify-between gap-3"><div><Text type="body" as="p">mend / receipt</Text><Text type="supporting">Persisted backend evidence</Text></div><Badge variant="success" label="Passed" /></div><Text type="body" as="p">PASSED THE LISTED CHECKS</Text><ul className="mt-4 space-y-3">{summary.checks.map((check) => <li key={check.id} className="text-sm leading-5"><Text type="code">{check.id}</Text><Badge variant="success" label={check.status} /></li>)}</ul><div className="mt-5 space-y-2 border-y border-dashed border-ink/40 py-4 text-xs"><p className="flex justify-between gap-3"><span>ATTEMPTS</span><strong>{summary.attempts ?? "Not recorded"}</strong></p><p className="flex justify-between gap-3"><span>REPAIRS</span><strong>{summary.repairCount ?? "Not recorded"}</strong></p></div><Text type="code" as="p">JOB {text(receipt.job_id)}<br />MODEL {text(receipt.model_id)}<br />SHA256 {text(receipt.snapshot_sha256)}</Text><Text type="supporting" as="p">Covers only the recorded checks. Review the change before using it. Production readiness is not established by this receipt.</Text><Button label="Receipt JSON" variant="secondary" onClick={downloadReceipt} icon={<ArrowDownToLine size={16} aria-hidden="true" />} width="100%" /></motion.article> : <motion.div key="empty-receipt" variants={child} initial="hidden" animate="visible" className="flex min-h-[208px] flex-col items-center justify-center px-3 pb-6 pt-10 text-center"><Fingerprint size={28} aria-hidden="true" className="mb-4 text-muted" /><Text type="body" as="p">No verified receipt is available.</Text><Text type="body" as="p">It prints after the backend persists passing checks and verified artifacts. A task review is not a successful run.</Text></motion.div>}</AnimatePresence></div></div>{receipt ? <div className="mt-5"><Button label="Get verified code links" variant="primary" onClick={() => void run.download()} isDisabled={run.busy} icon={<ArrowDownToLine size={17} aria-hidden="true" />} width="100%" />{run.downloads?.bundle ? <Button label="Download code bundle" variant="secondary" href={run.downloads.bundle.url} rel="noopener noreferrer" icon={<ArrowDownToLine size={15} aria-hidden="true" />} width="100%" /> : null}{run.downloads?.diff ? <Button label="Download recorded diff" variant="secondary" href={run.downloads.diff.url} rel="noopener noreferrer" icon={<ArrowDownToLine size={15} aria-hidden="true" />} width="100%" /> : null}<Text type="supporting" as="p">Links are owner-authorized and expire. Request fresh links if a download is no longer available.</Text></div> : null}</motion.section>

            {run.session ? <motion.section variants={child} className="rounded-xl border border-ink p-5" aria-labelledby="recover-title"><Heading level={2}>Pick up a saved task.</Heading><Text type="supporting" as="p">Open a task ID belonging to this signed-in account. This is not a workspace history listing.</Text><form onSubmit={(event) => { event.preventDefault(); if (taskId.trim()) void run.load(taskId.trim()); }} className="mt-4 flex flex-wrap gap-3"><TextInput id="recover-task-id" label="Saved task UUID" isLabelHidden value={taskId} onChange={setTaskId} placeholder="Saved task UUID" isDisabled={run.busy} isRequired /><Button type="submit" label="Open" variant="secondary" isDisabled={run.busy || !taskId.trim()} icon={<ChevronRight size={16} aria-hidden="true" />} /></form></motion.section> : null}
          </div> : null}
        </div>
        {view === "landing" ? <><RepairCase /><ProofRoadmap /></> : null}
        <motion.footer variants={child} className="mt-12 flex flex-wrap justify-between gap-3 border-t border-ink/25 pt-5 text-xs leading-[18px] text-muted"><Text type="supporting" as="p">Small scope. Visible limits. Evidence that can be kept.</Text><Text type="supporting" as="p">The simulated sample is separate from this authenticated workspace.</Text></motion.footer>
      </div>
    </motion.main>
  );
}
