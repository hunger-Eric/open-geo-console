import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { RecommendationPrivateReportArtifactModel } from "@/report/artifact-model";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { RecommendationReportArtifact } from "./recommendation-report-artifact";

describe("RecommendationReportArtifact", () => {
  it("renders the executive sequence before the vendor package and website-score appendix", () => {
    const html = renderToStaticMarkup(createElement(RecommendationReportArtifact, { model: model() }));
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
    expect(html).toContain("Customer vs competitor gaps");
    expect(html).toContain("Technical score");
    expect(html).toContain("Website foundation roadmap");
    expect(html).toContain("Certification and methodology provenance");
    expect(html).toContain("cert-evidence/engine");
    expect(html).toContain("/reports/report-1/recommendation-report.html");
    expect(html).toContain("/api/reports/report-1/artifacts/recommendation-report.pdf");
  });

  it("allows forensic artifact descendants and long evidence text to shrink on narrow screens", () => {
    expect(ARTIFACT_CSS).toContain(".recommendation-artifact,.recommendation-artifact *{min-width:0}");
    expect(ARTIFACT_CSS).toContain(".recommendation-artifact :where(h1,h2,h3,h4,p,li,dd,dt,strong,small,span,a,code){white-space:normal;overflow-wrap:anywhere;word-break:break-word}");
    expect(ARTIFACT_CSS).not.toContain("overflow-x:hidden");
  });
});

function model(): RecommendationPrivateReportArtifactModel {
  return {
    productContract: "recommendation_forensics_v1", reportId: "report-1", locale: "en",
    technicalReport: { url: "https://customer.example.com", scannedAt: "2030-01-01T00:00:00Z", score: 65, pages: [{ url: "https://customer.example.com", status: 200, h1: ["Customer"], h2: [], hasOpenGraph: true, hasJsonLd: false, readableTextLength: 100, internalLinks: 2 }], findings: [{ id: "technical-1", severity: "info", title: "Technical finding", description: "Technical evidence.", recommendation: "Review the evidence." }], recommendations: [], machineReadableAssets: { robotsTxt: { url: "https://customer.example.com/robots.txt", present: true, summary: "Available" }, sitemapXml: { url: "https://customer.example.com/sitemap.xml", present: true, summary: "Available" }, llmsTxt: { url: "https://customer.example.com/llms.txt", present: false, summary: "Unavailable" } } } as RecommendationPrivateReportArtifactModel["technicalReport"],
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
      executivePriorities: [1,2,3].map((order) => ({ order, title: `Priority ${order}`, rationale: "Evidence backed.", evidenceCellIds: ["cell-1"], websiteFindingIds: [], citationSourceIds: [], gapIds: [] })) as RecommendationPrivateReportArtifactModel["recommendationReport"]["executivePriorities"],
      vendorTaskPackage: { version: "vendor-task-v1", tasks: [{ id: "task-1", vendor: "website", title: "Correct facts", rationale: "Observed gap.", actions: ["Align facts."], acceptanceCriteria: ["Facts match."], evidenceCellIds: ["cell-1"], websiteFindingIds: [], citationSourceIds: [], gapIds: ["gap-1"], retestQuestionIds: ["q1"] }] },
      websiteFoundationAppendix: { organizationProfile: { organizationName: "Customer" }, executiveSummary: { overview: "Foundation summary." }, dimensionScores: [{ dimension: "organizationClarity", score: 70, explanation: "Grounded." }], findings: [], roadmap: { immediate: [{ title: "Immediate roadmap task", rationale: "Observed foundation evidence.", actions: ["Review."], relatedFindingIds: [] }], nextPhase: [], ongoing: [] } } as RecommendationPrivateReportArtifactModel["recommendationReport"]["websiteFoundationAppendix"],
      provenanceAndLimitations: { generatedAt: "2030-01-01T00:00:02Z", locale: "en", region: "global", certificationAuthorityVersion: "cert-v1", certificationCapturedAt: "2030-01-01T00:00:00Z", certificationProvenance: [{ surfaceKey: "engine/search/v1/developer_api/en/global", evidenceReference: "cert-evidence/engine" }], sourceClassificationAuthorityVersion: "source-v1", sourceClassificationCapturedAt: "2030-01-01T00:00:00Z", limitations: ["Unknown stays visible."], methodology: "Observed only." }
    } as RecommendationPrivateReportArtifactModel["recommendationReport"]
  };
}
