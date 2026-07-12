import {
  classifyCommercialCoverage,
  createAnswerEngineSurfaceKey,
  parseAnswerEngineSurface,
  parseAnswerQuestion,
  parseAnswerSnapshotCell,
  parseAnswerSnapshotRun,
  type AnswerSnapshotCell,
  type AnswerSnapshotRunContract,
  type CertifiedAnswerEngineSurface,
  type CommercialCoverageDecision,
  type GeneratedQuestionSet
} from "@open-geo-console/answer-engine-observer";
import {
  assessEvidenceGrade,
  validateEvidenceAssessment,
  validateOpportunityHypothesis,
  validateRecommendationSignal,
  type EntityResolution,
  type GradedCitationEvidence,
  type OpportunityHypothesis,
  type RecommendationSignal
} from "@open-geo-console/citation-intelligence";
import type { AiWebsiteReportV1 } from "./types";
import { parseAiWebsiteReportV1 } from "./validation";

export const RECOMMENDATION_FORENSIC_REPORT_VERSION = 1 as const;

export interface RecommendationForensicReportV1 {
  version: typeof RECOMMENDATION_FORENSIC_REPORT_VERSION;
  reportId: string;
  jobId: string;
  targetUrl: string;
  locale: string;
  generatedAt: string;
  questionSet: GeneratedQuestionSet;
  snapshotRun: AnswerSnapshotRunContract;
  snapshotCells: AnswerSnapshotCell[];
  certifiedSurfaces: CertifiedAnswerEngineSurface[];
  commercialCoverage: CommercialCoverageDecision;
  recommendationSignals: RecommendationSignal[];
  entityResolutions: EntityResolution[];
  citationEvidence: GradedCitationEvidence[];
  citationOpportunities: OpportunityHypothesis[];
  websiteFoundationAppendix: AiWebsiteReportV1;
  limitations: string[];
}

export class RecommendationForensicReportValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RecommendationForensicReportValidationError";
  }
}

export function parseRecommendationForensicReportV1(value: unknown): RecommendationForensicReportV1 {
  const report = record(value, "$" );
  if (report.version !== RECOMMENDATION_FORENSIC_REPORT_VERSION) fail("$.version", "Expected recommendation-forensic version 1.");
  const reportId = text(report.reportId, "$.reportId");
  const jobId = text(report.jobId, "$.jobId");
  const targetUrl = httpUrl(report.targetUrl, "$.targetUrl");
  const locale = text(report.locale, "$.locale");
  const generatedAt = timestamp(report.generatedAt, "$.generatedAt");
  const questionSet = parseQuestionSet(report.questionSet);
  const snapshotRun = parseAnswerSnapshotRun(report.snapshotRun);
  if (snapshotRun.reportId !== reportId || snapshotRun.jobId !== jobId || snapshotRun.locale !== locale ||
      snapshotRun.questionSetVersion !== questionSet.version) {
    fail("$.snapshotRun", "Run identity must match the report, job, locale, and question-set version.");
  }
  const questionIds = new Set(questionSet.questions.map(({ id }) => id));
  const snapshotCells = array(report.snapshotCells, "$.snapshotCells").map((cell, index) => {
    const parsed = parseAnswerSnapshotCell(cell);
    if (parsed.runId !== snapshotRun.id || !questionIds.has(parsed.questionId)) {
      fail(`$.snapshotCells[${index}]`, "Cell must belong to this run and question set.");
    }
    return parsed;
  });
  if (new Set(snapshotCells.map(({ id }) => id)).size !== snapshotCells.length) {
    fail("$.snapshotCells", "Cell identities must be unique.");
  }
  const certifiedSurfaces = array(report.certifiedSurfaces, "$.certifiedSurfaces").map(parseCertification);
  if (new Set(certifiedSurfaces.map(({ surface }) => createAnswerEngineSurfaceKey(surface))).size !== certifiedSurfaces.length) {
    fail("$.certifiedSurfaces", "Certified surface identities must be unique.");
  }
  const commercialCoverage = parseCommercialCoverage(report.commercialCoverage);
  const expectedCoverage = classifyCommercialCoverage(questionSet.questions, snapshotCells, certifiedSurfaces);
  if (!sameCommercialCoverage(commercialCoverage, expectedCoverage)) {
    fail("$.commercialCoverage", "Decision does not match certified source-bearing snapshot coverage.");
  }
  const recommendationSignals = array(report.recommendationSignals, "$.recommendationSignals")
    .map((signal, index) => guarded(`$.recommendationSignals[${index}]`, () => validateRecommendationSignal(signal as RecommendationSignal)));
  const entityResolutions = array(report.entityResolutions, "$.entityResolutions")
    .map((resolution, index) => parseEntityResolution(resolution, `$.entityResolutions[${index}]`));
  const citationEvidence = array(report.citationEvidence, "$.citationEvidence").map((evidence, index) => {
    const graded = evidence as GradedCitationEvidence;
    guarded(`$.citationEvidence[${index}]`, () => validateEvidenceAssessment(graded));
    if (graded.grade !== assessEvidenceGrade(graded)) fail(`$.citationEvidence[${index}].grade`, "Grade does not match evidence.");
    return graded;
  });
  const snapshotCellIds = new Set(snapshotCells.map(({ id }) => id));
  if (citationEvidence.some(({ cellId }) => !snapshotCellIds.has(cellId))) {
    fail("$.citationEvidence", "Evidence must reference a snapshot cell in this report.");
  }
  if (new Set(citationEvidence.map(({ evidenceId }) => evidenceId)).size !== citationEvidence.length) {
    fail("$.citationEvidence", "Evidence identities must be unique.");
  }
  const citationOpportunities = array(report.citationOpportunities, "$.citationOpportunities")
    .map((opportunity, index) => guarded(`$.citationOpportunities[${index}]`, () => validateOpportunityHypothesis(opportunity as OpportunityHypothesis)));
  if (citationOpportunities.some(({ evidenceCellIds }) => evidenceCellIds.some((id) => !snapshotCellIds.has(id)))) {
    fail("$.citationOpportunities", "Opportunities must reference snapshot cells in this report.");
  }
  const websiteFoundationAppendix = guarded("$.websiteFoundationAppendix", () =>
    parseAiWebsiteReportV1(report.websiteFoundationAppendix)
  );
  if (websiteFoundationAppendix.tier !== "deep" || websiteFoundationAppendix.targetUrl !== targetUrl ||
      websiteFoundationAppendix.provenance.locale !== locale) {
    fail("$.websiteFoundationAppendix", "Appendix must be the matching deep website-foundation report.");
  }
  const limitations = array(report.limitations, "$.limitations").map((item, index) => text(item, `$.limitations[${index}]`));

  return {
    version: RECOMMENDATION_FORENSIC_REPORT_VERSION,
    reportId, jobId, targetUrl, locale, generatedAt, questionSet, snapshotRun, snapshotCells,
    certifiedSurfaces, commercialCoverage: expectedCoverage, recommendationSignals, entityResolutions,
    citationEvidence, citationOpportunities, websiteFoundationAppendix, limitations
  };
}

function parseCommercialCoverage(value: unknown): CommercialCoverageDecision {
  const input = record(value, "$.commercialCoverage");
  if (!new Set(["qualified", "completed_limited", "failed"]).has(input.outcome as string)) {
    fail("$.commercialCoverage.outcome", "Unsupported commercial outcome.");
  }
  const count = (field: "certifiedSurfaceCount" | "qualifyingSurfaceCount" | "successfulQuestionCount"): number => {
    const value = input[field];
    if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`$.commercialCoverage.${field}`, "Expected a non-negative integer.");
    return value as number;
  };
  return {
    outcome: input.outcome as CommercialCoverageDecision["outcome"],
    certifiedSurfaceCount: count("certifiedSurfaceCount"),
    qualifyingSurfaceCount: count("qualifyingSurfaceCount"),
    successfulQuestionCount: count("successfulQuestionCount"),
    reasons: array(input.reasons, "$.commercialCoverage.reasons")
      .map((reason, index) => text(reason, `$.commercialCoverage.reasons[${index}]`))
  };
}

function sameCommercialCoverage(left: CommercialCoverageDecision, right: CommercialCoverageDecision): boolean {
  return left.outcome === right.outcome &&
    left.certifiedSurfaceCount === right.certifiedSurfaceCount &&
    left.qualifyingSurfaceCount === right.qualifyingSurfaceCount &&
    left.successfulQuestionCount === right.successfulQuestionCount &&
    left.reasons.length === right.reasons.length &&
    left.reasons.every((reason, index) => reason === right.reasons[index]);
}

function parseQuestionSet(value: unknown): GeneratedQuestionSet {
  const input = record(value, "$.questionSet");
  if (input.version !== "purchase-v1") fail("$.questionSet.version", "Expected purchase-v1.");
  if (input.confidence !== "high" && input.confidence !== "low") fail("$.questionSet.confidence", "Expected high or low.");
  if (input.confidence === "low" && input.fallbackReason !== "insufficient_category_evidence") {
    fail("$.questionSet.fallbackReason", "Low-confidence generation requires an explicit fallback reason.");
  }
  if (input.confidence === "high" && input.fallbackReason !== undefined) {
    fail("$.questionSet.fallbackReason", "High-confidence generation cannot declare a fallback.");
  }
  const questions = array(input.questions, "$.questionSet.questions").map(parseAnswerQuestion);
  if (questions.length < 3 || questions.length > 5 || new Set(questions.map(({ id }) => id)).size !== questions.length) {
    fail("$.questionSet.questions", "Expected three to five questions with unique identities.");
  }
  const limitations = array(input.limitations, "$.questionSet.limitations")
    .map((item, index) => text(item, `$.questionSet.limitations[${index}]`));
  return {
    version: "purchase-v1", confidence: input.confidence,
    ...(input.fallbackReason === undefined ? {} : { fallbackReason: input.fallbackReason }),
    limitations, questions
  } as GeneratedQuestionSet;
}

function parseCertification(value: unknown, index: number): CertifiedAnswerEngineSurface {
  const input = record(value, `$.certifiedSurfaces[${index}]`);
  const surface = parseAnswerEngineSurface(input.surface);
  const evidence = record(input.evidence, `$.certifiedSurfaces[${index}].evidence`);
  if (surface.certificationState !== "certified" || evidence.environment !== "protected_staging") {
    fail(`$.certifiedSurfaces[${index}]`, "Certification requires a certified surface and protected-staging evidence.");
  }
  return {
    surface,
    evidence: {
      environment: "protected_staging",
      certifiedAt: timestamp(evidence.certifiedAt, `$.certifiedSurfaces[${index}].evidence.certifiedAt`),
      evidenceReference: text(evidence.evidenceReference, `$.certifiedSurfaces[${index}].evidence.evidenceReference`)
    }
  };
}

function parseEntityResolution(value: unknown, path: string): EntityResolution {
  const input = record(value, path);
  if (input.status === "resolved") {
    if (!new Set(["registrable_domain", "context", "unique_name"]).has(input.basis as string)) fail(`${path}.basis`, "Unsupported basis.");
    return { status: "resolved", entityId: text(input.entityId, `${path}.entityId`), basis: input.basis as "registrable_domain" | "context" | "unique_name" };
  }
  if (input.status === "ambiguous") {
    const candidateEntityIds = array(input.candidateEntityIds, `${path}.candidateEntityIds`)
      .map((id, index) => text(id, `${path}.candidateEntityIds[${index}]`));
    if (candidateEntityIds.length < 2 || new Set(candidateEntityIds).size !== candidateEntityIds.length) {
      fail(`${path}.candidateEntityIds`, "Ambiguity requires at least two unique candidates.");
    }
    return { status: "ambiguous", candidateEntityIds };
  }
  if (input.status === "unresolved" && Array.isArray(input.candidateEntityIds) && input.candidateEntityIds.length === 0) {
    return { status: "unresolved", candidateEntityIds: [] };
  }
  return fail(path, "Unsupported entity resolution.");
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "Expected an object.");
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "Expected an array.");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(path, "Expected a non-empty string.");
  return value;
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path);
  if (!Number.isFinite(Date.parse(result))) return fail(path, "Expected a timestamp.");
  return result;
}

function httpUrl(value: unknown, path: string): string {
  const result = text(value, path);
  try {
    const url = new URL(result);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new Error();
  } catch {
    return fail(path, "Expected an absolute HTTP(S) URL.");
  }
  return result;
}

function guarded<T>(path: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RecommendationForensicReportValidationError) throw error;
    return fail(path, error instanceof Error ? error.message : "Validation failed.");
  }
}

function fail(path: string, message: string): never {
  throw new RecommendationForensicReportValidationError(path, message);
}
