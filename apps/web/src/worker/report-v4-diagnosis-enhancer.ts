import {
  ModelTokenBudgetError,
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  runWithModelTokenBudget,
  type CombinedGeoReportV4Question,
  type ModelTokenBudgetInput,
  type ReportV4DiagnosisInput,
  type ReportV4DiagnosisOutput,
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
    };

type ProviderInvocation =
  | { readonly status: "resolved"; readonly value: unknown }
  | { readonly status: "budget_rejected" }
  | { readonly status: "rejected"; readonly error: unknown };

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
    });
  } catch {
    propagateCallerAbort(signal);
    return failed(input.question, 0);
  }
  signal.throwIfAborted();

  let providerAttempts = 0;
  const invoke = async (request: ReportV4DiagnosisProviderRequest): Promise<ProviderInvocation> => {
    signal.throwIfAborted();
    const attempt = (providerAttempts + 1) as 1 | 2;
    let budget: ModelTokenBudgetInput;
    try {
      budget = input.getTokenBudget(request, attempt);
    } catch (error) {
      propagateCallerAbort(signal);
      return { status: "rejected", error };
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
      return { status: "rejected", error };
    }
  };

  const initialRequest = Object.freeze({
    kind: "diagnose" as const,
    input: diagnosisInput,
    signal
  });
  let invocation = await invoke(initialRequest);
  if (invocation.status === "budget_rejected") return failed(input.question, providerAttempts);
  if (invocation.status === "rejected") {
    if (!isExplicitlyRetryableProviderError(invocation.error) || providerAttempts !== 1) {
      return failed(input.question, providerAttempts);
    }
    invocation = await invoke(Object.freeze({ kind: "retry" as const, input: diagnosisInput, signal }));
    if (invocation.status !== "resolved") return failed(input.question, providerAttempts);
  }

  const parsed = parseDiagnosis(invocation.value, diagnosisInput);
  if (parsed.status === "valid") return completed(input.question, parsed.diagnosis, providerAttempts);
  if (providerAttempts !== 1) return failed(input.question, providerAttempts);

  const field = correctableField(parsed.error);
  if (!field || !isRecord(invocation.value)) return failed(input.question, providerAttempts);
  const correctionRequest = Object.freeze({
    kind: "correct" as const,
    field,
    invalidValue: invocation.value[field],
    failureReason: errorMessage(parsed.error),
    evidence: diagnosisInput,
    signal
  });
  const correction = await invoke(correctionRequest);
  if (correction.status !== "resolved") return failed(input.question, providerAttempts);

  const correctedValue = parseCorrection(correction.value, field);
  if (correctedValue.status === "invalid") return failed(input.question, providerAttempts);
  const correctedCandidate = { ...invocation.value, [field]: correctedValue.value };
  const corrected = parseDiagnosis(correctedCandidate, diagnosisInput);
  return corrected.status === "valid"
    ? completed(input.question, corrected.diagnosis, providerAttempts)
    : failed(input.question, providerAttempts);
}

function parseDiagnosis(
  value: unknown,
  input: ReportV4DiagnosisInput
): { readonly status: "valid"; readonly diagnosis: ReportV4DiagnosisOutput }
  | { readonly status: "invalid"; readonly error: unknown } {
  try {
    return { status: "valid", diagnosis: parseReportV4DiagnosisOutput(value, input) };
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

function correctableField(error: unknown): ReportV4DiagnosisCorrectableField | null {
  if (!(error instanceof TypeError)) return null;
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
  providerAttempts: number
): ReportV4DiagnosisEnhancerResult {
  if (providerAttempts !== 0 && providerAttempts !== 1 && providerAttempts !== 2) {
    throw new Error("A V4 diagnosis cannot exceed two provider attempts.");
  }
  return Object.freeze({ status: "failed", question, providerAttempts });
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
