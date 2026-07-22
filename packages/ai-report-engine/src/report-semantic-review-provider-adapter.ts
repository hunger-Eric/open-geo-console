import {
  applyReportSemanticReview,
  parseReportSemanticReviewOutput,
  type AppliedReportSemanticReview,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewOutput
} from "./report-semantic-review";

export interface ReportSemanticReviewInvoker {
  (request: Readonly<{ input: ReportSemanticReviewInput }>): Promise<unknown>;
}

export interface OfflineReportSemanticReviewResult {
  readonly review: ReportSemanticReviewOutput;
  readonly applied: AppliedReportSemanticReview;
}

/** An injectable adapter; callers own transport and this module owns no client/configuration. */
export async function runOfflineReportSemanticReview(
  input: ReportSemanticReviewInput,
  invoke: ReportSemanticReviewInvoker,
  currentNonProseProjectionHash?: string
): Promise<OfflineReportSemanticReviewResult> {
  const rawReview = await invoke({ input });
  const review = parseReportSemanticReviewOutput(rawReview, input);
  return { review, applied: applyReportSemanticReview(input, review, currentNonProseProjectionHash) };
}
