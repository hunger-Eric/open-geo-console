export const COMBINED_GEO_REPORT_V4_VERSION = 4 as const;
export const COMBINED_GEO_REPORT_V4_CONTRACT = "combined_geo_report_v4" as const;
export const COMBINED_GEO_REPORT_V4_PAGE_OUTCOME_LIMIT = 50_000 as const;

export type CombinedGeoReportV4Status = "completed" | "completed_limited" | "unavailable";
export type CombinedGeoReportV4QuestionStatus = "answered" | "unavailable";
export type CombinedGeoReportV4SourceRetrievalStatus = "not_checked" | "available" | "inaccessible";

export interface CombinedGeoReportV4AvailableWebsiteSynthesis {
  readonly status: "available";
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly actions: readonly string[];
}

export interface CombinedGeoReportV4UnavailableWebsiteSynthesis {
  readonly status: "unavailable";
  readonly reason: "no_crawl_readable_pages" | "all_page_analyses_unavailable" | "website_synthesis_unavailable";
}

export type CombinedGeoReportV4WebsiteSynthesis =
  | CombinedGeoReportV4AvailableWebsiteSynthesis
  | CombinedGeoReportV4UnavailableWebsiteSynthesis;

export interface HistoricalCombinedGeoReportV4WebsiteSynthesis {
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly actions: readonly string[];
}

export type CombinedGeoReportV4PageOutcomeStatus =
  | "analyzed"
  | "crawl_unavailable"
  | "excluded"
  | "analysis_unavailable";

export interface CombinedGeoReportV4PageOutcome {
  readonly ordinal: number;
  readonly pageId: string;
  readonly url: string;
  readonly status: CombinedGeoReportV4PageOutcomeStatus;
  readonly readMode: "direct_readable" | "js_dependent" | null;
  readonly reasonCode: string | null;
}

export interface CombinedGeoReportV4PageCoverage {
  readonly counts: {
    readonly total: number;
    readonly analyzed: number;
    readonly crawlUnavailable: number;
    readonly excluded: number;
    readonly analysisUnavailable: number;
  };
  readonly pages: readonly CombinedGeoReportV4PageOutcome[];
}

export interface CombinedGeoReportV4Source {
  readonly questionId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly citedText: string | null;
  readonly retrievalStatus: CombinedGeoReportV4SourceRetrievalStatus;
}

export interface CombinedGeoReportV4ObservableFactor {
  readonly kind: string;
  readonly observation: string;
  readonly evidenceRefs: readonly string[];
}

export interface CombinedGeoReportV4RecommendedAction {
  readonly priority: 1 | 2 | 3;
  readonly action: string;
  readonly evidenceRefs: readonly string[];
}

export interface CombinedGeoReportV4QuestionDiagnosis {
  readonly selectionSummary: string;
  readonly observableFactors: readonly [
    CombinedGeoReportV4ObservableFactor,
    CombinedGeoReportV4ObservableFactor,
    CombinedGeoReportV4ObservableFactor
  ];
  readonly targetGap: string;
  readonly recommendedActions: readonly [
    CombinedGeoReportV4RecommendedAction,
    CombinedGeoReportV4RecommendedAction,
    CombinedGeoReportV4RecommendedAction
  ];
  readonly detailedEvidenceRefs: readonly string[];
}

export interface CombinedGeoReportV4Question {
  readonly order: 1 | 2 | 3;
  readonly questionId: string;
  readonly questionText: string;
  readonly status: CombinedGeoReportV4QuestionStatus;
  readonly answer: string | null;
  readonly sources: readonly CombinedGeoReportV4Source[];
  readonly diagnosis?: CombinedGeoReportV4QuestionDiagnosis;
}

export interface CombinedGeoReportV4 {
  readonly version: typeof COMBINED_GEO_REPORT_V4_VERSION;
  readonly artifactContract: typeof COMBINED_GEO_REPORT_V4_CONTRACT;
  readonly reportId: string;
  readonly artifactRevisionId: string;
  readonly targetUrl: string;
  readonly locale: string;
  readonly generatedAt: string;
  readonly status: CombinedGeoReportV4Status;
  readonly websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis;
  readonly pageCoverage: CombinedGeoReportV4PageCoverage;
  readonly questions: readonly [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
}

export interface HistoricalCombinedGeoReportV4 {
  readonly version: typeof COMBINED_GEO_REPORT_V4_VERSION;
  readonly artifactContract: typeof COMBINED_GEO_REPORT_V4_CONTRACT;
  readonly reportId: string;
  readonly artifactRevisionId: string;
  readonly targetUrl: string;
  readonly locale: string;
  readonly generatedAt: string;
  readonly status: CombinedGeoReportV4Status;
  readonly websiteSynthesis: HistoricalCombinedGeoReportV4WebsiteSynthesis;
  readonly questions: readonly [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
}

export type PersistedCombinedGeoReportV4 = CombinedGeoReportV4 | HistoricalCombinedGeoReportV4;

const ROOT_FIELDS = new Set([
  "version",
  "artifactContract",
  "reportId",
  "artifactRevisionId",
  "targetUrl",
  "locale",
  "generatedAt",
  "status",
  "websiteSynthesis",
  "pageCoverage",
  "questions"
]);
const HISTORICAL_ROOT_FIELDS = new Set([
  "version",
  "artifactContract",
  "reportId",
  "artifactRevisionId",
  "targetUrl",
  "locale",
  "generatedAt",
  "status",
  "websiteSynthesis",
  "questions"
]);
const HISTORICAL_WEBSITE_SYNTHESIS_FIELDS = new Set(["summary", "strengths", "gaps", "actions"]);
const AVAILABLE_WEBSITE_SYNTHESIS_FIELDS = new Set(["status", "summary", "strengths", "gaps", "actions"]);
const UNAVAILABLE_WEBSITE_SYNTHESIS_FIELDS = new Set(["status", "reason"]);
const PAGE_COVERAGE_FIELDS = new Set(["counts", "pages"]);
const PAGE_COVERAGE_COUNT_FIELDS = new Set(["total", "analyzed", "crawlUnavailable", "excluded", "analysisUnavailable"]);
const PAGE_OUTCOME_FIELDS = new Set(["ordinal", "pageId", "url", "status", "readMode", "reasonCode"]);
const QUESTION_FIELDS = new Set(["order", "questionId", "questionText", "status", "answer", "sources", "diagnosis"]);
const SOURCE_FIELDS = new Set(["questionId", "sourceId", "title", "canonicalUrl", "citedText", "retrievalStatus"]);
const DIAGNOSIS_FIELDS = new Set(["selectionSummary", "observableFactors", "targetGap", "recommendedActions", "detailedEvidenceRefs"]);
const FACTOR_FIELDS = new Set(["kind", "observation", "evidenceRefs"]);
const ACTION_FIELDS = new Set(["priority", "action", "evidenceRefs"]);

export function parseCombinedGeoReportV4(value: unknown): CombinedGeoReportV4 {
  const root = strictObject(value, "$combined", ROOT_FIELDS);
  exact(root.version, COMBINED_GEO_REPORT_V4_VERSION, "$combined.version");
  exact(root.artifactContract, COMBINED_GEO_REPORT_V4_CONTRACT, "$combined.artifactContract");

  const questionRows = array(root.questions, "$combined.questions");
  if (questionRows.length !== 3) throw new TypeError("$combined.questions must contain exactly three ordered questions.");

  const questionIds = new Set<string>();
  const questions = questionRows.map((question, index) => {
    const parsed = parseQuestion(question, index + 1);
    if (questionIds.has(parsed.questionId)) throw new TypeError("$combined.questions questionId values must be unique.");
    questionIds.add(parsed.questionId);
    return parsed;
  }) as unknown as CombinedGeoReportV4["questions"];
  assertQuestionLocalDiagnosisRefs(questions);

  const status = oneOf(root.status, ["completed", "completed_limited", "unavailable"] as const, "$combined.status");
  const websiteSynthesis = parseWebsiteSynthesis(root.websiteSynthesis);
  const pageCoverage = parsePageCoverage(root.pageCoverage);
  if (websiteSynthesis.status === "unavailable" && websiteSynthesis.reason === "no_crawl_readable_pages"
    && pageCoverage.counts.analyzed + pageCoverage.counts.analysisUnavailable !== 0) {
    throw new TypeError("$combined.websiteSynthesis no_crawl_readable_pages conflicts with readable page outcomes.");
  }
  if (websiteSynthesis.status === "unavailable" && websiteSynthesis.reason === "all_page_analyses_unavailable"
    && (pageCoverage.counts.analysisUnavailable === 0 || pageCoverage.counts.analyzed !== 0)) {
    throw new TypeError("$combined.websiteSynthesis all_page_analyses_unavailable conflicts with page outcomes.");
  }
  if (websiteSynthesis.status === "unavailable" && websiteSynthesis.reason === "website_synthesis_unavailable"
    && pageCoverage.counts.analyzed === 0) {
    throw new TypeError("$combined.websiteSynthesis website_synthesis_unavailable requires at least one analyzed page.");
  }
  if (websiteSynthesis.status === "available" && pageCoverage.counts.analyzed === 0) {
    throw new TypeError("$combined.websiteSynthesis available requires at least one analyzed page.");
  }
  const answeredQuestions = questions.filter((question) => question.status === "answered").length;
  const internallyLimited = pageCoverage.counts.analysisUnavailable > 0 || websiteSynthesis.status === "unavailable"
    && websiteSynthesis.reason !== "no_crawl_readable_pages";
  const expectedStatus: CombinedGeoReportV4Status = answeredQuestions < 3 || internallyLimited
    ? "completed_limited"
    : pageCoverage.counts.analyzed === 0
      ? "unavailable"
      : "completed";
  if (status !== expectedStatus) {
    throw new TypeError(`$combined.status must be ${expectedStatus} for the exact page and question outcomes.`);
  }

  return {
    version: COMBINED_GEO_REPORT_V4_VERSION,
    artifactContract: COMBINED_GEO_REPORT_V4_CONTRACT,
    reportId: text(root.reportId, "$combined.reportId", 500),
    artifactRevisionId: text(root.artifactRevisionId, "$combined.artifactRevisionId", 500),
    targetUrl: publicHttpUrl(root.targetUrl, "$combined.targetUrl"),
    locale: text(root.locale, "$combined.locale", 100),
    generatedAt: timestamp(root.generatedAt, "$combined.generatedAt"),
    status,
    websiteSynthesis,
    pageCoverage,
    questions
  };
}

export function parsePersistedCombinedGeoReportV4(value: unknown): PersistedCombinedGeoReportV4 {
  return usesProspectiveV4Shape(value)
    ? parseCombinedGeoReportV4(value)
    : parseHistoricalCombinedGeoReportV4(value);
}

export function isHistoricalCombinedGeoReportV4(
  value: PersistedCombinedGeoReportV4
): value is HistoricalCombinedGeoReportV4 {
  return !("pageCoverage" in value);
}

function parseHistoricalCombinedGeoReportV4(value: unknown): HistoricalCombinedGeoReportV4 {
  const root = strictObject(value, "$combined", HISTORICAL_ROOT_FIELDS);
  exact(root.version, COMBINED_GEO_REPORT_V4_VERSION, "$combined.version");
  exact(root.artifactContract, COMBINED_GEO_REPORT_V4_CONTRACT, "$combined.artifactContract");
  const rawQuestions = array(root.questions, "$combined.questions");
  if (rawQuestions.length !== 3) throw new TypeError("$combined.questions must contain exactly three questions.");
  const questions = rawQuestions.map((question, index) => parseQuestion(question, index + 1)) as unknown as HistoricalCombinedGeoReportV4["questions"];
  assertQuestionLocalDiagnosisRefs(questions);
  const website = strictObject(root.websiteSynthesis, "$combined.websiteSynthesis", HISTORICAL_WEBSITE_SYNTHESIS_FIELDS);
  return {
    version: COMBINED_GEO_REPORT_V4_VERSION,
    artifactContract: COMBINED_GEO_REPORT_V4_CONTRACT,
    reportId: text(root.reportId, "$combined.reportId", 500),
    artifactRevisionId: text(root.artifactRevisionId, "$combined.artifactRevisionId", 500),
    targetUrl: publicHttpUrl(root.targetUrl, "$combined.targetUrl"),
    locale: text(root.locale, "$combined.locale", 100),
    generatedAt: timestamp(root.generatedAt, "$combined.generatedAt"),
    status: oneOf(root.status, ["completed", "completed_limited", "unavailable"] as const, "$combined.status"),
    websiteSynthesis: {
      summary: text(website.summary, "$combined.websiteSynthesis.summary", 20_000),
      strengths: textArray(website.strengths, "$combined.websiteSynthesis.strengths", 100, 5_000),
      gaps: textArray(website.gaps, "$combined.websiteSynthesis.gaps", 100, 5_000),
      actions: textArray(website.actions, "$combined.websiteSynthesis.actions", 100, 5_000)
    },
    questions
  };
}

function usesProspectiveV4Shape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const root = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(root, "pageCoverage")) return true;
  const website = root.websiteSynthesis;
  return Boolean(website && typeof website === "object" && !Array.isArray(website)
    && Object.prototype.hasOwnProperty.call(website, "status"));
}

function parseWebsiteSynthesis(value: unknown): CombinedGeoReportV4WebsiteSynthesis {
  const candidate = strictObject(value, "$combined.websiteSynthesis", new Set([
    ...AVAILABLE_WEBSITE_SYNTHESIS_FIELDS,
    ...UNAVAILABLE_WEBSITE_SYNTHESIS_FIELDS
  ]));
  const status = oneOf(candidate.status, ["available", "unavailable"] as const, "$combined.websiteSynthesis.status");
  if (status === "unavailable") {
    const row = strictObject(value, "$combined.websiteSynthesis", UNAVAILABLE_WEBSITE_SYNTHESIS_FIELDS);
    return {
      status,
      reason: oneOf(row.reason, ["no_crawl_readable_pages", "all_page_analyses_unavailable", "website_synthesis_unavailable"] as const, "$combined.websiteSynthesis.reason")
    };
  }
  const row = strictObject(value, "$combined.websiteSynthesis", AVAILABLE_WEBSITE_SYNTHESIS_FIELDS);
  return {
    status,
    summary: text(row.summary, "$combined.websiteSynthesis.summary", 20_000),
    strengths: textArray(row.strengths, "$combined.websiteSynthesis.strengths", 100, 5_000),
    gaps: textArray(row.gaps, "$combined.websiteSynthesis.gaps", 100, 5_000),
    actions: textArray(row.actions, "$combined.websiteSynthesis.actions", 100, 5_000)
  };
}

function parsePageCoverage(value: unknown): CombinedGeoReportV4PageCoverage {
  const row = strictObject(value, "$combined.pageCoverage", PAGE_COVERAGE_FIELDS);
  const pageRows = array(row.pages, "$combined.pageCoverage.pages");
  if (pageRows.length < 1 || pageRows.length > COMBINED_GEO_REPORT_V4_PAGE_OUTCOME_LIMIT) {
    throw new TypeError(`$combined.pageCoverage.pages must contain between 1 and ${COMBINED_GEO_REPORT_V4_PAGE_OUTCOME_LIMIT.toLocaleString("en-US")} terminal page outcomes.`);
  }
  const pageIds = new Set<string>();
  const urls = new Set<string>();
  const pages = pageRows.map((candidate, index): CombinedGeoReportV4PageOutcome => {
    const path = `$combined.pageCoverage.pages[${index}]`;
    const item = strictObject(candidate, path, PAGE_OUTCOME_FIELDS);
    exact(item.ordinal, index + 1, `${path}.ordinal`);
    const pageId = text(item.pageId, `${path}.pageId`, 500);
    if (pageIds.has(pageId)) throw new TypeError("$combined.pageCoverage.pages pageId values must be unique.");
    pageIds.add(pageId);
    const url = publicHttpUrl(item.url, `${path}.url`);
    if (urls.has(url)) throw new TypeError("$combined.pageCoverage.pages URL values must be unique.");
    urls.add(url);
    const status = oneOf(item.status, ["analyzed", "crawl_unavailable", "excluded", "analysis_unavailable"] as const, `${path}.status`);
    const readMode = item.readMode === null ? null : oneOf(item.readMode, ["direct_readable", "js_dependent"] as const, `${path}.readMode`);
    const reasonCode = item.reasonCode === null ? null : safeReasonCode(item.reasonCode, `${path}.reasonCode`);
    if (status === "analyzed" && (readMode === null || reasonCode !== null)) throw new TypeError(`${path} analyzed outcome requires readMode and no reasonCode.`);
    if (status === "analysis_unavailable" && (readMode === null || reasonCode !== "page_analysis_unavailable")) {
      throw new TypeError(`${path} analysis_unavailable requires readMode and page_analysis_unavailable reasonCode.`);
    }
    if ((status === "crawl_unavailable" || status === "excluded") && (readMode !== null || reasonCode === null)) {
      throw new TypeError(`${path} ${status} requires a safe reasonCode and no readMode.`);
    }
    return { ordinal: index + 1, pageId, url, status, readMode, reasonCode };
  });
  const countRow = strictObject(row.counts, "$combined.pageCoverage.counts", PAGE_COVERAGE_COUNT_FIELDS);
  const counts = {
    total: nonnegativeInteger(countRow.total, "$combined.pageCoverage.counts.total"),
    analyzed: nonnegativeInteger(countRow.analyzed, "$combined.pageCoverage.counts.analyzed"),
    crawlUnavailable: nonnegativeInteger(countRow.crawlUnavailable, "$combined.pageCoverage.counts.crawlUnavailable"),
    excluded: nonnegativeInteger(countRow.excluded, "$combined.pageCoverage.counts.excluded"),
    analysisUnavailable: nonnegativeInteger(countRow.analysisUnavailable, "$combined.pageCoverage.counts.analysisUnavailable")
  };
  const actual = {
    total: pages.length,
    analyzed: pages.filter(({ status }) => status === "analyzed").length,
    crawlUnavailable: pages.filter(({ status }) => status === "crawl_unavailable").length,
    excluded: pages.filter(({ status }) => status === "excluded").length,
    analysisUnavailable: pages.filter(({ status }) => status === "analysis_unavailable").length
  };
  if (Object.keys(actual).some((key) => counts[key as keyof typeof counts] !== actual[key as keyof typeof actual])) {
    throw new TypeError("$combined.pageCoverage.counts must exactly match the terminal page ledger.");
  }
  return { counts, pages };
}

function parseQuestion(value: unknown, expectedOrder: number): CombinedGeoReportV4Question {
  const path = `$combined.questions[${expectedOrder - 1}]`;
  const row = strictObject(value, path, QUESTION_FIELDS);
  exact(row.order, expectedOrder, `${path}.order`);
  const questionId = text(row.questionId, `${path}.questionId`, 500);
  const status = oneOf(row.status, ["answered", "unavailable"] as const, `${path}.status`);
  const answer = row.answer === null ? null : text(row.answer, `${path}.answer`, 50_000);
  if (status === "answered" && answer === null) throw new TypeError(`${path}.answer must be present when status is answered.`);
  if (status === "unavailable" && answer !== null) throw new TypeError(`${path}.answer must be null when status is unavailable.`);

  const sources = parseSources(row.sources, questionId, path);
  if (status === "unavailable" && sources.length) throw new TypeError(`${path}.sources must be empty when status is unavailable.`);
  const diagnosis = row.diagnosis === undefined ? undefined : parseDiagnosis(row.diagnosis, path);
  if (status === "unavailable" && diagnosis) throw new TypeError(`${path}.diagnosis is not allowed when status is unavailable.`);

  return {
    order: expectedOrder as 1 | 2 | 3,
    questionId,
    questionText: text(row.questionText, `${path}.questionText`, 10_000),
    status,
    answer,
    sources,
    ...(diagnosis ? { diagnosis } : {})
  };
}

function parseSources(value: unknown, questionId: string, questionPath: string): CombinedGeoReportV4Source[] {
  const rows = array(value, `${questionPath}.sources`);
  if (rows.length > 100) throw new TypeError(`${questionPath}.sources exceeds the retained audit bound.`);
  const sourceIds = new Set<string>();
  const byUrl = new Map<string, CombinedGeoReportV4Source>();

  rows.forEach((value, index) => {
    const path = `${questionPath}.sources[${index}]`;
    const row = strictObject(value, path, SOURCE_FIELDS);
    exact(row.questionId, questionId, `${path}.questionId`);
    const sourceId = text(row.sourceId, `${path}.sourceId`, 500);
    if (sourceIds.has(sourceId)) throw new TypeError(`${questionPath}.sources sourceId values must be unique within the question.`);
    sourceIds.add(sourceId);
    const canonicalUrl = canonicalSourceUrl(row.canonicalUrl, `${path}.canonicalUrl`);
    const source: CombinedGeoReportV4Source = {
      questionId,
      sourceId,
      title: text(row.title, `${path}.title`, 2_000),
      canonicalUrl,
      citedText: row.citedText === null ? null : text(row.citedText, `${path}.citedText`, 10_000),
      retrievalStatus: oneOf(row.retrievalStatus, ["not_checked", "available", "inaccessible"] as const, `${path}.retrievalStatus`)
    };
    if (!byUrl.has(canonicalUrl)) byUrl.set(canonicalUrl, source);
  });

  return [...byUrl.values()].slice(0, 5);
}

function parseDiagnosis(value: unknown, questionPath: string): CombinedGeoReportV4QuestionDiagnosis {
  const path = `${questionPath}.diagnosis`;
  const row = strictObject(value, path, DIAGNOSIS_FIELDS);
  const factorRows = array(row.observableFactors, `${path}.observableFactors`);
  if (factorRows.length !== 3) throw new TypeError(`${path}.observableFactors must contain exactly three items.`);
  const actionRows = array(row.recommendedActions, `${path}.recommendedActions`);
  if (actionRows.length !== 3) throw new TypeError(`${path}.recommendedActions must contain exactly three items.`);
  const detailedEvidenceRefs = uniqueTextArray(row.detailedEvidenceRefs, `${path}.detailedEvidenceRefs`, 100, 500);
  const detailedEvidenceRefSet = new Set(detailedEvidenceRefs);

  const observableFactors = factorRows.map((factor, index) => {
    const factorPath = `${path}.observableFactors[${index}]`;
    const item = strictObject(factor, factorPath, FACTOR_FIELDS);
    return {
      kind: text(item.kind, `${factorPath}.kind`, 200),
      observation: text(item.observation, `${factorPath}.observation`, 5_000),
      evidenceRefs: diagnosisEvidenceRefs(item.evidenceRefs, `${factorPath}.evidenceRefs`, detailedEvidenceRefSet)
    };
  }) as unknown as CombinedGeoReportV4QuestionDiagnosis["observableFactors"];

  const recommendedActions = actionRows.map((action, index) => {
    const actionPath = `${path}.recommendedActions[${index}]`;
    const item = strictObject(action, actionPath, ACTION_FIELDS);
    exact(item.priority, index + 1, `${actionPath}.priority`);
    return {
      priority: (index + 1) as 1 | 2 | 3,
      action: text(item.action, `${actionPath}.action`, 5_000),
      evidenceRefs: diagnosisEvidenceRefs(item.evidenceRefs, `${actionPath}.evidenceRefs`, detailedEvidenceRefSet)
    };
  }) as unknown as CombinedGeoReportV4QuestionDiagnosis["recommendedActions"];

  return {
    selectionSummary: text(row.selectionSummary, `${path}.selectionSummary`, 5_000),
    observableFactors,
    targetGap: text(row.targetGap, `${path}.targetGap`, 5_000),
    recommendedActions,
    detailedEvidenceRefs
  };
}

function diagnosisEvidenceRefs(value: unknown, path: string, detailedEvidenceRefs: Set<string>): string[] {
  const refs = uniqueTextArray(value, path, 100, 500);
  if (refs.some((ref) => !detailedEvidenceRefs.has(ref))) throw new TypeError(`${path} must be included in the question diagnosis detailedEvidenceRefs.`);
  return refs;
}

function assertQuestionLocalDiagnosisRefs(questions: CombinedGeoReportV4["questions"]): void {
  const sourceOwners = new Map<string, string>();
  for (const question of questions) {
    for (const source of question.sources) {
      const owner = sourceOwners.get(source.sourceId);
      if (owner && owner !== question.questionId) throw new TypeError("V4 sourceId values must be unique across question-owned source sets.");
      sourceOwners.set(source.sourceId, question.questionId);
    }
  }
  for (const question of questions) {
    for (const ref of question.diagnosis?.detailedEvidenceRefs ?? []) {
      const sourceOwner = sourceOwners.get(ref);
      if (sourceOwner && sourceOwner !== question.questionId) throw new TypeError("A question diagnosis cannot reference a source owned by another question; source evidence must stay with the same question.");
    }
  }
}

function strictObject(value: unknown, path: string, fields: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !fields.has(key));
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  return value;
}

function textArray(value: unknown, path: string, maxItems: number, maxText: number): string[] {
  const values = array(value, path);
  if (values.length > maxItems) throw new TypeError(`${path} has too many items.`);
  return values.map((item, index) => text(item, `${path}[${index}]`, maxText));
}

function uniqueTextArray(value: unknown, path: string, maxItems: number, maxText: number): string[] {
  return [...new Set(textArray(value, path, maxItems, maxText))];
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty text no longer than ${max} characters.`);
  return value.trim();
}

function safeReasonCode(value: unknown, path: string): string {
  const result = text(value, path, 100);
  if (!/^[a-z][a-z0-9_]*$/u.test(result)) throw new TypeError(`${path} must be a safe lowercase reason code.`);
  return result;
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`${path} must be a nonnegative integer.`);
  return Number(value);
}

function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new TypeError(`${path} must be one of ${allowed.join(", ")}.`);
  return value as T[number];
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path, 100);
  if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be an ISO timestamp.`);
  return result;
}

function publicHttpUrl(value: unknown, path: string): string {
  const result = text(value, path, 2_000);
  try {
    const url = new URL(result);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error("unsupported URL");
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${path} must be an HTTP(S) URL without credentials.`);
  }
}

function canonicalSourceUrl(value: unknown, path: string): string {
  return publicHttpUrl(value, path);
}
