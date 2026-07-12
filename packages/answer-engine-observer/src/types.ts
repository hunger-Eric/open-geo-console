export type AnswerQuestionCategory =
  | "category_selection"
  | "supplier_selection"
  | "solution_comparison"
  | "use_case_suitability";

export interface AnswerQuestion {
  id: string;
  locale: string;
  category: AnswerQuestionCategory;
  exactText: string;
  inferenceBasis: string[];
}

export type AnswerEngineCollectionSurface = "developer_api" | "approved_browser_capture";

export type AnswerEngineCertificationState = "candidate_uncertified" | "certified";

export interface AnswerEngineSurface {
  providerId: string;
  productId: string;
  modelId: string;
  collectionSurface: AnswerEngineCollectionSurface;
  locale: string;
  region: string;
  certificationState: AnswerEngineCertificationState;
  consumerApplicationLabel?: string;
}

export type AnswerAdapterErrorClass =
  | "timeout"
  | "rate-limit"
  | "authentication"
  | "unsupported"
  | "provider-unavailable"
  | "invalid-response"
  | "policy-blocked";

export interface AnswerSnapshotRunContract {
  id: string;
  reportId: string;
  jobId: string;
  locale: string;
  region: string;
  questionSetVersion: string;
  startedAt: string;
}

export interface AnswerSnapshotSource {
  url: string;
  title: string;
  providerOrder: number;
  providerMetadata: AnswerSnapshotProviderMetadata;
}

export interface AnswerSnapshotProviderMetadata {
  providerSourceId?: string;
  publishedAt?: string;
  lastUpdatedAt?: string;
  sourceType?: string;
}

export interface AnswerSnapshotUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
}

interface AnswerSnapshotCellBase {
  id: string;
  runId: string;
  questionId: string;
  surface: AnswerEngineSurface;
  executedAt: string;
  executionDurationMs: number;
  providerRequestId?: string;
  usage?: AnswerSnapshotUsage;
}

export interface SuccessfulAnswerSnapshotCell extends AnswerSnapshotCellBase {
  status: "succeeded";
  answerText: string;
  responseHash: string;
  sources: AnswerSnapshotSource[];
  recommendationOutcome: "recommendations_present" | "no_recommendation";
}

export interface FailedAnswerSnapshotCell extends AnswerSnapshotCellBase {
  status: "failed";
  errorClass: AnswerAdapterErrorClass;
  sanitizedError?: string;
}

export type AnswerSnapshotCell = SuccessfulAnswerSnapshotCell | FailedAnswerSnapshotCell;

export interface ObserveAnswerInput {
  run: AnswerSnapshotRunContract;
  question: AnswerQuestion;
  surface: AnswerEngineSurface;
  signal: AbortSignal;
}

export interface AnswerEngineAdapter {
  readonly surface: AnswerEngineSurface;
  observe(input: ObserveAnswerInput): Promise<AnswerSnapshotCell>;
  classifyError?(error: unknown): AnswerAdapterErrorClass;
}

export interface QuestionGenerationInput {
  locale: string;
  organizationName?: string;
  categories?: string[];
  capabilities?: string[];
  audiences?: string[];
  useCases?: string[];
  sourceUrls: string[];
}

export interface GeneratedQuestionSet {
  version: "purchase-v1";
  confidence: "high" | "low";
  fallbackReason?: "insufficient_category_evidence";
  limitations: string[];
  questions: AnswerQuestion[];
}

export interface AnswerEngineCertificationEvidence {
  certifiedAt: string;
  environment: "protected_staging";
  evidenceReference: string;
}

export interface RegisteredAnswerEngine {
  adapter: AnswerEngineAdapter;
  surface: AnswerEngineSurface;
  certificationEvidence?: AnswerEngineCertificationEvidence;
}

export interface CertifiedAnswerEngineSurface {
  surface: AnswerEngineSurface;
  evidence: AnswerEngineCertificationEvidence;
}

export interface ProviderExecutionBudget {
  maxRequests: number;
  maxEstimatedCostMicros: number;
  timeoutMs: number;
}

export interface ObserveAnswerMatrixInput {
  run: AnswerSnapshotRunContract;
  questions: AnswerQuestion[];
  adapters: AnswerEngineAdapter[];
  existingCells?: AnswerSnapshotCell[];
  budgets?: Record<string, ProviderExecutionBudget>;
  persistCell?: (cell: AnswerSnapshotCell) => void | Promise<void>;
}

export interface ObserveAnswerMatrixResult {
  cells: AnswerSnapshotCell[];
  pendingCellIds: string[];
}

export interface CommercialCoverageDecision {
  outcome: "qualified" | "completed_limited" | "failed";
  certifiedSurfaceCount: number;
  qualifyingSurfaceCount: number;
  successfulQuestionCount: number;
  reasons: string[];
}

export interface AnswerSnapshotRunIdentityInput {
  reportId: string;
  jobId: string;
  locale: string;
  region: string;
  questionSetVersion: string;
  runKey: string;
}

export interface AnswerSnapshotCellIdentityInput {
  runId: string;
  questionId: string;
  surface: AnswerEngineSurface;
  [volatileField: string]: unknown;
}
