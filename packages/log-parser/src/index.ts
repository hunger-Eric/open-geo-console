import { type CrawlerMatch, matchUserAgent } from "@open-geo-console/crawler-rules";

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

export interface LogAnalysisResult {
  totalLines: number;
  parsedLines: number;
  aiCrawlerHits: number;
  missingUserAgent: boolean;
  warning?: string;
  visits: AiCrawlerVisit[];
  aggregates: CrawlerAggregate[];
}

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
      new Date().toISOString();

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
  const totalLines = input.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  const entries = parseLogs(input);
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
    aggregates: aggregateVisits(visits)
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

function parseNginxDate(value: string): string {
  const parsed = Date.parse(value.replace(" ", "T"));
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? new Date().toISOString() : new Date(fallback).toISOString();
}

function normalizeDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
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
