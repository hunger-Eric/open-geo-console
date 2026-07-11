export type ScanProgressStage = "starting" | "slow" | "extended";

export function getScanProgressStage(elapsedMs: number): ScanProgressStage {
  if (elapsedMs >= 60_000) return "extended";
  if (elapsedMs >= 15_000) return "slow";
  return "starting";
}
