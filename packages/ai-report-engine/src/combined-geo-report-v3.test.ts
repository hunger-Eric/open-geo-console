import { describe, expect, it } from "vitest";
import {
  COMBINED_GEO_REPORT_V3_CONTRACT,
  COMBINED_GEO_REPORT_V3_VERSION,
  hashCombinedGeoReportV3ReceiptExcludedProjection,
  parseCombinedGeoReportV3
} from "./combined-geo-report-v3";
import { hashReportSemanticReviewValue } from "./report-semantic-review";

describe("combined GEO report V3 contract", () => {
  it("keeps V3 identity prospective and explicit", () => {
    expect(COMBINED_GEO_REPORT_V3_VERSION).toBe(3);
    expect(COMBINED_GEO_REPORT_V3_CONTRACT).toBe("combined_geo_report_v3");
    const value = { version: 2, artifactContract: "combined_geo_report_v2" };
    const error = (options?: { semanticValidation?: "legacy" | "deferred" }) => {
      try { parseCombinedGeoReportV3(value, options); } catch (caught) { return (caught as Error).message; }
      throw new Error("Expected parser failure.");
    };
    expect(error({ semanticValidation: "legacy" })).toBe(error());
    expect(error({ semanticValidation: "deferred" })).toMatch(/combined_geo_report_v3/iu);
  });

  it("hashes the complete final projection with the receipt omitted and detects structural tamper", () => {
    const projection = {
      version: COMBINED_GEO_REPORT_V3_VERSION,
      artifactContract: COMBINED_GEO_REPORT_V3_CONTRACT,
      reportId: "report-1",
      nested: { count: 3, customerText: "reviewed" }
    };
    const projectionHash = hashCombinedGeoReportV3ReceiptExcludedProjection(projection);
    expect(projectionHash).toBe(hashReportSemanticReviewValue(projection));
    expect(hashCombinedGeoReportV3ReceiptExcludedProjection({
      ...projection,
      semanticReviewReceipt: {
        lifecycle: "paid_v3",
        finalReviewedReportProjectionHash: projectionHash
      }
    })).toBe(projectionHash);
    expect(hashCombinedGeoReportV3ReceiptExcludedProjection({
      ...projection,
      nested: { ...projection.nested, count: 4 }
    })).not.toBe(projectionHash);
  });

  it("does not let a receipt-shaped object select deferred parsing", () => {
    const invalid = {
      version: 2,
      artifactContract: "combined_geo_report_v2",
      semanticReviewReceipt: {
        version: "report-semantic-review-v1",
        lifecycle: "paid_v3"
      }
    };
    const error = (options?: { semanticValidation?: "legacy" | "deferred" }) => {
      try { parseCombinedGeoReportV3(invalid, options); } catch (caught) { return (caught as Error).message; }
      throw new Error("Expected parser failure.");
    };
    expect(error()).toBe(error({ semanticValidation: "legacy" }));
    expect(error({ semanticValidation: "deferred" })).toMatch(/combined_geo_report_v3/iu);
  });
});
