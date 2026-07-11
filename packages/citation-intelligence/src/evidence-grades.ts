import type { EvidenceAssessment, EvidenceGrade, GradedCitationEvidence } from "./types";
import { validateEvidenceAssessment } from "./validation";

export function assessEvidenceGrade(evidence: EvidenceAssessment): EvidenceGrade {
  if (
    evidence.entityAmbiguous ||
    evidence.retrievalState !== "available" ||
    (evidence.preciseMapping && !evidence.directSupport) ||
    (evidence.directSupport &&
      (!evidence.providerReturned ||
        !hasBoundedExcerpt(evidence.verifiedExcerpt) ||
        !evidence.preciseMapping ||
        !evidence.relevantEntityEvidence))
  ) {
    return "D";
  }

  if (
    evidence.providerReturned &&
    hasAbsoluteHttpUrl(evidence.sourceUrl) &&
    hasBoundedExcerpt(evidence.verifiedExcerpt) &&
    evidence.directSupport &&
    evidence.preciseMapping &&
    evidence.relevantEntityEvidence
  ) {
    return "A";
  }

  if (
    evidence.providerReturned &&
    hasAbsoluteHttpUrl(evidence.sourceUrl) &&
    hasBoundedExcerpt(evidence.verifiedExcerpt) &&
    evidence.relevantEntityEvidence &&
    !evidence.preciseMapping
  ) {
    return "B";
  }

  if (hasRepeatedPattern(evidence)) return "C";
  return "D";
}

function hasAbsoluteHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function hasRepeatedPattern(evidence: EvidenceAssessment): boolean {
  const pattern = evidence.repeatedPattern;
  if (!pattern || !pattern.value.trim() || pattern.occurrences.length < 2) return false;
  if (!new Set(["entity", "source", "source_category", "evidence_type"]).has(pattern.kind)) return false;
  const cellIds = new Set(pattern.occurrences.map(({ cellId }) => cellId.trim()));
  return (
    cellIds.size === pattern.occurrences.length &&
    pattern.occurrences.every(
      (occurrence) =>
        occurrence.recommendationOutcome === "recommendations_present" &&
        occurrence.supportingText.toLocaleLowerCase().includes(pattern.value.trim().toLocaleLowerCase())
    )
  );
}

export function gradeCitationEvidence(evidence: EvidenceAssessment): GradedCitationEvidence {
  const validated = validateEvidenceAssessment(evidence);
  return { ...validated, grade: assessEvidenceGrade(validated) };
}

function hasBoundedExcerpt(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1_000;
}
