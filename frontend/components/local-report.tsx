"use client";

import { useEffect, useRef, useState } from "react";
import { beginJsonDownload } from "../lib/bug-intake";
import type { LocalReport } from "../lib/local-report";

export function LocalReportDownload({ report }: { report: LocalReport }) {
  const [status, setStatus] = useState<"idle" | "requested" | "failed">("idle");
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => { const urls = pending.current; return () => { for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear(); }; }, []);
  const json = JSON.stringify(report, null, 2) + "\n";
  function save() {
    try {
      const url = beginJsonDownload(json, `mend-${report.review}-review.json`, {
        createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: url => URL.revokeObjectURL(url),
        createAnchor: () => document.createElement("a"), appendAnchor: anchor => document.body.appendChild(anchor as HTMLAnchorElement),
      });
      pending.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); pending.current.delete(url); }, 1000));
      setStatus("requested");
    } catch { setStatus("failed"); }
  }
  return <div className="desk-line" data-testid="local-report-download">
    <details><summary>Inspect local review report JSON</summary><pre tabIndex={0} aria-label={`${report.review} local review report JSON`}>{json}</pre></details>
    <button type="button" className="desk-button" onClick={save}>Save {report.review} review JSON</button>
    <p className="desk-note" role="status" aria-live="polite">{status === "failed" ? "Download could not start. Inspect or select the JSON above, or retry saving." : status === "requested" ? "Download requested. This local review is unsigned, unapproved and not execution evidence." : "Optional copy of the current review metadata and identities. Original/candidate source text and changed-span contents are excluded. This is not a backend receipt."}</p>
  </div>;
}
