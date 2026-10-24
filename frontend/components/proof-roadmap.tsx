import "./proof-roadmap.css";

const roadmap = [
  ["Whole-repo repair", "Repository review available", "Freeze a bounded Python repository and review cross-file changes. Live repair and dependency execution remain pending.", "REPOSITORY_CASES.md", "Review repository support"],
  ["A required CI/CD check", "CI running · enforcement pending", "Backend, browser, database and tool checks run in GitHub Actions. Required branch protection needs repository administration access.", "ROADMAP_IMPLEMENTATION_2026_10_24.md", "Inspect CI and enforcement"],
  ["Policy-as-code approval", "Offline review gate available", "Bind change thresholds and authenticated check history to exact source. The review record grants no execution or merge authority.", "APPROVAL_POLICY.md", "Use the policy gate"],
  ["A team-wide receipt ledger", "API implemented · hosting pending", "Membership checks and explicit receipt sharing protect a limited team view. The migration has not been applied to the hosted database.", "TEAM_RECEIPT_LEDGER.md", "Inspect the team ledger"],
  ["Flaky-test detection", "Offline analyzer available", "Matching-input check histories flag inconsistent results for review. Trusted production history and a quarantine workflow remain pending.", "CHECK_HISTORY.md", "Analyze check history"],
  ["Receipts inside the IDE", "Local extension available", "Open a receipt in VS Code and compare its source with the workspace. Unsigned records remain visibly unverified.", "IDE_RECEIPTS.md", "Use the receipt viewer"],
] as const;

export function ProofRoadmap() {
  return <section className="mend-proof-roadmap" aria-labelledby="roadmap-title" data-testid="proof-roadmap">
    <div className="proof-roadmap-overview"><div className="proof-roadmap-heading"><div><p className="proof-roadmap-eyebrow">IMPLEMENTATION STATUS / ROADMAP</p><h2 id="roadmap-title">What’s ready. What’s next.</h2></div><span className="proof-roadmap-label">Available tools and remaining work</span></div>
    <p className="proof-roadmap-intro">Each capability has its own status and source guide. Local tools and tested backend code do not establish a live repair or a hosted team workflow.</p>
    </div><div className="proof-roadmap-grid">{roadmap.map(([title, status, description, guide, label], index) => <article key={title}><span className="proof-roadmap-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p className="proof-roadmap-status">{status}</p><p>{description}</p><a className="proof-roadmap-guide" href={`https://github.com/saihaanmohammed120-cell/Mend/blob/main/docs/${guide}`}>{label}<span aria-hidden="true"> ↗</span></a></div></article>)}</div>
  </section>;
}
