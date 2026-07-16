export type PublicReportState = "generating" | "completed" | "completed_limited" | "unavailable";

export function publicStateForStage(stage: string): PublicReportState {
  if (stage === "completed") return "completed";
  if (stage === "completed_limited" || stage === "partial") return "completed_limited";
  if (stage === "failed") return "unavailable";
  return "generating";
}
