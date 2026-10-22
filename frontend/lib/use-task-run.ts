"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isBusy, parseEvent, type Receipt, type RunStatus, type StreamStatus } from "./protocol";

export interface LogLine {
  id: number;
  text: string;
  stream: "stdout" | "stderr";
  attempt: number;
}
interface RunState {
  status: RunStatus;
  connection: StreamStatus;
  attempt: number;
  message: string;
  logs: LogLine[];
  receipt: Receipt | null;
  error: string | null;
}
const INITIAL: RunState = {
  status: "idle", connection: "offline", attempt: 0,
  message: "A fresh page. A small task. A labeled sample repair.",
  logs: [], receipt: null, error: null,
};

/** This historical prototype is deliberately sample-only. The audited bridge has a different contract. */
export function useTaskRun() {
  const [state, setState] = useState(INITIAL);
  const source = useRef<EventSource | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const lineId = useRef(0);
  const seen = useRef(new Set<string>());
  const playbackDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReconnect = useCallback(() => {
    if (reconnectDeadline.current !== null) clearTimeout(reconnectDeadline.current);
    reconnectDeadline.current = null;
  }, []);
  const closeStream = useCallback(() => {
    source.current?.close();
    source.current = null;
    clearReconnect();
    if (playbackDeadline.current !== null) clearTimeout(playbackDeadline.current);
    playbackDeadline.current = null;
  }, [clearReconnect]);
  useEffect(() => () => {
    generation.current += 1;
    active.current = false;
    closeStream();
  }, [closeStream]);

  const start = useCallback(async (prompt: string) => {
    if (active.current || !prompt.trim()) return;
    active.current = true;
    const current = ++generation.current;
    closeStream();
    seen.current.clear();
    lineId.current = 0;
    setState({ ...INITIAL, status: "writing", connection: "connecting",
      message: "Playing a sample scenario. The submitted prompt is not executed." });
    const fail = (message: string) => {
      if (current !== generation.current || !active.current) return;
      active.current = false;
      closeStream();
      setState(s => ({ ...s, status: "failed", connection: "offline", error: message,
        message: "Sample playback failed. No verified result was accepted." }));
    };
    try {
      const stream = new EventSource(`/api/demo/events?run=${encodeURIComponent(crypto.randomUUID())}`);
      source.current = stream;
      // Playback timeout is a browser safeguard, not a remote job deadline.
      playbackDeadline.current = setTimeout(() => fail("Sample playback timed out. Retry the sample."), 45_000);
      stream.onopen = () => {
        if (current !== generation.current || !active.current) return;
        clearReconnect();
        setState(s => ({ ...s, connection: "connected", error: null }));
      };
      const handle = (message: MessageEvent<string>) => {
        if (current !== generation.current || !active.current ||
          (message.lastEventId && seen.current.has(message.lastEventId))) return;
        try {
          const event = parseEvent(message.data, "demo");
          if (message.lastEventId) seen.current.add(message.lastEventId);
          if (seen.current.size > 4000) {
            const oldest = seen.current.values().next().value;
            if (oldest) seen.current.delete(oldest);
          }
          if (event.type === "state") {
            setState(s => ({ ...s, status: event.status, attempt: event.attempt, message: event.message }));
          } else if (event.type === "log") {
            const text = event.text.length > 4000
              ? `${event.text.slice(0, 4000)}\n[Output shortened in this view]` : event.text;
            const line: LogLine = { id: ++lineId.current, text, stream: event.stream, attempt: event.attempt };
            setState(s => ({ ...s, logs: [...s.logs, line].slice(-200) }));
          } else {
            active.current = false;
            closeStream();
            setState(s => event.type === "receipt"
              ? { ...s, status: "success", connection: "offline", receipt: event.receipt,
                  message: "The sample checks passed. Illustrative receipt ready." }
              : { ...s, status: event.type === "failed" ? "failed" : "stopped", connection: "offline",
                  message: event.message, error: event.type === "failed" ? event.message : null });
          }
        } catch (error) {
          fail(error instanceof Error ? error.message : "Invalid sample stream response.");
        }
      };
      stream.onmessage = handle;
      for (const name of ["state", "log", "receipt", "failed", "stopped"])
        stream.addEventListener(name, handle as EventListener);
      stream.onerror = () => {
        if (current !== generation.current || !active.current) return;
        setState(s => ({ ...s, connection: "reconnecting", error: "Sample connection interrupted. Reconnecting…" }));
        if (reconnectDeadline.current === null)
          reconnectDeadline.current = setTimeout(() => fail("Could not reconnect to the sample. Retry playback."), 15_000);
      };
    } catch (error) {
      fail(error instanceof Error ? error.message : "Unable to start sample playback.");
    }
  }, [clearReconnect, closeStream]);
  const stop = useCallback(async () => {
    if (!active.current) return;
    generation.current += 1;
    active.current = false;
    closeStream();
    setState(s => ({ ...s, status: "stopped", connection: "offline", error: null, message: "Sample playback stopped." }));
  }, [closeStream]);
  return { ...state, mode: "demo" as const, busy: isBusy(state.status), start, stop };
}
