import { describe, expect, it } from "vitest";
import { parseRecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { createTestSourceForensicReport } from "./testing";

describe("public-source forensics report builder", () => {
  it("builds a deterministic, evidence-bound absence report without model attribution", () => {
    const report = createTestSourceForensicReport();
    expect(parseRecommendationForensicReportV2(report)).toEqual(report);
    expect(report.executivePriorities).toHaveLength(3);
    expect(report.vendorTaskPackage.tasks).toHaveLength(3);
    expect(report.customerCostDisclosure).toEqual({ freshness: "fresh", collectedNewObservation: true });
    expect(JSON.stringify(report)).not.toMatch(/ChatGPT|Perplexity|recommended this company/i);
  });
});
