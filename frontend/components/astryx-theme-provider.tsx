"use client";

import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

// Astryx theme provider. The generated astryx-themes.ts module is intentionally
// NOT used here: it side-effect imports @astryxdesign/theme-neutral/fonts.css,
// which loads Figtree from Google Fonts and would override Mend's self-hosted
// fonts. theme.css is imported via app/globals.css instead.
export function AstryxThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="system">
      {children}
    </Theme>
  );
}
