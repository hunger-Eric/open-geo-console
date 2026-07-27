export type PublicSearchSurfaceKind = "documented_api" | "licensed_index" | "self_hosted_index";
export type SearchObservationStatus =
  | "complete"
  | "partial"
  | "rate_limited"
  | "timed_out"
  | "unavailable"
  | "malformed"
  | "aborted"
  | "authentication"
  | "unsupported";

export type SearchAdapterErrorClass = Exclude<SearchObservationStatus, "complete" | "partial">;

export interface PublicSearchSurface {
  surfaceId: string;
  providerId: string;
  productId: string;
  surfaceKind: PublicSearchSurfaceKind;
  contractVersion: string;
  surfaceVersion: string;
  adapterVersion: string;
  locale: string;
  region: string;
}

export interface PublicSearchSurfaceAuthority {
  authorityId: string;
  environment: "test" | "protected_staging" | "production";
  surface: PublicSearchSurface;
  active: boolean;
  certifiedAt: string;
  evidenceReference: string;
  supportedLocales: readonly string[];
  supportedRegions: readonly string[];
}

export interface SearchExecutionBudget {
  maxRequests: number;
  maxResults: number;
  timeoutMs: number;
  maxCostMicros: number;
}

export interface SearchAttemptUsage {
  requestCount: number;
  resultCount: number;
  estimatedCostMicros?: number;
  providerReportedCostMicros?: number;
  costUncertain?: boolean;
}

export interface SearchResultObservation {
  surfaceResultOrder: number;
  url: string;
  title: string;
  snippet: string;
  displayedHost: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface MarketSearchObservation {
  observationId: string;
  surface: PublicSearchSurface;
  queryId: string;
  exactQuery: string;
  requestedAt: string;
  completedAt: string;
  status: SearchObservationStatus;
  results: readonly SearchResultObservation[];
  usage: SearchAttemptUsage;
  sanitizedError?: string;
}

export interface PublicSearchRequest {
  surface: PublicSearchSurface;
  query: SearchQueryVariant;
  budget: SearchExecutionBudget;
  signal: AbortSignal;
}

export interface PublicSearchSurfaceAdapter {
  readonly id: string;
  readonly surface: PublicSearchSurface;
  readonly authority: PublicSearchSurfaceAuthority;
  search(input: PublicSearchRequest): Promise<unknown>;
  classifyError?(error: unknown): SearchAdapterErrorClass;
}

export type QuestionEvidenceConfidence = "high" | "medium" | "low";

export interface PublicQuestionEvidence {
  value: string;
  confidence: QuestionEvidenceConfidence;
  sourceId: string;
}

export interface CustomerIdentityExclusion {
  kind: "customer_brand" | "customer_domain" | "competitor_brand" | "email" | "order_id" | "private_identity";
  value: string;
}

export interface QuestionExpansionEvidence {
  confidence: "high";
  distinctSupportedDimensions: readonly ("route" | "mode" | "customs" | "use_case" | "qualification" | "buyer_risk" | "market")[];
}

export interface CanonicalQuestionGenerationInput {
  locale: string;
  region: string;
  categoryEvidence: readonly PublicQuestionEvidence[];
  capabilityEvidence?: readonly PublicQuestionEvidence[];
  useCaseEvidence?: readonly PublicQuestionEvidence[];
  broadCategory: string;
  excludedIdentities: readonly CustomerIdentityExclusion[];
  expansionEvidence?: QuestionExpansionEvidence;
  questionSetVersion?: string;
}

export type BuyerQuestionKind = "supplier_discovery" | "capability_fit" | "decision_risk" | "use_case_fit" | "qualification";

export interface QuestionDerivation {
  ruleId: string;
  evidenceSourceIds: readonly string[];
  subject: string;
  supportingTerm?: string;
  broadened: boolean;
}

export interface CanonicalBuyerQuestion {
  id: string;
  questionSetVersion: string;
  locale: string;
  region: string;
  kind: BuyerQuestionKind;
  exactText: string;
  normalizedText: string;
  derivation: QuestionDerivation;
}

export interface CanonicalBuyerQuestionSet {
  questionSetVersion: string;
  locale: string;
  region: string;
  confidence: "high" | "low";
  questions: readonly CanonicalBuyerQuestion[];
  limitations: readonly string[];
}

export interface SearchQueryVariant {
  id: string;
  questionId: string;
  fanoutVersion: string;
  locale: string;
  region: string;
  exactQuery: string;
  derivationRuleId: string;
  resultDepth: number;
}

export interface SearchQueryFanout {
  questionId: string;
  questionSetVersion: string;
  fanoutVersion: string;
  surface: PublicSearchSurface;
  queries: readonly SearchQueryVariant[];
  budget: SearchExecutionBudget;
}

export interface MarketSnapshotIdentity {
  id: string;
  normalizedQuestion: string;
  locale: string;
  region: string;
  surfaceId: string;
  surfaceVersion: string;
  fanoutVersion: string;
}

export type SnapshotFreshness = "fresh" | "stale" | "expired";

export interface PublicSearchCoverage {
  status: "complete" | "partial" | "insufficient";
  completedQueryCount: number;
  expectedQueryCount: number;
  observedResultCount: number;
  surfaceDomainCount: number;
  reasons: readonly string[];
}

export interface ObservePublicSearchInput {
  adapter: PublicSearchSurfaceAdapter;
  query: SearchQueryVariant;
  budget: SearchExecutionBudget;
  signal: AbortSignal;
}
