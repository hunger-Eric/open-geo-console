export function getUnavailableDescriptionKey(
  job: { tier: "preview" | "deep"; refundState: "reserved" | "settled" | "refunded" | null },
  hasTechnicalReport: boolean
): "previewUnavailableDescription" | "failedDescription" {
  return job.tier === "preview" && hasTechnicalReport && job.refundState === null
    ? "previewUnavailableDescription"
    : "failedDescription";
}
