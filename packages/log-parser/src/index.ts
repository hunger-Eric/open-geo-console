import {
  aiBotRegistry,
  type AiCrawlerOperator,
  type CrawlerDetectability,
  type CrawlerIntent,
  type CrawlerMatch,
  type CrawlerRule,
  matchUserAgent
} from "@open-geo-console/crawler-rules";

export interface NormalizedLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  userAgent?: string;
  source: "nginx" | "cloudflare";
}

export interface AiCrawlerVisit extends NormalizedLogEntry {
  match: CrawlerMatch;
}

export interface CrawlerAggregate {
  operator: string;
  bot: string;
  path: string;
  status: number;
  date: string;
  hits: number;
}

export type BotCoverageStatus =
  | "detected"
  | "not_seen"
  | "not_log_detectable"
  | "unknown_or_unverified";

export interface BotCoverageRow {
  ruleId: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: CrawlerDetectability;
  status: BotCoverageStatus;
  hits: number;
  paths: string[];
  latestDate?: string;
  robotsToken?: string;
  docsUrl?: string;
  notes?: string;
}

export interface OperatorSummary {
  operator: AiCrawlerOperator;
  detectedBots: string[];
  totalHits: number;
  paths: string[];
  latestDate?: string;
}

export type PolicyHintType =
  | "logging-user-agent"
  | "robots-token-control"
  | "suspected-verification";

export interface PolicyHint {
  type: PolicyHintType;
  ruleId?: string;
  operator?: AiCrawlerOperator;
  bot?: string;
  intent?: CrawlerIntent;
  detectability?: CrawlerDetectability;
  robotsToken?: string;
  docsUrl?: string;
}

export interface LogAnalysisResult {
  totalLines: number;
  parsedLines: number;
  aiCrawlerHits: number;
  missingUserAgent: boolean;
  warning?: string;
  visits: AiCrawlerVisit[];
  aggregates: CrawlerAggregate[];
  botCoverage: BotCoverageRow[];
  operatorSummary: OperatorSummary[];
  policyHints: PolicyHint[];
}

export interface BotEvidenceSummaryBot {
  ruleId: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: CrawlerDetectability;
  hits: number;
  latestDate?: string;
}

export interface BotEvidenceSummaryOperator {
  operator: AiCrawlerOperator;
  detectedBots: string[];
  totalHits: number;
  latestDate?: string;
}

export interface BotEvidenceSummary {
  analysisVersion: 1;
  analyzedAt: string;
  totalLines: number;
  parsedLines: number;
  aiCrawlerHits: number;
  missingUserAgent: boolean;
  registryRuleCount: number;
  detectedBotCount: number;
  operators: BotEvidenceSummaryOperator[];
  bots: BotEvidenceSummaryBot[];
}

const UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const NGINX_COMBINED =
  /^(?<ip>\S+) \S+ \S+ \[(?<time>[^\]]+)] "(?<method>[A-Z]+) (?<path>\S+)(?: [^"]+)?" (?<status>\d{3}) \S+ "(?<referer>[^"]*)" "(?<userAgent>[^"]*)"$/;

export function parseNginxCombinedLine(line: string): NormalizedLogEntry | null {
  const match = NGINX_COMBINED.exec(line.trim());
  if (!match?.groups) {
    return null;
  }

  return {
    timestamp: parseNginxDate(match.groups.time),
    method: match.groups.method,
    path: match.groups.path,
    status: Number(match.groups.status),
    userAgent: normalizeUserAgent(match.groups.userAgent),
    source: "nginx"
  };
}

export function parseCloudflareJsonLine(line: string): NormalizedLogEntry | null {
  try {
    const data = JSON.parse(line) as Record<string, unknown>;
    const path = stringField(data, ["ClientRequestPath", "Path", "path", "requestPath"]);
    const userAgent = stringField(data, ["ClientRequestUserAgent", "UserAgent", "userAgent"]);
    const status = numberField(data, ["EdgeResponseStatus", "OriginResponseStatus", "status"]);
    const method = stringField(data, ["ClientRequestMethod", "Method", "method"]) ?? "GET";
    const timestamp =
      stringField(data, ["EdgeStartTimestamp", "Datetime", "timestamp", "date"]) ??
      UNKNOWN_TIMESTAMP;

    if (!path || typeof status !== "number") {
      return null;
    }

    return {
      timestamp: normalizeDate(timestamp),
      method,
      path,
      status,
      userAgent: normalizeUserAgent(userAgent),
      source: "cloudflare"
    };
  } catch {
    return null;
  }
}

export function parseLogs(input: string): NormalizedLogEntry[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCloudflareJsonLine(line) ?? parseNginxCombinedLine(line))
    .filter((entry): entry is NormalizedLogEntry => entry !== null);
}

export function analyzeLogs(input: string): LogAnalysisResult {
  const entries = parseLogs(input);
  return analyzeParsedLogs(input, entries);
}

export function buildBotEvidenceSummary(
  result: LogAnalysisResult,
  analyzedAt = new Date().toISOString()
): BotEvidenceSummary {
  const bots = result.botCoverage
    .filter((row) => row.status === "detected")
    .map((row) => ({
      ruleId: row.ruleId,
      operator: row.operator,
      bot: row.bot,
      intent: row.intent,
      detectability: row.detectability,
      hits: row.hits,
      latestDate: row.latestDate
    }));

  return {
    analysisVersion: 1,
    analyzedAt,
    totalLines: result.totalLines,
    parsedLines: result.parsedLines,
    aiCrawlerHits: result.aiCrawlerHits,
    missingUserAgent: result.missingUserAgent,
    registryRuleCount: result.botCoverage.length,
    detectedBotCount: bots.length,
    operators: result.operatorSummary.map((summary) => ({
      operator: summary.operator,
      detectedBots: [...summary.detectedBots],
      totalHits: summary.totalHits,
      latestDate: summary.latestDate
    })),
    bots
  };
}

export function analyzeParsedLogs(
  input: string,
  entries: NormalizedLogEntry[]
): LogAnalysisResult {
  const totalLines = input.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  const missingUserAgent = entries.length > 0 && entries.every((entry) => !entry.userAgent);
  const visits = entries.flatMap((entry) => {
    const match = matchUserAgent(entry.userAgent);
    return match ? [{ ...entry, match }] : [];
  });

  return {
    totalLines,
    parsedLines: entries.length,
    aiCrawlerHits: visits.length,
    missingUserAgent,
    warning: missingUserAgent
      ? "This log does not include User-Agent values, so historical AI crawler access cannot be reconstructed. Enable User-Agent logging before collecting future evidence."
      : undefined,
    visits,
    aggregates: aggregateVisits(visits),
    botCoverage: buildBotCoverage(visits),
    operatorSummary: buildOperatorSummary(visits),
    policyHints: buildPolicyHints(missingUserAgent)
  };
}

export function aggregateVisits(visits: AiCrawlerVisit[]): CrawlerAggregate[] {
  const buckets = new Map<string, CrawlerAggregate>();

  for (const visit of visits) {
    const date = visit.timestamp.slice(0, 10);
    const key = [
      visit.match.operator,
      visit.match.bot,
      visit.path,
      visit.status,
      date
    ].join("|");
    const current = buckets.get(key);
    if (current) {
      current.hits += 1;
    } else {
      buckets.set(key, {
        operator: visit.match.operator,
        bot: visit.match.bot,
        path: visit.path,
        status: visit.status,
        date,
        hits: 1
      });
    }
  }

  return [...buckets.values()].sort(
    (left, right) => right.hits - left.hits || left.operator.localeCompare(right.operator)
  );
}

export const recommendedNginxLogFormat = `log_format geo_console '$remote_addr - $remote_user [$time_local] "$request" '
  '$status $body_bytes_sent "$http_referer" "$http_user_agent"';`;

function buildBotCoverage(visits: AiCrawlerVisit[]): BotCoverageRow[] {
  const visitsByRule = new Map<string, AiCrawlerVisit[]>();
  for (const visit of visits) {
    const visitsForRule = visitsByRule.get(visit.match.ruleId) ?? [];
    visitsForRule.push(visit);
    visitsByRule.set(visit.match.ruleId, visitsForRule);
  }

  return aiBotRegistry.map((rule) => {
    const ruleVisits = visitsByRule.get(rule.id) ?? [];
    return {
      ruleId: rule.id,
      operator: rule.operator,
      bot: rule.bot,
      intent: rule.intent,
      detectability: rule.detectability,
      status: coverageStatus(rule, ruleVisits.length),
      hits: ruleVisits.length,
      paths: uniqueSorted(ruleVisits.map((visit) => visit.path)),
      latestDate: latestDate(ruleVisits),
      robotsToken: rule.robotsToken,
      docsUrl: rule.docsUrl,
      notes: rule.notes
    };
  });
}

function coverageStatus(rule: CrawlerRule, hits: number): BotCoverageStatus {
  if (rule.detectability === "robots-token-only") {
    return "not_log_detectable";
  }
  if (hits > 0) {
    return "detected";
  }
  if (rule.detectability === "suspected-or-community") {
    return "unknown_or_unverified";
  }
  return "not_seen";
}

function buildOperatorSummary(visits: AiCrawlerVisit[]): OperatorSummary[] {
  const summaries = new Map<AiCrawlerOperator, OperatorSummary>();

  for (const visit of visits) {
    const current =
      summaries.get(visit.match.operator) ??
      ({
        operator: visit.match.operator,
        detectedBots: [],
        totalHits: 0,
        paths: []
      } satisfies OperatorSummary);

    current.totalHits += 1;
    current.detectedBots = uniqueSorted([...current.detectedBots, visit.match.bot]);
    current.paths = uniqueSorted([...current.paths, visit.path]);
    current.latestDate = maxDate(current.latestDate, visit.timestamp);

    summaries.set(visit.match.operator, current);
  }

  return [...summaries.values()].sort(
    (left, right) => right.totalHits - left.totalHits || left.operator.localeCompare(right.operator)
  );
}

function buildPolicyHints(missingUserAgent: boolean): PolicyHint[] {
  const hints: PolicyHint[] = [];

  if (missingUserAgent) {
    hints.push({ type: "logging-user-agent" });
  }

  for (const rule of aiBotRegistry) {
    if (rule.detectability === "robots-token-only") {
      hints.push(rulePolicyHint(rule, "robots-token-control"));
    } else if (rule.detectability === "suspected-or-community") {
      hints.push(rulePolicyHint(rule, "suspected-verification"));
    }
  }

  return hints;
}

function rulePolicyHint(rule: CrawlerRule, type: PolicyHintType): PolicyHint {
  return {
    type,
    ruleId: rule.id,
    operator: rule.operator,
    bot: rule.bot,
    intent: rule.intent,
    detectability: rule.detectability,
    robotsToken: rule.robotsToken,
    docsUrl: rule.docsUrl
  };
}

function parseNginxDate(value: string): string {
  const match = value.match(
    /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/
  );
  if (match) {
    const [, day, monthName, year, hour, minute, second, sign, offsetHour, offsetMinute] =
      match;
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      monthName.toLowerCase()
    );
    if (month !== -1) {
      const localTime = Date.UTC(
        Number(year),
        month,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
      const offset = (Number(offsetHour) * 60 + Number(offsetMinute)) * (sign === "+" ? 1 : -1);
      return new Date(localTime - offset * 60_000).toISOString();
    }
  }

  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? UNKNOWN_TIMESTAMP : new Date(fallback).toISOString();
}

function normalizeDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? UNKNOWN_TIMESTAMP : new Date(parsed).toISOString();
}

function normalizeUserAgent(value: string | null | undefined): string | undefined {
  if (!value || value === "-") {
    return undefined;
  }
  return value;
}

function stringField(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function numberField(data: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function latestDate(visits: AiCrawlerVisit[]): string | undefined {
  return visits.map((visit) => visit.timestamp).reduce(maxDate, undefined);
}

function maxDate(left: string | undefined, right: string): string {
  if (!left || right > left) {
    return right;
  }
  return left;
}
