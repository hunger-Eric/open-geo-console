import {
  logDetectableCrawlerRules,
  type AiCrawlerOperator,
  type CrawlerDetectability,
  type CrawlerIntent,
  type CrawlerRule
} from "@open-geo-console/crawler-rules";

export const DEFAULT_SIMULATOR_TARGET = "https://company.com";
export const DEFAULT_SIMULATOR_MAX_PATHS = 8;
export const DEFAULT_SIMULATOR_MAX_REQUESTS = 24;
export const DEFAULT_SIMULATOR_REQUEST_TIMEOUT_MS = 10_000;

const RUN_MARKER_PARAM = "ogc_run";
const DEFAULT_BOT_RULE_IDS = [
  "openai-gptbot",
  "openai-oai-searchbot",
  "openai-chatgpt-user",
  "anthropic-claudebot",
  "anthropic-claude-searchbot",
  "perplexity-perplexitybot",
  "google-googlebot",
  "microsoft-bingbot",
  "meta-external-agent",
  "bytedance-bytespider",
  "amazon-amazonbot",
  "apple-applebot",
  "common-crawl-ccbot"
] as const;

const DISCOVERY_PATHS = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;
const BRAND_FACTS_PATH = "/.well-known/brand-facts.json";
type HttpCrawlerDetectability = Exclude<CrawlerDetectability, "robots-token-only">;

export interface SimulatorBotProfile {
  ruleId: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: HttpCrawlerDetectability;
  userAgent: string;
}

export interface SimulatorResourceFetch {
  path: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface SimulatorDiscovery {
  resources: SimulatorResourceFetch[];
  discoveredPaths: string[];
  selectedPaths: string[];
}

export interface SimulatorAttempt {
  ruleId: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: HttpCrawlerDetectability;
  path: string;
  requestPath: string;
  url: string;
  status?: number;
  ok: boolean;
  userAgent: string;
  runMarker: string;
  error?: string;
}

export interface SimulatorRunResult {
  runId: string;
  sourceUrl: string;
  generatedAt: string;
  discovery: SimulatorDiscovery;
  attempted: SimulatorAttempt[];
}

export interface SimulatorRunOptions {
  sourceUrl?: string | URL;
  runId?: string;
  generatedAt?: string | Date;
  maxPaths?: number;
  maxRequests?: number;
  requestTimeoutMs?: number;
  botRuleIds?: readonly string[];
  fetchImpl?: typeof fetch;
}

export interface SimulatorComparableLogEntry {
  path: string;
  userAgent?: string;
  status?: number;
  timestamp?: string;
}

export interface SimulatorComparableAttempt {
  id: string;
  path: string;
  userAgent: string;
}

export interface SimulatorComparableAttemptResult<
  TAttempt extends SimulatorComparableAttempt = SimulatorComparableAttempt
> {
  attempt: TAttempt;
  matched: boolean;
  matches: SimulatorComparableLogEntry[];
}

export interface SimulatorLogComparison {
  attempt: SimulatorAttempt;
  matched: boolean;
  matches: SimulatorComparableLogEntry[];
}

export async function runExternalCrawlerSimulation(
  options: SimulatorRunOptions = {}
): Promise<SimulatorRunResult> {
  const sourceUrl = normalizeSourceUrl(options.sourceUrl ?? DEFAULT_SIMULATOR_TARGET);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Simulator requires a fetch implementation.");
  }

  const runId = options.runId ?? createRunId();
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  const maxPaths = positiveInteger(options.maxPaths, DEFAULT_SIMULATOR_MAX_PATHS);
  const maxRequests = positiveInteger(options.maxRequests, DEFAULT_SIMULATOR_MAX_REQUESTS);
  const requestTimeoutMs = positiveInteger(
    options.requestTimeoutMs,
    DEFAULT_SIMULATOR_REQUEST_TIMEOUT_MS
  );
  const botProfiles = selectSimulatorBotProfiles(options.botRuleIds);

  const discovery = await discoverSimulationPaths(sourceUrl, fetchImpl, maxPaths, requestTimeoutMs);
  const requestPlan = buildRequestPlan(discovery.selectedPaths, botProfiles, maxRequests);
  const attempted: SimulatorAttempt[] = [];

  for (const request of requestPlan) {
    attempted.push(
      await requestAsBot(
        sourceUrl,
        request.path,
        request.profile,
        runId,
        fetchImpl,
        requestTimeoutMs
      )
    );
  }

  return {
    runId,
    sourceUrl: sourceUrl.origin,
    generatedAt,
    discovery,
    attempted
  };
}

export function selectSimulatorBotProfiles(
  botRuleIds: readonly string[] = DEFAULT_BOT_RULE_IDS
): SimulatorBotProfile[] {
  const ruleById = new Map(logDetectableCrawlerRules.map((rule) => [rule.id, rule]));
  const selectedRules = botRuleIds
    .map((ruleId) => ruleById.get(ruleId))
    .filter((rule): rule is CrawlerRule => Boolean(rule))
    .filter(isHttpCrawlerRule);

  return selectedRules.map((rule) => ({
    ruleId: rule.id,
    operator: rule.operator,
    bot: rule.bot,
    intent: rule.intent,
    detectability: rule.detectability,
    userAgent: userAgentForRule(rule)
  }));
}

export function compareSimulatorRunWithLogEntries(
  run: Pick<SimulatorRunResult, "attempted" | "runId">,
  entries: SimulatorComparableLogEntry[]
): SimulatorLogComparison[] {
  return compareSimulatorAttemptsWithLogEntries(
    run.runId,
    run.attempted.map((attempt, index) => ({
      ...attempt,
      id: `${attempt.ruleId}:${attempt.path}:${index}`
    })),
    entries
  ).map(({ attempt, matched, matches }) => {
    const simulatorAttempt: SimulatorAttempt = {
      ruleId: attempt.ruleId,
      operator: attempt.operator,
      bot: attempt.bot,
      intent: attempt.intent,
      detectability: attempt.detectability,
      path: attempt.path,
      requestPath: attempt.requestPath,
      url: attempt.url,
      status: attempt.status,
      ok: attempt.ok,
      userAgent: attempt.userAgent,
      runMarker: attempt.runMarker,
      error: attempt.error
    };
    return { attempt: simulatorAttempt, matched, matches };
  });
}

export function compareSimulatorAttemptsWithLogEntries<TAttempt extends SimulatorComparableAttempt>(
  runId: string,
  attempts: TAttempt[],
  entries: SimulatorComparableLogEntry[]
): SimulatorComparableAttemptResult<TAttempt>[] {
  return attempts.map((attempt) => {
    const matches = entries.filter((entry) => {
      const parsedPath = parseLogPath(entry.path);
      return (
        parsedPath.searchParams.get(RUN_MARKER_PARAM) === runId &&
        parsedPath.pathname === attempt.path &&
        entry.userAgent === attempt.userAgent
      );
    });

    return {
      attempt,
      matched: matches.length > 0,
      matches
    };
  });
}

async function discoverSimulationPaths(
  sourceUrl: URL,
  fetchImpl: typeof fetch,
  maxPaths: number,
  requestTimeoutMs: number
): Promise<SimulatorDiscovery> {
  const resources: SimulatorResourceFetch[] = [];
  const discoveredPathCandidates: string[] = [];

  const fetchedDiscovery = new Map<string, string | undefined>();
  for (const path of DISCOVERY_PATHS) {
    const resource = await fetchTextResource(sourceUrl, path, fetchImpl, requestTimeoutMs);
    resources.push(resource.fetch);
    fetchedDiscovery.set(path, resource.text);
    discoveredPathCandidates.push(...extractPathsFromText(resource.text, sourceUrl));
  }

  const robotsSitemaps = extractSitemapUrls(fetchedDiscovery.get("/robots.txt"), sourceUrl);
  for (const sitemapUrl of robotsSitemaps.slice(0, 2)) {
    const path = sameOriginPath(sitemapUrl, sourceUrl);
    if (!path || fetchedDiscovery.has(path)) {
      continue;
    }
    const resource = await fetchTextResource(sourceUrl, path, fetchImpl, requestTimeoutMs);
    resources.push(resource.fetch);
    fetchedDiscovery.set(path, resource.text);
    discoveredPathCandidates.push(...extractPathsFromText(resource.text, sourceUrl));
  }

  const brandFacts = await fetchStatusResource(
    sourceUrl,
    BRAND_FACTS_PATH,
    fetchImpl,
    requestTimeoutMs
  );
  resources.push(brandFacts);

  const discoveredPaths = uniquePaths(discoveredPathCandidates);
  const selectedPaths = selectSimulationPaths({
    discoveredPaths,
    presentResourcePaths: presentResourcePaths(resources),
    maxPaths
  });

  return {
    resources,
    discoveredPaths,
    selectedPaths
  };
}

function selectSimulationPaths({
  discoveredPaths,
  presentResourcePaths,
  maxPaths
}: {
  discoveredPaths: string[];
  presentResourcePaths: Set<string>;
  maxPaths: number;
}): string[] {
  const selected: string[] = ["/"];
  const projectArticlePaths = discoveredPaths.filter(isProjectOrArticlePath);
  selected.push(...projectArticlePaths);

  for (const resourcePath of ["/llms.txt", "/sitemap.xml", BRAND_FACTS_PATH]) {
    if (presentResourcePaths.has(resourcePath)) {
      selected.push(resourcePath);
    }
  }

  selected.push(...discoveredPaths.filter((path) => !isProjectOrArticlePath(path)));

  return uniquePaths(selected).slice(0, maxPaths);
}

function buildRequestPlan(
  paths: string[],
  profiles: SimulatorBotProfile[],
  maxRequests: number
): { path: string; profile: SimulatorBotProfile }[] {
  const plan: { path: string; profile: SimulatorBotProfile }[] = [];
  for (const path of paths) {
    for (const profile of profiles) {
      if (plan.length >= maxRequests) {
        return plan;
      }
      plan.push({ path, profile });
    }
  }
  return plan;
}

function isHttpCrawlerRule(
  rule: CrawlerRule
): rule is CrawlerRule & { detectability: HttpCrawlerDetectability } {
  return rule.detectability !== "robots-token-only";
}

async function requestAsBot(
  sourceUrl: URL,
  path: string,
  profile: SimulatorBotProfile,
  runId: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number
): Promise<SimulatorAttempt> {
  const url = new URL(path, sourceUrl);
  url.searchParams.set(RUN_MARKER_PARAM, runId);
  const requestPath = `${url.pathname}${url.search}`;
  const baseAttempt = {
    ruleId: profile.ruleId,
    operator: profile.operator,
    bot: profile.bot,
    intent: profile.intent,
    detectability: profile.detectability,
    path,
    requestPath,
    url: url.toString(),
    userAgent: profile.userAgent,
    runMarker: runId
  };

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": profile.userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8"
        }
      },
      requestTimeoutMs
    );
    await response.body?.cancel();
    return {
      ...baseAttempt,
      status: response.status,
      ok: response.ok
    };
  } catch (error) {
    return {
      ...baseAttempt,
      ok: false,
      error: errorMessage(error)
    };
  }
}

async function fetchTextResource(
  sourceUrl: URL,
  path: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number
): Promise<{ fetch: SimulatorResourceFetch; text?: string }> {
  const url = new URL(path, sourceUrl);
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: "GET",
        headers: { Accept: "text/plain,application/xml,text/xml,*/*;q=0.8" }
      },
      requestTimeoutMs
    );
    const text = await response.text();
    return {
      fetch: {
        path,
        url: url.toString(),
        status: response.status,
        ok: response.ok
      },
      text: response.ok ? text : undefined
    };
  } catch (error) {
    return {
      fetch: {
        path,
        url: url.toString(),
        ok: false,
        error: errorMessage(error)
      }
    };
  }
}

async function fetchStatusResource(
  sourceUrl: URL,
  path: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number
): Promise<SimulatorResourceFetch> {
  const url = new URL(path, sourceUrl);
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: "GET",
        headers: { Accept: "application/json,text/plain,*/*;q=0.8" }
      },
      requestTimeoutMs
    );
    await response.body?.cancel();
    return {
      path,
      url: url.toString(),
      status: response.status,
      ok: response.ok
    };
  } catch (error) {
    return {
      path,
      url: url.toString(),
      ok: false,
      error: errorMessage(error)
    };
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  requestTimeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const fetchPromise = Promise.resolve().then(() =>
    fetchImpl(url, {
      ...init,
      signal: controller.signal
    })
  );
  fetchPromise.catch(() => undefined);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${requestTimeoutMs}ms: ${url.toString()}`));
    }, requestTimeoutMs);
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function extractPathsFromText(text: string | undefined, sourceUrl: URL): string[] {
  if (!text) {
    return [];
  }
  return uniquePaths([
    ...extractSitemapLocPaths(text, sourceUrl),
    ...extractMarkdownLinkPaths(text, sourceUrl),
    ...extractPlainUrlPaths(text, sourceUrl)
  ]);
}

function extractSitemapUrls(text: string | undefined, sourceUrl: URL): URL[] {
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => /^sitemap:\s*(?<url>\S+)/i.exec(line.trim())?.groups?.url)
    .filter((value): value is string => Boolean(value))
    .map((value) => safeUrl(value, sourceUrl))
    .filter((url): url is URL => Boolean(url))
    .filter((url) => url.origin === sourceUrl.origin);
}

function extractSitemapLocPaths(text: string, sourceUrl: URL): string[] {
  return [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => safeUrl(decodeXmlEntities(match[1]), sourceUrl))
    .filter((url): url is URL => Boolean(url))
    .map((url) => sameOriginPath(url, sourceUrl))
    .filter((path): path is string => Boolean(path));
}

function extractMarkdownLinkPaths(text: string, sourceUrl: URL): string[] {
  return [...text.matchAll(/\[[^\]]+]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => safeUrl(stripWrapping(match[1]), sourceUrl))
    .filter((url): url is URL => Boolean(url))
    .map((url) => sameOriginPath(url, sourceUrl))
    .filter((path): path is string => Boolean(path));
}

function extractPlainUrlPaths(text: string, sourceUrl: URL): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map((match) => safeUrl(stripTrailingPunctuation(match[0]), sourceUrl))
    .filter((url): url is URL => Boolean(url))
    .map((url) => sameOriginPath(url, sourceUrl))
    .filter((path): path is string => Boolean(path));
}

function sameOriginPath(url: URL, sourceUrl: URL): string | undefined {
  if (url.origin !== sourceUrl.origin) {
    return undefined;
  }
  return normalizePath(url.pathname);
}

function presentResourcePaths(resources: SimulatorResourceFetch[]): Set<string> {
  return new Set(resources.filter((resource) => resource.ok).map((resource) => resource.path));
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizePath))];
}

function normalizePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "" ? "/" : normalized;
}

function normalizeSourceUrl(value: string | URL): URL {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function normalizeGeneratedAt(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date().toISOString();
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ogc-${Date.now().toString(36)}`;
}

function userAgentForRule(rule: CrawlerRule): string {
  switch (rule.id) {
    case "openai-gptbot":
      return "GPTBot/1.0 (+https://openai.com/gptbot)";
    case "openai-oai-searchbot":
      return "OAI-SearchBot/1.0 (+https://openai.com/searchbot)";
    case "openai-chatgpt-user":
      return "ChatGPT-User/1.0 (+https://openai.com/bot)";
    case "anthropic-claudebot":
      return "ClaudeBot/1.0 (+https://www.anthropic.com)";
    case "anthropic-claude-user":
      return "Claude-User/1.0 (+https://www.anthropic.com)";
    case "anthropic-claude-searchbot":
      return "Claude-SearchBot/1.0 (+https://www.anthropic.com)";
    case "perplexity-perplexitybot":
      return "PerplexityBot/1.0 (+https://www.perplexity.ai/perplexitybot)";
    case "perplexity-user":
      return "Perplexity-User/1.0 (+https://www.perplexity.ai)";
    default:
      return `${rule.bot}/1.0 (+https://open-geo-console.local/simulator)`;
  }
}

function isProjectOrArticlePath(path: string): boolean {
  return /\/(projects?|articles?|blog|posts?|writing|work)(\/|$)/i.test(path);
}

function safeUrl(value: string, base: URL): URL | undefined {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

function parseLogPath(path: string): URL {
  return new URL(path, "https://log.local");
}

function stripWrapping(value: string): string {
  return value.replace(/^["'<]+|[>"']+$/g, "");
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;]+$/g, "");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
