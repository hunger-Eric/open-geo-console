import { createHash } from "node:crypto";
import {
  generativeSearchAnswerHash,
  generativeSearchSourceHash,
  OPEN_GEO_ENGINE_ID,
  ReportLanguageValidationError,
  openGeoAnswerEvidenceHashV3,
  openGeoAnswerHashV3,
  openGeoAnswerInputHashV3,
  parseOpenGeoAnswerCardsV3,
  parseGenerativeSearchAnswerCardsV3,
  parseGenerativeSearchAnswerResult,
  synthesizeOpenGeoAnswerCardsV3,
  diagnoseGenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerProvider,
  type GenerativeSearchAnswerResult,
  type JsonCompletionClient,
  type LegacyEvidenceBoundAnswerCardV3,
  type OpenGeoAnswerEvidenceV3,
  type OpenGeoAnswerOwnershipCategoryV3,
  type OpenGeoEngineProvenanceV3,
  type ProviderDiscoveryV1,
  type RecommendationForensicReportV2
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { JobError } from "./job-errors";

export const ANSWER_FIRST_V3_CHECKPOINT_VERSION = "answer-first-v3-checkpoint-v1" as const;
export const GENERATIVE_ANSWER_FIRST_V3_CHECKPOINT_VERSION = "answer-first-v3-checkpoint-v2" as const;
export const ANSWER_FIRST_V3_SYNTHESIS_PROMPT_VERSION = "open-geo-answer-synthesis-v1" as const;
export const GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION = "generative-search-answer-v1" as const;

export interface AnswerFirstV3StoredSource {
  sourceEvidenceId: string;
  observationId: string;
  queryId: string;
  canonicalUrl: string;
  title: string;
  registrableDomain: string;
  exactExcerpt: string | null;
  sourceCategory: "company_owned" | "earned_editorial" | "directory_or_reference" | "community_or_ugc" | "institution" | "social" | "unknown";
  observedAt: string;
  retrievalReady: boolean;
  snapshotKind?: "standard_question" | "provider_discovery" | "candidate_verification";
}

export interface AnswerFirstV3CheckpointV1 {
  version: typeof ANSWER_FIRST_V3_CHECKPOINT_VERSION;
  identityHash: string;
  questionSetIdentity: string;
  evidenceHash: string;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3];
}

export interface AnswerFirstV3CheckpointV2 {
  version: typeof GENERATIVE_ANSWER_FIRST_V3_CHECKPOINT_VERSION;
  stage: "answers_collected" | "cards_ready";
  identityHash: string;
  questionSetIdentity: string;
  providerId: string;
  model: string;
  searchMode: string;
  promptVersion: typeof GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION;
  locale: string;
  region: string;
  answerHash: string;
  sourceHash: string;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerResults: [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  answerCards?: [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
}

export type AnswerFirstV3Checkpoint = AnswerFirstV3CheckpointV1 | AnswerFirstV3CheckpointV2;

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
  checkpoint?: AnswerFirstV3CheckpointV1 | null;
  saveCheckpoint?(checkpoint: AnswerFirstV3CheckpointV1): Promise<void>;
  now?: () => Date;
  signal?: AbortSignal;
}

export interface ResolveGenerativeAnswerFirstV3Input {
  questionSet: ConfirmedBusinessQuestionSet;
  provider: GenerativeSearchAnswerProvider;
  locale: string;
  region: string;
  targetUrl?: string;
  targetAliases?: readonly string[];
  competitors?: readonly { entityId: string; aliases: readonly string[] }[];
  auditSources?: readonly AnswerFirstV3StoredSource[];
  checkpoint?: AnswerFirstV3Checkpoint | null;
  saveCheckpoint?(checkpoint: AnswerFirstV3CheckpointV2): Promise<void>;
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
    const exactExcerpt = stored.exactExcerpt && questionRelevantExcerpt(stored.exactExcerpt, `${q1.normalizedText} ${q1.derivation.subject}`);
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
  checkpoint: AnswerFirstV3CheckpointV1;
  answerCards: [LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3];
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
      const answerCards = parseOpenGeoAnswerCardsV3(input.checkpoint.answerCards, context) as [LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3];
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
  let answerCards: [LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3];
  try {
    answerCards = await synthesizeOpenGeoAnswerCardsV3(input.client, synthesisInput) as [LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, LegacyEvidenceBoundAnswerCardV3];
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new AnswerFirstV3ModelContractInvalidError({ cause: error });
  }
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
  const checkpoint: AnswerFirstV3CheckpointV1 = {
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

export async function resolveGenerativeAnswerFirstV3(input: ResolveGenerativeAnswerFirstV3Input): Promise<{
  checkpoint: AnswerFirstV3CheckpointV2;
  answerCards: [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
  reused: boolean;
}> {
  const publicQuestions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  const mappedQuestions = input.questionSet.questions.map((question, index) => ({
    id: publicQuestions[index]!.id,
    exactText: question.privateText
  }));
  if (mappedQuestions.length !== 3) throw new TypeError("Generative answer-first V3 requires exactly three questions.");
  const questions = [mappedQuestions[0]!, mappedQuestions[1]!, mappedQuestions[2]!] as const;
  const identity = {
    version: GENERATIVE_ANSWER_FIRST_V3_CHECKPOINT_VERSION,
    questionSetIdentity: input.questionSet.contentHash,
    providerId: input.provider.providerId,
    model: input.provider.model,
    searchMode: input.provider.searchMode,
    promptVersion: GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION,
    locale: input.locale,
    region: input.region
  };
  const identityHash = hash(identity);
  const resumed = input.checkpoint?.version === GENERATIVE_ANSWER_FIRST_V3_CHECKPOINT_VERSION
    ? validateGenerativeCheckpoint(input.checkpoint, identityHash, identity)
    : null;
  if (input.checkpoint && !resumed) {
    throw new AnswerFirstV3ResumeIdentityMismatchError("A legacy V3 checkpoint cannot create a generative-search answer card.");
  }

  let answerResults = resumed?.answerResults;
  let providerCalls = false;
  if (!answerResults) {
    const signal = input.signal ?? new AbortController().signal;
    answerResults = await Promise.all(questions.map(async (question, index) => {
      let parsed = await callGenerativeProvider(input.provider, {
        questionId: question.id,
        question: question.exactText,
        locale: input.locale,
        region: input.region,
        signal
      });
      if (index === 0 && parsed.answerText && !isResponsiveProviderAnswer(parsed.answerText)) {
        parsed = await callGenerativeProvider(input.provider, {
          questionId: question.id,
          question: `${question.exactText}\n${q1Correction(input.locale)}`,
          locale: input.locale,
          region: input.region,
          signal
        });
        if (parsed.answerText && !isResponsiveProviderAnswer(parsed.answerText)) {
          throw new AnswerFirstV3ModelContractInvalidError({ cause: new TypeError("Question 1 answer is nonresponsive market-statistic-only output.") });
        }
      }
      if (parsed.answerText && parsed.sources.length === 0) {
        const answerWithoutSources = parsed;
        const corrected = await callGenerativeProvider(input.provider, {
          questionId: question.id,
          question: `${question.exactText}\n${sourceCorrection(input.locale)}`,
          locale: input.locale,
          region: input.region,
          signal
        });
        // A citation correction may enrich a valid answer, but it must never
        // erase that answer by replacing it with a refusal or blank output.
        if (corrected.answerText && corrected.refusal === null) parsed = corrected;
        else parsed = answerWithoutSources;
      }
      if (index === 0 && parsed.answerText && !isResponsiveProviderAnswer(parsed.answerText)) {
        throw new AnswerFirstV3ModelContractInvalidError({ cause: new TypeError("Question 1 answer is nonresponsive market-statistic-only output.") });
      }
      return parsed;
    })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
    providerCalls = true;
  }

  const perAnswerHashes = await Promise.all(answerResults.map((answer) => generativeSearchAnswerHash(answer)));
  const perSourceHashes = await Promise.all(answerResults.map((answer) => generativeSearchSourceHash(answer.sources)));
  const answerHash = hash(perAnswerHashes);
  const sourceHash = hash(perSourceHashes);
  if (resumed && (resumed.answerHash !== answerHash || resumed.sourceHash !== sourceHash ||
      resumed.engineProvenance.answerHash !== answerHash || resumed.engineProvenance.evidenceHash !== sourceHash)) {
    throw new AnswerFirstV3ResumeIdentityMismatchError("Generative answer checkpoint hashes do not match its persisted answers and sources.");
  }
  const searchedAt = earliestTimestamp(answerResults.map((answer) => answer.searchedAt), answerResults[0]!.searchedAt);
  const evidenceCutoffAt = [...answerResults.map((answer) => answer.completedAt)].sort().at(-1)!;
  const now = (input.now ?? (() => new Date()))().toISOString();
  const engineProvenance: OpenGeoEngineProvenanceV3 = {
    engineId: OPEN_GEO_ENGINE_ID,
    searchSurface: `${input.provider.providerId}:${input.provider.searchMode}`,
    queryPlanVersion: GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION,
    passageSelectorVersion: "audit-sidecar-v1",
    synthesisModel: input.provider.model,
    synthesisPromptVersion: GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION,
    locale: input.locale,
    region: input.region,
    searchedAt,
    evidenceCutoffAt,
    synthesizedAt: now,
    inputHash: hash(identity),
    evidenceHash: sourceHash,
    answerHash
  };
  const collected: AnswerFirstV3CheckpointV2 = {
    ...identity,
    stage: "answers_collected",
    identityHash,
    answerHash,
    sourceHash,
    engineProvenance,
    answerResults
  };
  if (providerCalls) await input.saveCheckpoint?.(collected);

  const answerCards = await buildGenerativeCards(input, questions, answerResults, perAnswerHashes, perSourceHashes);
  if (input.auditSources === undefined) return { checkpoint: collected, answerCards, reused: !providerCalls };

  const ready: AnswerFirstV3CheckpointV2 = { ...collected, stage: "cards_ready", answerCards };
  if (!resumed?.answerCards || JSON.stringify(resumed.answerCards) !== JSON.stringify(answerCards)) {
    await input.saveCheckpoint?.(ready);
  }
  return { checkpoint: ready, answerCards, reused: !providerCalls };
}

async function callGenerativeProvider(
  provider: GenerativeSearchAnswerProvider,
  request: Parameters<GenerativeSearchAnswerProvider["answerWithSources"]>[0]
): Promise<GenerativeSearchAnswerResult> {
  const raw = await provider.answerWithSources(request);
  try {
    return parseGenerativeSearchAnswerResult(raw, { expectedQuestionId: request.questionId, locale: request.locale });
  } catch (error) {
    throw new AnswerFirstV3ModelContractInvalidError({ cause: error });
  }
}

async function buildGenerativeCards(
  input: ResolveGenerativeAnswerFirstV3Input,
  questions: readonly [{ id: string; exactText: string }, { id: string; exactText: string }, { id: string; exactText: string }],
  results: [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult],
  answerHashes: readonly string[],
  sourceHashes: readonly string[]
): Promise<[GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3]> {
  const auditByUrl = new Map((input.auditSources ?? []).map((source) => [normalizeComparableUrl(source.canonicalUrl), source]));
  const drafts = results.map((result, index): GenerativeSearchAnswerCardV3 => {
    const sources = result.sources.map((source) => {
      const audit = auditByUrl.get(normalizeComparableUrl(source.canonicalUrl));
      return {
        ...source,
        retrievalStatus: audit
          ? (audit.retrievalReady && audit.exactExcerpt ? "verified_body" as const : audit.retrievalReady ? "search_source_only" as const : "inaccessible" as const)
          : "search_source_only" as const,
        ownershipCategory: audit ? generativeOwnershipFromStored(audit.sourceCategory, audit.registrableDomain, input.targetUrl) : "unknown" as const
      };
    });
    const status = result.refusal ? "refused" as const : sources.length ? "answered" as const : "source_limited" as const;
    const exactQuestion = questions[index]!.exactText;
    const geoDiagnosis = diagnoseGenerativeSearchAnswerCardV3({ answerText: result.answerText, sources }, {
      exactQuestion,
      locale: input.locale,
      targetAliases: input.targetAliases ?? [],
      competitors: input.competitors ?? [],
      missingEvidenceFamilies: []
    });
    const card: GenerativeSearchAnswerCardV3 = {
      answerMode: "generative_search_v1",
      questionId: result.questionId,
      exactQuestion,
      status,
      answerText: result.answerText,
      sources,
      provenance: {
        providerId: input.provider.providerId,
        model: input.provider.model,
        searchMode: input.provider.searchMode,
        promptVersion: GENERATIVE_ANSWER_FIRST_V3_PROMPT_VERSION,
        searchedAt: result.searchedAt,
        completedAt: result.completedAt,
        answerHash: answerHashes[index]!,
        sourceHash: sourceHashes[index]!
      },
      refusal: result.refusal,
      geoDiagnosis,
      audit: {
        verifiedBodyCount: sources.filter(({ retrievalStatus }) => retrievalStatus === "verified_body").length,
        searchSourceOnlyCount: sources.filter(({ retrievalStatus }) => retrievalStatus === "search_source_only").length,
        inaccessibleCount: sources.filter(({ retrievalStatus }) => retrievalStatus === "inaccessible").length
      }
    };
    return card;
  });
  return parseGenerativeSearchAnswerCardsV3(drafts, {
    questionSet: input.questionSet,
    locale: input.locale,
    targetAliases: input.targetAliases,
    competitors: input.competitors
  });
}

function q1Correction(locale: string): string {
  return locale.toLowerCase().startsWith("zh")
    ? "请直接列出至少一个具体服务商或服务方式，并说明其提供的服务；不要只回答市场规模或统计数据。"
    : "Directly name at least one specific provider or service approach and explain the service; do not answer with market size or statistics alone.";
}

function sourceCorrection(locale: string): string {
  return locale.toLowerCase().startsWith("zh")
    ? "请保持直接完整回答，并在同一次回答中返回支持答案的公开 HTTP(S) 来源。"
    : "Keep the direct complete answer and return the supporting public HTTP(S) sources in the same answer operation.";
}

function validateGenerativeCheckpoint(checkpoint: AnswerFirstV3CheckpointV2, identityHash: string, identity: {
  questionSetIdentity: string; providerId: string; model: string; searchMode: string; locale: string; region: string;
}): AnswerFirstV3CheckpointV2 {
  if (checkpoint.identityHash !== identityHash || checkpoint.questionSetIdentity !== identity.questionSetIdentity ||
      checkpoint.providerId !== identity.providerId || checkpoint.model !== identity.model || checkpoint.searchMode !== identity.searchMode ||
      checkpoint.locale !== identity.locale || checkpoint.region !== identity.region) {
    throw new AnswerFirstV3ResumeIdentityMismatchError("Generative answer checkpoint identity does not match this run.");
  }
  return checkpoint;
}

function isResponsiveProviderAnswer(answerText: string): boolean {
  const normalized = answerText.normalize("NFKC").toLocaleLowerCase();
  const namedProviderOrApproach = /(?:[\p{L}\p{N}]{1,30}(?:物流|供应链|货运|快递|shipping|logistics)|服务商[甲乙丙丁a-z0-9]|供应商[甲乙丙丁a-z0-9]|dhl|ups|fedex|顺丰|菜鸟|京东物流|极兔|海运|空运|铁路|专线|海外仓|多式联运|整柜|拼箱)/iu.test(normalized);
  const serviceExplanation = /(?:提供|承运|运输|配送|仓储|清关|时效|交付|provide|shipping|delivery|freight|warehouse)/iu.test(normalized);
  return namedProviderOrApproach && serviceExplanation;
}

function normalizeComparableUrl(value: string): string {
  try { const url = new URL(value); url.hash = ""; return url.href; } catch { return value; }
}

function generativeOwnershipFromStored(category: AnswerFirstV3StoredSource["sourceCategory"], domain: string, targetUrl?: string): OpenGeoAnswerOwnershipCategoryV3 {
  if (category === "company_owned") return targetUrl && registrableHost(targetUrl) === domain.toLocaleLowerCase() ? "target_owned" : "competitor_owned";
  if (category === "earned_editorial") return "third_party_editorial";
  if (category === "directory_or_reference") return "directory";
  if (category === "community_or_ugc") return "community";
  if (category === "institution") return "institution";
  if (category === "social") return "social";
  return "unknown";
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

function coverage(input: BuildAnswerFirstV3EvidenceInput, evidence: readonly OpenGeoAnswerEvidenceV3[]): [LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"]] {
  const questions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  return questions.map((question, index) => {
    const fanout = input.forensicReport.fanouts.find(({ questionId }) => questionId === question.id);
    const queryIds = new Set(fanout?.queries.map(({ id }) => id) ?? []);
    const scopedSources = index === 0
      ? input.storedSources
      : input.storedSources.filter(({ queryId }) => queryIds.has(queryId));
    const attemptedRetrievals = new Set(scopedSources.map(({ sourceEvidenceId }) => sourceEvidenceId)).size;
    const safelyRetrievedPages = new Set(scopedSources.filter(({ retrievalReady }) => retrievalReady).map(({ canonicalUrl }) => canonicalUrl)).size;
    const eligibleDirectEvidence = evidence.filter(({ questionId }) => questionId === question.id).length;
    if (index === 0) return {
      plannedQueries: input.providerDiscovery.execution.plannedQueries,
      completedQueries: input.providerDiscovery.execution.completedQueries,
      returnedResults: input.providerDiscovery.execution.returnedObservations,
      attemptedRetrievals,
      safelyRetrievedPages,
      eligibleDirectEvidence,
      reasons: input.providerDiscovery.execution.coverage === "complete" ? [] : [coverageShortfallReason(input.forensicReport.locale, "provider")]
    };
    const snapshot = input.forensicReport.snapshotRefs.find(({ questionId }) => questionId === question.id);
    return {
      plannedQueries: fanout?.queries.length ?? 0,
      completedQueries: snapshot ? fanout?.queries.length ?? 0 : 0,
      returnedResults: (snapshot?.observationIds ?? []).length,
      attemptedRetrievals,
      safelyRetrievedPages,
      eligibleDirectEvidence,
      reasons: input.forensicReport.coverage.status === "complete" ? [] : [coverageShortfallReason(input.forensicReport.locale, "question")]
    };
  }) as [LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"]];
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

function validateCheckpoint(checkpoint: AnswerFirstV3CheckpointV1, identityHash: string, identity: { questionSetIdentity: string; evidenceHash: string; locale: string; region: string; engineId: string; searchSurface: string; queryPlanVersion: string; passageSelectorVersion: string; synthesisModel: string }): void {
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

export class AnswerFirstV3ModelContractInvalidError extends JobError {
  constructor(options?: ErrorOptions) {
    super(
      "Answer-first V3 model response failed contract validation.",
      "answer_first_v3_model_contract_invalid",
      "operator_repairable",
      options
    );
  }
}
