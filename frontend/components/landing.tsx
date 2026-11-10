import Link from "next/link";
import { TopNav } from "@astryxdesign/core/TopNav";
import { ProofHero } from "./proof-hero";
import { ProofFlow } from "./proof-flow";
import { ProofRoadmap } from "./proof-roadmap";
import { RepairCase } from "./repair-case";
import { MendLink, MendButtonLink } from "./mend-link";
import "./landing.css";

/** The public page has no session bootstrap or task transport. */
export function Landing() {
  return <div className="mend-workbench mend-landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <TopNav
      label="Main navigation"
      heading={<Link href="/" aria-label="Mend home" className="landing-brand"><span className="proof-wordmark-mark" aria-hidden="true" /><span>mend</span></Link>}
      centerContent={<span className="landing-nav-links">
        <MendLink href="#worked-example">Explore the example</MendLink>
        <MendLink href="/tools">Local tools</MendLink>
        <MendLink href="/help#source">Source</MendLink>
      </span>}
      endContent={<MendButtonLink href="/sign-in" label="Open workspace" variant="secondary" />}
    />
    <main id="main-content" tabIndex={-1}>
      <ProofHero task={null} receipt={null} events={[]} runtime={null} connection="closed" receiptFresh={false} />
      <ProofFlow />
      <details className="landing-quick-intake">
        <summary>Quick intake on this page <span aria-hidden="true">+</span></summary>
        <RepairCase />
      </details>
      <ProofRoadmap />
      <section className="landing-next" aria-labelledby="landing-next-title">
        <div><h2 id="landing-next-title">Bring your own bug.</h2><p>Keep the original source. Review the inputs. Download your handoff.</p></div>
        <MendButtonLink href="/fix" label="Prepare a bug" variant="primary" icon={<span aria-hidden="true">→</span>} />
      </section>
    </main>
    <footer className="landing-footer"><p>mend <span>Paper &amp; proof.</span></p><nav aria-label="Project links"><MendLink href="/help#testing" isStandalone>Testing guide</MendLink><MendLink href="/sample" isStandalone>Simulated sample</MendLink><MendLink href="/help#license" isStandalone>MIT license</MendLink></nav></footer>
  </div>;
}
