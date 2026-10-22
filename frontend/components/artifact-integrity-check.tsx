"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, Fingerprint } from "lucide-react";
import { checkArtifactFiles, type FileIntegrityResult } from "../lib/artifact-integrity";

type State = { kind: "idle" | "checking" } | { kind: "error"; message: string } | FileIntegrityResult;
type Pending = { controller: AbortController; timer: ReturnType<typeof setTimeout> };

export function ArtifactIntegrityCheck() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const pending = useRef<Pending | null>(null);
  const id = useId();
  useEffect(() => () => {
    const request = pending.current;
    pending.current = null;
    if (request) { clearTimeout(request.timer); request.controller.abort(); }
  }, []);

  async function check() {
    if (pending.current) return;
    const controller = new AbortController();
    const request = { controller, timer: setTimeout(() => controller.abort(), 15000) };
    pending.current = request;
    setState({ kind: "checking" });
    try {
      const result = await checkArtifactFiles({ signal: controller.signal });
      if (pending.current === request) setState(result);
    } catch (error) {
      if (pending.current === request) setState({ kind: "error", message: controller.signal.aborted ? "The file check timed out. No match was established. Retry when the connection is ready." : error instanceof Error ? error.message : "The file check could not finish. No match was established. Retry the check." });
    } finally {
      clearTimeout(request.timer);
      if (pending.current === request) pending.current = null;
    }
  }

  return <section className="proof-integrity" aria-labelledby={`${id}-title`} aria-busy={state.kind === "checking"} data-testid="artifact-integrity">
    <h4 id={`${id}-title`}><Fingerprint size={17} aria-hidden="true" /> Check the proof files.</h4>
    <p id={`${id}-scope`}>Read the source, tests, raw capture and provenance files, then compare their SHA-256 hashes with this build’s fingerprint record.</p>
    <div className="proof-integrity-actions"><button type="button" disabled={state.kind === "checking"} onClick={() => void check()} aria-describedby={`${id}-scope`}>{state.kind === "checking" ? "Checking file hashes…" : "Check file hashes"}</button><a href="/example/integrity.json" download>Fingerprint JSON <ArrowDownRight size={14} aria-hidden="true" /></a></div>
    <p className="proof-integrity-status" role="status" aria-live="polite">{state.kind === "idle" ? "Not checked in this browser." : state.kind === "checking" ? "Reading the proof files. No match established yet." : state.kind === "error" ? state.message : state.kind === "matched" ? "The fetched files match this build’s recorded hashes." : "A file differs from this build’s recorded hash. Reload the page and inspect the files before using them."}</p>
    {state.kind === "matched" || state.kind === "mismatch" ? <ul className="proof-integrity-results">{state.files.map(file => <li key={file.name}><div><code>{file.name}</code><strong data-integrity={file.status}>{file.status === "match" ? "Hash matches" : "Hash differs"}</strong></div><span>FETCHED SHA-256</span><code>{file.actual}</code></li>)}</ul> : null}
    <p className="proof-integrity-boundary">File consistency only. Hash matches do not authenticate the publisher or rerun the checks.</p>
  </section>;
}
