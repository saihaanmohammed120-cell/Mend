import type { StreamEvent } from "../lib/evidence";
import type { Task } from "../lib/mend-client";
import { attemptTimeline } from "../lib/attempt-timeline";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";

export function AttemptTimeline({ task, events }: { task: Task | null; events: StreamEvent[] }) {
  const rows = attemptTimeline(task, events);
  return <section className="mt-6 border-t border-line pt-5" aria-label="Attempt timeline" data-testid="attempt-timeline">
    <Heading level={3}>Attempt timeline</Heading>
    <Text type="body" as="p">{task?.source === "local_test" || task?.source === "demo" ? "Fixture records — not live execution. " : "Persisted backend observations. "}Only entries present in this view are shown; replay may be partial. Logs and reported outcomes are not independent proof.</Text>
    {!rows.length ? <Text type="body" as="p">No attempt observations available. No iteration has been inferred.</Text> : <ol className="mt-4 space-y-5">{rows.map(row => <li key={row.id} className="rounded-xl border border-line p-4" data-attempt={row.ordinal}>
      <Heading level={4}>Attempt {row.ordinal} · {row.inconsistent ? "Inconsistent records" : row.resolved ? `Reported ${row.status.replaceAll("_", " ")}` : "Candidate reserved"}</Heading>
      <Text type="body" as="p">{row.reserved ? "Reservation recorded. " : "Reservation event not available. "}{!row.resolved ? "Outcome not available. Reservation does not establish execution." : "Outcome recorded."}</Text>
      <dl className="mt-3 space-y-2 text-sm leading-6"><div><dt className="font-medium">Approach</dt><dd>Not recorded.</dd></div><div><dt className="font-medium">Why this approach</dt><dd>Not recorded.</dd></div></dl>
      {row.checks ? <ul className="mt-3 space-y-2" aria-label={`Attempt ${row.ordinal} reported checks`}>{row.checks.map(check => <li key={check.id} className="break-all text-sm"><Text type="code">{check.id}</Text> — <Badge variant={check.status === "passed" ? "success" : "error"} label={check.status} /></li>)}</ul> : <Text type="body" as="p">Check results: Not available.</Text>}
      <details className="mt-3"><summary>Inspect recorded identity and diagnostic</summary><dl className="space-y-2 text-sm"><div><dt>Attempt ID</dt><dd className="break-all font-mono">{row.id}</dd></div><div><dt>Source snapshot SHA-256</dt><dd className="break-all font-mono">{row.snapshot}</dd></div><div><dt>Recorded model</dt><dd className="break-all">{row.model}</dd></div></dl><Text type="supporting" as="p">Reported output — diagnostic only</Text><CodeBlock code={row.diagnostic ?? "Not recorded."} language="plaintext" hasCopyButton={false} width="100%" /></details>
    </li>)}</ol>}
  </section>;
}
