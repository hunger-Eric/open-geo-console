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

export async function discoverSite(
  targetUrl: string,
  tier: "free" | "deep" = "deep",
  fetchImpl: typeof fetch = createSafeFetch(),
  signal?: AbortSignal
): Promise<DiscoveredSite> {
  const root = new URL(targetUrl);
  root.pathname = "/";
  root.search = "";
  root.hash = "";

  const [homepageResponse, robotsResponse] = await Promise.all([
    fetchImpl(root, { signal, headers: { "user-agent": CRAWLER_USER_AGENT } }),
    fetchImpl(new URL("/robots.txt", root), { signal, headers: { "user-agent": CRAWLER_USER_AGENT } }).catch(() => null)
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
      const response = await fetchImpl(sitemapUrl, { signal, headers: { "user-agent": CRAWLER_USER_AGENT } });
      if (!response.ok) continue;
      const nested = discovery.addSitemapDocument(await response.text(), sitemapUrl);
      if (tier === "deep") {
        for (const url of nested) if (!visitedSitemaps.has(url)) sitemapQueue.push(url);
      }
    } catch {
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
      rendered = await renderWithBrowser(finalUrl, signal);
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

async function renderWithBrowser(url: string, signal?: AbortSignal): Promise<string | null> {
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
    const html = await page.content();
    return Buffer.byteLength(html, "utf8") <= 2 * 1024 * 1024 ? html : null;
  } finally {
    await browser.close();
  }
}

export function toAiPageType(pageType: CrawlPageType): PageType {
  if (pageType === "help") return "documentation";
  if (pageType === "careers") return "other";
  return pageType;
}
