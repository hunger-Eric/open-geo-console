import { describe, expect, it } from "vitest";
import {
  COMBINED_GEO_REPORT_V4_CONTRACT,
  COMBINED_GEO_REPORT_V4_VERSION,
  isHistoricalCombinedGeoReportV4,
  parseCombinedGeoReportV4,
  parsePersistedCombinedGeoReportV4
} from "./combined-geo-report-v4";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-SOURCE-01
describe("combined GEO report V4 contract", () => {
  it("parses an isolated V4 core report with exactly three ordered questions", () => {
    const report = parseCombinedGeoReportV4(fixture());

    expect(report.artifactContract).toBe(COMBINED_GEO_REPORT_V4_CONTRACT);
    expect(report.version).toBe(COMBINED_GEO_REPORT_V4_VERSION);
    expect(report.pageCoverage.counts).toEqual({ total: 2, analyzed: 1, crawlUnavailable: 1, excluded: 0, analysisUnavailable: 0 });
    expect(report.questions.map(({ order, questionId, answer }) => ({ order, questionId, answer }))).toEqual([
      { order: 1, questionId: "question-1", answer: "Answer one." },
      { order: 2, questionId: "question-2", answer: "Answer two." },
      { order: 3, questionId: "question-3", answer: "Answer three." }
    ]);
    expect("sourcePool" in report).toBe(false);
    expect("publicSourceForensics" in report).toBe(false);
    expect("providerDiscovery" in report).toBe(false);
    expect("pdfStorageKey" in report).toBe(false);
  });

  it("keeps sources owned by one question, canonical-URL deduplicated, stable, and capped at five", () => {
    const input = fixture();
    input.questions[0]!.sources = [
      source("source-3", "https://third.example/path#fragment"),
      source("source-1", "https://first.example/"),
      source("source-3-duplicate", "https://third.example/path"),
      source("source-2", "https://second.example/"),
      source("source-4", "https://fourth.example/"),
      source("source-5", "https://fifth.example/"),
      source("source-6", "https://sixth.example/")
    ];

    const report = parseCombinedGeoReportV4(input);

    expect(report.questions[0].sources.map(({ sourceId, canonicalUrl }) => ({ sourceId, canonicalUrl }))).toEqual([
      { sourceId: "source-3", canonicalUrl: "https://third.example/path" },
      { sourceId: "source-1", canonicalUrl: "https://first.example/" },
      { sourceId: "source-2", canonicalUrl: "https://second.example/" },
      { sourceId: "source-4", canonicalUrl: "https://fourth.example/" },
      { sourceId: "source-5", canonicalUrl: "https://fifth.example/" }
    ]);
    expect(report.questions[1].sources).toEqual([]);
    expect(report.questions[2].sources).toEqual([]);
  });

  it("rejects a source owned by another question instead of creating a cross-question pool", () => {
    const input = fixture();
    input.questions[0]!.sources = [{ ...source("cross-question", "https://source.example/"), questionId: "question-2" }];

    expect(() => parseCombinedGeoReportV4(input)).toThrow(/questionId/i);
  });

  it("validates an optional question-local diagnosis without accepting global diagnosis", () => {
    const input = fixture();
    input.questions[0]!.sources = [source("source-1", "https://first.example/")];
    input.questions[0]!.diagnosis = diagnosis();

    const report = parseCombinedGeoReportV4(input);

    expect(report.questions[0].diagnosis).toEqual(diagnosis());
    expect(report.questions[1].diagnosis).toBeUndefined();
    expect("sourceSelectionDiagnosis" in report).toBe(false);

    expect(() => parseCombinedGeoReportV4({
      ...input,
      sourceSelectionDiagnosis: diagnosis()
    })).toThrow(/unknown field/i);
  });

  it("allows target-page evidence while rejecting a diagnosis reference to another question's source", () => {
    const input = fixture();
    input.questions[0]!.sources = [source("source-1", "https://first.example/")];
    input.questions[1]!.sources = [{ ...source("question-2-source", "https://second.example/"), questionId: "question-2" }];
    input.questions[0]!.diagnosis = diagnosis();
    expect(parseCombinedGeoReportV4(input).questions[0].diagnosis?.detailedEvidenceRefs).toContain("target-page-1");

    input.questions[0]!.diagnosis = {
      ...diagnosis(),
      detailedEvidenceRefs: ["source-1", "target-page-1", "question-2-source"],
      recommendedActions: diagnosis().recommendedActions.map((action, index) => index === 0
        ? { ...action, evidenceRefs: ["question-2-source"] }
        : action)
    };
    expect(() => parseCombinedGeoReportV4(input)).toThrow(/same question/i);
  });

  it("rejects malformed diagnosis structure", () => {
    const input = fixture();
    input.questions[0]!.diagnosis = {
      ...diagnosis(),
      observableFactors: diagnosis().observableFactors.slice(0, 2)
    };

    expect(() => parseCombinedGeoReportV4(input)).toThrow(/observableFactors/i);
  });

  it.each([
    "combined_geo_report_v1",
    "combined_geo_report_v2",
    "combined_geo_report_v3",
    "combined_geo_report_v5"
  ])("rejects the non-V4 contract %s", (artifactContract) => {
    expect(() => parseCombinedGeoReportV4({ ...fixture(), artifactContract })).toThrow(/artifactContract/i);
  });

  it("rejects missing, duplicate, or reordered questions", () => {
    const missing = fixture();
    missing.questions.pop();
    expect(() => parseCombinedGeoReportV4(missing)).toThrow(/exactly three/i);

    const duplicate = fixture();
    duplicate.questions[1] = { ...duplicate.questions[1]!, questionId: "question-1" };
    expect(() => parseCombinedGeoReportV4(duplicate)).toThrow(/unique/i);

    const reordered = fixture();
    reordered.questions = [reordered.questions[1]!, reordered.questions[0]!, reordered.questions[2]!];
    expect(() => parseCombinedGeoReportV4(reordered)).toThrow(/order/i);
  });

  it("accepts a factual all-unreachable report without fabricated website synthesis", () => {
    const input = fixture();
    input.status = "unavailable";
    input.websiteSynthesis = { status: "unavailable", reason: "no_crawl_readable_pages" } as never;
    input.pageCoverage = {
      counts: { total: 2, analyzed: 0, crawlUnavailable: 2, excluded: 0, analysisUnavailable: 0 },
      pages: [
        pageOutcome(1, "crawl_unavailable", "robots_denied"),
        pageOutcome(2, "crawl_unavailable", "dns_not_found")
      ]
    };

    const report = parseCombinedGeoReportV4(input);

    expect(report.status).toBe("unavailable");
    expect(report.websiteSynthesis).toEqual({ status: "unavailable", reason: "no_crawl_readable_pages" });
  });

  it("rejects page-ledger count drift and unsafe reason codes", () => {
    const drift = fixture();
    drift.pageCoverage.counts.total = 99;
    expect(() => parseCombinedGeoReportV4(drift)).toThrow(/count|total/i);

    const unsafe = fixture();
    unsafe.pageCoverage.pages[1]!.reasonCode = "secret provider exception: api-key";
    expect(() => parseCombinedGeoReportV4(unsafe)).toThrow(/reasonCode/i);
  });

  it("accepts the complete bounded snapshot ledger above the analyzable-page limit", () => {
    const input = fixture();
    input.pageCoverage = {
      counts: { total: 51, analyzed: 51, crawlUnavailable: 0, excluded: 0, analysisUnavailable: 0 },
      pages: Array.from({ length: 51 }, (_, index) => pageOutcome(index + 1, "analyzed", null))
    };

    expect(parseCombinedGeoReportV4(input).pageCoverage.pages).toHaveLength(51);
  });

  it("rejects a ledger above the discovered-URL authority ceiling", () => {
    const input = fixture();
    input.pageCoverage = {
      counts: { total: 50_001, analyzed: 0, crawlUnavailable: 0, excluded: 50_001, analysisUnavailable: 0 },
      pages: Array.from({ length: 50_001 }, (_, index) => pageOutcome(index + 1, "excluded", "policy_excluded"))
    };

    expect(() => parseCombinedGeoReportV4(input)).toThrow(/50,?000|ledger|page outcomes/i);
  });

  it("binds root status to question and internal-analysis completeness", () => {
    const unavailableQuestion = fixture();
    unavailableQuestion.questions[2] = {
      ...unavailableQuestion.questions[2]!, status: "unavailable", answer: null, sources: []
    } as never;
    expect(() => parseCombinedGeoReportV4(unavailableQuestion)).toThrow(/status|completed/i);

    const analysisUnavailable = fixture();
    analysisUnavailable.pageCoverage = {
      counts: { total: 1, analyzed: 0, crawlUnavailable: 0, excluded: 0, analysisUnavailable: 1 },
      pages: [pageOutcome(1, "analysis_unavailable", "page_analysis_unavailable")]
    };
    analysisUnavailable.websiteSynthesis = { status: "unavailable", reason: "all_page_analyses_unavailable" } as never;
    expect(() => parseCombinedGeoReportV4(analysisUnavailable)).toThrow(/status|completed/i);

    const unavailableWithMissingQuestion = fixture();
    unavailableWithMissingQuestion.status = "unavailable";
    unavailableWithMissingQuestion.websiteSynthesis = { status: "unavailable", reason: "no_crawl_readable_pages" } as never;
    unavailableWithMissingQuestion.pageCoverage = {
      counts: { total: 1, analyzed: 0, crawlUnavailable: 1, excluded: 0, analysisUnavailable: 0 },
      pages: [pageOutcome(1, "crawl_unavailable", "raw_fetch_failed")]
    };
    unavailableWithMissingQuestion.questions[2] = {
      ...unavailableWithMissingQuestion.questions[2]!, status: "unavailable", answer: null, sources: []
    } as never;
    expect(() => parseCombinedGeoReportV4(unavailableWithMissingQuestion)).toThrow(/status|unavailable/i);
  });

  it("accepts an explicit website-synthesis provider degradation only as limited", () => {
    const input = fixture();
    input.status = "completed_limited";
    input.websiteSynthesis = { status: "unavailable", reason: "website_synthesis_unavailable" } as never;

    expect(parseCombinedGeoReportV4(input).websiteSynthesis).toEqual({
      status: "unavailable", reason: "website_synthesis_unavailable"
    });
  });

  it("keeps the prospective parser strict while admitting the exact historical V4 dialect only for persisted reads", () => {
    const historical = historicalFixture();

    expect(() => parseCombinedGeoReportV4(historical)).toThrow(/websiteSynthesis|status|pageCoverage|unknown field/i);
    const parsed = parsePersistedCombinedGeoReportV4(historical);

    expect(isHistoricalCombinedGeoReportV4(parsed)).toBe(true);
    expect(parsed.status).toBe("completed_limited");
    expect(parsed.websiteSynthesis).toEqual(historical.websiteSynthesis);
    expect("pageCoverage" in parsed).toBe(false);
  });

  it("rejects hybrid, partial, and unknown persisted V4 shapes instead of weakening either dialect", () => {
    const historical = historicalFixture();
    expect(() => parsePersistedCombinedGeoReportV4({
      ...historical,
      websiteSynthesis: { status: "available", ...historical.websiteSynthesis }
    })).toThrow(/websiteSynthesis|pageCoverage|unknown field/i);
    expect(() => parsePersistedCombinedGeoReportV4({
      ...historical,
      pageCoverage: fixture().pageCoverage
    })).toThrow(/websiteSynthesis|status|pageCoverage|unknown field/i);
    expect(() => parsePersistedCombinedGeoReportV4({
      ...historical,
      compatibilityDefault: true
    })).toThrow(/unknown field/i);
    expect(isHistoricalCombinedGeoReportV4(parsePersistedCombinedGeoReportV4(fixture()))).toBe(false);
  });
});

function historicalFixture() {
  const current = fixture();
  const { pageCoverage: _pageCoverage, websiteSynthesis, ...root } = current;
  const { status: _websiteStatus, ...legacyWebsiteSynthesis } = websiteSynthesis;
  return {
    ...root,
    status: "completed_limited",
    websiteSynthesis: legacyWebsiteSynthesis
  };
}

function fixture() {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "revision-v4-core",
    targetUrl: "https://target.example/",
    locale: "en",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: "completed",
    websiteSynthesis: {
      status: "available",
      summary: "The website presents a clear service scope.",
      strengths: ["Clear service facts."],
      gaps: ["Regional conditions need more detail."],
      actions: ["Publish region-specific service facts."]
    },
    pageCoverage: {
      counts: { total: 2, analyzed: 1, crawlUnavailable: 1, excluded: 0, analysisUnavailable: 0 },
      pages: [
        pageOutcome(1, "analyzed", null),
        pageOutcome(2, "crawl_unavailable", "raw_fetch_failed")
      ]
    },
    questions: [
      question(1, "question-1", "First question?", "Answer one."),
      question(2, "question-2", "Second question?", "Answer two."),
      question(3, "question-3", "Third question?", "Answer three.")
    ]
  };
}

function pageOutcome(ordinal: number, status: "analyzed" | "crawl_unavailable" | "excluded" | "analysis_unavailable", reasonCode: string | null) {
  return {
    ordinal,
    pageId: `page-${ordinal}`,
    url: `https://target.example/page-${ordinal}`,
    status,
    readMode: status === "analyzed" || status === "analysis_unavailable" ? "direct_readable" : null,
    reasonCode
  };
}

function question(order: number, questionId: string, questionText: string, answer: string) {
  return { order, questionId, questionText, status: "answered", answer, sources: [] as ReturnType<typeof source>[], diagnosis: undefined as ReturnType<typeof diagnosis> | undefined };
}

function source(sourceId: string, canonicalUrl: string) {
  return {
    questionId: "question-1",
    sourceId,
    title: `Source ${sourceId}`,
    canonicalUrl,
    citedText: `Evidence from ${sourceId}.`,
    retrievalStatus: "available"
  };
}

function diagnosis() {
  return {
    selectionSummary: "These sources directly address the first question.",
    observableFactors: [
      { kind: "problem_match", observation: "The source directly addresses the question.", evidenceRefs: ["source-1"] },
      { kind: "factual_specificity", observation: "The source states concrete conditions.", evidenceRefs: ["source-1"] },
      { kind: "accessibility", observation: "The target page is publicly readable.", evidenceRefs: ["target-page-1"] }
    ],
    targetGap: "The target site does not state the same conditions clearly.",
    recommendedActions: [
      { priority: 1, action: "Publish the missing service conditions.", evidenceRefs: ["source-1"] },
      { priority: 2, action: "Clarify the service and region relationship.", evidenceRefs: ["source-1"] },
      { priority: 3, action: "Keep the facts current and publicly readable.", evidenceRefs: ["source-1"] }
    ],
    detailedEvidenceRefs: ["source-1", "target-page-1"]
  };
}
