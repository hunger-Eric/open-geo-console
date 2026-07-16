import {
  classifyPageType,
  inferTemplateKey,
  type PageType
} from "@open-geo-console/site-crawler";
import { analyzeTitlePatterns } from "./title-patterns";

export {
  analyzeTitlePatterns,
  weightedTitleLength,
  type TitlePatternKind,
  type TitlePatternMatch,
  type TitlePatternPage
} from "./title-patterns";

export type FindingSeverity = "critical" | "warning" | "info";
export type FindingMessageParamValue = string | number | boolean;
export type FindingMessageParams = Record<string, FindingMessageParamValue>;

export type FindingMessageKey =
  | "asset.missingLlmsTxt"
  | "asset.missingSitemapXml"
  | "asset.missingRobotsTxt"
  | "page.badStatus"
  | "page.weakTitle"
  | "page.duplicateTitles"
  | "page.dominantTitleTemplate"
  | "page.missingMetaDescription"
  | "page.h1Structure"
  | "page.missingCanonical"
  | "page.missingJsonLd"
  | "page.lowReadableContent"
  | "homepage.missingOpenGraph";

export interface FindingAggregation {
  affectedCount: number;
  representativeUrls: string[];
  pageType?: PageType;
  templateKey?: string;
}

export interface GeoFinding {
  id: string;
  severity: FindingSeverity;
  messageKey?: FindingMessageKey;
  params?: FindingMessageParams;
  title: string;
  description: string;
  recommendation: string;
  url?: string;
  aggregation?: FindingAggregation;
}

interface FindingMessageDefinition {
  severity: FindingSeverity;
  title: MessageTemplate;
  description: MessageTemplate;
  recommendation: MessageTemplate;
}

type MessageTemplate =
  | string
  | ((params: FindingMessageParams) => string);

export const FINDING_MESSAGE_CATALOG = {
  "asset.missingLlmsTxt": {
    severity: "warning",
    title: "Missing llms.txt",
    description: "AI answer engines have no dedicated summary file for your site.",
    recommendation:
      "Publish /llms.txt with a concise company summary, canonical product pages, and preferred citations."
  },
  "asset.missingSitemapXml": {
    severity: "critical",
    title: "Missing sitemap.xml",
    description: "The audit could not discover a sitemap for representative page selection.",
    recommendation: "Publish /sitemap.xml and reference it from robots.txt."
  },
  "asset.missingRobotsTxt": {
    severity: "warning",
    title: "Missing robots.txt",
    description: "Crawler policy is not declared at the standard location.",
    recommendation: "Publish /robots.txt with sitemap discovery and explicit AI crawler policy."
  },
  "page.badStatus": {
    severity: "critical",
    title: "Page returned an error status",
    description: (params) => `${params.url} returned HTTP ${params.status}.`,
    recommendation: "Fix broken canonical pages or remove them from the sitemap."
  },
  "page.weakTitle": {
    severity: "warning",
    title: "Weak or missing title",
    description: "AI crawlers rely on clear titles to identify page purpose.",
    recommendation: "Add a specific title that names the company, product, or page intent."
  },
  "page.duplicateTitles": {
    severity: "warning",
    title: "Multiple pages reuse the same title",
    description: (params) =>
      `${params.affectedCount} pages expose the same title, reducing page-specific GEO identity.`,
    recommendation:
      "Give each page a concise title that states its distinct purpose and keep only a short reusable brand identifier."
  },
  "page.dominantTitleTemplate": {
    severity: "warning",
    title: "Page titles are dominated by a shared template",
    description: (params) =>
      `${params.affectedCount} pages share a ${params.sharedLength}-character title segment that outweighs their page-specific meaning.`,
    recommendation:
      "Lead with the page's distinct purpose and reduce the repeated portion to a concise brand identifier so generative engines can select and cite the right page."
  },
  "page.missingMetaDescription": {
    severity: "warning",
    title: "Missing meta description",
    description: "The page lacks a concise summary for search and AI preview contexts.",
    recommendation: "Add a descriptive meta description for each important page."
  },
  "page.h1Structure": {
    severity: "warning",
    title: "H1 structure needs attention",
    description: (params) => `Expected one H1, found ${params.h1Count}.`,
    recommendation: "Use one descriptive H1 per page and reserve H2 for section structure."
  },
  "page.missingCanonical": {
    severity: "info",
    title: "Missing canonical URL",
    description: "Canonical URLs help crawlers consolidate duplicate or parameterized pages.",
    recommendation: "Add a canonical link for each indexable page."
  },
  "page.missingJsonLd": {
    severity: "warning",
    title: "Missing JSON-LD schema",
    description: "Structured data is absent from this page.",
    recommendation: "Add Organization, WebSite, Article, Product, or Service schema where appropriate."
  },
  "page.lowReadableContent": {
    severity: "info",
    title: "Low readable content",
    description: "The page may not expose enough text for AI systems to summarize confidently.",
    recommendation:
      "Ensure key pages include crawlable text that explains the offer, audience, proof, and next steps."
  },
  "homepage.missingOpenGraph": {
    severity: "info",
    title: "Homepage lacks OpenGraph metadata",
    description: "Shared previews may be less consistent across answer and social surfaces.",
    recommendation: "Add OpenGraph title, description, URL, and image metadata to the homepage."
  }
} satisfies Record<FindingMessageKey, FindingMessageDefinition>;

export interface AuditedPage {
  url: string;
  status: number;
  title?: string;
  metaDescription?: string;
  h1: string[];
  h2: string[];
  canonical?: string;
  hasOpenGraph: boolean;
  hasJsonLd: boolean;
  readableTextLength: number;
  internalLinks: number;
}

export interface MachineReadableAssets {
  robotsTxt: AssetCheck;
  sitemapXml: AssetCheck;
  llmsTxt: AssetCheck;
}

export interface AssetCheck {
  url: string;
  present: boolean;
  status?: number;
  summary: string;
}

export interface GeoAuditReport {
  url: string;
  scannedAt: string;
  score: number;
  findings: GeoFinding[];
  recommendations: string[];
  pages: AuditedPage[];
  machineReadableAssets: MachineReadableAssets;
}

export interface AuditSiteOptions {
  fetchImpl?: typeof fetch;
  pageLimit?: number;
  pageUrls?: string[];
}

interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  text: string;
}

const REPRESENTATIVE_PATTERNS = [
  /\/$/,
  /product|products|service|services|solution|solutions/i,
  /case|customer|work|portfolio/i,
  /blog|article|insight|news/i,
  /about|company|team/i
];

export async function auditSite(inputUrl: string, options: AuditSiteOptions = {}): Promise<GeoAuditReport> {
  const root = normalizeRootUrl(inputUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const scannedAt = new Date().toISOString();
  const [home, robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    fetchText(root.href, fetchImpl),
    fetchText(new URL("/robots.txt", root).href, fetchImpl),
    fetchText(new URL("/sitemap.xml", root).href, fetchImpl),
    fetchText(new URL("/llms.txt", root).href, fetchImpl)
  ]);

  const sitemapUrls = sitemapXml.ok ? extractSitemapUrls(sitemapXml.text, root) : [];
  const representativeUrls = options.pageUrls
    ? normalizeExplicitPageUrls(root, options.pageUrls)
    : selectRepresentativePages(root, sitemapUrls, options.pageLimit ?? 20);
  const pageResults = await Promise.all(
    representativeUrls.map((url) => url === root.href ? home : fetchText(url, fetchImpl))
  );
  const pages = pageResults.map((result) => analyzePage(result, root));

  if (!pages.some((page) => page.url === root.href)) {
    pages.unshift(analyzePage(home, root));
  }

  const machineReadableAssets = {
    robotsTxt: assetCheck("robots.txt", robotsTxt),
    sitemapXml: assetCheck("sitemap.xml", sitemapXml),
    llmsTxt: assetCheck("llms.txt", llmsTxt)
  };
  const findings = buildFindings(root.href, pages, machineReadableAssets);
  const score = calculateScore(findings, pages);

  return {
    url: root.href,
    scannedAt,
    score,
    findings,
    recommendations: [...new Set(findings.map((finding) => finding.recommendation))],
    pages,
    machineReadableAssets
  };
}

export function projectHomepageReport(report: GeoAuditReport): GeoAuditReport {
  const target = new URL(report.url);
  const homepage = report.pages.find((page) => {
    try {
      const url = new URL(page.url);
      return url.origin === target.origin && url.pathname === target.pathname && url.search === target.search;
    } catch {
      return false;
    }
  }) ?? report.pages[0];
  const pages = homepage ? [homepage] : [];
  const findings = buildFindings(report.url, pages, report.machineReadableAssets);

  return {
    ...report,
    score: calculateScore(findings, pages),
    findings,
    recommendations: [...new Set(findings.map((finding) => finding.recommendation))],
    pages
  };
}

function normalizeExplicitPageUrls(root: URL, pageUrls: string[]): string[] {
  const selected = new Set<string>([root.href]);
  for (const value of pageUrls) {
    try {
      const url = new URL(value, root);
      url.hash = "";
      if (url.origin === root.origin) selected.add(url.href);
    } catch {
      // Invalid planned URLs are ignored rather than fetched.
    }
  }
  return [...selected];
}

export function selectRepresentativePages(root: URL, sitemapUrls: string[], limit = 20): string[] {
  const sameOrigin = sitemapUrls.filter((url) => {
    try {
      return new URL(url).origin === root.origin;
    } catch {
      return false;
    }
  });
  const selected = new Set<string>([root.href]);

  for (const pattern of REPRESENTATIVE_PATTERNS) {
    const match = sameOrigin.find((url) => pattern.test(new URL(url).pathname));
    if (match) {
      selected.add(match);
    }
  }

  for (const url of sameOrigin) {
    if (selected.size >= limit) {
      break;
    }
    selected.add(url);
  }

  return [...selected].slice(0, limit);
}

export function extractSitemapUrls(xml: string, root: URL): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
  return locs
    .map((url) => {
      try {
        return new URL(url, root).href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => url !== null);
}

export function analyzePage(result: FetchResult, root: URL): AuditedPage {
  const html = result.text;
  const bodyText = stripHtml(html);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((href) => {
      try {
        return new URL(href, root).origin === root.origin;
      } catch {
        return false;
      }
    });

  return {
    url: result.url,
    status: result.status,
    title: textFromTag(html, "title"),
    metaDescription: metaContent(html, "description"),
    h1: headings(html, "h1"),
    h2: headings(html, "h2"),
    canonical: linkHref(html, "canonical"),
    hasOpenGraph: /<meta\b[^>]+property=["']og:/i.test(html),
    hasJsonLd: /<script\b[^>]+type=["']application\/ld\+json["']/i.test(html),
    readableTextLength: bodyText.length,
    internalLinks: new Set(links).size
  };
}

interface PageFindingCandidate {
  finding: GeoFinding;
  pageType: PageType;
  templateKey: string;
}

export function buildFindings(
  siteUrl: string,
  pages: AuditedPage[],
  assets: MachineReadableAssets
): GeoFinding[] {
  const findings: GeoFinding[] = [];
  const pageFindings: PageFindingCandidate[] = [];
  const homepage = pages[0];

  if (!assets.llmsTxt.present) {
    findings.push(createFinding({
      id: "missing-llms",
      messageKey: "asset.missingLlmsTxt",
      params: { assetPath: "/llms.txt" },
      url: new URL("/llms.txt", siteUrl).href
    }));
  }

  if (!assets.sitemapXml.present) {
    findings.push(createFinding({
      id: "missing-sitemap",
      messageKey: "asset.missingSitemapXml",
      params: { assetPath: "/sitemap.xml" },
      url: new URL("/sitemap.xml", siteUrl).href
    }));
  }

  if (!assets.robotsTxt.present) {
    findings.push(createFinding({
      id: "missing-robots",
      messageKey: "asset.missingRobotsTxt",
      params: { assetPath: "/robots.txt" },
      url: new URL("/robots.txt", siteUrl).href
    }));
  }

  for (const page of pages) {
    const pageType = classifyPageType(page.url, {
      title: page.title,
      description: page.metaDescription,
      headings: [...page.h1, ...page.h2].map((text) => ({ text }))
    });
    const templateKey = inferTemplateKey(page.url, pageType);
    const pushPageFinding = (finding: GeoFinding) => {
      pageFindings.push({ finding, pageType, templateKey });
    };

    if (!isSuccessfulStatus(page.status)) {
      pushPageFinding(createFinding({
        id: `bad-status-${hashId(page.url)}`,
        messageKey: "page.badStatus",
        params: { url: page.url, status: page.status },
        url: page.url
      }));
      continue;
    }

    if (!page.title || page.title.length < 10) {
      pushPageFinding(createFinding({
        id: `missing-title-${hashId(page.url)}`,
        messageKey: "page.weakTitle",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (!page.metaDescription) {
      pushPageFinding(createFinding({
        id: `missing-description-${hashId(page.url)}`,
        messageKey: "page.missingMetaDescription",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (page.h1.length !== 1) {
      pushPageFinding(createFinding({
        id: `h1-${hashId(page.url)}`,
        messageKey: "page.h1Structure",
        params: { url: page.url, h1Count: page.h1.length },
        url: page.url
      }));
    }

    if (!page.canonical) {
      pushPageFinding(createFinding({
        id: `canonical-${hashId(page.url)}`,
        messageKey: "page.missingCanonical",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (!page.hasJsonLd) {
      pushPageFinding(createFinding({
        id: `schema-${hashId(page.url)}`,
        messageKey: "page.missingJsonLd",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (page.readableTextLength < 500) {
      pushPageFinding(createFinding({
        id: `thin-content-${hashId(page.url)}`,
        messageKey: "page.lowReadableContent",
        params: { url: page.url, readableTextLength: page.readableTextLength },
        url: page.url
      }));
    }
  }

  for (const match of analyzeTitlePatterns(pages)) {
    const representativeUrls = match.affectedUrls.slice(0, 3);
    const messageKey: FindingMessageKey = match.kind === "exact_duplicate"
      ? "page.duplicateTitles"
      : "page.dominantTitleTemplate";
    const patternPosition = match.kind === "dominant_prefix"
      ? "prefix"
      : match.kind === "dominant_suffix"
        ? "suffix"
        : "full";
    findings.push({
      ...createFinding({
        id: `title-pattern-${hashId(`${match.kind}:${match.affectedUrls.join("|")}`)}`,
        messageKey,
        params: {
          patternPosition,
          sharedLength: match.sharedLength,
          affectedCount: match.affectedUrls.length
        },
        url: representativeUrls[0]
      }),
      aggregation: {
        affectedCount: match.affectedUrls.length,
        representativeUrls,
        templateKey: `title-pattern:${match.kind}`
      }
    });
  }

  if (homepage && isSuccessfulStatus(homepage.status) && !homepage.hasOpenGraph) {
    const pageType = classifyPageType(homepage.url, {
      title: homepage.title,
      description: homepage.metaDescription,
      headings: [...homepage.h1, ...homepage.h2].map((text) => ({ text }))
    });
    pageFindings.push({
      finding: createFinding({
        id: "homepage-og",
        messageKey: "homepage.missingOpenGraph",
        params: { url: homepage.url },
        url: homepage.url
      }),
      pageType,
      templateKey: inferTemplateKey(homepage.url, pageType)
    });
  }

  return [...findings, ...aggregatePageFindings(pageFindings)];
}

function aggregatePageFindings(candidates: PageFindingCandidate[]): GeoFinding[] {
  const groups = new Map<string, PageFindingCandidate[]>();
  for (const candidate of candidates) {
    const ruleKey = candidate.finding.messageKey ?? candidate.finding.id;
    const groupKey = `${ruleKey}\u0000${candidate.pageType}\u0000${candidate.templateKey}`;
    const group = groups.get(groupKey) ?? [];
    group.push(candidate);
    groups.set(groupKey, group);
  }

  return [...groups.entries()].map(([groupKey, group]) => {
    const first = group[0];
    const representativeUrls = [
      ...new Set(group.map(({ finding }) => finding.url).filter((url): url is string => Boolean(url)))
    ].slice(0, 3);
    return {
      ...first.finding,
      id: group.length === 1 ? first.finding.id : `group-${hashId(groupKey)}`,
      url: representativeUrls[0] ?? first.finding.url,
      aggregation: {
        affectedCount: group.length,
        representativeUrls,
        pageType: first.pageType,
        templateKey: first.templateKey
      }
    };
  });
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function createFinding({
  id,
  messageKey,
  params = {},
  url
}: {
  id: string;
  messageKey: FindingMessageKey;
  params?: FindingMessageParams;
  url?: string;
}): GeoFinding {
  const definition = FINDING_MESSAGE_CATALOG[messageKey];

  return {
    id,
    severity: definition.severity,
    messageKey,
    params,
    title: renderMessageTemplate(definition.title, params),
    description: renderMessageTemplate(definition.description, params),
    recommendation: renderMessageTemplate(definition.recommendation, params),
    url
  };
}

export function renderFindingMessage(
  messageKey: FindingMessageKey,
  field: keyof Pick<GeoFinding, "title" | "description" | "recommendation">,
  params: FindingMessageParams = {}
): string {
  return renderMessageTemplate(FINDING_MESSAGE_CATALOG[messageKey][field], params);
}

function renderMessageTemplate(template: MessageTemplate, params: FindingMessageParams): string {
  return typeof template === "function" ? template(params) : template;
}

const FINDING_PENALTY: Record<FindingSeverity, number> = {
  critical: 18,
  warning: 8,
  info: 3
};

const FINDING_PENALTY_CAP: Record<FindingSeverity, number> = {
  critical: 30,
  warning: 16,
  info: 6
};

export function calculateScore(findings: GeoFinding[], pages: AuditedPage[]): number {
  const rules = new Map<string, { affectedCount: number; severity: FindingSeverity }>();
  for (const finding of findings) {
    const ruleKey = finding.messageKey ?? finding.id;
    const current = rules.get(ruleKey);
    const affectedCount = Math.max(1, finding.aggregation?.affectedCount ?? 1);
    rules.set(ruleKey, {
      affectedCount: (current?.affectedCount ?? 0) + affectedCount,
      severity: current?.severity ?? finding.severity
    });
  }
  const penalty = [...rules.values()].reduce(
    (sum, rule) =>
      sum + Math.min(FINDING_PENALTY[rule.severity] * rule.affectedCount, FINDING_PENALTY_CAP[rule.severity]),
    0
  );
  const coverageBonus = Math.min(pages.length, 5) * 2;
  return Math.max(0, Math.min(100, 88 + coverageBonus - penalty));
}

function assetCheck(name: string, result: FetchResult): AssetCheck {
  return {
    url: result.url,
    present: result.ok && result.text.trim().length > 0,
    status: result.status,
    summary:
      result.ok && result.text.trim().length > 0
        ? `${name} is available.`
        : `${name} was not found or returned an empty response.`
  };
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OpenGEOConsole/0.1 (+https://github.com/open-geo-console)"
      }
    });
    clearTimeout(timeout);
    return {
      url,
      status: response.status,
      ok: response.ok,
      text: await response.text()
    };
  } catch {
    return {
      url,
      status: 0,
      ok: false,
      text: ""
    };
  }
}

function normalizeRootUrl(input: string): URL {
  const url = new URL(input.startsWith("http") ? input : `https://${input}`);
  url.hash = "";
  url.search = "";
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/";
  }
  return url;
}

function textFromTag(html: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(html);
  return match ? decodeEntities(stripHtml(match[1])).trim() : undefined;
}

function headings(html: string, tag: "h1" | "h2"): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => decodeEntities(stripHtml(match[1])).trim())
    .filter(Boolean);
}

function metaContent(html: string, name: string): string | undefined {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*name=["']${name}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`,
    "i"
  );
  return pattern.exec(html)?.[1];
}

function linkHref(html: string, rel: string): string | undefined {
  const pattern = new RegExp(
    `<link\\b(?=[^>]*rel=["']${rel}["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>`,
    "i"
  );
  return pattern.exec(html)?.[1];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hashId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
