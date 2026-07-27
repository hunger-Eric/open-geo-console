import { describe, expect, it } from "vitest";
import {
  COMBINED_GEO_REPORT_V3_CONTRACT,
  COMBINED_GEO_REPORT_V3_VERSION,
  parseCombinedGeoReportV3
} from "./combined-geo-report-v3";

describe("combined GEO report V3 contract", () => {
  it("keeps V3 identity prospective and explicit", () => {
    expect(COMBINED_GEO_REPORT_V3_VERSION).toBe(3);
    expect(COMBINED_GEO_REPORT_V3_CONTRACT).toBe("combined_geo_report_v3");
    expect(() => parseCombinedGeoReportV3({ version: 2, artifactContract: "combined_geo_report_v2" })).toThrow(/combined_geo_report_v3/i);
  });
});
