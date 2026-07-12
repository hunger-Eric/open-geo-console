import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecommendationPrivateReportArtifactModel } from "@/report/artifact-model";
import { RecommendationReportArtifact } from "./recommendation-report-artifact";

describe("RecommendationReportArtifact", () => {
  it("renders the executive sequence before the vendor package and website-score appendix", () => {
    const html = renderToStaticMarkup(<RecommendationReportArtifact model={model()} />);
    expect(html.indexOf("Executive verdict")).toBeLessThan(html.indexOf("Market questions"));
    expect(html.indexOf("Market questions")).toBeLessThan(html.indexOf("Multi-engine observation matrix"));
    expect(html.indexOf("Three priority investments")).toBeLessThan(html.indexOf("Independent vendor task package"));
    expect(html.indexOf("Independent vendor task package")).toBeLessThan(html.indexOf("Website foundation appendix"));
    expect(html.indexOf("70/100")).toBeGreaterThan(html.indexOf("Website foundation appendix"));
    expect(html).toContain("1 executed engine surfaces × 1 questions; 1/2 observation cells succeeded.");
    expect(html).toContain("Unknown: provider-unavailable");
    expect(html).toContain("Observed citation association; this does not mean the source caused a ranking.");
    expect(html).toContain("Evidence grades");
    expect(html).toContain("Unknown: unavailable source, ambiguous identity, or no inspectable evidence.");
    expect(html).toContain("<caption>");
  });
});

function model(): RecommendationPrivateReportArtifactModel {
  return {
    productContract: "recommendation_forensics_v1", reportId: "report-1", locale: "en",
    technicalReport: { url: "https://customer.example.com", pages: [] } as RecommendationPrivateReportArtifactModel["technicalReport"],
    evidenceAssets: [],
    recommendationReport: {
      reportId: "report-1", jobId: "job-1", targetUrl: "https://customer.example.com",
      executiveVerdict: { summary: "Customer absent in observed results.", customerMentioned: "no", primaryGap: "Third-party evidence gap.", coverageOutcome: "completed_limited", evidenceCellIds: ["cell-1"] },
      generatedQuestions: { version: "purchase-v1", organizationName: "Customer", brandAliases: [], confidence: "high", limitations: [], questions: [{ id: "q1", locale: "en", category: "supplier_selection", exactText: "Which supplier is suitable?", inferenceBasis: ["Public service evidence"] }] },
      answerSnapshotMatrix: { run: { id: "run-1", reportId: "report-1", jobId: "job-1", locale: "en", region: "global", questionSetVersion: "purchase-v1", startedAt: "2030-01-01T00:00:00Z" }, commercialCoverage: { outcome: "completed_limited", certifiedProviderCount: 1, qualifyingProviderCount: 1, successfulQuestionCount: 1, reasons: [] }, cells: [
        { id: "cell-1", runId: "run-1", questionId: "q1", surface: { providerId: "engine", productId: "search", modelId: "v1", collectionSurface: "developer_api", locale: "en", region: "global", certificationState: "certified" }, status: "succeeded", answerText: "Atlas is a candidate.", responseHash: "a".repeat(64), recommendationOutcome: "recommendations_present", sources: [{ url: "https://editorial.example/a", title: "Atlas review", providerOrder: 0, providerMetadata: {} }], executedAt: "2030-01-01T00:00:01Z", executionDurationMs: 1 },
        { id: "cell-2", runId: "run-1", questionId: "q1", surface: { providerId: "engine", productId: "search", modelId: "v1", collectionSurface: "developer_api", locale: "en", region: "global", certificationState: "certified" }, status: "failed", errorClass: "provider-unavailable", executedAt: "2030-01-01T00:00:02Z", executionDurationMs: 1 }
      ] },
      recommendedEntities: [{ entityId: "atlas", name: "Atlas", resolution: { status: "unresolved", candidateEntityIds: [] }, signals: [{ cellId: "cell-1", kind: "direct_candidate", supportingQuote: "Atlas is a candidate." }] }],
      citationSources: [{ id: "source-1", cellId: "cell-1", url: "https://editorial.example/a", title: "Atlas review", category: "earned_editorial", providerOrder: 0, retrieval: { state: "inaccessible", mapping: "none", supportedEntityIds: [] } }],
      evidenceGrades: [{ evidenceId: "ev-1", citationSourceId: "source-1", cellId: "cell-1", grade: "D" }],
      sourceCategoryBreakdown: [{ category: "earned_editorial", sourceCount: 1, citationSourceIds: ["source-1"] }], customerVsCompetitorGaps: [],
      homepageVsFullSiteBlindSpot: { homepageSummary: "Homepage.", fullSiteSummary: "Full site.", omissions: [], contradictions: [], confidenceChanges: [], limitations: [] },
      executivePriorities: [1,2,3].map((order) => ({ order, title: `Priority ${order}`, rationale: "Evidence backed.", evidenceCellIds: ["cell-1"], websiteFindingIds: [] })) as RecommendationPrivateReportArtifactModel["recommendationReport"]["executivePriorities"],
      vendorTaskPackage: { version: "vendor-task-v1", tasks: [{ id: "task-1", vendor: "website", title: "Correct facts", rationale: "Observed gap.", actions: ["Align facts."], acceptanceCriteria: ["Facts match."], evidenceCellIds: ["cell-1"], retestQuestionIds: ["q1"] }] },
      websiteFoundationAppendix: { organizationProfile: { organizationName: "Customer" }, executiveSummary: { overview: "Foundation summary." }, dimensionScores: [{ dimension: "organizationClarity", score: 70, explanation: "Grounded." }], findings: [] } as RecommendationPrivateReportArtifactModel["recommendationReport"]["websiteFoundationAppendix"],
      provenanceAndLimitations: { generatedAt: "2030-01-01T00:00:02Z", locale: "en", region: "global", limitations: ["Unknown stays visible."], methodology: "Observed only." }
    } as RecommendationPrivateReportArtifactModel["recommendationReport"]
  };
}
