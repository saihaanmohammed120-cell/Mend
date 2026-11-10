import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import "./proof-roadmap.css";

const roadmap = [
  ["Whole-repo repair", "Repository review available", "Freeze a bounded Python repository and review cross-file changes. Live repair and dependency execution remain pending.", "repository", "Repository review guide"],
  ["A required CI/CD check", "CI running · enforcement pending", "Backend, browser, database and tool checks run in GitHub Actions. Required branch protection needs repository administration access.", "ci", "CI and enforcement guide"],
  ["Policy-as-code approval", "Offline review gate available", "Bind change thresholds and authenticated check history to exact source. The review record grants no execution or merge authority.", "policy", "Policy gate and preview"],
  ["A team-wide receipt ledger", "API implemented · hosting pending", "Membership checks and explicit receipt sharing protect a limited team view. The migration has not been applied to the hosted database.", "team-ledger", "Team receipt guide"],
  ["Flaky-test detection", "Offline analyzer available", "Matching-input check histories flag inconsistent results for review. Trusted production history and a quarantine workflow remain pending.", "check-history", "Check-history guide"],
  ["Receipts inside the IDE", "Local extension available", "Open a receipt in VS Code and compare its source with the workspace. Unsigned records remain visibly unverified.", "receipts", "Inspect receipts in Mend"],
] as const;

export function ProofRoadmap() {
  return <section className="mend-proof-roadmap" aria-labelledby="roadmap-title" data-testid="proof-roadmap">
    <div className="proof-roadmap-overview"><div className="proof-roadmap-heading"><div><Text type="label">IMPLEMENTATION STATUS / ROADMAP</Text><div id="roadmap-title"><Heading level={2}>What’s ready. What’s next.</Heading></div></div><Text type="label">Available tools and remaining work</Text></div>
    <Text type="body" as="p">Each capability has its own status and source guide. Local tools and tested backend code do not establish a live repair or a hosted team workflow.</Text>
    </div><div className="proof-roadmap-grid">{roadmap.map(([title, status, description, guide, label], index) => <article key={title}><span className="proof-roadmap-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><Heading level={3}>{title}</Heading><Text type="label">{status}</Text><Text type="body" as="p">{description}</Text><a className="proof-roadmap-guide" href={`/help#${guide}`}>{label}<span aria-hidden="true"> →</span></a></div></article>)}</div>
  </section>;
}
