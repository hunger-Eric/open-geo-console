import type { DiscoveredUrl } from "./discovery";
import type { ExtractedPageContent } from "./html";
import { parseHttpUrl } from "./security";

export const MAX_CANDIDATE_URLS = 500;
export const FREE_PAGE_LIMIT = 1;
export const DEEP_PAGE_LIMIT = 50;

export type CrawlTier = "free" | "deep";
export type PageType =
  | "home"
  | "product"
  | "service"
  | "about"
  | "pricing"
  | "case-study"
  | "contact"
  | "blog"
  | "news"
  | "help"
  | "careers"
  | "legal"
  | "other";

export interface PageClassificationInput {
  title?: string;
  description?: string;
  headings?: ReadonlyArray<{ text: string }>;
  jsonLdTypes?: ReadonlyArray<string>;
}

export interface PageCandidate extends DiscoveredUrl {
  pageType: PageType;
  templateKey: string;
  priority: number;
  title?: string;
}

const PAGE_PATTERNS: ReadonlyArray<readonly [PageType, RegExp]> = [
  ["pricing", /(?:^|[\s/_-])(pricing|plans?|套餐|价格|定价)(?:$|[\s/_-])/i],
  ["about", /(?:^|[\s/_-])(about|company|who-we-are|关于|公司简介|品牌故事)(?:$|[\s/_-])/i],
  ["case-study", /(?:^|[\s/_-])(case-stud(?:y|ies)|customers?|success-stor(?:y|ies)|案例|客户故事)(?:$|[\s/_-])/i],
  ["contact", /(?:^|[\s/_-])(contact|talk-to-sales|locations?|联系|联系我们)(?:$|[\s/_-])/i],
  ["careers", /(?:^|[\s/_-])(careers?|jobs?|join-us|招聘|加入我们)(?:$|[\s/_-])/i],
  ["help", /(?:^|[\s/_-])(help|support|docs?|documentation|knowledge-base|faq|帮助|文档|支持)(?:$|[\s/_-])/i],
  ["news", /(?:^|[\s/_-])(news|press|media|announcements?|新闻|媒体)(?:$|[\s/_-])/i],
  ["blog", /(?:^|[\s/_-])(blog|articles?|insights?|resources?|博客|文章|洞察)(?:$|[\s/_-])/i],
  ["service", /(?:^|[\s/_-])(services?|solutions?|consulting|服务|解决方案)(?:$|[\s/_-])/i],
  ["product", /(?:^|[\s/_-])(products?|platform|features?|software|产品|平台|功能)(?:$|[\s/_-])/i],
  ["legal", /(?:^|[\s/_-])(privacy|terms|legal|cookies?|compliance|隐私|条款|法律)(?:$|[\s/_-])/i]
];

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source"
]);

const QUERY_ID_KEYS = /^(?:id|article_?id|item_?id|news_?id|post_?id|product_?id|service_?id)$/i;
const QUERY_PAGE_KEYS = /^(?:p|page|paged|page_?no|page_?num)$/i;
const QUERY_SLUG_KEYS = /^(?:article|item|name|post|product|service|slug)$/i;
const DETAIL_PATH_TYPES = new Set<PageType>([
  "blog",
  "case-study",
  "help",
  "news",
  "product",
  "service"
]);

const TYPE_PRIORITY: Record<PageType, number> = {
  home: 120,
  product: 105,
  service: 100,
  about: 95,
  pricing: 92,
  "case-study": 88,
  contact: 76,
  help: 68,
  news: 62,
  blog: 60,
  careers: 44,
  legal: 30,
  other: 50
};

export function classifyPageType(
  input: string | URL,
  metadata: PageClassificationInput = {}
): PageType {
  const url = parseHttpUrl(input);
  const bareQueryRoute = getBareQueryRoute(url);
  const queryText = bareQueryRoute
    ? [bareQueryRoute]
    : [...url.searchParams.entries()]
        .filter(([key]) => !isTrackingQueryKey(key))
        .flatMap(([key, value]) => [key, value]);
  if ((url.pathname === "/" || url.pathname === "") && queryText.length === 0) return "home";
  const haystack = safeDecodeURIComponent(
    [url.pathname, ...queryText, metadata.title, metadata.description, ...(metadata.headings ?? []).map(({ text }) => text)]
      .filter(Boolean)
      .join(" ")
  );
  const jsonTypes = new Set((metadata.jsonLdTypes ?? []).map((type) => type.toLowerCase()));
  if (jsonTypes.has("product")) return "product";
  if (jsonTypes.has("service")) return "service";
  if (jsonTypes.has("newsarticle")) return "news";
  if (jsonTypes.has("article") || jsonTypes.has("blogposting")) return "blog";
  if (jsonTypes.has("contactpage")) return "contact";
  if (jsonTypes.has("aboutpage")) return "about";
  return PAGE_PATTERNS.find(([, pattern]) => pattern.test(` ${haystack} `))?.[0] ?? "other";
}

export function inferTemplateKey(input: string | URL, pageType?: PageType): string {
  const url = parseHttpUrl(input);
  const type = pageType ?? classifyPageType(url);
  const bareQueryRoute = getBareQueryRoute(url);
  const queryTemplate = bareQueryRoute ? "" : buildQueryTemplate(url);
  if (type === "home" && !queryTemplate) return "/";
  const effectivePath = bareQueryRoute ?? url.pathname;
  const segments = effectivePath.split("/").filter(Boolean);
  const normalized = segments.map((segment, index) => {
    if (/^\d{4}$/.test(segment) && /^\d{1,2}$/.test(segments[index + 1] ?? "")) return ":year";
    if (/^\d{1,2}$/.test(segment) && /^\d{4}$/.test(segments[index - 1] ?? "")) return ":month";
    if (/^\d+$/.test(segment)) return ":id";
    const numericFile = segment.match(/^\d+(\.[a-z0-9]+)$/i);
    if (numericFile) return `:id${numericFile[1]!.toLowerCase()}`;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    if ((type === "blog" || type === "news" || type === "case-study") && index >= 1) return ":slug";
    if (DETAIL_PATH_TYPES.has(type) && segments.length > 1 && index === segments.length - 1) return ":slug";
    return segment.toLowerCase();
  });
  const depth = (type === "blog" || type === "news") && normalized.includes(":year") ? 4 : 3;
  const pathTemplate = `/${normalized.slice(0, depth).join("/")}`;
  return queryTemplate ? `${pathTemplate}?${queryTemplate}` : pathTemplate;
}

function getBareQueryRoute(url: URL): string | null {
  const raw = url.search.slice(1);
  if (!raw || raw.includes("=") || raw.includes("&")) return null;
  const decoded = safeDecodeURIComponent(raw).trim();
  if (!decoded || decoded.includes("://") || decoded.includes("#") || decoded.includes("?")) return null;
  return `/${decoded.replace(/^\/+/, "")}`;
}

function buildQueryTemplate(url: URL): string {
  return [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingQueryKey(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    )
    .map(([key, value]) => `${key.toLowerCase()}=${normalizeQueryTemplateValue(key, value)}`)
    .join("&");
}

function normalizeQueryTemplateValue(key: string, value: string): string {
  if (QUERY_ID_KEYS.test(key)) return ":id";
  if (QUERY_PAGE_KEYS.test(key)) return ":page";
  if (QUERY_SLUG_KEYS.test(key)) return ":slug";
  return value.toLowerCase();
}

function isTrackingQueryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_QUERY_KEYS.has(normalized);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function recencyScore(lastModified?: string): number {
  if (!lastModified) return 0;
  const timestamp = Date.parse(lastModified);
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(0, 20 - Math.log2(ageDays + 1) * 2);
}

export function buildPageCandidate(
  discovered: DiscoveredUrl,
  metadata?: Partial<ExtractedPageContent>
): PageCandidate {
  const pageType = classifyPageType(discovered.url, metadata);
  const pathDepth = parseHttpUrl(discovered.url).pathname.split("/").filter(Boolean).length;
  return {
    ...discovered,
    sources: [...discovered.sources],
    pageType,
    templateKey: inferTemplateKey(discovered.url, pageType),
    priority:
      TYPE_PRIORITY[pageType] +
      recencyScore(discovered.lastModified) +
      (discovered.sources.includes("sitemap") ? 4 : 0) +
      (discovered.sources.includes("link") ? 2 : 0) -
      Math.max(0, pathDepth - 2) * 2,
    ...(metadata?.title ? { title: metadata.title } : {})
  };
}

export function buildPageCandidates(
  discovered: ReadonlyArray<DiscoveredUrl>,
  metadataByUrl: ReadonlyMap<string, Partial<ExtractedPageContent>> = new Map()
): PageCandidate[] {
  return discovered.map((entry) => buildPageCandidate(entry, metadataByUrl.get(entry.url)));
}

function roundRobinBuckets(
  buckets: Map<string, PageCandidate[]>,
  limit: number
): PageCandidate[] {
  const keys = [...buckets.keys()].sort((left, right) => {
    const leftTop = buckets.get(left)?.[0]?.priority ?? 0;
    const rightTop = buckets.get(right)?.[0]?.priority ?? 0;
    return rightTop - leftTop || left.localeCompare(right);
  });
  const selected: PageCandidate[] = [];
  let round = 0;
  while (selected.length < limit) {
    let added = false;
    for (const key of keys) {
      const candidate = buckets.get(key)?.[round];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}

export function compressCandidates(
  candidates: ReadonlyArray<PageCandidate>,
  maximum = MAX_CANDIDATE_URLS
): PageCandidate[] {
  const limit = Math.min(Math.max(maximum, 1), MAX_CANDIDATE_URLS);
  const unique = new Map<string, PageCandidate>();
  for (const candidate of candidates) {
    const current = unique.get(candidate.url);
    if (!current || candidate.priority > current.priority) unique.set(candidate.url, candidate);
  }
  const buckets = new Map<string, PageCandidate[]>();
  for (const candidate of unique.values()) {
    const key = `${candidate.pageType}:${candidate.templateKey}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(candidate);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => right.priority - left.priority || left.url.localeCompare(right.url));
  }
  return roundRobinBuckets(buckets, limit);
}

const REPRESENTATIVE_TYPE_ORDER: PageType[] = [
  "home",
  "product",
  "service",
  "about",
  "pricing",
  "case-study",
  "contact",
  "help",
  "news",
  "blog",
  "other",
  "careers",
  "legal"
];

export function selectPagesForTier(
  candidates: ReadonlyArray<PageCandidate>,
  tier: CrawlTier
): PageCandidate[] {
  const limit = tier === "free" ? FREE_PAGE_LIMIT : DEEP_PAGE_LIMIT;
  const compressed = compressCandidates(candidates);
  const byType = new Map<PageType, PageCandidate[]>();
  for (const candidate of compressed) {
    const bucket = byType.get(candidate.pageType) ?? [];
    bucket.push(candidate);
    byType.set(candidate.pageType, bucket);
  }
  for (const bucket of byType.values()) {
    bucket.sort((left, right) => right.priority - left.priority || left.url.localeCompare(right.url));
  }

  const selected: PageCandidate[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (selected.length < limit) {
    let added = false;
    for (const type of REPRESENTATIVE_TYPE_ORDER) {
      const candidate = byType.get(type)?.[round];
      if (!candidate || seen.has(candidate.url)) continue;
      selected.push(candidate);
      seen.add(candidate.url);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}
