"use client";

import { useEffect, useRef, useState } from "react";
import { MendLink } from "./mend-link";
import "./mobile-menu.css";

export type MobileMenuLink = { href: string; label: string };

/**
 * Phone navigation for the Astryx TopNav, which has no mobile collapse.
 * Below 768px the centre links are hidden (landing.css / desk.css) and
 * this hamburger is the only path to them. The panel renders inside the
 * <nav> landmark so the e2e "Main navigation" scope still finds the links.
 * Plain button + panel on purpose: no Astryx internals, no Drawer props.
 */
export function MobileMenu({ links, id }: { links: MobileMenuLink[]; id: string }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `${id}-panel`;

  // Escape closes the menu and returns focus to the toggle.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open ]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open ]);

  return (
    <span className="mend-mobile-menu">
      <button
        ref={toggleRef}
        type="button"
        className="mend-mobile-menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true" className="mend-mobile-menu-icon"><span /><span /><span /></span>
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className="mend-mobile-menu-panel"
        data-open={open}
        tabIndex={-1}
      >
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <MendLink href={link.href} onClick={() => setOpen(false)}>{link.label}</MendLink>
            </li>
          ))}
        </ul>
      </div>
    </span>
  );
}
