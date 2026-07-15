import type { MarketSearchObservation } from "@open-geo-console/public-search-observer";
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "@open-geo-console/citation-intelligence";

export interface PlannedPublicSource {
  observation: MarketSearchObservation;
  result: MarketSearchObservation["results"][number];
  canonicalUrl: string;
  registrableDomain: string;
}

export function createPublicSourceRetrievalPlan(
  observations: readonly MarketSearchObservation[],
  options: { maxSources?: number; maxPerDomain?: number } = {}
): PlannedPublicSource[] {
  const maxSources = positive(options.maxSources ?? 12, "maxSources");
  const maxPerDomain = positive(options.maxPerDomain ?? 2, "maxPerDomain");
  const seenUrls = new Set<string>();
  const domainCounts = new Map<string, number>();
  const plan: PlannedPublicSource[] = [];

  const candidates = observations.flatMap((observation, observationOrder) => observation.results.map((result) => ({
    observation,
    observationOrder,
    result,
    retrievalRisk: retrievalRisk(result.url)
  }))).sort((left, right) => left.retrievalRisk - right.retrievalRisk ||
    left.result.surfaceResultOrder - right.result.surfaceResultOrder || left.observationOrder - right.observationOrder);

  for (const { observation, result } of candidates) {
      const canonicalUrl = canonicalizePublicSourceUrl(result.url);
      if (seenUrls.has(canonicalUrl)) continue;
      const registrableDomain = getPublicSourceDomainIdentity(canonicalUrl).registrableDomain;
      if ((domainCounts.get(registrableDomain) ?? 0) >= maxPerDomain) continue;
      seenUrls.add(canonicalUrl);
      domainCounts.set(registrableDomain, (domainCounts.get(registrableDomain) ?? 0) + 1);
      plan.push({ observation, result, canonicalUrl, registrableDomain });
      if (plan.length >= maxSources) return plan;
  }
  return plan;
}

function retrievalRisk(value: string): number {
  const url = new URL(value);
  const path = url.pathname.toLocaleLowerCase();
  if (/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)(?:$|\/)/u.test(path)) return 2;
  if (/(?:^|\/)(?:download|attachment|file)(?:\/|$)/u.test(path) || [...url.searchParams.keys()].some((key) => /^(?:download|attachment|file)$/iu.test(key))) return 1;
  return 0;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}
