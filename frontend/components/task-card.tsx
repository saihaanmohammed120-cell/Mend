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
import { entrance } from "@/lib/motion";
import { STATUS_LABELS, type RunMode, type RunStatus } from "@/lib/protocol";
import { createPointerTilt } from "@/lib/pointer-tilt";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Badge } from "@astryxdesign/core/Badge";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Grid } from "@astryxdesign/core/Grid";

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
  const form = useRef<HTMLFormElement>(null);
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
        <form ref={form} onSubmit={submit} aria-busy={busy} className="p-5 sm:p-8">
          <div className="mb-7 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-orange">
                <FileCode2 size={22} aria-hidden="true" />
              </span>
              <div>
                <Text type="label" color="secondary">Your next good idea</Text>
                <Heading level={2}>The task card</Heading>
              </div>
            </div>
            <Badge variant="neutral" label="01" />
          </div>

          <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); form.current?.requestSubmit(); } }}><TextArea ref={field} id="task-prompt" label="What are we making?" value={prompt} onChange={(value) => setPrompt(value.slice(0, 8000))} maxLength={8000} isRequired isDisabled={busy} aria-describedby="task-help prompt-count" rows={6} placeholder="Describe the result, the edge cases, and what should pass." /></div>
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
              <Button
                key={suggestion}
                label={suggestion}
                variant="secondary"
                size="sm"
                isDisabled={busy}
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
              />
            ))}
          </div>

          <div className="my-6 rounded-xl border border-line bg-paper/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wrench size={16} aria-hidden="true" />
              <Text type="label">The working agreement</Text>
            </div>
            <Grid columns={3} gap={2}>
              <div>
                <Text type="body"><strong>Python</strong></Text>
                <Text type="supporting">Sample scenario</Text>
              </div>
              <div>
                <Text type="body"><strong>60 seconds</strong></Text>
                <Text type="supporting">Live job target</Text>
              </div>
              <div>
                <Text type="body"><strong>3 repairs</strong></Text>
                <Text type="supporting">Then hand back</Text>
              </div>
            </Grid>
          </div>

          <Button
            type="submit"
            label={busy
              ? STATUS_LABELS[status]
              : mode === "demo"
                ? "Play sample run"
                : "Start task"}
            variant="primary"
            isDisabled={busy || !prompt.trim()}
            icon={<ArrowUpRight size={22} aria-hidden="true" />}
            width="100%"
          />
          <p id="task-help" className="mt-4 text-sm leading-5 text-muted">
            {mode === "demo"
              ? "Sample mode plays a fixed repair scenario. Your prompt is not executed; no Nebius job or Supabase write occurs."
              : "Mend writes, runs, and repairs within the backend limits. You review the result before using it."}
          </p>
          {busy ? (
            <Button
              label={mode === "demo" ? "Stop sample" : status === "stopping" ? "Retry cancellation" : "Stop task"}
              variant="secondary"
              onClick={() => void onStop()}
              icon={<Square size={13} aria-hidden="true" />}
              width="100%"
            />
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
