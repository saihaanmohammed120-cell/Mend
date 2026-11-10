"use client";

import NextLink from "next/link";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import type { ReactNode } from "react";

// Client-side navigation wrappers for server components. Server components
// cannot pass the Next.js Link component itself as Astryx's `as` prop
// (component types are not serializable across the RSC boundary), so these
// small client leaves own that wiring. Client files can use Astryx
// Link/Button with as={NextLink} directly.

export function MendLink({
  href,
  children,
  isStandalone,
  download,
  onClick,
}: {
  href: string;
  children: ReactNode;
  isStandalone?: boolean;
  download?: string | boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link href={href} as={NextLink} isStandalone={isStandalone} download={download} onClick={onClick}>
      {children}
    </Link>
  );
}

export function MendButtonLink({
  href,
  label,
  variant,
  icon,
}: {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  icon?: ReactNode;
}) {
  return <Button label={label} variant={variant ?? "secondary"} href={href} as={NextLink} icon={icon} />;
}
