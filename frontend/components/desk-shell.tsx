import Link from "next/link";
import type { ReactNode } from "react";
import "./desk.css";

export function DeskShell({ children }: { children: ReactNode }) {
  return <div className="mend-local-desk">
    <a href="#desk-content" className="desk-skip">Skip to content</a>
    <header className="desk-header"><Link href="/" className="desk-brand" aria-label="Mend home"><span className="proof-wordmark-mark" aria-hidden="true" />mend</Link><nav aria-label="Mend navigation"><Link href="/fix">Bug intake</Link><Link href="/tools">Local tools</Link><Link href="/help">Guides &amp; source</Link><Link href="/sign-in">Workspace</Link></nav></header>
    <main id="desk-content" tabIndex={-1}>{children}</main>
    <footer className="desk-footer"><p>Paper &amp; proof. Inputs stay local on the tools desk.</p><Link href="/help#execution">What is available?</Link><Link href="/">Back to Mend</Link></footer>
  </div>;
}
