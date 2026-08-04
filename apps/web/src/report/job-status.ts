export type PublicReportState = "generating" | "completed" | "completed_limited" | "unavailable";

export function publicStateForStage(stage: string): PublicReportState {
  if (stage === "completed") return "completed";
  if (stage === "completed_limited" || stage === "partial") return "completed_limited";
  if (stage === "failed") return "unavailable";
  return "generating";
}

/**
 * Public progress for status API / UI. Failed jobs keep a stored progress of
 * e.g. 96 in PostgreSQL for diagnostics, but the public surface must not imply
 * "still generating at 96%". Returns null for unavailable; never invents a
 * false completed or zeroed mid-run percentage for failures.
 */
export function publicProgressForStage(stage: string, progress: number): number | null {
  const state = publicStateForStage(stage);
  if (state === "unavailable") return null;
  if (state === "completed" || state === "completed_limited") return 100;
  const numeric = Number.isFinite(progress) ? progress : 0;
  return Math.max(0, Math.min(99, Math.trunc(numeric)));
}

export function publicTwoStageFreeProgress(
  stage: string,
  progress: number,
  segment: "base" | "preview"
): number | null {
  const publicProgress = publicProgressForStage(stage, progress);
  if (publicProgress === null) return null;
  if (segment === "base") return Math.min(65, publicProgress);
  if (publicProgress === 100) return 100;
  return 65 + Math.round((publicProgress / 99) * 34);
}
