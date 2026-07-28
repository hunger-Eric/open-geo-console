import { createHash } from "node:crypto";
import {
  AiClientError,
  ModelTokenBudgetError,
  ReportSemanticReviewEvidenceMissingError,
  SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE
} from "@open-geo-console/ai-report-engine";
import type { ScanJobPhase } from "./job-state";
import { PublicSourceResumeIdentityMismatchError } from "./public-source-forensics";
import {
  ProviderDiscoveryDeadlineExceededError,
  ProviderDiscoveryPipelineContractError,
  ProviderDiscoveryResumeIdentityMismatchError
} from "./provider-discovery-pipeline";

export type JobFailureClassification = "transient" | "operator_repairable" | "target_limitation" | "permanent";

export const MIMO_INVALID_RESPONSE_JOB_CODE = "mimo_invalid_response" as const;

/** Durable job codes for structured MiMo provider failures (never raw bodies). */
const MIMO_PROVIDER_JOB_CLASSIFICATION: Readonly<Record<string, {
  code: string;
  classification: JobFailureClassification;
}>> = Object.freeze({
  transport: { code: "mimo_transport", classification: "transient" },
  rate_limited: { code: "mimo_rate_limited", classification: "transient" },
  temporary_provider: { code: "mimo_temporary_provider", classification: "transient" },
  mimo_invalid_response: { code: MIMO_INVALID_RESPONSE_JOB_CODE, classification: "transient" },
  mimo_timeout: { code: "mimo_timeout", classification: "transient" },
  authentication: { code: "mimo_authentication", classification: "operator_repairable" },
  configuration: { code: "mimo_configuration", classification: "operator_repairable" },
  safety: { code: "mimo_safety", classification: "permanent" },
  mimo_output_truncated: { code: "mimo_output_truncated", classification: "transient" },
  mimo_content_filtered: { code: "mimo_content_filtered", classification: "permanent" },
  contract: { code: "mimo_contract", classification: "permanent" }
});

export class JobError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly classification: JobFailureClassification,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class PublicSourceRuntimeError extends JobError {
  constructor(message: string, code = "public_source_runtime_unavailable", options?: ErrorOptions) {
    super(message, code, "operator_repairable", options);
  }
}
export class StagingLiveDrillFaultError extends JobError {
  constructor(fault: string) {
    super(`Protected staging live Worker drill injected ${fault} fault.`, `staging_live_drill_${fault}`, "operator_repairable");
  }
}
export class CheckpointValidationError extends JobError {
  constructor(message: string, options?: ErrorOptions) { super(message, "checkpoint_validation_failed", "permanent", options); }
}
export class TerminalizationError extends JobError {
  constructor(message: string, options?: ErrorOptions) { super(message, "terminalization_failed", "permanent", options); }
}

export interface JobErrorContext {
  jobId: string;
  phase: ScanJobPhase;
  phaseAttempt: number;
  resumeGeneration: number;
  configuredSecrets?: readonly string[];
}

export interface NormalizedJobError {
  classification: JobFailureClassification;
  code: string;
  type: string;
  message: string;
  stack: string | null;
  causes: string[];
  fingerprint: string;
  retryableAt: Date | null;
}

const REDACTION_PATTERNS: RegExp[] = [
  /\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*/gi,
  /\b(?:api[_ -]?key|authorization|cookie|report[_ -]?token|credit[_ -]?key)\s*[=:]\s*[^\s,;]+/gi,
  /\b(?:postgres(?:ql)?|mysql|mongodb):\/\/[^\s)]+/gi,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/gi,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
];

export function redactDiagnostic(value: string, configuredSecrets: readonly string[] = [], limit = 8_000): string {
  let result = value;
  for (const secret of configuredSecrets) {
    if (secret.trim()) result = result.split(secret).join("[REDACTED]");
  }
  for (const pattern of REDACTION_PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result.slice(0, limit);
}

export function normalizeJobError(error: unknown, context: JobErrorContext, now = new Date()): NormalizedJobError {
  const known = error instanceof JobError ? error : null;
  const source = error instanceof Error ? error : new Error("Non-error value thrown by job execution.");
  const languageValidationFailure = source.name === "ReportLanguageValidationError";
  const typedBoundary = resolveTypedBoundaryError(error, context);
  const secrets = context.configuredSecrets ?? [];
  const message = redactDiagnostic(source.message || typedBoundary?.message || "Unexpected internal error.", secrets, 1_000);
  const stack = source.stack ? redactDiagnostic(source.stack, secrets) : null;
  const classification = known?.classification
    ?? typedBoundary?.classification
    ?? (languageValidationFailure ? "operator_repairable" : classifyUnknown(source));
  const code = known?.code
    ?? typedBoundary?.code
    ?? (languageValidationFailure ? "report_language_validation_failed" : "unexpected_internal_error");
  const causes = collectCauses(source, secrets);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    code, type: source.name || "Error", phase: context.phase, message: normalizeFingerprintMessage(message)
  })).digest("hex");
  return {
    classification, code, type: source.name || "Error", message, stack, causes, fingerprint,
    retryableAt: classification === "transient" ? new Date(now.getTime() + retryDelayMs(context.phaseAttempt, fingerprint)) : null
  };
}

/** Maps provider/review/discovery boundary errors that are not JobError subclasses. */
function resolveTypedBoundaryError(
  error: unknown,
  context: JobErrorContext
): { code: string; classification: JobFailureClassification; message?: string } | null {
  if (error instanceof ReportSemanticReviewEvidenceMissingError) {
    return { code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE, classification: "permanent" };
  }
  if (error instanceof ModelTokenBudgetError) {
    return { code: "model_token_budget_rejected", classification: "permanent" };
  }
  if (error instanceof ProviderDiscoveryResumeIdentityMismatchError) {
    return { code: "provider_discovery_resume_identity_mismatch", classification: "permanent" };
  }
  if (error instanceof PublicSourceResumeIdentityMismatchError) {
    return publicSourceResumeIdentityMismatchBoundary();
  }
  if (error instanceof ProviderDiscoveryDeadlineExceededError) {
    return { code: "provider_discovery_deadline_exceeded", classification: "transient" };
  }
  if (error instanceof ProviderDiscoveryPipelineContractError) {
    return { code: "provider_discovery_pipeline_contract", classification: "permanent" };
  }
  if (error instanceof AiClientError) {
    return mapAiClientJobBoundary(error, context.phase);
  }
  if (error && typeof error === "object") {
    const row = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
    if (row.name === "ReportSemanticReviewEvidenceMissingError" || row.code === SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE) {
      return { code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE, classification: "permanent" };
    }
    if (row.name === "ModelTokenBudgetError") {
      return { code: "model_token_budget_rejected", classification: "permanent" };
    }
    // Duck-typed AiClient / discovery names for cross-bundle rethrows without shared class identity.
    if (row.name === "AiClientError") {
      const status = typeof row.status === "number" ? row.status : undefined;
      const message = typeof row.message === "string" ? row.message : "";
      return mapAiClientJobBoundary({ status, message }, context.phase);
    }
    if (row.name === "ProviderDiscoveryResumeIdentityMismatchError") {
      return { code: "provider_discovery_resume_identity_mismatch", classification: "permanent" };
    }
    if (row.name === "PublicSourceResumeIdentityMismatchError") {
      return publicSourceResumeIdentityMismatchBoundary();
    }
    if (row.name === "ProviderDiscoveryDeadlineExceededError") {
      return { code: "provider_discovery_deadline_exceeded", classification: "transient" };
    }
    if (row.name === "ProviderDiscoveryPipelineContractError") {
      return { code: "provider_discovery_pipeline_contract", classification: "permanent" };
    }
    if (row.name === "ReportV4MimoProviderError" && typeof row.code === "string") {
      const mapped = MIMO_PROVIDER_JOB_CLASSIFICATION[row.code];
      if (mapped) return { code: mapped.code, classification: mapped.classification };
    }
    if (row.name === "ReportV4DiagnosisProviderError" && typeof row.code === "string") {
      const mapped = MIMO_PROVIDER_JOB_CLASSIFICATION[row.code];
      if (mapped) {
        return {
          code: mapped.code.replace(/^mimo_/, "diagnosis_"),
          classification: mapped.classification
        };
      }
    }
    if (row.name === "PaidV3DiagnosisIncompleteError") {
      // Deterministic diagnosis-input rejection can never succeed on retry;
      // provider/token/contract stages keep their existing classification path.
      const failure = (row as { failure?: { stage?: unknown } }).failure;
      if (failure?.stage === "input_validation") {
        return { code: "paid_v3_diagnosis_input_invalid", classification: "permanent" };
      }
    }
    if (row.name === "ReportV4QuestionProviderError" && typeof row.code === "string") {
      const mapped = MIMO_PROVIDER_JOB_CLASSIFICATION[row.code];
      if (mapped) {
        return {
          code: mapped.code.replace(/^mimo_/, "question_"),
          classification: mapped.classification
        };
      }
    }
    if (row.name === "MiMoGenerativeSearchAnswerError" && typeof (row as { errorClass?: unknown }).errorClass === "string") {
      const errorClass = (row as { errorClass: string }).errorClass;
      if (errorClass === "authentication") {
        return { code: "generative_search_authentication", classification: "operator_repairable" };
      }
      if (errorClass === "unavailable") {
        return { code: "generative_search_unavailable", classification: "transient" };
      }
      if (errorClass === "malformed") {
        return { code: "generative_search_malformed", classification: "transient" };
      }
      if (errorClass === "aborted") {
        return { code: "generative_search_aborted", classification: "transient" };
      }
    }
  }
  return null;
}

/** The mismatch class carries an empty message; give operators a diagnosable one. */
function publicSourceResumeIdentityMismatchBoundary(): { code: string; classification: JobFailureClassification; message: string } {
  return {
    code: "public_source_resume_identity_mismatch",
    classification: "permanent",
    message: "Public-source forensics resume identity does not match the persisted checkpoint."
  };
}

/** Deep claim-extraction (progress 96) vs generic AI client transport taxonomy. */
function mapAiClientJobBoundary(
  error: { status?: number; message: string },
  phase: ScanJobPhase
): { code: string; classification: JobFailureClassification } {
  const prefix = phase === "provider_claim_extraction" ? "provider_claim_extraction" : "ai_client";
  if (error.status === 401 || error.status === 403) {
    return { code: `${prefix}_authentication`, classification: "operator_repairable" };
  }
  if (error.status === 429) {
    return { code: `${prefix}_rate_limited`, classification: "transient" };
  }
  if (typeof error.status === "number" && error.status >= 500) {
    return { code: `${prefix}_temporary`, classification: "transient" };
  }
  if (/aborted|timed out/i.test(error.message)) {
    return { code: `${prefix}_timeout`, classification: "transient" };
  }
  if (/invalid json|non-json|envelope|no message content/i.test(error.message)) {
    return { code: `${prefix}_invalid_response`, classification: "transient" };
  }
  if (/base URL|API key|model is required/i.test(error.message)) {
    return { code: `${prefix}_configuration`, classification: "operator_repairable" };
  }
  if (typeof error.status === "number" && error.status >= 400) {
    return { code: `${prefix}_configuration`, classification: "operator_repairable" };
  }
  return { code: `${prefix}_transport`, classification: "transient" };
}

export function retryDelayMs(phaseAttempt: number, fingerprint = ""): number {
  const boundedAttempt = Math.max(1, Math.min(phaseAttempt, 6));
  const base = Math.min(15 * 60_000, 15_000 * 2 ** (boundedAttempt - 1));
  const jitter = Number.parseInt(fingerprint.slice(0, 4) || "0", 16) % 5_000;
  return base + jitter;
}

function classifyUnknown(error: Error): JobFailureClassification {
  const value = `${error.name} ${error.message}`.toLowerCase();
  if (/\b(404|not found|robots|login|unauthori[sz]ed|forbidden|unreadable)\b/.test(value)) return "target_limitation";
  if (/\b(config|disabled|missing|authority|credential|environment|storage)\b/.test(value)) return "operator_repairable";
  if (/\b(checkpoint|identity|contract|corrupt|terminal)\b/.test(value)) return "permanent";
  return "transient";
}

function collectCauses(error: Error, secrets: readonly string[]): string[] {
  const values: string[] = [];
  let current: unknown = (error as Error & { cause?: unknown }).cause;
  while (current && values.length < 3) {
    const message = current instanceof Error ? current.message : String(current);
    values.push(redactDiagnostic(message, secrets, 1_000));
    current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
  }
  return values;
}

function normalizeFingerprintMessage(value: string): string {
  return value.replace(/[0-9a-f]{8,}/gi, "#").replace(/\d+/g, "#").slice(0, 240);
}
