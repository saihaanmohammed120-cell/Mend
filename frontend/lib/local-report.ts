import type { RepositoryReview, ReceiptInspection } from "./local-review";
import { previewPolicy } from "./local-review";

function envelope<T extends object>(review: "repository" | "policy" | "receipt", data: T) {
  return { kind: "mend_local_review_report", schema_version: 1, review, execution: "not_run", approval: "not_approved",
    live_verification: false, signature_verification: "not_performed", source_text_included: false, data } as const;
}
/** Explicit metadata only: source text and changed-span contents never enter a saved report. */
function comparisonData(review: RepositoryReview) {
  return { original_snapshot_sha256: review.originalHash, candidate_snapshot_sha256: review.candidateHash,
    protected_paths: review.protectedPaths, protected_changed: review.protectedChanged,
    changed_paths: review.changed.map(row => row.path), changed_line_span: review.changedLines,
    changed_byte_span: review.changedBytes, metric: "conservative_prefix_suffix_span" };
}
export function repositoryReport(review: RepositoryReview) { return envelope("repository", comparisonData(review)); }
export function policyReport(review: RepositoryReview, maxLines: number, maxBytes: number) {
  return envelope("policy", { comparison: comparisonData(review), limits: { max_changed_lines: maxLines, max_changed_bytes: maxBytes },
    preview: previewPolicy(review, maxLines, maxBytes), authenticated_history: "not_available", trusted_approval: "not_established" });
}
export function receiptReport(inspection: ReceiptInspection, reviewedJsonSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(reviewedJsonSha256)) throw new Error("Review the record again before saving its report.");
  return envelope("receipt", { reviewed_record_json_sha256: reviewedJsonSha256, inspection });
}
export type LocalReport = ReturnType<typeof repositoryReport | typeof policyReport | typeof receiptReport>;
