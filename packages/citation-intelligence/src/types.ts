import type { AnswerSnapshotCell, AnswerSnapshotSource } from "@open-geo-console/answer-engine-observer";

export type RecommendationKind = "direct_candidate" | "preferred_choice" | "example" | "suitability";

export interface EntityCandidate {
  entityId: string;
  name: string;
  registrableDomain?: string;
  contextTerms?: string[];
}

export interface RecommendationSignal {
  entityId: string;
  entityName: string;
  kind: RecommendationKind;
  supportingText: string;
}

export type EntityResolution =
  | { status: "resolved"; entityId: string; basis: "registrable_domain" | "context" | "unique_name" }
  | { status: "ambiguous"; candidateEntityIds: string[] }
  | { status: "unresolved"; candidateEntityIds: [] };

export interface EntityResolutionInput {
  name: string;
  sourceUrl?: string;
  contextText?: string;
  candidates: EntityCandidate[];
}

export type CitationSourceCategory =
  | "owned_customer"
  | "owned_competitor"
  | "earned_editorial"
  | "directory_or_reference"
  | "community_or_ugc"
  | "institution"
  | "social"
  | "unknown";

export interface SourceCategoryContext {
  customerRegistrableDomain: string;
  competitorRegistrableDomains: string[];
  knownDomains?: Record<string, Exclude<CitationSourceCategory, "owned_customer" | "owned_competitor">>;
}

export type CitationRetrievalState = "available" | "inaccessible" | "expired" | "not_retrieved";
export type EvidenceGrade = "A" | "B" | "C" | "D";

export interface EvidenceAssessment {
  evidenceId: string;
  cellId: string;
  sourceUrl?: string;
  providerReturned: boolean;
  retrievalState: CitationRetrievalState;
  verifiedExcerpt?: string;
  directSupport: boolean;
  preciseMapping: boolean;
  relevantEntityEvidence: boolean;
  entityAmbiguous: boolean;
  repeatedPattern?: RepeatedEvidencePattern;
}

export type RepeatedEvidencePatternKind = "entity" | "source" | "source_category" | "evidence_type";

export interface RepeatedEvidencePatternOccurrence {
  cellId: string;
  recommendationOutcome: "recommendations_present" | "no_recommendation";
  supportingText: string;
}

export interface RepeatedEvidencePattern {
  kind: RepeatedEvidencePatternKind;
  value: string;
  occurrences: RepeatedEvidencePatternOccurrence[];
}

export interface GradedCitationEvidence extends EvidenceAssessment {
  grade: EvidenceGrade;
}

export interface OpportunityHypothesis {
  id: string;
  title: string;
  rationale: string;
  evidenceCellIds: string[];
  sourcePattern: string;
  suggestedAction: string;
}

export interface CitationObservationInput {
  cell: Extract<AnswerSnapshotCell, { status: "succeeded" }>;
  source: AnswerSnapshotSource;
}
