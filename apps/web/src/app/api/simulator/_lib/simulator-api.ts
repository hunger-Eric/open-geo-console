import {
  analyzeParsedLogs,
  parseLogs,
  type NormalizedLogEntry
} from "@open-geo-console/log-parser";
import {
  compareSimulatorAttemptsWithLogEntries,
  runExternalCrawlerSimulation,
  type SimulatorAttempt
} from "@/simulator";
import {
  isSimulatorApiAttempt,
  type SimulatorApiAttempt,
  type SimulatorComparisonResult,
  type SimulatorMatchRequest,
  type SimulatorMatchResponse,
  type SimulatorRunRequest,
  type SimulatorRunResponse
} from "@/simulator/contracts";

export class SimulatorInputError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SimulatorInputError("invalid_json", "Request body must be valid JSON.");
  }
}

export async function runSimulator(input: unknown): Promise<SimulatorRunResponse> {
  const request = parseRunRequest(input);
  const result = await runExternalCrawlerSimulation({ sourceUrl: request.sourceUrl });

  return {
    runId: result.runId,
    sourceUrl: result.sourceUrl,
    generatedAt: result.generatedAt,
    attempted: result.attempted.map(toApiAttempt)
  };
}

export function analyzeSimulatorLogs(input: unknown): SimulatorMatchResponse {
  const request = parseMatchRequest(input);
  const entries = parseLogs(request.logInput);
  const analysis = analyzeParsedLogs(request.logInput, entries);

  return {
    analysis,
    comparison: buildLogComparison(request, entries, analysis.totalLines)
  };
}

export function buildLogComparison(
  request: SimulatorMatchRequest,
  entries: NormalizedLogEntry[],
  totalLines: number
): SimulatorComparisonResult {
  const attempts = compareSimulatorAttemptsWithLogEntries(request.runId, request.attempted, entries);
  const hasUserAgent = entries.some((entry) => Boolean(entry.userAgent));
  const hasRunMarker = entries.some((entry) => hasRunMarkerFor(entry.path, request.runId));
  const warnings: string[] = [];

  if (entries.length === 0 && totalLines > 0) {
    warnings.push("no_parseable_log_entries");
  }
  if (!hasUserAgent && entries.length > 0) {
    warnings.push("missing_user_agent");
  }
  if (!hasRunMarker && entries.length > 0) {
    warnings.push("missing_ogc_run_marker");
  }

  return {
    runId: request.runId,
    attemptedCount: attempts.length,
    observedCount: attempts.filter((attempt) => attempt.matched).length,
    signals: {
      parsedLines: entries.length,
      hasUserAgent,
      hasRunMarker
    },
    warnings,
    attempts: attempts.map(({ attempt, matched, matches }) => ({
      attemptId: attempt.id,
      matched,
      matches
    }))
  };
}

export function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

function parseRunRequest(value: unknown): SimulatorRunRequest {
  if (!isRecord(value) || typeof value.sourceUrl !== "string" || value.sourceUrl.trim() === "") {
    throw new SimulatorInputError("missing_source_url", "sourceUrl is required.");
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(value.sourceUrl);
  } catch {
    throw new SimulatorInputError("invalid_source_url", "sourceUrl must be a valid URL.");
  }
  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    throw new SimulatorInputError("unsupported_source_url", "sourceUrl must use HTTP or HTTPS.");
  }
  sourceUrl.hash = "";
  return { sourceUrl: sourceUrl.href };
}

function parseMatchRequest(value: unknown): SimulatorMatchRequest {
  if (!isRecord(value) || typeof value.runId !== "string" || value.runId.trim() === "") {
    throw new SimulatorInputError("missing_run_id", "runId is required.");
  }
  if (typeof value.logInput !== "string") {
    throw new SimulatorInputError("missing_log_input", "logInput is required.");
  }
  if (!Array.isArray(value.attempted)) {
    throw new SimulatorInputError("invalid_attempted", "attempted must be an array.");
  }
  if (!value.attempted.every(isSimulatorApiAttempt)) {
    throw new SimulatorInputError(
      "invalid_attempted_entry",
      "Every attempted entry must include id, method, path, and userAgent."
    );
  }

  return {
    runId: value.runId,
    attempted: value.attempted,
    logInput: value.logInput
  };
}

function toApiAttempt(attempt: SimulatorAttempt, index: number): SimulatorApiAttempt {
  return {
    id: `${attempt.ruleId}:${attempt.path}:${index}`,
    method: "GET",
    path: attempt.path,
    url: attempt.url,
    userAgent: attempt.userAgent,
    ruleId: attempt.ruleId,
    operator: attempt.operator,
    bot: attempt.bot
  };
}

function hasRunMarkerFor(path: string, runId: string): boolean {
  try {
    return new URL(path, "https://open-geo-console.local").searchParams.get("ogc_run") === runId;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
