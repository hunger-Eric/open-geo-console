import { createHash } from "node:crypto";
import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  REPORT_V4_MAX_DIAGNOSIS_SOURCES,
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  applyReportSemanticReview,
  assertGenerativeSearchAnswerLanguage,
  buildFreeV4FoundationManifestCoverage,
  buildFreeV4SemanticReviewManifest,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  deriveFreeObservationMetrics,
  diagnoseGenerativeSearchAnswerCardV3,
  generativeSearchAnswerHash,
  generativeSearchSourceHash,
  hashReportSemanticReviewValue,
  parseGenerativeSearchAnswerResult,
  parseFreeV4DirectAnalysis,
  parseReportV4DiagnosisOutputForQuestion,
  parseReportSemanticReviewOutput,
  reportSemanticTextHash,
  runOfflineReportSemanticReviewBatched,
  verifyFreeV4DirectAnalysisReceipt,
  verifyFreeV4DirectCoreReceipt,
  verifyReportSemanticReviewReceipt,
  type AiWebsiteReportV1,
  type CombinedGeoReportV4Question,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerProvider,
  type GenerativeSearchAnswerResult,
  type ReportV4DiagnosisTargetPage,
  type AppliedReportSemanticReview,
  type FreeV4SemanticReviewBatchEvidence,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewOutput,
  type FreeV4DirectAnalysis,
  type FreeV4DirectAnalysisReceipt,
  type FreeV4DirectAnalysisStatus,
  type FreeV4DirectCoreReceipt,
  type FreeV4DirectEvidenceBinding
} from "@open-geo-console/ai-report-engine";
import {
  createMarketSnapshotIdentity,
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet,
  type CustomerIdentityExclusion,
  type SearchQueryFanout
} from "@open-geo-console/public-search-observer";
import { createSiteKey } from "@open-geo-console/site-crawler";
import {
  getConfirmedBusinessQuestionSet,
  prepareBusinessQuestionCandidates
} from "@/db/business-questions";
import type { JobCheckpoint } from "@/db/schema";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import type { ReportV4SiteSnapshotBundle } from "@/db/report-v4-site-snapshots";
import { buildReportV4MimoDiagnosisTokenBudget, type ReportV4StructuredInvoker } from "@/report-v4/mimo-provider";
import { getPreparedProviderProfileRuntime, type ProviderProfilePublicSearchRuntime } from "@/provider-profile/runtime";
import { createConcurrencyGate } from "./bounded-scheduler";
import { JobError, OrchestrationInvariantError, type JobFailureClassification } from "./job-errors";
import {
  enhanceReportV4QuestionDiagnosis,
  formatReportV4DiagnosisFailure,
  type ReportV4DiagnosisFailure
} from "./report-v4-diagnosis-enhancer";
import { createPublicSourceQuestionFanouts } from "./public-source-forensics";
import { resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";

export const FREE_TEASER_CHECKPOINT_VERSION = "free-teaser-checkpoint-v1" as const;
export const FREE_V4_QUESTION_GENERATION_CONTRACT = "free-v4-question-generation-v1" as const;

export interface FreeV4GeneratedQuestion {
  readonly version: typeof FREE_V4_QUESTION_GENERATION_CONTRACT;
  readonly text: string;
  readonly identityHash: string;
}

/** A generated question payload could not be read. */
export class FreeTeaserQuestionGenerationError extends JobError {
  constructor(message = "Free teaser question generation returned an unreadable payload.") {
    super(message, "free_teaser_question_generation_invalid", "permanent");
    this.name = "FreeTeaserQuestionGenerationError";
  }
}

/** Durable free-teaser Q1 diagnosis failure (avoids unexpected_internal_error). */
export class FreeTeaserDiagnosisFailedError extends JobError {
  readonly diagnosisStage: ReportV4DiagnosisFailure["stage"];
  readonly diagnosisCode: string;
  readonly providerAttempts: number;

  constructor(failure: ReportV4DiagnosisFailure, providerAttempts: number) {
    super(
      formatReportV4DiagnosisFailure(failure, providerAttempts),
      `free_teaser_diagnosis_${failure.stage}`,
      classificationForDiagnosisFailure(failure)
    );
    this.name = "FreeTeaserDiagnosisFailedError";
    this.diagnosisStage = failure.stage;
    this.diagnosisCode = failure.code;
    this.providerAttempts = providerAttempts;
  }
}

/** Q1 answer missing text/sources/refusal path — transient model incompleteness. */
export class FreeTeaserQ1IncompleteError extends JobError {
  constructor() {
    super(
      "Free teaser Q1 requires one complete answer with sources.",
      "free_teaser_q1_incomplete",
      "transient"
    );
    this.name = "FreeTeaserQ1IncompleteError";
  }
}

/**
 * Invalid Free Q1 model output is a typed model-contract failure rather than
 * an orchestration invariant. Fingerprint recurrence escalates deterministically.
 */
export class FreeTeaserQ1AnnotationDegradedError extends JobError {
  constructor(message = "Free teaser Q1 semantic output failed its model contract.") {
    super(message, "free_teaser_q1_annotation_degraded", "transient");
    this.name = "FreeTeaserQ1AnnotationDegradedError";
  }
}

function classificationForDiagnosisFailure(failure: ReportV4DiagnosisFailure): JobFailureClassification {
  if (failure.stage === "provider") {
    if (/transport|rate_limited|temporary/i.test(failure.code)) return "transient";
    if (/authentication|configuration/i.test(failure.code)) return "operator_repairable";
    return "permanent";
  }
  if (failure.stage === "token_budget") return "permanent";
  if (failure.stage === "input_validation") return "permanent";
  return "permanent";
}
export type FreeTeaserStage = "questions_ready" | "observations_ready" | "q1_answer_ready" | "ready";

export type FreeTeaserQ1Core = Omit<GenerativeSearchAnswerCardV3, "geoDiagnosis" | "diagnosis">;
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
  readonly freeQuestion?: string;
  readonly freeQuestionIdentity?: string;
  readonly paidQuestionSetId?: string;
  readonly observationSnapshotIds?: readonly [string, string, string];
  readonly metrics?: FreeTeaserMetrics;
  readonly q1AnswerResult?: GenerativeSearchAnswerResult;
  readonly q1AnswerCard?: GenerativeSearchAnswerCardV3;
  readonly q1AnswerDraft?: FreeTeaserQ1Core;
  readonly q1DiagnosisDraft?: NonNullable<GenerativeSearchAnswerCardV3["diagnosis"]>;
  readonly reviewedFoundation?: AiWebsiteReportV1;
  readonly semanticReview?: FreeTeaserSemanticReviewProjection;
  readonly directQuestionTexts?: readonly string[];
  readonly directCoreReceipt?: FreeV4DirectCoreReceipt;
  readonly directAnalysisStatus?: FreeV4DirectAnalysisStatus;
  readonly directAnalysis?: FreeV4DirectAnalysis;
  readonly directAnalysisHandleBindings?: readonly FreeV4DirectEvidenceBinding[];
  readonly directAnalysisReceipt?: FreeV4DirectAnalysisReceipt;
  readonly readyAt?: string;
}

export interface FreeTeaserResult {
  readonly checkpoint: FreeTeaserCheckpointV1;
  readonly questionSet: ConfirmedBusinessQuestionSet | null;
  readonly freeQuestion: string;
  readonly q1AnswerCore: FreeTeaserQ1Core | GenerativeSearchAnswerCardV3;
  readonly metrics?: FreeTeaserMetrics;
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
  freeDirectSemanticsVersion?: typeof FREE_V4_DIRECT_SEMANTICS_VERSION | null;
  saveCheckpoint: FreeTeaserCheckpointWriter;
  onSemanticReviewBatchEvidence?: (evidence: FreeV4SemanticReviewBatchEvidence) => void;
  signal?: AbortSignal;
  structuredInvoker?: ReportV4StructuredInvoker;
}): Promise<FreeTeaserResult> {
  input.signal?.throwIfAborted();
  assertTerminalAdmission(input.admission, input.reportId);
  const semanticReviewEnabled = input.semanticReviewContractVersion === REPORT_SEMANTIC_REVIEW_CONTRACT;
  const freeDirectEnabled = input.freeDirectSemanticsVersion === FREE_V4_DIRECT_SEMANTICS_VERSION;
  if (semanticReviewEnabled && freeDirectEnabled) throw new Error("Free teaser cannot use legacy and direct semantic carriers together.");
  if (input.semanticReviewContractVersion !== null && input.semanticReviewContractVersion !== undefined && !semanticReviewEnabled) {
    throw new Error("Unsupported Free teaser semantic-review contract.");
  }
  if (input.freeDirectSemanticsVersion !== null && input.freeDirectSemanticsVersion !== undefined && !freeDirectEnabled) {
    throw new Error("Unsupported Free direct-semantics contract.");
  }
  if (!semanticReviewEnabled && !freeDirectEnabled && input.checkpoint?.stage !== "ready") {
    throw new Error(
      "Legacy Free generation requires model-owned semantic review; code-authored presence metrics are disabled."
    );
  }

  const providerRuntime = getPreparedProviderProfileRuntime();
  const runtime = providerRuntime.publicSearchRuntime;
  const foundationHash = hashFreeTeaserFoundation(input.foundation);
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
    assertSemanticReviewCheckpointMode(checkpoint, semanticReviewEnabled, freeDirectEnabled);
  }
  const evidenceCutoffAt = checkpoint?.evidenceCutoffAt ?? new Date().toISOString();

  let questionSet: ConfirmedBusinessQuestionSet | null = null;
  let freeQuestion = checkpoint?.freeQuestion ?? "";
  let freeQuestionIdentity = checkpoint?.freeQuestionIdentity ?? "";
  if (freeDirectEnabled) {
    if (checkpoint) {
      if (!freeQuestion || !freeQuestionIdentity || !checkpoint.paidQuestionSetId) {
        throw new Error("Marked Free teaser checkpoint has no split question authority.");
      }
    } else {
      const generatedFree = await invokeFreeV4QuestionGeneration({
        foundation: input.foundation,
        locale: runtime.authority.surface.locale,
        region: runtime.authority.surface.region,
        signal: input.signal,
        structuredInvoker: input.structuredInvoker
      });
      const paidOutput = await invokePaidV4QuestionGeneration({
        foundation: input.foundation,
        locale: runtime.authority.surface.locale,
        region: runtime.authority.surface.region,
        signal: input.signal,
        structuredInvoker: input.structuredInvoker
      });
      const paidCandidates = await prepareBusinessQuestionCandidates({
        reportId: input.reportId,
        locale: runtime.authority.surface.locale,
        region: runtime.authority.surface.region,
        foundation: input.foundation,
        modelOutput: paidOutput,
        preserveModelText: true
      });
      freeQuestion = generatedFree.text;
      freeQuestionIdentity = generatedFree.identityHash;
      checkpoint = {
        ...identityCore,
        stage: "questions_ready",
        identityHash,
        evidenceCutoffAt,
        questionSetId: paidCandidates.id,
        questionSetIdentity: freeQuestionIdentity,
        freeQuestion,
        freeQuestionIdentity,
        paidQuestionSetId: paidCandidates.id,
        directQuestionTexts: [freeQuestion]
      };
      await input.saveCheckpoint(checkpoint, "question_generation");
    }
  } else if (checkpoint?.stage === "ready") {
    if (!checkpoint.questionSetId || !checkpoint.questionSetIdentity) throw new Error("Marked Free teaser ready checkpoint has no question-set authority.");
    questionSet = await getConfirmedBusinessQuestionSet(input.reportId, checkpoint.questionSetId);
    if (!questionSet || questionSet.contentHash !== checkpoint.questionSetIdentity) {
      throw new Error("Marked Free teaser question-set authority is unavailable.");
    }
    freeQuestion = questionSet.questions[0]!.neutralPublicText;
  } else {
    throw new Error("New Free teaser generation requires the direct split-question contract.");
  }
  if (!freeDirectEnabled && (!checkpoint || !checkpoint.questionSetId)) {
    checkpoint = {
      ...identityCore,
      stage: "questions_ready",
      identityHash,
      evidenceCutoffAt,
      questionSetId: questionSet!.id,
      questionSetIdentity: questionSet!.contentHash,
    };
    await input.saveCheckpoint(checkpoint, "question_generation");
  }

  if (!freeDirectEnabled && (!checkpoint.observationSnapshotIds || (!semanticReviewEnabled && !checkpoint.metrics))) {
    const observed = await observeTeaserQuestions({
      reportId: input.reportId,
      jobId: input.jobId,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      questionSet: questionSet!,
      evidenceCutoffAt,
      runtime,
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
      questionSet: questionSet!,
      runtime
    });
    if (checkpoint.stage === "ready") {
      verifyReadyFreeTeaserExternalProjection({
        checkpoint,
        targetUrl: input.targetUrl,
        foundation: input.foundation,
        admission: input.admission,
        questionSet: questionSet!,
        runtime,
        bundles: verifiedSnapshotBundles
      });
    }
  }

  if (checkpoint.stage !== "ready" && (!checkpoint.q1AnswerResult || (semanticReviewEnabled || freeDirectEnabled ? !checkpoint.q1AnswerDraft : !checkpoint.q1AnswerCard))) {
    const q1 = await answerTeaserQuestionOne({
      questionSet: questionSet ?? undefined,
      freeQuestion: freeDirectEnabled ? { text: freeQuestion, identityHash: freeQuestionIdentity } : undefined,
      targetUrl: input.targetUrl,
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region,
      signal: input.signal,
      semanticMode: freeDirectEnabled ? "free_direct" : semanticReviewEnabled ? "deferred" : "legacy"
    });
    const answeredCore: FreeTeaserCheckpointV1 = {
      ...checkpoint,
      stage: "q1_answer_ready",
      q1AnswerResult: q1.answerResult,
      ...(semanticReviewEnabled || freeDirectEnabled ? { q1AnswerDraft: q1.draft } : { q1AnswerCard: q1.card! })
    };
    const answeredCheckpoint: FreeTeaserCheckpointV1 = freeDirectEnabled
      ? {
          ...answeredCore,
          directCoreReceipt: createFreeV4DirectCoreReceipt(freeDirectCoreReceiptInput(answeredCore))
        }
      : answeredCore;
    if (semanticReviewEnabled || freeDirectEnabled) {
      await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint: answeredCheckpoint, questionSet: questionSet ?? undefined, freeQuestion: freeDirectEnabled ? { text: freeQuestion, identityHash: freeQuestionIdentity } : undefined, targetUrl: input.targetUrl, admission: input.admission });
    }
    checkpoint = answeredCheckpoint;
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  if ((semanticReviewEnabled || freeDirectEnabled) && checkpoint.stage === "q1_answer_ready") {
    await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint, questionSet: questionSet ?? undefined, freeQuestion: freeDirectEnabled ? { text: freeQuestion, identityHash: freeQuestionIdentity } : undefined, targetUrl: input.targetUrl, admission: input.admission });
  }

  if (freeDirectEnabled && checkpoint.stage === "q1_answer_ready") {
    const q1Core = checkpoint.q1AnswerDraft!;
    const directInput = buildFreeV4DirectAnalysisInput({
      question: q1Core.exactQuestion,
      answer: { answerText: q1Core.answerText, refusal: q1Core.refusal },
      sources: q1Core.sources,
      targetPages: buildFreeTeaserDiagnosisTargetPages(q1Core.questionId, input.admission),
      targetIdentity: freeV4DirectTargetIdentity(input.targetUrl, input.foundation),
      locale: runtime.authority.surface.locale
    });
    try {
      const rawAnalysis = await invokeFreeV4DirectAnalysis({
        payload: directInput.payload,
        signal: input.signal,
        structuredInvoker: input.structuredInvoker
      });
      const analysis = parseFreeV4DirectAnalysis(rawAnalysis, {
        allowedEvidenceHandles: directInput.handleBindings.map(({ handle }) => handle)
      });
      const completedCore: FreeTeaserCheckpointV1 = {
        ...checkpoint,
        stage: "ready",
        directAnalysisStatus: "completed",
        directAnalysis: analysis,
        directAnalysisHandleBindings: directInput.handleBindings,
        readyAt: new Date().toISOString()
      };
      checkpoint = {
        ...completedCore,
        directAnalysisReceipt: createFreeV4DirectAnalysisReceipt(freeDirectAnalysisReceiptInput(completedCore))
      };
    } catch {
      input.signal?.throwIfAborted();
      checkpoint = {
        ...checkpoint,
        stage: "ready",
        directAnalysisStatus: "incomplete",
        readyAt: new Date().toISOString()
      };
    }
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  if (!freeDirectEnabled && checkpoint.stage !== "ready" && !(semanticReviewEnabled && checkpoint.q1DiagnosisDraft)) {
    const q1Card = semanticReviewEnabled ? checkpoint.q1AnswerDraft! : checkpoint.q1AnswerCard!;
    const targetPages = buildFreeTeaserDiagnosisTargetPages(
      q1Card.questionId,
      input.admission
    );
    const question = toDiagnosisQuestion(q1Card);
    const diagnosisResult = await enhanceReportV4QuestionDiagnosis({
      question,
      locale: runtime.authority.surface.locale,
      targetPages,
      provider: providerRuntime.createDiagnosisProvider(),
      getTokenBudget: (request) => buildReportV4MimoDiagnosisTokenBudget({
        runtime: providerRuntime.modelRuntime,
        request
      }),
      signal: input.signal,
      semanticValidation: semanticReviewEnabled ? "deferred" : "legacy"
    });
    if (diagnosisResult.status !== "completed") {
      throw new FreeTeaserDiagnosisFailedError(
        diagnosisResult.failure,
        diagnosisResult.providerAttempts
      );
    }
    const diagnosis = parseReportV4DiagnosisOutputForQuestion(diagnosisResult.diagnosis, {
      questionId: q1Card.questionId,
      sourceEvidenceIds: q1Card.sources.map(({ sourceId }) => sourceId)
    }, { semanticValidation: semanticReviewEnabled ? "deferred" : "legacy" });
    if (semanticReviewEnabled) {
      const diagnosedCheckpoint: FreeTeaserCheckpointV1 = { ...checkpoint, stage: "q1_answer_ready", q1DiagnosisDraft: diagnosis };
      await verifyMarkedFreeTeaserDraftCheckpoint({ checkpoint: diagnosedCheckpoint, questionSet: questionSet!, targetUrl: input.targetUrl, admission: input.admission });
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
    const reviewedCheckpoint = await reviewFreeTeaser({
      ...input,
      checkpoint,
      questionSet: questionSet!,
      runtime,
      bundles: verifiedSnapshotBundles!
    });
    const verifiedReady = parseReadyFreeTeaserCheckpoint(reviewedCheckpoint, {
      semanticReviewContractVersion: input.semanticReviewContractVersion
    });
    verifyReadyFreeTeaserExternalProjection({
      checkpoint: verifiedReady,
      targetUrl: input.targetUrl,
      foundation: input.foundation,
      admission: input.admission,
      questionSet: questionSet!,
      runtime,
      bundles: verifiedSnapshotBundles!
    });
    checkpoint = verifiedReady;
    await input.saveCheckpoint(checkpoint, "grounded_answer_synthesis");
  }

  const ready = parseReadyFreeTeaserCheckpoint(checkpoint, {
    semanticReviewContractVersion: input.semanticReviewContractVersion,
    freeDirectSemanticsVersion: input.freeDirectSemanticsVersion
  });
  return {
    checkpoint: ready,
    questionSet,
    freeQuestion,
    q1AnswerCore: ready.q1AnswerDraft ?? ready.q1AnswerCard!,
    ...(ready.metrics ? { metrics: ready.metrics } : {})
  };
}

export async function invokeFreeV4DirectAnalysis(input: {
  payload: unknown;
  signal?: AbortSignal;
  structuredInvoker?: ReportV4StructuredInvoker;
}): Promise<unknown> {
  const signal = input.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const structured = input.structuredInvoker ?? getPreparedProviderProfileRuntime().createStructuredInvoker();
  const output = await structured.invoke({
    operation: "sourceDiagnosis",
    systemText: [
      "Write customer-visible GEO findings for the native-search answer and its actual source annotations.",
      "Lead summary with the concrete answer-and-source conclusion, then state whether the submitted site appears and its specific gap. Write observations as facts contributed by the returned sources, and recommendations as direct actions for the submitted site.",
      "Do not narrate the analysis task, report structure, supplied payload, instructions, evidence contract, or writing process. Do not tell the reader what this section will explain.",
      "targetIdentity is authoritative. When naming the submitted target, use targetIdentity.canonicalName exactly; do not translate, abbreviate, or invent another target name. Its aliases and domain identify the same target.",
      "The S and T handles are the only evidence handles you may cite. T pages are unassessed candidates, not proof of relevance.",
      "List every S/T handle actually relied on by the summary, observations, or recommendations. Do not recommend adding the submitted target merely because a T page exists.",
      "Negative outcomes, no target mention, insufficient evidence, and refusals are valid analysis results.",
      "Return one JSON object with summary, observations, recommendations, and evidenceHandles.",
      "observations, recommendations, and evidenceHandles are arrays of any appropriate length, including zero. Extra fields are ignored."
    ].join("\n"),
    inputText: JSON.stringify(input.payload),
    signal
  });
  signal.throwIfAborted();
  return output;
}

export async function invokeFreeV4QuestionGeneration(input: {
  foundation: AiWebsiteReportV1;
  locale: string;
  region: string;
  signal?: AbortSignal;
  structuredInvoker?: ReportV4StructuredInvoker;
}): Promise<FreeV4GeneratedQuestion> {
  const signal = input.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const structured = input.structuredInvoker ?? getPreparedProviderProfileRuntime().createStructuredInvoker();
  const output = await structured.invoke({
    operation: "websiteSynthesis",
    systemText: [
      "You write the single free-preview question for a GEO report.",
      "Read the supplied website foundation and decide what this website offers.",
      "Return exactly one useful question that a real prospective customer would independently ask while discovering, comparing, or buying what the website offers.",
      "Choose the question yourself from the website evidence. Do not discuss implementation or the report-generation process.",
      "Do not invent facts, contact details, credentials, order identifiers, or unsupported claims.",
      "Return only {\"version\":\"free-v4-question-generation-v1\",\"question\":\"...\"}."
    ].join("\n"),
    inputText: JSON.stringify({
      locale: input.locale,
      region: input.region,
      websiteFoundation: input.foundation
    }),
    signal
  });
  signal.throwIfAborted();
  return parseFreeV4GeneratedQuestion(output);
}

export function parseFreeV4GeneratedQuestion(value: unknown): FreeV4GeneratedQuestion {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Question output must be an object.");
    const root = value as Record<string, unknown>;
    if (root.version !== FREE_V4_QUESTION_GENERATION_CONTRACT) throw new TypeError("Question version is invalid.");
    const text = boundedGeneratedQuestionText(root.question, "question", 500);
    return { version: FREE_V4_QUESTION_GENERATION_CONTRACT, text, identityHash: `free-question-${sha({ text })}` };
  } catch (error) {
    if (error instanceof FreeTeaserQuestionGenerationError) throw error;
    throw new FreeTeaserQuestionGenerationError(error instanceof Error ? error.message : undefined);
  }
}

function boundedGeneratedQuestionText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} is invalid.`);
  return value.trim().normalize("NFC");
}

export async function invokePaidV4QuestionGeneration(input: {
  foundation: AiWebsiteReportV1;
  locale: string;
  region: string;
  signal?: AbortSignal;
  structuredInvoker?: ReportV4StructuredInvoker;
}): Promise<unknown> {
  const signal = input.signal ?? new AbortController().signal;
  const structured = input.structuredInvoker ?? getPreparedProviderProfileRuntime().createStructuredInvoker();
  const output = await structured.invoke({
    operation: "websiteSynthesis",
    systemText: [
      "Generate exactly three editable candidate questions for a paid GEO report.",
      "Read the website foundation and decide what real prospective customers would independently ask while discovering, comparing, or buying what this website offers.",
      "Choose the questions yourself. Do not review, score, explain, or correct them, and do not discuss implementation or the report-generation process.",
      "Return only {\"questions\":[{\"purpose\":\"core_service_discovery\",\"text\":\"...\"},{\"purpose\":\"customer_region_fit\",\"text\":\"...\"},{\"purpose\":\"purchase_delivery_risk\",\"text\":\"...\"}]}."
    ].join("\n"),
    inputText: JSON.stringify({ locale: input.locale, region: input.region, websiteFoundation: input.foundation }),
    signal
  });
  signal.throwIfAborted();
  return output;
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
  options?: {
    semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null;
    freeDirectSemanticsVersion?: typeof FREE_V4_DIRECT_SEMANTICS_VERSION | null;
  }
): FreeTeaserCheckpointV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Free teaser checkpoint must be an object.");
  const checkpoint = value as FreeTeaserCheckpointV1;
  if (checkpoint.version !== FREE_TEASER_CHECKPOINT_VERSION || checkpoint.stage !== "ready") {
    throw new TypeError("Free teaser checkpoint is not ready.");
  }
  if (!isHash(checkpoint.identityHash) || !isHash(checkpoint.admissionContentIdentityHash) ||
      !isHash(checkpoint.foundationHash) || !isQuestionAuthorityIdentity(checkpoint.questionSetIdentity) ||
      !checkpoint.questionSetId || !checkpoint.reportId || !checkpoint.admissionSnapshotId ||
      !checkpoint.q1AnswerResult || !checkpoint.readyAt) {
    throw new TypeError("Free teaser checkpoint is incomplete.");
  }
  const semanticReviewEnabled = options?.semanticReviewContractVersion === REPORT_SEMANTIC_REVIEW_CONTRACT;
  const freeDirectEnabled = options?.freeDirectSemanticsVersion === FREE_V4_DIRECT_SEMANTICS_VERSION;
  if (semanticReviewEnabled && freeDirectEnabled) throw new TypeError("Free teaser cannot verify two semantic carriers.");
  if (options?.semanticReviewContractVersion !== null && options?.semanticReviewContractVersion !== undefined && !semanticReviewEnabled) {
    throw new TypeError("Unsupported Free teaser semantic-review contract.");
  }
  if (options?.freeDirectSemanticsVersion !== null && options?.freeDirectSemanticsVersion !== undefined && !freeDirectEnabled) {
    throw new TypeError("Unsupported Free direct-semantics contract.");
  }
  if (semanticReviewEnabled !== Boolean(checkpoint.semanticReview)) {
    throw new TypeError("Free teaser ready checkpoint does not match root semantic-review lineage.");
  }
  if (semanticReviewEnabled && !checkpoint.reviewedFoundation) {
    throw new TypeError("Free teaser ready checkpoint is missing its reviewed Foundation projection.");
  }
  if (freeDirectEnabled) {
    if (checkpoint.semanticReview || checkpoint.reviewedFoundation || checkpoint.q1AnswerCard ||
        !checkpoint.q1AnswerDraft || !checkpoint.directQuestionTexts || !checkpoint.directCoreReceipt ||
        !checkpoint.directAnalysisStatus || checkpoint.metrics || checkpoint.observationSnapshotIds ||
        checkpoint.directQuestionTexts.length !== 1 || checkpoint.directQuestionTexts[0] !== checkpoint.freeQuestion ||
        checkpoint.questionSetIdentity !== checkpoint.freeQuestionIdentity || !checkpoint.paidQuestionSetId) {
      throw new TypeError("Free direct ready checkpoint is missing its direct semantic authority.");
    }
    if (checkpoint.directQuestionTexts[0] !== checkpoint.q1AnswerDraft.exactQuestion ||
        checkpoint.q1AnswerDraft.questionId !== checkpoint.q1AnswerResult.questionId) {
      throw new TypeError("Free direct Q1 prose does not match the final question set.");
    }
    verifyDirectQ1CoreProjection(checkpoint);
    verifyFreeV4DirectCoreReceipt(checkpoint.directCoreReceipt, freeDirectCoreReceiptInput(checkpoint));
    if (checkpoint.directAnalysisStatus === "completed") {
      if (!checkpoint.directAnalysis || !checkpoint.directAnalysisHandleBindings || !checkpoint.directAnalysisReceipt) {
        throw new TypeError("Free direct completed analysis is missing its receipt authority.");
      }
      verifyFreeV4DirectAnalysisReceipt(
        checkpoint.directAnalysisReceipt,
        freeDirectAnalysisReceiptInput(checkpoint)
      );
    } else if (checkpoint.directAnalysisStatus === "incomplete") {
      if (checkpoint.directAnalysis || checkpoint.directAnalysisHandleBindings || checkpoint.directAnalysisReceipt) {
        throw new TypeError("Free direct incomplete analysis must not carry an unverified projection.");
      }
    } else {
      throw new TypeError("Free direct analysis status is invalid.");
    }
  } else if (checkpoint.directCoreReceipt || checkpoint.directQuestionTexts || checkpoint.directAnalysisStatus ||
      checkpoint.directAnalysis || checkpoint.directAnalysisHandleBindings || checkpoint.directAnalysisReceipt) {
    throw new TypeError("Legacy Free teaser checkpoint contains an unexpected direct semantic projection.");
  } else if (!checkpoint.metrics || checkpoint.observationSnapshotIds?.length !== 3) {
    throw new TypeError("Legacy Free teaser checkpoint is missing its observation metrics authority.");
  } else if (!checkpoint.q1AnswerCard || checkpoint.q1AnswerCard.questionId !== checkpoint.q1AnswerResult.questionId ||
      !checkpoint.q1AnswerCard.diagnosis) {
    throw new TypeError("Free teaser Q1 identity is invalid.");
  }
  if (!freeDirectEnabled) {
    parseReportV4DiagnosisOutputForQuestion(checkpoint.q1AnswerCard!.diagnosis, {
      questionId: checkpoint.q1AnswerCard!.questionId,
      sourceEvidenceIds: checkpoint.q1AnswerCard!.sources.map(({ sourceId }) => sourceId)
    }, { semanticValidation: semanticReviewEnabled ? "deferred" : "legacy" });
  }
  if (semanticReviewEnabled) verifyFreeTeaserSemanticProjection(checkpoint);
  return checkpoint;
}

function freeDirectCoreReceiptInput(checkpoint: FreeTeaserCheckpointV1) {
  if (!checkpoint.questionSetIdentity || !checkpoint.directQuestionTexts || !checkpoint.q1AnswerDraft ||
      !checkpoint.q1AnswerResult) {
    throw new TypeError("Free direct core receipt input is incomplete.");
  }
  const core = checkpoint.q1AnswerDraft;
  return {
    questionSetIdentity: checkpoint.questionSetIdentity,
    // The legacy receipt schema is fixed at three slots. The free product now
    // has one question, so the same authority text occupies those receipt-only
    // slots; no additional question is generated, persisted, searched, or shown.
    questions: [checkpoint.directQuestionTexts[0]!, checkpoint.directQuestionTexts[0]!, checkpoint.directQuestionTexts[0]!],
    questionId: core.questionId,
    questionText: core.exactQuestion,
    answer: checkpoint.q1AnswerResult,
    sources: core.sources,
    providerResponseId: checkpoint.q1AnswerResult.providerResponseId,
    providerId: core.provenance.providerId,
    model: core.provenance.model,
    searchMode: core.provenance.searchMode,
    searchedAt: core.provenance.searchedAt,
    completedAt: core.provenance.completedAt,
    nonProseProjection: {
      version: checkpoint.version,
      identityHash: checkpoint.identityHash,
      reportId: checkpoint.reportId,
      admissionSnapshotId: checkpoint.admissionSnapshotId,
      admissionContentIdentityHash: checkpoint.admissionContentIdentityHash,
      foundationHash: checkpoint.foundationHash,
      locale: checkpoint.locale,
      region: checkpoint.region,
      authorityId: checkpoint.authorityId,
      evidenceCutoffAt: checkpoint.evidenceCutoffAt,
      questionSetId: checkpoint.questionSetId,
      questionSetIdentity: checkpoint.questionSetIdentity,
      questionId: core.questionId,
      answerHash: core.provenance.answerHash,
      sourceHash: core.provenance.sourceHash
    }
  } as const;
}

function freeDirectAnalysisReceiptInput(checkpoint: FreeTeaserCheckpointV1) {
  if (!checkpoint.directCoreReceipt || !checkpoint.directAnalysis || !checkpoint.directAnalysisHandleBindings ||
      checkpoint.directAnalysisStatus !== "completed") {
    throw new TypeError("Free direct analysis receipt input is incomplete.");
  }
  return {
    coreReceiptHash: checkpoint.directCoreReceipt.receiptHash,
    analysis: checkpoint.directAnalysis,
    handleBindings: checkpoint.directAnalysisHandleBindings,
    nonProseProjection: {
      version: checkpoint.version,
      identityHash: checkpoint.identityHash,
      reportId: checkpoint.reportId,
      admissionSnapshotId: checkpoint.admissionSnapshotId,
      admissionContentIdentityHash: checkpoint.admissionContentIdentityHash,
      foundationHash: checkpoint.foundationHash,
      locale: checkpoint.locale,
      region: checkpoint.region,
      authorityId: checkpoint.authorityId,
      questionSetIdentity: checkpoint.questionSetIdentity,
      analysisStatus: checkpoint.directAnalysisStatus
    }
  } as const;
}

function verifyDirectQ1CoreProjection(checkpoint: FreeTeaserCheckpointV1): void {
  const core = checkpoint.q1AnswerDraft!;
  const parsed = parseGenerativeSearchAnswerResult(checkpoint.q1AnswerResult, {
    expectedQuestionId: core.questionId,
    locale: checkpoint.locale,
    semanticValidation: "free_direct"
  });
  if (parsed.answerText !== core.answerText ||
      hashReportSemanticReviewValue(parsed.refusal) !== hashReportSemanticReviewValue(core.refusal) ||
      sha(parsed.sources.map(canonicalAnswerSourceProjection)) !== sha(core.sources.map(canonicalAnswerSourceProjection)) ||
      core.provenance.answerHash !== sha(JSON.stringify(parsed)) ||
      core.provenance.sourceHash !== canonicalAnswerSourceHash(parsed.sources) ||
      core.provenance.searchedAt !== parsed.searchedAt || core.provenance.completedAt !== parsed.completedAt ||
      core.sources.some((source) => source.retrievalStatus !== "search_source_only" || source.ownershipCategory !== "unknown") ||
      core.audit.verifiedBodyCount !== 0 || core.audit.searchSourceOnlyCount !== core.sources.length ||
      core.audit.inaccessibleCount !== 0) {
    throw new TypeError("Free direct Q1 core does not match its provider answer and annotation authority.");
  }
}

export function buildFreeV4DirectAnalysisInput(input: {
  question: string;
  answer: { readonly answerText: string; readonly refusal: FreeTeaserQ1Core["refusal"] };
  sources: FreeTeaserQ1Core["sources"];
  targetPages: readonly ReportV4DiagnosisTargetPage[];
  targetIdentity: {
    readonly canonicalName: string;
    readonly aliases: readonly string[];
    readonly domain: string;
  };
  locale: string;
}): {
  readonly payload: unknown;
  readonly handleBindings: readonly FreeV4DirectEvidenceBinding[];
} {
  const sourceAliases = input.sources.map((source, index) => ({
    handle: `S${index + 1}`,
    title: source.title,
    url: source.canonicalUrl,
    citedText: source.citedText
  }));
  const targetAliases = input.targetPages.map((page, index) => ({
    handle: `T${index + 1}`,
    url: page.url,
    summary: page.summary
  }));
  const handleBindings = Object.freeze([
    ...input.sources.map((source, index) => Object.freeze({
      handle: `S${index + 1}`,
      evidenceRef: source.sourceId
    })),
    ...input.targetPages.map((page, index) => Object.freeze({
      handle: `T${index + 1}`,
      evidenceRef: page.sourceLocations[0]!.locationId
    }))
  ]);
  return Object.freeze({
    payload: Object.freeze({
      locale: input.locale,
      question: input.question,
      answer: input.answer,
      answerSources: sourceAliases,
      targetIdentity: input.targetIdentity,
      submittedSitePages: targetAliases
    }),
    handleBindings
  });
}

export function freeV4DirectTargetIdentity(targetUrl: string, foundation: AiWebsiteReportV1): {
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly domain: string;
} {
  const profile = foundation.organizationProfile;
  const domain = new URL(targetUrl).hostname.replace(/^www\./u, "").toLocaleLowerCase();
  const aliases = [...new Set([
    profile.organizationName,
    profile.legalEntity,
    ...(profile.brandNames ?? [])
  ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
  const canonicalName = profile.organizationName?.trim()
    || profile.legalEntity?.trim()
    || aliases[0]
    || domain;
  if (!aliases.includes(canonicalName)) aliases.unshift(canonicalName);
  return Object.freeze({ canonicalName, aliases: Object.freeze(aliases), domain });
}

function verifyFreeTeaserSemanticProjection(checkpoint: FreeTeaserCheckpointV1): void {
  const projection = checkpoint.semanticReview!;
  if (projection.version !== REPORT_SEMANTIC_REVIEW_CONTRACT) throw new TypeError("Free teaser semantic review version is invalid.");
  const output = parseReportSemanticReviewOutput(projection.output, projection.input);
  const applied = applyReportSemanticReview(projection.input, output);
  verifyReportSemanticReviewReceipt(projection.applied.receipt, projection.input, output, projection.applied.fields);
  if (hashReportSemanticReviewValue(applied) !== hashReportSemanticReviewValue(projection.applied)) throw new TypeError("Free teaser semantic review applied projection is stale.");
  if (!checkpoint.reviewedFoundation) throw new TypeError("Free teaser reviewed Foundation is unavailable.");
  const actual = new Map<string, string>([
    ["q1AnswerCard.answerText", checkpoint.q1AnswerCard!.answerText],
    ["q1Diagnosis.selectionSummary", checkpoint.q1AnswerCard!.diagnosis!.selectionSummary],
    ["q1Diagnosis.targetGap", checkpoint.q1AnswerCard!.diagnosis!.targetGap],
    ...checkpoint.q1AnswerCard!.diagnosis!.observableFactors.map((factor, index) => [`q1Diagnosis.observableFactors[${index}].observation`, factor.observation] as const),
    ...checkpoint.q1AnswerCard!.diagnosis!.recommendedActions.map((action, index) => [`q1Diagnosis.recommendedActions[${index}].action`, action.action] as const),
    ...buildFreeV4FoundationManifestCoverage(checkpoint.reviewedFoundation).map(({ path, text }) => [path, text] as const)
  ]);
  for (const field of projection.applied.fields) {
    if (actual.has(field.path) && actual.get(field.path) !== field.appliedText) throw new TypeError(`Free teaser semantic field ${field.path} does not match the checkpoint.`);
  }
  const annotation = output.annotations.answers[0];
  const geoDiagnosis = checkpoint.q1AnswerCard!.geoDiagnosis;
  if (!geoDiagnosis) throw new TypeError("Reviewed Free teaser Q1 requires a model-owned GEO diagnosis.");
  if (!annotation || annotation.targetPresence === undefined || annotation.competitorEntityIds === undefined ||
      geoDiagnosis.targetMentioned !== (annotation.targetPresence === "present") ||
      geoDiagnosis.targetFirstSentence !== (annotation.targetPresence === "present" ? annotation.targetFirstSentence : null) ||
      sha(geoDiagnosis.targetRoles) !== sha(annotation.targetRoles) ||
      sha(geoDiagnosis.competitorEntityIds) !== sha(annotation.competitorEntityIds) ||
      hashReportSemanticReviewValue(geoDiagnosis.citedOwnership) !== hashReportSemanticReviewValue(ownershipCountsFromSources(checkpoint.q1AnswerCard!.sources)) ||
      geoDiagnosis.missingEvidenceFamilies.length !== 0 ||
      geoDiagnosis.retestQuestion !== checkpoint.q1AnswerCard!.exactQuestion) {
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

function applyReviewedFoundation(foundation: AiWebsiteReportV1, textByPath: ReadonlyMap<string, string>): AiWebsiteReportV1 {
  const projection = JSON.parse(JSON.stringify(foundation)) as Record<string, unknown>;
  for (const [path, text] of textByPath) {
    if (!path.startsWith("foundation.")) continue;
    writeFoundationProjectionText(projection, path.slice("foundation.".length), text);
  }
  return projection as unknown as AiWebsiteReportV1;
}

function writeFoundationProjectionText(root: Record<string, unknown>, path: string, text: string): void {
  const segments: Array<string | number> = [];
  for (const part of path.split(".")) {
    for (const token of part.split("[")) {
      if (token) segments.push(token.endsWith("]") ? Number(token.slice(0, -1)) : token);
    }
  }
  let current: Record<string | number, unknown> = root;
  for (const segment of segments.slice(0, -1)) current = current[segment] as Record<string | number, unknown>;
  current[segments.at(-1)!] = text;
}

export function freeTeaserSeededQ1(
  checkpointValue: FreeTeaserCheckpointV1,
  questionSet: ConfirmedBusinessQuestionSet,
  options: {
    semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null;
    freeDirectSemanticsVersion?: typeof FREE_V4_DIRECT_SEMANTICS_VERSION | null;
  } = {}
): FreeTeaserSeededQ1 {
  const checkpoint = parseReadyFreeTeaserCheckpoint(checkpointValue, options);
  if (checkpoint.questionSetIdentity !== questionSet.contentHash) {
    throw new Error("Paid V3 question set does not match the free teaser.");
  }
  const card = checkpoint.q1AnswerDraft ?? checkpoint.q1AnswerCard!;
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
        relevanceReason: "Unassessed submitted-site page candidate.",
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
  runtime: ProviderProfilePublicSearchRuntime;
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
  return { snapshotIds };
}

function createFreeTeaserFanouts(
  questionSet: ConfirmedBusinessQuestionSet,
  targetUrl: string,
  foundation: AiWebsiteReportV1,
  runtime: ProviderProfilePublicSearchRuntime
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

export async function loadVerifiedFreeTeaserSnapshotBundles(input: {
  snapshotIds: readonly [string, string, string];
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: ProviderProfilePublicSearchRuntime;
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
  authority: ProviderProfilePublicSearchRuntime["authority"];
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
  questionSet?: ConfirmedBusinessQuestionSet;
  freeQuestion?: { text: string; identityHash: string };
  targetUrl: string;
  locale: string;
  region: string;
  signal?: AbortSignal;
  semanticMode: "legacy" | "deferred" | "free_direct";
}): Promise<{ answerResult: GenerativeSearchAnswerResult; draft: FreeTeaserQ1Core; card?: GenerativeSearchAnswerCardV3 }> {
  const provider: GenerativeSearchAnswerProvider = getPreparedProviderProfileRuntime().createQuestionAnswerProvider({
    locale: input.locale,
    region: input.region
  });
  const directQuestion = input.semanticMode === "free_direct" ? input.freeQuestion : undefined;
  if (input.semanticMode === "free_direct" ? !directQuestion : !input.questionSet) {
    throw new Error("Free teaser question authority is unavailable.");
  }
  const canonical = directQuestion
    ? { id: `free-question-id-${sha({ identityHash: directQuestion.identityHash, locale: input.locale, region: input.region })}` }
    : toCanonicalBuyerQuestionSet(input.questionSet!).questions[0]!;
  const questionText = directQuestion?.text ?? input.questionSet!.questions[0]!.privateText;
  const raw = await provider.answerWithSources({
    questionId: canonical.id,
    question: questionText,
    locale: input.locale,
    region: input.region,
    signal: input.signal ?? new AbortController().signal,
    ...(input.semanticMode === "legacy" ? {} : { semanticValidation: input.semanticMode })
  });
  let parsed: GenerativeSearchAnswerResult;
  try {
    parsed = parseGenerativeSearchAnswerResult(raw, {
      expectedQuestionId: canonical.id,
      locale: input.locale,
      semanticValidation: input.semanticMode
    });
  } catch {
    throw new FreeTeaserQ1AnnotationDegradedError(
      "Free teaser Q1 answer or provider annotations failed the direct model contract."
    );
  }
  if (input.semanticMode !== "free_direct" && (!parsed.answerText || parsed.refusal || parsed.sources.length === 0)) {
    throw new FreeTeaserQ1IncompleteError();
  }
  const sources = parsed.sources.map((source) => ({
    ...source,
    retrievalStatus: "search_source_only" as const,
    ownershipCategory: "unknown" as const
  }));
  const [answerHash, sourceHash] = await Promise.all([
    generativeSearchAnswerHash(parsed, { semanticValidation: input.semanticMode, locale: input.locale }),
    generativeSearchSourceHash(parsed.sources)
  ]);
  const draft: FreeTeaserQ1Core = {
    answerMode: "generative_search_v1",
    questionId: parsed.questionId,
    exactQuestion: questionText,
    status: parsed.refusal ? "refused" : "answered",
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
    refusal: parsed.refusal,
    audit: {
      verifiedBodyCount: 0,
      searchSourceOnlyCount: sources.length,
      inaccessibleCount: 0
    }
  };
  let card: GenerativeSearchAnswerCardV3 | undefined;
  if (input.semanticMode === "legacy") {
    const { audit, ...cardCore } = draft;
    card = {
      ...cardCore,
      geoDiagnosis: diagnoseGenerativeSearchAnswerCardV3(
        { answerText: parsed.answerText, sources },
        {
          exactQuestion: questionText,
          locale: input.locale,
          targetAliases: input.questionSet!.identityExclusions,
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
  questionSet?: ConfirmedBusinessQuestionSet;
  freeQuestion?: { text: string; identityHash: string };
  targetUrl: string;
  admission: ReportV4SiteSnapshotBundle;
}): Promise<void> {
  const { checkpoint } = input;
  const result = checkpoint.q1AnswerResult;
  const draft = checkpoint.q1AnswerDraft;
  const direct = Boolean(checkpoint.directQuestionTexts);
  const authorityIdentity = direct ? input.freeQuestion?.identityHash : input.questionSet?.contentHash;
  if (checkpoint.stage !== "q1_answer_ready" || !result || !draft || checkpoint.questionSetIdentity !== authorityIdentity) {
    throw new OrchestrationInvariantError("Marked Free teaser answer draft authority is incomplete.");
  }
  const canonicalQuestion = direct
    ? { id: `free-question-id-${sha({ identityHash: input.freeQuestion!.identityHash, locale: checkpoint.locale, region: checkpoint.region })}` }
    : toCanonicalBuyerQuestionSet(input.questionSet!).questions[0]!;
  const expectedQuestion = direct
    ? input.freeQuestion!.text
    : input.questionSet!.questions[0]!.privateText;
  if (createSiteKey(input.targetUrl) !== input.admission.snapshot.siteKey || draft.questionId !== canonicalQuestion.id || draft.exactQuestion !== expectedQuestion ||
      draft.answerMode !== "generative_search_v1" ||
      (direct
        ? (draft.status === "answered") === Boolean(draft.refusal)
        : draft.status !== "answered" || draft.refusal !== null)) {
    throw new OrchestrationInvariantError("Marked Free teaser answer draft does not match its question or target authority.");
  }
  const parsed = parseGenerativeSearchAnswerResult(result, {
    expectedQuestionId: canonicalQuestion.id,
    locale: checkpoint.locale,
    semanticValidation: checkpoint.directQuestionTexts ? "free_direct" : "deferred"
  });
  // An incomplete persisted model answer is model-output incompleteness
  // (transient); divergence from its checkpointed draft is an internal
  // contradiction (permanent invariant).
  if (!direct && (!parsed.answerText || parsed.refusal || parsed.sources.length === 0)) {
    throw new FreeTeaserQ1IncompleteError();
  }
  if (parsed.answerText !== draft.answerText || hashReportSemanticReviewValue(parsed.refusal) !== hashReportSemanticReviewValue(draft.refusal)) {
    throw new OrchestrationInvariantError("Marked Free teaser answer draft differs from its persisted result.");
  }
  const resultSources = parsed.sources.map(canonicalAnswerSourceProjection);
  const draftSources = draft.sources.map(canonicalAnswerSourceProjection);
  const [answerHash, sourceHash] = await Promise.all([
    generativeSearchAnswerHash(parsed, {
      semanticValidation: checkpoint.directQuestionTexts ? "free_direct" : "deferred",
      locale: checkpoint.locale
    }),
    generativeSearchSourceHash(parsed.sources)
  ]);
  if (hashReportSemanticReviewValue(resultSources) !== hashReportSemanticReviewValue(draftSources) ||
      draft.provenance.answerHash !== answerHash || draft.provenance.sourceHash !== sourceHash ||
      draft.provenance.searchedAt !== parsed.searchedAt || draft.provenance.completedAt !== parsed.completedAt ||
      draft.sources.some((source) => source.retrievalStatus !== "search_source_only" || source.ownershipCategory !== "unknown") ||
      draft.audit.verifiedBodyCount !== 0 || draft.audit.searchSourceOnlyCount !== draft.sources.length || draft.audit.inaccessibleCount !== 0) {
    throw new OrchestrationInvariantError("Marked Free teaser answer draft hash, source, time, or completeness binding is invalid.");
  }
  if (direct) {
    if (!checkpoint.directCoreReceipt) {
      throw new OrchestrationInvariantError("Free direct Q1 core receipt is missing.");
    }
    verifyFreeV4DirectCoreReceipt(checkpoint.directCoreReceipt, freeDirectCoreReceiptInput(checkpoint));
  }
  if (!checkpoint.q1DiagnosisDraft) return;
  if (direct) throw new OrchestrationInvariantError("Free direct Q1 core cannot contain a legacy diagnosis draft.");
  const diagnosis = parseReportV4DiagnosisOutputForQuestion(checkpoint.q1DiagnosisDraft, {
    questionId: draft.questionId,
    sourceEvidenceIds: draft.sources.map(({ sourceId }) => sourceId)
  }, { semanticValidation: "deferred" });
  const targetEvidenceIds = new Set(buildFreeTeaserDiagnosisTargetPages(draft.questionId, input.admission)
    .flatMap((page) => page.sourceLocations.map(({ locationId }) => locationId)));
  const sourceIds = new Set(draft.sources.map(({ sourceId }) => sourceId));
  if (diagnosis.detailedEvidenceRefs.some((ref) => !sourceIds.has(ref) && !targetEvidenceIds.has(ref)) ||
      hashReportSemanticReviewValue(diagnosis) !== hashReportSemanticReviewValue(checkpoint.q1DiagnosisDraft)) {
    throw new OrchestrationInvariantError("Marked Free teaser diagnosis draft does not match current source and target evidence.");
  }
}

function toDiagnosisQuestion(card: FreeTeaserQ1Core | GenerativeSearchAnswerCardV3): CombinedGeoReportV4Question {
  return {
    order: 1,
    questionId: card.questionId,
    questionText: card.exactQuestion,
    status: card.refusal ? "unavailable" : "answered",
    answer: card.refusal ? null : card.answerText,
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
  runtime: ProviderProfilePublicSearchRuntime;
  bundles: VerifiedFreeTeaserSnapshotBundles;
  onSemanticReviewBatchEvidence?: (evidence: FreeV4SemanticReviewBatchEvidence) => void;
  signal?: AbortSignal;
}): Promise<FreeTeaserCheckpointV1> {
  const checkpoint = input.checkpoint;
  const draft = checkpoint.q1AnswerDraft;
  const diagnosis = checkpoint.q1DiagnosisDraft;
  const snapshotIds = checkpoint.observationSnapshotIds;
  if (!draft || !diagnosis || !snapshotIds) throw new Error("Marked Free teaser review inputs are incomplete.");
  const runtime = getPreparedProviderProfileRuntime().modelRuntime;
  const reviewInput = buildFreeTeaserSemanticReviewInput({ ...input, card: draft, diagnosis, modelId: runtime.modelProfile.operations.websiteSynthesis.model });
  const structured = getPreparedProviderProfileRuntime().createStructuredInvoker(runtime);
  const signal = input.signal ?? new AbortController().signal;
  const reviewed = await runOfflineReportSemanticReviewBatched(
    reviewInput,
    async ({ systemText, inputText }) => structured.invoke({ operation: "websiteSynthesis", systemText, inputText, signal }),
    undefined,
    { onBatchEvidence: input.onSemanticReviewBatchEvidence }
  );
  const answerAnnotation = reviewed.review.annotations.answers[0];
  if (answerAnnotation?.degraded === true) throw new FreeTeaserQ1AnnotationDegradedError();
  if (!answerAnnotation || answerAnnotation.targetPresence === undefined || answerAnnotation.targetPresence === "ambiguous" || answerAnnotation.targetFirstSentence === undefined || answerAnnotation.targetRoles === undefined || answerAnnotation.competitorEntityIds === undefined) {
    throw new FreeTeaserQ1AnnotationDegradedError("Marked Free teaser review omitted durable Q1 diagnosis semantics.");
  }
  const expectedEntityRole = answerAnnotation.targetPresence === "present"
    ? answerAnnotation.competitorEntityIds.length ? "mixed" : "target"
    : answerAnnotation.competitorEntityIds.length ? "competitor" : "none";
  if (answerAnnotation.entityRole === "ambiguous" || answerAnnotation.entityRole !== expectedEntityRole) {
    throw new FreeTeaserQ1AnnotationDegradedError("Marked Free teaser review returned contradictory Q1 entity semantics.");
  }
  const textByPath = new Map(reviewed.applied.fields.map((field) => [field.path, field.appliedText]));
  const reviewedFoundation = applyReviewedFoundation(input.foundation, textByPath);
  const correctedDiagnosis = {
    ...diagnosis,
    selectionSummary: textByPath.get("q1Diagnosis.selectionSummary")!,
    observableFactors: diagnosis.observableFactors.map((factor, index) => ({ ...factor, observation: textByPath.get(`q1Diagnosis.observableFactors[${index}].observation`)! })) as unknown as typeof diagnosis.observableFactors,
    targetGap: textByPath.get("q1Diagnosis.targetGap")!,
    recommendedActions: diagnosis.recommendedActions.map((action, index) => ({ ...action, action: textByPath.get(`q1Diagnosis.recommendedActions[${index}].action`)! })) as unknown as typeof diagnosis.recommendedActions
  };
  const correctedAnswerText = textByPath.get("q1AnswerCard.answerText")!;
  assertGenerativeSearchAnswerLanguage([{ path: "q1AnswerCard.answerText", text: correctedAnswerText }], checkpoint.locale);
  const correctedAnswerResult = { ...checkpoint.q1AnswerResult!, answerText: correctedAnswerText };
  const correctedAnswerHash = await generativeSearchAnswerHash(correctedAnswerResult, { semanticValidation: "deferred", locale: checkpoint.locale });
  const q1AnswerCard: GenerativeSearchAnswerCardV3 = {
    ...draft,
    answerText: correctedAnswerText,
    provenance: { ...draft.provenance, answerHash: correctedAnswerHash },
    geoDiagnosis: { targetMentioned: answerAnnotation.targetPresence === "present", targetFirstSentence: answerAnnotation.targetPresence === "present" ? answerAnnotation.targetFirstSentence : null, targetRoles: [...answerAnnotation.targetRoles], competitorEntityIds: [...answerAnnotation.competitorEntityIds], citedOwnership: ownershipCountsFromSources(draft.sources), missingEvidenceFamilies: [], retestQuestion: draft.exactQuestion },
    diagnosis: correctedDiagnosis
  };
  const metrics = { questionCount: 3 as const, ...deriveFreeObservationMetrics(reviewed.review) };
  const checkpointCore = { ...checkpoint };
  delete checkpointCore.q1AnswerDraft;
  delete checkpointCore.q1DiagnosisDraft;
  return { ...checkpointCore, stage: "ready", metrics: { questionCount: 3, brandMentionCount: metrics.targetMentionCount, competitorMentionCount: metrics.competitorMentionCount }, q1AnswerResult: correctedAnswerResult, q1AnswerCard, reviewedFoundation, semanticReview: { version: REPORT_SEMANTIC_REVIEW_CONTRACT, input: reviewInput, output: reviewed.review, applied: reviewed.applied }, readyAt: new Date().toISOString() };
}

function buildFreeTeaserSemanticReviewInput(input: {
  reportId: string;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  admission: ReportV4SiteSnapshotBundle;
  checkpoint: FreeTeaserCheckpointV1;
  questionSet: ConfirmedBusinessQuestionSet;
  runtime: ProviderProfilePublicSearchRuntime;
  bundles: VerifiedFreeTeaserSnapshotBundles;
  card: FreeTeaserQ1Core | GenerativeSearchAnswerCardV3;
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
    return { sourceId: source.sourceId, questionId: input.card.questionId, canonicalUrl: source.canonicalUrl, originalText, originalTextHash: reportSemanticTextHash(originalText), eligible: true };
  });
  const targetPages = buildFreeTeaserDiagnosisTargetPages(input.card.questionId, input.admission);
  const evidence = [
    ...sources.map((source) => ({ evidenceId: source.sourceId, questionId: source.questionId, sourceId: source.sourceId, originalText: source.originalText, originalTextHash: source.originalTextHash, eligible: true })),
    ...targetPages.flatMap((page) => page.sourceLocations.map((location) => ({ evidenceId: location.locationId, questionId: input.card.questionId, sourceId: null, originalText: page.summary.slice(location.startOffset, location.endOffset), originalTextHash: reportSemanticTextHash(page.summary.slice(location.startOffset, location.endOffset)), eligible: true })))
  ];
  const diagnosisEvidence = [...input.diagnosis.detailedEvidenceRefs];
  const diagnosisSourceIds = diagnosisEvidence.filter((id) => sources.some((source) => source.sourceId === id));
  const text = (path: string, fallback: string) => input.originalTextByPath?.get(path) ?? fallback;
  const fields = [
    ...buildFreeV4FoundationManifestCoverage(input.foundation).map((field) => ({ ...field, text: text(field.path, field.text) })),
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
  // Free V4 is multi-domain: foundation/questions are language-only (empty
  // allowlists); Q1 answer/diagnosis carry field-local source/evidence IDs.
  // Do not apply Paid `report_global_v1` — code only validates deterministic
  // ID/subset/ownership rules; the model owns analysis and which allowed IDs
  // to cite when a field allowlist is non-empty.
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
  runtime: ProviderProfilePublicSearchRuntime;
  bundles: VerifiedFreeTeaserSnapshotBundles;
}): void {
  const { checkpoint } = input;
  if (!checkpoint.semanticReview || !checkpoint.q1AnswerCard?.diagnosis) throw new Error("Marked Free teaser ready review authority is incomplete.");
  verifyFreeTeaserSemanticProjection(checkpoint);
  const originalTextByPath = new Map(checkpoint.semanticReview.input.fields.map((field) => [field.path, field.originalText]));
  const modelRuntime = getPreparedProviderProfileRuntime().modelRuntime;
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
  card: FreeTeaserQ1Core | GenerativeSearchAnswerCardV3;
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

function ownershipCountsFromSources(sources: readonly GenerativeSearchAnswerCardV3["sources"][number][]): NonNullable<GenerativeSearchAnswerCardV3["geoDiagnosis"]>["citedOwnership"] {
  const counts = { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 };
  for (const source of sources) counts[source.ownershipCategory] += 1;
  return counts;
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

function assertSemanticReviewCheckpointMode(
  checkpoint: FreeTeaserCheckpointV1,
  semanticReviewEnabled: boolean,
  freeDirectEnabled: boolean
): void {
  if (!semanticReviewEnabled && !freeDirectEnabled && (checkpoint.q1AnswerDraft || checkpoint.q1DiagnosisDraft || checkpoint.semanticReview ||
      checkpoint.directCoreReceipt || checkpoint.directAnalysisStatus || checkpoint.directAnalysis ||
      checkpoint.directAnalysisHandleBindings || checkpoint.directAnalysisReceipt)) {
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
  if (freeDirectEnabled) {
    if (checkpoint.semanticReview || checkpoint.reviewedFoundation || !checkpoint.directQuestionTexts) {
      throw new Error("Free direct checkpoint does not match direct semantic lineage.");
    }
    const hasSnapshots = checkpoint.observationSnapshotIds?.length === 3;
    const hasResult = Boolean(checkpoint.q1AnswerResult);
    const hasDraft = Boolean(checkpoint.q1AnswerDraft);
    const hasCard = Boolean(checkpoint.q1AnswerCard);
    const hasCoreReceipt = Boolean(checkpoint.directCoreReceipt);
    const hasAnalysisStatus = Boolean(checkpoint.directAnalysisStatus);
    const hasAnalysis = Boolean(checkpoint.directAnalysis);
    const hasBindings = Boolean(checkpoint.directAnalysisHandleBindings);
    const hasAnalysisReceipt = Boolean(checkpoint.directAnalysisReceipt);
    const hasMetrics = Boolean(checkpoint.metrics);
    const validShape = checkpoint.stage === "questions_ready"
      ? !hasSnapshots && !hasResult && !hasDraft && !hasCard && !hasCoreReceipt && !hasAnalysisStatus &&
        !hasAnalysis && !hasBindings && !hasAnalysisReceipt && !hasMetrics
      : checkpoint.stage === "q1_answer_ready"
          ? !hasSnapshots && hasResult && hasDraft && !hasCard && hasCoreReceipt && !hasAnalysisStatus &&
            !hasAnalysis && !hasBindings && !hasAnalysisReceipt && !hasMetrics
          : checkpoint.stage === "ready"
            ? !hasSnapshots && hasResult && hasDraft && !hasCard && hasCoreReceipt && hasAnalysisStatus && !hasMetrics
            : false;
    if (!validShape) throw new Error("Free direct checkpoint stage shape is invalid.");
  }
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

/** Canonical Free V4 checkpoint identity for the complete persisted Foundation payload. */
export function hashFreeTeaserFoundation(foundation: AiWebsiteReportV1): string {
  return sha(foundation);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isQuestionAuthorityIdentity(value: unknown): value is string {
  return typeof value === "string" && /^(?:confirmed-business-question-set|free-question)-[a-f0-9]{64}$/u.test(value);
}

export async function loadConfirmedFreeTeaserQuestionSet(
  reportId: string,
  checkpoint: FreeTeaserCheckpointV1,
  options?: {
    semanticReviewContractVersion?: typeof REPORT_SEMANTIC_REVIEW_CONTRACT | null;
    freeDirectSemanticsVersion?: typeof FREE_V4_DIRECT_SEMANTICS_VERSION | null;
  }
): Promise<ConfirmedBusinessQuestionSet> {
  const ready = parseReadyFreeTeaserCheckpoint(checkpoint, options);
  const questionSet = await getConfirmedBusinessQuestionSet(reportId, ready.questionSetId!);
  if (!questionSet || questionSet.contentHash !== ready.questionSetIdentity) {
    throw new Error("Free teaser question-set authority is unavailable.");
  }
  return questionSet;
}
