import { createAnswerEngineSurfaceKey } from "./registry";
import type {
  AnswerQuestion,
  AnswerSnapshotCell,
  CertificationAuthoritySnapshot,
  CertifiedAnswerEngineSurface,
  CommercialCoverageDecision
} from "./types";

export function classifyCommercialCoverage(
  questions: readonly AnswerQuestion[],
  cells: readonly AnswerSnapshotCell[],
  authority: CertificationAuthoritySnapshot
): CommercialCoverageDecision {
  const marketQuestionIds = new Set(questions.map(({ id }) => id));
  const capturedAt = Date.parse(authority?.capturedAt ?? "");
  const certifications = Array.isArray(authority?.certifications) ? authority.certifications : [];
  const certifiedSurfaceKeys = new Set(
    certifications.filter((certification) => isValidCertification(certification, capturedAt))
      .map(({ surface }) => createAnswerEngineSurfaceKey(surface))
  );
  const certified = cells.filter((cell) =>
    certifiedSurfaceKeys.has(createAnswerEngineSurfaceKey(cell.surface)) && marketQuestionIds.has(cell.questionId)
  );
  const surfaces = groupBySurface(certified);
  const qualifyingProviderIds = new Set<string>();
  for (const surfaceCells of surfaces.values()) {
    const usable = surfaceCells.filter(isUsableCommercialCell);
    if (new Set(usable.map(({ questionId }) => questionId)).size >= 3 && usable.some(hasProviderSource)) {
      qualifyingProviderIds.add(surfaceCells[0]!.surface.providerId);
    }
  }
  const certifiedProviderCount = new Set(certified.map(({ surface }) => surface.providerId)).size;
  const qualifyingProviderCount = qualifyingProviderIds.size;
  const successfulQuestionCount = new Set(certified.filter(isUsableCommercialCell).map(({ questionId }) => questionId)).size;
  if (qualifyingProviderCount >= 2) {
    return {
      outcome: "qualified", certifiedProviderCount, qualifyingProviderCount,
      successfulQuestionCount, reasons: []
    };
  }
  if (qualifyingProviderCount === 1) {
    return {
      outcome: "completed_limited", certifiedProviderCount, qualifyingProviderCount,
      successfulQuestionCount, reasons: ["Fewer than two independently certified providers completed three market questions."]
    };
  }
  return {
    outcome: "failed", certifiedProviderCount, qualifyingProviderCount: 0,
    successfulQuestionCount, reasons: [certifiedProviderCount === 0
      ? "No externally certified answer-engine provider produced commercial evidence."
      : "No certified provider completed a usable three-question evidence set."]
  };
}

function isUsableCommercialCell(cell: AnswerSnapshotCell): boolean {
  return cell.status === "succeeded" &&
    (cell.recommendationOutcome === "no_recommendation" || cell.sources.length > 0);
}

function hasProviderSource(cell: AnswerSnapshotCell): boolean {
  return cell.status === "succeeded" && cell.sources.length > 0;
}

function isValidCertification(
  { surface, evidence }: CertifiedAnswerEngineSurface,
  capturedAt: number
): boolean {
  const certifiedAt = Date.parse(evidence.certifiedAt);
  return surface.certificationState === "certified" && evidence.environment === "protected_staging" &&
    Number.isFinite(capturedAt) && Number.isFinite(certifiedAt) && certifiedAt <= capturedAt &&
    evidence.evidenceReference.trim().length > 0;
}

function groupBySurface(cells: readonly AnswerSnapshotCell[]): Map<string, AnswerSnapshotCell[]> {
  const result = new Map<string, AnswerSnapshotCell[]>();
  for (const cell of cells) {
    const key = createAnswerEngineSurfaceKey(cell.surface);
    result.set(key, [...(result.get(key) ?? []), cell]);
  }
  return result;
}
