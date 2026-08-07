import {
  applyCompletePaidV3SemanticReviewToReport,
  applyReportSemanticReview,
  assertPaidV3Q1AnnotationContinuity,
  bindPaidV3SemanticReviewReceiptToFinalReport,
  buildCanonicalPaidV3DraftManifestCoverage,
  buildPaidV3SourceSelectionCatalog,
  buildPaidV3ReportSemanticReviewSystemPrompt,
  buildPaidV3SemanticReviewManifest,
  generativeSearchAnswerHash,
  hashReportSemanticReviewValue,
  parseReportSemanticReviewOutput,
  parseReportSemanticReviewInput,
  requireReadyCombinedGeoReportV3,
  verifyPaidV3SemanticReviewApplication,
  type PaidV3SemanticAnswerCardDraft,
  type PaidV3SourceSelectionValidationContext,
  type CombinedGeoReportV3,
  type AppliedReportSemanticField,
  type GenerativeSearchAnswerResult,
  type PaidV3DraftManifestCoverageOptions,
  type ReportSemanticAnswerAnnotation,
  type ReportSemanticManifestSeed,
  type ReportSemanticReviewAuthorityBindings
} from "@open-geo-console/ai-report-engine";
import type { GenerativeSearchAnswerCardV3, ReportSemanticReviewInput } from "@open-geo-console/ai-report-engine";
import type { PaidV3AnswerPacketV1, PaidV3PacketsByQuestion } from "./paid-v3-answer-packet";
import {
  assertNoBodyDuplicationAcrossCatalogs,
  buildPaidV3CompactReviewUserText,
  buildPaidV3CompactTransportInput,
  buildPaidV3SourceDictionary,
  evaluatePaidV3CompactTokenBudget,
  type PaidV3SourceDictionary,
  type PaidV3TransportTokenBreakdown
} from "./paid-v3-compact-review-input";

/** The injected transport is deliberately the sole model boundary for Paid V3 review. */
export interface PaidV3WebsiteSynthesisReviewer {
  review(request: { systemText: string; inputText: string; signal?: AbortSignal }): Promise<unknown>;
}

const COMPACT_REVIEW_SYSTEM_SUFFIX =
  "\nBodies are only in input.sourceDictionary by sourceId; catalog originalText is a hash shell. Echo input.inputHash (canonical), never transportInputHash.";

export type PaidV3SemanticReviewSourceSelectionContext = PaidV3SourceSelectionValidationContext;
type PaidV3SourceSelectionIdentityBase = Omit<PaidV3SourceSelectionValidationContext["finalSourceSelectionInputIdentity"], "answerHash">;
type PaidV3SourceSelectionContextBeforeAnswerHash = Omit<PaidV3SemanticReviewSourceSelectionContext, "finalSourceSelectionInputIdentity"> & { readonly finalSourceSelectionInputIdentity: PaidV3SourceSelectionIdentityBase };

/**
 * Builds the Paid-only semantic manifest from the already collected draft.
 * It intentionally receives structural identities and evidence from the Worker:
 * recreating them here would make this helper a second source of crawl/state
 * authority. Customer prose is supplied as the complete caller-enumerated
 * manifest leaves and Q1 is made read-only here, fail-closed.
 */
export function buildPaidV3SemanticReviewDraft(input: Omit<ReportSemanticManifestSeed, "fields" | "nonProseProjectionHash" | "sourceSelectionCatalog"> & {
  readonly reportDraft: unknown;
  readonly manifestCoverageOptions?: PaidV3DraftManifestCoverageOptions;
  readonly sourceSelectionCatalogSeeds: Parameters<typeof buildPaidV3SourceSelectionCatalog>[0];
}): ReportSemanticManifestSeed {
  if (input.answerSubjects.length !== 3) {
    throw new TypeError("Paid V3 semantic review requires complete customer-prose and answer-subject coverage.");
  }
  const q1 = input.questions[0];
  if (!q1 || input.questions.length !== 3) throw new TypeError("Paid V3 semantic review requires exactly three ordered questions.");
  const coverage = buildCanonicalPaidV3DraftManifestCoverage(input.reportDraft, input.manifestCoverageOptions);
  const fields = coverage.fields.map((field) => ({ ...field, ...(field.questionId === q1.questionId ? { mutability: "read_only" as const } : {}) }));
  const q1Fields = fields.filter((field) => field.questionId === q1.questionId);
  if (!q1Fields.length || q1Fields.some((field) => field.mutability !== "read_only")) {
    throw new TypeError("Paid V3 semantic review requires read-only Free Q1 manifest coverage.");
  }
  const sourceSelectionCatalog = buildPaidV3SourceSelectionCatalog(input.sourceSelectionCatalogSeeds);
  if (!sourceSelectionCatalog.length) throw new TypeError("Paid V3 semantic review requires a complete source-selection catalog.");
  return {
    locale: input.locale,
    target: input.target,
    expectedModel: input.expectedModel,
    questions: input.questions,
    sources: input.sources,
    evidence: input.evidence,
    observationResults: input.observationResults,
    entities: input.entities,
    answerSubjects: input.answerSubjects,
    authorityBindings: input.authorityBindings,
    fields,
    sourceSelectionCatalog,
    nonProseProjectionHash: coverage.nonProseProjectionHash
  };
}

export interface RunPaidV3SemanticReviewInput<T extends {
  readonly answerCards: readonly PaidV3SemanticAnswerCardDraft[];
  readonly engineProvenance: CombinedGeoReportV3["engineProvenance"];
}> {
  /** A pre-review carrier: it deliberately need not contain a legacy source-selection diagnosis. */
  readonly report: T;
  readonly manifest: Omit<ReportSemanticManifestSeed, "fields" | "nonProseProjectionHash"> & { readonly manifestCoverageOptions?: PaidV3DraftManifestCoverageOptions; readonly sourceSelectionCatalogSeeds: Parameters<typeof buildPaidV3SourceSelectionCatalog>[0] };
  readonly sourceSelectionContext: PaidV3SourceSelectionContextBeforeAnswerHash;
  readonly answerResults: readonly [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  /** The externally reverified, reviewed Free Q1 card. It is never regenerated or corrected here. */
  readonly reviewedFreeQ1: GenerativeSearchAnswerCardV3;
  /** The exact accepted Free Q1 semantic annotation. Paid review may explain it again but not reinterpret it. */
  readonly reviewedFreeQ1Annotation: ReportSemanticAnswerAnnotation;
  readonly reviewer: PaidV3WebsiteSynthesisReviewer;
  readonly signal?: AbortSignal;
  /** Compact transport materials; when omitted, built from manifest sources (legacy tests). */
  readonly sourceDictionary?: PaidV3SourceDictionary;
  readonly packets?: PaidV3PacketsByQuestion | readonly PaidV3AnswerPacketV1[];
  readonly onTransportMetrics?: (metrics: PaidV3TransportTokenBreakdown) => void | Promise<void>;
}

export interface PaidV3SemanticReviewProjection {
  readonly input: ReturnType<typeof buildPaidV3SemanticReviewManifest>;
  readonly output: ReturnType<typeof parseReportSemanticReviewOutput>;
  readonly applied: ReturnType<typeof applyCompletePaidV3SemanticReviewToReport>;
  readonly report: CombinedGeoReportV3;
  readonly transportMetrics?: PaidV3TransportTokenBreakdown;
}

/**
 * Runs exactly one injected website-synthesis review, then performs only pure,
 * evidence-bound application. It contains no artifact or persistence operation.
 */
export async function runPaidV3SemanticReview<T extends {
  readonly answerCards: readonly PaidV3SemanticAnswerCardDraft[];
  readonly engineProvenance: CombinedGeoReportV3["engineProvenance"];
}>(input: RunPaidV3SemanticReviewInput<T>): Promise<PaidV3SemanticReviewProjection> {
  const manifestSeed = buildPaidV3SemanticReviewDraft({ ...input.manifest, reportDraft: input.report });
  assertReadOnlyFreeQ1(input.report, input.reviewedFreeQ1, manifestSeed);
  const reviewInput = buildPaidV3SemanticReviewManifest(manifestSeed);
  assertNoBodyDuplicationAcrossCatalogs(reviewInput);
  const sourceDictionary = input.sourceDictionary ?? buildDictionaryFromCanonicalSources(reviewInput.sources);
  const transport = buildPaidV3CompactTransportInput({
    canonicalReviewInput: reviewInput,
    packets: input.packets ?? [],
    sourceDictionary
  });
  const systemText = buildPaidV3ReportSemanticReviewSystemPrompt() + COMPACT_REVIEW_SYSTEM_SUFFIX;
  const inputText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: reviewInput });
  let transportMetrics: PaidV3TransportTokenBreakdown;
  try {
    transportMetrics = evaluatePaidV3CompactTokenBudget({
      systemText, userText: inputText, packets: transport.packets, sourceDictionary,
      proseFieldsText: JSON.stringify(reviewInput.fields),
      canonicalInputHash: transport.canonicalInputHash, transportInputHash: transport.transportInputHash
    });
  } catch (error) {
    if (error && typeof error === "object" && "breakdown" in error) {
      await input.onTransportMetrics?.((error as { breakdown: PaidV3TransportTokenBreakdown }).breakdown);
    }
    throw error;
  }
  await input.onTransportMetrics?.(transportMetrics);
  const rawReview = await input.reviewer.review({ systemText, inputText, signal: input.signal });
  const output = parseReportSemanticReviewOutput(rawReview, reviewInput);
  assertPaidV3Q1AnnotationContinuity(
    requirePaidQ1Annotation(output.annotations.answers, input.reviewedFreeQ1.questionId),
    input.reviewedFreeQ1Annotation
  );
  const projected = applyReportSemanticReview(reviewInput, output, manifestSeed.nonProseProjectionHash);
  const answerResults = await projectReviewedAnswerResults(input.answerResults, projected.fields);
  const perAnswerHashes = await Promise.all(answerResults.map((result) => generativeSearchAnswerHash(result, { locale: reviewInput.locale, semanticValidation: "deferred" })));
  const answerHash = hashAnswerHashes(perAnswerHashes);
  const finalSourceSelectionInputIdentity = {
    ...input.sourceSelectionContext.finalSourceSelectionInputIdentity,
    answerHash
  };
  const applied = applyCompletePaidV3SemanticReviewToReport(
    input.report,
    reviewInput,
    output,
    manifestSeed.nonProseProjectionHash,
    { ...input.sourceSelectionContext, questions: input.sourceSelectionContext.questions.map((question, index) => ({ ...question, answerText: answerResults[index]!.answerText })), finalSourceSelectionInputIdentity }
  );
  const appliedCards = requireGenerativeCards(applied.report.answerCards);
  const withProvenance = {
    ...applied.report,
    answerCards: appliedCards.map((card, index) => ({ ...card, provenance: { ...card.provenance, answerHash: perAnswerHashes[index]! } })) as CombinedGeoReportV3["answerCards"],
    engineProvenance: { ...applied.report.engineProvenance, answerHash }
  };
  const initiallyBound = bindPaidV3SemanticReviewReceiptToFinalReport(withProvenance, applied.receipt);
  const normalized = requireReadyCombinedGeoReportV3(initiallyBound.report, { semanticValidation: "deferred" });
  const { semanticReviewReceipt: _normalizedReceipt, ...normalizedProjection } = normalized;
  void _normalizedReceipt;
  const bound = bindPaidV3SemanticReviewReceiptToFinalReport(normalizedProjection, applied.receipt);
  const report = requireReadyCombinedGeoReportV3(bound.report, { semanticValidation: "deferred" });
  assertReadOnlyFreeQ1(report, input.reviewedFreeQ1, manifestSeed);
  return { input: reviewInput, output, applied, report, transportMetrics };
}

function buildDictionaryFromCanonicalSources(
  sources: ReportSemanticReviewInput["sources"]
): PaidV3SourceDictionary {
  const seen = new Set<string>();
  return buildPaidV3SourceDictionary(sources.flatMap((source) => {
    if (seen.has(source.sourceId)) return [];
    seen.add(source.sourceId);
    return [{
      sourceId: source.sourceId,
      canonicalUrl: source.canonicalUrl,
      title: source.sourceId,
      citedText: source.originalText,
      auditExcerpt: null
    }];
  }));
}

async function projectReviewedAnswerResults(
  results: readonly [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult],
  fields: readonly AppliedReportSemanticField[]
): Promise<[GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult]> {
  const textByPath = new Map(fields.map((field) => [field.path, field.appliedText]));
  return results.map((result, index) => ({ ...result, answerText: textByPath.get(`answerCards[${index}].answerText`) ?? result.answerText })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
}
function hashAnswerHashes(values: readonly string[]): string { return hashReportSemanticReviewValue(values); }

/** Model-free guard for a persisted reviewed projection before resume/materialization. */
export async function verifyPersistedPaidV3SemanticReview(input: {
  report: CombinedGeoReportV3;
  rawInput: unknown;
  rawReview: unknown;
  appliedFields: readonly AppliedReportSemanticField[];
  answerResults: readonly [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  reviewedFreeQ1: GenerativeSearchAnswerCardV3;
  reviewedFreeQ1Annotation: ReportSemanticAnswerAnnotation;
  expectedAuthorityBindings: ReportSemanticReviewAuthorityBindings;
}): Promise<void> {
  const reviewInput = parseReportSemanticReviewInput(input.rawInput);
  if (hashReportSemanticReviewValue(reviewInput.authorityBindings) !==
      hashReportSemanticReviewValue(input.expectedAuthorityBindings)) {
    throw new TypeError("Persisted Paid V3 authority bindings do not match the rebuilt root-bound authorities.");
  }
  const output = parseReportSemanticReviewOutput(input.rawReview, reviewInput);
  assertPaidV3Q1AnnotationContinuity(
    requirePaidQ1Annotation(output.annotations.answers, input.reviewedFreeQ1.questionId),
    input.reviewedFreeQ1Annotation
  );
  const projected = applyReportSemanticReview(reviewInput, output, reviewInput.nonProseProjectionHash);
  if (hashReportSemanticReviewValue(projected.fields) !== hashReportSemanticReviewValue(input.appliedFields)) {
    throw new TypeError("Persisted Paid V3 applied fields do not match the reviewed projection.");
  }
  const answers = await projectReviewedAnswerResults(input.answerResults, projected.fields);
  const perHashes = await Promise.all(answers.map((answer) => generativeSearchAnswerHash(answer, { locale: reviewInput.locale, semanticValidation: "deferred" })));
  const answerHash = hashAnswerHashes(perHashes);
  const sourceSelectionContext = persistedSourceSelectionContext(input.report);
  const reportCards = requireGenerativeCards(input.report.answerCards);
  const finalSourceSelectionInputIdentity = sourceSelectionContext.finalSourceSelectionInputIdentity;
  if (input.report.engineProvenance.answerHash !== answerHash || reportCards.some((card, index) => card.provenance.answerHash !== perHashes[index]!) ||
      !input.report.sourceSelectionDiagnosis || hashReportSemanticReviewValue(input.report.sourceSelectionDiagnosis.inputIdentity) !== hashReportSemanticReviewValue(finalSourceSelectionInputIdentity)) {
    throw new TypeError("Persisted Paid V3 answer or source-selection identity does not match the reviewed projection.");
  }
  verifyPaidV3SemanticReviewApplication(
    input.report,
    input.rawInput,
    input.rawReview,
    input.appliedFields,
    reviewInput.nonProseProjectionHash,
    sourceSelectionContext
  );
  assertReadOnlyFreeQ1(input.report, input.reviewedFreeQ1);
}

function requirePaidQ1Annotation(
  annotations: readonly ReportSemanticAnswerAnnotation[],
  questionId: string
): ReportSemanticAnswerAnnotation {
  const matches = annotations.filter((annotation) => annotation.questionId === questionId);
  if (matches.length !== 1) {
    throw new TypeError("Paid V3 review requires exactly one annotation for the accepted Free Q1.");
  }
  return matches[0]!;
}

function persistedSourceSelectionContext(report: CombinedGeoReportV3): PaidV3SemanticReviewSourceSelectionContext {
  if (!report.sourceSelectionDiagnosis) throw new TypeError("Persisted Paid V3 source-selection authority is unavailable.");
  const cards = requireGenerativeCards(report.answerCards);
  return {
    questions: cards.map((card) => ({
      questionId: card.questionId,
      answerText: card.answerText,
      sources: card.sources.map((source) => ({
        ...source,
        questionId: card.questionId,
        auditExcerpt: null
      }))
    })),
    missingEvidenceFamiliesByQuestion: [
      cards[0].geoDiagnosis!.missingEvidenceFamilies,
      cards[1].geoDiagnosis!.missingEvidenceFamilies,
      cards[2].geoDiagnosis!.missingEvidenceFamilies
    ],
    finalSourceSelectionInputIdentity: report.sourceSelectionDiagnosis.inputIdentity,
    allowPersistedIndependentExcerpts: true
  };
}

function requireGenerativeCards(
  cards: readonly PaidV3SemanticAnswerCardDraft[]
): [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3] {
  if (cards.length !== 3 || cards.some((card) => card.answerMode !== "generative_search_v1" || !("provenance" in card))) {
    throw new TypeError("Reviewed Paid V3 requires exactly three generative answer cards.");
  }
  return cards as [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
}

function assertReadOnlyFreeQ1(
  report: { readonly answerCards: readonly PaidV3SemanticAnswerCardDraft[] },
  reviewedFreeQ1: GenerativeSearchAnswerCardV3,
  seed?: ReportSemanticManifestSeed
): void {
  const q1 = report.answerCards[0];
  if (!q1 || hashReportSemanticReviewValue(q1) !== hashReportSemanticReviewValue(reviewedFreeQ1)) {
    throw new TypeError("Paid V3 Q1 must remain identical to the externally reviewed Free Q1 authority.");
  }
  if (seed && seed.fields.some((field) => field.questionId === q1.questionId && field.mutability !== "read_only")) {
    throw new TypeError("Paid V3 manifest must make every Free Q1 semantic field read-only.");
  }
}
