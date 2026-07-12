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
  RECOMMENDATION_FORENSIC_REPORT_VERSION,
  RecommendationForensicReportValidationError,
  parseRecommendationForensicReportV1,
  type AiWebsiteReportV1,
  type RecommendationForensicReportV1
} from "./index";

const generatedQuestions = generatePurchaseQuestions({
  locale: "en", organizationName: "Customer Example", brandAliases: ["Customer Co"],
  categories: ["freight forwarding"], capabilities: ["customs clearance"],
  sourceUrls: ["https://customer.example.com"]
});

const snapshotRun: AnswerSnapshotRunContract = {
  id: "run-1", reportId: "report-1", jobId: "job-1", locale: "en", region: "global",
  questionSetVersion: generatedQuestions.version, startedAt: "2026-07-12T00:00:00.000Z"
};

const emptyAuthority: CertificationAuthoritySnapshot = {
  authorityVersion: "authority-empty-v1",
  capturedAt: "2026-07-12T00:00:30.000Z",
  certifications: []
};

function websiteFoundation(): AiWebsiteReportV1 {
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

function validReport(authority = emptyAuthority): RecommendationForensicReportV1 {
  const cells: RecommendationForensicReportV1["answerSnapshotMatrix"]["cells"] = [];
  return {
    version: RECOMMENDATION_FORENSIC_REPORT_VERSION,
    reportId: "report-1", jobId: "job-1", targetUrl: "https://customer.example.com",
    executiveVerdict: {
      summary: "No certified live recommendation observation is available.", customerMentioned: "unknown",
      primaryGap: "Certified coverage is unavailable.", evidenceCellIds: []
    },
    generatedQuestions,
    answerSnapshotMatrix: {
      run: snapshotRun, cells,
      commercialCoverage: classifyCommercialCoverage(generatedQuestions.questions, cells, authority)
    },
    recommendedEntities: [], citationSources: [], evidenceGrades: [], sourceCategoryBreakdown: [],
    customerVsCompetitorGaps: [],
    homepageVsFullSiteBlindSpot: {
      homepageSummary: "Homepage summary.", fullSiteSummary: "Full-site summary.",
      omissions: [], contradictions: [], confidenceChanges: [], limitations: []
    },
    executivePriorities: [
      { order: 1, title: "Priority 1", rationale: "Evidence-backed prioritization.", evidenceCellIds: [] },
      { order: 2, title: "Priority 2", rationale: "Evidence-backed prioritization.", evidenceCellIds: [] },
      { order: 3, title: "Priority 3", rationale: "Evidence-backed prioritization.", evidenceCellIds: [] }
    ],
    vendorTaskPackage: { version: "vendor-task-v1", tasks: [] },
    websiteFoundationAppendix: websiteFoundation(),
    provenanceAndLimitations: {
      generatedAt: "2026-07-12T00:01:00.000Z", locale: "en", region: "global",
      certificationAuthorityVersion: authority.authorityVersion,
      certificationCapturedAt: authority.capturedAt,
      certificationProvenance: [], limitations: ["No certified live provider executed."],
      methodology: "Observed recommendation outcomes only; no private ranking cause is claimed."
    }
  };
}

function reportWithCitation(): RecommendationForensicReportV1 {
  const report = validReport();
  const surface: AnswerEngineSurface = {
    providerId: "candidate", productId: "candidate-search", modelId: "candidate-model",
    collectionSurface: "developer_api", locale: "en", region: "global",
    certificationState: "candidate_uncertified"
  };
  const questionId = generatedQuestions.questions[0]!.id;
  const answerText = "Atlas Example is one candidate.";
  const cell = {
    id: createAnswerSnapshotCellId({ runId: snapshotRun.id, questionId, surface }),
    runId: snapshotRun.id, questionId, surface, status: "succeeded" as const,
    answerText, responseHash: createAnswerResponseHash(answerText),
    sources: [{
      url: "https://editorial.example.org/atlas", title: "Atlas review", providerOrder: 0,
      providerMetadata: { providerSourceId: "source-1" }
    }],
    recommendationOutcome: "recommendations_present" as const,
    executedAt: "2026-07-12T00:00:10.000Z", executionDurationMs: 100
  };
  return {
    ...report,
    executiveVerdict: { ...report.executiveVerdict, evidenceCellIds: [cell.id] },
    answerSnapshotMatrix: {
      run: snapshotRun, cells: [cell],
      commercialCoverage: classifyCommercialCoverage(generatedQuestions.questions, [cell], emptyAuthority)
    },
    recommendedEntities: [{
      entityId: "atlas", name: "Atlas Example", resolutionStatus: "resolved",
      supportingCellIds: [cell.id]
    }],
    citationSources: [{
      id: "citation-1", cellId: cell.id, url: cell.sources[0]!.url, title: cell.sources[0]!.title,
      category: "earned_editorial", providerOrder: 0,
      retrieval: {
        state: "available", retrievedAt: "2026-07-12T00:00:20.000Z", contentHash: "a".repeat(64),
        verifiedExcerpt: "Atlas Example is reviewed as a freight forwarding option.",
        mapping: "precise", supportedEntityIds: ["atlas"], answerQuote: "Atlas Example is one candidate."
      }
    }],
    evidenceGrades: [{ evidenceId: "evidence-1", citationSourceId: "citation-1", cellId: cell.id, grade: "A" }],
    sourceCategoryBreakdown: [{ category: "earned_editorial", sourceCount: 1, citationSourceIds: ["citation-1"] }]
  };
}

describe("RecommendationForensicReportV1", () => {
  it("requires the complete approved top-level contract and exactly three executive priorities", () => {
    const report = validReport();
    expect(parseRecommendationForensicReportV1(report, emptyAuthority)).toEqual(report);
    const { executiveVerdict: _missing, ...withoutVerdict } = report;
    expect(() => parseRecommendationForensicReportV1(withoutVerdict, emptyAuthority)).toThrow(/executiveVerdict/i);
    expect(() => parseRecommendationForensicReportV1({ ...report, executivePriorities: report.executivePriorities.slice(0, 2) }, emptyAuthority))
      .toThrow(/exactly three/i);
    expect(() => parseRecommendationForensicReportV1(websiteFoundation(), emptyAuthority))
      .toThrow(RecommendationForensicReportValidationError);
  });

  it("requires an external certification authority and rejects self-asserted qualification", () => {
    const report = validReport();
    expect(() => (parseRecommendationForensicReportV1 as (value: unknown, authority?: CertificationAuthoritySnapshot) => unknown)(report))
      .toThrow(/CertificationAuthority/i);
    expect(() => parseRecommendationForensicReportV1({
      ...report,
      answerSnapshotMatrix: {
        ...report.answerSnapshotMatrix,
        commercialCoverage: { ...report.answerSnapshotMatrix.commercialCoverage, outcome: "qualified" }
      }
    }, emptyAuthority)).toThrow(/commercialCoverage/i);
  });

  it("matches report certification provenance to the external authority snapshot", () => {
    const report = reportWithCitation();
    const executedSurface = report.answerSnapshotMatrix.cells[0]!.surface;
    const authority: CertificationAuthoritySnapshot = {
      authorityVersion: "authority-certified-v1",
      capturedAt: "2026-07-12T00:00:30.000Z",
      certifications: [{
        surface: { ...executedSurface, certificationState: "certified" },
        evidence: {
          environment: "protected_staging", certifiedAt: "2026-07-12T00:00:00.000Z",
          evidenceReference: "acceptance/candidate"
        }
      }]
    };
    report.answerSnapshotMatrix.commercialCoverage = classifyCommercialCoverage(
      report.generatedQuestions.questions, report.answerSnapshotMatrix.cells, authority
    );
    report.provenanceAndLimitations.certificationAuthorityVersion = authority.authorityVersion;
    report.provenanceAndLimitations.certificationCapturedAt = authority.capturedAt;
    report.provenanceAndLimitations.certificationProvenance = [{
      surfaceKey: [
        executedSurface.providerId, executedSurface.productId, executedSurface.modelId,
        executedSurface.collectionSurface, executedSurface.locale, executedSurface.region
      ].join("/"),
      evidenceReference: "acceptance/candidate"
    }];
    expect(parseRecommendationForensicReportV1(report, authority)).toEqual(report);
    report.provenanceAndLimitations.certificationProvenance[0]!.evidenceReference = "self-asserted/fake";
    expect(() => parseRecommendationForensicReportV1(report, authority)).toThrow(/certificationProvenance/i);
  });

  it("rejects generated questions containing the organization name or a brand alias", () => {
    const report = validReport();
    const poisoned = structuredClone(report);
    poisoned.generatedQuestions.questions[0]!.exactText = "Which Customer Co provider is best?";
    expect(() => parseRecommendationForensicReportV1(poisoned, emptyAuthority)).toThrow(/brand|organization/i);
  });

  it("rebuilds Grade A from a provider-returned source and verified retrieval evidence", () => {
    const report = reportWithCitation();
    expect(parseRecommendationForensicReportV1(report, emptyAuthority)).toEqual(report);

    const mismatchedSource = structuredClone(report);
    mismatchedSource.citationSources[0]!.url = "https://fabricated.example.org/not-returned";
    expect(() => parseRecommendationForensicReportV1(mismatchedSource, emptyAuthority)).toThrow(/returned source/i);

    const forgedGrade = structuredClone(report);
    forgedGrade.citationSources[0]!.retrieval.state = "inaccessible";
    expect(() => parseRecommendationForensicReportV1(forgedGrade, emptyAuthority)).toThrow(/grade|retrieval/i);

    const gradeB = reportWithCitation();
    gradeB.citationSources[0]!.retrieval.mapping = "association";
    delete gradeB.citationSources[0]!.retrieval.answerQuote;
    gradeB.evidenceGrades[0]!.grade = "B";
    expect(parseRecommendationForensicReportV1(gradeB, emptyAuthority)).toEqual(gradeB);
    gradeB.evidenceGrades[0]!.grade = "A";
    expect(() => parseRecommendationForensicReportV1(gradeB, emptyAuthority)).toThrow(/Grade must be B/i);

    const booleanForgery = reportWithCitation() as RecommendationForensicReportV1 & {
      citationSources: Array<RecommendationForensicReportV1["citationSources"][number] & {
        retrieval: RecommendationForensicReportV1["citationSources"][number]["retrieval"] & {
          directSupport: boolean;
          preciseMapping: boolean;
          relevantEntityEvidence: boolean;
          entityAmbiguous: boolean;
        };
      }>;
    };
    booleanForgery.citationSources[0]!.retrieval.mapping = "none";
    booleanForgery.citationSources[0]!.retrieval.supportedEntityIds = [];
    delete booleanForgery.citationSources[0]!.retrieval.answerQuote;
    Object.assign(booleanForgery.citationSources[0]!.retrieval, {
      directSupport: true, preciseMapping: true, relevantEntityEvidence: true, entityAmbiguous: false
    });
    expect(() => parseRecommendationForensicReportV1(booleanForgery, emptyAuthority)).toThrow(/Grade must be D/i);
  });

  it("rejects repeated-pattern occurrences outside this report", () => {
    const report = reportWithCitation();
    report.evidenceGrades[0]!.repeatedPattern = {
      kind: "entity", value: "Atlas Example", occurrences: [
        { cellId: report.answerSnapshotMatrix.cells[0]!.id, recommendationOutcome: "recommendations_present", supportingText: "Atlas Example candidate" },
        { cellId: "foreign-cell", recommendationOutcome: "recommendations_present", supportingText: "Atlas Example candidate" }
      ]
    };
    expect(() => parseRecommendationForensicReportV1(report, emptyAuthority)).toThrow(/repeated-pattern|report cell/i);
  });
});
