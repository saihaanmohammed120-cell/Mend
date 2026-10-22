import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "var(--mend-surface)",
        paper: "var(--mend-paper)",
        ink: "var(--mend-ink)",
        orange: "var(--mend-accent)",
        forest: "var(--mend-pass)",
        muted: "var(--mend-muted)",
        failure: "var(--mend-danger)",
        line: "var(--mend-line)",
        control: "var(--mend-control)",
      },
      boxShadow: { hard: "8px 8px 0px var(--mend-ink)", button: "4px 4px 0px var(--mend-ink)" },
      borderRadius: { workbench: "20px" },
      fontFamily: {
        sans: ["Mend Archivo", "Arial", "sans-serif"],
        mono: ["Mend Plex", "ui-monospace", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
