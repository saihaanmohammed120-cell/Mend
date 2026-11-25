import Link from "next/link";
import type { ReactNode } from "react";
import { TopNav } from "@astryxdesign/core/TopNav";
import { MendLink } from "./mend-link";
import { MobileMenu } from "./mobile-menu";
import "./desk.css";

export function DeskShell({ children }: { children: ReactNode }) {
  return <div className="mend-local-desk">
    <a href="#desk-content" className="desk-skip">Skip to content</a>
    <TopNav
      label="Mend navigation"
      style={{ position: "relative" }}
      heading={<Link href="/" className="desk-brand" aria-label="Mend home"><span className="proof-wordmark-mark" aria-hidden="true" />mend</Link>}
      centerContent={<span className="desk-nav-links">
        <MendLink href="/fix">Bug intake</MendLink>
        <MendLink href="/tools">Local tools</MendLink>
        <MendLink href="/help">Guides &amp; source</MendLink>
        <MendLink href="/sign-in">Workspace</MendLink>
      </span>}
      endContent={<span className="desk-end">
        <MobileMenu id="desk-menu" links={[
          { href: "/fix", label: "Bug intake" },
          { href: "/tools", label: "Local tools" },
          { href: "/help", label: "Guides & source" },
          { href: "/sign-in", label: "Workspace" },
        ]} />
      </span>}
    />
    <main id="desk-content" tabIndex={-1}>{children}</main>
    <footer className="desk-footer"><p>Paper &amp; proof. Inputs stay local on the tools desk.</p><MendLink href="/help#execution" isStandalone>What is available?</MendLink><MendLink href="/" isStandalone>Back to Mend</MendLink></footer>
  </div>;
}
