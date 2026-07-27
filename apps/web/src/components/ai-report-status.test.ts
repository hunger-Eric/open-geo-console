import { describe, expect, it } from "vitest";
import { getUnavailableDescriptionKey } from "./ai-report-status-copy";

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
