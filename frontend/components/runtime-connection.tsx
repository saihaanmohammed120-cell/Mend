import type { Runtime } from "../lib/use-workbench";

export function RuntimeConnection({ runtime, checking, onRecheck }: {
  runtime: Runtime | null; checking: boolean; onRecheck: () => void;
}) {
  const ready = runtime?.ready === true;
  const api = runtime?.api_status === "reachable" ? "Reached" : runtime?.api_status === "unavailable" ? "Unavailable" : "Not checked";
  const database = runtime?.database?.status === "verified" ? "Supabase responded" : runtime?.database?.status === "unavailable" ? "Unavailable" : "Not checked";
  return <section aria-label="Runtime connections" aria-busy={checking} className="mb-8 rounded-xl border-2 border-ink bg-paper p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{ready ? "Execution available" : "Execution locked"}</h2>
      <button type="button" onClick={onRecheck} disabled={checking} className="focus-ring min-h-11 rounded-xl border border-ink bg-white px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{checking ? "Checking connections…" : "Recheck connections"}</button>
    </div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
      {[ ["App API", api], ["Database", database], ["Execution", ready ? "Release gates permit a start" : "Start disabled"] ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-ink/20 bg-white p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 break-words text-base font-medium">{value}</dd></div>)}
    </dl>
    <p className="mt-4 text-base leading-6 text-muted">{ready ? "The backend permits execution. A persisted receipt is still required to establish the result." : "Task review can prepare a contract. Start stays disabled until the backend configuration and database release gate permit execution."} Connection checks do not run code or establish passing checks.</p>
    {runtime?.database?.release_gate === "disabled" ? <p className="mt-2 text-sm">The database release gate is disabled.</p> : null}
    {runtime?.checked_at ? <p className="mt-3 break-words text-xs text-muted">Last backend check: <time dateTime={runtime.checked_at}>{runtime.checked_at}</time></p> : null}
  </section>;
}
