import { buildPublicSourceEvidenceGraph } from "@open-geo-console/citation-intelligence";
import { createSearchQueryFanout, generateCanonicalBuyerQuestions } from "@open-geo-console/public-search-observer";
import { AI_WEBSITE_REPORT_VERSION, type AiWebsiteReportV1, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { createLogisticsPublicSourceFixture } from "../../../../packages/citation-intelligence/src/public-source-testing";
import { buildPublicSourceForensicReport } from "./report-builder";

export function createTestSourceForensicReport(identity: { reportId?: string; jobId?: string } = {}): RecommendationForensicReportV2 {
  const fixture = createLogisticsPublicSourceFixture();
  const baseGraph = buildPublicSourceEvidenceGraph(fixture);
  const surface = fixture.observations[0]!.surface;
  const questions = generateCanonicalBuyerQuestions({ locale: surface.locale, region: surface.region,
    categoryEvidence: [{ value: "跨境货运", confidence: "high", sourceId: "website-foundation" }], broadCategory: "物流服务", excludedIdentities: [] });
  const fanouts = questions.questions.map((question) => createSearchQueryFanout({ question, surface }));
  const queries = fanouts.flatMap((fanout) => fanout.queries.map((query) => ({ fanout, query })));
  const graph = { ...baseGraph, dimensions: { ...baseGraph.dimensions,
    exactQueries: queries.map(({ query }) => query.exactQuery), queryVariantIds: queries.map(({ query }) => query.id) } };
  return buildPublicSourceForensicReport({ reportId: identity.reportId ?? "report-v2", jobId: identity.jobId ?? "job-v2",
    targetUrl: "https://customer-logistics.example/", locale: surface.locale, region: surface.region,
    generatedAt: "2030-01-02T00:00:00.000Z", evidenceCutoffAt: "2030-01-02T00:00:00.000Z", questions, fanouts,
    authority: { authorityId: "authority-v2", environment: "test", surface, active: true, certifiedAt: "2030-01-01T00:00:00.000Z",
      evidenceReference: "fixture://review", supportedLocales: [surface.locale], supportedRegions: [surface.region] },
    snapshotRefs: queries.map(({ fanout, query }, index) => ({ snapshotId: `snapshot-${index}`, questionId: fanout.questionId,
      queryVariantId: query.id, observationId: `observation-${index}`, freshness: "fresh", observedAt: "2030-01-01T00:00:00.000Z", collectedForThisRun: index === 0 })),
    coverage: { status: "complete", completedQueryCount: queries.length, expectedQueryCount: queries.length,
      observedResultCount: fixture.observations.reduce((sum, item) => sum + item.results.length, 0), surfaceDomainCount: 8, reasons: [] },
    sourceGraph: graph, websiteFoundationAppendix: website(), commercialOutcome: "completed",
    cost: { searchCostMicros: 10, retrievalCostMicros: 20, synthesisCostMicros: 0, artifactCostMicros: 5,
      deliveryCostMicros: 5, allocatedSharedCostMicros: 0, avoidedCostMicros: 0, priceMicros: 100, refundMicros: 0 } });
}

function website(): AiWebsiteReportV1 {
  const evidence = [{ url: "https://customer-logistics.example/", quote: "客户企业提供跨境货运服务。" }];
  return { version: AI_WEBSITE_REPORT_VERSION, tier: "deep", targetUrl: "https://customer-logistics.example/",
    organizationProfile: { organizationName: "客户企业", brandNames: ["客户企业"], summary: "跨境货运。", businessModel: "服务",
      productsAndServices: ["跨境货运"], targetAudiences: ["出口企业"], marketsAndRegions: [], legalEntity: null,
      identityConsistency: "一致", ownershipVerification: "not-performed", confidence: "high", evidence },
    executiveSummary: { overview: "基础信息可用。", strengths: [], keyRisks: [], topPriorities: [] },
    dimensionScores: ["organizationClarity","informationArchitecture","contentCitability","trustEvidence","entityConsistency","geoUnderstandability"]
      .map((dimension) => ({ dimension, score: 70, explanation: "有证据。", confidence: "high", evidence })) as AiWebsiteReportV1["dimensionScores"],
    pageTypeAnalyses: [], findings: [{ id: "finding-1", title: "公开事实需强化", severity: "opportunity", impact: "影响核验。", evidence, recommendation: "补强事实。", confidence: "high" }],
    roadmap: { immediate: [], nextPhase: [], ongoing: [] }, coverage: { discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0, samplingMethod: "深度抓取", pageTypesCovered: ["home"], limitations: [] },
    provenance: { reportVersion: 1, modelId: "fixture", promptVersion: "v1", locale: "zh-CN", generatedAt: "2030-01-01T00:00:00.000Z", contentHash: "fixture" } };
}
