export const COMBINED_GEO_REPORT_V4_VERSION = 4 as const;
export const COMBINED_GEO_REPORT_V4_CONTRACT = "combined_geo_report_v4" as const;

export type CombinedGeoReportV4Status = "completed" | "completed_limited" | "unavailable";
export type CombinedGeoReportV4QuestionStatus = "answered" | "unavailable";
export type CombinedGeoReportV4SourceRetrievalStatus = "not_checked" | "available" | "inaccessible";

export interface CombinedGeoReportV4WebsiteSynthesis {
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly actions: readonly string[];
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
  readonly questions: readonly [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
}

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
  "questions"
]);
const WEBSITE_SYNTHESIS_FIELDS = new Set(["summary", "strengths", "gaps", "actions"]);
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

  return {
    version: COMBINED_GEO_REPORT_V4_VERSION,
    artifactContract: COMBINED_GEO_REPORT_V4_CONTRACT,
    reportId: text(root.reportId, "$combined.reportId", 500),
    artifactRevisionId: text(root.artifactRevisionId, "$combined.artifactRevisionId", 500),
    targetUrl: publicHttpUrl(root.targetUrl, "$combined.targetUrl"),
    locale: text(root.locale, "$combined.locale", 100),
    generatedAt: timestamp(root.generatedAt, "$combined.generatedAt"),
    status: oneOf(root.status, ["completed", "completed_limited", "unavailable"] as const, "$combined.status"),
    websiteSynthesis: parseWebsiteSynthesis(root.websiteSynthesis),
    questions
  };
}

function parseWebsiteSynthesis(value: unknown): CombinedGeoReportV4WebsiteSynthesis {
  const row = strictObject(value, "$combined.websiteSynthesis", WEBSITE_SYNTHESIS_FIELDS);
  return {
    summary: text(row.summary, "$combined.websiteSynthesis.summary", 20_000),
    strengths: textArray(row.strengths, "$combined.websiteSynthesis.strengths", 100, 5_000),
    gaps: textArray(row.gaps, "$combined.websiteSynthesis.gaps", 100, 5_000),
    actions: textArray(row.actions, "$combined.websiteSynthesis.actions", 100, 5_000)
  };
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
