import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { shouldShowCommercialCheckout, type PublicJobStatus } from "./ai-report-status";
import { getProgressStageDescription, getUnavailableDescriptionKey } from "./ai-report-status-copy";

function commercePayload(state: PublicJobStatus["state"] | null, overrides: {
  hasAiReport?: boolean;
  hasDeepAccess?: boolean;
} = {}) {
  return {
    hasAiReport: overrides.hasAiReport ?? true,
    hasDeepAccess: overrides.hasDeepAccess ?? false,
    job: state === null ? null : { state } as PublicJobStatus
  };
}

describe("AI report commerce visibility", () => {
  it("hides checkout until the free report is ready", () => {
    expect(shouldShowCommercialCheckout(null, true)).toBe(false);
    expect(shouldShowCommercialCheckout(commercePayload("generating"), true)).toBe(false);
    expect(shouldShowCommercialCheckout(commercePayload("unavailable"), true)).toBe(false);
    expect(shouldShowCommercialCheckout(commercePayload("completed", { hasAiReport: false }), true)).toBe(false);
  });

  it("shows checkout only for a ready free report without deep access", () => {
    expect(shouldShowCommercialCheckout(commercePayload("completed"), true)).toBe(true);
    expect(shouldShowCommercialCheckout(commercePayload("completed_limited"), true)).toBe(true);
    expect(shouldShowCommercialCheckout(commercePayload(null), true)).toBe(true);
    expect(shouldShowCommercialCheckout(commercePayload("completed", { hasDeepAccess: true }), true)).toBe(false);
    expect(shouldShowCommercialCheckout(commercePayload("completed"), false)).toBe(false);
  });
});

describe("AI report unavailable copy", () => {
  it("keeps a completed technical report available when only the free AI preview is missing", () => {
    expect(getUnavailableDescriptionKey({ tier: "preview", refundState: null }, true))
      .toBe("previewUnavailableDescription");
  });

  it("keeps the refunded failure copy for an unavailable paid report", () => {
    expect(getUnavailableDescriptionKey({ tier: "deep", refundState: "refunded" }, true))
      .toBe("failedDescription");
  });
});

describe("AI report progress copy", () => {
  const dictionary = getDictionary("zh");

  it("describes the persisted processing stage", () => {
    expect(getProgressStageDescription("fetching", dictionary))
      .toBe(dictionary.aiReport.stageDescriptions.fetching);
    expect(getProgressStageDescription("analyzing", dictionary))
      .toBe(dictionary.aiReport.stageDescriptions.analyzing);
  });

  it("falls back safely for an unknown historical stage", () => {
    expect(getProgressStageDescription("historical_stage", dictionary))
      .toBe(dictionary.aiReport.waitingDescription);
  });
});
