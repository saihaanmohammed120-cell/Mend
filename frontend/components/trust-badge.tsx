type Props = { scope: "task" } | { scope: "captured"; hashes?: "pass" | "fail" };

export function TrustBadge(props: Props) {
  const hashes = props.scope === "captured" ? props.hashes : undefined;
  const signals = [
    { name: "File hashes", status: hashes ?? "unavailable", reason: props.scope === "captured"
      ? "Fetched example bytes compared with this build’s fingerprints. This does not authenticate the publisher or rerun tests."
      : "This browser has not fetched and hashed this task’s artifacts." },
    { name: "Protected tests unchanged", status: "unavailable", reason: "Locked paths describe the editing policy. An independent before/after comparison is not available here." },
    { name: "Cost under cap", status: "unavailable", reason: "The server’s monetary cap is not supplied in this view. Zero or missing cost is not a pass." },
    { name: "Stop confirmed", status: "unavailable", reason: "Independent stop evidence is not available here. A stop request or task status alone is insufficient." },
  ];
  return <aside className="mt-5 border-y border-line py-4" aria-label="Trust signals" data-testid="trust-badge">
    <h4 className="text-base font-semibold">Trust signals</h4>
    <p className="mt-2 text-sm leading-6 text-muted">{props.scope === "captured" ? "Captured example only · not live execution." : "Current task only · fixture records remain fixture evidence."} Each signal stands on its own; this is not an overall verification seal.</p>
    <dl className="mt-3 grid gap-x-5 sm:grid-cols-2">{signals.map(signal => <div key={signal.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-3 text-sm" data-signal={signal.name} data-trust={signal.status}>
      <dt>{signal.name}</dt><dd className={`font-semibold ${signal.status === "fail" ? "text-failure" : ""}`}>{signal.status === "pass" ? "Pass" : signal.status === "fail" ? "Fail" : "Not available"}</dd>
    </div>)}</dl>
    <details className="mt-2 text-sm leading-6"><summary className="focus-ring min-h-11 cursor-pointer py-3">What these signals establish</summary><ul className="space-y-3">{signals.map(signal => <li key={signal.name}><strong>{signal.name}.</strong> {signal.reason}</li>)}</ul></details>
  </aside>;
}
