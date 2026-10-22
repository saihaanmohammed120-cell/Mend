"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import "./command-copy.css";

export const CAPTURED_COMMAND = "python -m unittest -v test_csv_tools";

/** Copies a reproduction command on request. Copying never runs a check. */
export function CommandCopy() {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const alive = useRef(false);
  const pending = useRef(false);
  const epoch = useRef(0);
  const identity = useId();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; epoch.current++; pending.current = false; };
  }, []);

  async function copy() {
    if (pending.current) return;
    pending.current = true;
    const request = ++epoch.current;
    setState("copying");
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(CAPTURED_COMMAND);
      if (alive.current && request === epoch.current) setState("copied");
    } catch {
      if (alive.current && request === epoch.current) setState("failed");
    } finally {
      if (request === epoch.current) pending.current = false;
    }
  }

  return <div className="mend-command-copy" data-testid="command-copy">
    <div className="command-copy-row">
      <input type="text" readOnly value={CAPTURED_COMMAND} aria-label="Reproduction command" aria-describedby={`${identity}-scope`} spellCheck={false} onFocus={event => event.currentTarget.select()} />
      <button type="button" onClick={() => void copy()} disabled={state === "copying"} aria-label="Copy reproduction command">{state === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{state === "copying" ? "Copying…" : state === "copied" ? "Copied" : "Copy"}</button>
    </div>
    <p id={`${identity}-scope`} className="command-copy-status" role="status" aria-live="polite">{state === "failed" ? "Copy unavailable. Select the command and copy it manually." : state === "copying" ? "Waiting for clipboard permission." : state === "copied" ? "Command copied. No checks were run." : "Run from the extracted example folder. Copying does not execute it."}</p>
  </div>;
}
