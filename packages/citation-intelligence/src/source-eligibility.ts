import type { ExplainableSignal, SourceEligibilitySignals } from "./types";

export interface SourceEligibilityInput {
  retrievalReady: boolean;
  entityResolved: boolean;
  claimTraceable: boolean;
  contradictionAbsent: boolean;
  metadataOnly: boolean;
}

const DEFINITIONS = [
  ["retrieval_ready", 30, "The source passed the versioned retrieval-readiness policy."],
  ["entity_resolved", 20, "The referenced entity is unambiguous within the stored evidence."],
  ["claim_traceable", 25, "Any formal fact retains observation and retrieved-evidence provenance."],
  ["contradiction_absent", 15, "No unresolved contradictory claim was detected."],
  ["content_not_metadata_only", 10, "Eligibility is based on retrieved content rather than result metadata alone."]
] as const;

export function scoreSourceEligibility(input: SourceEligibilityInput): SourceEligibilitySignals {
  const values: Record<(typeof DEFINITIONS)[number][0], boolean> = {
    retrieval_ready: input.retrievalReady,
    entity_resolved: input.entityResolved,
    claim_traceable: input.claimTraceable,
    contradiction_absent: input.contradictionAbsent,
    content_not_metadata_only: !input.metadataOnly
  };
  const signals: ExplainableSignal[] = DEFINITIONS.map(([id, weight, explanation]) => ({
    id,
    weight,
    explanation,
    passed: values[id]
  }));
  return {
    version: "source-eligibility-v1",
    signals,
    eligible: signals.every(({ passed }) => passed),
    score: signals.reduce((sum, signal) => sum + (signal.passed ? signal.weight : 0), 0)
  };
}
