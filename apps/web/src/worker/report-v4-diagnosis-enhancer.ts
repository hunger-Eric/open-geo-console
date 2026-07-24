import {
  ModelTokenBudgetError,
  assembleReportV4DiagnosisSemanticOutput,
  buildReportV4DiagnosisSemanticInput,
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  runWithModelTokenBudget,
  type CombinedGeoReportV4Question,
  type ModelTokenBudgetInput,
  type ReportV4DiagnosisInput,
  type ReportV4DiagnosisOutput,
  type ReportV4DiagnosisSemanticInput,
  type ReportV4DiagnosisTargetPage
} from "@open-geo-console/ai-report-engine";

export type ReportV4DiagnosisProviderErrorCode =
  | "transport"
  | "rate_limited"
  | "temporary_provider"
  | "authentication"
  | "configuration"
  | "safety";

const RETRYABLE_PROVIDER_CODES = new Set<ReportV4DiagnosisProviderErrorCode>([
  "transport",
  "rate_limited",
  "temporary_provider"
]);

export class ReportV4DiagnosisProviderError extends Error {
  readonly code: ReportV4DiagnosisProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: ReportV4DiagnosisProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReportV4DiagnosisProviderError";
    this.code = code;
    this.retryable = RETRYABLE_PROVIDER_CODES.has(code);
  }
}

export type ReportV4DiagnosisCorrectableField = keyof ReportV4DiagnosisOutput;

export type ReportV4DiagnosisProviderRequest =
  | {
      readonly kind: "diagnose" | "retry";
      readonly input: ReportV4DiagnosisInput;
      readonly mode?: "legacy";
      readonly failureReason?: string;
      readonly signal: AbortSignal;
    }
  | {
      readonly kind: "diagnose" | "retry";
      readonly input: ReportV4DiagnosisSemanticInput;
      readonly mode: "semantic";
      readonly failureReason?: string;
      readonly signal: AbortSignal;
    }
  | {
      readonly kind: "correct";
      readonly field: ReportV4DiagnosisCorrectableField;
      readonly invalidValue: unknown;
      readonly failureReason: string;
      readonly evidence: ReportV4DiagnosisInput;
      readonly signal: AbortSignal;
    };

export interface ReportV4DiagnosisProvider {
  generate(request: ReportV4DiagnosisProviderRequest): Promise<unknown>;
}

export interface ReportV4DiagnosisEnhancerInput {
  readonly question: CombinedGeoReportV4Question;
  readonly locale: string;
  readonly targetPages: readonly ReportV4DiagnosisTargetPage[];
  readonly provider: ReportV4DiagnosisProvider;
  readonly getTokenBudget: (
    request: ReportV4DiagnosisProviderRequest,
    attempt: 1 | 2
  ) => ModelTokenBudgetInput;
  readonly signal?: AbortSignal;
  readonly semanticValidation?: "legacy" | "deferred";
}

export type ReportV4DiagnosisFailureStage =
  | "input_validation"
  | "token_budget"
  | "provider"
  | "semantic_contract"
  | "canonical_contract"
  | "correction_contract";

export interface ReportV4DiagnosisFailure {
  readonly stage: ReportV4DiagnosisFailureStage;
  readonly code: string;
  readonly parserPath: string | null;
}

export type ReportV4DiagnosisEnhancerResult =
  | {
      readonly status: "completed";
      readonly question: CombinedGeoReportV4Question;
      readonly diagnosis: ReportV4DiagnosisOutput;
      readonly providerAttempts: 1 | 2;
    }
  | {
      readonly status: "failed";
      readonly question: CombinedGeoReportV4Question;
      readonly diagnosis?: undefined;
      readonly providerAttempts: 0 | 1 | 2;
      readonly failure: ReportV4DiagnosisFailure;
    };

type ProviderInvocation =
  | { readonly status: "resolved"; readonly value: unknown }
  | { readonly status: "budget_rejected" }
  | { readonly status: "rejected"; readonly stage: "token_budget" | "provider"; readonly error: unknown };

const CORRECTABLE_FIELDS = [
  "selectionSummary",
  "observableFactors",
  "targetGap",
  "recommendedActions",
  "detailedEvidenceRefs"
] as const satisfies readonly ReportV4DiagnosisCorrectableField[];

export async function enhanceReportV4QuestionDiagnosis(
  input: ReportV4DiagnosisEnhancerInput
): Promise<ReportV4DiagnosisEnhancerResult> {
  input.signal?.throwIfAborted();
  const signal = input.signal ?? new AbortController().signal;
  let diagnosisInput: ReportV4DiagnosisInput;
  try {
    diagnosisInput = parseReportV4DiagnosisInput({
      question: {
        questionId: input.question.questionId,
        text: input.question.questionText
      },
      answer: input.question.status === "answered" ? input.question.answer : null,
      locale: input.locale,
      sources: input.question.sources.map((source) => ({
        questionId: source.questionId,
        sourceId: source.sourceId,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        excerpt: source.citedText,
        retrievalStatus: source.retrievalStatus
      })),
      targetPages: input.targetPages
    }, { semanticValidation: input.semanticValidation });
  } catch (error) {
    propagateCallerAbort(signal);
    return failed(input.question, 0, parserFailure("input_validation", "invalid_input", error));
  }
  signal.throwIfAborted();
  const semanticMode = input.semanticValidation === "deferred";
  let semanticInput: ReportV4DiagnosisSemanticInput | null = null;
  if (semanticMode) {
    try {
      semanticInput = buildReportV4DiagnosisSemanticInput(diagnosisInput);
    } catch (error) {
      return failed(input.question, 0, parserFailure("input_validation", "invalid_semantic_input", error));
    }
  }

  let providerAttempts = 0;
  const invoke = async (request: ReportV4DiagnosisProviderRequest): Promise<ProviderInvocation> => {
    signal.throwIfAborted();
    const attempt = (providerAttempts + 1) as 1 | 2;
    let budget: ModelTokenBudgetInput;
    try {
      budget = input.getTokenBudget(request, attempt);
    } catch (error) {
      propagateCallerAbort(signal);
      return { status: "rejected", stage: "token_budget", error };
    }
    signal.throwIfAborted();
    try {
      const value = await runWithModelTokenBudget(budget, () => {
        signal.throwIfAborted();
        providerAttempts = attempt;
        return input.provider.generate(request);
      });
      signal.throwIfAborted();
      return { status: "resolved", value };
    } catch (error) {
      propagateCallerAbort(signal);
      if (error instanceof ModelTokenBudgetError) return { status: "budget_rejected" };
      return { status: "rejected", stage: "provider", error };
    }
  };

  const initialRequest: ReportV4DiagnosisProviderRequest = semanticMode
    ? Object.freeze({ kind: "diagnose" as const, mode: "semantic" as const, input: semanticInput!, signal })
    : Object.freeze({ kind: "diagnose" as const, input: diagnosisInput, signal });
  let invocation = await invoke(initialRequest);
  if (invocation.status === "budget_rejected") {
    return failed(input.question, providerAttempts, failure("token_budget", "budget_rejected"));
  }
  if (invocation.status === "rejected") {
    if (!isExplicitlyRetryableProviderError(invocation.error) || providerAttempts !== 1) {
      return failed(input.question, providerAttempts, invocationFailure(invocation));
    }
    const retryRequest: ReportV4DiagnosisProviderRequest = semanticMode
      ? Object.freeze({ kind: "retry" as const, mode: "semantic" as const, input: semanticInput!, signal })
      : Object.freeze({ kind: "retry" as const, input: diagnosisInput, signal });
    invocation = await invoke(retryRequest);
    if (invocation.status !== "resolved") {
      return failed(input.question, providerAttempts, invocationFailure(invocation));
    }
  }

  if (semanticMode) {
    let parsed = parseSemanticDiagnosis(invocation.value, diagnosisInput);
    if (parsed.status === "valid") return completed(input.question, parsed.diagnosis, providerAttempts);
    const parsedFailure = parserFailure(
      "semantic_contract",
      isUnsafeProseError(parsed.error) ? "unsafe_semantic_output" : "invalid_semantic_output",
      parsed.error
    );
    if (providerAttempts !== 1 || parsedFailure.code === "unsafe_semantic_output") {
      return failed(input.question, providerAttempts, parsedFailure);
    }
    const retry = await invoke(Object.freeze({
      kind: "retry" as const,
      mode: "semantic" as const,
      input: semanticInput!,
      failureReason: formatFailureReason(parsedFailure),
      signal
    }));
    if (retry.status !== "resolved") {
      return failed(input.question, providerAttempts, invocationFailure(retry));
    }
    parsed = parseSemanticDiagnosis(retry.value, diagnosisInput);
    return parsed.status === "valid"
      ? completed(input.question, parsed.diagnosis, providerAttempts)
      : failed(input.question, providerAttempts, parserFailure(
          "semantic_contract",
          isUnsafeProseError(parsed.error) ? "unsafe_semantic_output" : "invalid_semantic_output",
          parsed.error
        ));
  }

  const parsed = parseDiagnosis(invocation.value, diagnosisInput, input.semanticValidation);
  if (parsed.status === "valid") return completed(input.question, parsed.diagnosis, providerAttempts);
  if (providerAttempts !== 1) {
    return failed(input.question, providerAttempts, parserFailure("canonical_contract", "invalid_legacy_output", parsed.error));
  }

  const field = correctableField(parsed.error, input.semanticValidation);
  if (!field || !isRecord(invocation.value)) {
    return failed(input.question, providerAttempts, parserFailure("canonical_contract", "invalid_legacy_output", parsed.error));
  }
  const correctionRequest = Object.freeze({
    kind: "correct" as const,
    field,
    invalidValue: invocation.value[field],
    failureReason: errorMessage(parsed.error),
    evidence: diagnosisInput,
    signal
  });
  const correction = await invoke(correctionRequest);
  if (correction.status !== "resolved") {
    return failed(input.question, providerAttempts, invocationFailure(correction));
  }

  const correctedValue = parseCorrection(correction.value, field);
  if (correctedValue.status === "invalid") {
    return failed(input.question, providerAttempts, failure("correction_contract", "invalid_correction"));
  }
  const correctedCandidate = { ...invocation.value, [field]: correctedValue.value };
  const corrected = parseDiagnosis(correctedCandidate, diagnosisInput, input.semanticValidation);
  return corrected.status === "valid"
    ? completed(input.question, corrected.diagnosis, providerAttempts)
    : failed(input.question, providerAttempts, parserFailure("canonical_contract", "invalid_corrected_output", corrected.error));
}

function parseSemanticDiagnosis(
  value: unknown,
  input: ReportV4DiagnosisInput
): { readonly status: "valid"; readonly diagnosis: ReportV4DiagnosisOutput }
  | { readonly status: "invalid"; readonly error: unknown } {
  try {
    return { status: "valid", diagnosis: assembleReportV4DiagnosisSemanticOutput(value, input) };
  } catch (error) {
    return { status: "invalid", error };
  }
}

function parseDiagnosis(
  value: unknown,
  input: ReportV4DiagnosisInput,
  semanticValidation?: "legacy" | "deferred"
): { readonly status: "valid"; readonly diagnosis: ReportV4DiagnosisOutput }
  | { readonly status: "invalid"; readonly error: unknown } {
  try {
    return { status: "valid", diagnosis: parseReportV4DiagnosisOutput(value, input, { semanticValidation }) };
  } catch (error) {
    return { status: "invalid", error };
  }
}

function parseCorrection(
  value: unknown,
  expectedField: ReportV4DiagnosisCorrectableField
): { readonly status: "valid"; readonly value: unknown } | { readonly status: "invalid" } {
  if (!isRecord(value)) return { status: "invalid" };
  const fields = Object.keys(value);
  if (fields.length !== 2 || !fields.includes("field") || !fields.includes("value") || value.field !== expectedField) {
    return { status: "invalid" };
  }
  return { status: "valid", value: value.value };
}

function correctableField(error: unknown, semanticValidation?: "legacy" | "deferred"): ReportV4DiagnosisCorrectableField | null {
  if (!(error instanceof TypeError)) return null;
  if (semanticValidation === "deferred" && error.message.endsWith(" contains prohibited customer prose.")) return null;
  return CORRECTABLE_FIELDS.find((field) => error.message.startsWith(`$diagnosisOutput.${field}`)) ?? null;
}

function isExplicitlyRetryableProviderError(error: unknown): error is ReportV4DiagnosisProviderError {
  return error instanceof ReportV4DiagnosisProviderError && error.retryable;
}

function completed(
  question: CombinedGeoReportV4Question,
  diagnosis: ReportV4DiagnosisOutput,
  providerAttempts: number
): ReportV4DiagnosisEnhancerResult {
  if (providerAttempts !== 1 && providerAttempts !== 2) throw new Error("A completed V4 diagnosis requires one or two provider attempts.");
  return Object.freeze({ status: "completed", question, diagnosis, providerAttempts });
}

function failed(
  question: CombinedGeoReportV4Question,
  providerAttempts: number,
  diagnosisFailure: ReportV4DiagnosisFailure
): ReportV4DiagnosisEnhancerResult {
  if (providerAttempts !== 0 && providerAttempts !== 1 && providerAttempts !== 2) {
    throw new Error("A V4 diagnosis cannot exceed two provider attempts.");
  }
  return Object.freeze({ status: "failed", question, providerAttempts, failure: diagnosisFailure });
}

export function formatReportV4DiagnosisFailure(
  diagnosisFailure: ReportV4DiagnosisFailure,
  providerAttempts: number
): string {
  const path = diagnosisFailure.parserPath ? `; parserPath=${diagnosisFailure.parserPath}` : "";
  return `stage=${diagnosisFailure.stage}; code=${diagnosisFailure.code}; providerAttempts=${providerAttempts}${path}`;
}

function invocationFailure(invocation: Exclude<ProviderInvocation, { status: "resolved" }>): ReportV4DiagnosisFailure {
  if (invocation.status === "budget_rejected") return failure("token_budget", "budget_rejected");
  if (invocation.stage === "token_budget") return failure("token_budget", "budget_configuration");
  const code = invocation.error instanceof ReportV4DiagnosisProviderError
    ? `provider_${invocation.error.code}`
    : "provider_rejected";
  return failure("provider", code);
}

function parserFailure(
  stage: ReportV4DiagnosisFailureStage,
  code: string,
  error: unknown
): ReportV4DiagnosisFailure {
  const message = error instanceof Error ? error.message : "";
  const parserPath = message.match(/^\$[A-Za-z0-9_.[\]]+/u)?.[0] ?? null;
  return failure(stage, code, parserPath);
}

function failure(
  stage: ReportV4DiagnosisFailureStage,
  code: string,
  parserPath: string | null = null
): ReportV4DiagnosisFailure {
  return Object.freeze({ stage, code, parserPath });
}

function formatFailureReason(diagnosisFailure: ReportV4DiagnosisFailure): string {
  return diagnosisFailure.parserPath
    ? `${diagnosisFailure.code} at ${diagnosisFailure.parserPath}`
    : diagnosisFailure.code;
}

function isUnsafeProseError(error: unknown): boolean {
  return error instanceof TypeError && error.message.endsWith(" contains prohibited customer prose.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The selected field did not satisfy the diagnosis contract.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function propagateCallerAbort(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}
