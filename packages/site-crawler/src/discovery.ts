import { decodeHtmlEntities, extractLinks } from "./html";
import { createSiteKey, type SiteKeyOptions } from "./site-key";
import { parseHttpUrl } from "./security";

export const MAX_DISCOVERED_URLS = 50_000;

export type DiscoverySource = "seed" | "sitemap" | "link";

export interface DiscoveredUrl {
  url: string;
  sources: DiscoverySource[];
  lastModified?: string;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
}

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | "unknown";
  entries: SitemapEntry[];
}

export interface SiteDiscoveryOptions extends SiteKeyOptions {
  maxUrls?: number;
}

const TRACKING_PARAMETERS = /^(?:utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|ref_src)$/i;
const NON_HTML_EXTENSIONS = /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|mov|pdf|png|pptx?|rar|rss|svg|tar|tiff?|ttf|txt|webm|webp|woff2?|xlsx?|xml|zip)$/i;

export function normalizeDiscoveredUrl(input: string | URL, base?: string | URL): URL | null {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (NON_HTML_EXTENSIONS.test(url.pathname)) return null;
  return url;
}

export function parseSitemapXml(xml: string, sitemapUrl: string | URL): ParsedSitemap {
  const base = parseHttpUrl(sitemapUrl);
  const kind: ParsedSitemap["kind"] = /<sitemapindex\b/i.test(xml)
    ? "sitemapindex"
    : /<urlset\b/i.test(xml)
      ? "urlset"
      : "unknown";
  const entryPattern = kind === "sitemapindex" ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi : /<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi;
  const entries: SitemapEntry[] = [];
  for (const match of xml.matchAll(entryPattern)) {
    const body = match[1] ?? "";
    const rawLocation = body.match(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/i)?.[1];
    if (!rawLocation) continue;
    try {
      const url = new URL(decodeHtmlEntities(rawLocation.trim()), base);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const lastModified = body.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod\s*>/i)?.[1]?.trim();
      entries.push({ url: url.href, ...(lastModified ? { lastModified } : {}) });
    } catch {
      // Ignore malformed sitemap rows and continue with usable entries.
    }
  }
  return { kind, entries };
}

export interface RobotsRule {
  directive: "allow" | "disallow";
  path: string;
}

export interface RobotsPolicy {
  userAgent: string;
  rules: RobotsRule[];
  sitemaps: string[];
}

export function parseRobotsTxt(
  text: string,
  robotsUrl: string | URL,
  userAgent = "OpenGeoConsoleBot"
): RobotsPolicy {
  const base = parseHttpUrl(robotsUrl);
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  const sitemaps: string[] = [];
  let group: { agents: string[]; rules: RobotsRule[] } | undefined;
  let sawRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const delimiter = line.indexOf(":");
    if (delimiter < 0) continue;
    const directive = line.slice(0, delimiter).trim().toLowerCase();
    const value = line.slice(delimiter + 1).trim();
    if (directive === "sitemap") {
      try {
        sitemaps.push(new URL(value, base).href);
      } catch {
        // Ignore invalid sitemap hints.
      }
      continue;
    }
    if (directive === "user-agent") {
      if (!group || sawRule) {
        group = { agents: [], rules: [] };
        groups.push(group);
        sawRule = false;
      }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if ((directive === "allow" || directive === "disallow") && group) {
      if (value || directive === "allow") {
        group.rules.push({ directive, path: value });
      }
      sawRule = true;
    }
  }

  const normalizedAgent = userAgent.toLowerCase();
  const applicable = groups
    .map((candidate) => ({
      ...candidate,
      specificity: Math.max(
        ...candidate.agents.map((agent) =>
          agent === "*" ? 0 : normalizedAgent.includes(agent) ? agent.length : -1
        )
      )
    }))
    .filter(({ specificity }) => specificity >= 0);
  const highestSpecificity = Math.max(-1, ...applicable.map(({ specificity }) => specificity));
  const rules = applicable
    .filter(({ specificity }) => specificity === highestSpecificity)
    .flatMap((candidate) => candidate.rules);
  return { userAgent, rules, sitemaps: [...new Set(sitemaps)] };
}

function robotsPatternMatches(pathAndQuery: string, pattern: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(pathAndQuery);
}

export function isAllowedByRobots(url: string | URL, policy: RobotsPolicy): boolean {
  const target = parseHttpUrl(url);
  const path = `${target.pathname}${target.search}`;
  const matches = policy.rules.filter((rule) => robotsPatternMatches(path, rule.path));
  if (matches.length === 0) return true;
  matches.sort((a, b) => b.path.length - a.path.length || (a.directive === "allow" ? -1 : 1));
  return matches[0]!.directive === "allow";
}

export class SiteDiscovery {
  readonly startUrl: URL;
  readonly siteKey: string;
  readonly maxUrls: number;
  private readonly options: SiteDiscoveryOptions;
  private readonly inventory = new Map<string, DiscoveredUrl>();

  constructor(startUrl: string | URL, options: SiteDiscoveryOptions = {}) {
    this.startUrl = parseHttpUrl(startUrl);
    this.options = options;
    this.siteKey = createSiteKey(this.startUrl, options);
    this.maxUrls = Math.min(Math.max(options.maxUrls ?? MAX_DISCOVERED_URLS, 1), MAX_DISCOVERED_URLS);
    this.add(this.startUrl, "seed");
  }

  private add(input: string | URL, source: DiscoverySource, lastModified?: string): boolean {
    const url = normalizeDiscoveredUrl(input, this.startUrl);
    if (!url || createSiteKey(url, this.options) !== this.siteKey) return false;
    const existing = this.inventory.get(url.href);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.lastModified && lastModified) existing.lastModified = lastModified;
      return false;
    }
    if (this.inventory.size >= this.maxUrls) return false;
    this.inventory.set(url.href, {
      url: url.href,
      sources: [source],
      ...(lastModified ? { lastModified } : {})
    });
    return true;
  }

  addSitemapDocument(xml: string, sitemapUrl: string | URL): string[] {
    const parsed = parseSitemapXml(xml, sitemapUrl);
    if (parsed.kind === "sitemapindex") {
      return parsed.entries
        .map(({ url }) => {
          try {
            return parseHttpUrl(url);
          } catch {
            return null;
          }
        })
        .filter((url): url is URL => url !== null)
        .filter((url) => createSiteKey(url, this.options) === this.siteKey)
        .map((url) => url.href);
    }
    for (const entry of parsed.entries) this.add(entry.url, "sitemap", entry.lastModified);
    return [];
  }

  addHtmlDocument(html: string, pageUrl: string | URL): number {
    let added = 0;
    for (const link of extractLinks(html, pageUrl)) {
      if (this.add(link, "link")) added += 1;
    }
    return added;
  }

  getUrls(): DiscoveredUrl[] {
    return [...this.inventory.values()].map((entry) => ({ ...entry, sources: [...entry.sources] }));
  }
}
