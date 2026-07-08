export type FindingSeverity = "critical" | "warning" | "info";
export type FindingMessageParamValue = string | number | boolean;
export type FindingMessageParams = Record<string, FindingMessageParamValue>;

export type FindingMessageKey =
  | "asset.missingLlmsTxt"
  | "asset.missingSitemapXml"
  | "asset.missingRobotsTxt"
  | "page.badStatus"
  | "page.weakTitle"
  | "page.missingMetaDescription"
  | "page.h1Structure"
  | "page.missingCanonical"
  | "page.missingJsonLd"
  | "page.lowReadableContent"
  | "homepage.missingOpenGraph";

export interface GeoFinding {
  id: string;
  severity: FindingSeverity;
  messageKey?: FindingMessageKey;
  params?: FindingMessageParams;
  title: string;
  description: string;
  recommendation: string;
  url?: string;
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

export async function auditSite(inputUrl: string): Promise<GeoAuditReport> {
  const root = normalizeRootUrl(inputUrl);
  const scannedAt = new Date().toISOString();
  const [home, robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    fetchText(root.href),
    fetchText(new URL("/robots.txt", root).href),
    fetchText(new URL("/sitemap.xml", root).href),
    fetchText(new URL("/llms.txt", root).href)
  ]);

  const sitemapUrls = sitemapXml.ok ? extractSitemapUrls(sitemapXml.text, root) : [];
  const representativeUrls = selectRepresentativePages(root, sitemapUrls);
  const pageResults = await Promise.all(representativeUrls.map((url) => fetchText(url)));
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

function buildFindings(
  siteUrl: string,
  pages: AuditedPage[],
  assets: MachineReadableAssets
): GeoFinding[] {
  const findings: GeoFinding[] = [];
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
    if (page.status >= 400) {
      findings.push(createFinding({
        id: `bad-status-${hashId(page.url)}`,
        messageKey: "page.badStatus",
        params: { url: page.url, status: page.status },
        url: page.url
      }));
    }

    if (!page.title || page.title.length < 10) {
      findings.push(createFinding({
        id: `missing-title-${hashId(page.url)}`,
        messageKey: "page.weakTitle",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (!page.metaDescription) {
      findings.push(createFinding({
        id: `missing-description-${hashId(page.url)}`,
        messageKey: "page.missingMetaDescription",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (page.h1.length !== 1) {
      findings.push(createFinding({
        id: `h1-${hashId(page.url)}`,
        messageKey: "page.h1Structure",
        params: { url: page.url, h1Count: page.h1.length },
        url: page.url
      }));
    }

    if (!page.canonical) {
      findings.push(createFinding({
        id: `canonical-${hashId(page.url)}`,
        messageKey: "page.missingCanonical",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (!page.hasJsonLd) {
      findings.push(createFinding({
        id: `schema-${hashId(page.url)}`,
        messageKey: "page.missingJsonLd",
        params: { url: page.url },
        url: page.url
      }));
    }

    if (page.readableTextLength < 500 && page.status < 400) {
      findings.push(createFinding({
        id: `thin-content-${hashId(page.url)}`,
        messageKey: "page.lowReadableContent",
        params: { url: page.url, readableTextLength: page.readableTextLength },
        url: page.url
      }));
    }
  }

  if (homepage && !homepage.hasOpenGraph) {
    findings.push(createFinding({
      id: "homepage-og",
      messageKey: "homepage.missingOpenGraph",
      params: { url: homepage.url },
      url: homepage.url
    }));
  }

  return findings;
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

function calculateScore(findings: GeoFinding[], pages: AuditedPage[]): number {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === "critical") return sum + 18;
    if (finding.severity === "warning") return sum + 8;
    return sum + 3;
  }, 0);
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

async function fetchText(url: string): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, {
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
