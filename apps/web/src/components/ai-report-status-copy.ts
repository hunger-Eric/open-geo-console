import type { Dictionary } from "@/i18n";

export function getUnavailableDescriptionKey(
  job: { tier: "preview" | "deep"; refundState: "reserved" | "settled" | "refunded" | null },
  hasTechnicalReport: boolean
): "previewUnavailableDescription" | "failedDescription" {
  return job.tier === "preview" && hasTechnicalReport && job.refundState === null
    ? "previewUnavailableDescription"
    : "failedDescription";
}

export function getProgressStageDescription(stage: string, dictionary: Dictionary): string {
  return Object.hasOwn(dictionary.aiReport.stageDescriptions, stage)
    ? dictionary.aiReport.stageDescriptions[stage as keyof typeof dictionary.aiReport.stageDescriptions]
    : dictionary.aiReport.waitingDescription;
}
