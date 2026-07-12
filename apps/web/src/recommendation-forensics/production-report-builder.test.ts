import { describe, expect, it } from "vitest";
import {
  classifyCommercialCoverage,
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  generatePurchaseQuestions,
  type AnswerEngineSurface,
  type AnswerSnapshotRunContract,
  type CertificationAuthoritySnapshot
} from "@open-geo-console/answer-engine-observer";
import {
  AI_WEBSITE_REPORT_VERSION,
  parseRecommendationForensicReportV1,
  type AiWebsiteReportV1
} from "@open-geo-console/ai-report-engine";
import { ProductionRecommendationReportBuilder } from "./production-report-builder";

describe("ProductionRecommendationReportBuilder", () => {
  it("builds a parser-valid, traceable bilingual-safe V1 from persisted observations", async () => {
    const input = fixtureInput();
    const report = await new ProductionRecommendationReportBuilder().build(input);
    const parsed = parseRecommendationForensicReportV1(report, {
      certificationAuthority: input.certificationAuthority,
      sourceClassificationAuthority: input.sourceClassificationAuthority
    });

    expect(parsed.answerSnapshotMatrix.commercialCoverage.outcome).toBe("qualified");
    expect(parsed.executivePriorities).toHaveLength(3);
    expect(parsed.vendorTaskPackage.tasks.map((task) => task.vendor)).toEqual(expect.arrayContaining([
      "website", "content", "seo", "communications", "cross-functional"
    ]));
    expect(parsed.recommendedEntities.flatMap((entity) => entity.signals)).not.toHaveLength(0);
    for (const priority of parsed.executivePriorities) {
      expect(priority.evidenceCellIds.length + priority.websiteFindingIds.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(parsed)).not.toMatch(/caused (?:the )?(?:model|ranking)|guarantee(?:d|s)? ranking/i);
  });

  it("returns a truthful parser-valid failed report without inventing provider evidence", async () => {
    const input = fixtureInput();
    input.snapshotBundle.runs[0]!.cells = input.snapshotBundle.runs[0]!.cells.map((cell) => ({
      id: cell.id,
      runId: cell.runId,
      questionId: cell.questionId,
      surface: cell.surface,
      status: "failed" as const,
      executedAt: cell.executedAt,
      executionDurationMs: cell.executionDurationMs,
      errorClass: "provider-unavailable" as const,
      attemptCount: 1,
      failureDisposition: "retry_exhausted" as const
    }));
    input.coverage = classifyCommercialCoverage(
      input.questions.questions,
      input.snapshotBundle.runs[0]!.cells,
      input.certificationAuthority
    );
    input.sourceClassificationAuthority.context.competitorRegistrableDomains = [];
    const report = await new ProductionRecommendationReportBuilder().build(input);
    const parsed = parseRecommendationForensicReportV1(report, {
      certificationAuthority: input.certificationAuthority,
      sourceClassificationAuthority: input.sourceClassificationAuthority
    });
    expect(parsed.executiveVerdict).toMatchObject({ customerMentioned: "unknown", coverageOutcome: "failed" });
    expect(parsed.recommendedEntities).toEqual([]);
    expect(parsed.vendorTaskPackage.tasks).toEqual([]);
  });

  it("keeps executive and vendor composition in the persisted Chinese locale", async () => {
    const input = fixtureInput("zh");
    const report = await new ProductionRecommendationReportBuilder().build(input);
    const parsed = parseRecommendationForensicReportV1(report, {
      certificationAuthority: input.certificationAuthority,
      sourceClassificationAuthority: input.sourceClassificationAuthority
    });
    expect(parsed.provenanceAndLimitations.locale).toBe("zh");
    expect(parsed.executivePriorities[0].title).toBe("统一官方事实与实体身份");
    expect(parsed.vendorTaskPackage.tasks[0]?.title).toBe("修正官方事实与实体身份");
    expect(parsed.recommendedEntities.map(({ name }) => name)).toEqual(expect.arrayContaining(["Atlas Example", "Beacon Example"]));
  });
});

function fixtureInput(locale: "en" | "zh" = "en") {
  const websiteFoundation = websiteReport(locale);
  const questions = generatePurchaseQuestions({
    locale, organizationName: "Customer Example", brandAliases: ["Customer Co"],
    categories: ["freight forwarding"], capabilities: ["freight forwarding"],
    audiences: ["exporters"], useCases: ["international shipping"],
    sourceUrls: ["https://customer.example.com"]
  });
  const surfaces: AnswerEngineSurface[] = ["engine-a", "engine-b"].map((providerId) => ({
    providerId, productId: "web-search", modelId: "model-v1", collectionSurface: "developer_api",
    locale, region: "global", certificationState: "certified"
  }));
  const run: AnswerSnapshotRunContract = {
    id: "run-1", reportId: "report-1", jobId: "job-1", locale, region: "global",
    questionSetVersion: questions.version, startedAt: "2030-01-01T00:00:00.000Z"
  };
  const cells = questions.questions.flatMap((question, questionIndex) => surfaces.map((surface, surfaceIndex) => {
    const competitor = surfaceIndex === 0 ? "Atlas Example" : "Beacon Example";
    const answerText = locale === "zh"
      ? `${competitor} 是有力候选。`
      : `${competitor} is a strong candidate for international freight forwarding.`;
    const id = createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface });
    const url = `https://${competitor === "Atlas Example" ? "atlas" : "beacon"}.example.org/review-${questionIndex}`;
    return {
      id, runId: run.id, questionId: question.id, surface, status: "succeeded" as const,
      answerText, responseHash: createAnswerResponseHash(answerText), recommendationOutcome: "recommendations_present" as const,
      executedAt: `2030-01-01T00:0${questionIndex + 1}:0${surfaceIndex}.000Z`, executionDurationMs: 20,
      sources: [{
        id: `source-${id}`, url, title: `${competitor} independent review`, providerOrder: 0,
        providerMetadata: {}, evidence: {
          id: `evidence-${id}`, sourceId: `source-${id}`, category: "earned_editorial" as const,
          retrievalState: "available" as const, excerpt: `${competitor} provides documented international freight services.`,
          excerptHash: "a".repeat(64), contentHash: sha256(`content-${id}`), grade: "B" as const,
          retrievedAt: "2030-01-01T01:00:00.000Z", expiresAt: "2030-02-01T01:00:00.000Z"
        }
      }]
    };
  }));
  const certificationAuthority: CertificationAuthoritySnapshot = {
    authorityVersion: "cert-v1", capturedAt: "2030-01-01T00:00:00.000Z",
    certifications: surfaces.map((surface) => ({
      surface,
      evidence: { certifiedAt: "2029-12-31T00:00:00.000Z", environment: "protected_staging", evidenceReference: `acceptance/${surface.providerId}` }
    }))
  };
  return {
    reportId: "report-1", jobId: "job-1", targetUrl: "https://customer.example.com",
    websiteFoundation, questions, snapshotBundle: { jobId: "job-1", runs: [{ run, cells }] },
    coverage: classifyCommercialCoverage(questions.questions, cells, certificationAuthority),
    certificationAuthority,
    sourceClassificationAuthority: {
      authorityVersion: "source-v1", capturedAt: "2030-01-01T00:00:00.000Z",
      context: {
        customerRegistrableDomain: "customer.example.com",
        competitorRegistrableDomains: ["atlas.example.org", "beacon.example.org"],
        knownDomains: {}
      }
    }
  };
}

function sha256(value: string) {
  return createAnswerResponseHash(value);
}

function websiteReport(locale: "en" | "zh" = "en"): AiWebsiteReportV1 {
  const evidence = [{ url: "https://customer.example.com", quote: "Customer Example provides freight services." }];
  return {
    version: AI_WEBSITE_REPORT_VERSION, tier: "deep", targetUrl: "https://customer.example.com",
    organizationProfile: {
      organizationName: "Customer Example", brandNames: ["Customer Example", "Customer Co"], summary: "Freight services.",
      businessModel: "Services", productsAndServices: ["Freight forwarding"], targetAudiences: ["Exporters"],
      marketsAndRegions: [], legalEntity: null, identityConsistency: "Consistent public identity.",
      ownershipVerification: "not-performed", confidence: "high", evidence
    },
    executiveSummary: { overview: "Clear service scope.", strengths: [], keyRisks: [], topPriorities: [] },
    dimensionScores: ["organizationClarity", "informationArchitecture", "contentCitability", "trustEvidence", "entityConsistency", "geoUnderstandability"]
      .map((dimension) => ({ dimension, score: 70, explanation: "Grounded.", confidence: "high", evidence })) as AiWebsiteReportV1["dimensionScores"],
    pageTypeAnalyses: [], findings: [{
      id: "finding-1", title: "Website evidence finding", severity: "opportunity", impact: "Public evidence can be clearer.",
      evidence, recommendation: "Clarify the public evidence.", confidence: "high"
    }],
    roadmap: { immediate: [], nextPhase: [], ongoing: [] },
    coverage: { discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0, samplingMethod: "Deep crawl", pageTypesCovered: ["home"], limitations: [] },
    provenance: { reportVersion: 1, modelId: "fixture-model", promptVersion: "v1", locale, generatedAt: "2030-01-01T00:00:00.000Z", contentHash: "fixture-hash" }
  };
}
