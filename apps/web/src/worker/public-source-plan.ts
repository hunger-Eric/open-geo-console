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

  for (const observation of observations) {
    for (const result of [...observation.results].sort((left, right) => left.surfaceResultOrder - right.surfaceResultOrder)) {
      const canonicalUrl = canonicalizePublicSourceUrl(result.url);
      if (seenUrls.has(canonicalUrl)) continue;
      const registrableDomain = getPublicSourceDomainIdentity(canonicalUrl).registrableDomain;
      if ((domainCounts.get(registrableDomain) ?? 0) >= maxPerDomain) continue;
      seenUrls.add(canonicalUrl);
      domainCounts.set(registrableDomain, (domainCounts.get(registrableDomain) ?? 0) + 1);
      plan.push({ observation, result, canonicalUrl, registrableDomain });
      if (plan.length >= maxSources) return plan;
    }
  }
  return plan;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}
