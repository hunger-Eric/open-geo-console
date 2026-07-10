import { parseHttpUrl } from "./security";

export interface PageHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export type BrowserFallbackReason =
  | "insufficient-readable-text"
  | "hydration-root-without-content"
  | "client-rendering-marker";

export interface BrowserFallbackDecision {
  required: boolean;
  reasons: BrowserFallbackReason[];
}

export interface ExtractedPageContent {
  url: string;
  title: string;
  description: string;
  canonical?: string;
  language?: string;
  headings: PageHeading[];
  jsonLd: unknown[];
  jsonLdTypes: string[];
  text: string;
  wordCount: number;
  links: string[];
  browserFallback: BrowserFallbackDecision;
}

export interface HtmlExtractionOptions {
  minimumReadableCharacters?: number;
  maximumReadableCharacters?: number;
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>|<\/li\s*>|<\/h[1-6]\s*>|<\/div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? decodeHtmlEntities(value.trim()) : undefined;
}

function extractMetaContent(html: string, key: "name" | "property", value: string): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (extractAttribute(match[0], key)?.toLowerCase() === value.toLowerCase()) {
      return extractAttribute(match[0], "content") ?? "";
    }
  }
  return "";
}

function extractCanonical(html: string, baseUrl: URL): string | undefined {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = extractAttribute(match[0], "rel")?.toLowerCase().split(/\s+/) ?? [];
    const href = extractAttribute(match[0], "href");
    if (!rel.includes("canonical") || !href) continue;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function extractLinks(html: string, base: string | URL): string[] {
  const baseUrl = parseHttpUrl(base);
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = extractAttribute(match[0], "href");
    if (!href || href.startsWith("#")) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      links.add(url.href);
    } catch {
      // Malformed links are discovery noise, not crawler failures.
    }
  }
  return [...links];
}

function collectJsonLdTypes(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdTypes(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") output.add(type);
  if (Array.isArray(type)) {
    type.filter((item): item is string => typeof item === "string").forEach((item) => output.add(item));
  }
  if (record["@graph"]) collectJsonLdTypes(record["@graph"], output);
}

export function extractJsonLd(html: string): { values: unknown[]; types: string[] } {
  const values: unknown[] = [];
  const types = new Set<string>();
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    if (extractAttribute(match[1] ?? "", "type")?.toLowerCase() !== "application/ld+json") continue;
    const source = (match[2] ?? "").trim();
    if (!source) continue;
    try {
      const value: unknown = JSON.parse(source);
      values.push(value);
      collectJsonLdTypes(value, types);
    } catch {
      // Invalid JSON-LD should be reported by the audit layer; extraction remains usable.
    }
  }
  return { values, types: [...types] };
}

export function extractReadableText(html: string, maximumCharacters = 200_000): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html;
  const withoutBoilerplate = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|canvas|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  return normalizeText(withoutBoilerplate).slice(0, maximumCharacters);
}

export function detectBrowserFallback(
  html: string,
  readableText: string,
  minimumReadableCharacters = 500
): BrowserFallbackDecision {
  const reasons: BrowserFallbackReason[] = [];
  if (readableText.length < minimumReadableCharacters) reasons.push("insufficient-readable-text");

  const hasEmptyHydrationRoot =
    /<(?:div|main)\b[^>]*\bid=["'](?:root|app|__next)["'][^>]*>\s*<\/(?:div|main)>/i.test(html);
  if (hasEmptyHydrationRoot && readableText.length < minimumReadableCharacters) {
    reasons.push("hydration-root-without-content");
  }

  const clientMarkers = /__NEXT_DATA__|data-reactroot|ng-version=|__NUXT__|window\.__INITIAL_STATE__/i.test(html);
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  if (clientMarkers && (readableText.length < minimumReadableCharacters || scriptCount >= 8)) {
    reasons.push("client-rendering-marker");
  }
  return { required: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function extractPageContent(
  html: string,
  pageUrl: string | URL,
  options: HtmlExtractionOptions = {}
): ExtractedPageContent {
  const url = parseHttpUrl(pageUrl);
  const title = normalizeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  const description =
    extractMetaContent(html, "name", "description") || extractMetaContent(html, "property", "og:description");
  const headings: PageHeading[] = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)]
    .map((match) => ({
      level: Number(match[1]) as PageHeading["level"],
      text: normalizeText(match[2] ?? "")
    }))
    .filter(({ text }) => text.length > 0);
  const jsonLd = extractJsonLd(html);
  const maximumCharacters = options.maximumReadableCharacters ?? 200_000;
  const text = extractReadableText(html, maximumCharacters);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";

  return {
    url: url.href,
    title,
    description,
    canonical: extractCanonical(html, url),
    language: extractAttribute(htmlTag, "lang"),
    headings,
    jsonLd: jsonLd.values,
    jsonLdTypes: jsonLd.types,
    text,
    wordCount: text ? text.split(/\s+/u).filter(Boolean).length : 0,
    links: extractLinks(html, url),
    browserFallback: detectBrowserFallback(
      html,
      text,
      options.minimumReadableCharacters ?? 500
    )
  };
}
