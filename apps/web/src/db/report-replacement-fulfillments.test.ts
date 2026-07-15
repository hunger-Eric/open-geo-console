import { describe, expect, it } from "vitest";
import { APPROVED_REPLACEMENT_TARGET, prepareApprovedReportReplacement, resumeApprovedReplacementModelRepair } from "./report-replacement-fulfillments";

describe("approved replacement fulfillment guard", () => {
  it("is bound to the one approved paid failure lineage", () => {
    expect(APPROVED_REPLACEMENT_TARGET).toEqual({
      orderId: "98974ea3-369e-43bc-b84b-602d96382b02",
      reportId: "0631932e-72b8-4c6f-b492-820e2533e23e",
      originalFailedJobId: "9f3221a2-1a3b-47c8-9c3e-eda2b8be52dd",
      failedArtifactRevisionId: "cf76433c-c1de-43b6-ba75-cf3fc98500d5",
      questionSetId: "business-question-set-2b296a7e7976b0fc47a48a0c0a9107ac35c7be74ba60fd23f7f9ecea3fe6c265"
    });
  });

  it("fails closed before database access without confirmation or a safe authorization reference", async () => {
    await expect(prepareApprovedReportReplacement({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
    await expect(prepareApprovedReportReplacement({ confirm: true, authorizationRef: "x" })).rejects.toThrow("authorization reference");
    await expect(resumeApprovedReplacementModelRepair({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
  });
});
