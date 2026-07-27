import {
  SiteDiscovery,
  buildPageCandidates,
  CrawlPageError,
  compressCandidates,
  createSiteKey,
  extractPageContent,
  isAllowedByRobots,
  parseRobotsTxt,
  resolveSafeUrl,
  type ExtractedPageContent,
  type PageCandidate as CrawlPageCandidate,
  type PageType as CrawlPageType,
  type RobotsPolicy
} from "@open-geo-console/site-crawler";
import type { ExtractedPage, PageCandidate, PageType, PlannedPage } from "@open-geo-console/ai-report-engine";
import { createHash } from "node:crypto";
import { configuredPublicDnsResolver, createSafeFetch } from "@/server/safe-fetch";
import { getScanJob } from "../db/jobs";
import type {
  ReportV4HtmlRead,
  ReportV4SiteCandidate,
  ReportV4SiteCollectorDependencies
} from "./report-v4-site-collector";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver,
  type ReportV4AcceptanceObserverEvent
} from "./report-v4-acceptance-observer";
import {
  createProductionReportV4AcceptanceSiteReadManifestRepository,
  type ReportV4AcceptanceSiteReadManifestRepository
} from "../db/report-v4-site-read-manifest";

const CRAWLER_USER_AGENT = "OpenGeoConsoleBot/1.0 (+https://github.com/open-geo-console)";
const MAX_SITEMAP_DOCUMENTS = 200;
const allowBenchmarkNetwork = process.env.OGC_ALLOW_BENCHMARK_NETWORK === "true";

export interface DiscoveredSite {
  targetUrl: string;
  siteKey: string;
  candidates: PageCandidate[];
  deterministicCandidates: CrawlPageCandidate[];
  robotsPolicy: RobotsPolicy;
  homepage: ExtractedPageContent;
  estimatedPages: number;
}

export interface FetchedEvidencePage {
  page: ExtractedPage;
  canonicalUrl?: string;
  httpStatus: number;
  contentHash: string;
  browserRendered: boolean;
}

export interface ReportV4AdmissionDiscovery {
  targetUrl: string;
  siteKey: string;
  candidates: ReportV4SiteCandidate[];
  robotsPolicy: RobotsPolicy;
}

export interface ReportV4AdmissionBrowserDocument {
  url: string;
  html: string;
}

export async function discoverReportV4AdmissionSite(
  targetUrl: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = createSafeFetch(),
  acceptanceObserver?: ReportV4AcceptanceObserver | null,
  siteReadManifestRepository?: ReportV4AcceptanceSiteReadManifestRepository,
  loadJob: typeof getScanJob = getScanJob
): Promise<ReportV4AdmissionDiscovery> {
  let acceptanceFetch: ReturnType<typeof createAcceptanceDiscoveryFetch> | undefined;
  if (acceptanceObserver) {
    const manifest = siteReadManifestRepository ?? createProductionReportV4AcceptanceSiteReadManifestRepository();
    acceptanceFetch = createAcceptanceDiscoveryFetch(
      fetchImpl,
      acceptanceObserver,
      manifest,
      lazyAdmissionSiteReadAuthority(acceptanceObserver, loadJob)
    );
  }
  const discovered = await discoverSite(targetUrl, "deep", fetchImpl, signal, acceptanceFetch);
  return {
    targetUrl: discovered.targetUrl,
    siteKey: discovered.siteKey,
    robotsPolicy: discovered.robotsPolicy,
    candidates: discovered.deterministicCandidates.map(({ url }) => reportV4Candidate(
      discovered.targetUrl,
      url,
      discovered.robotsPolicy
    ))
  };
}

export function createReportV4AdmissionCollectorDependencies(input: {
  targetUrl: string;
  robotsPolicy: RobotsPolicy;
  fetchImpl?: typeof fetch;
  renderBrowser?: (url: string, signal?: AbortSignal) => Promise<ReportV4AdmissionBrowserDocument | null>;
  acceptanceObserver?: ReportV4AcceptanceObserver | null;
  siteReadManifestRepository?: ReportV4AcceptanceSiteReadManifestRepository;
  loadJob?: typeof getScanJob;
}): ReportV4SiteCollectorDependencies {
  const fetchImpl = input.fetchImpl ?? createSafeFetch();
  const renderBrowser = input.renderBrowser ?? renderReportV4AdmissionHtml;
  const manifest = input.acceptanceObserver
    ? input.siteReadManifestRepository ?? createProductionReportV4AcceptanceSiteReadManifestRepository()
    : null;
  const loadAuthority = input.acceptanceObserver
    ? lazyAdmissionSiteReadAuthority(input.acceptanceObserver, input.loadJob ?? getScanJob)
    : null;
  return {
    async readRawHtml(candidate, signal) {
      if (!isAllowedByRobots(candidate.url, input.robotsPolicy)) {
        return excludedByRobots(candidate.url);
      }
      return performAcceptanceSiteRead({
        observer: input.acceptanceObserver,
        scope: "admission-page",
        url: candidate.url,
        mode: "raw",
        purpose: "page",
        siteReadManifestRepository: manifest,
        loadAuthority,
        perform: async () => {
          const response = await fetchImpl(candidate.url, {
            signal,
            headers: { "user-agent": CRAWLER_USER_AGENT }
          });
          const finalUrl = response.headers.get("x-ogc-final-url") ?? candidate.url;
          const contentType = response.headers.get("content-type") ?? "application/octet-stream";
          if (response.status !== 401 && response.status !== 403 && !response.ok) {
            throw new CrawlPageError("unsupported-content", `Page returned HTTP ${response.status}.`, {
              status: response.status,
              disposition: response.status >= 500 || response.status === 429 ? "transient" : "permanent"
            });
          }
          return {
            url: finalUrl,
            networkSafety: "public",
            access: response.status === 401 || response.status === 403 ? "login_required" : "public",
            contentType,
            html: await response.text(),
            ...(!isAllowedByRobots(finalUrl, input.robotsPolicy) ? { explicitExclusion: "robots_denied" as const } : {})
          };
        }
      });
    },
    async renderBrowserHtml(url, signal) {
      if (!isAllowedByRobots(url, input.robotsPolicy)) return excludedByRobots(url);
      return performAcceptanceSiteRead({
        observer: input.acceptanceObserver,
        scope: "admission-page",
        url,
        mode: "browser",
        purpose: "page",
        siteReadManifestRepository: manifest,
        loadAuthority,
        perform: async () => {
          const rendered = await renderBrowser(url, signal);
          if (!rendered) throw new Error("Browser rendering returned no readable document.");
          return {
            url: rendered.url,
            networkSafety: "public",
            access: "public",
            contentType: "text/html",
            html: rendered.html,
            ...(!isAllowedByRobots(rendered.url, input.robotsPolicy) ? { explicitExclusion: "robots_denied" as const } : {})
          };
        }
      });
    },
    extractAnalyzableText(read) {
      return extractPageContent(read.html, read.url, { maximumReadableCharacters: 100_000 }).text;
    },
    async discoverCandidates(read) {
      const discovery = new SiteDiscovery(input.targetUrl);
      discovery.addHtmlDocument(read.html, read.url);
      return discovery.getUrls().map(({ url }) => reportV4Candidate(input.targetUrl, url, input.robotsPolicy));
    }
  };
}

function createAcceptanceDiscoveryFetch(
  fetchImpl: typeof fetch,
  observer: ReportV4AcceptanceObserver,
  siteReadManifestRepository: ReportV4AcceptanceSiteReadManifestRepository,
  loadAuthority: () => Promise<ReportV4AdmissionSiteReadAuthority>
): (request: RequestInfo | URL, purpose: "homepage" | "robots" | "sitemap", init?: RequestInit) => Promise<Response> {
  return async (request, purpose, init) => {
    const url = request instanceof Request ? request.url : request.toString();
    return performAcceptanceSiteRead({
      observer,
      scope: "admission-discovery",
      url,
      mode: "raw",
      purpose,
      siteReadManifestRepository,
      loadAuthority,
      perform: async () => {
        const response = await fetchImpl(request, init);
        const bytes = await response.arrayBuffer();
        return new Response(bytes.byteLength === 0 ? null : bytes, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
    });
  };
}

async function performAcceptanceSiteRead<T>(input: {
  observer?: ReportV4AcceptanceObserver | null;
  url: string;
  mode: "raw" | "browser";
  siteReadManifestRepository?: ReportV4AcceptanceSiteReadManifestRepository | null;
  loadAuthority?: (() => Promise<ReportV4AdmissionSiteReadAuthority>) | null;
  perform: () => Promise<T>;
} & (
  | { scope: "admission-discovery"; purpose: "homepage" | "robots" | "sitemap" }
  | { scope: "admission-page"; purpose: "page" }
)): Promise<T> {
  if (!input.observer) return input.perform();
  if (!input.siteReadManifestRepository || !input.loadAuthority) {
    throw new Error("A protected-acceptance site read requires its manifest repository and job authority.");
  }
  const authority = await input.loadAuthority();
  const event = siteReadEvent(input.scope, input.url, input.mode, "started");
  const manifest = input.siteReadManifestRepository;
  const beginBase = {
    sessionId: authority.sessionId,
    scenarioId: authority.scenarioId,
    reportId: authority.reportId,
    jobId: authority.jobId,
    rawUrl: input.url,
    mode: input.mode
  };
  const started = input.scope === "admission-discovery"
    ? await manifest.begin({ ...beginBase, scope: "admission_discovery", purpose: input.purpose, attempt: 0 })
    : await manifest.begin({ ...beginBase, scope: "admission_page", purpose: input.purpose, attempt: 0 });
  await input.observer.claimExternalIo(event);
  let result: T;
  try {
    result = await input.perform();
  } catch (error) {
    await manifest.terminalize({ sessionId: started.entry.sessionId, scenarioId: started.entry.scenarioId, identityHash: started.entry.identityHash, terminalPhase: "failed" });
    await input.observer.finishExternalIo({ ...event, phase: "failed" });
    throw error;
  }
  await manifest.terminalize({ sessionId: started.entry.sessionId, scenarioId: started.entry.scenarioId, identityHash: started.entry.identityHash, terminalPhase: "completed" });
  await input.observer.finishExternalIo({ ...event, phase: "completed" });
  return result;
}

interface ReportV4AdmissionSiteReadAuthority {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string;
  readonly jobId: string;
}

function lazyAdmissionSiteReadAuthority(
  observer: ReportV4AcceptanceObserver,
  loadJob: typeof getScanJob
): () => Promise<ReportV4AdmissionSiteReadAuthority> {
  let pending: Promise<ReportV4AdmissionSiteReadAuthority> | null = null;
  return () => pending ??= resolveAdmissionSiteReadAuthority(observer, loadJob);
}

async function resolveAdmissionSiteReadAuthority(
  observer: ReportV4AcceptanceObserver,
  loadJob: typeof getScanJob
): Promise<ReportV4AdmissionSiteReadAuthority> {
  const { session, scenario } = observer;
  if (session.environment !== "protected_staging" || session.state !== "collecting" || session.terminalAt !== null
    || scenario.sessionId !== session.sessionId || scenario.state !== "collecting" || scenario.terminalAt !== null
    || !scenario.preAdmissionJobId) {
    throw new Error("An exact collecting protected-acceptance pre-admission authority is required for a physical site read.");
  }
  const job = await loadJob(scenario.preAdmissionJobId);
  if (!job || job.id !== scenario.preAdmissionJobId || !job.reportId || job.reason !== "v4_pre_admission"
    || job.tier !== "deep" || job.fulfillmentMethodology !== "two_stage_geo_report_v4"
    || job.recommendationReportVersion !== 4 || job.artifactContract !== "combined_geo_report_v4"
    || (scenario.reportId !== null && scenario.reportId !== job.reportId)) {
    throw new Error("The protected-acceptance pre-admission job authority does not match its persisted Report V4 lineage.");
  }
  return {
    sessionId: session.sessionId,
    scenarioId: scenario.scenarioId,
    reportId: job.reportId,
    jobId: job.id
  };
}

function siteReadEvent(
  scope: "admission-discovery" | "admission-page",
  url: string,
  mode: "raw" | "browser",
  phase: "started" | "completed" | "failed"
): Extract<ReportV4AcceptanceObserverEvent, { kind: "site_read" }> {
  const urlHash = createHash("sha256").update(url).digest("hex");
  return {
    kind: "site_read",
    operation: mode === "raw" ? "site_raw_read" : "site_browser_read",
    unitId: `${scope}:${mode}:${urlHash}`,
    attempt: 0,
    phase,
    details: { urlHash, readMode: mode, networkPerformed: true }
  };
}

export async function discoverSite(
  targetUrl: string,
  tier: "free" | "deep" = "deep",
  fetchImpl: typeof fetch = createSafeFetch(),
  signal?: AbortSignal,
  purposefulFetch?: (request: RequestInfo | URL, purpose: "homepage" | "robots" | "sitemap", init?: RequestInit) => Promise<Response>
): Promise<DiscoveredSite> {
  const read = purposefulFetch ?? ((request, _purpose, init) => fetchImpl(request, init));
  const root = new URL(targetUrl);
  root.pathname = "/";
  root.search = "";
  root.hash = "";

  const [homepageResponse, robotsResponse] = await Promise.all([
    read(root, "homepage", { signal, headers: { "user-agent": CRAWLER_USER_AGENT } }),
    read(new URL("/robots.txt", root), "robots", { signal, headers: { "user-agent": CRAWLER_USER_AGENT } })
      .catch((error) => {
        if (error instanceof ReportV4AcceptanceIndeterminateOperationError) throw error;
        return null;
      })
  ]);
  if (!homepageResponse.ok) throw new Error(`Homepage returned HTTP ${homepageResponse.status}.`);
  const homepageHtml = await homepageResponse.text();
  const homepage = extractPageContent(homepageHtml, root);
  const robotsText = robotsResponse?.ok ? await robotsResponse.text() : "";
  const robotsPolicy = parseRobotsTxt(robotsText, new URL("/robots.txt", root), "OpenGeoConsoleBot");
  if (!isAllowedByRobots(root, robotsPolicy)) {
    throw new Error("The website robots.txt does not allow Open GEO Console to scan the homepage.");
  }

  const discovery = new SiteDiscovery(root);
  discovery.addHtmlDocument(homepageHtml, root);
  const sitemapQueue = tier === "free"
    ? [new URL("/sitemap.xml", root).href]
    : [...new Set([...robotsPolicy.sitemaps, new URL("/sitemap.xml", root).href])];
  const visitedSitemaps = new Set<string>();
  while (sitemapQueue.length > 0 && visitedSitemaps.size < MAX_SITEMAP_DOCUMENTS) {
    signal?.throwIfAborted();
    const sitemapUrl = sitemapQueue.shift()!;
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);
    try {
      const response = await read(sitemapUrl, "sitemap", { signal, headers: { "user-agent": CRAWLER_USER_AGENT } });
      if (!response.ok) continue;
      const nested = discovery.addSitemapDocument(await response.text(), sitemapUrl);
      if (tier === "deep") {
        for (const url of nested) if (!visitedSitemaps.has(url)) sitemapQueue.push(url);
      }
    } catch (error) {
      if (error instanceof ReportV4AcceptanceIndeterminateOperationError) throw error;
      if (signal?.aborted) throw signal.reason ?? error;
      // A broken optional sitemap must not discard usable homepage/link discovery.
    }
  }

  const metadata = new Map<string, Partial<ExtractedPageContent>>([[root.href, homepage]]);
  const discoveredEntries = discovery.getUrls().filter((entry) => isAllowedByRobots(entry.url, robotsPolicy));
  const estimatedPages = Math.max(1, new Set(discoveredEntries.map((entry) => entry.url)).size);
  const candidateEntries = tier === "free"
    ? discoveredEntries.filter((entry) => entry.url === root.href)
    : discoveredEntries;
  const deterministicCandidates = compressCandidates(
    buildPageCandidates(
      candidateEntries,
      metadata
    )
  );
  if (deterministicCandidates.length === 0) {
    deterministicCandidates.push(...compressCandidates(buildPageCandidates([{ url: root.href, sources: ["seed"] }], metadata)));
  }
  const candidates: PageCandidate[] = deterministicCandidates.map((candidate) => ({
    url: candidate.url,
    title: candidate.title,
    lastModified: candidate.lastModified,
    pageType: toAiPageType(candidate.pageType),
    textPreview: candidate.url === root.href ? homepage.text.slice(0, 300) : undefined
  }));

  return {
    targetUrl: root.href,
    siteKey: createSiteKey(root),
    candidates,
    deterministicCandidates,
    robotsPolicy,
    homepage,
    estimatedPages
  };
}

export async function fetchEvidencePage(
  planned: PlannedPage,
  robotsPolicy: RobotsPolicy,
  signal?: AbortSignal
): Promise<FetchedEvidencePage> {
  if (!isAllowedByRobots(planned.url, robotsPolicy)) {
    throw new CrawlPageError("robots-denied", "robots.txt disallows this page.");
  }
  const safeFetch = createSafeFetch();
  const response = await safeFetch(planned.url, { signal, headers: { "user-agent": CRAWLER_USER_AGENT } });
  if (!response.ok) {
    if (response.status === 404) {
      throw new CrawlPageError("http-not-found", `Page returned HTTP ${response.status}.`, { status: response.status });
    }
    if (response.status === 410) {
      throw new CrawlPageError("http-gone", `Page returned HTTP ${response.status}.`, { status: response.status });
    }
    if (response.status === 429) {
      throw new CrawlPageError("http-rate-limited", `Page returned HTTP ${response.status}.`, { status: response.status });
    }
    if (response.status >= 500) {
      throw new CrawlPageError("http-server-error", `Page returned HTTP ${response.status}.`, { status: response.status });
    }
    throw new CrawlPageError("unsupported-content", `Page returned unsupported HTTP ${response.status}.`, {
      status: response.status,
      disposition: "permanent"
    });
  }
  const finalUrl = response.headers.get("x-ogc-final-url") ?? planned.url;
  if (createSiteKey(finalUrl) !== createSiteKey(planned.url)) {
    throw new CrawlPageError("outside-site", "The redirect leaves the requested site boundary.");
  }
  if (!isAllowedByRobots(finalUrl, robotsPolicy)) {
    throw new CrawlPageError("disallowed-redirect", "The redirect target is disallowed by robots.txt.");
  }
  let html = await response.text();
  let extracted = extractPageContent(html, planned.url, { maximumReadableCharacters: 100_000 });
  let browserRendered = false;
  if (extracted.browserFallback.required) {
    let rendered: string | null;
    try {
      rendered = (await renderReportV4AdmissionHtml(finalUrl, signal))?.html ?? null;
    } catch (error) {
      throw new CrawlPageError(
        "browser",
        `Browser rendering failed: ${error instanceof Error ? error.message : "unknown browser error"}`
      );
    }
    if (rendered) {
      html = rendered;
      extracted = extractPageContent(html, planned.url, { maximumReadableCharacters: 100_000 });
      browserRendered = true;
    } else {
      throw new CrawlPageError("browser", "Browser rendering returned no readable document.");
    }
  }
  if (!extracted.text.trim()) throw new Error("The page did not expose readable text.");

  return {
    page: {
      url: planned.url,
      pageType: planned.pageType,
      title: extracted.title || undefined,
      description: extracted.description || undefined,
      text: extracted.text,
      metadata: {
        language: extracted.language ?? "",
        headings: extracted.headings.map((heading) => `${heading.level}:${heading.text}`),
        jsonLdTypes: extracted.jsonLdTypes,
        officialNames: extracted.officialNames,
        wordCount: String(extracted.wordCount),
        browserRendered: String(browserRendered)
      }
    },
    canonicalUrl: extracted.canonical,
    httpStatus: response.status,
    contentHash: createHash("sha256").update(extracted.text).digest("hex"),
    browserRendered
  };
}

export async function renderReportV4AdmissionHtml(
  url: string,
  signal?: AbortSignal
): Promise<ReportV4AdmissionBrowserDocument | null> {
  signal?.throwIfAborted();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.OGC_BROWSER_HEADLESS !== "false" });
  try {
    const resolver = configuredPublicDnsResolver();
    const context = await browser.newContext({ userAgent: CRAWLER_USER_AGENT, javaScriptEnabled: true });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
        await route.abort();
        return;
      }
      try {
        await resolveSafeUrl(requestUrl, { allowBenchmarkNetwork, resolver });
        const resourceType = route.request().resourceType();
        if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
          await route.abort();
        } else {
          await route.continue();
        }
      } catch {
        await route.abort();
      }
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    signal?.throwIfAborted();
    await resolveSafeUrl(page.url(), { allowBenchmarkNetwork, resolver });
    const finalUrl = page.url();
    const html = await page.content();
    return Buffer.byteLength(html, "utf8") <= 2 * 1024 * 1024 ? { url: finalUrl, html } : null;
  } finally {
    await browser.close();
  }
}

function reportV4Candidate(siteUrl: string, url: string, robotsPolicy: RobotsPolicy): ReportV4SiteCandidate {
  return {
    siteUrl,
    url,
    networkSafety: "public",
    access: "public",
    contentType: "text/html",
    ...(!isAllowedByRobots(url, robotsPolicy) ? { explicitExclusion: "robots_denied" as const } : {})
  };
}

function excludedByRobots(url: string): ReportV4HtmlRead {
  return {
    url,
    networkSafety: "public",
    access: "public",
    contentType: "text/html",
    html: "",
    explicitExclusion: "robots_denied"
  };
}

export function toAiPageType(pageType: CrawlPageType): PageType {
  if (pageType === "help") return "documentation";
  if (pageType === "careers") return "other";
  return pageType;
}
