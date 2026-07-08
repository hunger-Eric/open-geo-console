import {
  analyzeLogs,
  parseLogs,
  type LogAnalysisResult,
  type NormalizedLogEntry
} from "@open-geo-console/log-parser";
import * as simulatorEngine from "@/simulator";

export interface SimulatorRunRequest {
  sourceUrl?: string;
  url?: string;
  [key: string]: unknown;
}

export interface SimulatorRunResponse {
  runId: string;
  sourceUrl: string;
  generatedAt: string;
  attempted: unknown[];
  synthetic: boolean;
}

export interface MatchLogsRequest {
  runId?: string;
  attempted?: unknown;
  logInput?: string;
}

export interface AttemptedEntry {
  id: string;
  method: string;
  path?: string;
  url?: string;
  userAgent?: string;
  marker?: string;
  operator?: string;
  bot?: string;
}

export interface ObservedMatch {
  attemptId: string;
  method: string;
  path: string;
  status: number;
  timestamp: string;
  userAgent?: string;
  matchReasons: string[];
}

export interface MissingAttempt {
  attemptId: string;
  method: string;
  path?: string;
  userAgent?: string;
  reasons: string[];
}

export interface LogComparisonResult {
  runId: string;
  attemptedCount: number;
  observedMatchCount: number;
  signals: {
    parsedLines: number;
    hasUserAgent: boolean;
    hasRunMarker: boolean;
  };
  warnings: string[];
  observedMatches: ObservedMatch[];
  missingAttempted: MissingAttempt[];
}

type SimulatorModule = Record<string, unknown>;
type SimulatorRunFunction = (input: SimulatorRunRequest) => Promise<unknown> | unknown;
type SimulatorMatchFunction = (...args: unknown[]) => Promise<unknown> | unknown;

const runExportCandidates = [
  "runExternalCrawlerSimulation",
  "runExternalAiCrawlerSimulator",
  "runExternalCrawlerSimulator",
  "runSimulator",
  "simulateCrawlerRun",
  "simulateExternalAiCrawlers",
  "createSimulatorRun"
];

const matchExportCandidates = [
  "compareSimulatorRunWithLogEntries",
  "matchSimulatorRunLogs",
  "matchSimulatorLogs",
  "compareSimulatorRunToLogs",
  "compareSimulatorRunWithLogs",
  "compareAttemptedToObservedLogs"
];

export class SimulatorInputError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export class SimulatorEngineUnavailableError extends Error {
  public readonly code = "simulator_engine_unavailable";
}

export async function runSimulator(input: SimulatorRunRequest): Promise<SimulatorRunResponse> {
  const sourceUrl = normalizeSourceUrl(input.sourceUrl ?? input.url);
  const simulatorModule = simulatorEngine as SimulatorModule;
  const run = pickFunction<SimulatorRunFunction>(simulatorModule, runExportCandidates);

  if (!run) {
    throw new SimulatorEngineUnavailableError(
      `Simulator engine must export one of: ${runExportCandidates.join(", ")}.`
    );
  }

  const rawResult = await run({ ...input, sourceUrl });
  return normalizeRunResponse(rawResult, sourceUrl);
}

export async function maybeRunSimulatorMatcher(input: {
  runId: string;
  attempted: AttemptedEntry[];
  logInput: string;
  analysis: LogAnalysisResult;
  entries: NormalizedLogEntry[];
}): Promise<unknown | undefined> {
  const simulatorModule = simulatorEngine as SimulatorModule;
  const match = pickNamedFunction<SimulatorMatchFunction>(simulatorModule, matchExportCandidates);
  if (!match) {
    return undefined;
  }

  if (match.name === "compareSimulatorRunWithLogEntries") {
    return await match.fn(
      { runId: input.runId, attempted: input.attempted },
      input.entries.map((entry) => ({
        path: entry.path,
        userAgent: entry.userAgent,
        status: entry.status,
        timestamp: entry.timestamp
      }))
    );
  }

  return await match.fn(input);
}

export function analyzeSimulatorLogs(input: MatchLogsRequest): {
  analysis: LogAnalysisResult;
  attempted: AttemptedEntry[];
  entries: NormalizedLogEntry[];
  comparison: LogComparisonResult;
} {
  if (!input.runId || input.runId.trim() === "") {
    throw new SimulatorInputError("missing_run_id", "runId is required.");
  }
  if (typeof input.logInput !== "string") {
    throw new SimulatorInputError("missing_log_input", "logInput is required.");
  }

  const attempted = normalizeAttempted(input.attempted);
  const entries = parseLogs(input.logInput);
  const analysis = analyzeLogs(input.logInput);
  const comparison = buildLogComparison(input.runId, attempted, entries, analysis);

  return { analysis, attempted, entries, comparison };
}

export function buildLogComparison(
  runId: string,
  attempted: AttemptedEntry[],
  entries: NormalizedLogEntry[],
  analysis: LogAnalysisResult
): LogComparisonResult {
  const observedMatches: ObservedMatch[] = [];
  const matchedAttemptIds = new Set<string>();
  const hasUserAgent = entries.some((entry) => Boolean(entry.userAgent));
  const hasRunMarker = entries.some((entry) => entryHasRunMarker(entry, runId));

  for (const attempt of attempted) {
    const matches = entries
      .map((entry) => matchAttemptToEntry(attempt, entry, runId))
      .filter((match): match is ObservedMatch => match !== null);

    if (matches.length > 0) {
      matchedAttemptIds.add(attempt.id);
      observedMatches.push(...matches);
    }
  }

  const warnings: string[] = [];
  if (entries.length === 0 && analysis.totalLines > 0) {
    warnings.push("no_parseable_log_entries");
  }
  if (!hasUserAgent && entries.length > 0) {
    warnings.push("missing_user_agent");
  }
  if (!hasRunMarker && entries.length > 0) {
    warnings.push("missing_ogc_run_marker");
  }

  return {
    runId,
    attemptedCount: attempted.length,
    observedMatchCount: observedMatches.length,
    signals: {
      parsedLines: entries.length,
      hasUserAgent,
      hasRunMarker
    },
    warnings,
    observedMatches,
    missingAttempted: attempted
      .filter((attempt) => !matchedAttemptIds.has(attempt.id))
      .map((attempt) => ({
        attemptId: attempt.id,
        method: attempt.method,
        path: attempt.path,
        userAgent: attempt.userAgent,
        reasons: missingReasons(attempt, hasUserAgent, hasRunMarker)
      }))
  };
}

export function normalizeAttempted(value: unknown): AttemptedEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => normalizeAttempt(entry, index))
    .filter((entry): entry is AttemptedEntry => entry !== null);
}

export function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

function normalizeSourceUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SimulatorInputError("missing_source_url", "sourceUrl is required.");
  }

  const url = new URL(value.startsWith("http") ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SimulatorInputError("unsupported_source_url", "sourceUrl must use HTTP or HTTPS.");
  }
  url.hash = "";
  return url.href;
}

function pickFunction<TFunction>(
  module: SimulatorModule,
  candidates: string[]
): TFunction | undefined {
  return pickNamedFunction<TFunction>(module, candidates)?.fn;
}

function pickNamedFunction<TFunction>(
  module: SimulatorModule,
  candidates: string[]
): { name: string; fn: TFunction } | undefined {
  for (const candidate of candidates) {
    if (typeof module[candidate] === "function") {
      return { name: candidate, fn: module[candidate] as TFunction };
    }
  }
  if (typeof module.default === "function") {
    return { name: "default", fn: module.default as TFunction };
  }
  return undefined;
}

function normalizeRunResponse(rawResult: unknown, sourceUrl: string): SimulatorRunResponse {
  const result = isRecord(rawResult) ? rawResult : {};
  const attempted = Array.isArray(result.attempted) ? result.attempted : [];

  return {
    runId: stringValue(result.runId) ?? crypto.randomUUID(),
    sourceUrl: stringValue(result.sourceUrl) ?? sourceUrl,
    generatedAt: stringValue(result.generatedAt) ?? new Date().toISOString(),
    attempted,
    synthetic: booleanValue(result.synthetic) ?? booleanValue(result.simulated) ?? true
  };
}

function normalizeAttempt(value: unknown, index: number): AttemptedEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const url = stringValue(value.url);
  const path = stringValue(value.path) ?? pathFromUrl(url);
  const userAgent = stringValue(value.userAgent) ?? stringValue(value.user_agent);
  const method = (stringValue(value.method) ?? "GET").toUpperCase();
  const id =
    stringValue(value.id) ??
    stringValue(value.requestId) ??
    stringValue(value.attemptId) ??
    `${method}:${path ?? url ?? "request"}:${userAgent ?? "no-user-agent"}:${index}`;

  return {
    id,
    method,
    path,
    url,
    userAgent,
    marker:
      stringValue(value.marker) ??
      stringValue(value.runMarker) ??
      stringValue(value.ogcRun) ??
      stringValue(value.ogc_run),
    operator: stringValue(value.operator),
    bot: stringValue(value.bot)
  };
}

function matchAttemptToEntry(
  attempt: AttemptedEntry,
  entry: NormalizedLogEntry,
  runId: string
): ObservedMatch | null {
  const reasons: string[] = [];

  if (entryHasRunMarker(entry, runId)) {
    reasons.push("ogc_run");
  }
  if (attempt.path && pathsEquivalent(attempt.path, entry.path)) {
    reasons.push("path");
  }
  if (attempt.userAgent && entry.userAgent === attempt.userAgent) {
    reasons.push("user_agent");
  }
  if (attempt.method === entry.method.toUpperCase()) {
    reasons.push("method");
  }

  const hasObservedAttemptMatch =
    reasons.includes("ogc_run") && reasons.includes("path") && reasons.includes("user_agent");
  if (!hasObservedAttemptMatch) {
    return null;
  }

  return {
    attemptId: attempt.id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    timestamp: entry.timestamp,
    userAgent: entry.userAgent,
    matchReasons: reasons
  };
}

function missingReasons(
  attempt: AttemptedEntry,
  hasUserAgent: boolean,
  hasRunMarker: boolean
): string[] {
  const reasons: string[] = [];
  if (!hasRunMarker) {
    reasons.push("no_ogc_run_marker_observed");
  }
  if (attempt.userAgent && !hasUserAgent) {
    reasons.push("no_user_agent_observed");
  }
  if (reasons.length === 0) {
    reasons.push("no_matching_observed_log_entry");
  }
  return reasons;
}

function entryHasRunMarker(entry: NormalizedLogEntry, runId: string): boolean {
  return (
    queryValue(entry.path, "ogc_run") === runId ||
    queryValue(entry.path, "ogc_run_id") === runId ||
    entry.path.includes(`ogc_run=${encodeURIComponent(runId)}`) ||
    entry.path.includes(`ogc_run=${runId}`)
  );
}

function pathsEquivalent(left: string, right: string): boolean {
  return stripQuery(left) === stripQuery(right);
}

function stripQuery(path: string): string {
  return path.split("?")[0] ?? path;
}

function pathFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).pathname;
  } catch {
    return value.startsWith("/") ? value : undefined;
  }
}

function queryValue(path: string, key: string): string | null {
  try {
    const url = new URL(path, "https://open-geo-console.local");
    return url.searchParams.get(key);
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
