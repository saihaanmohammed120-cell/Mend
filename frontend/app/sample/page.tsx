"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMotionPreference } from "@/lib/use-motion-preference";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  GitBranch,
  Radio,
  Terminal,
  Wrench,
} from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { SuccessReceipt } from "@/components/success-receipt";
import { RepairPreview } from "@/components/repair-preview";
import { entrance, SPRING } from "@/lib/motion";
import { STATUS_LABELS } from "@/lib/protocol";
import { useTaskRun } from "@/lib/use-task-run";

const STEPS = [
  { title: "Write", text: "Turn the task into code.", icon: Code2 },
  { title: "Run", text: "Put it through the checks.", icon: Terminal },
  { title: "Mend", text: "Repair what didn't pass.", icon: Wrench },
];

const LIVE_FLOW = [
  "Describe the task",
  "Mend writes and runs it in an isolated job",
  "Up to 3 repairs if a check fails",
  "Review the receipt and download the code",
] as const;

export default function MainWorkbench() {
  const reduced = useMotionPreference();
  const run = useTaskRun();
  const logPane = useRef<HTMLDivElement>(null);
  const followLogs = useRef(true);
  const child = entrance(reduced);
  useEffect(() => {
    const element = logPane.current;
    if (element && followLogs.current) element.scrollTop = element.scrollHeight;
  }, [run.logs]);

  return (
    <motion.main
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: reduced ? 0 : 0.05 } },
      }}
      className="paper-noise relative min-h-screen overflow-x-clip px-5 pb-10 pt-6 font-sans sm:px-9 lg:px-12"
    >
      <div className="relative z-10 mx-auto max-w-[1280px]">
        <motion.header
          variants={child}
          className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink pb-5"
        >
          <Link
            href="/"
            aria-label="Mend home"
            className="focus-ring flex items-center gap-3 rounded-xs"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-orange"
            >
              <GitBranch size={22} strokeWidth={2.7} />
            </span>
            <span className="text-[28px] font-bold leading-[32px] tracking-[-.06em]">
              mend<span className="text-orange">.</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <span className="label hidden text-muted sm:block">
              The repair, in plain sight
            </span>
            <Link href="/" className="focus-ring rounded-xs text-sm font-semibold underline underline-offset-4">
              Open developer workbench
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-ink px-3 py-2 text-xs font-semibold">
              <span
                aria-hidden="true"
              className="h-2 w-2 rounded-full bg-orange"
              />
              Simulated evidence
            </span>
          </div>
        </motion.header>

        <motion.section
          variants={child}
          className="pb-9 pt-10 sm:pb-11 sm:pt-12"
        >
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:gap-10">
          <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="label">A little less debugging</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span className="label text-muted">A little more building</span>
          </div>
          <h1 className="max-w-3xl text-[32px] font-bold leading-[36px] tracking-[-.055em] sm:text-[44px] sm:leading-[48px]">
            A failing check.
            <br />A small patch.{" "}
            <span className="relative inline-block text-ink">
              A paper trail
              <svg
                aria-hidden="true"
                viewBox="0 0 430 16"
                preserveAspectRatio="none"
                className="absolute -bottom-3 left-0 h-3 w-full text-orange"
              >
                <path
                  d="M3 10C120 2 270 2 425 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            .
          </h1>
          <p className="mt-8 max-w-xl text-base leading-6 text-muted">
            Follow a bundled Python example from failure to repair. Inspect the
            change and download the sample code and regression checks. This
            demonstration makes no model, isolated-job or database calls.
          </p>
          <p className="mt-6 max-w-3xl border-l-2 border-ink pl-4 text-sm leading-5 text-muted">
            Intended live limits: 60 seconds per job and at most 3 repair attempts.
            Actual infrastructure stop latency is unmeasured. The sample lists its
            illustrative checks explicitly; it does not establish live verification.
          </p>
          </div>
          <RepairPreview />
          </div>
          <ol aria-label="Intended live repair workflow" className="mt-8 grid gap-5 border-y-2 border-ink py-5 sm:grid-cols-2 lg:grid-cols-4">
            {LIVE_FLOW.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-5">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white font-mono font-semibold">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </motion.section>

        <motion.section variants={child} aria-labelledby="sample-stream-heading" className="pb-6 pt-12">
          <h2 id="sample-stream-heading" className="text-lg font-semibold leading-6">Follow the sample stream</h2>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-muted">The workbench below plays a fixed SSE scenario. Editing the prompt does not change or execute the sample.</p>
        </motion.section>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-12">
          <div className="min-w-0">
            <TaskCard
              mode={run.mode}
              status={run.status}
              busy={run.busy}
              attempt={run.attempt}
              onSubmit={run.start}
              onStop={run.stop}
            />
            <motion.div
              variants={child}
              className="mt-8 grid grid-cols-3 gap-3 sm:gap-5"
            >
              {STEPS.map(({ title, text, icon: Icon }, index) => (
                <motion.div key={title} variants={child} className="min-w-0">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">
                      0{index + 1}
                    </span>
                    <Icon size={17} aria-hidden="true" />
                  </div>
                  <h2 className="text-sm font-medium leading-5">{title}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    {text}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="min-w-0">
            <motion.section
              variants={child}
              className="panel overflow-hidden"
              aria-labelledby="activity-heading"
            >
              <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-5 py-5 sm:px-6">
                <h2
                  id="activity-heading"
                  className="inline-flex items-center gap-2 text-lg font-semibold leading-6"
                >
                  <Radio size={20} aria-hidden="true" /> At the workbench
                </h2>
                <span className="label text-muted">
                  {run.connection === "connected"
                    ? "Streaming"
                    : run.connection === "reconnecting"
                      ? "Reconnecting"
                      : run.busy
                        ? "Working"
                        : "Standing by"}
                </span>
              </div>
              <div className="px-5 pb-5 pt-5 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border border-ink ${run.status === "success" ? "bg-forest text-white" : "bg-paper"}`}
                  >
                    {run.status === "success" ? (
                      <Check size={15} aria-hidden="true" />
                    ) : run.busy ? (
                      <motion.span
                        animate={reduced ? undefined : { rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 2,
                          ease: "linear",
                        }}
                      >
                        <Wrench size={14} aria-hidden="true" />
                      </motion.span>
                    ) : (
                      <Circle size={10} aria-hidden="true" />
                    )}
                  </span>
                  <p
                    className="text-sm font-medium leading-5"
                    role="status"
                    aria-live="polite"
                  >
                    {STATUS_LABELS[run.status]}
                  </p>
                </div>
                <p className="mb-5 mt-3 min-h-10 text-sm leading-5 text-muted">
                  {run.message}
                </p>
                <div
                  ref={logPane}
                  role="log"
                  aria-label="Runner output"
                  aria-live="off"
                  tabIndex={0}
                  onScroll={(event) => {
                    const e = event.currentTarget;
                    followLogs.current =
                      e.scrollHeight - e.scrollTop - e.clientHeight < 40;
                  }}
                  className="focus-ring h-60 overflow-auto rounded-xl border border-ink/60 bg-white p-4 font-mono text-[14px] leading-[22px]"
                >
                  <p className="mb-3 border-b border-line pb-2 text-xs leading-[18px] text-muted">
                    Sample SSE output · illustrative
                  </p>
                  {run.logs.length ? (
                    run.logs.map((line) => (
                      <pre
                        key={line.id}
                        className={`whitespace-pre-wrap break-words font-mono ${line.stream === "stderr" ? "text-failure" : "text-ink"}`}
                      >
                        <span className="select-none text-muted">
                          [{line.attempt}]{" "}
                        </span>
                        {line.text}
                      </pre>
                    ))
                  ) : (
                    <div className="pt-7 text-muted">
                      <Terminal size={23} className="mb-3" aria-hidden="true" />
                      <p>No run yet.</p>
                      <p>Output will arrive here, one step at a time.</p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs leading-[18px] text-muted">
                  Showing the latest 200 output events. Scroll up to pause
                  following.
                </p>
                {run.error ? (
                  <motion.p
                    variants={child}
                    initial="hidden"
                    animate="visible"
                    role="alert"
                    className="mt-3 rounded-lg border border-failure bg-white p-3 text-sm leading-5 text-failure"
                  >
                    {run.error}
                  </motion.p>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-paper px-5 py-3.5 text-xs sm:px-6">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={14} aria-hidden="true" /> 60s target per live job
                </span>
                <span className="font-mono text-muted">
                  Not measured in this sample
                </span>
              </div>
            </motion.section>
            <SuccessReceipt receipt={run.receipt} />
          </div>
        </div>

        <motion.footer
          variants={child}
          className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-ink/30 pt-5 text-xs text-muted"
        >
          <span>Mend · Built for the small things that slow you down.</span>
          <motion.a
            href="/help#execution"
            whileHover={reduced ? undefined : { y: -2 }}
            transition={SPRING}
            className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-xs font-semibold text-ink"
          >
            Evidence and execution limits{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </motion.a>
        </motion.footer>
      </div>
    </motion.main>
  );
}
