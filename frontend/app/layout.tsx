import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mend — Code that runs. Proof to keep.",
  metadataBase: new URL("https://mend-paper-proof.bravebadge32.chatgpt.site"),
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }] },
  openGraph: {
    type: "website", title: "Mend — Code that runs. Proof to keep.",
    description: "The CSV-cleaner repair, with actual local checks and a source hash.",
    images: [{ url: "/share/mend-proof.png", width: 1200, height: 630, alt: "Mend. Code that runs. Proof to keep. Captured local example." }],
  },
  twitter: { card: "summary_large_image", images: ["/share/mend-proof.png"] },
  description:
    "Write, run, repair. A tactile workbench for code you can review.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
