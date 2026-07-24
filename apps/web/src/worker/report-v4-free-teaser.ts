import { createHash } from "node:crypto";
import {
  REPORT_V4_MAX_DIAGNOSIS_SOURCES,
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  applyReportSemanticReview,
  buildFreeV4SemanticReviewManifest,
  buildReportSemanticReviewSystemPrompt,
  deriveFreeObservationMetrics,
  diagnoseGenerativeSearchAnswerCardV3,
  generativeSearchAnswerHash,
  generativeSearchSourceHash,
  hashReportSemanticReviewValue,
  parseGenerativeSearchAnswerResult,
  parseReportV4DiagnosisOutputForQuestion,
  parseReportSemanticReviewOutput,
  reportSemanticTextHash,
  runOfflineReportSemanticReview,
  verifyReportSemanticReviewReceipt,
  type AiWebsiteReportV1,
  type CombinedGeoReportV4Question,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerProvider,
  type GenerativeSearchAnswerResult,
  type ReportV4DiagnosisTargetPage,
  type AppliedReportSemanticReview,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewOutput
} from "@open-geo-console/ai-report-engine";
import {
  createMarketSnapshotIdentity,
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet,
  type CustomerIdentityExclusion,
  type MarketSearchObservation,
  type SearchQueryFanout
} from "@open-geo-console/public-search-observer";
import { createSiteKey } from "@open-geo-console/site-crawler";
import {
  confirmBusinessQuestions,
  getConfirmedBusinessQuestionSet,
  prepareBusinessQuestionCandidates
} from "@/db/business-questions";
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import type { JobCheckpoint } from "@/db/schema";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import type { ReportV4SiteSnapshotBundle } from "@/db/report-v4-site-snapshots";
import { resolveGenerativeSearchAnswerProvider, resolveProductionPublicSearchRuntime } from "@/public-source-forensics/production-runtime";
import { buildReportV4MimoDiagnosisTokenBudget, createReportV4MimoDiagnosisProvider, createReportV4MimoStructuredInvoker } from "@/report-v4/mimo-provider";
import { loadReportV4ModelRuntimeConfig } from "@/report-v4/model-runtime-config";
import { createConcurrencyGate } from "./bounded-scheduler";
import { enhanceReportV4QuestionDiagnosis } from "./report-v4-diagnosis-enhancer";
import { createPublicSourceQuestionFanouts } from "./public-source-forensics";
import { resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";

export const FREE_TEASER_CHECKPOINT_VERSION = "free-teaser-checkpoint-v1" as const;
export type FreeTeaserStage = "questions_ready" | "observations_ready" | "q1_answer_ready" | "ready";

type FreeTeaserQ1Draft = Omit<GenerativeSearchAnswerCardV3, "geoDiagnosis" | "diagnosis">;
type MarketSnapshotBundle = NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>;
type VerifiedFreeTeaserSnapshotBundles = readonly [MarketSnapshotBundle, MarketSnapshotBundle, MarketSnapshotBundle];
export interface FreeTeaserSemanticReviewProjection {
  readonly version: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly input: ReportSemanticReviewInput;
  readonly output: ReportSemanticReviewOutput;
  readonly applied: AppliedReportSemanticReview;
}

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
  readonly q1AnswerDraft?: FreeTeaserQ1Draft;
  readonly q1DiagnosisDraft?: NonNullable<GenerativeSearchAnswerCardV3["diagnosis"]>;
  readonly semanticReview?: FreeTeaserSemanticReviewProjection;
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
  semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null;
  saveCheckpoint: FreeTeaserCheckpointWriter;
  signal?: AbortSignal;
}): Promise<FreeTeaserResult> {
  input.signal?.throwIfAborted();
  assertTerminalAdmission(input.admission, input.reportId);
  const semanticReviewEnabled = input.semanticReviewContractVersion === REPORT_SEMANTIC_REVIEW_CONTRACT;
  if (input.semanticReviewContractVersion !== null && input.semanticReviewContractVersion !== undefined && !semanticReviewEnabled) {
    throw new Error("Unsupported Free teaser semantic-review contract.");
  }

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
  if (checkpoint) {
    assertCheckpointIdentity(checkpoint, identityCore, identityHash);
    assertSemanticReviewCheckpointMode(checkpoint, semanticReviewEnabled);
  }
  const evidenceCutoffAt = checkpoint?.evidenceCutoffAt ?? new Date().toISOString();

  let questionSet: ConfirmedBusinessQuestionSet;
  if (semanticReviewEnabled && checkpoint?.stage === "ready") {
    if (!checkpoint.questionSetId || !checkpoint.questionSetIdentity) throw new Error("Marked Free teaser ready checkpoint has no question-set authority.");
    const persistedQuestionSet = await getConfirmedBusinessQuestionSet(input.reportId, checkpoint.questionSetId);
    if (!persistedQuestionSet || persistedQuestionSet.contentHash !== checkpoint.questionSetIdentity) {
      throw new Error("Marked Free teaser question-set authority is unavailable.");
    }
    questionSet = persistedQuestionSet;
  } else {
    const candidates = await prepareBusinessQuestionCandidates({
      reportId: input.reportId,
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region,
      foundation: input.foundation
    });
    questionSet = await confirmBusinessQuestions({
      reportId: input.reportId,
      questionSetId: candidates.id,
      finalTexts: candidates.questions.map(({ neutralPublicText }) => neutralPublicText),
      acknowledgedLowConfidence: candidates.confidence === "low",
      deferSemanticDistinctness: semanticReviewEnabled
    });
  }
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

  if (!checkpoint.observationSnapshotIds || (!semanticReviewEnabled && !checkpoint.metrics)) {
    const observed = await observeTeaserQuestions({
      reportId: input.reportId,
      jobId: input.jobId,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      questionSet,
      evidenceCutoffAt,
      runtime,
      semanticReviewEnabled,
      signal: input.signal
    });
    checkpoint = {
      ...checkpoint,
      stage: "observations_ready",
      observationSnapshotIds: observed.snapshotIds,
      ...(observed.metrics ? { metrics: observed.metrics } : {})
    };
    await input.saveCheckpoint(checkpoint, "snapshot_resolution");
  }

  let verifiedSnapshotBundles: VerifiedFreeTeaserSnapshotBundles | undefined;
  if (semanticReviewEnabled) {
    if (!checkpoint.observationSnapshotIds) throw new Error("Marked Free teaser has no persisted observation snapshots.");
    verifiedSnapshotBundles = await loadVerifiedFreeTeaserSnapshotBundles({
      snapshotIds: checkpoint.observationSnapshotIds,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      questionSet,
      runtime
    });
    if (checkpoint.stage === "ready") {
      verifyReadyFreeTeaserExternalProjection({
        checkpoint,
        targetUrl: input.targetUrl,
        foundation: input.foundation,
        admission: input.admission,
        questionSet,
        runtime,
        bundles: verifiedSnapshotBundles
      });
    }
  }

  if (checkpoint.stage !== "ready" && (!checkpoint.q1AnswerResult || (semanticReviewEnabled ? !checkpoint.q1AnswerDraft : !checkpoint.q1AnswerCard))) {
    const q1 = await answerTeaserQuestionOne({
      questionSet,
      targetUrl: input.targetUrl,
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region,
      signal: input.signal,
      semanticReviewEnabled
    });
    const answeredCheckpoint: FreeTeaserCheckpointV1 = {
      ...checkpoint,
      stage: "q1_answer_ready",
      q1AnswerResult: q1.answerResult,
      ...(semanticReviewEnabled ? { q1AnswerDraft: q1.draft } : { q1AnswerCard: q1.card! })
    };
    if (semanticReviewEnabled) {
      await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint: answeredCheckpoint, questionSet, targetUrl: input.targetUrl, admission: input.admission });
    }
    checkpoint = answeredCheckpoint;
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  if (semanticReviewEnabled && checkpoint.stage === "q1_answer_ready") {
    await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint, questionSet, targetUrl: input.targetUrl, admission: input.admission });
  }

  if (checkpoint.stage !== "ready" && !(semanticReviewEnabled && checkpoint.q1DiagnosisDraft)) {
    const q1Card = semanticReviewEnabled ? checkpoint.q1AnswerDraft! : checkpoint.q1AnswerCard!;
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
      signal: input.signal,
      semanticValidation: semanticReviewEnabled ? "deferred" : "legacy"
    });
    if (diagnosisResult.status !== "completed") {
      throw new Error("Free teaser Q1 diagnosis did not complete.");
    }
    const diagnosis = parseReportV4DiagnosisOutputForQuestion(diagnosisResult.diagnosis, {
      questionId: q1Card.questionId,
      sourceEvidenceIds: q1Card.sources.map(({ sourceId }) => sourceId)
    }, { semanticValidation: semanticReviewEnabled ? "deferred" : "legacy" });
    if (semanticReviewEnabled) {
      const diagnosedCheckpoint: FreeTeaserCheckpointV1 = { ...checkpoint, stage: "q1_answer_ready", q1DiagnosisDraft: diagnosis };
      await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint: diagnosedCheckpoint, questionSet, targetUrl: input.targetUrl, admission: input.admission });
      checkpoint = diagnosedCheckpoint;
      await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
    } else {
      checkpoint = {
        ...checkpoint,
        stage: "ready",
        q1AnswerCard: { ...(q1Card as GenerativeSearchAnswerCardV3), diagnosis },
        readyAt: new Date().toISOString()
      };
      await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
    }
  }

  if (semanticReviewEnabled && checkpoint.stage !== "ready") {
    const reviewedCheckpoint = await reviewFreeTeaser({ ...input, checkpoint, questionSet, runtime, bundles: verifiedSnapshotBundles! });
    const verifiedReady = parseReadyFreeTeaserCheckpoint(reviewedCheckpoint, {
      semanticReviewContractVersion: input.semanticReviewContractVersion
    });
    verifyReadyFreeTeaserExternalProjection({
      checkpoint: verifiedReady,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      admission: input.admission,
      questionSet,
      runtime,
      bundles: verifiedSnapshotBundles!
    });
    checkpoint = verifiedReady;
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  const ready = parseReadyFreeTeaserCheckpoint(checkpoint, {
    semanticReviewContractVersion: input.semanticReviewContractVersion
  });
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

export function parseReadyFreeTeaserCheckpoint(
  value: unknown,
  options?: { semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null }
): FreeTeaserCheckpointV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Free teaser checkpoint must be an object.");
  const checkpoint = value as FreeTeaserCheckpointV1;
  if (checkpoint.version !== FREE_TEASER_CHECKPOINT_VERSION || checkpoint.stage !== "ready") {
    throw new TypeError("Free teaser checkpoint is not ready.");
  }
  if (!isHash(checkpoint.identityHash) || !isHash(checkpoint.admissionContentIdentityHash) ||
      !isHash(checkpoint.foundationHash) || !isConfirmedBusinessQuestionSetIdentity(checkpoint.questionSetIdentity) ||
      !checkpoint.questionSetId || !checkpoint.reportId || !checkpoint.admissionSnapshotId ||
      !checkpoint.q1AnswerCard || !checkpoint.q1AnswerResult || !checkpoint.metrics ||
      checkpoint.observationSnapshotIds?.length !== 3 || !checkpoint.readyAt) {
    throw new TypeError("Free teaser checkpoint is incomplete.");
  }
  if (checkpoint.q1AnswerCard.questionId !== checkpoint.q1AnswerResult.questionId ||
      !checkpoint.q1AnswerCard.diagnosis) {
    throw new TypeError("Free teaser Q1 identity is invalid.");
  }
  const semanticReviewEnabled = options?.semanticReviewContractVersion === REPORT_SEMANTIC_REVIEW_CONTRACT;
  if (options?.semanticReviewContractVersion !== null && options?.semanticReviewContractVersion !== undefined && !semanticReviewEnabled) {
    throw new TypeError("Unsupported Free teaser semantic-review contract.");
  }
  if (semanticReviewEnabled !== Boolean(checkpoint.semanticReview)) {
    throw new TypeError("Free teaser ready checkpoint does not match root semantic-review lineage.");
  }
  parseReportV4DiagnosisOutputForQuestion(checkpoint.q1AnswerCard.diagnosis, {
    questionId: checkpoint.q1AnswerCard.questionId,
    sourceEvidenceIds: checkpoint.q1AnswerCard.sources.map(({ sourceId }) => sourceId)
  }, { semanticValidation: semanticReviewEnabled ? "deferred" : "legacy" });
  if (semanticReviewEnabled) verifyFreeTeaserSemanticProjection(checkpoint);
  return checkpoint;
}

function verifyFreeTeaserSemanticProjection(checkpoint: FreeTeaserCheckpointV1): void {
  const projection = checkpoint.semanticReview!;
  if (projection.version !== REPORT_SEMANTIC_REVIEW_CONTRACT) throw new TypeError("Free teaser semantic review version is invalid.");
  const output = parseReportSemanticReviewOutput(projection.output, projection.input);
  const applied = applyReportSemanticReview(projection.input, output);
  verifyReportSemanticReviewReceipt(projection.applied.receipt, projection.input, output, projection.applied.fields);
  if (hashReportSemanticReviewValue(applied) !== hashReportSemanticReviewValue(projection.applied)) throw new TypeError("Free teaser semantic review applied projection is stale.");
  const actual = new Map<string, string>([
    ["q1AnswerCard.answerText", checkpoint.q1AnswerCard!.answerText],
    ["q1Diagnosis.selectionSummary", checkpoint.q1AnswerCard!.diagnosis!.selectionSummary],
    ["q1Diagnosis.targetGap", checkpoint.q1AnswerCard!.diagnosis!.targetGap],
    ...checkpoint.q1AnswerCard!.diagnosis!.observableFactors.map((factor, index) => [`q1Diagnosis.observableFactors[${index}].observation`, factor.observation] as const),
    ...checkpoint.q1AnswerCard!.diagnosis!.recommendedActions.map((action, index) => [`q1Diagnosis.recommendedActions[${index}].action`, action.action] as const)
  ]);
  for (const field of projection.applied.fields) {
    if (actual.has(field.path) && actual.get(field.path) !== field.appliedText) throw new TypeError(`Free teaser semantic field ${field.path} does not match the checkpoint.`);
  }
  const annotation = output.annotations.answers[0];
  if (!annotation || annotation.targetPresence === undefined || annotation.competitorEntityIds === undefined ||
      checkpoint.q1AnswerCard!.geoDiagnosis.targetMentioned !== (annotation.targetPresence === "present") ||
      checkpoint.q1AnswerCard!.geoDiagnosis.targetFirstSentence !== (annotation.targetPresence === "present" ? annotation.targetFirstSentence : null) ||
      sha(checkpoint.q1AnswerCard!.geoDiagnosis.targetRoles) !== sha(annotation.targetRoles) ||
      sha(checkpoint.q1AnswerCard!.geoDiagnosis.competitorEntityIds) !== sha(annotation.competitorEntityIds) ||
      hashReportSemanticReviewValue(checkpoint.q1AnswerCard!.geoDiagnosis.citedOwnership) !== hashReportSemanticReviewValue(ownershipCountsFromSources(checkpoint.q1AnswerCard!.sources)) ||
      checkpoint.q1AnswerCard!.geoDiagnosis.missingEvidenceFamilies.length !== 0 ||
      checkpoint.q1AnswerCard!.geoDiagnosis.retestQuestion !== checkpoint.q1AnswerCard!.exactQuestion) {
    throw new TypeError("Free teaser semantic Q1 diagnosis does not match its verified annotations.");
  }
  if (checkpoint.q1AnswerResult!.answerText !== checkpoint.q1AnswerCard!.answerText) {
    throw new TypeError("Free teaser semantic Q1 answer result does not match the reviewed card.");
  }
  const parsedAnswer = parseGenerativeSearchAnswerResult(checkpoint.q1AnswerResult, {
    expectedQuestionId: checkpoint.q1AnswerCard!.questionId,
    locale: checkpoint.locale,
    semanticValidation: "deferred"
  });
  if (checkpoint.q1AnswerCard!.provenance.answerHash !== sha(JSON.stringify(parsedAnswer))) {
    throw new TypeError("Free teaser semantic Q1 answer hash does not match the reviewed result.");
  }
  const resultSources = parsedAnswer.sources.map(canonicalAnswerSourceProjection);
  const cardSources = checkpoint.q1AnswerCard!.sources.map(canonicalAnswerSourceProjection);
  if (sha(resultSources) !== sha(cardSources) ||
      checkpoint.q1AnswerCard!.provenance.sourceHash !== canonicalAnswerSourceHash(parsedAnswer.sources) ||
      checkpoint.q1AnswerCard!.provenance.searchedAt !== parsedAnswer.searchedAt ||
      checkpoint.q1AnswerCard!.provenance.completedAt !== parsedAnswer.completedAt) {
    throw new TypeError("Free teaser semantic Q1 source provenance does not match the reviewed result.");
  }
  const actualNonProseHash = freeTeaserNonProseProjectionHash({
    reportId: checkpoint.reportId,
    identityHash: checkpoint.identityHash,
    questionSetIdentity: checkpoint.questionSetIdentity!,
    observationSnapshotIds: checkpoint.observationSnapshotIds!,
    card: checkpoint.q1AnswerCard!,
    diagnosis: checkpoint.q1AnswerCard!.diagnosis!
  });
  if (projection.input.nonProseProjectionHash !== actualNonProseHash) {
    throw new TypeError("Free teaser semantic non-prose projection does not match the checkpoint.");
  }
  const metricCounts = deriveFreeObservationMetrics(output);
  if (checkpoint.metrics!.brandMentionCount !== metricCounts.targetMentionCount || checkpoint.metrics!.competitorMentionCount !== metricCounts.competitorMentionCount) {
    throw new TypeError("Free teaser semantic metrics do not match verified annotations.");
  }
}

export function freeTeaserSeededQ1(
  checkpointValue: FreeTeaserCheckpointV1,
  questionSet: ConfirmedBusinessQuestionSet,
  options: { semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null } = {}
): FreeTeaserSeededQ1 {
  const checkpoint = parseReadyFreeTeaserCheckpoint(checkpointValue, options);
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
        relevanceReason: "The page contains directly verifiable information relevant to this question.",
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
  semanticReviewEnabled: boolean;
  signal?: AbortSignal;
}): Promise<{ snapshotIds: readonly [string, string, string]; metrics?: FreeTeaserMetrics }> {
  const questions = toCanonicalBuyerQuestionSet(input.questionSet);
  const fanouts = createFreeTeaserFanouts(input.questionSet, input.targetUrl, input.foundation, input.runtime);
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
      searchConcurrency: 1,
      snapshotMetadata: {
        snapshotKind: "standard_question",
        queryPlanVersion: fanout.fanoutVersion
      }
    }));
  }
  const snapshotIds = snapshots.map(({ snapshotId }) => snapshotId) as [string, string, string];
  return {
    snapshotIds,
    ...(input.semanticReviewEnabled ? {} : { metrics: measurePresence(
      input.targetUrl,
      input.foundation,
      snapshots.map(({ observations }) => observations)
    ) })
  };
}

function createFreeTeaserFanouts(
  questionSet: ConfirmedBusinessQuestionSet,
  targetUrl: string,
  foundation: AiWebsiteReportV1,
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>
): readonly SearchQueryFanout[] {
  const exclusions: CustomerIdentityExclusion[] = [
    { kind: "customer_domain", value: new URL(targetUrl).hostname },
    ...(foundation.organizationProfile.brandNames ?? []).map((value) => ({ kind: "customer_brand" as const, value }))
  ];
  return createPublicSourceQuestionFanouts({
    questions: toCanonicalBuyerQuestionSet(questionSet),
    authority: runtime.authority,
    excludedIdentities: exclusions
  }).map((fanout) => ({
    ...fanout,
    queries: fanout.queries.slice(0, 3),
    budget: { ...fanout.budget, timeoutMs: 60_000 }
  }));
}

async function loadVerifiedFreeTeaserSnapshotBundles(input: {
  snapshotIds: readonly [string, string, string];
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>;
}): Promise<VerifiedFreeTeaserSnapshotBundles> {
  const canonicalQuestions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  const fanouts = createFreeTeaserFanouts(input.questionSet, input.targetUrl, input.foundation, input.runtime);
  const bundles = await Promise.all(input.snapshotIds.map((id) => getMarketSnapshotBundle(id)));
  for (const [index, bundle] of bundles.entries()) {
    if (!bundle) throw new Error("Marked Free teaser snapshot authority is unavailable.");
    verifyFreeTeaserSnapshotBundle({
      bundle,
      snapshotId: input.snapshotIds[index]!,
      question: canonicalQuestions[index]!,
      fanout: fanouts[index]!,
      authority: input.runtime.authority
    });
  }
  return bundles as unknown as VerifiedFreeTeaserSnapshotBundles;
}

function verifyFreeTeaserSnapshotBundle(input: {
  bundle: MarketSnapshotBundle;
  snapshotId: string;
  question: ReturnType<typeof toCanonicalBuyerQuestionSet>["questions"][number];
  fanout: SearchQueryFanout;
  authority: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>["authority"];
}): void {
  const { bundle, snapshotId, question, fanout, authority } = input;
  const snapshot = bundle.snapshot;
  const identity = createMarketSnapshotIdentity({ question, surface: authority.surface, fanout });
  const expectedQueries = fanout.queries.map((query, queryOrder) => ({
    queryOrder,
    queryText: query.exactQuery,
    queryHash: sha(query.exactQuery),
    derivationRule: query.derivationRuleId
  }));
  const snapshotMatches = snapshot.id === snapshotId && snapshot.cacheIdentity === identity.id && snapshot.status === "completed" &&
    snapshot.normalizedQuestion === identity.normalizedQuestion && snapshot.questionHash === sha(question.normalizedText) &&
    snapshot.locale === identity.locale && snapshot.region === identity.region &&
    snapshot.surfaceAuthorityVersion === authority.authorityId && snapshot.surfaceId === identity.surfaceId &&
    snapshot.surfaceVersion === identity.surfaceVersion && snapshot.fanoutVersion === identity.fanoutVersion &&
    snapshot.snapshotKind === "standard_question" && snapshot.parentSnapshotId == null && snapshot.candidateSetHash == null &&
    snapshot.queryPlanVersion === fanout.fanoutVersion && isHash(snapshot.queryFanoutHash);
  const queryIds = new Set<string>();
  const queriesMatch = bundle.queries.length === expectedQueries.length && expectedQueries.every((expected, index) => {
    const actual = bundle.queries[index];
    if (!actual || !/^market-snapshot-query-[a-f0-9]{64}$/u.test(actual.id) || queryIds.has(actual.id)) return false;
    queryIds.add(actual.id);
    return actual.snapshotId === snapshotId && actual.queryOrder === expected.queryOrder &&
      actual.queryText === expected.queryText && actual.queryHash === expected.queryHash && actual.derivationRule === expected.derivationRule;
  });
  const attemptIds = new Set<string>();
  const terminalStatuses = new Set(["succeeded", "partial", "timeout", "rate_limited", "unavailable", "malformed", "aborted", "authentication", "unsupported"]);
  const successfulStatuses = new Set(["succeeded", "partial"]);
  const attemptsMatch = bundle.attempts.length > 0 && bundle.attempts.every((attempt) => {
    if (attemptIds.has(attempt.id)) return false;
    attemptIds.add(attempt.id);
    return attempt.snapshotId === snapshotId && queryIds.has(attempt.queryId) && attempt.authorityVersion === authority.authorityId && terminalStatuses.has(attempt.requestStatus);
  }) && bundle.queries.every(({ id }) => bundle.attempts.some((attempt) => attempt.queryId === id)) &&
    bundle.attempts.some((attempt) => successfulStatuses.has(attempt.requestStatus));
  const attemptById = new Map(bundle.attempts.map((attempt) => [attempt.id, attempt]));
  const resultIds = new Set<string>();
  const observationsMatch = bundle.observations.every((row) => {
    const attempt = attemptById.get(row.attemptId);
    if (resultIds.has(row.id)) return false;
    resultIds.add(row.id);
    return row.resultStatus === "returned" && row.snapshotId === snapshotId && queryIds.has(row.queryId) && attempt?.snapshotId === snapshotId &&
      attempt.queryId === row.queryId && successfulStatuses.has(attempt.requestStatus);
  });
  if (!snapshotMatches || !queriesMatch || !attemptsMatch || !observationsMatch) {
    throw new Error("Marked Free teaser snapshot authority is unavailable.");
  }
}

async function answerTeaserQuestionOne(input: {
  questionSet: ConfirmedBusinessQuestionSet;
  targetUrl: string;
  locale: string;
  region: string;
  signal?: AbortSignal;
  semanticReviewEnabled: boolean;
}): Promise<{ answerResult: GenerativeSearchAnswerResult; draft: FreeTeaserQ1Draft; card?: GenerativeSearchAnswerCardV3 }> {
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
    signal: input.signal ?? new AbortController().signal,
    ...(input.semanticReviewEnabled ? { semanticValidation: "deferred" as const } : {})
  });
  const parsed = parseGenerativeSearchAnswerResult(raw, {
    expectedQuestionId: canonical.id,
    locale: input.locale,
    semanticValidation: input.semanticReviewEnabled ? "deferred" : "legacy"
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
    generativeSearchAnswerHash(parsed, { semanticValidation: input.semanticReviewEnabled ? "deferred" : "legacy", locale: input.locale }),
    generativeSearchSourceHash(parsed.sources)
  ]);
  const draft: FreeTeaserQ1Draft = {
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
    audit: {
      verifiedBodyCount: 0,
      searchSourceOnlyCount: sources.length,
      inaccessibleCount: 0
    }
  };
  let card: GenerativeSearchAnswerCardV3 | undefined;
  if (!input.semanticReviewEnabled) {
    const { audit, ...cardCore } = draft;
    card = {
      ...cardCore,
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
      audit
    };
  }
  return { answerResult: parsed, draft, card };
}

async function verifyMarkedFreeTeaserDraftCheckpoint(input: {
  checkpoint: FreeTeaserCheckpointV1;
  questionSet: ConfirmedBusinessQuestionSet;
  targetUrl: string;
  admission: ReportV4SiteSnapshotBundle;
}): Promise<void> {
  const { checkpoint } = input;
  const result = checkpoint.q1AnswerResult;
  const draft = checkpoint.q1AnswerDraft;
  if (checkpoint.stage !== "q1_answer_ready" || !result || !draft || checkpoint.questionSetIdentity !== input.questionSet.contentHash) {
    throw new Error("Marked Free teaser answer draft authority is incomplete.");
  }
  const canonicalQuestion = toCanonicalBuyerQuestionSet(input.questionSet).questions[0]!;
  const expectedQuestion = input.questionSet.questions[0]!.privateText;
  if (createSiteKey(input.targetUrl) !== input.admission.snapshot.siteKey || draft.questionId !== canonicalQuestion.id || draft.exactQuestion !== expectedQuestion ||
      draft.answerMode !== "generative_search_v1" || draft.status !== "answered" || draft.refusal !== null) {
    throw new Error("Marked Free teaser answer draft does not match its question or target authority.");
  }
  const parsed = parseGenerativeSearchAnswerResult(result, {
    expectedQuestionId: canonicalQuestion.id,
    locale: checkpoint.locale,
    semanticValidation: "deferred"
  });
  if (!parsed.answerText || parsed.refusal || parsed.sources.length === 0 || parsed.answerText !== draft.answerText) {
    throw new Error("Marked Free teaser answer draft is incomplete or differs from its persisted result.");
  }
  const resultSources = parsed.sources.map(canonicalAnswerSourceProjection);
  const draftSources = draft.sources.map(canonicalAnswerSourceProjection);
  const [answerHash, sourceHash] = await Promise.all([
    generativeSearchAnswerHash(parsed, { semanticValidation: "deferred", locale: checkpoint.locale }),
    generativeSearchSourceHash(parsed.sources)
  ]);
  if (hashReportSemanticReviewValue(resultSources) !== hashReportSemanticReviewValue(draftSources) ||
      draft.provenance.answerHash !== answerHash || draft.provenance.sourceHash !== sourceHash ||
      draft.provenance.searchedAt !== parsed.searchedAt || draft.provenance.completedAt !== parsed.completedAt ||
      draft.sources.some((source) => source.retrievalStatus !== "search_source_only" || source.ownershipCategory !== "unknown") ||
      draft.audit.verifiedBodyCount !== 0 || draft.audit.searchSourceOnlyCount !== draft.sources.length || draft.audit.inaccessibleCount !== 0) {
    throw new Error("Marked Free teaser answer draft hash, source, time, or completeness binding is invalid.");
  }
  if (!checkpoint.q1DiagnosisDraft) return;
  const diagnosis = parseReportV4DiagnosisOutputForQuestion(checkpoint.q1DiagnosisDraft, {
    questionId: draft.questionId,
    sourceEvidenceIds: draft.sources.map(({ sourceId }) => sourceId)
  }, { semanticValidation: "deferred" });
  const targetEvidenceIds = new Set(buildFreeTeaserDiagnosisTargetPages(draft.questionId, input.admission)
    .flatMap((page) => page.sourceLocations.map(({ locationId }) => locationId)));
  const sourceIds = new Set(draft.sources.map(({ sourceId }) => sourceId));
  if (diagnosis.detailedEvidenceRefs.some((ref) => !sourceIds.has(ref) && !targetEvidenceIds.has(ref)) ||
      hashReportSemanticReviewValue(diagnosis) !== hashReportSemanticReviewValue(checkpoint.q1DiagnosisDraft)) {
    throw new Error("Marked Free teaser diagnosis draft does not match current source and target evidence.");
  }
}

function toDiagnosisQuestion(card: FreeTeaserQ1Draft | GenerativeSearchAnswerCardV3): CombinedGeoReportV4Question {
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

async function reviewFreeTeaser(input: {
  reportId: string;
  jobId: string;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  locale: "en" | "zh";
  admission: ReportV4SiteSnapshotBundle;
  checkpoint: FreeTeaserCheckpointV1;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>;
  bundles: VerifiedFreeTeaserSnapshotBundles;
  signal?: AbortSignal;
}): Promise<FreeTeaserCheckpointV1> {
  const checkpoint = input.checkpoint;
  const draft = checkpoint.q1AnswerDraft;
  const diagnosis = checkpoint.q1DiagnosisDraft;
  const snapshotIds = checkpoint.observationSnapshotIds;
  if (!draft || !diagnosis || !snapshotIds) throw new Error("Marked Free teaser review inputs are incomplete.");
  const runtime = loadReportV4ModelRuntimeConfig(process.env);
  const reviewInput = buildFreeTeaserSemanticReviewInput({ ...input, card: draft, diagnosis, modelId: runtime.modelProfile.operations.websiteSynthesis.model });
  const structured = createReportV4MimoStructuredInvoker({ environment: process.env, lockedRuntime: runtime });
  const reviewed = await runOfflineReportSemanticReview(reviewInput, async ({ task, input: exactInput }) => structured.invoke({
    operation: "websiteSynthesis",
    systemText: buildReportSemanticReviewSystemPrompt(),
    inputText: JSON.stringify({ task, input: exactInput }),
    signal: input.signal ?? new AbortController().signal
  }));
  const answerAnnotation = reviewed.review.annotations.answers[0];
  if (!answerAnnotation || answerAnnotation.targetPresence === undefined || answerAnnotation.targetPresence === "ambiguous" || answerAnnotation.targetFirstSentence === undefined || answerAnnotation.targetRoles === undefined || answerAnnotation.competitorEntityIds === undefined) {
    throw new Error("Marked Free teaser review omitted durable Q1 diagnosis semantics.");
  }
  const expectedEntityRole = answerAnnotation.targetPresence === "present"
    ? answerAnnotation.competitorEntityIds.length ? "mixed" : "target"
    : answerAnnotation.competitorEntityIds.length ? "competitor" : "none";
  if (answerAnnotation.entityRole === "ambiguous" || answerAnnotation.entityRole !== expectedEntityRole) {
    throw new Error("Marked Free teaser review returned contradictory Q1 entity semantics.");
  }
  const textByPath = new Map(reviewed.applied.fields.map((field) => [field.path, field.appliedText]));
  const correctedDiagnosis = {
    ...diagnosis,
    selectionSummary: textByPath.get("q1Diagnosis.selectionSummary")!,
    observableFactors: diagnosis.observableFactors.map((factor, index) => ({ ...factor, observation: textByPath.get(`q1Diagnosis.observableFactors[${index}].observation`)! })) as unknown as typeof diagnosis.observableFactors,
    targetGap: textByPath.get("q1Diagnosis.targetGap")!,
    recommendedActions: diagnosis.recommendedActions.map((action, index) => ({ ...action, action: textByPath.get(`q1Diagnosis.recommendedActions[${index}].action`)! })) as unknown as typeof diagnosis.recommendedActions
  };
  const correctedAnswerText = textByPath.get("q1AnswerCard.answerText")!;
  const correctedAnswerResult = { ...checkpoint.q1AnswerResult!, answerText: correctedAnswerText };
  const correctedAnswerHash = await generativeSearchAnswerHash(correctedAnswerResult, { semanticValidation: "deferred", locale: checkpoint.locale });
  const q1AnswerCard: GenerativeSearchAnswerCardV3 = { ...draft, answerText: correctedAnswerText, provenance: { ...draft.provenance, answerHash: correctedAnswerHash }, geoDiagnosis: { targetMentioned: answerAnnotation.targetPresence === "present", targetFirstSentence: answerAnnotation.targetPresence === "present" ? answerAnnotation.targetFirstSentence : null, targetRoles: [...answerAnnotation.targetRoles], competitorEntityIds: [...answerAnnotation.competitorEntityIds], citedOwnership: ownershipCountsFromSources(draft.sources), missingEvidenceFamilies: [], retestQuestion: draft.exactQuestion }, diagnosis: correctedDiagnosis };
  const metrics = { questionCount: 3 as const, ...deriveFreeObservationMetrics(reviewed.review) };
  const checkpointCore = { ...checkpoint };
  delete checkpointCore.q1AnswerDraft;
  delete checkpointCore.q1DiagnosisDraft;
  return { ...checkpointCore, stage: "ready", metrics: { questionCount: 3, brandMentionCount: metrics.targetMentionCount, competitorMentionCount: metrics.competitorMentionCount }, q1AnswerResult: correctedAnswerResult, q1AnswerCard, semanticReview: { version: REPORT_SEMANTIC_REVIEW_CONTRACT, input: reviewInput, output: reviewed.review, applied: reviewed.applied }, readyAt: new Date().toISOString() };
}

function buildFreeTeaserSemanticReviewInput(input: {
  reportId: string;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  admission: ReportV4SiteSnapshotBundle;
  checkpoint: FreeTeaserCheckpointV1;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>;
  bundles: VerifiedFreeTeaserSnapshotBundles;
  card: FreeTeaserQ1Draft | GenerativeSearchAnswerCardV3;
  diagnosis: NonNullable<GenerativeSearchAnswerCardV3["diagnosis"]>;
  modelId: string;
  originalTextByPath?: ReadonlyMap<string, string>;
}): ReportSemanticReviewInput {
  const snapshotIds = input.checkpoint.observationSnapshotIds;
  if (!snapshotIds || !input.checkpoint.questionSetIdentity) throw new Error("Marked Free teaser review authority is incomplete.");
  const canonicalQuestions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  const orderedObservations = input.bundles.map((bundle) => [...bundle.observations].sort((left, right) =>
    compareStableText(left.attemptId, right.attemptId) || left.surfaceResultOrder - right.surfaceResultOrder || compareStableText(left.id, right.id)
  ));
  const observationResults = orderedObservations.flatMap((rows, questionIndex) => rows.map((row) => {
    const originalText = JSON.stringify({ canonicalUrl: row.canonicalUrl, title: row.title, snippet: row.snippet ?? null });
    return { observationId: row.attemptId, resultId: row.id, questionId: canonicalQuestions[questionIndex]!.id, originalText, originalTextHash: reportSemanticTextHash(originalText) };
  }));
  const entities = orderedObservations.flatMap((rows, questionIndex) => rows.map((row) => {
    const originalText = JSON.stringify({ canonicalUrl: row.canonicalUrl, title: row.title });
    return { entityId: `free-result-entity:${sha({ canonicalUrl: row.canonicalUrl })}`, questionId: canonicalQuestions[questionIndex]!.id, kind: "competitor_candidate" as const, originalText, originalTextHash: reportSemanticTextHash(originalText) };
  })).concat(input.card.sources.map((source) => {
    const originalText = JSON.stringify({ canonicalUrl: source.canonicalUrl, title: source.title, citedText: source.citedText });
    return { entityId: `free-source-entity:${sha({ sourceId: source.sourceId, canonicalUrl: source.canonicalUrl })}`, questionId: input.card.questionId, kind: "competitor_candidate" as const, originalText, originalTextHash: reportSemanticTextHash(originalText) };
  })).filter((entity, index, rows) => rows.findIndex(({ entityId }) => entityId === entity.entityId) === index);
  const sources = input.card.sources.map((source) => {
    const originalText = JSON.stringify({ title: source.title, citedText: source.citedText });
    return { sourceId: source.sourceId, questionId: input.card.questionId, canonicalUrl: source.canonicalUrl, originalText, originalTextHash: reportSemanticTextHash(originalText) };
  });
  const targetPages = buildFreeTeaserDiagnosisTargetPages(input.card.questionId, input.admission);
  const evidence = [
    ...sources.map((source) => ({ evidenceId: source.sourceId, questionId: source.questionId, sourceId: source.sourceId, originalText: source.originalText, originalTextHash: source.originalTextHash })),
    ...targetPages.flatMap((page) => page.sourceLocations.map((location) => ({ evidenceId: location.locationId, questionId: input.card.questionId, sourceId: null, originalText: page.summary.slice(location.startOffset, location.endOffset), originalTextHash: reportSemanticTextHash(page.summary.slice(location.startOffset, location.endOffset)) })))
  ];
  const diagnosisEvidence = [...input.diagnosis.detailedEvidenceRefs];
  const diagnosisSourceIds = diagnosisEvidence.filter((id) => sources.some((source) => source.sourceId === id));
  const text = (path: string, fallback: string) => input.originalTextByPath?.get(path) ?? fallback;
  const fields = [
    ...canonicalQuestions.map((question, index) => ({ path: `questions[${index}].text`, text: input.questionSet.questions[index]!.privateText, mutability: "read_only" as const, questionId: question.id, allowedEvidenceIds: [] as string[], allowedSourceIds: [] as string[] })),
    { path: "q1AnswerCard.answerText", text: text("q1AnswerCard.answerText", input.card.answerText), mutability: "mutable" as const, questionId: input.card.questionId, allowedEvidenceIds: sources.map(({ sourceId }) => sourceId), allowedSourceIds: sources.map(({ sourceId }) => sourceId) },
    { path: "q1Diagnosis.selectionSummary", text: text("q1Diagnosis.selectionSummary", input.diagnosis.selectionSummary), mutability: "mutable" as const, questionId: input.card.questionId, allowedEvidenceIds: diagnosisEvidence, allowedSourceIds: diagnosisSourceIds },
    ...input.diagnosis.observableFactors.map((factor, index) => {
      const path = `q1Diagnosis.observableFactors[${index}].observation`;
      return { path, text: text(path, factor.observation), mutability: "mutable" as const, questionId: input.card.questionId, allowedEvidenceIds: [...factor.evidenceRefs], allowedSourceIds: factor.evidenceRefs.filter((id) => sources.some((source) => source.sourceId === id)) };
    }),
    { path: "q1Diagnosis.targetGap", text: text("q1Diagnosis.targetGap", input.diagnosis.targetGap), mutability: "mutable" as const, questionId: input.card.questionId, allowedEvidenceIds: diagnosisEvidence, allowedSourceIds: diagnosisSourceIds },
    ...input.diagnosis.recommendedActions.map((action, index) => {
      const path = `q1Diagnosis.recommendedActions[${index}].action`;
      return { path, text: text(path, action.action), mutability: "mutable" as const, questionId: input.card.questionId, allowedEvidenceIds: [...action.evidenceRefs], allowedSourceIds: action.evidenceRefs.filter((id) => sources.some((source) => source.sourceId === id)) };
    })
  ];
  const targetHost = new URL(input.targetUrl).hostname;
  const targetAliases = [
    targetHost,
    input.foundation.organizationProfile.organizationName,
    input.foundation.organizationProfile.legalEntity,
    ...(input.foundation.organizationProfile.brandNames ?? [])
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);
  return buildFreeV4SemanticReviewManifest({
    locale: input.runtime.authority.surface.locale,
    target: { siteKey: targetHost, targetUrl: input.targetUrl, aliases: targetAliases },
    expectedModel: { providerId: "xiaomi-mimo", modelId: input.modelId },
    questions: canonicalQuestions.map((question, index) => ({ questionId: question.id, originalText: input.questionSet.questions[index]!.privateText, originalTextHash: reportSemanticTextHash(input.questionSet.questions[index]!.privateText) })),
    sources,
    evidence,
    observationResults,
    entities,
    answerSubjects: [{ questionId: input.card.questionId, fieldPath: "q1AnswerCard.answerText" }],
    fields,
    nonProseProjectionHash: freeTeaserNonProseProjectionHash({ reportId: input.reportId, identityHash: input.checkpoint.identityHash, questionSetIdentity: input.checkpoint.questionSetIdentity, observationSnapshotIds: snapshotIds, card: input.card, diagnosis: input.diagnosis })
  });
}

function verifyReadyFreeTeaserExternalProjection(input: {
  checkpoint: FreeTeaserCheckpointV1;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  admission: ReportV4SiteSnapshotBundle;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>;
  bundles: VerifiedFreeTeaserSnapshotBundles;
}): void {
  const { checkpoint } = input;
  if (!checkpoint.semanticReview || !checkpoint.q1AnswerCard?.diagnosis) throw new Error("Marked Free teaser ready review authority is incomplete.");
  verifyFreeTeaserSemanticProjection(checkpoint);
  const originalTextByPath = new Map(checkpoint.semanticReview.input.fields.map((field) => [field.path, field.originalText]));
  const modelRuntime = loadReportV4ModelRuntimeConfig(process.env);
  const expectedInput = buildFreeTeaserSemanticReviewInput({
    ...input,
    reportId: checkpoint.reportId,
    card: checkpoint.q1AnswerCard,
    diagnosis: checkpoint.q1AnswerCard.diagnosis,
    modelId: modelRuntime.modelProfile.operations.websiteSynthesis.model,
    originalTextByPath
  });
  if (hashReportSemanticReviewValue(expectedInput) !== hashReportSemanticReviewValue(checkpoint.semanticReview.input)) {
    throw new Error("Marked Free teaser ready semantic authority no longer matches persisted question, snapshot, evidence, or model catalogs.");
  }
}

function freeTeaserNonProseProjectionHash(input: {
  reportId: string;
  identityHash: string;
  questionSetIdentity: string;
  observationSnapshotIds: readonly [string, string, string];
  card: FreeTeaserQ1Draft | GenerativeSearchAnswerCardV3;
  diagnosis: NonNullable<GenerativeSearchAnswerCardV3["diagnosis"]>;
}): string {
  const stableProvenance = {
    providerId: input.card.provenance.providerId,
    model: input.card.provenance.model,
    searchMode: input.card.provenance.searchMode,
    promptVersion: input.card.provenance.promptVersion,
    searchedAt: input.card.provenance.searchedAt,
    completedAt: input.card.provenance.completedAt,
    sourceHash: input.card.provenance.sourceHash
  };
  return hashReportSemanticReviewValue({
    reportId: input.reportId,
    identityHash: input.identityHash,
    questionSetIdentity: input.questionSetIdentity,
    observationSnapshotIds: input.observationSnapshotIds,
    provenance: stableProvenance,
    sources: input.card.sources,
    diagnosisRefs: input.diagnosis.detailedEvidenceRefs,
    factorKinds: input.diagnosis.observableFactors.map(({ kind, evidenceRefs }) => ({ kind, evidenceRefs })),
    actionRefs: input.diagnosis.recommendedActions.map(({ priority, evidenceRefs }) => ({ priority, evidenceRefs }))
  });
}

function canonicalAnswerSourceProjection(source: GenerativeSearchAnswerResult["sources"][number] | GenerativeSearchAnswerCardV3["sources"][number]) {
  return {
    sourceId: source.sourceId,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    registrableDomain: source.registrableDomain,
    citedText: source.citedText ?? null,
    providerResultOrder: source.providerResultOrder
  };
}

function canonicalAnswerSourceHash(sources: readonly GenerativeSearchAnswerResult["sources"][number][]): string {
  const ordered = sources.map(canonicalAnswerSourceProjection)
    .sort((a, b) => a.providerResultOrder - b.providerResultOrder || a.canonicalUrl.localeCompare(b.canonicalUrl));
  return sha(JSON.stringify(ordered));
}

function ownershipCountsFromSources(sources: readonly GenerativeSearchAnswerCardV3["sources"][number][]): GenerativeSearchAnswerCardV3["geoDiagnosis"]["citedOwnership"] {
  const counts = { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 };
  for (const source of sources) counts[source.ownershipCategory] += 1;
  return counts;
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

function assertSemanticReviewCheckpointMode(checkpoint: FreeTeaserCheckpointV1, semanticReviewEnabled: boolean): void {
  if (!semanticReviewEnabled && (checkpoint.q1AnswerDraft || checkpoint.q1DiagnosisDraft || checkpoint.semanticReview)) {
    throw new Error("Legacy Free teaser cannot consume a semantic-review checkpoint projection.");
  }
  if (semanticReviewEnabled && ((checkpoint.q1AnswerCard && !checkpoint.semanticReview) ||
      (checkpoint.stage === "ready" && !checkpoint.semanticReview) ||
      (checkpoint.semanticReview && checkpoint.stage !== "ready"))) {
    throw new Error("Marked Free teaser checkpoint does not match semantic-review lineage.");
  }
  if (semanticReviewEnabled) {
    const hasSnapshots = checkpoint.observationSnapshotIds?.length === 3;
    const hasResult = Boolean(checkpoint.q1AnswerResult);
    const hasDraft = Boolean(checkpoint.q1AnswerDraft);
    const hasDiagnosisDraft = Boolean(checkpoint.q1DiagnosisDraft);
    const hasCard = Boolean(checkpoint.q1AnswerCard);
    const hasReview = Boolean(checkpoint.semanticReview);
    const hasMetrics = Boolean(checkpoint.metrics);
    const validShape = checkpoint.stage === "questions_ready"
      ? !hasSnapshots && !hasResult && !hasDraft && !hasDiagnosisDraft && !hasCard && !hasReview && !hasMetrics
      : checkpoint.stage === "observations_ready"
        ? hasSnapshots && !hasResult && !hasDraft && !hasDiagnosisDraft && !hasCard && !hasReview && !hasMetrics
        : checkpoint.stage === "q1_answer_ready"
          ? hasSnapshots && hasResult && hasDraft && !hasCard && !hasReview && !hasMetrics
          : checkpoint.stage === "ready"
            ? hasSnapshots && hasResult && !hasDraft && !hasDiagnosisDraft && hasCard && hasReview && hasMetrics
            : false;
    if (!validShape) throw new Error("Marked Free teaser checkpoint stage shape is invalid.");
  }
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function isConfirmedBusinessQuestionSetIdentity(value: unknown): value is string {
  return typeof value === "string" && /^confirmed-business-question-set-[a-f0-9]{64}$/u.test(value);
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
