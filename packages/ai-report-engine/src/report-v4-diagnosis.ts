export const REPORT_V4_MAX_DIAGNOSIS_SOURCES = 5 as const;
export const REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES = 10 as const;
export const REPORT_V4_MAX_SOURCE_EXCERPT_CHARS = 2_000 as const;
export const REPORT_V4_MAX_TARGET_SUMMARY_CHARS = 4_000 as const;
export const REPORT_V4_MAX_DIAGNOSIS_INPUT_CHARS = 60_000 as const;

export type ReportV4DiagnosisRetrievalStatus = "not_checked" | "available" | "inaccessible";
export type ReportV4ObservableFactorKind =
  | "problem_match"
  | "factual_specificity"
  | "entity_clarity"
  | "source_role"
  | "accessibility"
  | "freshness"
  | "target_clarity";

export interface ReportV4DiagnosisQuestion {
  readonly questionId: string;
  readonly text: string;
}

export interface ReportV4DiagnosisSource {
  readonly questionId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly excerpt: string | null;
  readonly retrievalStatus: ReportV4DiagnosisRetrievalStatus;
}

export interface ReportV4DiagnosisTargetLocation {
  readonly locationId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ReportV4DiagnosisTargetPage {
  readonly questionId: string;
  readonly pageId: string;
  readonly url: string;
  readonly relevanceReason: string;
  readonly summary: string;
  readonly sourceLocations: readonly ReportV4DiagnosisTargetLocation[];
}

export interface ReportV4DiagnosisInput {
  readonly question: ReportV4DiagnosisQuestion;
  readonly answer: string;
  readonly locale: string;
  readonly sources: readonly ReportV4DiagnosisSource[];
  readonly targetPages: readonly ReportV4DiagnosisTargetPage[];
}

export interface ReportV4DiagnosisObservableFactor {
  readonly kind: ReportV4ObservableFactorKind;
  readonly observation: string;
  readonly evidenceRefs: readonly string[];
}

export interface ReportV4DiagnosisAction {
  readonly priority: 1 | 2 | 3;
  readonly action: string;
  readonly evidenceRefs: readonly string[];
}

export interface ReportV4DiagnosisOutput {
  readonly selectionSummary: string;
  readonly observableFactors: readonly [
    ReportV4DiagnosisObservableFactor,
    ReportV4DiagnosisObservableFactor,
    ReportV4DiagnosisObservableFactor
  ];
  readonly targetGap: string;
  readonly recommendedActions: readonly [ReportV4DiagnosisAction, ReportV4DiagnosisAction, ReportV4DiagnosisAction];
  readonly detailedEvidenceRefs: readonly string[];
}

const INPUT_FIELDS = new Set(["question", "answer", "locale", "sources", "targetPages"]);
const QUESTION_FIELDS = new Set(["questionId", "text"]);
const SOURCE_FIELDS = new Set(["questionId", "sourceId", "title", "canonicalUrl", "excerpt", "retrievalStatus"]);
const TARGET_PAGE_FIELDS = new Set(["questionId", "pageId", "url", "relevanceReason", "summary", "sourceLocations"]);
const LOCATION_FIELDS = new Set(["locationId", "startOffset", "endOffset"]);
const OUTPUT_FIELDS = new Set(["selectionSummary", "observableFactors", "targetGap", "recommendedActions", "detailedEvidenceRefs"]);
const FACTOR_FIELDS = new Set(["kind", "observation", "evidenceRefs"]);
const ACTION_FIELDS = new Set(["priority", "action", "evidenceRefs"]);
const FACTOR_KINDS = ["problem_match", "factual_specificity", "entity_clarity", "source_role", "accessibility", "freshness", "target_clarity"] as const;

const PROHIBITED_INTERNAL_LANGUAGE = /(?:system prompt|developer message|raw (?:json|provider)|checkpoint|snapshot|claim extraction|provider adapter|token budget|tool call|系统提示词|开发者消息|原始\s*(?:JSON|供应商)|检查点|快照|声明提取|供应商适配器|令牌预算)/iu;
const PROHIBITED_SEO_LANGUAGE = /(?:\bSEO\b|search[ -]engine optimi[sz]ation|search ranking|keyword ranking|搜索引擎优化|搜索排名|关键词排名)/iu;
const PROHIBITED_CAUSAL_LANGUAGE = /(?:hidden (?:ranking )?weight|ranking weight|citation probability|\b(?:the\s+)?(?:model|provider)\b.{0,40}\b(?:selected|ranked|chose|recommended|cited|omitted)\b.{0,40}\bbecause\b|\bbecause\b.{0,40}\b(?:the\s+)?(?:model|provider)\b.{0,40}\b(?:selected|ranked|chose|recommended|cited|omitted)\b|\bguarantee(?:s|d|ing)?\b.{0,60}\b(?:citation|cite[ds]?|recommend(?:ation|ed)?|rank(?:ing|ed)?)\b|隐藏(?:排名)?权重|引用概率|(?:模型|供应商).{0,30}(?:选择|选中|排名|推荐|引用|遗漏|省略).{0,30}(?:因为|由于)|(?:因为|由于).{0,30}(?:模型|供应商).{0,30}(?:选择|选中|排名|推荐|引用|遗漏|省略)|(?:保证|确保|必然|一定会).{0,30}(?:引用|被引用|推荐|被推荐|排名))/iu;

export function parseReportV4DiagnosisInput(value: unknown): ReportV4DiagnosisInput {
  const root = strictObject(value, "$diagnosisInput", INPUT_FIELDS);
  const questionRow = strictObject(root.question, "$diagnosisInput.question", QUESTION_FIELDS);
  const question = Object.freeze({
    questionId: boundedText(questionRow.questionId, "$diagnosisInput.question.questionId", 500),
    text: boundedText(questionRow.text, "$diagnosisInput.question.text", 10_000)
  });
  const answer = customerProse(root.answer, "$diagnosisInput.answer", 30_000);

  const sourceRows = array(root.sources, "$diagnosisInput.sources");
  if (sourceRows.length > REPORT_V4_MAX_DIAGNOSIS_SOURCES) {
    throw new TypeError(`$diagnosisInput.sources must contain no more than five (${REPORT_V4_MAX_DIAGNOSIS_SOURCES}) question-owned sources.`);
  }
  const sourceIds = new Set<string>();
  const sourceUrls = new Set<string>();
  const sources = sourceRows.map((source, index) => {
    const path = `$diagnosisInput.sources[${index}]`;
    const row = strictObject(source, path, SOURCE_FIELDS);
    exact(row.questionId, question.questionId, `${path}.questionId`, "Sources must belong to the same question.");
    const sourceId = boundedText(row.sourceId, `${path}.sourceId`, 500);
    if (sourceIds.has(sourceId)) throw new TypeError("Diagnosis sourceId values must be unique within the current question.");
    sourceIds.add(sourceId);
    const canonicalUrl = httpUrl(row.canonicalUrl, `${path}.canonicalUrl`);
    if (sourceUrls.has(canonicalUrl)) throw new TypeError("Diagnosis sources must have unique canonical URLs.");
    sourceUrls.add(canonicalUrl);
    return Object.freeze({
      questionId: question.questionId,
      sourceId,
      title: boundedText(row.title, `${path}.title`, 2_000),
      canonicalUrl,
      // Source excerpts are source-original evidence. They may retain terms such as SEO verbatim.
      excerpt: row.excerpt === null ? null : boundedText(row.excerpt, `${path}.excerpt`, REPORT_V4_MAX_SOURCE_EXCERPT_CHARS),
      retrievalStatus: oneOf(row.retrievalStatus, ["not_checked", "available", "inaccessible"] as const, `${path}.retrievalStatus`)
    });
  });

  const targetRows = array(root.targetPages, "$diagnosisInput.targetPages");
  if (targetRows.length > REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES) {
    throw new TypeError(`$diagnosisInput.targetPages must contain no more than ${REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES} explicitly relevant page summaries.`);
  }
  const targetPageIds = new Set<string>();
  const targetLocationIds = new Set<string>();
  const targetPages = targetRows.map((targetPage, pageIndex) => {
    const path = `$diagnosisInput.targetPages[${pageIndex}]`;
    const row = strictObject(targetPage, path, TARGET_PAGE_FIELDS);
    exact(row.questionId, question.questionId, `${path}.questionId`, "Target summaries must be explicitly relevant to the current question.");
    const pageId = boundedText(row.pageId, `${path}.pageId`, 500);
    if (targetPageIds.has(pageId)) throw new TypeError("Diagnosis target pageId values must be unique.");
    targetPageIds.add(pageId);
    const locationRows = array(row.sourceLocations, `${path}.sourceLocations`);
    if (locationRows.length < 1 || locationRows.length > 16) throw new TypeError(`${path}.sourceLocations must contain between 1 and 16 source positions.`);
    const sourceLocations = locationRows.map((location, locationIndex) => {
      const locationPath = `${path}.sourceLocations[${locationIndex}]`;
      const locationRow = strictObject(location, locationPath, LOCATION_FIELDS);
      const locationId = boundedText(locationRow.locationId, `${locationPath}.locationId`, 500);
      if (sourceIds.has(locationId) || targetLocationIds.has(locationId)) throw new TypeError("Diagnosis evidence IDs must be unique within the current question.");
      targetLocationIds.add(locationId);
      const startOffset = nonnegativeInteger(locationRow.startOffset, `${locationPath}.startOffset`);
      const endOffset = nonnegativeInteger(locationRow.endOffset, `${locationPath}.endOffset`);
      if (endOffset <= startOffset) throw new TypeError(`${locationPath}.endOffset must be greater than startOffset.`);
      return Object.freeze({ locationId, startOffset, endOffset });
    });
    return Object.freeze({
      questionId: question.questionId,
      pageId,
      url: httpUrl(row.url, `${path}.url`),
      relevanceReason: customerProse(row.relevanceReason, `${path}.relevanceReason`, 2_000),
      summary: customerProse(row.summary, `${path}.summary`, REPORT_V4_MAX_TARGET_SUMMARY_CHARS),
      sourceLocations: Object.freeze(sourceLocations)
    });
  });

  const totalCharacters = question.text.length + answer.length
    + sources.reduce((sum, source) => sum + source.title.length + (source.excerpt?.length ?? 0), 0)
    + targetPages.reduce((sum, page) => sum + page.relevanceReason.length + page.summary.length, 0);
  if (totalCharacters > REPORT_V4_MAX_DIAGNOSIS_INPUT_CHARS) {
    throw new TypeError(`$diagnosisInput exceeds ${REPORT_V4_MAX_DIAGNOSIS_INPUT_CHARS} retained characters.`);
  }

  return Object.freeze({
    question,
    answer,
    locale: boundedText(root.locale, "$diagnosisInput.locale", 100),
    sources: Object.freeze(sources),
    targetPages: Object.freeze(targetPages)
  });
}

export function parseReportV4DiagnosisOutput(value: unknown, input: ReportV4DiagnosisInput): ReportV4DiagnosisOutput {
  const root = strictObject(value, "$diagnosisOutput", OUTPUT_FIELDS);
  const allowedEvidenceRefs = new Set([
    ...input.sources.map(({ sourceId }) => sourceId),
    ...input.targetPages.flatMap(({ sourceLocations }) => sourceLocations.map(({ locationId }) => locationId))
  ]);
  const detailedEvidenceRefs = evidenceRefs(root.detailedEvidenceRefs, "$diagnosisOutput.detailedEvidenceRefs", allowedEvidenceRefs);
  const detailedSet = new Set(detailedEvidenceRefs);

  const factorRows = array(root.observableFactors, "$diagnosisOutput.observableFactors");
  if (factorRows.length !== 3) throw new TypeError("$diagnosisOutput.observableFactors must contain exactly three items.");
  const observableFactors = factorRows.map((factor, index) => {
    const path = `$diagnosisOutput.observableFactors[${index}]`;
    const row = strictObject(factor, path, FACTOR_FIELDS);
    return Object.freeze({
      kind: oneOf(row.kind, FACTOR_KINDS, `${path}.kind`),
      observation: customerProse(row.observation, `${path}.observation`, 5_000),
      evidenceRefs: Object.freeze(evidenceRefs(row.evidenceRefs, `${path}.evidenceRefs`, detailedSet))
    });
  }) as unknown as ReportV4DiagnosisOutput["observableFactors"];

  const actionRows = array(root.recommendedActions, "$diagnosisOutput.recommendedActions");
  if (actionRows.length !== 3) throw new TypeError("$diagnosisOutput.recommendedActions must contain exactly three items.");
  const recommendedActions = actionRows.map((action, index) => {
    const path = `$diagnosisOutput.recommendedActions[${index}]`;
    const row = strictObject(action, path, ACTION_FIELDS);
    exact(row.priority, index + 1, `${path}.priority`, "Diagnosis action priority must preserve the order 1, 2, 3.");
    return Object.freeze({
      priority: (index + 1) as 1 | 2 | 3,
      action: customerProse(row.action, `${path}.action`, 5_000),
      evidenceRefs: Object.freeze(evidenceRefs(row.evidenceRefs, `${path}.evidenceRefs`, detailedSet))
    });
  }) as unknown as ReportV4DiagnosisOutput["recommendedActions"];

  return Object.freeze({
    selectionSummary: customerProse(root.selectionSummary, "$diagnosisOutput.selectionSummary", 5_000),
    observableFactors,
    targetGap: customerProse(root.targetGap, "$diagnosisOutput.targetGap", 5_000),
    recommendedActions,
    detailedEvidenceRefs: Object.freeze(detailedEvidenceRefs)
  });
}

function evidenceRefs(value: unknown, path: string, allowed: ReadonlySet<string>): string[] {
  const rows = array(value, path);
  if (rows.length < 1 || rows.length > 100) throw new TypeError(`${path} must contain between 1 and 100 current-question evidence refs.`);
  const refs = rows.map((ref, index) => boundedText(ref, `${path}[${index}]`, 500));
  const unknown = refs.find((ref) => !allowed.has(ref));
  if (unknown) throw new TypeError(`${path} references ${unknown}, which does not exist in current-question source or target evidence.`);
  return [...new Set(refs)];
}

function customerProse(value: unknown, path: string, max: number): string {
  const result = boundedText(value, path, max);
  if (PROHIBITED_INTERNAL_LANGUAGE.test(result) || PROHIBITED_SEO_LANGUAGE.test(result) || PROHIBITED_CAUSAL_LANGUAGE.test(result)) {
    throw new TypeError(`${path} contains prohibited customer prose.`);
  }
  return result;
}

function strictObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  return value;
}

function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty text no longer than ${max} characters.`);
  return value.trim();
}

function httpUrl(value: unknown, path: string): string {
  const result = boundedText(value, path, 2_000);
  try {
    const url = new URL(result);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error("unsupported URL");
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${path} must be an HTTP(S) URL without credentials.`);
  }
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${path} must be a nonnegative integer.`);
  return value;
}

function exact(value: unknown, expected: unknown, path: string, message: string): void {
  if (value !== expected) throw new TypeError(`${path}: ${message}`);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new TypeError(`${path} must be one of ${allowed.join(", ")}.`);
  return value as T[number];
}
