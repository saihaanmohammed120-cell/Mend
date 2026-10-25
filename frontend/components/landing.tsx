import Link from "next/link";
import { ProofHero } from "./proof-hero";
import { ProofFlow } from "./proof-flow";
import { ProofRoadmap } from "./proof-roadmap";
import { RepairCase } from "./repair-case";
import "./landing.css";

/** The public page has no session bootstrap or task transport. */
export function Landing() {
  return <div className="mend-workbench mend-landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-header">
      <Link href="/" aria-label="Mend home" className="landing-brand"><span className="proof-wordmark-mark" aria-hidden="true" /><span>mend</span></Link>
      <nav aria-label="Main navigation">
        <a href="#worked-example">Explore the example</a>
        <a href="https://github.com/saihaanmohammed120-cell/Mend">Source</a>
        <Link href="/sign-in" className="landing-outline">Open workspace <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
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
        <Link href="/fix" className="landing-button">Prepare a bug <span aria-hidden="true">→</span></Link>
      </section>
    </main>
    <footer className="landing-footer"><p>mend <span>Paper &amp; proof.</span></p><nav aria-label="Project links"><a href="https://github.com/saihaanmohammed120-cell/Mend/blob/main/docs/JUDGE_GUIDE.md">Testing guide</a><Link href="/sample">Simulated sample</Link><a href="https://github.com/saihaanmohammed120-cell/Mend/blob/main/LICENSE">MIT license</a></nav></footer>
  </div>;
}
