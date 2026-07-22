import {
  createReportSemanticReviewInput,
  reportSemanticTextHash,
  type ReportSemanticEvidence,
  type ReportSemanticExpectedModel,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticObservationResult,
  type ReportSemanticQuestion,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewLifecycle,
  type ReportSemanticSource,
  type ReportSemanticTargetIdentity
} from "./report-semantic-review";

export interface ReportSemanticManifestFieldSeed {
  readonly path: string;
  readonly text: string;
  readonly mutability: "mutable" | "read_only";
  readonly questionId: string | null;
  readonly allowedEvidenceIds: readonly string[];
  readonly allowedSourceIds: readonly string[];
}

export interface ReportSemanticManifestSeed {
  readonly lifecycle: ReportSemanticReviewLifecycle;
  readonly locale: string;
  readonly target: ReportSemanticTargetIdentity;
  readonly expectedModel: ReportSemanticExpectedModel;
  readonly questions: readonly ReportSemanticQuestion[];
  readonly sources: readonly ReportSemanticSource[];
  readonly evidence: readonly ReportSemanticEvidence[];
  readonly observationResults: readonly ReportSemanticObservationResult[];
  readonly fields: readonly ReportSemanticManifestFieldSeed[];
  readonly nonProseProjectionHash: string;
}

/** Pure caller-shaped manifest construction; it never inspects prose meaning. */
export function buildReportSemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  const fields: ReportSemanticFieldManifestEntry[] = seed.fields.map((field) => ({
    path: field.path,
    originalText: field.text,
    originalTextHash: reportSemanticTextHash(field.text),
    mutability: field.mutability,
    questionId: field.questionId,
    allowedEvidenceIds: [...field.allowedEvidenceIds],
    allowedSourceIds: [...field.allowedSourceIds]
  }));
  return createReportSemanticReviewInput({
    version: "report-semantic-review-v1",
    lifecycle: seed.lifecycle,
    locale: seed.locale,
    target: seed.target,
    expectedModel: seed.expectedModel,
    questions: seed.questions,
    sources: seed.sources,
    evidence: seed.evidence,
    observationResults: seed.observationResults,
    fields,
    nonProseProjectionHash: seed.nonProseProjectionHash
  });
}

export const buildFreeV4SemanticReviewManifest = buildReportSemanticReviewManifest;
export const buildPaidV3SemanticReviewManifest = buildReportSemanticReviewManifest;
