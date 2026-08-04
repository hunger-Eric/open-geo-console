import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { getProgressStageDescription, getUnavailableDescriptionKey } from "./ai-report-status-copy";

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
