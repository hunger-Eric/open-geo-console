import type { JsonCompletionClient } from "./client";
import {
  REPORT_TIER_LIMITS,
  type PageCandidate,
  type PagePlan,
  type PageType,
  type PlannedPage,
  type ReportTier
} from "./types";

export const MAX_DISCOVERED_URLS = 50_000;
export const MAX_PLANNING_CANDIDATES = 500;

const pathPatterns: Array<[PageType, RegExp]> = [
  ["pricing", /(?:^|\/)(?:pricing|plans?|tariffs?)(?:\/|$)/i],
  ["about", /(?:^|\/)(?:about|company|who-we-are)(?:\/|$)/i],
  ["contact", /(?:^|\/)(?:contact|support)(?:\/|$)/i],
  ["case-study", /(?:^|\/)(?:case-stud(?:y|ies)|customers?|success-stories)(?:\/|$)/i],
  ["documentation", /(?:^|\/)(?:docs?|documentation|help|guides?)(?:\/|$)/i],
  ["product", /(?:^|\/)(?:products?|features?|solutions?)(?:\/|$)/i],
  ["service", /(?:^|\/)(?:services?)(?:\/|$)/i],
  ["blog", /(?:^|\/)(?:blog|articles?|insights?)(?:\/|$)/i],
  ["news", /(?:^|\/)(?:news|press|updates?)(?:\/|$)/i],
  ["legal", /(?:^|\/)(?:legal|privacy|terms|cookies?)(?:\/|$)/i]
];

const pageTypeWeight: Record<PageType, number> = {
  home: 100,
  product: 90,
  service: 88,
  about: 85,
  pricing: 82,
  "case-study": 78,
  contact: 70,
  documentation: 64,
  blog: 58,
  news: 54,
  legal: 20,
  other: 40
};

export function inferPageType(urlValue: string): PageType {
  try {
    const url = new URL(urlValue);
    if (url.pathname === "/" || url.pathname === "") return "home";
    for (const [type, pattern] of pathPatterns) {
      if (pattern.test(url.pathname)) return type;
    }
  } catch {
    return "other";
  }
  return "other";
}

function canonicalCandidateUrl(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function candidateScore(candidate: PageCandidate): number {
  const type = candidate.pageType ?? inferPageType(candidate.url);
  const updated = candidate.lastModified ? Date.parse(candidate.lastModified) : Number.NaN;
  const freshness = Number.isFinite(updated) ? Math.min(10, Math.max(0, (updated - Date.UTC(2020, 0, 1)) / 31_536_000_000)) : 0;
  return pageTypeWeight[type] + freshness;
}

export function preparePlanningCandidates(
  candidates: readonly PageCandidate[],
  maxCandidates = MAX_PLANNING_CANDIDATES
): PageCandidate[] {
  const deduplicated = new Map<string, PageCandidate>();
  for (const candidate of candidates.slice(0, MAX_DISCOVERED_URLS)) {
    const url = canonicalCandidateUrl(candidate.url);
    if (!url || deduplicated.has(url)) continue;
    deduplicated.set(url, {
      ...candidate,
      url,
      pageType: candidate.pageType ?? inferPageType(url)
    });
  }
  return [...deduplicated.values()]
    .sort((left, right) => candidateScore(right) - candidateScore(left) || left.url.localeCompare(right.url))
    .slice(0, Math.max(0, Math.min(maxCandidates, MAX_PLANNING_CANDIDATES)));
}

function deterministicPlan(candidates: readonly PageCandidate[], tier: ReportTier): PlannedPage[] {
  const limit = REPORT_TIER_LIMITS[tier];
  const selected: PageCandidate[] = [];
  const remaining = [...candidates];

  for (const preferredType of [
    "home",
    "product",
    "service",
    "about",
    "pricing",
    "case-study",
    "contact",
    "documentation",
    "blog",
    "news"
  ] satisfies PageType[]) {
    const index = remaining.findIndex((candidate) => candidate.pageType === preferredType);
    if (index >= 0 && selected.length < limit) {
      selected.push(remaining[index]!);
      remaining.splice(index, 1);
    }
  }
  selected.push(...remaining.slice(0, Math.max(0, limit - selected.length)));

  return selected.map((candidate, index) => ({
    url: candidate.url,
    pageType: candidate.pageType ?? inferPageType(candidate.url),
    priority: Math.max(1, 100 - index),
    reason: "Deterministic representative-page fallback"
  }));
}

function parseModelPlan(value: unknown, allowed: Map<string, PageCandidate>, limit: number): PlannedPage[] {
  if (!value || typeof value !== "object") return [];
  const selected = (value as Record<string, unknown>).selected;
  if (!Array.isArray(selected)) return [];
  const results: PlannedPage[] = [];
  const seen = new Set<string>();

  for (const item of selected) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string") continue;
    const normalized = canonicalCandidateUrl(record.url);
    const candidate = normalized ? allowed.get(normalized) : undefined;
    if (!normalized || !candidate || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({
      url: normalized,
      pageType: candidate.pageType ?? inferPageType(normalized),
      priority:
        typeof record.priority === "number" && Number.isFinite(record.priority)
          ? Math.max(1, Math.min(100, Math.round(record.priority)))
          : Math.max(1, 100 - results.length),
      reason:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : "Selected by the AI planning model"
    });
    if (results.length >= limit) break;
  }
  return results;
}

export interface PlanPagesInput {
  tier: ReportTier;
  locale: string;
  targetUrl: string;
  candidates: readonly PageCandidate[];
  signal?: AbortSignal;
}

export async function planPages(
  client: JsonCompletionClient,
  input: PlanPagesInput
): Promise<PagePlan> {
  const candidates = preparePlanningCandidates(input.candidates);
  const limit = REPORT_TIER_LIMITS[input.tier];
  if (candidates.length === 0) {
    return { tier: input.tier, selected: [], modelId: client.configuredModel, fallbackUsed: true };
  }

  if (input.tier === "free") {
    const target = canonicalCandidateUrl(input.targetUrl);
    const homepage = candidates.find((candidate) => candidate.url === target || candidate.pageType === "home") ?? candidates[0]!;
    return {
      tier: input.tier,
      selected: [{
        url: homepage.url,
        pageType: "home",
        priority: 100,
        reason: "Homepage-only free preview"
      }],
      modelId: client.configuredModel,
      fallbackUsed: true
    };
  }

  const compactCandidates = candidates.map((candidate) => ({
    url: candidate.url,
    pageType: candidate.pageType,
    title: candidate.title?.slice(0, 180),
    description: candidate.description?.slice(0, 240),
    lastModified: candidate.lastModified,
    textPreview: candidate.textPreview?.slice(0, 300)
  }));

  const completion = await client.completeJson({
    signal: input.signal,
    temperature: 0,
    maxTokens: 4_000,
    messages: [
      {
        role: "system",
        content:
          "You plan evidence-based website audits. Return JSON only. Select representative public pages; prioritize home, products/services, about, pricing, case studies and contact, then sample current editorial or documentation content. Never invent a URL."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Select pages for a full semantic GEO and organization analysis.",
          targetUrl: input.targetUrl,
          locale: input.locale,
          maximumPages: limit,
          outputShape: {
            selected: [{ url: "candidate URL", priority: "1-100", reason: "short reason" }]
          },
          candidates: compactCandidates
        })
      }
    ]
  });

  const allowed = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  const modelSelected = parseModelPlan(completion.value, allowed, limit);
  const fallback = deterministicPlan(candidates, input.tier);
  const selected = [...modelSelected];
  const selectedUrls = new Set(selected.map((page) => page.url));
  for (const page of fallback) {
    if (selected.length >= Math.min(limit, candidates.length)) break;
    if (!selectedUrls.has(page.url)) {
      selected.push(page);
      selectedUrls.add(page.url);
    }
  }

  return {
    tier: input.tier,
    selected,
    modelId: completion.modelId,
    fallbackUsed: modelSelected.length !== selected.length
  };
}
