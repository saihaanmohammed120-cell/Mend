import type { Metadata } from "next";
import { BugDesk } from "@/components/bug-desk";

export const metadata: Metadata = {
  title: "Bug desk — Mend",
  description: "Prepare a local bug intake for review. Investigation and execution are not connected on this page.",
};

export default function FixPage() {
  return <BugDesk />;
}
