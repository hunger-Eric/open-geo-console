import { describe, expect, it } from "vitest";
import { APPROVED_REPLACEMENT_TARGET, prepareApprovedReportReplacement, resumeApprovedReplacementModelRepair } from "./report-replacement-fulfillments";

describe("approved replacement fulfillment guard", () => {
  it("is bound to the one approved paid failure lineage", () => {
    expect(APPROVED_REPLACEMENT_TARGET).toEqual({
      orderId: "92eaa1f9-5033-4184-8667-bd4a64fef55a",
      reportId: "f764a24d-2bd8-4714-99fc-c7ad754753ff",
      originalFailedJobId: "bd55fb27-8f29-4f72-81c6-bd69d60eba89",
      failedArtifactRevisionId: "0908fe12-e434-4242-a5ae-8608f3edb368",
      questionSetId: "business-question-set-109376f4c5c88364b7eee20bc4b096b487a222601533a2e3b591a85765de5726"
    });
  });

  it("fails closed before database access without confirmation or a safe authorization reference", async () => {
    await expect(prepareApprovedReportReplacement({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
    await expect(prepareApprovedReportReplacement({ confirm: true, authorizationRef: "x" })).rejects.toThrow("authorization reference");
    await expect(resumeApprovedReplacementModelRepair({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
  });
});
