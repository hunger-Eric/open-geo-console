import { describe, expect, it } from "vitest";
import { parseRecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { createTestSourceForensicReport } from "./testing";
import { buildPublicSourceForensicReport, type PublicSourceForensicReportBuilderInput } from "./report-builder";

describe("public-source forensics report builder", () => {
  it("builds a deterministic, evidence-bound absence report without model attribution", () => {
    const report = createTestSourceForensicReport();
    expect(parseRecommendationForensicReportV2(report)).toEqual(report);
    expect(report.executivePriorities).toHaveLength(3);
    expect(report.vendorTaskPackage.tasks).toHaveLength(3);
    expect(report.customerCostDisclosure).toEqual({ freshness: "fresh", collectedNewObservation: true });
    expect(JSON.stringify(report)).not.toMatch(/ChatGPT|Perplexity|recommended this company/i);
  });

  it("accepts a language-only website appendix locale under a regional public-search locale", () => {
    const report = createTestSourceForensicReport();
    const regionalized = {
      ...report,
      websiteFoundationAppendix: {
        ...report.websiteFoundationAppendix,
        provenance: { ...report.websiteFoundationAppendix.provenance, locale: "zh" }
      }
    };

    expect(parseRecommendationForensicReportV2(regionalized)).toEqual(regionalized);
  });

  it("keeps omitted and explicit legacy builder results identical and exposes a pure deferred parse seam", () => {
    const report = createTestSourceForensicReport();
    const input: PublicSourceForensicReportBuilderInput = {
      reportId: report.reportId,
      jobId: report.jobId,
      targetUrl: report.targetUrl,
      locale: report.locale,
      region: report.region,
      generatedAt: report.generatedAt,
      evidenceCutoffAt: report.evidenceCutoffAt,
      questions: report.questions,
      fanouts: report.fanouts,
      authority: report.authority,
      snapshotRefs: report.snapshotRefs,
      coverage: report.coverage,
      sourceGraph: report.sourceGraph,
      websiteFoundationAppendix: report.websiteFoundationAppendix,
      commercialOutcome: report.commercialOutcome,
      cost: {
        searchCostMicros: 10,
        retrievalCostMicros: 20,
        synthesisCostMicros: 0,
        artifactCostMicros: 5,
        deliveryCostMicros: 5,
        allocatedSharedCostMicros: 0,
        avoidedCostMicros: 0,
        priceMicros: 100,
        refundMicros: 0
      }
    };
    expect(buildPublicSourceForensicReport({ ...input, semanticValidation: "legacy" }))
      .toEqual(buildPublicSourceForensicReport(input));
    expect(buildPublicSourceForensicReport({ ...input, semanticValidation: "deferred" }))
      .toEqual(buildPublicSourceForensicReport(input));
  });
});
