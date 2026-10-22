import "./proof-roadmap.css";

const roadmap = [
  ["Whole-repo repair", "Follow a failure across files and dependencies, beyond a single function."],
  ["A required CI/CD check", "Run inside GitHub Actions and gate changes in the existing delivery workflow."],
  ["Policy-as-code approval", "Auto-approve below a defined risk threshold; require human review above it."],
  ["A team-wide receipt ledger", "Query provenance and verification evidence across every recorded run."],
  ["Flaky-test detection", "Identify inconsistent checks and quarantine them for deliberate review."],
  ["Receipts inside the IDE", "Surface the run, provenance and review context beside the code change."],
] as const;

export function ProofRoadmap() {
  return <section className="mend-proof-roadmap" aria-labelledby="roadmap-title" data-testid="proof-roadmap">
    <div className="proof-roadmap-overview"><div className="proof-roadmap-heading"><div><p className="proof-roadmap-eyebrow">THE NEXT CHAPTER / ROADMAP</p><h2 id="roadmap-title">Where this goes next.</h2></div><span className="proof-roadmap-label">Not yet built</span></div>
    <p className="proof-roadmap-intro">Directions for Mend after the verified repair loop. These are planned capabilities, not available features.</p>
    </div><div className="proof-roadmap-grid">{roadmap.map(([title, description], index) => <article key={title}><span className="proof-roadmap-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
  </section>;
}
