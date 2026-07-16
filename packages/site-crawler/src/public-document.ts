export const PUBLIC_DOCUMENT_STAGES = [
  "candidate_selected", "dns_validation", "robots_evaluation", "http_request",
  "http_response_validation", "document_decoding", "content_extraction",
  "question_relevance", "subject_resolution", "evidence_classification", "terminal"
] as const;

export type PublicDocumentStage = (typeof PUBLIC_DOCUMENT_STAGES)[number];

export const PUBLIC_DOCUMENT_OUTCOMES = [
  "available", "duplicate", "domain_cap", "question_budget_exhausted",
  "unsafe_destination", "dns_failed", "connect_timeout", "tls_failed",
  "robots_denied", "robots_unavailable", "redirect_invalid", "redirect_limit",
  "http_403", "http_404", "http_429", "http_5xx", "challenge_detected",
  "authentication_required", "unsupported_content_type", "response_too_large",
  "body_empty", "javascript_shell", "decoding_failed", "extraction_failed",
  "irrelevant_to_question", "subject_ambiguous", "contradictory",
  "evidence_rejected", "caller_aborted", "phase_deadline", "worker_deadline",
  "internal_failure"
] as const;

export type PublicDocumentOutcome = (typeof PUBLIC_DOCUMENT_OUTCOMES)[number];

export const QUESTION_COLLECTION_STATES = [
  "collecting", "evidence_target_met", "exhausted", "collection_failed"
] as const;

export type QuestionCollectionState = (typeof QUESTION_COLLECTION_STATES)[number];

export interface PublicDocumentAttemptResult {
  method: "http" | "browser";
  stage: PublicDocumentStage;
  outcome: PublicDocumentOutcome;
  canonicalUrl: string;
  finalUrl?: string;
  registrableDomain: string;
  httpStatus?: number;
  robotsOutcome?: "allowed" | "denied" | "missing" | "unavailable";
  contentType?: string;
  contentBytes?: number;
  durationMs: number;
  normalizedText?: string;
  normalizedContentHash?: string;
  retryEligible: boolean;
  browserEligible: boolean;
}

export interface QuestionAcquisitionCheckpoint {
  identityHash: string;
  reportId: string;
  jobId: string;
  questionId: string;
  snapshotId: string;
  candidatePoolHash: string;
  state: QuestionCollectionState;
  plannedCandidates: number;
  attemptedCandidates: number;
  remainingCandidates: number;
  returnedObservations: number;
  extractedDocuments: number;
  eligibleEvidenceIds: string[];
  independentDomains: string[];
  queryRewritesUsed: number;
  httpBudgetUsed: number;
  browserBudgetUsed: number;
  revision: number;
}

export function isTerminalQuestionCollectionState(state: QuestionCollectionState): boolean {
  return state !== "collecting";
}
