import {
  applyReportSemanticReview,
  createReportSemanticReviewInput,
  hashReportSemanticReviewValue,
  parsePaidV3ReportSemanticReviewReceipt,
  parseReportSemanticReviewInput,
  parseReportSemanticReviewOutput,
  reportSemanticTextHash,
  verifyReportSemanticReviewReceipt,
  type AppliedReportSemanticField,
  type AppliedReportSemanticReview,
  type PaidV3ReportSemanticReviewReceipt,
  type ReportSemanticEvidence,
  type ReportSemanticEntity,
  type ReportSemanticExpectedModel,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticObservationResult,
  type ReportSemanticQuestion,
  type ReportSemanticReviewAuthorityBindings,
  type ReportSemanticEvidencePolicy,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewReceipt,
  type ReportSemanticSource,
  type ReportSemanticSourceSelectionCatalogEntry,
  type ReportSemanticTargetIdentity
} from "./report-semantic-review";
import {
  type GenerativeSearchAnswerCardV3,
  type OpenGeoAnswerCardV3,
  type OpenGeoAnswerOwnershipCategoryV3
} from "./open-geo-answer-v3";
import {
  parseSourceSelectionDiagnosisV1,
  type SourceSelectionDiagnosisV1,
  type SourceSelectionSourceInputV1
} from "./source-selection-diagnosis-v1";
import { hashCombinedGeoReportV3ReceiptExcludedProjection } from "./combined-geo-report-v3";

export interface ReportSemanticManifestFieldSeed {
  readonly path: string;
  readonly text: string;
  readonly mutability: "mutable" | "read_only";
  readonly questionId: string | null;
  readonly allowedEvidenceIds: readonly string[];
  readonly allowedSourceIds: readonly string[];
}

export interface ReportSemanticManifestSeed {
  readonly evidencePolicy?: ReportSemanticEvidencePolicy;
  readonly locale: string;
  readonly target: ReportSemanticTargetIdentity;
  readonly expectedModel: ReportSemanticExpectedModel;
  readonly questions: readonly ReportSemanticQuestion[];
  readonly sources: readonly ReportSemanticSource[];
  readonly evidence: readonly ReportSemanticEvidence[];
  readonly observationResults: readonly ReportSemanticObservationResult[];
  readonly entities?: readonly ReportSemanticEntity[];
  readonly answerSubjects: readonly import("./report-semantic-review").ReportSemanticAnswerSubject[];
  readonly sourceSelectionCatalog?: readonly ReportSemanticSourceSelectionCatalogEntry[];
  readonly authorityBindings?: ReportSemanticReviewAuthorityBindings;
  readonly fields: readonly ReportSemanticManifestFieldSeed[];
  readonly nonProseProjectionHash: string;
}

export interface AppliedPaidV3SemanticReview<T> extends AppliedReportSemanticReview {
  readonly report: T;
  readonly sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
}

export type PaidV3SourceSelectionCatalogSeed =
  | {
      readonly kind: "contribution";
      readonly questionId: string;
      readonly sourceId: string;
      readonly profileId: string;
      readonly allowedEvidenceIds: readonly string[];
    }
  | {
      readonly kind: "target_state" | "factor";
      readonly slotId: string;
      readonly questionId: string | null;
      readonly sourceId: string | null;
      readonly profileId: string;
      readonly allowedEvidenceIds: readonly string[];
    }
  | {
      readonly kind: "action";
      readonly questionId: string | null;
      readonly sourceId: string | null;
      readonly profileId: string | null;
      readonly actionId: string;
      readonly allowedEvidenceIds: readonly string[];
    };

export interface PaidV3SourceSelectionValidationContext {
  readonly questions: Array<{
    questionId: string;
    answerText: string;
    sources: SourceSelectionSourceInputV1[];
  }>;
  readonly allowPersistedIndependentExcerpts?: boolean;
  readonly missingEvidenceFamiliesByQuestion: readonly [
    readonly string[],
    readonly string[],
    readonly string[]
  ];
  readonly finalSourceSelectionInputIdentity: SourceSelectionDiagnosisV1["inputIdentity"];
}

export interface PaidV3DraftManifestFieldOverride {
  readonly path: string;
  readonly mutability?: "mutable" | "read_only";
  readonly questionId?: string | null;
  readonly allowedEvidenceIds?: readonly string[];
  readonly allowedSourceIds?: readonly string[];
}

export interface PaidV3DraftManifestCoverageOptions {
  readonly fieldOverrides?: readonly PaidV3DraftManifestFieldOverride[];
  readonly additionalProsePaths?: readonly string[];
  readonly structuralStringPaths?: readonly string[];
}

export interface PaidV3DraftManifestCoverage {
  readonly fields: readonly ReportSemanticManifestFieldSeed[];
  readonly nonProseProjectionHash: string;
}

/** The Free surface reuses Paid V3's canonical customer-prose inventory. */
export function buildFreeV4FoundationManifestCoverage(foundation: unknown): readonly ReportSemanticManifestFieldSeed[] {
  const coverage = buildCanonicalPaidV3DraftManifestCoverage({
    technicalFoundation: { aiReport: foundation }
  });
  return coverage.fields.map((field) => ({
    ...field,
    path: field.path.replace("technicalFoundation.aiReport", "foundation")
  }));
}

export type PaidV3SemanticAnswerCardDraft =
  | OpenGeoAnswerCardV3
  | Omit<GenerativeSearchAnswerCardV3, "geoDiagnosis">;

type PaidV3ReviewableReport = {
  readonly answerCards: readonly PaidV3SemanticAnswerCardDraft[];
  readonly sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
  readonly semanticReviewReceipt?: ReportSemanticReviewReceipt;
};

/**
 * Canonically enumerates the exact Paid V3 customer-prose surface. The path
 * policy mirrors the final Combined report language-gate surface, then adds
 * immutable business questions and V3 answer/diagnosis prose. Source-selection
 * prose is deliberately absent because the same review returns it separately.
 */
export function buildCanonicalPaidV3DraftManifestCoverage(
  reportDraft: unknown,
  options: PaidV3DraftManifestCoverageOptions = {}
): PaidV3DraftManifestCoverage {
  const root = cloneJsonValue(reportDraft);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new TypeError("Paid V3 reviewable draft must be a JSON object.");
  }
  const stringLeaves = collectStringLeaves(root);
  const leafByPath = new Map(stringLeaves.map((leaf) => [leaf.path, leaf]));
  const overrideByPath = uniquePolicyRows(options.fieldOverrides ?? [], "field override");
  const additionalProsePaths = uniquePolicyPaths(options.additionalProsePaths ?? [], "additional prose path");
  const structuralStringPaths = uniquePolicyPaths(options.structuralStringPaths ?? [], "structural string path");
  for (const path of [...overrideByPath.keys(), ...additionalProsePaths, ...structuralStringPaths]) {
    if (!leafByPath.has(path)) throw new TypeError(`Paid V3 manifest policy references unknown string leaf ${path}.`);
  }
  for (const path of structuralStringPaths) {
    if (additionalProsePaths.has(path) || overrideByPath.has(path)) {
      throw new TypeError(`Paid V3 manifest path ${path} has contradictory prose and structural policy.`);
    }
  }
  const proseLeaves = stringLeaves.filter((leaf) =>
    !structuralStringPaths.has(leaf.path)
    && (isCanonicalPaidV3ProsePath(leaf.path)
      || additionalProsePaths.has(leaf.path)
      || overrideByPath.has(leaf.path))
  );
  const fields = proseLeaves.map((leaf): ReportSemanticManifestFieldSeed => {
    const override = overrideByPath.get(leaf.path);
    const inferred = inferPaidV3AnswerOwnership(root as Record<string, unknown>, leaf.path);
    return {
      path: leaf.path,
      text: leaf.text,
      mutability: override?.mutability ?? (leaf.semanticKey === "exactQuestion" ? "read_only" : "mutable"),
      questionId: override?.questionId !== undefined ? override.questionId : inferred.questionId,
      allowedEvidenceIds: [...(override?.allowedEvidenceIds ?? inferred.allowedEvidenceIds)],
      allowedSourceIds: [...(override?.allowedSourceIds ?? inferred.allowedSourceIds)]
    };
  });
  if (fields.length === 0) throw new TypeError("Paid V3 reviewable draft contains no customer-prose manifest fields.");
  assertUniquePolicyPaths(fields.map(({ path }) => path), "enumerated prose field");
  const fieldPaths = new Set(fields.map(({ path }) => path));
  for (const path of overrideByPath.keys()) {
    if (!fieldPaths.has(path)) throw new TypeError(`Paid V3 manifest override ${path} was not enumerated exactly once.`);
  }
  const nonProseProjection = cloneJsonValue(root);
  for (const { path } of fields) writeDeclaredPath(nonProseProjection, path, "<reviewed-customer-prose>");
  return {
    fields,
    nonProseProjectionHash: hashReportSemanticReviewValue(nonProseProjection)
  };
}

/**
 * Pure ordered catalog construction from exact structural slots. It assigns
 * stable item/annotation identities without inspecting any customer prose.
 */
export function buildPaidV3SourceSelectionCatalog(
  seeds: readonly PaidV3SourceSelectionCatalogSeed[]
): readonly ReportSemanticSourceSelectionCatalogEntry[] {
  return seeds.map((seed, index) => {
    const itemId = seed.kind === "contribution"
      ? `contribution:${seed.profileId}:${seed.questionId}:${seed.sourceId}`
      : "slotId" in seed
        ? `${seed.kind}:${seed.profileId}:${seed.slotId}`
        : `action:${seed.actionId}`;
    return {
      annotationId: `paid-v3-source-selection:${index + 1}:${hashReportSemanticReviewValue({
        kind: seed.kind,
        itemId,
        questionId: seed.questionId,
        sourceId: seed.sourceId,
        profileId: seed.profileId,
        actionId: "actionId" in seed ? seed.actionId : null
      }).slice(0, 16)}`,
      itemId,
      kind: seed.kind,
      questionId: seed.questionId,
      sourceId: seed.sourceId,
      profileId: seed.profileId,
      actionId: "actionId" in seed ? seed.actionId : null,
      allowedEvidenceIds: [...seed.allowedEvidenceIds]
    };
  });
}

/** Pure caller-shaped manifest construction; it never inspects prose meaning. */
function buildReportSemanticReviewManifest(seed: ReportSemanticManifestSeed, lifecycle: "free_v4" | "paid_v3"): ReportSemanticReviewInput {
  const fields: ReportSemanticFieldManifestEntry[] = seed.fields.map((field) => ({
    path: field.path,
    originalText: field.text,
    originalTextHash: reportSemanticTextHash(field.text),
    mutability: field.mutability,
    questionId: field.questionId,
    allowedEvidenceIds: seed.evidencePolicy ? [] : [...field.allowedEvidenceIds],
    allowedSourceIds: seed.evidencePolicy ? [] : [...field.allowedSourceIds]
  }));
  return createReportSemanticReviewInput({
    version: "report-semantic-review-v1",
    lifecycle,
    ...(seed.evidencePolicy ? { evidencePolicy: seed.evidencePolicy } : {}),
    locale: seed.locale,
    target: seed.target,
    expectedModel: seed.expectedModel,
    questions: seed.questions,
    sources: seed.sources,
    evidence: seed.evidence,
    observationResults: seed.observationResults,
    entities: seed.entities ?? [],
    answerSubjects: seed.answerSubjects,
    ...(seed.sourceSelectionCatalog ? { sourceSelectionCatalog: seed.sourceSelectionCatalog } : {}),
    ...(seed.authorityBindings ? { authorityBindings: seed.authorityBindings } : {}),
    fields,
    nonProseProjectionHash: seed.nonProseProjectionHash
  });
}

export function buildFreeV4SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest(seed, "free_v4");
}
export function buildPaidV3SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest({ ...seed, evidencePolicy: "report_global_v1" }, "paid_v3");
}

/**
 * Pure Paid V3 application. It can replace only manifest-declared string
 * leaves after the shared review contract has verified the full ordered
 * coverage and the caller-supplied non-prose projection hash.
 */
export function applyPaidV3SemanticReviewToReport<T>(
  report: T,
  rawInput: unknown,
  rawReview: unknown,
  currentNonProseProjectionHash: string
): AppliedPaidV3SemanticReview<T> {
  const input = parseReportSemanticReviewInput(rawInput);
  if (input.lifecycle !== "paid_v3") {
    throw new TypeError("Paid V3 semantic application requires a paid_v3 review input.");
  }
  const applied = applyReportSemanticReview(input, rawReview, currentNonProseProjectionHash);
  const cloned = cloneJsonValue(report);
  for (const [index, field] of applied.fields.entries()) {
    const manifest = input.fields[index]!;
    const current = readDeclaredPath(cloned, manifest.path);
    if (typeof current !== "string" || reportSemanticTextHash(current) !== manifest.originalTextHash) {
      throw new TypeError(`Paid V3 report field ${manifest.path} no longer matches its reviewed original text.`);
    }
    writeDeclaredPath(cloned, manifest.path, field.appliedText);
  }
  return { report: cloned, ...applied };
}

export function applyCompletePaidV3SemanticReviewToReport<T extends PaidV3ReviewableReport>(
  report: T,
  rawInput: unknown,
  rawReview: unknown,
  currentNonProseProjectionHash: string,
  sourceSelectionContext: PaidV3SourceSelectionValidationContext
): AppliedPaidV3SemanticReview<T & {
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  sourceSelectionDiagnosis: SourceSelectionDiagnosisV1;
}> {
  const input = parseReportSemanticReviewInput(rawInput);
  if (input.lifecycle !== "paid_v3" || !input.sourceSelectionCatalog) {
    throw new TypeError("Complete Paid V3 semantic application requires a catalog-bound paid_v3 review input.");
  }
  const review = parseReportSemanticReviewOutput(rawReview, input);
  if (!review.sourceSelectionDraft || !review.sourceSelectionDraftHash) {
    throw new TypeError("Complete Paid V3 semantic application requires one reviewed source-selection draft.");
  }
  const reboundSourceSelectionDraft = cloneJsonValue(review.sourceSelectionDraft);
  reboundSourceSelectionDraft.inputIdentity = cloneJsonValue(
    sourceSelectionContext.finalSourceSelectionInputIdentity
  );
  const sourceSelectionDiagnosis = parseSourceSelectionDiagnosisV1(reboundSourceSelectionDraft, {
    questions: sourceSelectionContext.questions.map((question) => ({
      ...question,
      sources: [...question.sources]
    })),
    allowPersistedIndependentExcerpts: sourceSelectionContext.allowPersistedIndependentExcerpts,
    semanticValidation: "deferred"
  });
  const applied = applyPaidV3SemanticReviewToReport(
    report,
    input,
    review,
    currentNonProseProjectionHash
  );
  const cloned = cloneJsonValue(applied.report);
  if (!Array.isArray(cloned.answerCards) || cloned.answerCards.length !== 3) {
    throw new TypeError("Complete Paid V3 semantic application requires exactly three answer cards.");
  }
  const answerCards = applyReviewedGeoDiagnosis(
    cloned.answerCards,
    review.annotations.answers,
    sourceSelectionContext.missingEvidenceFamiliesByQuestion
  );
  const completeReport = {
    ...cloned,
    answerCards,
    sourceSelectionDiagnosis: cloneJsonValue(sourceSelectionDiagnosis)
  };
  return {
    ...applied,
    report: completeReport as T & {
      answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
      sourceSelectionDiagnosis: SourceSelectionDiagnosisV1;
    },
    sourceSelectionDiagnosis
  };
}

export function bindPaidV3SemanticReviewReceiptToFinalReport<T extends object>(
  report: T,
  receipt: ReportSemanticReviewReceipt
): {
  readonly report: T & { semanticReviewReceipt: PaidV3ReportSemanticReviewReceipt };
  readonly receipt: PaidV3ReportSemanticReviewReceipt;
} {
  if (receipt.lifecycle !== "paid_v3" || !receipt.sourceSelectionDraftHash) {
    throw new TypeError("Only a complete Paid V3 semantic-review receipt can be bound to a final report.");
  }
  if (Object.prototype.hasOwnProperty.call(report, "semanticReviewReceipt")) {
    throw new TypeError("The final reviewed-report projection must omit its semantic-review receipt.");
  }
  const finalReviewedReportProjectionHash = hashCombinedGeoReportV3ReceiptExcludedProjection(report);
  const finalReceipt = parsePaidV3ReportSemanticReviewReceipt({
    ...receipt,
    finalReviewedReportProjectionHash
  });
  return {
    report: {
      ...cloneJsonValue(report),
      semanticReviewReceipt: finalReceipt
    },
    receipt: finalReceipt
  };
}

export function verifyPaidV3SemanticReviewApplication<T extends PaidV3ReviewableReport>(
  report: T,
  rawInput: unknown,
  rawReview: unknown,
  rawAppliedFields: readonly AppliedReportSemanticField[],
  currentNonProseProjectionHash: string,
  sourceSelectionContext: PaidV3SourceSelectionValidationContext
): AppliedPaidV3SemanticReview<T> & {
  readonly sourceSelectionDiagnosis: SourceSelectionDiagnosisV1;
  readonly receipt: PaidV3ReportSemanticReviewReceipt;
} {
  const input = parseReportSemanticReviewInput(rawInput);
  const review = parseReportSemanticReviewOutput(rawReview, input);
  if (input.lifecycle !== "paid_v3" || !input.sourceSelectionCatalog
      || !review.sourceSelectionDraft || !review.sourceSelectionDraftHash) {
    throw new TypeError("Paid V3 semantic application verification requires complete catalog-bound review authority.");
  }
  if (!report.semanticReviewReceipt) {
    throw new TypeError("The reviewed Paid V3 report is missing its semantic-review receipt.");
  }
  const finalProjectionHash = hashCombinedGeoReportV3ReceiptExcludedProjection(report);
  const receipt = verifyReportSemanticReviewReceipt(
    report.semanticReviewReceipt,
    input,
    review,
    rawAppliedFields,
    currentNonProseProjectionHash,
    finalProjectionHash
  );
  const paidReceipt = parsePaidV3ReportSemanticReviewReceipt(receipt);
  for (const field of rawAppliedFields) {
    const current = readDeclaredPath(report, field.path);
    if (typeof current !== "string" || reportSemanticTextHash(current) !== field.appliedTextHash) {
      throw new TypeError(`Reviewed Paid V3 report field ${field.path} does not match its applied receipt.`);
    }
  }
  const reboundSourceSelectionDraft = cloneJsonValue(review.sourceSelectionDraft);
  reboundSourceSelectionDraft.inputIdentity = cloneJsonValue(
    sourceSelectionContext.finalSourceSelectionInputIdentity
  );
  const sourceSelectionDiagnosis = parseSourceSelectionDiagnosisV1(reboundSourceSelectionDraft, {
    questions: sourceSelectionContext.questions.map((question) => ({
      ...question,
      sources: [...question.sources]
    })),
    allowPersistedIndependentExcerpts: sourceSelectionContext.allowPersistedIndependentExcerpts,
    semanticValidation: "deferred"
  });
  if (!report.sourceSelectionDiagnosis
      || hashReportSemanticReviewValue(report.sourceSelectionDiagnosis)
        !== hashReportSemanticReviewValue(sourceSelectionDiagnosis)) {
    throw new TypeError("The reviewed Paid V3 source-selection diagnosis does not match its rebound final identity.");
  }
  const expectedCards = applyReviewedGeoDiagnosis(
    cloneJsonValue(report.answerCards),
    review.annotations.answers,
    sourceSelectionContext.missingEvidenceFamiliesByQuestion
  );
  if (hashReportSemanticReviewValue(expectedCards.map(({ geoDiagnosis }) => geoDiagnosis))
      !== hashReportSemanticReviewValue(report.answerCards.map((card) => {
        if (!("geoDiagnosis" in card) || !card.geoDiagnosis) {
          throw new TypeError("The reviewed Paid V3 report contains an incomplete answer-card draft.");
        }
        return card.geoDiagnosis;
      }))) {
    throw new TypeError("The reviewed Paid V3 answer diagnosis projection does not match its annotations.");
  }
  return {
    report,
    fields: rawAppliedFields,
    annotations: review.annotations,
    receipt: paidReceipt,
    sourceSelectionDiagnosis
  };
}

function applyReviewedGeoDiagnosis(
  cards: readonly PaidV3SemanticAnswerCardDraft[],
  annotations: readonly import("./report-semantic-review").ReportSemanticAnswerAnnotation[],
  missingEvidenceFamiliesByQuestion: PaidV3SourceSelectionValidationContext["missingEvidenceFamiliesByQuestion"]
): [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3] {
  if (cards.length !== 3) throw new TypeError("Paid V3 answer diagnosis requires exactly three answer cards.");
  const cloned = cloneJsonValue(cards) as PaidV3SemanticAnswerCardDraft[];
  if (!("geoDiagnosis" in cloned[0]!) || !cloned[0]!.geoDiagnosis) {
    throw new TypeError("Paid V3 Q1 must retain its complete read-only Free semantic diagnosis.");
  }
  for (const cardIndex of [1, 2] as const) {
    const card = cloned[cardIndex]!;
    const annotation = annotations.find((item) => item.questionId === card.questionId);
    if (!annotation || annotation.targetPresence === undefined || annotation.targetPresence === "ambiguous"
        || annotation.targetFirstSentence === undefined || annotation.targetRoles === undefined
        || annotation.competitorEntityIds === undefined) {
      throw new TypeError(`Paid V3 answer ${card.questionId} is missing complete reviewed geo annotations.`);
    }
    const geoDiagnosis = {
      targetMentioned: annotation.targetPresence === "present",
      targetFirstSentence: annotation.targetFirstSentence,
      targetRoles: [...annotation.targetRoles],
      competitorEntityIds: [...annotation.competitorEntityIds],
      citedOwnership: reviewedOwnershipCounts(card, annotation.evidenceIds, annotation.sourceIds),
      missingEvidenceFamilies: [...missingEvidenceFamiliesByQuestion[cardIndex]],
      retestQuestion: card.exactQuestion
    };
    cloned[cardIndex] = { ...card, geoDiagnosis };
  }
  return cloned as [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

const PAID_OWNERSHIP_CATEGORIES: readonly OpenGeoAnswerOwnershipCategoryV3[] = [
  "target_owned", "competitor_owned", "third_party_editorial", "directory", "government",
  "other", "institution", "community", "social", "unknown"
];

function reviewedOwnershipCounts(
  card: PaidV3SemanticAnswerCardDraft,
  evidenceIds: readonly string[],
  sourceIds: readonly string[]
): Record<OpenGeoAnswerOwnershipCategoryV3, number> {
  const counts = Object.fromEntries(PAID_OWNERSHIP_CATEGORIES.map((category) => [category, 0])) as
    Record<OpenGeoAnswerOwnershipCategoryV3, number>;
  if (card.answerMode === "generative_search_v1") {
    const allowed = new Set(sourceIds);
    for (const source of card.sources) {
      if (allowed.has(source.sourceId)) counts[source.ownershipCategory] += 1;
    }
  } else {
    const allowed = new Set(evidenceIds);
    for (const evidence of card.sourceEvidence) {
      if (allowed.has(evidence.evidenceId)) counts[evidence.ownershipCategory] += 1;
    }
  }
  return counts;
}

interface PaidV3StringLeaf {
  readonly path: string;
  readonly text: string;
  readonly semanticKey: string;
}

const PAID_V3_CANONICAL_PROSE_PATHS: readonly RegExp[] = [
  /^technicalFoundation\.technicalReport\.findings\[\d+\]\.(?:title|description|recommendation)$/u,
  /^technicalFoundation\.technicalReport\.machineReadableAssets\.[A-Za-z_$][A-Za-z0-9_$]*\.summary$/u,
  /^technicalFoundation\.aiReport\.organizationProfile\.(?:summary|identityConsistency)$/u,
  /^technicalFoundation\.aiReport\.executiveSummary\.overview$/u,
  /^technicalFoundation\.aiReport\.executiveSummary\.(?:strengths|keyRisks|topPriorities)\[\d+\]$/u,
  /^technicalFoundation\.aiReport\.dimensionScores\[\d+\]\.explanation$/u,
  /^technicalFoundation\.aiReport\.pageTypeAnalyses\[\d+\]\.(?:strengths|commonIssues|recommendations)\[\d+\]$/u,
  /^technicalFoundation\.aiReport\.findings\[\d+\]\.(?:title|impact|recommendation|rewriteExample)$/u,
  /^technicalFoundation\.aiReport\.roadmap\.(?:immediate|nextPhase|ongoing)\[\d+\]\.(?:title|rationale)$/u,
  /^technicalFoundation\.aiReport\.roadmap\.(?:immediate|nextPhase|ongoing)\[\d+\]\.actions\[\d+\]$/u,
  /^technicalFoundation\.aiReport\.coverage\.samplingMethod$/u,
  /^technicalFoundation\.aiReport\.coverage\.limitations\[\d+\]$/u,
  /^businessQuestionAnswers\.answers\[\d+\]\.answer$/u,
  /^businessQuestionSet\.questions\[\d+\]\.(?:generatedText|neutralPublicText|privateText)$/u,
  /^publicSourceForensics\.customerComparison\[\d+\]\.(?:title|text)$/u,
  /^publicSourceForensics\.executiveVerdict\.(?:title|text)$/u,
  /^publicSourceForensics\.executivePriorities\[\d+\]\.(?:title|text)$/u,
  /^publicSourceForensics\.limitations\[\d+\]$/u,
  /^vendorTaskPackage\.tasks\[\d+\]\.(?:title|text)$/u,
  /^vendorTaskPackage\.tasks\[\d+\]\.(?:actions|acceptanceCriteria)\[\d+\]$/u,
  /^methodology\.(?:technicalCoverage|evidenceFreshness)$/u,
  /^methodology\.limitations\[\d+\]$/u,
  /^answerCards\[\d+\]\.(?:answerText|exactQuestion)$/u,
  /^answerCards\[\d+\]\.sentences\[\d+\]\.(?:text|limitation)$/u,
  /^answerCards\[\d+\]\.geoDiagnosis\.targetRoles\[\d+\]$/u,
  /^answerCards\[\d+\]\.geoDiagnosis\.retestQuestion$/u,
  /^answerCards\[\d+\]\.diagnosis\.(?:selectionSummary|targetGap)$/u,
  /^answerCards\[\d+\]\.diagnosis\.observableFactors\[\d+\]\.observation$/u,
  /^answerCards\[\d+\]\.diagnosis\.recommendedActions\[\d+\]\.action$/u
];

function isCanonicalPaidV3ProsePath(path: string): boolean {
  return PAID_V3_CANONICAL_PROSE_PATHS.some((pattern) => pattern.test(path));
}

function collectStringLeaves(
  value: unknown,
  path = "",
  semanticKey = ""
): PaidV3StringLeaf[] {
  if (typeof value === "string") {
    if (!path) throw new TypeError("Paid V3 draft root cannot be a string.");
    return [{ path, text: value, semanticKey }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStringLeaves(item, `${path}[${index}]`, semanticKey));
  }
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>).sort().flatMap((key) => {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new TypeError(`Paid V3 draft contains prohibited key ${key}.`);
    }
    const childPath = path ? `${path}.${key}` : key;
    return collectStringLeaves((value as Record<string, unknown>)[key], childPath, key);
  });
}

function uniquePolicyRows(
  rows: readonly PaidV3DraftManifestFieldOverride[],
  label: string
): Map<string, PaidV3DraftManifestFieldOverride> {
  const result = new Map<string, PaidV3DraftManifestFieldOverride>();
  for (const row of rows) {
    if (result.has(row.path)) throw new TypeError(`Paid V3 ${label} path ${row.path} is duplicated.`);
    result.set(row.path, row);
  }
  return result;
}

function uniquePolicyPaths(paths: readonly string[], label: string): Set<string> {
  assertUniquePolicyPaths(paths, label);
  return new Set(paths);
}

function assertUniquePolicyPaths(paths: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const path of paths) {
    declaredPathSegments(path);
    if (seen.has(path)) throw new TypeError(`Paid V3 ${label} ${path} is duplicated.`);
    seen.add(path);
  }
}

function inferPaidV3AnswerOwnership(
  root: Record<string, unknown>,
  path: string
): {
  questionId: string | null;
  allowedEvidenceIds: readonly string[];
  allowedSourceIds: readonly string[];
} {
  const match = /^answerCards\[(\d+)\](?:\.|$)/u.exec(path);
  if (!match) return { questionId: null, allowedEvidenceIds: [], allowedSourceIds: [] };
  const cards = Array.isArray(root.answerCards) ? root.answerCards : [];
  const card = cards[Number(match[1])] as Record<string, unknown> | undefined;
  if (!card || typeof card !== "object") {
    throw new TypeError(`Paid V3 manifest path ${path} references a missing answer card.`);
  }
  const questionId = typeof card.questionId === "string" && card.questionId.trim()
    ? card.questionId
    : null;
  const allowedEvidenceIds = Array.isArray(card.sourceEvidence)
    ? card.sourceEvidence.flatMap((value) => {
        const row = value as Record<string, unknown>;
        return typeof row.evidenceId === "string" ? [row.evidenceId] : [];
      })
    : [];
  const allowedSourceIds = Array.isArray(card.sources)
    ? card.sources.flatMap((value) => {
        const row = value as Record<string, unknown>;
        return typeof row.sourceId === "string" ? [row.sourceId] : [];
      })
    : [];
  return {
    questionId,
    allowedEvidenceIds: [...new Set(allowedEvidenceIds)],
    allowedSourceIds: [...new Set(allowedSourceIds)]
  };
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function declaredPathSegments(path: string): Array<string | number> {
  if (!path || path.length > 1_000) throw new TypeError("A declared semantic field path is invalid.");
  const segments: Array<string | number> = [];
  const matcher = /(?:^|\.)([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]/gu;
  let offset = 0;
  for (const match of path.matchAll(matcher)) {
    if (match.index !== offset) throw new TypeError(`Declared semantic field path ${path} is invalid.`);
    const key = match[1];
    if (key !== undefined) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new TypeError(`Declared semantic field path ${path} contains a prohibited segment.`);
      }
      segments.push(key);
    } else {
      segments.push(Number(match[2]));
    }
    offset = match.index + match[0].length;
  }
  if (offset !== path.length || segments.length === 0) {
    throw new TypeError(`Declared semantic field path ${path} is invalid.`);
  }
  return segments;
}

function readDeclaredPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of declaredPathSegments(path)) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new TypeError(`Paid V3 report is missing declared semantic field ${path}.`);
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function writeDeclaredPath(value: unknown, path: string, text: string): void {
  const segments = declaredPathSegments(path);
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    current = (current as Record<string | number, unknown>)[segment];
  }
  (current as Record<string | number, unknown>)[segments.at(-1)!] = text;
}
