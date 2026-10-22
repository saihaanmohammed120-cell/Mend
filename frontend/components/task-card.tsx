"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useMotionPreference } from "@/lib/use-motion-preference";
import {
  ArrowUpRight,
  Braces,
  CornerDownLeft,
  FileCode2,
  Square,
  Wrench,
} from "lucide-react";
import { entrance, SPRING } from "@/lib/motion";
import { STATUS_LABELS, type RunMode, type RunStatus } from "@/lib/protocol";
import { createPointerTilt } from "@/lib/pointer-tilt";

export interface TaskCardProps {
  mode: RunMode;
  status: RunStatus;
  busy: boolean;
  attempt: number;
  onSubmit: (prompt: string) => Promise<void> | void;
  onStop: () => Promise<void> | void;
}
const SUGGESTIONS = [
  "Fix an empty input",
  "Write a CSV helper",
  "Check a small function",
];
export const SAMPLE_PROMPT =
  "Write a Python function that calculates average sales from a list of numbers. Return 0 for an empty list, and test both cases.";

export function TaskCard({
  mode,
  status,
  busy,
  attempt,
  onSubmit,
  onStop,
}: TaskCardProps) {
  const reduced = useMotionPreference();
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const field = useRef<HTMLTextAreaElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = host.current;
    const card = surface.current;
    if (!outer || !card) return;
    const tilt = createPointerTilt(card, () => outer.getBoundingClientRect(), {
      request: callback => window.requestAnimationFrame(callback),
      cancel: frame => window.cancelAnimationFrame(frame),
    });
    const allowed = (event: PointerEvent) => !reduced && event.pointerType === "mouse" &&
      matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !outer.contains(document.activeElement) && event.buttons === 0;
    const enter = (event: PointerEvent) => tilt.enter(allowed(event));
    const move = (event: PointerEvent) => {
      if (!allowed(event)) { tilt.flatten(); return; }
      tilt.move(event.clientX, event.clientY);
    };
    const leave = () => tilt.leave();
    const flatten = () => tilt.flatten();
    outer.addEventListener("pointerenter", enter);
    outer.addEventListener("pointermove", move);
    outer.addEventListener("pointerleave", leave);
    outer.addEventListener("pointercancel", flatten);
    outer.addEventListener("pointerdown", flatten);
    outer.addEventListener("focusin", flatten);
    window.addEventListener("resize", flatten);
    window.addEventListener("scroll", flatten, true);
    return () => {
      tilt.dispose();
      outer.removeEventListener("pointerenter", enter);
      outer.removeEventListener("pointermove", move);
      outer.removeEventListener("pointerleave", leave);
      outer.removeEventListener("pointercancel", flatten);
      outer.removeEventListener("pointerdown", flatten);
      outer.removeEventListener("focusin", flatten);
      window.removeEventListener("resize", flatten);
      window.removeEventListener("scroll", flatten, true);
    };
  }, [reduced]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && prompt.trim()) void onSubmit(prompt);
  };

  return (
    <motion.div
      ref={host}
      variants={entrance(reduced)}
      className="min-w-0"
      style={{ perspective: 1200 }}
    >
      <div
        ref={surface}
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        className="panel relative"
      >
        <form onSubmit={submit} aria-busy={busy} className="p-5 sm:p-8">
          <div className="mb-7 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-orange">
                <FileCode2 size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="label text-muted">Your next good idea</p>
                <h2 className="mt-1 text-[18px] font-semibold leading-6 tracking-tight">
                  The task card
                </h2>
              </div>
            </div>
            <span className="label rounded-full border border-ink px-3 py-1.5">
              01
            </span>
          </div>

          <label
            htmlFor="task-prompt"
            className="mb-3 block text-[14px] font-medium leading-5"
          >
            What are we making?
          </label>
          <textarea
            ref={field}
            id="task-prompt"
            name="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={8000}
            required
            disabled={busy}
            aria-describedby="task-help prompt-count"
            rows={6}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="focus-ring min-h-[186px] w-full resize-y rounded-xl border-2 border-control bg-white p-4 text-[16px] leading-6 placeholder:text-muted disabled:opacity-70"
            placeholder="Describe the result, the edge cases, and what should pass."
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-xs leading-[18px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CornerDownLeft size={13} aria-hidden="true" /> Ctrl / ⌘ + Enter
              to start
            </span>
            <span id="prompt-count" className="font-mono">
              {prompt.length.toLocaleString()} / 8,000
            </span>
          </div>

          <div
            className="mt-5 flex flex-wrap gap-2"
            aria-label="Task suggestions"
          >
            {SUGGESTIONS.map((suggestion, i) => (
              <motion.button
                key={suggestion}
                type="button"
                disabled={busy}
                variants={entrance(reduced)}
                onClick={() => {
                  setPrompt(
                    i === 0
                      ? SAMPLE_PROMPT
                      : i === 1
                        ? "Write a Python CSV helper that summarizes numeric sales values and handles empty files. Include tests."
                        : "Write and test a Python function that removes duplicates from a list while preserving order.",
                  );
                  field.current?.focus();
                }}
                whileHover={reduced || busy ? undefined : { y: -2 }}
                whileTap={reduced || busy ? undefined : { y: 1 }}
                transition={SPRING}
                className="focus-ring min-h-11 rounded-full border border-ink/60 bg-white px-3.5 text-sm font-medium leading-5 disabled:opacity-40"
              >
                {suggestion}
              </motion.button>
            ))}
          </div>

          <div className="my-6 rounded-xl border border-line bg-paper/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wrench size={16} aria-hidden="true" />
              <p className="label">The working agreement</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm leading-5">
              <div>
                <p className="font-bold">Python</p>
                <p className="mt-1 text-muted">Sample scenario</p>
              </div>
              <div>
                <p className="font-bold">60 seconds</p>
                <p className="mt-1 text-muted">Live job target</p>
              </div>
              <div>
                <p className="font-bold">3 repairs</p>
                <p className="mt-1 text-muted">Then hand back</p>
              </div>
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={busy || !prompt.trim()}
            whileHover={reduced || busy || !prompt.trim() ? undefined : { x: -2, y: -2 }}
            whileTap={reduced || busy || !prompt.trim() ? undefined : { x: 2, y: 2 }}
            transition={SPRING}
            className="focus-ring flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-ink bg-orange px-5 py-3.5 text-base font-medium leading-6 shadow-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              {busy
                ? STATUS_LABELS[status]
                : mode === "demo"
                  ? "Play sample run"
                  : "Start task"}
            </span>
            <ArrowUpRight size={22} aria-hidden="true" />
          </motion.button>
          <p id="task-help" className="mt-4 text-sm leading-5 text-muted">
            {mode === "demo"
              ? "Sample mode plays a fixed repair scenario. Your prompt is not executed; no Nebius job or Supabase write occurs."
              : "Mend writes, runs, and repairs within the backend limits. You review the result before using it."}
          </p>
          {busy ? (
            <motion.button
              variants={entrance(reduced)}
              type="button"
              onClick={() => void onStop()}
              className="focus-ring mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-ink bg-white px-4 text-sm font-medium leading-5"
            >
              <Square size={13} aria-hidden="true" />{" "}
              {mode === "demo" ? "Stop sample" : status === "stopping" ? "Retry cancellation" : "Stop task"}
            </motion.button>
          ) : null}
        </form>
        <div className="flex items-center justify-between gap-3 rounded-b-workbench border-t-2 border-ink bg-paper px-5 py-3.5 sm:px-8">
          <span className="inline-flex items-center gap-2 text-xs font-medium leading-[18px]">
            <Braces size={15} aria-hidden="true" /> Small tasks. Visible
            progress.
          </span>
          <span className="font-mono text-xs text-muted">
            {attempt ? `${attempt} / 4 runs` : "Ready"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
