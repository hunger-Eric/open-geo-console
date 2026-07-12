import { describe, expect, it } from "vitest";
import {
  classifyCommercialCoverage,
  generatePurchaseQuestions,
  type AnswerSnapshotRunContract
} from "@open-geo-console/answer-engine-observer";
import {
  AI_WEBSITE_REPORT_VERSION,
  RECOMMENDATION_FORENSIC_REPORT_VERSION,
  RecommendationForensicReportValidationError,
  parseRecommendationForensicReportV1,
  type AiWebsiteReportV1,
  type RecommendationForensicReportV1
} from "./index";

const questionSet = generatePurchaseQuestions({
  locale: "en", categories: ["freight forwarding"], capabilities: ["customs clearance"],
  sourceUrls: ["https://customer.example.com"]
});

const snapshotRun: AnswerSnapshotRunContract = {
  id: "run-1", reportId: "report-1", jobId: "job-1", locale: "en", region: "global",
  questionSetVersion: questionSet.version, startedAt: "2026-07-12T00:00:00.000Z"
};

function websiteFoundation(): AiWebsiteReportV1 {
  const evidence = [{ url: "https://customer.example.com", quote: "Customer Example provides freight services." }];
  return {
    version: AI_WEBSITE_REPORT_VERSION,
    tier: "deep",
    targetUrl: "https://customer.example.com",
    organizationProfile: {
      organizationName: "Customer Example", brandNames: ["Customer Example"], summary: "Freight services.",
      businessModel: "Services", productsAndServices: ["Freight forwarding"], targetAudiences: ["Exporters"],
      marketsAndRegions: [], legalEntity: null, identityConsistency: "Consistent public identity.",
      ownershipVerification: "not-performed", confidence: "high", evidence
    },
    executiveSummary: { overview: "Clear service scope.", strengths: [], keyRisks: [], topPriorities: [] },
    dimensionScores: [
      "organizationClarity", "informationArchitecture", "contentCitability",
      "trustEvidence", "entityConsistency", "geoUnderstandability"
    ].map((dimension) => ({ dimension, score: 70, explanation: "Grounded.", confidence: "high", evidence })) as AiWebsiteReportV1["dimensionScores"],
    pageTypeAnalyses: [], findings: [], roadmap: { immediate: [], nextPhase: [], ongoing: [] },
    coverage: {
      discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0,
      samplingMethod: "Deep crawl", pageTypesCovered: ["home"], limitations: []
    },
    provenance: {
      reportVersion: 1, modelId: "fixture-model", promptVersion: "ai-website-report-v1",
      locale: "en", generatedAt: "2026-07-12T00:00:00.000Z", contentHash: "fixture-hash"
    }
  };
}

function validReport(): RecommendationForensicReportV1 {
  const snapshotCells: RecommendationForensicReportV1["snapshotCells"] = [];
  const certifiedSurfaces: RecommendationForensicReportV1["certifiedSurfaces"] = [];
  return {
    version: RECOMMENDATION_FORENSIC_REPORT_VERSION,
    reportId: "report-1", jobId: "job-1", targetUrl: "https://customer.example.com", locale: "en",
    generatedAt: "2026-07-12T00:01:00.000Z", questionSet, snapshotRun, snapshotCells, certifiedSurfaces,
    commercialCoverage: classifyCommercialCoverage(questionSet.questions, snapshotCells, certifiedSurfaces),
    recommendationSignals: [], entityResolutions: [], citationEvidence: [], citationOpportunities: [],
    websiteFoundationAppendix: websiteFoundation(), limitations: ["No certified live observation was executed."]
  };
}

describe("RecommendationForensicReportV1", () => {
  it("is an independent top-level contract with the legacy website report only as an appendix", () => {
    const report = validReport();
    expect(parseRecommendationForensicReportV1(report)).toEqual(report);
    expect(() => parseRecommendationForensicReportV1(websiteFoundation())).toThrow(
      RecommendationForensicReportValidationError
    );
  });

  it("rejects a commercial outcome that is not supported by certified live coverage", () => {
    const report = validReport();
    expect(() => parseRecommendationForensicReportV1({
      ...report,
      commercialCoverage: { ...report.commercialCoverage, outcome: "qualified" }
    })).toThrow(/commercialCoverage/i);
  });

  it("rejects cells outside the report run and question set", () => {
    const report = validReport();
    expect(() => parseRecommendationForensicReportV1({
      ...report,
      snapshotRun: { ...report.snapshotRun, reportId: "other-report" }
    })).toThrow(/snapshotRun/i);
  });
});
