import { createAnswerResponseHash, createAnswerSnapshotCellId } from "./identity";
import type {
  AnswerAdapterErrorClass,
  AnswerEngineCollectionSurface,
  AnswerEngineCertificationState,
  AnswerEngineSurface,
  AnswerQuestion,
  AnswerQuestionCategory,
  AnswerSnapshotCell,
  FailedAnswerSnapshotCell,
  AnswerSnapshotProviderMetadata,
  AnswerSnapshotRunContract,
  AnswerSnapshotSource,
  AnswerSnapshotUsage
} from "./types";

const QUESTION_CATEGORIES = new Set<AnswerQuestionCategory>([
  "category_selection",
  "supplier_selection",
  "solution_comparison",
  "use_case_suitability"
]);
const COLLECTION_SURFACES = new Set<AnswerEngineCollectionSurface>([
  "developer_api",
  "approved_browser_capture"
]);
const CERTIFICATION_STATES = new Set<AnswerEngineCertificationState>([
  "candidate_uncertified",
  "certified"
]);
const ERROR_CLASSES = new Set<AnswerAdapterErrorClass>([
  "timeout",
  "rate-limit",
  "authentication",
  "unsupported",
  "provider-unavailable",
  "invalid-response",
  "policy-blocked"
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 10_000): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 64);
  if (!Number.isFinite(Date.parse(result))) {
    throw new TypeError(`${label} must be an ISO-compatible timestamp`);
  }
  return result;
}

function optionalUsage(value: unknown): AnswerSnapshotUsage | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "usage");
  const result: AnswerSnapshotUsage = {};
  for (const key of ["inputTokens", "outputTokens", "estimatedCostMicros"] as const) {
    if (input[key] !== undefined) result[key] = integer(input[key], `usage.${key}`);
  }
  return result;
}

function parseProviderMetadata(value: unknown, label: string): AnswerSnapshotProviderMetadata {
  const input = record(value, label);
  const allowedKeys = new Set(["providerSourceId", "publishedAt", "lastUpdatedAt", "sourceType"]);
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`${label} contains unsupported metadata fields: ${unknownKeys.join(", ")}`);
  }
  const result: AnswerSnapshotProviderMetadata = {
    ...(input.providerSourceId === undefined
      ? {}
      : { providerSourceId: text(input.providerSourceId, `${label}.providerSourceId`, 500) }),
    ...(input.publishedAt === undefined ? {} : { publishedAt: timestamp(input.publishedAt, `${label}.publishedAt`) }),
    ...(input.lastUpdatedAt === undefined
      ? {}
      : { lastUpdatedAt: timestamp(input.lastUpdatedAt, `${label}.lastUpdatedAt`) }),
    ...(input.sourceType === undefined ? {} : { sourceType: text(input.sourceType, `${label}.sourceType`, 100) })
  };
  if (Object.values(result).some((item) => typeof item === "string" && containsSensitiveMaterial(item))) {
    throw new TypeError(`${label} contains sensitive authentication material`);
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2_048) {
    throw new TypeError(`${label} exceeds the 2048-byte metadata limit`);
  }
  return result;
}

function sanitizedError(value: unknown): string {
  const result = text(value, "cell.sanitizedError", 500);
  if (containsSensitiveMaterial(result)) {
    throw new TypeError("cell.sanitizedError contains sensitive authentication material");
  }
  return result;
}

function sanitizedProviderRequestId(value: unknown): string {
  const result = text(value, "cell.providerRequestId", 500);
  if (containsSensitiveMaterial(result)) {
    throw new TypeError("cell.providerRequestId contains sensitive authentication material");
  }
  return result;
}

function containsSensitiveMaterial(value: string): boolean {
  return (
    /authorization\s*:\s*\S+/i.test(value) ||
    /\bbearer\s+\S+/i.test(value) ||
    /\b(?:api[-_ ]?key|access[-_ ]?token|token|client[-_ ]?secret|secret)\b\s*(?:[:=]\s*|\s+)\S+/i.test(value)
  );
}

export function parseAnswerQuestion(value: unknown): AnswerQuestion {
  const input = record(value, "question");
  const category = text(input.category, "question.category", 64) as AnswerQuestionCategory;
  if (!QUESTION_CATEGORIES.has(category)) throw new TypeError("question.category is unsupported");
  if (!Array.isArray(input.inferenceBasis) || input.inferenceBasis.length === 0) {
    throw new TypeError("question.inferenceBasis must be a non-empty array");
  }
  return {
    id: text(input.id, "question.id", 200),
    locale: text(input.locale, "question.locale", 64),
    category,
    exactText: text(input.exactText, "question.exactText"),
    inferenceBasis: input.inferenceBasis.map((item, index) =>
      text(item, `question.inferenceBasis[${index}]`, 2_000)
    )
  };
}

export function assertAnswerQuestion(value: unknown): asserts value is AnswerQuestion {
  parseAnswerQuestion(value);
}

export function parseAnswerEngineSurface(value: unknown): AnswerEngineSurface {
  const input = record(value, "surface");
  const collectionSurface = text(
    input.collectionSurface,
    "surface.collectionSurface",
    64
  ) as AnswerEngineCollectionSurface;
  const certificationState = text(
    input.certificationState,
    "surface.certificationState",
    64
  ) as AnswerEngineCertificationState;
  if (!COLLECTION_SURFACES.has(collectionSurface)) {
    throw new TypeError("surface.collectionSurface is unsupported");
  }
  if (!CERTIFICATION_STATES.has(certificationState)) {
    throw new TypeError("surface.certificationState is unsupported");
  }
  if (collectionSurface === "developer_api" && input.consumerApplicationLabel !== undefined) {
    throw new TypeError("A developer API cannot be labeled as a consumer application");
  }
  return {
    providerId: text(input.providerId, "surface.providerId", 200),
    productId: text(input.productId, "surface.productId", 200),
    modelId: text(input.modelId, "surface.modelId", 200),
    collectionSurface,
    locale: text(input.locale, "surface.locale", 64),
    region: text(input.region, "surface.region", 64),
    certificationState,
    ...(input.consumerApplicationLabel === undefined
      ? {}
      : { consumerApplicationLabel: text(input.consumerApplicationLabel, "surface.consumerApplicationLabel", 200) })
  };
}

export function assertAnswerEngineSurface(value: unknown): asserts value is AnswerEngineSurface {
  parseAnswerEngineSurface(value);
}

export function parseAnswerSnapshotRun(value: unknown): AnswerSnapshotRunContract {
  const input = record(value, "run");
  return {
    id: text(input.id, "run.id", 200),
    reportId: text(input.reportId, "run.reportId", 200),
    jobId: text(input.jobId, "run.jobId", 200),
    locale: text(input.locale, "run.locale", 64),
    region: text(input.region, "run.region", 64),
    questionSetVersion: text(input.questionSetVersion, "run.questionSetVersion", 200),
    startedAt: timestamp(input.startedAt, "run.startedAt")
  };
}

export function assertAnswerSnapshotRun(value: unknown): asserts value is AnswerSnapshotRunContract {
  parseAnswerSnapshotRun(value);
}

export function parseAnswerSnapshotSource(value: unknown): AnswerSnapshotSource {
  const input = record(value, "source");
  const url = text(input.url, "source.url", 4_096);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError("source.url must be an absolute HTTP(S) URL");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname ||
      parsed.username || parsed.password) {
    throw new TypeError("source.url must be an absolute HTTP(S) URL");
  }
  return {
    url,
    title: text(input.title, "source.title", 1_000),
    providerOrder: integer(input.providerOrder, "source.providerOrder"),
    providerMetadata: parseProviderMetadata(input.providerMetadata, "source.providerMetadata")
  };
}

export function assertAnswerSnapshotSource(value: unknown): asserts value is AnswerSnapshotSource {
  parseAnswerSnapshotSource(value);
}

export function parseAnswerSnapshotCell(value: unknown): AnswerSnapshotCell {
  const input = record(value, "cell");
  const status = text(input.status, "cell.status", 32);
  const surface = parseAnswerEngineSurface(input.surface);
  const common = {
    id: text(input.id, "cell.id", 200),
    runId: text(input.runId, "cell.runId", 200),
    questionId: text(input.questionId, "cell.questionId", 200),
    surface,
    executedAt: timestamp(input.executedAt, "cell.executedAt"),
    executionDurationMs: integer(input.executionDurationMs, "cell.executionDurationMs"),
    ...(input.providerRequestId === undefined
      ? {}
      : { providerRequestId: sanitizedProviderRequestId(input.providerRequestId) }),
    ...(input.usage === undefined ? {} : { usage: optionalUsage(input.usage) })
  };
  const expectedId = createAnswerSnapshotCellId(common);
  if (common.id !== expectedId) throw new TypeError("cell.id does not match its normalized identity");

  if (status === "succeeded") {
    for (const forbidden of ["errorClass", "sanitizedError"]) {
      if (input[forbidden] !== undefined) throw new TypeError(`Successful cell cannot contain ${forbidden}`);
    }
    const answerText = text(input.answerText, "cell.answerText", 100_000);
    const responseHash = text(input.responseHash, "cell.responseHash", 64);
    if (!/^[a-f0-9]{64}$/i.test(responseHash)) {
      throw new TypeError("cell.responseHash must be a SHA-256 hex digest");
    }
    const expectedResponseHash = createAnswerResponseHash(answerText);
    if (responseHash.toLocaleLowerCase() !== expectedResponseHash) {
      throw new TypeError("cell.responseHash does not match cell.answerText");
    }
    if (!Array.isArray(input.sources)) throw new TypeError("cell.sources must be an array");
    const recommendationOutcome = text(input.recommendationOutcome, "cell.recommendationOutcome", 64);
    if (recommendationOutcome !== "recommendations_present" && recommendationOutcome !== "no_recommendation") {
      throw new TypeError("cell.recommendationOutcome is unsupported");
    }
    const sources = input.sources.map(parseAnswerSnapshotSource);
    if (new Set(sources.map((source) => source.providerOrder)).size !== sources.length) {
      throw new TypeError("cell.sources must have unique providerOrder values");
    }
    if (new Set(sources.map((source) => source.url)).size !== sources.length) {
      throw new TypeError("cell.sources must have unique URLs");
    }
    return {
      ...common,
      status,
      answerText,
      responseHash: expectedResponseHash,
      sources,
      recommendationOutcome
    };
  }

  if (status === "failed") {
    for (const forbidden of ["answerText", "responseHash", "sources", "recommendationOutcome"]) {
      if (input[forbidden] !== undefined) throw new TypeError(`Failed cell cannot contain ${forbidden}`);
    }
    const errorClass = text(input.errorClass, "cell.errorClass", 64) as AnswerAdapterErrorClass;
    if (!ERROR_CLASSES.has(errorClass)) throw new TypeError("cell.errorClass is unsupported");
    const hasRetryMetadata = input.attemptCount !== undefined || input.failureDisposition !== undefined;
    let retryMetadata: Pick<FailedAnswerSnapshotCell, "attemptCount" | "failureDisposition"> = {};
    if (hasRetryMetadata) {
      const attemptCount = integer(input.attemptCount, "cell.attemptCount");
      if (attemptCount < 1) throw new TypeError("cell.attemptCount must be at least one");
      const failureDisposition = text(input.failureDisposition, "cell.failureDisposition", 64);
      if (failureDisposition !== "non_retryable" && failureDisposition !== "retry_exhausted") {
        throw new TypeError("cell.failureDisposition is unsupported");
      }
      retryMetadata = { attemptCount, failureDisposition };
    }
    return {
      ...common,
      status,
      errorClass,
      ...retryMetadata,
      ...(input.sanitizedError === undefined
        ? {}
        : { sanitizedError: sanitizedError(input.sanitizedError) })
    };
  }
  throw new TypeError("cell.status must be succeeded or failed");
}

export function assertAnswerSnapshotCell(value: unknown): asserts value is AnswerSnapshotCell {
  parseAnswerSnapshotCell(value);
}

export function classifyRecommendationOutcomeText(
  answerText: string
): "recommendations_present" | "no_recommendation" | null {
  const normalized = answerText.normalize("NFKC");
  const explicitNone = [
    /\b(?:cannot|can't|unable to)\s+(?:make|provide|give)\s+(?:a\s+)?(?:specific\s+)?recommendation/i,
    /\bno\s+(?:specific|clear|concrete)\s+recommendations?\b/i,
    /\bdo\s+not\s+recommend\s+(?:any|a\s+specific)\b/i,
    /(?:无法|不能|不宜)(?:给出|提供)?(?:任何|具体|明确)?推荐/,
    /没有(?:任何|具体|明确)?推荐/,
    /不推荐任何/
  ].some((pattern) => pattern.test(normalized));
  if (explicitNone) return "no_recommendation";
  const explicitRecommendation = [
    /\b(?:recommend(?:ed|s|ing|ations?)|preferred|best|top)\b/i,
    /\b(?:strong|leading|viable|suitable)\s+(?:choice|option|candidate|supplier|provider)s?\b/i,
    /\b(?:is|are|would be)\s+(?:well\s+)?suited\b/i,
    /(?:推荐|首选|优先选择|最佳|更适合|适合|候选)(?:的|方案|供应商|服务商|公司|品牌)?/
  ].some((pattern) => pattern.test(normalized));
  return explicitRecommendation ? "recommendations_present" : null;
}
