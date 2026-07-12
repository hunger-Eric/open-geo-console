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
      methodology: "Observed recommendation outcomes only; no private ranking cause is claimed.",
      sourceCategoryContext: {
        customerRegistrableDomain: "customer.example.com",
        competitorRegistrableDomains: [],
        knownDomains: { "editorial.example.org": "earned_editorial" }
      }
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
      entityId: "atlas", name: "Atlas Example", registrableDomain: "atlas.example.org",
      resolution: { status: "resolved", entityId: "atlas", basis: "unique_name" },
      signals: [{ cellId: cell.id, kind: "direct_candidate", supportingQuote: answerText }]
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
    sourceCategoryBreakdown: [{ category: "earned_editorial", sourceCount: 1, citationSourceIds: ["citation-1"] }],
    provenanceAndLimitations: {
      ...report.provenanceAndLimitations,
      sourceCategoryContext: {
        ...report.provenanceAndLimitations.sourceCategoryContext,
        competitorRegistrableDomains: ["atlas.example.org"]
      }
    }
  };
}

function limitedShellReport(): { report: RecommendationForensicReportV1; authority: CertificationAuthoritySnapshot } {
  const report = validReport();
  const surface: AnswerEngineSurface = {
    providerId: "limited", productId: "limited-search", modelId: "limited-model",
    collectionSurface: "developer_api", locale: "en", region: "global", certificationState: "certified"
  };
  const cells = generatedQuestions.questions.slice(0, 3).map((question, index) => {
    const answerText = `Atlas Example is one candidate for question ${index + 1}.`;
    return {
      id: createAnswerSnapshotCellId({ runId: snapshotRun.id, questionId: question.id, surface }),
      runId: snapshotRun.id, questionId: question.id, surface, status: "succeeded" as const,
      answerText, responseHash: createAnswerResponseHash(answerText),
      sources: [{
        url: `https://editorial.example.org/atlas-${index + 1}`, title: `Atlas review ${index + 1}`,
        providerOrder: 0, providerMetadata: { providerSourceId: `limited-source-${index + 1}` }
      }],
      recommendationOutcome: "recommendations_present" as const,
      executedAt: `2026-07-12T00:00:1${index}.000Z`, executionDurationMs: 100
    };
  });
  const authority: CertificationAuthoritySnapshot = {
    authorityVersion: "limited-authority-v1", capturedAt: "2026-07-12T00:00:30.000Z",
    certifications: [{
      surface,
      evidence: {
        environment: "protected_staging", certifiedAt: "2026-07-12T00:00:00.000Z",
        evidenceReference: "acceptance/limited"
      }
    }]
  };
  report.answerSnapshotMatrix = {
    run: snapshotRun, cells,
    commercialCoverage: classifyCommercialCoverage(generatedQuestions.questions, cells, authority)
  };
  report.provenanceAndLimitations.certificationAuthorityVersion = authority.authorityVersion;
  report.provenanceAndLimitations.certificationCapturedAt = authority.capturedAt;
  report.provenanceAndLimitations.certificationProvenance = [{
    surfaceKey: [surface.providerId, surface.productId, surface.modelId, surface.collectionSurface, surface.locale, surface.region].join("/"),
    evidenceReference: "acceptance/limited"
  }];
  return { report, authority };
}

function completeLimitedReport(): { report: RecommendationForensicReportV1; authority: CertificationAuthoritySnapshot } {
  const { report, authority } = limitedShellReport();
  const cells = report.answerSnapshotMatrix.cells.filter((cell) => cell.status === "succeeded");
  report.recommendedEntities = [{
    entityId: "atlas", name: "Atlas Example", registrableDomain: "atlas.example.org",
    resolution: { status: "resolved", entityId: "atlas", basis: "unique_name" },
    signals: cells.map((cell) => ({
      cellId: cell.id, kind: "direct_candidate" as const, supportingQuote: cell.answerText
    }))
  }];
  report.provenanceAndLimitations.sourceCategoryContext.competitorRegistrableDomains = ["atlas.example.org"];
  report.citationSources = cells.map((cell, index) => ({
    id: `commercial-citation-${index}`, cellId: cell.id, url: cell.sources[0]!.url,
    title: cell.sources[0]!.title, category: "earned_editorial" as const, providerOrder: 0,
    retrieval: {
      state: "available" as const, retrievedAt: "2026-07-12T00:00:20.000Z",
      contentHash: `${index + 1}`.repeat(64), verifiedExcerpt: `Atlas Example review evidence ${index + 1}.`,
      mapping: "association" as const, supportedEntityIds: ["atlas"]
    }
  }));
  report.evidenceGrades = report.citationSources.map((citation, index) => ({
    evidenceId: `commercial-evidence-${index}`, citationSourceId: citation.id,
    cellId: citation.cellId, grade: "B" as const
  }));
  report.sourceCategoryBreakdown = [{
    category: "earned_editorial", sourceCount: report.citationSources.length,
    citationSourceIds: report.citationSources.map(({ id }) => id)
  }];
  report.customerVsCompetitorGaps = [{
    id: "gap-atlas", title: "Atlas evidence gap", rationale: "Atlas Example appears in observed answers.",
    evidenceCellIds: cells.map(({ id }) => id), sourcePattern: "earned editorial evidence",
    suggestedAction: "Commission a verifiable comparison brief for vendor review.",
    competitorEntityIds: ["atlas"], outcome: "competitor_gap"
  }];
  report.vendorTaskPackage.tasks = [{
    id: "task-comparison", vendor: "content", title: "Draft comparison evidence",
    rationale: "Address the observed Atlas evidence gap.", actions: ["Draft a sourced comparison."],
    acceptanceCriteria: ["Every claim has a public source."], evidenceCellIds: [cells[0]!.id],
    retestQuestionIds: [report.generatedQuestions.questions[0]!.id]
  }];
  return { report, authority };
}

function completeNoRecommendationReport(): { report: RecommendationForensicReportV1; authority: CertificationAuthoritySnapshot } {
  const { report, authority } = limitedShellReport();
  const cells = report.answerSnapshotMatrix.cells.map((cell, index) => {
    if (cell.status !== "succeeded") return cell;
    const answerText = `No supplier recommendation is supported for question ${index + 1}.`;
    return {
      ...cell, answerText, responseHash: createAnswerResponseHash(answerText),
      recommendationOutcome: "no_recommendation" as const
    };
  });
  report.answerSnapshotMatrix.cells = cells;
  report.answerSnapshotMatrix.commercialCoverage = classifyCommercialCoverage(
    report.generatedQuestions.questions, cells, authority
  );
  const successful = cells.filter((cell) => cell.status === "succeeded");
  report.citationSources = successful.map((cell, index) => ({
    id: `no-rec-citation-${index}`, cellId: cell.id, url: cell.sources[0]!.url,
    title: cell.sources[0]!.title, category: "earned_editorial" as const, providerOrder: 0,
    retrieval: {
      state: "available" as const, retrievedAt: "2026-07-12T00:00:20.000Z",
      contentHash: `${index + 4}`.repeat(64), mapping: "none" as const, supportedEntityIds: []
    }
  }));
  report.evidenceGrades = report.citationSources.map((citation, index) => ({
    evidenceId: `no-rec-evidence-${index}`, citationSourceId: citation.id,
    cellId: citation.cellId, grade: "D" as const
  }));
  report.sourceCategoryBreakdown = [{
    category: "earned_editorial", sourceCount: report.citationSources.length,
    citationSourceIds: report.citationSources.map(({ id }) => id)
  }];
  report.customerVsCompetitorGaps = [{
    id: "gap-no-recommendation", title: "No recommendation outcome",
    rationale: "The observed answer set did not recommend a supplier.",
    evidenceCellIds: successful.map(({ id }) => id), sourcePattern: "no recommendation",
    suggestedAction: "Preserve this question set for a later evidence-backed rerun.",
    competitorEntityIds: [], outcome: "no_recommendation"
  }];
  report.vendorTaskPackage.tasks = [{
    id: "task-no-rec", vendor: "cross-functional", title: "Prepare rerun evidence",
    rationale: "The observed set produced no supplier recommendation.", actions: ["Review public category evidence."],
    acceptanceCriteria: ["Evidence is public and source-linked."], evidenceCellIds: [successful[0]!.id],
    retestQuestionIds: [report.generatedQuestions.questions[0]!.id]
  }];
  return { report, authority };
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

  it("rejects a completed-limited report that is an empty structured shell", () => {
    const { report, authority } = limitedShellReport();
    expect(report.answerSnapshotMatrix.commercialCoverage.outcome).toBe("completed_limited");
    expect(() => parseRecommendationForensicReportV1(report, authority)).toThrow(/auditable recommendation/i);
  });

  it("accepts an evidence-complete completed-limited report", () => {
    const { report, authority } = completeLimitedReport();
    expect(parseRecommendationForensicReportV1(report, authority)).toEqual(report);
  });

  it("accepts an explicit truthful no-recommendation completed-limited report", () => {
    const { report, authority } = completeNoRecommendationReport();
    expect(parseRecommendationForensicReportV1(report, authority)).toEqual(report);
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

    const punctuationVariant = validReport();
    punctuationVariant.generatedQuestions = generatePurchaseQuestions({
      locale: "en", organizationName: "Acme Inc", categories: ["freight forwarding"],
      capabilities: ["customs clearance"], sourceUrls: []
    });
    punctuationVariant.generatedQuestions.questions[0]!.exactText = "Which Acme, Inc. provider is suitable?";
    expect(() => parseRecommendationForensicReportV1(punctuationVariant, emptyAuthority)).toThrow(/brand|organization/i);
  });

  it("rebuilds Grade A from a provider-returned source and verified retrieval evidence", () => {
    const report = reportWithCitation();
    expect(parseRecommendationForensicReportV1(report, emptyAuthority)).toEqual(report);

    const mismatchedSource = structuredClone(report);
    mismatchedSource.citationSources[0]!.url = "https://fabricated.example.org/not-returned";
    expect(() => parseRecommendationForensicReportV1(mismatchedSource, emptyAuthority)).toThrow(/returned source/i);

    const selfCategorized = structuredClone(report);
    selfCategorized.citationSources[0]!.category = "community_or_ugc";
    expect(() => parseRecommendationForensicReportV1(selfCategorized, emptyAuthority)).toThrow(/recomputed|Category must/i);

    const fabricatedSignal = structuredClone(report);
    fabricatedSignal.recommendedEntities[0]!.signals[0]!.supportingQuote = "Atlas Example is the best provider.";
    expect(() => parseRecommendationForensicReportV1(fabricatedSignal, emptyAuthority)).toThrow(/exact answerText substring/i);

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
        { cellId: report.answerSnapshotMatrix.cells[0]!.id, recommendationOutcome: "recommendations_present", supportingText: "Atlas Example is one candidate." },
        { cellId: "foreign-cell", recommendationOutcome: "recommendations_present", supportingText: "Atlas Example is one candidate." }
      ]
    };
    expect(() => parseRecommendationForensicReportV1(report, emptyAuthority)).toThrow(/repeated-pattern|report cell/i);
  });

  it("rejects Grade C text that is not an exact structured recommendation signal", () => {
    const { report, authority } = limitedShellReport();
    const cells = report.answerSnapshotMatrix.cells.filter((cell) => cell.status === "succeeded");
    report.recommendedEntities = [{
      entityId: "atlas", name: "Atlas Example",
      resolution: { status: "resolved", entityId: "atlas", basis: "unique_name" },
      signals: cells.map((cell) => ({
        cellId: cell.id, kind: "direct_candidate" as const, supportingQuote: cell.answerText
      }))
    }];
    report.citationSources = cells.map((cell, index) => ({
      id: `limited-citation-${index}`, cellId: cell.id, url: cell.sources[0]!.url,
      title: cell.sources[0]!.title, category: "earned_editorial" as const, providerOrder: 0,
      retrieval: {
        state: "available" as const, retrievedAt: "2026-07-12T00:00:20.000Z",
        contentHash: `${index + 1}`.repeat(64), mapping: "none" as const, supportedEntityIds: []
      }
    }));
    report.sourceCategoryBreakdown = [{
      category: "earned_editorial", sourceCount: 3,
      citationSourceIds: report.citationSources.map(({ id }) => id)
    }];
    report.evidenceGrades = [{
      evidenceId: "pattern-evidence", citationSourceId: report.citationSources[0]!.id,
      cellId: cells[0]!.id, grade: "C",
      repeatedPattern: {
        kind: "entity", value: "Atlas Example", occurrences: [
          { cellId: cells[0]!.id, recommendationOutcome: "recommendations_present", supportingText: cells[0]!.answerText },
          { cellId: cells[1]!.id, recommendationOutcome: "recommendations_present", supportingText: "Atlas Example fabricated quote" }
        ]
      }
    }];
    expect(() => parseRecommendationForensicReportV1(report, authority)).toThrow(/exact answerText substring|recommendation signal/i);
  });
});
