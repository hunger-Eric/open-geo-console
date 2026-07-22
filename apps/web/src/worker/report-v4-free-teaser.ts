import { createHash } from "node:crypto";
import {
  REPORT_V4_MAX_DIAGNOSIS_SOURCES,
  diagnoseGenerativeSearchAnswerCardV3,
  generativeSearchAnswerHash,
  generativeSearchSourceHash,
  parseGenerativeSearchAnswerResult,
  parseReportV4DiagnosisOutputForQuestion,
  type AiWebsiteReportV1,
  type CombinedGeoReportV4Question,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerProvider,
  type GenerativeSearchAnswerResult,
  type ReportV4DiagnosisTargetPage
} from "@open-geo-console/ai-report-engine";
import {
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet,
  type CustomerIdentityExclusion,
  type MarketSearchObservation
} from "@open-geo-console/public-search-observer";
import {
  confirmBusinessQuestions,
  getConfirmedBusinessQuestionSet,
  prepareBusinessQuestionCandidates
} from "@/db/business-questions";
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import type { JobCheckpoint } from "@/db/schema";
import type { ReportV4SiteSnapshotBundle } from "@/db/report-v4-site-snapshots";
import { resolveGenerativeSearchAnswerProvider, resolveProductionPublicSearchRuntime } from "@/public-source-forensics/production-runtime";
import { buildReportV4MimoDiagnosisTokenBudget, createReportV4MimoDiagnosisProvider } from "@/report-v4/mimo-provider";
import { loadReportV4ModelRuntimeConfig } from "@/report-v4/model-runtime-config";
import { createConcurrencyGate } from "./bounded-scheduler";
import { enhanceReportV4QuestionDiagnosis } from "./report-v4-diagnosis-enhancer";
import { createPublicSourceQuestionFanouts } from "./public-source-forensics";
import { resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";

export const FREE_TEASER_CHECKPOINT_VERSION = "free-teaser-checkpoint-v1" as const;
export type FreeTeaserStage = "questions_ready" | "observations_ready" | "q1_answer_ready" | "ready";

export interface FreeTeaserMetrics {
  readonly questionCount: 3;
  readonly brandMentionCount: number;
  readonly competitorMentionCount: number;
}

export interface FreeTeaserCheckpointV1 {
  readonly version: typeof FREE_TEASER_CHECKPOINT_VERSION;
  readonly stage: FreeTeaserStage;
  readonly identityHash: string;
  readonly reportId: string;
  readonly admissionSnapshotId: string;
  readonly admissionContentIdentityHash: string;
  readonly foundationHash: string;
  readonly locale: string;
  readonly region: string;
  readonly authorityId: string;
  readonly evidenceCutoffAt: string;
  readonly questionSetId?: string;
  readonly questionSetIdentity?: string;
  readonly observationSnapshotIds?: readonly [string, string, string];
  readonly metrics?: FreeTeaserMetrics;
  readonly q1AnswerResult?: GenerativeSearchAnswerResult;
  readonly q1AnswerCard?: GenerativeSearchAnswerCardV3;
  readonly readyAt?: string;
}

export interface FreeTeaserResult {
  readonly checkpoint: FreeTeaserCheckpointV1;
  readonly questionSet: ConfirmedBusinessQuestionSet;
  readonly q1AnswerCard: GenerativeSearchAnswerCardV3;
  readonly metrics: FreeTeaserMetrics;
}

export interface FreeTeaserSeededQ1 {
  readonly questionSetIdentity: string;
  readonly providerId: string;
  readonly model: string;
  readonly searchMode: string;
  readonly locale: string;
  readonly region: string;
  readonly answerResult: GenerativeSearchAnswerResult;
}

export type FreeTeaserCheckpointWriter = (
  checkpoint: FreeTeaserCheckpointV1,
  phase: "question_generation" | "snapshot_resolution" | "grounded_answer_synthesis"
) => Promise<void>;

export async function generateFreeTeaser(input: {
  reportId: string;
  jobId: string;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  locale: "en" | "zh";
  admission: ReportV4SiteSnapshotBundle;
  checkpoint?: FreeTeaserCheckpointV1 | null;
  saveCheckpoint: FreeTeaserCheckpointWriter;
  signal?: AbortSignal;
}): Promise<FreeTeaserResult> {
  input.signal?.throwIfAborted();
  assertTerminalAdmission(input.admission, input.reportId);

  const runtime = await resolveProductionPublicSearchRuntime({
    environment: process.env,
    getAuthority: getActivePublicSearchSurfaceAuthority
  });
  const foundationHash = sha(input.foundation);
  const admissionContentIdentityHash = input.admission.snapshot.contentIdentityHash!;
  const identityCore = {
    version: FREE_TEASER_CHECKPOINT_VERSION,
    reportId: input.reportId,
    admissionSnapshotId: input.admission.snapshot.id,
    admissionContentIdentityHash,
    foundationHash,
    locale: runtime.authority.surface.locale,
    region: runtime.authority.surface.region,
    authorityId: runtime.authority.authorityId
  };
  const identityHash = sha(identityCore);
  let checkpoint = input.checkpoint ?? null;
  if (checkpoint) assertCheckpointIdentity(checkpoint, identityCore, identityHash);
  const evidenceCutoffAt = checkpoint?.evidenceCutoffAt ?? new Date().toISOString();

  const candidates = await prepareBusinessQuestionCandidates({
    reportId: input.reportId,
    locale: runtime.authority.surface.locale,
    region: runtime.authority.surface.region,
    foundation: input.foundation
  });
  const questionSet = await confirmBusinessQuestions({
    reportId: input.reportId,
    questionSetId: candidates.id,
    finalTexts: candidates.questions.map(({ neutralPublicText }) => neutralPublicText),
    acknowledgedLowConfidence: candidates.confidence === "low"
  });
  if (checkpoint?.questionSetIdentity && checkpoint.questionSetIdentity !== questionSet.contentHash) {
    throw new Error("Free teaser question-set identity changed after checkpoint.");
  }
  if (!checkpoint || !checkpoint.questionSetId) {
    checkpoint = {
      ...identityCore,
      stage: "questions_ready",
      identityHash,
      evidenceCutoffAt,
      questionSetId: questionSet.id,
      questionSetIdentity: questionSet.contentHash
    };
    await input.saveCheckpoint(checkpoint, "question_generation");
  }

  if (!checkpoint.observationSnapshotIds || !checkpoint.metrics) {
    const observed = await observeTeaserQuestions({
      reportId: input.reportId,
      jobId: input.jobId,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      questionSet,
      evidenceCutoffAt,
      runtime,
      signal: input.signal
    });
    checkpoint = {
      ...checkpoint,
      stage: "observations_ready",
      observationSnapshotIds: observed.snapshotIds,
      metrics: observed.metrics
    };
    await input.saveCheckpoint(checkpoint, "snapshot_resolution");
  }

  if (!checkpoint.q1AnswerResult || !checkpoint.q1AnswerCard) {
    const q1 = await answerTeaserQuestionOne({
      questionSet,
      targetUrl: input.targetUrl,
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region,
      signal: input.signal
    });
    checkpoint = {
      ...checkpoint,
      stage: "q1_answer_ready",
      q1AnswerResult: q1.answerResult,
      q1AnswerCard: q1.card
    };
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  if (checkpoint.stage !== "ready" || !checkpoint.q1AnswerCard?.diagnosis) {
    const q1Card = checkpoint.q1AnswerCard!;
    const targetPages = buildFreeTeaserDiagnosisTargetPages(
      q1Card.questionId,
      input.admission
    );
    if (!targetPages.length) throw new Error("Free teaser Q1 diagnosis requires target-site evidence.");
    const question = toDiagnosisQuestion(q1Card);
    const diagnosisResult = await enhanceReportV4QuestionDiagnosis({
      question,
      locale: runtime.authority.surface.locale,
      targetPages,
      provider: createReportV4MimoDiagnosisProvider({ environment: process.env }),
      getTokenBudget: (request) => buildReportV4MimoDiagnosisTokenBudget({
        runtime: loadReportV4ModelRuntimeConfig(process.env),
        request
      }),
      signal: input.signal
    });
    if (diagnosisResult.status !== "completed") {
      throw new Error("Free teaser Q1 diagnosis did not complete.");
    }
    const diagnosis = parseReportV4DiagnosisOutputForQuestion(diagnosisResult.diagnosis, {
      questionId: q1Card.questionId,
      sourceEvidenceIds: q1Card.sources.map(({ sourceId }) => sourceId)
    });
    checkpoint = {
      ...checkpoint,
      stage: "ready",
      q1AnswerCard: { ...q1Card, diagnosis },
      readyAt: new Date().toISOString()
    };
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  const ready = parseReadyFreeTeaserCheckpoint(checkpoint);
  return {
    checkpoint: ready,
    questionSet,
    q1AnswerCard: ready.q1AnswerCard!,
    metrics: ready.metrics!
  };
}

export function freeTeaserCheckpointFromJobCheckpoint(value: JobCheckpoint | null | undefined): FreeTeaserCheckpointV1 | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>).freeTeaser;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const row = candidate as Record<string, unknown>;
  if (row.version !== FREE_TEASER_CHECKPOINT_VERSION) return null;
  return candidate as FreeTeaserCheckpointV1;
}

export function parseReadyFreeTeaserCheckpoint(value: unknown): FreeTeaserCheckpointV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Free teaser checkpoint must be an object.");
  const checkpoint = value as FreeTeaserCheckpointV1;
  if (checkpoint.version !== FREE_TEASER_CHECKPOINT_VERSION || checkpoint.stage !== "ready") {
    throw new TypeError("Free teaser checkpoint is not ready.");
  }
  if (!isHash(checkpoint.identityHash) || !isHash(checkpoint.admissionContentIdentityHash) ||
      !isHash(checkpoint.foundationHash) || !isHash(checkpoint.questionSetIdentity) ||
      !checkpoint.questionSetId || !checkpoint.reportId || !checkpoint.admissionSnapshotId ||
      !checkpoint.q1AnswerCard || !checkpoint.q1AnswerResult || !checkpoint.metrics ||
      checkpoint.observationSnapshotIds?.length !== 3 || !checkpoint.readyAt) {
    throw new TypeError("Free teaser checkpoint is incomplete.");
  }
  if (checkpoint.q1AnswerCard.questionId !== checkpoint.q1AnswerResult.questionId ||
      !checkpoint.q1AnswerCard.diagnosis) {
    throw new TypeError("Free teaser Q1 identity is invalid.");
  }
  parseReportV4DiagnosisOutputForQuestion(checkpoint.q1AnswerCard.diagnosis, {
    questionId: checkpoint.q1AnswerCard.questionId,
    sourceEvidenceIds: checkpoint.q1AnswerCard.sources.map(({ sourceId }) => sourceId)
  });
  return checkpoint;
}

export function freeTeaserSeededQ1(
  checkpointValue: FreeTeaserCheckpointV1,
  questionSet: ConfirmedBusinessQuestionSet
): FreeTeaserSeededQ1 {
  const checkpoint = parseReadyFreeTeaserCheckpoint(checkpointValue);
  if (checkpoint.questionSetIdentity !== questionSet.contentHash) {
    throw new Error("Paid V3 question set does not match the free teaser.");
  }
  const card = checkpoint.q1AnswerCard!;
  return {
    questionSetIdentity: checkpoint.questionSetIdentity!,
    providerId: card.provenance.providerId,
    model: card.provenance.model,
    searchMode: card.provenance.searchMode,
    locale: checkpoint.locale,
    region: checkpoint.region,
    answerResult: checkpoint.q1AnswerResult!
  };
}

export function buildFreeTeaserDiagnosisTargetPages(
  questionId: string,
  admission: ReportV4SiteSnapshotBundle
): readonly ReportV4DiagnosisTargetPage[] {
  return admission.pages.filter(({ analyzable, summary }) => analyzable && Boolean(summary?.trim()))
    .slice(0, 10)
    .map((page) => {
      const summary = page.summary!.trim();
      const locationId = questionId + ":target:" + sha({
        snapshotId: admission.snapshot.id,
        pageId: page.id,
        contentHash: page.contentHash
      });
      return Object.freeze({
        questionId,
        pageId: page.id,
        url: page.normalizedUrl,
        relevanceReason: "Persisted target-site evidence from the exact free admission snapshot.",
        summary,
        sourceLocations: Object.freeze([{
          locationId,
          startOffset: 0,
          endOffset: summary.length
        }])
      });
    });
}

async function observeTeaserQuestions(input: {
  reportId: string;
  jobId: string;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  questionSet: ConfirmedBusinessQuestionSet;
  evidenceCutoffAt: string;
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>;
  signal?: AbortSignal;
}): Promise<{ snapshotIds: readonly [string, string, string]; metrics: FreeTeaserMetrics }> {
  const questions = toCanonicalBuyerQuestionSet(input.questionSet);
  const exclusions: CustomerIdentityExclusion[] = [
    { kind: "customer_domain", value: new URL(input.targetUrl).hostname },
    ...(input.foundation.organizationProfile.brandNames ?? []).map((value) => ({ kind: "customer_brand" as const, value }))
  ];
  const fanouts = createPublicSourceQuestionFanouts({
    questions,
    authority: input.runtime.authority,
    excludedIdentities: exclusions
  });
  const gate = createConcurrencyGate(3);
  const snapshots = [];
  for (const [index, fanout] of fanouts.entries()) {
    input.signal?.throwIfAborted();
    snapshots.push(await resolvePublicSourceSnapshot({
      authority: input.runtime.authority,
      adapter: input.runtime.adapter,
      question: questions.questions[index]!,
      fanout,
      evidenceCutoffAt: input.evidenceCutoffAt,
      leaseOwner: "free-teaser:" + input.jobId + ":" + questions.questions[index]!.id,
      signal: input.signal,
      retrievalGate: gate,
      maxSourceRetrievals: 3,
      maxAvailableSources: 1,
      snapshotMetadata: {
        snapshotKind: "standard_question",
        queryPlanVersion: fanout.fanoutVersion
      }
    }));
  }
  const snapshotIds = snapshots.map(({ snapshotId }) => snapshotId) as [string, string, string];
  return {
    snapshotIds,
    metrics: measurePresence(
      input.targetUrl,
      input.foundation,
      snapshots.map(({ observations }) => observations)
    )
  };
}

async function answerTeaserQuestionOne(input: {
  questionSet: ConfirmedBusinessQuestionSet;
  targetUrl: string;
  locale: string;
  region: string;
  signal?: AbortSignal;
}): Promise<{ answerResult: GenerativeSearchAnswerResult; card: GenerativeSearchAnswerCardV3 }> {
  const provider: GenerativeSearchAnswerProvider = resolveGenerativeSearchAnswerProvider(process.env, {
    locale: input.locale,
    region: input.region
  });
  const canonical = toCanonicalBuyerQuestionSet(input.questionSet).questions[0]!;
  const question = input.questionSet.questions[0]!;
  const raw = await provider.answerWithSources({
    questionId: canonical.id,
    question: question.privateText,
    locale: input.locale,
    region: input.region,
    signal: input.signal ?? new AbortController().signal
  });
  const parsed = parseGenerativeSearchAnswerResult(raw, {
    expectedQuestionId: canonical.id,
    locale: input.locale
  });
  if (!parsed.answerText || parsed.refusal || parsed.sources.length === 0) {
    throw new Error("Free teaser Q1 requires one complete answer with sources.");
  }
  const sources = parsed.sources.map((source) => ({
    ...source,
    retrievalStatus: "search_source_only" as const,
    ownershipCategory: "unknown" as const
  }));
  const [answerHash, sourceHash] = await Promise.all([
    generativeSearchAnswerHash(parsed),
    generativeSearchSourceHash(parsed.sources)
  ]);
  const card: GenerativeSearchAnswerCardV3 = {
    answerMode: "generative_search_v1",
    questionId: parsed.questionId,
    exactQuestion: question.privateText,
    status: "answered",
    answerText: parsed.answerText,
    sources,
    provenance: {
      providerId: provider.providerId,
      model: provider.model,
      searchMode: provider.searchMode,
      promptVersion: "generative-search-answer-v1",
      searchedAt: parsed.searchedAt,
      completedAt: parsed.completedAt,
      answerHash,
      sourceHash
    },
    refusal: null,
    geoDiagnosis: diagnoseGenerativeSearchAnswerCardV3(
      { answerText: parsed.answerText, sources },
      {
        exactQuestion: question.privateText,
        locale: input.locale,
        targetAliases: input.questionSet.identityExclusions,
        competitors: [],
        missingEvidenceFamilies: []
      }
    ),
    audit: {
      verifiedBodyCount: 0,
      searchSourceOnlyCount: sources.length,
      inaccessibleCount: 0
    }
  };
  return { answerResult: parsed, card };
}

function toDiagnosisQuestion(card: GenerativeSearchAnswerCardV3): CombinedGeoReportV4Question {
  return {
    order: 1,
    questionId: card.questionId,
    questionText: card.exactQuestion,
    status: "answered",
    answer: card.answerText,
    sources: card.sources.slice(0, REPORT_V4_MAX_DIAGNOSIS_SOURCES).map((source) => ({
      questionId: card.questionId,
      sourceId: source.sourceId,
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      citedText: source.citedText,
      retrievalStatus: source.retrievalStatus === "verified_body"
        ? "available"
        : source.retrievalStatus === "inaccessible"
          ? "inaccessible"
          : "not_checked"
    }))
  };
}

function measurePresence(
  targetUrl: string,
  foundation: AiWebsiteReportV1,
  observationGroups: readonly (readonly MarketSearchObservation[])[]
): FreeTeaserMetrics {
  const targetHost = new URL(targetUrl).hostname.replace(/^www\./u, "").toLocaleLowerCase();
  const aliases = [
    targetHost,
    foundation.organizationProfile.organizationName,
    foundation.organizationProfile.legalEntity,
    ...(foundation.organizationProfile.brandNames ?? [])
  ].filter((value): value is string => Boolean(value?.trim())).map(normalize);
  let brandMentionCount = 0;
  let competitorMentionCount = 0;
  for (const observations of observationGroups) {
    const results = observations.flatMap(({ results }) => results);
    const mentionsTarget = results.some((result) => {
      const haystack = normalize([result.displayedHost, result.title, result.snippet].join(" "));
      return aliases.some((alias) => alias.length >= 3 && haystack.includes(alias));
    });
    const mentionsOther = results.some((result) => {
      const haystack = normalize([result.displayedHost, result.title, result.snippet].join(" "));
      return !aliases.some((alias) => alias.length >= 3 && haystack.includes(alias));
    });
    if (mentionsTarget) brandMentionCount += 1;
    if (mentionsOther) competitorMentionCount += 1;
  }
  return { questionCount: 3, brandMentionCount, competitorMentionCount };
}
function assertTerminalAdmission(bundle: ReportV4SiteSnapshotBundle, reportId: string): void {
  if (bundle.snapshot.reportId !== reportId ||
      !["completed", "completed_limited"].includes(bundle.snapshot.status) ||
      !bundle.snapshot.contentIdentityHash ||
      !bundle.pages.some(({ analyzable, summary }) => analyzable && Boolean(summary?.trim()))) {
    throw new Error("Free teaser requires one terminal analyzable Admission snapshot.");
  }
}

function assertCheckpointIdentity(
  checkpoint: FreeTeaserCheckpointV1,
  expected: {
    reportId: string;
    admissionSnapshotId: string;
    admissionContentIdentityHash: string;
    foundationHash: string;
    locale: string;
    region: string;
    authorityId: string;
  },
  identityHash: string
): void {
  if (checkpoint.version !== FREE_TEASER_CHECKPOINT_VERSION ||
      checkpoint.identityHash !== identityHash ||
      checkpoint.reportId !== expected.reportId ||
      checkpoint.admissionSnapshotId !== expected.admissionSnapshotId ||
      checkpoint.admissionContentIdentityHash !== expected.admissionContentIdentityHash ||
      checkpoint.foundationHash !== expected.foundationHash ||
      checkpoint.locale !== expected.locale ||
      checkpoint.region !== expected.region ||
      checkpoint.authorityId !== expected.authorityId) {
    throw new Error("Free teaser checkpoint identity does not match the current Admission authority.");
  }
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sha(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export async function loadConfirmedFreeTeaserQuestionSet(
  reportId: string,
  checkpoint: FreeTeaserCheckpointV1
): Promise<ConfirmedBusinessQuestionSet> {
  const ready = parseReadyFreeTeaserCheckpoint(checkpoint);
  const questionSet = await getConfirmedBusinessQuestionSet(reportId, ready.questionSetId!);
  if (!questionSet || questionSet.contentHash !== ready.questionSetIdentity) {
    throw new Error("Free teaser question-set authority is unavailable.");
  }
  return questionSet;
}
