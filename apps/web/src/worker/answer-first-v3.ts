import { createHash } from "node:crypto";
import {
  OPEN_GEO_ENGINE_ID,
  ReportLanguageValidationError,
  openGeoAnswerEvidenceHashV3,
  openGeoAnswerHashV3,
  openGeoAnswerInputHashV3,
  parseOpenGeoAnswerCardsV3,
  synthesizeOpenGeoAnswerCardsV3,
  type JsonCompletionClient,
  type OpenGeoAnswerCardV3,
  type OpenGeoAnswerEvidenceV3,
  type OpenGeoAnswerOwnershipCategoryV3,
  type OpenGeoEngineProvenanceV3,
  type ProviderDiscoveryV1,
  type RecommendationForensicReportV2
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";

export const ANSWER_FIRST_V3_CHECKPOINT_VERSION = "answer-first-v3-checkpoint-v1" as const;
export const ANSWER_FIRST_V3_SYNTHESIS_PROMPT_VERSION = "open-geo-answer-synthesis-v1" as const;

export interface AnswerFirstV3StoredSource {
  sourceEvidenceId: string;
  observationId: string;
  queryId: string;
  canonicalUrl: string;
  title: string;
  registrableDomain: string;
  exactExcerpt: string;
  sourceCategory: "company_owned" | "earned_editorial" | "directory_or_reference" | "community_or_ugc" | "institution" | "social" | "unknown";
  observedAt: string;
  retrievalReady: boolean;
  snapshotKind?: "standard_question" | "provider_discovery" | "candidate_verification";
}

export interface AnswerFirstV3Checkpoint {
  version: typeof ANSWER_FIRST_V3_CHECKPOINT_VERSION;
  identityHash: string;
  questionSetIdentity: string;
  evidenceHash: string;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

export interface BuildAnswerFirstV3EvidenceInput {
  questionSet: ConfirmedBusinessQuestionSet;
  providerDiscovery: ProviderDiscoveryV1;
  forensicReport: RecommendationForensicReportV2;
  storedSources: readonly AnswerFirstV3StoredSource[];
  targetUrl: string;
  targetAliases?: readonly string[];
}

export interface ResolveAnswerFirstV3Input extends BuildAnswerFirstV3EvidenceInput {
  client: JsonCompletionClient;
  searchSurface: string;
  queryPlanVersion: string;
  passageSelectorVersion: string;
  checkpoint?: AnswerFirstV3Checkpoint | null;
  saveCheckpoint?(checkpoint: AnswerFirstV3Checkpoint): Promise<void>;
  now?: () => Date;
  signal?: AbortSignal;
}

export function buildAnswerFirstV3Evidence(input: BuildAnswerFirstV3EvidenceInput): OpenGeoAnswerEvidenceV3[] {
  const questions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  const storedBySource = new Map(input.storedSources.map((source) => [source.sourceEvidenceId, source]));
  const storedByObservation = new Map(input.storedSources.map((source) => [source.observationId, source]));
  const targetDomain = registrableHost(input.targetUrl);
  const providerSubjects = new Map<string, string>();
  for (const provider of input.providerDiscovery.strict) {
    for (const evidenceId of provider.evidenceIds) providerSubjects.set(evidenceId, provider.entityId);
  }
  for (const provider of input.providerDiscovery.candidates) {
    for (const evidenceId of provider.leadEvidenceIds) providerSubjects.set(evidenceId, provider.entityId);
  }

  const projected: OpenGeoAnswerEvidenceV3[] = [];
  for (const evidence of input.providerDiscovery.evidence) {
    const subjectKey = providerSubjects.get(evidence.evidenceId);
    const stored = storedBySource.get(evidence.sourceEvidenceId);
    if (!subjectKey || !stored?.retrievalReady || normalizeUrl(stored.canonicalUrl) === null) continue;
    projected.push(projectEvidence({
      questionId: questions[0]!.id,
      subjectKey,
      stored,
      exactExcerpt: evidence.exactExcerpt,
      ownershipCategory: stored.sourceCategory === "company_owned"
        ? (stored.registrableDomain.toLocaleLowerCase() === targetDomain ? "target_owned" : "competitor_owned")
        : ownershipFromStored(stored.sourceCategory)
    }));
  }

  const projectedProviderSourceIds = new Set(input.providerDiscovery.evidence.map(({ sourceEvidenceId }) => sourceEvidenceId));
  const q1 = questions[0]!;
  for (const stored of input.storedSources) {
    if (stored.snapshotKind !== "candidate_verification" || projectedProviderSourceIds.has(stored.sourceEvidenceId) ||
        !stored.retrievalReady || normalizeUrl(stored.canonicalUrl) === null) continue;
    const exactExcerpt = questionRelevantExcerpt(stored.exactExcerpt, `${q1.normalizedText} ${q1.derivation.subject}`);
    if (!exactExcerpt) continue;
    projected.push(projectEvidence({
      questionId: q1.id,
      subjectKey: `source-domain:${stored.registrableDomain.toLocaleLowerCase()}`,
      stored,
      exactExcerpt,
      ownershipCategory: stored.sourceCategory === "company_owned"
        ? (stored.registrableDomain.toLocaleLowerCase() === targetDomain ? "target_owned" : "competitor_owned")
        : ownershipFromStored(stored.sourceCategory)
    }));
  }

  const querySets = questions.map((question) => new Set(
    input.forensicReport.fanouts.find(({ questionId }) => questionId === question.id)?.queries.map(({ id }) => id) ?? []
  ));
  for (const evidence of input.forensicReport.sourceGraph.evidence) {
    if (!evidence.verifiedExcerpt || !evidence.retrievalReadiness.ready || !evidence.sourceEligibility.eligible ||
        !evidence.directFactSupport || evidence.metadataOnly || evidence.contradictory || evidence.entityAmbiguous) continue;
    const questionIndex = querySets.findIndex((queryIds) => evidence.queryVariantIds.some((id) => queryIds.has(id)));
    if (questionIndex < 0) continue;
    const subjectKeys = evidenceSubjects(input.forensicReport, evidence.evidenceId, evidence.entityIds);
    if (subjectKeys.length !== 1) continue;
    const stored = evidence.observationRefs.map(({ observationId }) => storedByObservation.get(observationId))
      .find((candidate) => candidate?.retrievalReady && normalizeUrl(candidate.canonicalUrl) === normalizeUrl(evidence.canonicalUrl));
    if (!stored) continue;
    projected.push(projectEvidence({
      questionId: questions[questionIndex]!.id,
      subjectKey: subjectKeys[0]!,
      stored,
      exactExcerpt: evidence.verifiedExcerpt,
      ownershipCategory: ownershipFromGraph(evidence.ownershipCategory)
    }));
  }
  return [...new Map(projected.map((evidence) => [evidence.evidenceId, evidence])).values()]
    .sort((left, right) => left.questionId.localeCompare(right.questionId) || left.subjectKey.localeCompare(right.subjectKey) || left.canonicalUrl.localeCompare(right.canonicalUrl));
}

export async function resolveAnswerFirstV3(input: ResolveAnswerFirstV3Input): Promise<{
  checkpoint: AnswerFirstV3Checkpoint;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  reused: boolean;
}> {
  const evidence = buildAnswerFirstV3Evidence(input);
  const evidenceHash = await openGeoAnswerEvidenceHashV3(evidence);
  const coverageByQuestion = coverage(input, evidence);
  const canonicalQuestionIds = toCanonicalBuyerQuestionSet(input.questionSet).questions.map(({ id }) => id) as [string, string, string];
  const missingEvidenceFamiliesByQuestion = missingEvidenceFamilies(input.forensicReport.locale, evidence, canonicalQuestionIds);
  const aliases = input.targetAliases ?? input.questionSet.identityExclusions;
  const competitors = input.forensicReport.sourceGraph.entities
    .filter(({ status, canonicalName }) => status === "resolved" && !matchesAnyAlias(aliases, canonicalName))
    .map(({ entityId, canonicalName }) => ({ entityId, aliases: [canonicalName] }));
  const context = {
    questionSet: input.questionSet,
    locale: input.forensicReport.locale,
    targetAliases: aliases,
    competitors,
    missingEvidenceFamiliesByQuestion
  };
  const identity = {
    version: ANSWER_FIRST_V3_CHECKPOINT_VERSION,
    questionSetIdentity: input.questionSet.contentHash,
    locale: input.forensicReport.locale,
    region: input.forensicReport.region,
    engineId: OPEN_GEO_ENGINE_ID,
    searchSurface: input.searchSurface,
    queryPlanVersion: input.queryPlanVersion,
    passageSelectorVersion: input.passageSelectorVersion,
    synthesisModel: input.client.configuredModel,
    evidenceHash
  };
  const identityHash = hash(identity);
  if (input.checkpoint) {
    validateCheckpoint(input.checkpoint, identityHash, identity);
    try {
      const answerCards = parseOpenGeoAnswerCardsV3(input.checkpoint.answerCards, context);
      if (await openGeoAnswerHashV3(answerCards) !== input.checkpoint.engineProvenance.answerHash) {
        throw new AnswerFirstV3ResumeIdentityMismatchError("Answer-first V3 checkpoint answer hash does not match its cards.");
      }
      return { checkpoint: input.checkpoint, answerCards, reused: true };
    } catch (error) {
      if (!(error instanceof ReportLanguageValidationError)) throw error;
    }
  }

  const synthesisInput = { ...context, evidence, coverageByQuestion, signal: input.signal };
  const inputHash = await openGeoAnswerInputHashV3(synthesisInput);
  const answerCards = await synthesizeOpenGeoAnswerCardsV3(input.client, synthesisInput);
  const now = (input.now ?? (() => new Date()))().toISOString();
  const searchedAt = earliestTimestamp(input.forensicReport.snapshotRefs.map(({ observedAt }) => observedAt), input.forensicReport.evidenceCutoffAt);
  const engineProvenance: OpenGeoEngineProvenanceV3 = {
    engineId: OPEN_GEO_ENGINE_ID,
    searchSurface: input.searchSurface,
    queryPlanVersion: input.queryPlanVersion,
    passageSelectorVersion: input.passageSelectorVersion,
    synthesisModel: input.client.configuredModel,
    synthesisPromptVersion: ANSWER_FIRST_V3_SYNTHESIS_PROMPT_VERSION,
    locale: input.forensicReport.locale,
    region: input.forensicReport.region,
    searchedAt,
    evidenceCutoffAt: input.forensicReport.evidenceCutoffAt,
    synthesizedAt: now,
    inputHash,
    evidenceHash,
    answerHash: await openGeoAnswerHashV3(answerCards)
  };
  const checkpoint: AnswerFirstV3Checkpoint = {
    version: ANSWER_FIRST_V3_CHECKPOINT_VERSION,
    identityHash,
    questionSetIdentity: input.questionSet.contentHash,
    evidenceHash,
    engineProvenance,
    answerCards
  };
  await input.saveCheckpoint?.(checkpoint);
  return { checkpoint, answerCards, reused: false };
}

function projectEvidence(input: {
  questionId: string;
  subjectKey: string;
  stored: AnswerFirstV3StoredSource;
  exactExcerpt: string;
  ownershipCategory: OpenGeoAnswerOwnershipCategoryV3;
}): OpenGeoAnswerEvidenceV3 {
  const canonicalUrl = normalizeUrl(input.stored.canonicalUrl);
  if (!canonicalUrl) throw new TypeError("Answer evidence canonical URL must be public HTTP(S).");
  return {
    evidenceId: `answer-evidence-${hash([input.questionId, input.subjectKey, canonicalUrl, input.exactExcerpt])}`,
    questionId: input.questionId,
    subjectKey: input.subjectKey,
    canonicalUrl,
    title: input.stored.title,
    registrableDomain: input.stored.registrableDomain.toLocaleLowerCase(),
    ownershipCategory: input.ownershipCategory,
    exactExcerpt: input.exactExcerpt,
    observedAt: input.stored.observedAt,
    eligible: true,
    direct: true
  };
}

function coverage(input: BuildAnswerFirstV3EvidenceInput, evidence: readonly OpenGeoAnswerEvidenceV3[]): [OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"]] {
  const questions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  return questions.map((question, index) => {
    if (index === 0) return {
      plannedQueries: input.providerDiscovery.execution.plannedQueries,
      completedQueries: input.providerDiscovery.execution.completedQueries,
      returnedResults: input.providerDiscovery.execution.returnedObservations,
      safelyRetrievedPages: input.providerDiscovery.execution.safelyRetrievedPages,
      reasons: input.providerDiscovery.execution.coverage === "complete" ? [] : [coverageShortfallReason(input.forensicReport.locale, "provider")]
    };
    const fanout = input.forensicReport.fanouts.find(({ questionId }) => questionId === question.id);
    const snapshot = input.forensicReport.snapshotRefs.find(({ questionId }) => questionId === question.id);
    const questionEvidence = evidence.filter(({ questionId }) => questionId === question.id);
    return {
      plannedQueries: fanout?.queries.length ?? 0,
      completedQueries: snapshot ? fanout?.queries.length ?? 0 : 0,
      returnedResults: new Set(questionEvidence.map(({ canonicalUrl }) => canonicalUrl)).size,
      safelyRetrievedPages: new Set(questionEvidence.map(({ canonicalUrl }) => canonicalUrl)).size,
      reasons: input.forensicReport.coverage.status === "complete" ? [] : [coverageShortfallReason(input.forensicReport.locale, "question")]
    };
  }) as [OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"]];
}

function coverageShortfallReason(locale: string, scope: "provider" | "question"): string {
  if (locale.toLocaleLowerCase().startsWith("zh")) {
    return scope === "provider"
      ? "公开检索覆盖不足；缺失证据不代表服务商不具备该能力。"
      : "该问题的公开检索覆盖不足。";
  }
  return scope === "provider"
    ? "Public-search coverage is incomplete; missing evidence does not prove that a provider lacks a capability."
    : "Public-search coverage for this question is incomplete.";
}

function missingEvidenceFamilies(locale: string, evidence: readonly OpenGeoAnswerEvidenceV3[], questionIds: readonly [string, string, string]): [string[], string[], string[]] {
  return questionIds.map((questionId) => {
    const scoped = evidence.filter((item) => item.questionId === questionId);
    if (!scoped.length) return [locale.startsWith("zh") ? "合格直接公开证据" : "eligible direct public evidence"];
    if (new Set(scoped.map(({ registrableDomain }) => registrableDomain)).size < 2) return [locale.startsWith("zh") ? "独立域名交叉验证" : "independent-domain corroboration"];
    return [];
  }) as [string[], string[], string[]];
}

function validateCheckpoint(checkpoint: AnswerFirstV3Checkpoint, identityHash: string, identity: { questionSetIdentity: string; evidenceHash: string; locale: string; region: string; engineId: string; searchSurface: string; queryPlanVersion: string; passageSelectorVersion: string; synthesisModel: string }): void {
  const provenance = checkpoint.engineProvenance;
  if (checkpoint.version !== ANSWER_FIRST_V3_CHECKPOINT_VERSION || checkpoint.identityHash !== identityHash ||
      checkpoint.questionSetIdentity !== identity.questionSetIdentity || checkpoint.evidenceHash !== identity.evidenceHash ||
      provenance.engineId !== identity.engineId || provenance.locale !== identity.locale || provenance.region !== identity.region ||
      provenance.searchSurface !== identity.searchSurface || provenance.queryPlanVersion !== identity.queryPlanVersion ||
      provenance.passageSelectorVersion !== identity.passageSelectorVersion || provenance.synthesisModel !== identity.synthesisModel ||
      provenance.evidenceHash !== identity.evidenceHash) {
    throw new AnswerFirstV3ResumeIdentityMismatchError("Answer-first V3 checkpoint identity or evidence hash does not match this run.");
  }
}

function evidenceSubjects(report: RecommendationForensicReportV2, evidenceId: string, entityIds: readonly string[]): string[] {
  const claims = report.sourceGraph.claims
    .filter(({ status, evidenceIds }) => status === "supported" && evidenceIds.includes(evidenceId))
    .map(({ subjectEntityId, subjectName }) => subjectEntityId ?? `subject:${normalize(subjectName)}`);
  return [...new Set([...entityIds, ...claims].filter(Boolean))];
}
function questionRelevantExcerpt(text: string, question: string): string | null {
  const terms = relevanceTerms(question);
  const chunks = text.match(/.{1,900}(?:[。！？.!?]|$)/gu) ?? [text.slice(0, 900)];
  const selected = chunks.map((value) => ({ value: value.trim(), score: terms.filter((term) => value.toLocaleLowerCase().includes(term)).length }))
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length)[0];
  return selected && selected.score > 0 ? selected.value.slice(0, 1_000) : null;
}
function relevanceTerms(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const chineseRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const chinese = chineseRuns.flatMap((run) => run.length <= 6 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)));
  return [...new Set([...latin, ...chinese])].filter((term) => !["which", "what", "where", "provide", "哪些", "什么", "如何", "是否"].includes(term));
}
function ownershipFromStored(category: AnswerFirstV3StoredSource["sourceCategory"]): OpenGeoAnswerOwnershipCategoryV3 { if (category === "earned_editorial") return "third_party_editorial"; if (category === "directory_or_reference") return "directory"; if (category === "institution") return "government"; return "other"; }
function ownershipFromGraph(category: string): OpenGeoAnswerOwnershipCategoryV3 { if (category === "owned_customer") return "target_owned"; if (category === "owned_competitor") return "competitor_owned"; if (category === "independent_editorial") return "third_party_editorial"; if (category === "directory_or_reference") return "directory"; if (category === "institution" || category === "public_body") return "government"; return "other"; }
function registrableHost(value: string): string { try { return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./u, ""); } catch { return ""; } }
function normalizeUrl(value: string): string | null { try { const url = new URL(value); if (!/^https?:$/u.test(url.protocol)) return null; url.hash = ""; return url.href; } catch { return null; } }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function matchesAnyAlias(aliases: readonly string[], name: string): boolean { const normalized = normalize(name); return aliases.some((alias) => normalize(alias) === normalized); }
function earliestTimestamp(values: readonly string[], fallback: string): string { const valid = values.filter((value) => Number.isFinite(Date.parse(value))).sort(); return valid[0] ?? fallback; }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export class AnswerFirstV3ResumeIdentityMismatchError extends Error {}
