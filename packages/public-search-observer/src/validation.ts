import type {
  CanonicalBuyerQuestion,
  CanonicalBuyerQuestionSet,
  CustomerIdentityExclusion,
  MarketSnapshotIdentity,
  MarketSearchObservation,
  PublicSearchSurfaceAuthority,
  PublicSearchSurface,
  SearchQueryFanout,
  SearchQueryVariant,
  SearchAttemptUsage,
  SearchExecutionBudget,
  SearchResultObservation
} from "./types";

const SURFACE_KINDS = new Set(["documented_api", "licensed_index", "self_hosted_index"]);
const STATUSES = new Set(["complete", "partial", "rate_limited", "timed_out", "unavailable", "malformed", "aborted"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function only(input: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extras.length) throw new TypeError(`${label} contains unsupported fields: ${extras.join(", ")}`);
}

export function boundedText(value: unknown, label: string, max = 2_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(`${label} must be a non-empty string of at most ${max} characters`);
  }
  if (containsSensitiveMaterial(value)) throw new TypeError(`${label} contains sensitive material`);
  return value.trim().normalize("NFC");
}

function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new TypeError(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
}

export function parseSearchExecutionBudget(value: unknown): SearchExecutionBudget {
  const input = object(value, "budget");
  only(input, ["maxRequests", "maxResults", "timeoutMs", "maxCostMicros"], "budget");
  const budget = {
    maxRequests: integer(input.maxRequests, "budget.maxRequests", 10),
    maxResults: integer(input.maxResults, "budget.maxResults", 100),
    timeoutMs: integer(input.timeoutMs, "budget.timeoutMs", 120_000),
    maxCostMicros: integer(input.maxCostMicros, "budget.maxCostMicros", 1_000_000_000)
  };
  if (budget.maxRequests < 1 || budget.maxResults < 1 || budget.timeoutMs < 1) throw new TypeError("budget limits must be positive");
  return budget;
}

export function parsePublicSearchSurface(value: unknown): PublicSearchSurface {
  const input = object(value, "surface");
  only(input, ["surfaceId", "providerId", "productId", "surfaceKind", "contractVersion", "surfaceVersion", "adapterVersion", "locale", "region"], "surface");
  const surfaceKind = boundedText(input.surfaceKind, "surface.surfaceKind", 64) as PublicSearchSurface["surfaceKind"];
  if (!SURFACE_KINDS.has(surfaceKind)) throw new TypeError("surface.surfaceKind is unsupported");
  return {
    surfaceId: boundedText(input.surfaceId, "surface.surfaceId", 200),
    providerId: boundedText(input.providerId, "surface.providerId", 200),
    productId: boundedText(input.productId, "surface.productId", 200),
    surfaceKind,
    contractVersion: boundedText(input.contractVersion, "surface.contractVersion", 100),
    surfaceVersion: boundedText(input.surfaceVersion, "surface.surfaceVersion", 100),
    adapterVersion: boundedText(input.adapterVersion, "surface.adapterVersion", 100),
    locale: boundedText(input.locale, "surface.locale", 35),
    region: boundedText(input.region, "surface.region", 35)
  };
}

export function parsePublicSearchSurfaceAuthority(value: unknown): PublicSearchSurfaceAuthority {
  const input = object(value, "authority");
  only(input, ["authorityId", "environment", "surface", "active", "certifiedAt", "evidenceReference", "supportedLocales", "supportedRegions"], "authority");
  const environment = boundedText(input.environment, "authority.environment", 32) as PublicSearchSurfaceAuthority["environment"];
  if (!["test", "protected_staging", "production"].includes(environment)) throw new TypeError("authority.environment is unsupported");
  if (input.active !== true && input.active !== false) throw new TypeError("authority.active must be boolean");
  const certifiedAt = boundedText(input.certifiedAt, "authority.certifiedAt", 64);
  if (!Number.isFinite(Date.parse(certifiedAt))) throw new TypeError("authority.certifiedAt is invalid");
  if (!Array.isArray(input.supportedLocales) || !Array.isArray(input.supportedRegions)) throw new TypeError("authority capabilities must be arrays");
  return {
    authorityId: boundedText(input.authorityId, "authority.authorityId", 200), environment,
    surface: parsePublicSearchSurface(input.surface), active: input.active, certifiedAt,
    evidenceReference: boundedText(input.evidenceReference, "authority.evidenceReference", 1_000),
    supportedLocales: input.supportedLocales.map((item, index) => boundedText(item, `authority.supportedLocales[${index}]`, 35)),
    supportedRegions: input.supportedRegions.map((item, index) => boundedText(item, `authority.supportedRegions[${index}]`, 35))
  };
}

export function parseCanonicalBuyerQuestion(value: unknown): CanonicalBuyerQuestion {
  const input = object(value, "question");
  only(input, ["id", "questionSetVersion", "locale", "region", "kind", "exactText", "normalizedText", "derivation"], "question");
  const kind = boundedText(input.kind, "question.kind", 64) as CanonicalBuyerQuestion["kind"];
  if (!["supplier_discovery", "capability_fit", "decision_risk", "use_case_fit", "qualification"].includes(kind)) throw new TypeError("question.kind is unsupported");
  const derivation = object(input.derivation, "question.derivation");
  only(derivation, ["ruleId", "evidenceSourceIds", "subject", "supportingTerm", "broadened"], "question.derivation");
  if (!Array.isArray(derivation.evidenceSourceIds) || typeof derivation.broadened !== "boolean") throw new TypeError("question derivation is invalid");
  return {
    id: boundedText(input.id, "question.id", 128),
    questionSetVersion: boundedText(input.questionSetVersion, "question.questionSetVersion", 100),
    locale: boundedText(input.locale, "question.locale", 35), region: boundedText(input.region, "question.region", 35), kind,
    exactText: boundedText(input.exactText, "question.exactText", 2_000),
    normalizedText: boundedText(input.normalizedText, "question.normalizedText", 2_000),
    derivation: {
      ruleId: boundedText(derivation.ruleId, "question.derivation.ruleId", 100),
      evidenceSourceIds: derivation.evidenceSourceIds.map((item, index) => boundedText(item, `question.derivation.evidenceSourceIds[${index}]`, 200)),
      subject: boundedText(derivation.subject, "question.derivation.subject", 500),
      ...(derivation.supportingTerm === undefined ? {} : { supportingTerm: boundedText(derivation.supportingTerm, "question.derivation.supportingTerm", 500) }),
      broadened: derivation.broadened
    }
  };
}

export function parseCanonicalBuyerQuestionSet(value: unknown): CanonicalBuyerQuestionSet {
  const input = object(value, "questionSet");
  only(input, ["questionSetVersion", "locale", "region", "confidence", "questions", "limitations"], "questionSet");
  if (!Array.isArray(input.questions) || input.questions.length < 3 || input.questions.length > 5 || !Array.isArray(input.limitations)) throw new TypeError("questionSet requires three to five questions and limitations");
  const confidence = boundedText(input.confidence, "questionSet.confidence", 16) as CanonicalBuyerQuestionSet["confidence"];
  if (confidence !== "high" && confidence !== "low") throw new TypeError("questionSet.confidence is unsupported");
  const questions = input.questions.map(parseCanonicalBuyerQuestion);
  const questionSetVersion = boundedText(input.questionSetVersion, "questionSet.questionSetVersion", 100);
  const locale = boundedText(input.locale, "questionSet.locale", 35);
  const region = boundedText(input.region, "questionSet.region", 35);
  if (questions.some((question) => question.questionSetVersion !== questionSetVersion || question.locale !== locale || question.region !== region) || new Set(questions.map(({ id }) => id)).size !== questions.length) throw new TypeError("questionSet child identities do not match the set");
  return { questionSetVersion, locale, region, confidence, questions, limitations: input.limitations.map((item, index) => boundedText(item, `questionSet.limitations[${index}]`, 1_000)) };
}

export function parseSearchQueryVariant(value: unknown): SearchQueryVariant {
  const input = object(value, "query");
  only(input, ["id", "questionId", "fanoutVersion", "locale", "region", "exactQuery", "derivationRuleId", "resultDepth"], "query");
  return {
    id: boundedText(input.id, "query.id", 128), questionId: boundedText(input.questionId, "query.questionId", 128),
    fanoutVersion: boundedText(input.fanoutVersion, "query.fanoutVersion", 100), locale: boundedText(input.locale, "query.locale", 35),
    region: boundedText(input.region, "query.region", 35), exactQuery: boundedText(input.exactQuery, "query.exactQuery", 2_000),
    derivationRuleId: boundedText(input.derivationRuleId, "query.derivationRuleId", 100), resultDepth: integer(input.resultDepth, "query.resultDepth", 100)
  };
}

export function parseSearchQueryFanout(value: unknown): SearchQueryFanout {
  const input = object(value, "fanout");
  only(input, ["questionId", "questionSetVersion", "fanoutVersion", "surface", "queries", "budget"], "fanout");
  if (!Array.isArray(input.queries) || input.queries.length < 1 || input.queries.length > 6) throw new TypeError("fanout requires one to six queries");
  const questionId = boundedText(input.questionId, "fanout.questionId", 128);
  const fanoutVersion = boundedText(input.fanoutVersion, "fanout.fanoutVersion", 100);
  const queries = input.queries.map(parseSearchQueryVariant);
  if (queries.some((query) => query.questionId !== questionId || query.fanoutVersion !== fanoutVersion) || new Set(queries.map(({ id }) => id)).size !== queries.length) throw new TypeError("fanout child identities do not match the fanout");
  return { questionId, questionSetVersion: boundedText(input.questionSetVersion, "fanout.questionSetVersion", 100), fanoutVersion, surface: parsePublicSearchSurface(input.surface), queries, budget: parseSearchExecutionBudget(input.budget) };
}

export function parseMarketSnapshotIdentity(value: unknown): MarketSnapshotIdentity {
  const input = object(value, "identity");
  only(input, ["id", "normalizedQuestion", "locale", "region", "surfaceId", "surfaceVersion", "fanoutVersion"], "identity");
  const id = boundedText(input.id, "identity.id", 128);
  if (!/^market-[a-f0-9]{64}$/.test(id)) throw new TypeError("identity.id must be a market SHA-256 identity");
  return { id, normalizedQuestion: boundedText(input.normalizedQuestion, "identity.normalizedQuestion", 2_000), locale: boundedText(input.locale, "identity.locale", 35), region: boundedText(input.region, "identity.region", 35), surfaceId: boundedText(input.surfaceId, "identity.surfaceId", 200), surfaceVersion: boundedText(input.surfaceVersion, "identity.surfaceVersion", 100), fanoutVersion: boundedText(input.fanoutVersion, "identity.fanoutVersion", 100) };
}

export function parseSearchAttemptUsage(value: unknown): SearchAttemptUsage {
  const input = object(value, "usage");
  only(input, ["requestCount", "resultCount", "estimatedCostMicros", "providerReportedCostMicros", "costUncertain"], "usage");
  const usage: SearchAttemptUsage = {
    requestCount: integer(input.requestCount, "usage.requestCount", 10),
    resultCount: integer(input.resultCount, "usage.resultCount", 100)
  };
  if (input.estimatedCostMicros !== undefined) usage.estimatedCostMicros = integer(input.estimatedCostMicros, "usage.estimatedCostMicros", 1_000_000_000);
  if (input.providerReportedCostMicros !== undefined) usage.providerReportedCostMicros = integer(input.providerReportedCostMicros, "usage.providerReportedCostMicros", 1_000_000_000);
  if (input.costUncertain !== undefined) {
    if (typeof input.costUncertain !== "boolean") throw new TypeError("usage.costUncertain must be boolean");
    usage.costUncertain = input.costUncertain;
  }
  return usage;
}

function parseResult(value: unknown): SearchResultObservation {
  const input = object(value, "result");
  only(input, ["surfaceResultOrder", "url", "title", "snippet", "displayedHost", "metadata"], "result");
  const url = boundedText(input.url, "result.url", 4_096);
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new TypeError("result.url must be public HTTP(S) metadata");
  let metadata: Readonly<Record<string, string | number | boolean>> | undefined;
  if (input.metadata !== undefined) {
    const raw = object(input.metadata, "result.metadata");
    if (Object.keys(raw).length > 20 || Buffer.byteLength(JSON.stringify(raw), "utf8") > 2_048) throw new TypeError("result.metadata exceeds its bounded size");
    for (const [key, item] of Object.entries(raw)) {
      if (!["string", "number", "boolean"].includes(typeof item) || (typeof item === "string" && containsSensitiveMaterial(item))) {
        throw new TypeError(`result.metadata.${key} is unsupported`);
      }
    }
    metadata = raw as Record<string, string | number | boolean>;
  }
  return {
    surfaceResultOrder: integer(input.surfaceResultOrder, "result.surfaceResultOrder", 100),
    url,
    title: boundedText(input.title, "result.title", 1_000),
    snippet: boundedText(input.snippet, "result.snippet", 4_000),
    displayedHost: boundedText(input.displayedHost, "result.displayedHost", 255),
    ...(metadata ? { metadata } : {})
  };
}

export function parseMarketSearchObservation(value: unknown): MarketSearchObservation {
  const input = object(value, "observation");
  only(input, ["observationId", "surface", "queryId", "exactQuery", "requestedAt", "completedAt", "status", "results", "usage", "sanitizedError"], "observation");
  const status = boundedText(input.status, "observation.status", 32) as MarketSearchObservation["status"];
  if (!STATUSES.has(status)) throw new TypeError("observation.status is unsupported");
  if (!Array.isArray(input.results)) throw new TypeError("observation.results must be an array");
  const results = input.results.map(parseResult);
  if (![...results].every((item, index) => item.surfaceResultOrder === index + 1)) throw new TypeError("surfaceResultOrder must be contiguous and one-based");
  if (status !== "complete" && status !== "partial" && results.length) throw new TypeError("terminal error observations cannot include results");
  const requestedAt = boundedText(input.requestedAt, "observation.requestedAt", 64);
  const completedAt = boundedText(input.completedAt, "observation.completedAt", 64);
  if (!Number.isFinite(Date.parse(requestedAt)) || !Number.isFinite(Date.parse(completedAt))) throw new TypeError("observation timestamps are invalid");
  const usage = parseSearchAttemptUsage(input.usage);
  if (usage.resultCount !== results.length) throw new TypeError("usage.resultCount must match results");
  return {
    observationId: boundedText(input.observationId, "observation.observationId", 128),
    surface: parsePublicSearchSurface(input.surface),
    queryId: boundedText(input.queryId, "observation.queryId", 128),
    exactQuery: boundedText(input.exactQuery, "observation.exactQuery", 2_000),
    requestedAt, completedAt, status, results, usage,
    ...(input.sanitizedError === undefined ? {} : { sanitizedError: boundedText(input.sanitizedError, "observation.sanitizedError", 500) })
  };
}

export function assertNoCustomerIdentity(value: string, exclusions: readonly CustomerIdentityExclusion[]): void {
  const canonical = identityKey(value);
  if (!canonical) throw new TypeError("shared public-search text cannot be empty");
  for (const exclusion of exclusions) {
    const excluded = identityKey(exclusion.value);
    if (excluded && (canonical.includes(excluded) || excluded.includes(canonical))) {
      throw new TypeError(`shared public-search text contains excluded ${exclusion.kind}`);
    }
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) || /\b(?:order|report|job)[-_:\s]*[a-z0-9]{3,}\b/i.test(value)) {
    throw new TypeError("shared public-search text contains private identity");
  }
}

function identityKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function containsSensitiveMaterial(value: string): boolean {
  return /authorization\s*[:=]|\bbearer\s+\S+|\b(?:api[-_ ]?key|access[-_ ]?token|client[-_ ]?secret|secret)\b\s*[:=]\s*\S+/i.test(value);
}
