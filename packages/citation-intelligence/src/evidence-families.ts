import { createHash } from "node:crypto";
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "./domain-independence";
import type { EvidenceFamily, RetrievedPublicSourceFact } from "./types";

export function publicEvidenceId(resultUrl: string, normalizedContentHash?: string): string {
  return `public-evidence:${canonicalizePublicSourceUrl(resultUrl)}|${normalizedContentHash?.trim() || "metadata-only"}`;
}

export function evidenceFamilyId(hashOrUrl: string): string {
  return `evidence-family:${createHash("sha256").update(hashOrUrl).digest("hex").slice(0, 24)}`;
}

export function createEvidenceFamilies(retrievals: readonly RetrievedPublicSourceFact[]): EvidenceFamily[] {
  const groups = new Map<string, RetrievedPublicSourceFact[]>();
  for (const retrieval of retrievals) {
    const canonical = canonicalizePublicSourceUrl(retrieval.finalUrl ?? retrieval.resultUrl);
    const key = retrieval.normalizedContentHash?.trim() || `url:${canonical}`;
    groups.set(key, [...(groups.get(key) ?? []), retrieval]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const evidenceIds = uniqueSorted(items.map((item) => publicEvidenceId(item.finalUrl ?? item.resultUrl, item.normalizedContentHash)));
    const registrableDomains = uniqueSorted(items.map((item) => getPublicSourceDomainIdentity(item.finalUrl ?? item.resultUrl).registrableDomain));
    const normalizedContentHash = items[0]?.normalizedContentHash?.trim() || key;
    return {
      evidenceFamilyId: evidenceFamilyId(key),
      normalizedContentHash,
      evidenceIds,
      registrableDomains,
      independentDomainCount: registrableDomains.length,
      // Identical normalized content is one editorial act even when republished by many domains.
      countsAsIndependentEvidence: evidenceIds.length === 1
    };
  }).sort((left, right) => left.evidenceFamilyId.localeCompare(right.evidenceFamilyId));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
