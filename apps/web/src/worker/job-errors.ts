import { createHash } from "node:crypto";
import type { ScanJobPhase } from "./job-state";

export type JobFailureClassification = "transient" | "operator_repairable" | "target_limitation" | "permanent";

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
  const secrets = context.configuredSecrets ?? [];
  const message = redactDiagnostic(source.message || "Unexpected internal error.", secrets, 1_000);
  const stack = source.stack ? redactDiagnostic(source.stack, secrets) : null;
  const classification = known?.classification ?? classifyUnknown(source);
  const code = known?.code ?? "unexpected_internal_error";
  const causes = collectCauses(source, secrets);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    code, type: source.name || "Error", phase: context.phase, message: normalizeFingerprintMessage(message)
  })).digest("hex");
  return {
    classification, code, type: source.name || "Error", message, stack, causes, fingerprint,
    retryableAt: classification === "transient" ? new Date(now.getTime() + retryDelayMs(context.phaseAttempt, fingerprint)) : null
  };
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
