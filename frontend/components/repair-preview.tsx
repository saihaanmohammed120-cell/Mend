"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useMotionPreference } from "@/lib/use-motion-preference";
import { Check, Download, FileCode2, Pause, Play, Receipt, SkipForward, Wrench, X } from "lucide-react";
import { entrance, SPRING } from "@/lib/motion";
import { createPointerTilt } from "@/lib/pointer-tilt";
import { createSampleBundle, numberedSource, SAMPLE_CHECKS, SAMPLE_PHASES } from "@/lib/sample-repair";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function RepairPreview() {
  const reduced = useMotionPreference();
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const [playbackOverride, setPlaybackOverride] = useState<boolean | null>(null);
  const playing = playbackOverride ?? (hydrated && reduced === false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);
  const phase = SAMPLE_PHASES[phaseIndex];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setPhaseIndex((current) => (current + 1) % SAMPLE_PHASES.length), phase.duration);
    return () => window.clearTimeout(timer);
  }, [playing, phaseIndex, phase.duration]);

  useEffect(() => {
    const outer = host.current;
    const card = surface.current;
    if (!outer || !card) return;
    const tilt = createPointerTilt(card, () => outer.getBoundingClientRect(), {
      request: callback => window.requestAnimationFrame(callback),
      cancel: frame => window.cancelAnimationFrame(frame),
    });
    const media = matchMedia("(hover: hover) and (pointer: fine)");
    const allowed = (event: PointerEvent) => reduced === false && media.matches &&
      event.pointerType === "mouse" && event.buttons === 0 && !outer.contains(document.activeElement);
    const enter = (event: PointerEvent) => tilt.enter(allowed(event));
    const move = (event: PointerEvent) => {
      if (allowed(event)) tilt.move(event.clientX, event.clientY);
      else tilt.flatten();
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
    media.addEventListener("change", flatten);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(flatten);
    observer?.observe(outer);
    return () => {
      observer?.disconnect();
      tilt.dispose();
      outer.removeEventListener("pointerenter", enter);
      outer.removeEventListener("pointermove", move);
      outer.removeEventListener("pointerleave", leave);
      outer.removeEventListener("pointercancel", flatten);
      outer.removeEventListener("pointerdown", flatten);
      outer.removeEventListener("focusin", flatten);
      window.removeEventListener("resize", flatten);
      window.removeEventListener("scroll", flatten, true);
      media.removeEventListener("change", flatten);
    };
  }, [reduced]);

  function download() {
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    setDownloadError("");
    try {
      const blob = new Blob([JSON.stringify(createSampleBundle(), null, 2)], { type: "application/json" });
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "mend-sample-bundle.json";
      document.body.appendChild(anchor);
      anchor.click();
    } catch {
      setDownloadError("The sample download could not start. Please try again.");
    } finally {
      try {
        anchor?.remove();
      } catch {
        setDownloadError("The sample download could not finish cleanly. Please try again.");
      } finally {
        if (url) {
          const createdUrl = url;
          const release = () => {
            try {
              URL.revokeObjectURL(createdUrl);
            } catch {
              setDownloadError("The sample download could not finish cleanly. Please try again.");
            }
          };
          try {
            window.setTimeout(release, 1000);
          } catch {
            release();
          }
        }
      }
    }
  }

  return (
    <motion.div ref={host} variants={entrance(Boolean(reduced))} initial="hidden" animate="visible" style={{ perspective: 1200 }} className="min-w-0">
      <section ref={surface} data-testid="repair-preview" aria-labelledby="repair-preview-heading" className="panel min-w-0" style={{ transformStyle: "preserve-3d", willChange: "transform" }}>
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label text-muted">A repair, in plain sight</p>
              <h2 id="repair-preview-heading" className="mt-2 text-[18px] font-semibold leading-6 tracking-tight">Demo — simulated evidence</h2>
            </div>
            <span className="label rounded-full border border-ink px-3 py-2">Sample only</span>
          </div>
          <p className="mt-4 text-sm leading-5 text-muted">A fixed Python example, played silently. No model call, isolated job, or live test is running.</p>
          <ol className="my-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Illustrated repair sequence">
            {SAMPLE_PHASES.map((step, index) => (
              <li key={step.label} aria-current={index === phaseIndex ? "step" : undefined} className={`rounded-xl border px-3 py-3 text-xs leading-[18px] ${index === phaseIndex ? "border-ink bg-paper font-semibold" : "border-line bg-white text-muted"}`}>
                <span className="mb-1 block font-mono">0{index + 1}</span>{step.label}
              </li>
            ))}
          </ol>
          <div aria-live={playing ? "off" : "polite"} aria-atomic="true" className="min-h-[84px]">
            <p data-testid="repair-phase" data-phase={["fail", "patch", "pass", "receipt"][phaseIndex]} className="flex items-center gap-2 text-base font-semibold leading-6">
              {phaseIndex === 0 ? <X size={18} aria-hidden="true" /> : phaseIndex === 1 ? <Wrench size={18} aria-hidden="true" /> : phaseIndex === 2 ? <Check size={18} aria-hidden="true" /> : <Receipt size={18} aria-hidden="true" />}
              {phase.label}
            </p>
            <p className="mt-2 text-sm leading-5 text-muted">{phase.detail}</p>
          </div>
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0">
          <div className="overflow-hidden rounded-xl border-2 border-ink bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-xs text-muted">
              <span className="inline-flex items-center gap-2"><FileCode2 size={15} aria-hidden="true" />sales.py</span>
              <span>Illustrative source</span>
            </div>
            <pre data-testid="sample-code" aria-label={phaseIndex === 0 ? "Original sample Python source" : "Patched sample Python source"} className="overflow-x-auto py-4 font-mono text-[13px] leading-6"><code>{numberedSource(phase.code).map((line) => (
              <span key={line.number} data-line={line.number} className={`flex min-w-max pr-4 ${phaseIndex > 0 && (line.number === 2 || line.number === 3) ? "bg-paper" : ""}`}><span aria-hidden="true" className="w-10 shrink-0 select-none pr-3 text-right text-muted">{line.number}</span><span>{line.text || "\u00a0"}</span>{"\n"}</span>
            ))}</code></pre>
          </div>
          <pre className="mt-4 min-h-[92px] overflow-x-auto rounded-xl border border-line bg-white p-4 font-mono text-xs leading-[18px] text-muted" aria-label="Illustrative output">{phase.log}</pre>
          </div>
          <div className="relative h-[300px] min-w-0 overflow-hidden" aria-label="Sample receipt printer">
            <div className="absolute inset-x-3 top-0 z-20 h-2 rounded-full bg-ink" aria-hidden="true" />
            {phaseIndex === 3 ? (
              <motion.div data-testid="sample-receipt" initial={{ y: reduced ? 0 : "-100%" }} animate={{ y: 0 }} transition={reduced ? { duration: 0 } : SPRING} className="relative z-10 mx-2 max-h-[288px] overflow-y-auto break-words border-2 border-ink bg-white p-3 font-mono text-xs leading-[18px]">
                <p className="font-bold">MEND / SAMPLE RECEIPT</p>
                <p className="mt-2">source: demo · execution: not_run</p>
                <p className="mt-2 text-muted">Bundled check names — illustrative only:</p>
                <ul className="mt-1 break-all">{SAMPLE_CHECKS.map((check) => <li key={check}>{check}</li>)}</ul>
                <p className="mt-2 border-t border-line pt-2">No live verification performed.</p>
              </motion.div>
            ) : <p className="pt-12 text-center text-sm leading-5 text-muted">Sample receipt prints at the final step.</p>}
          </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <motion.button type="button" transition={SPRING} onClick={() => setPlaybackOverride(!playing)} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink bg-orange px-4 text-sm font-medium shadow-button" aria-label={playing ? "Pause demo" : "Play demo"}>{playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? "Pause demo" : "Play demo"}</motion.button>
            <button type="button" onClick={() => { setPlaybackOverride(false); setPhaseIndex((current) => (current + 1) % SAMPLE_PHASES.length); }} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink bg-white px-4 text-sm font-medium"><SkipForward size={16} aria-hidden="true" />Next step</button>
            <button type="button" onClick={download} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink bg-white px-4 text-sm font-medium"><Download size={16} aria-hidden="true" />Download sample bundle</button>
          </div>
          {downloadError ? <p role="alert" className="mt-4 text-sm leading-5">{downloadError}</p> : null}
        </div>
      </section>
    </motion.div>
  );
}
