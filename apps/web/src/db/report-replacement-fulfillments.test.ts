import { describe, expect, it } from "vitest";
import { APPROVED_REPLACEMENT_TARGET, prepareApprovedReportReplacement, resumeApprovedReplacementModelRepair } from "./report-replacement-fulfillments";

describe("approved replacement fulfillment guard", () => {
  it("is bound to the one approved paid failure lineage", () => {
    expect(APPROVED_REPLACEMENT_TARGET).toEqual({
      orderId: "c631f80e-4f6e-44a4-b0de-42aee8559c51",
      reportId: "4b4e71b8-c130-4c83-8d4a-e3787ded7009",
      originalFailedJobId: "146da7a2-b28b-4925-af89-0a30c9af0c23",
      failedArtifactRevisionId: "0c41d018-65aa-42e9-84c3-9953af4b60c8",
      questionSetId: "business-question-set-ba934fe710d804f389bf16c240f3fa23c7127e64f7f50d368e17f02c888baa6e"
    });
  });

  it("fails closed before database access without confirmation or a safe authorization reference", async () => {
    await expect(prepareApprovedReportReplacement({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
    await expect(prepareApprovedReportReplacement({ confirm: true, authorizationRef: "x" })).rejects.toThrow("authorization reference");
    await expect(resumeApprovedReplacementModelRepair({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
  });
});
