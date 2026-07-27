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

// V2 public-source forensics contracts are intentionally separate from the
// V1 answer-snapshot contracts above. A search observation is not an answer.
export type PublicSourceRetrievalState =
  | "available"
  | "inaccessible"
  | "robots_denied"
  | "unsafe_destination"
  | "login_required"
  | "paywalled"
  | "captcha"
  | "failed";

export type PublicSourceOwnershipCategory =
  | "owned_customer"
  | "owned_competitor"
  | "independent_editorial"
  | "directory_or_reference"
  | "community_or_ugc"
  | "institution"
  | "public_body"
  | "unknown";

export interface PublicSourceObservationRef {
  observationId: string;
  queryVariantId: string;
  exactQuery: string;
  surfaceResultOrder: number;
  observedUrl: string;
}

export interface PublicSourceEntityMention {
  name: string;
  entityId?: string;
  registrableDomain?: string;
  contextTerms?: readonly string[];
}

export interface PublicSourceClaimCandidate {
  subjectName: string;
  predicate: string;
  value: string;
  directFactSupport: boolean;
  preciseEntityMapping: boolean;
  contradictionGroupId?: string;
}

export interface RetrievedPublicSourceFact {
  observationId: string;
  queryId: string;
  resultUrl: string;
  finalUrl?: string;
  retrievalState: PublicSourceRetrievalState;
  publiclyRoutable: boolean;
  robotsAllowed: boolean;
  accessBarrier: "none" | "login" | "paywall" | "captcha" | "unknown";
  contentBytes?: number;
  normalizedText?: string;
  normalizedContentHash?: string;
  verifiedExcerpt?: string;
  entityMentions?: readonly PublicSourceEntityMention[];
  claims?: readonly PublicSourceClaimCandidate[];
}

export interface ExplainableSignal {
  id: string;
  passed: boolean;
  weight: number;
  explanation: string;
}

export interface RetrievalReadinessSignals {
  version: "retrieval-readiness-v1";
  signals: readonly ExplainableSignal[];
  ready: boolean;
  score?: number;
}

export interface SourceEligibilitySignals {
  version: "source-eligibility-v1";
  signals: readonly ExplainableSignal[];
  eligible: boolean;
  score?: number;
}

export type PublicSourceEvidenceGrade = "A" | "B" | "C" | "D";

export interface PublicSourceEvidence {
  evidenceId: string;
  canonicalUrl: string;
  registrableDomain: string;
  ownershipCategory: PublicSourceOwnershipCategory;
  retrievalState: PublicSourceRetrievalState;
  normalizedContentHash?: string;
  verifiedExcerpt?: string;
  directFactSupport: boolean;
  preciseEntityMapping: boolean;
  entityAmbiguous: boolean;
  contradictory: boolean;
  metadataOnly: boolean;
  observationRefs: readonly PublicSourceObservationRef[];
  queryVariantIds: readonly string[];
  entityIds: readonly string[];
  claimIds: readonly string[];
  evidenceFamilyId: string;
  retrievalReadiness: RetrievalReadinessSignals;
  sourceEligibility: SourceEligibilitySignals;
  grade: PublicSourceEvidenceGrade;
}

export interface EvidenceFamily {
  evidenceFamilyId: string;
  normalizedContentHash: string;
  evidenceIds: readonly string[];
  registrableDomains: readonly string[];
  independentDomainCount: number;
  countsAsIndependentEvidence: boolean;
}

export interface ResolvedPublicEntity {
  entityId: string;
  canonicalName: string;
  status: "resolved" | "ambiguous";
  candidateEntityIds: readonly string[];
  registrableDomains: readonly string[];
  independentRegistrableDomains: readonly string[];
  evidenceIds: readonly string[];
  observationIds: readonly string[];
}

export interface VerifiedPublicClaim {
  claimId: string;
  subjectName: string;
  subjectEntityId?: string;
  predicate: string;
  value: string;
  status: "supported" | "ambiguous" | "contradictory";
  directFactSupport: boolean;
  evidenceIds: readonly string[];
  observationIds: readonly string[];
  contradictionClaimIds: readonly string[];
}

export interface PublicSourcePatternEvidence {
  patternId: string;
  kind: "independent_repetition" | "query_variant_repetition";
  value: string;
  queryVariantIds: readonly string[];
  registrableDomains: readonly string[];
  evidenceFamilyIds: readonly string[];
  evidenceIds: readonly string[];
  grade: "C";
}

export interface PublicSourceEvidenceGraph {
  version: "public-source-evidence-graph-v1";
  evidence: readonly PublicSourceEvidence[];
  evidenceFamilies: readonly EvidenceFamily[];
  entities: readonly ResolvedPublicEntity[];
  claims: readonly VerifiedPublicClaim[];
  patterns: readonly PublicSourcePatternEvidence[];
  dimensions: {
    exactQueries: readonly string[];
    queryVariantIds: readonly string[];
    registrableDomains: readonly string[];
    evidenceFamilyIds: readonly string[];
  };
  retrievalAttemptedQueryVariantIds: readonly string[];
  observedQueryVariantIds: readonly string[];
}

export interface PublicSourceGraphInput {
  observations: readonly import("@open-geo-console/public-search-observer").MarketSearchObservation[];
  retrievals: readonly RetrievedPublicSourceFact[];
  customerRegistrableDomain: string;
  competitorRegistrableDomains: readonly string[];
  knownSourceCategories?: Readonly<Record<string, Exclude<PublicSourceOwnershipCategory, "owned_customer" | "owned_competitor">>>;
}

export interface PublicSourceOpportunityHypothesis {
  id: string;
  title: string;
  rationale: string;
  evidenceIds: readonly string[];
  suggestedAction: string;
}
