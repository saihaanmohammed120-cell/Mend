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
const PRIMARY = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-orange px-5 py-3 text-sm font-semibold leading-5 shadow-button disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink bg-white px-4 py-3 text-sm font-medium leading-5 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD = "focus-ring min-h-11 w-full rounded-xl border-2 border-control bg-white px-4 py-3 text-base leading-6 disabled:opacity-50";
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
            {view === "landing" || initialTaskId ? <Link href="/sign-in" className={PRIMARY}>{initialTaskId ? "New task" : "Open workspace"}<ArrowRight size={16} aria-hidden="true" /></Link> : null}
            <Link href="/fix" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm underline decoration-ink/40 underline-offset-4">Bug intake · local draft <FileCode2 size={15} aria-hidden="true" /></Link>
            <Link href="/sample" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm underline decoration-ink/40 underline-offset-4">Simulated sample <ArrowUpRight size={15} aria-hidden="true" /></Link>
            {run.session ? <button type="button" disabled={run.busy} onClick={() => void logout()} className={SECONDARY}><LogOut size={16} aria-hidden="true" /> Sign out</button> : <span className="inline-flex items-center gap-2 text-sm text-muted"><LockKeyhole size={15} aria-hidden="true" /> {run.booting ? "Checking session…" : "Sign in to save a task"}</span>}
          </nav>
        </motion.header>

        {view === "landing" ? <><ProofHero task={run.task} receipt={run.receipt} events={run.events} runtime={run.runtime} connection={run.connection} receiptFresh={run.receiptFresh} /><ProofFlow /></> : <div className="py-8"><p className="font-mono text-xs text-muted">MEND / PAPER AND PROOF</p><h1 className="mt-3 text-3xl font-semibold leading-tight">{initialTaskId ? "Your task, with its paper trail." : run.session ? "Your workspace." : "Sign in to your workspace."}</h1><p className="mt-3 max-w-2xl text-base leading-6 text-muted">{initialTaskId ? "Sign in as the task owner to recover its contract, events and verified receipt." : "Review a CSV-cleaner task, approve its exact checks, then follow the evidence."}</p></div>}

        {view === "landing" || run.session ? <RuntimeConnection runtime={run.runtime} checking={run.booting || run.busy} onRecheck={() => void run.refresh()} /> : null}

        {run.error ? <motion.div variants={child} role="alert" className="mb-8 flex items-start justify-between gap-4 rounded-xl border-2 border-failure bg-white p-4 text-failure"><p className="break-words text-[16px] leading-[24px]">{run.error}</p><button type="button" aria-label="Dismiss error" onClick={() => void run.clearError()} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"><X size={18} aria-hidden="true" /></button></motion.div> : null}

        <div className={view === "workspace" && !run.session ? "mx-auto max-w-xl" : "grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]"}>
          <div className="min-w-0 space-y-8">
            {view === "landing" || (run.session && !initialTaskId) ? <motion.div ref={host} variants={child} style={{ perspective: 1200 }} className="min-w-0">
              <div ref={surface} style={{ transformStyle: "preserve-3d", willChange: "transform" }} className="panel p-5 sm:p-8">
                <div className="mb-6 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-orange"><FileCode2 size={21} aria-hidden="true" /></span><div><p className="font-mono text-xs leading-[18px] text-muted">01 / THE TASK</p><h2 className="mt-1 text-[28px] font-semibold leading-[34px]">Start with the outcome.</h2></div></div><span className="rounded-full border border-ink px-3 py-2 text-xs">Python</span></div>
                <form onSubmit={review} aria-busy={run.busy}>
                  <label htmlFor="task-prompt" className="mb-3 block text-sm font-medium leading-5">What should the CSV cleaner do?</label>
                  <textarea id="task-prompt" rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={run.busy || active} required aria-describedby="prompt-hint prompt-bytes" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className={`${FIELD} min-h-[176px] resize-y`} placeholder="Clean duplicate CSV rows, count missing values, keep field order, and handle empty input." />
                  <div className="mt-2 flex justify-between gap-3 text-xs leading-[18px]"><span className="text-muted">Ctrl / ⌘ + Enter to review</span><span id="prompt-bytes" className={`font-mono ${bytes > 8000 ? "text-failure" : "text-muted"}`}>{bytes.toLocaleString()} / 8,000 UTF-8 bytes</span></div>
                  <p id="prompt-hint" className="mt-4 text-[16px] leading-[24px] text-muted">Current scope: the curated <code className="font-mono text-xs">csv-cleaner-v1</code> contract. Freeform prompts do not add arbitrary files or checks. Review the returned contract before Start.</p>
                  <motion.button type="submit" disabled={!run.session || run.booting || run.busy || active || !prompt.trim() || bytes > 8000} whileHover={reduced ? undefined : { x: -2, y: -2 }} whileTap={reduced ? undefined : { x: 2, y: 2 }} transition={SPRING} className={`${PRIMARY} mt-6 w-full justify-between`}><span>{run.busy ? "Working…" : run.session ? "Review task" : "Sign in to review task"}</span><ArrowRight size={18} aria-hidden="true" /></motion.button>
                  {prompt ? <button type="button" disabled={run.busy || active} onClick={() => setPrompt("")} className="focus-ring mt-3 min-h-11 rounded-lg px-2 text-sm text-muted underline underline-offset-4">Discard saved draft</button> : null}
                  <p className="mt-3 text-xs leading-[18px] text-muted">Review saves a task and proposes its contract. It does not run code.</p>
                </form>
              </div>
            </motion.div> : null}

            {!run.session ? <motion.section variants={child} aria-labelledby="signin-title" className="panel p-5 sm:p-8"><div className="mb-5 flex items-center gap-3"><LockKeyhole size={20} aria-hidden="true" /><h2 id="signin-title" className="text-[18px] font-semibold leading-[24px]">A workspace of one.</h2></div><p className="mb-5 text-[16px] leading-[24px] text-muted">Sign in with an existing Mend account to save and recover its tasks. The task draft stays in this browser tab through sign-in.</p><form onSubmit={(event) => void signIn(event)} className="space-y-4"><div><label htmlFor="signin-email" className="mb-2 block text-sm font-medium leading-5">Email</label><input id="signin-email" type="email" autoComplete="username" required disabled={run.busy || run.booting} value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD} /></div><div><label htmlFor="signin-password" className="mb-2 block text-sm font-medium leading-5">Password</label><input id="signin-password" type="password" autoComplete="current-password" required disabled={run.busy || run.booting} value={password} onChange={(event) => setPassword(event.target.value)} className={FIELD} /></div><button type="submit" disabled={run.busy || run.booting || !email.trim() || !password} className={`${SECONDARY} w-full`}>Sign in <ArrowRight size={16} aria-hidden="true" /></button></form><p className="mt-4 text-xs leading-[18px] text-muted">Passwords are not saved in browser storage. Server credentials stay outside this page.</p></motion.section> : null}

            {task ? <motion.section variants={child} className="panel overflow-hidden" aria-labelledby="contract-title"><div className="border-b-2 border-ink p-5 sm:p-8"><p className="font-mono text-xs leading-[18px] text-muted">02 / THE AGREEMENT</p><h2 id="contract-title" className="mt-2 text-[18px] font-semibold leading-[24px]">Know what will be checked.</h2><p className="mt-3 text-[16px] leading-[24px] text-muted">This is the persisted contract returned by the backend. Start freezes this version; protected checks cannot be edited by the agent.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-ink px-3 py-2 font-mono text-xs">{text(contract.template_id)}</span><span className="rounded-full border border-ink px-3 py-2 font-mono text-xs">Version {task.contract_version}</span></div></div><div className="space-y-6 p-5 sm:p-8"><div><h3 className="text-sm font-semibold leading-5">Requested outcome</h3><p className="mt-2 whitespace-pre-wrap break-words text-[16px] leading-[24px]">{text(task.prompt)}</p></div><div className="grid gap-4 sm:grid-cols-2" aria-label="File editing permissions"><div className="border border-control bg-white p-4" data-testid="editable-files"><h3 className="flex items-center gap-2 text-base font-semibold"><LockKeyholeOpen size={18} aria-hidden="true" /> Editable files</h3><p className="mt-2 text-sm leading-6 text-muted">Unlocked · agent may edit</p><ul className="mt-3 space-y-2">{strings(contract.editable_paths).map((path) => <li key={path} className="break-all font-mono text-[14px] leading-[22px]">{path}</li>)}</ul></div><div className="border border-line bg-ink/5 p-4" data-testid="protected-files"><h3 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole size={18} aria-hidden="true" /> Protected files</h3><p className="mt-2 text-sm leading-6 text-muted">Locked · agent cannot edit</p><ul className="mt-3 space-y-2">{protectedPaths.map((path) => <li key={path} className="break-all font-mono text-[14px] leading-[22px]">{path}</li>)}</ul></div></div><div><h3 className="text-sm font-semibold leading-5">Exact required checks</h3><ol className="mt-3 space-y-2">{checkIds.map((id, index) => <li key={id} className="flex items-start gap-3 text-sm leading-5"><span className="font-mono text-muted">{index + 1}.</span><code className="break-all font-mono">{id}</code></li>)}</ol></div><div><h3 className="text-sm font-semibold leading-5">Reproduction commands</h3>{commands.map((command, index) => <pre key={index} className="mt-3 overflow-x-auto rounded-xl border border-line bg-white p-4 font-mono text-[14px] leading-[22px]"><code>{strings(command.argv).join(" ")}</code></pre>)}</div><div className="grid grid-cols-3 gap-3 border-y border-line py-4 text-xs leading-[18px]"><div><strong className="block">{integer(limits.job_timeout_seconds)}s</strong>Required job deadline</div><div><strong className="block">{integer(limits.max_repairs)}</strong>Repair limit</div><div><strong className="block">{integer(limits.max_executions)}</strong>Execution limit</div></div><div><h3 className="text-sm font-semibold leading-5">Outside this agreement</h3>{strings(contract.omitted_checks).map((item, index) => <p key={index} className="mt-2 text-[16px] leading-[24px] text-muted">{item}</p>)}</div><button type="button" onClick={() => void run.start()} disabled={run.busy || !ready || !run.session || task.status !== "ready"} className={`${PRIMARY} w-full`}>{ready ? "Approve contract & start" : "Start locked — provider gates pending"}<ArrowRight size={18} aria-hidden="true" /></button></div></motion.section> : null}
          </div>

          {view === "landing" || run.session ? <div className="min-w-0 space-y-8">
            <motion.section variants={child} className="panel p-5 sm:p-8" aria-labelledby="evidence-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs leading-[18px] text-muted">03 / THE EVIDENCE</p><h2 id="evidence-title" className="mt-2 text-[18px] font-semibold leading-[24px]">Nothing up the sleeve.</h2></div><Terminal size={23} aria-hidden="true" /></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3"><span aria-live="polite" aria-atomic="true" className="text-sm font-semibold leading-5">{task ? formatStatus(state) : "No persisted task yet"}</span><span className="font-mono text-xs leading-[18px] text-muted">Stream: {run.connection}</span></div>{task ? <><p className="mt-4 break-all font-mono text-[14px] leading-[22px] text-muted">TASK {task.id}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={run.busy} onClick={() => void run.refresh()} className={SECONDARY}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>{active ? <button type="button" disabled={run.busy} onClick={() => void run.cancel()} className={SECONDARY}><Square size={14} aria-hidden="true" /> {state === "stopping" ? "Retry cancellation" : "Stop task"}</button> : null}</div></> : null}<TrustBadge scope="task" /><AttemptTimeline task={task} events={run.events} /><div className="mt-6 border-t border-line pt-5"><h3 className="text-sm font-semibold leading-5">Persisted event log</h3><p className="mt-2 text-xs leading-[18px] text-muted">Backend events appear as plain text. A log message is a diagnostic, not a verified check result.</p><div tabIndex={0} aria-label="Persisted backend events" className="focus-ring mt-4 max-h-[340px] min-h-[180px] overflow-auto rounded-xl border-2 border-ink bg-white p-4 font-mono text-[14px] leading-[22px]">{run.events.length ? run.events.map((event) => <div key={event.id} className="border-b border-line py-2 last:border-b-0"><p className="text-muted">{event.id} / {event.type}</p><pre className="whitespace-pre-wrap break-words font-mono">{event.type === "log" ? logText(event) : printable(event.data)}</pre></div>) : <p className="text-muted">{task ? "No persisted events received. Refresh can recover the current task." : "Review a task to begin its paper trail. No execution logs have been recorded here."}</p>}</div></div><div className="mt-5 rounded-xl border border-line p-4"><h3 className="inline-flex items-center gap-2 text-sm font-semibold leading-5"><FileCode2 size={16} aria-hidden="true" /> Code appears with actual artifacts.</h3><p className="mt-2 text-[16px] leading-[24px] text-muted">No source endpoint is available for this workspace yet. This panel does not substitute sample code or an invented diff for a real execution snapshot.</p></div></motion.section>

            <motion.section variants={child} className="panel p-5 sm:p-8" aria-labelledby="handoff-title"><div className="mb-5 flex items-center justify-between gap-3"><div><p className="font-mono text-xs leading-[18px] text-muted">04 / THE HANDOFF</p><h2 id="handoff-title" className="mt-2 text-[18px] font-semibold leading-[24px]">Proof, then paper.</h2></div><Printer size={23} aria-hidden="true" /></div><div className="relative rounded-xl border border-line p-3 pb-0"><div aria-hidden="true" className="absolute left-4 right-4 top-4 z-20 h-3 rounded-full bg-ink" /><div className="relative overflow-hidden px-1 pb-3 pt-3"><AnimatePresence initial={false} mode="wait">{receipt && summary ? <motion.article key={text(receipt.receipt_id, task?.id)} initial={run.receiptFresh ? { y: reduced ? 0 : "-110%", opacity: 1 } : false} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.12 } }} transition={reduced ? { duration: 0 } : SPRING} className="receipt-paper bg-white px-3 pb-9 pt-8 font-mono sm:px-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[18px] font-semibold leading-[24px]">mend / receipt</p><p className="mt-1 text-xs text-muted">Persisted backend evidence</p></div><span className="rounded-full border-2 border-forest p-1.5 text-forest"><Check size={17} aria-hidden="true" /></span></div><p className="mt-5 border-y border-dashed border-ink/40 py-4 text-sm font-semibold leading-5">PASSED THE LISTED CHECKS</p><ul className="mt-4 space-y-3">{summary.checks.map((check) => <li key={check.id} className="text-sm leading-5"><code className="break-all">{check.id}</code><span className="mt-1 block font-semibold text-forest">{check.status}</span></li>)}</ul><div className="mt-5 space-y-2 border-y border-dashed border-ink/40 py-4 text-xs"><p className="flex justify-between gap-3"><span>ATTEMPTS</span><strong>{summary.attempts ?? "Not recorded"}</strong></p><p className="flex justify-between gap-3"><span>REPAIRS</span><strong>{summary.repairCount ?? "Not recorded"}</strong></p></div><p className="mt-4 break-all text-xs leading-[18px]">JOB {text(receipt.job_id)}<br />MODEL {text(receipt.model_id)}<br />SHA256 {text(receipt.snapshot_sha256)}</p><p className="mt-4 text-xs leading-[18px]">Covers only the recorded checks. Review the change before using it. Production readiness is not established by this receipt.</p><button type="button" onClick={downloadReceipt} className={`${SECONDARY} mt-5 w-full bg-paper`}><ArrowDownToLine size={16} aria-hidden="true" /> Receipt JSON</button></motion.article> : <motion.div key="empty-receipt" variants={child} initial="hidden" animate="visible" className="flex min-h-[208px] flex-col items-center justify-center px-3 pb-6 pt-10 text-center"><Fingerprint size={28} aria-hidden="true" className="mb-4 text-muted" /><p className="text-sm font-semibold leading-5">No verified receipt is available.</p><p className="mt-2 max-w-xs text-[16px] leading-[24px] text-muted">It prints after the backend persists passing checks and verified artifacts. A task review is not a successful run.</p></motion.div>}</AnimatePresence></div></div>{receipt ? <div className="mt-5"><button type="button" onClick={() => void run.download()} disabled={run.busy} className={`${PRIMARY} w-full`}><ArrowDownToLine size={17} aria-hidden="true" /> Get verified code links</button>{run.downloads?.bundle ? <a href={run.downloads.bundle.url} rel="noopener noreferrer" referrerPolicy="no-referrer" className={`${SECONDARY} mt-4 w-full`}>Download code bundle <ArrowDownToLine size={15} aria-hidden="true" /></a> : null}{run.downloads?.diff ? <a href={run.downloads.diff.url} rel="noopener noreferrer" referrerPolicy="no-referrer" className={`${SECONDARY} mt-3 w-full`}>Download recorded diff <ArrowDownToLine size={15} aria-hidden="true" /></a> : null}<p className="mt-3 text-xs leading-[18px] text-muted">Links are owner-authorized and expire. Request fresh links if a download is no longer available.</p></div> : null}</motion.section>

            {run.session ? <motion.section variants={child} className="rounded-xl border border-ink p-5" aria-labelledby="recover-title"><h2 id="recover-title" className="text-sm font-semibold leading-5">Pick up a saved task.</h2><p className="mt-2 text-xs leading-[18px] text-muted">Open a task ID belonging to this signed-in account. This is not a workspace history listing.</p><form onSubmit={(event) => { event.preventDefault(); if (taskId.trim()) void run.load(taskId.trim()); }} className="mt-4 flex flex-wrap gap-3"><label htmlFor="recover-task-id" className="sr-only">Saved task UUID</label><input id="recover-task-id" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="Saved task UUID" disabled={run.busy} required className={`${FIELD} min-w-0 flex-1 font-mono text-xs`} /><button type="submit" disabled={run.busy || !taskId.trim()} className={SECONDARY}>Open <ChevronRight size={16} aria-hidden="true" /></button></form></motion.section> : null}
          </div> : null}
        </div>
        {view === "landing" ? <><RepairCase /><ProofRoadmap /></> : null}
        <motion.footer variants={child} className="mt-12 flex flex-wrap justify-between gap-3 border-t border-ink/25 pt-5 text-xs leading-[18px] text-muted"><p>Small scope. Visible limits. Evidence that can be kept.</p><p>The simulated sample is separate from this authenticated workspace.</p></motion.footer>
      </div>
    </motion.main>
  );
}
