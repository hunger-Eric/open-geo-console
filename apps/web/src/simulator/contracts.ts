import type { LogAnalysisResult } from "@open-geo-console/log-parser";

export interface SimulatorRunRequest {
  sourceUrl: string;
}

export interface SimulatorApiAttempt {
  id: string;
  method: string;
  path: string;
  url?: string;
  userAgent: string;
  ruleId?: string;
  operator?: string;
  bot?: string;
}

export interface SimulatorRunResponse {
  runId: string;
  sourceUrl: string;
  generatedAt: string;
  attempted: SimulatorApiAttempt[];
}

export interface SimulatorMatchRequest {
  runId: string;
  attempted: SimulatorApiAttempt[];
  logInput: string;
}

export interface SimulatorObservedLogEntry {
  path: string;
  userAgent?: string;
  status?: number;
  timestamp?: string;
}

export interface SimulatorAttemptComparison {
  attemptId: string;
  matched: boolean;
  matches: SimulatorObservedLogEntry[];
}

export interface SimulatorComparisonResult {
  runId: string;
  attemptedCount: number;
  observedCount: number;
  signals: {
    parsedLines: number;
    hasUserAgent: boolean;
    hasRunMarker: boolean;
  };
  warnings: string[];
  attempts: SimulatorAttemptComparison[];
}

export interface SimulatorMatchResponse {
  analysis: LogAnalysisResult;
  comparison: SimulatorComparisonResult;
}

export interface SimulatorApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function isSimulatorRunResponse(value: unknown): value is SimulatorRunResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.sourceUrl) &&
    isNonEmptyString(value.generatedAt) &&
    Array.isArray(value.attempted) &&
    value.attempted.every(isSimulatorApiAttempt)
  );
}

export function isSimulatorMatchResponse(value: unknown): value is SimulatorMatchResponse {
  if (!isRecord(value) || !isRecord(value.analysis) || !isRecord(value.comparison)) {
    return false;
  }

  const comparison = value.comparison;
  return (
    isNonEmptyString(comparison.runId) &&
    isNonNegativeNumber(comparison.attemptedCount) &&
    isNonNegativeNumber(comparison.observedCount) &&
    isRecord(comparison.signals) &&
    isNonNegativeNumber(comparison.signals.parsedLines) &&
    typeof comparison.signals.hasUserAgent === "boolean" &&
    typeof comparison.signals.hasRunMarker === "boolean" &&
    Array.isArray(comparison.warnings) &&
    comparison.warnings.every((warning) => typeof warning === "string") &&
    Array.isArray(comparison.attempts) &&
    comparison.attempts.every(isAttemptComparison)
  );
}

export function isSimulatorApiAttempt(value: unknown): value is SimulatorApiAttempt {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.method) &&
    isNonEmptyString(value.path) &&
    isNonEmptyString(value.userAgent) &&
    isOptionalString(value.url) &&
    isOptionalString(value.ruleId) &&
    isOptionalString(value.operator) &&
    isOptionalString(value.bot)
  );
}

export function isSimulatorApiErrorResponse(value: unknown): value is SimulatorApiErrorResponse {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    isNonEmptyString(value.error.code) &&
    isNonEmptyString(value.error.message)
  );
}

function isAttemptComparison(value: unknown): value is SimulatorAttemptComparison {
  return (
    isRecord(value) &&
    isNonEmptyString(value.attemptId) &&
    typeof value.matched === "boolean" &&
    Array.isArray(value.matches) &&
    value.matches.every(isObservedLogEntry)
  );
}

function isObservedLogEntry(value: unknown): value is SimulatorObservedLogEntry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.path) &&
    isOptionalString(value.userAgent) &&
    (value.status === undefined || isNonNegativeNumber(value.status)) &&
    isOptionalString(value.timestamp)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
