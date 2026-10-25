import type { StreamEvent } from "../lib/evidence";
import type { Task } from "../lib/mend-client";
import { attemptTimeline } from "../lib/attempt-timeline";

export function AttemptTimeline({ task, events }: { task: Task | null; events: StreamEvent[] }) {
  const rows = attemptTimeline(task, events);
  return <section className="mt-6 border-t border-line pt-5" aria-label="Attempt timeline" data-testid="attempt-timeline">
    <h3 className="text-base font-semibold">Attempt timeline</h3>
    <p className="mt-2 text-sm leading-6 text-muted">{task?.source === "local_test" || task?.source === "demo" ? "Fixture records — not live execution. " : "Persisted backend observations. "}Only entries present in this view are shown; replay may be partial. Logs and reported outcomes are not independent proof.</p>
    {!rows.length ? <p className="mt-4 text-base text-muted">No attempt observations available. No iteration has been inferred.</p> : <ol className="mt-4 space-y-5">{rows.map(row => <li key={row.id} className="rounded-xl border border-line p-4" data-attempt={row.ordinal}>
      <h4 className="text-base font-semibold">Attempt {row.ordinal} · {row.inconsistent ? "Inconsistent records" : row.resolved ? `Reported ${row.status.replaceAll("_", " ")}` : "Candidate reserved"}</h4>
      <p className="mt-2 text-sm text-muted">{row.reserved ? "Reservation recorded. " : "Reservation event not available. "}{!row.resolved ? "Outcome not available. Reservation does not establish execution." : "Outcome recorded."}</p>
      <dl className="mt-3 space-y-2 text-sm leading-6"><div><dt className="font-medium">Approach</dt><dd>Not recorded.</dd></div><div><dt className="font-medium">Why this approach</dt><dd>Not recorded.</dd></div></dl>
      {row.checks ? <ul className="mt-3 space-y-2" aria-label={`Attempt ${row.ordinal} reported checks`}>{row.checks.map(check => <li key={check.id} className="break-all text-sm"><code>{check.id}</code> — <strong>{check.status}</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted">Check results: Not available.</p>}
      <details className="mt-3"><summary className="focus-ring min-h-11 cursor-pointer py-3 text-sm">Inspect recorded identity and diagnostic</summary><dl className="space-y-2 text-sm"><div><dt>Attempt ID</dt><dd className="break-all font-mono">{row.id}</dd></div><div><dt>Source snapshot SHA-256</dt><dd className="break-all font-mono">{row.snapshot}</dd></div><div><dt>Recorded model</dt><dd className="break-all">{row.model}</dd></div></dl><p className="mt-3 text-sm text-muted">Reported output — diagnostic only</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{row.diagnostic ?? "Not recorded."}</pre></details>
    </li>)}</ol>}
  </section>;
}
