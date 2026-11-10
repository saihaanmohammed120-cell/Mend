import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";

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
    <Heading level={4}>Trust signals</Heading>
    <Text type="body" as="p">{props.scope === "captured" ? "Captured example only · not live execution." : "Current task only · fixture records remain fixture evidence."} Each signal stands on its own; this is not an overall verification seal.</Text>
    <dl className="mt-3 grid gap-x-5 sm:grid-cols-2">{signals.map(signal => <div key={signal.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-3 text-sm" data-signal={signal.name} data-trust={signal.status}>
      <dt>{signal.name}</dt><dd><Badge variant={signal.status === "pass" ? "success" : signal.status === "fail" ? "error" : "neutral"} label={signal.status === "pass" ? "Pass" : signal.status === "fail" ? "Fail" : "Not available"} /></dd>
    </div>)}</dl>
    <details className="mt-2 text-sm leading-6"><summary>What these signals establish</summary><ul className="space-y-3">{signals.map(signal => <li key={signal.name}><strong>{signal.name}.</strong> {signal.reason}</li>)}</ul></details>
  </aside>;
}
