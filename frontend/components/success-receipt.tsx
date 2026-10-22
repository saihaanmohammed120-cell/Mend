"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreference } from "@/lib/use-motion-preference";
import { ArrowDownToLine, Check, Printer } from "lucide-react";
import type { Receipt } from "@/lib/protocol";
import { entrance, SPRING } from "@/lib/motion";

export function SuccessReceipt({ receipt }: { receipt: Receipt | null }) {
  const reduced = useMotionPreference();
  const download = () => {
    if (!receipt) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mend-${receipt.source}-receipt.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <motion.section
      variants={entrance(reduced)}
      aria-labelledby="receipt-heading"
      className="mt-9"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2
          id="receipt-heading"
          className="label inline-flex items-center gap-2"
        >
          <Printer size={16} aria-hidden="true" /> The paper trail
        </h2>
        <span className="label text-muted">Keep the evidence</span>
      </div>
      <div className="panel relative p-4 pb-0">
        {/* Slot sits in front of the clipped paper; paper emerges downward from here. */}
        <div
          aria-hidden="true"
          className="absolute left-5 right-5 top-4 z-20 h-3 rounded-full bg-ink shadow-[inset_0_3px_0_#000]"
        />
        <div className="relative overflow-hidden px-3 pb-5 pt-3">
          <AnimatePresence initial={false} mode="wait">
            {receipt ? (
              <motion.article
                key={receipt.receipt_id}
                initial={{ y: reduced ? 0 : "-110%", opacity: reduced ? 0 : 1 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: reduced ? 0 : 0.12 },
                }}
                transition={reduced ? { duration: 0 } : SPRING}
                className="receipt-paper relative z-10 rounded-xs bg-white px-5 pb-9 pt-8 font-mono sm:px-7"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold leading-6 tracking-tight">
                      mend / receipt
                    </p>
                    <p className="mt-1 text-xs leading-[18px] text-muted">
                      {receipt.source === "demo"
                        ? "Sample evidence only"
                        : "Verification record"}
                    </p>
                  </div>
                  <span className="rounded-full border-2 border-forest p-1.5 text-forest">
                    <Check size={18} aria-hidden="true" />
                  </span>
                </div>
                <div className="border-y border-dashed border-ink/40 py-4 text-sm leading-5">
                  <div className="flex justify-between gap-3">
                    <span>REQUIRED CHECKS</span>
                    <strong>
                      {receipt.checks.passed} / {receipt.checks.total}
                    </strong>
                  </div>
                  <div className="mt-3 flex justify-between gap-3">
                    <span>ATTEMPTS</span>
                    <strong>{receipt.attempts}</strong>
                  </div>
                  <div className="mt-3 flex justify-between gap-3">
                    <span>ELAPSED</span>
                    <strong>{(receipt.duration_ms / 1000).toFixed(1)}s</strong>
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium leading-5 text-forest">
                  PASSED THE LISTED CHECKS
                </p>
                <p className="mt-3 break-all text-xs leading-[18px] text-muted">
                  JOB {receipt.job_id}
                  <br />
                  SHA256 {receipt.snapshot_sha256}
                </p>
                <p className="mt-4 text-xs leading-[18px]">
                  {receipt.source === "demo"
                    ? "Illustrative sample. No real provider execution or database storage."
                    : "Covers the checks recorded by the backend. Review the change before using it."}
                </p>
                <button
                  type="button"
                  onClick={download}
                  className="focus-ring mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink bg-paper px-3 text-sm font-medium leading-5"
                >
                  <ArrowDownToLine size={15} aria-hidden="true" /> Download JSON
                </button>
              </motion.article>
            ) : (
              <motion.div
                key="empty"
                variants={entrance(reduced)}
                initial="hidden"
                animate="visible"
                className="flex min-h-36 flex-col items-center justify-center px-3 pb-6 pt-9 text-center"
              >
                <p className="text-sm font-bold">
                  A receipt is worth waiting for.
                </p>
                <p className="mt-2 max-w-xs text-sm leading-5 text-muted">
                  It prints only after the listed checks pass.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
