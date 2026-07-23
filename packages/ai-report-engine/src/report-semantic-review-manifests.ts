import {
  createReportSemanticReviewInput,
  reportSemanticTextHash,
  type ReportSemanticEvidence,
  type ReportSemanticEntity,
  type ReportSemanticExpectedModel,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticObservationResult,
  type ReportSemanticQuestion,
  type ReportSemanticReviewInput,
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
  readonly locale: string;
  readonly target: ReportSemanticTargetIdentity;
  readonly expectedModel: ReportSemanticExpectedModel;
  readonly questions: readonly ReportSemanticQuestion[];
  readonly sources: readonly ReportSemanticSource[];
  readonly evidence: readonly ReportSemanticEvidence[];
  readonly observationResults: readonly ReportSemanticObservationResult[];
  readonly entities?: readonly ReportSemanticEntity[];
  readonly answerSubjects: readonly import("./report-semantic-review").ReportSemanticAnswerSubject[];
  readonly fields: readonly ReportSemanticManifestFieldSeed[];
  readonly nonProseProjectionHash: string;
}

/** Pure caller-shaped manifest construction; it never inspects prose meaning. */
function buildReportSemanticReviewManifest(seed: ReportSemanticManifestSeed, lifecycle: "free_v4" | "paid_v3"): ReportSemanticReviewInput {
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
    lifecycle,
    locale: seed.locale,
    target: seed.target,
    expectedModel: seed.expectedModel,
    questions: seed.questions,
    sources: seed.sources,
    evidence: seed.evidence,
    observationResults: seed.observationResults,
    entities: seed.entities ?? [],
    answerSubjects: seed.answerSubjects,
    fields,
    nonProseProjectionHash: seed.nonProseProjectionHash
  });
}

export function buildFreeV4SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest(seed, "free_v4");
}
export function buildPaidV3SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest(seed, "paid_v3");
}
