import { createAnswerEngineSurfaceKey } from "./registry";
import type {
  AnswerQuestion,
  AnswerSnapshotCell,
  CertifiedAnswerEngineSurface,
  CommercialCoverageDecision
} from "./types";

export function classifyCommercialCoverage(
  questions: readonly AnswerQuestion[],
  cells: readonly AnswerSnapshotCell[],
  certifications: readonly CertifiedAnswerEngineSurface[]
): CommercialCoverageDecision {
  const marketQuestionIds = new Set(questions.map(({ id }) => id));
  const certifiedSurfaceKeys = new Set(
    certifications.filter(isValidCertification).map(({ surface }) => createAnswerEngineSurfaceKey(surface))
  );
  const certified = cells.filter((cell) =>
    certifiedSurfaceKeys.has(createAnswerEngineSurfaceKey(cell.surface)) && marketQuestionIds.has(cell.questionId)
  );
  const surfaces = groupBySurface(certified);
  const qualifying = [...surfaces.values()].filter((surfaceCells) => {
    const usable = surfaceCells.filter((cell) => cell.status === "succeeded" &&
      (cell.recommendationOutcome === "no_recommendation" || cell.sources.length > 0));
    return new Set(usable.map(({ questionId }) => questionId)).size >= 3 &&
      usable.some((cell) => cell.status === "succeeded" && cell.sources.length > 0);
  });
  const successfulQuestionCount = new Set(certified
    .filter((cell) => cell.status === "succeeded" &&
      (cell.recommendationOutcome === "no_recommendation" || cell.sources.length > 0))
    .map(({ questionId }) => questionId)).size;
  if (qualifying.length >= 2) {
    return {
      outcome: "qualified", certifiedSurfaceCount: surfaces.size, qualifyingSurfaceCount: qualifying.length,
      successfulQuestionCount, reasons: []
    };
  }
  if (qualifying.length === 1) {
    return {
      outcome: "completed_limited", certifiedSurfaceCount: surfaces.size, qualifyingSurfaceCount: 1,
      successfulQuestionCount, reasons: ["Fewer than two certified source-bearing surfaces completed three market questions."]
    };
  }
  return {
    outcome: "failed", certifiedSurfaceCount: surfaces.size, qualifyingSurfaceCount: 0,
    successfulQuestionCount, reasons: [surfaces.size === 0
      ? "No certified answer-engine surface produced commercial evidence."
      : "No certified surface completed a usable three-question evidence set."]
  };
}

function isValidCertification({ surface, evidence }: CertifiedAnswerEngineSurface): boolean {
  return surface.certificationState === "certified" &&
    evidence.environment === "protected_staging" &&
    Number.isFinite(Date.parse(evidence.certifiedAt)) &&
    evidence.evidenceReference.trim().length > 0;
}

function groupBySurface(cells: readonly AnswerSnapshotCell[]): Map<string, AnswerSnapshotCell[]> {
  const result = new Map<string, AnswerSnapshotCell[]>();
  for (const cell of cells) {
    const key = [cell.surface.providerId, cell.surface.productId, cell.surface.modelId,
      cell.surface.collectionSurface, cell.surface.locale, cell.surface.region].join("/");
    result.set(key, [...(result.get(key) ?? []), cell]);
  }
  return result;
}
