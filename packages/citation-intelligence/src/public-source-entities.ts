import { createHash } from "node:crypto";
import type { PublicSourceEvidence, ResolvedPublicEntity, RetrievedPublicSourceFact } from "./types";
import { publicEvidenceId } from "./evidence-families";
import { getPublicSourceDomainIdentity } from "./domain-independence";

export function resolvePublicEntities(
  retrievals: readonly RetrievedPublicSourceFact[],
  evidence: readonly PublicSourceEvidence[]
): ResolvedPublicEntity[] {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const mentionsByName = new Map<string, Array<{ mention: NonNullable<RetrievedPublicSourceFact["entityMentions"]>[number]; retrieval: RetrievedPublicSourceFact }>>();
  for (const retrieval of retrievals) {
    for (const mention of retrieval.entityMentions ?? []) {
      const key = normalizePublicEntityName(mention.name);
      if (!key) continue;
      mentionsByName.set(key, [...(mentionsByName.get(key) ?? []), { mention, retrieval }]);
    }
  }
  return [...mentionsByName.entries()].map(([normalizedName, items]): ResolvedPublicEntity => {
    const candidateIds = uniqueSorted(items.map(({ mention, retrieval }) =>
      mention.entityId?.trim() || deterministicEntityId(
        mention.name,
        mention.registrableDomain ?? getPublicSourceDomainIdentity(retrieval.finalUrl ?? retrieval.resultUrl).registrableDomain
      )
    ));
    const registrableDomains = uniqueSorted(items.map(({ mention, retrieval }) =>
      mention.registrableDomain?.trim().toLocaleLowerCase() ||
      getPublicSourceDomainIdentity(retrieval.finalUrl ?? retrieval.resultUrl).registrableDomain
    ));
    const evidenceIds = uniqueSorted(items.map(({ retrieval }) => publicEvidenceId(retrieval.finalUrl ?? retrieval.resultUrl, retrieval.normalizedContentHash)));
    const observationIds = uniqueSorted(items.map(({ retrieval }) => retrieval.observationId));
    const familyDomains = new Map<string, Set<string>>();
    for (const evidenceId of evidenceIds) {
      const item = evidenceById.get(evidenceId);
      if (!item) continue;
      const domains = familyDomains.get(item.evidenceFamilyId) ?? new Set<string>();
      domains.add(item.registrableDomain);
      familyDomains.set(item.evidenceFamilyId, domains);
    }
    const independentRegistrableDomains = uniqueSorted(
      [...familyDomains.values()].flatMap((domains) => [...domains].slice(0, 1))
    );
    return {
      entityId: candidateIds.length === 1 ? candidateIds[0]! : `ambiguous:${hash(normalizedName)}`,
      canonicalName: items.map(({ mention }) => mention.name.trim()).sort((a, b) => a.localeCompare(b))[0]!,
      status: candidateIds.length === 1 ? "resolved" : "ambiguous",
      candidateEntityIds: candidateIds,
      registrableDomains,
      independentRegistrableDomains,
      evidenceIds,
      observationIds
    };
  }).sort((left, right) => left.entityId.localeCompare(right.entityId));
}

export function normalizePublicEntityName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function deterministicEntityId(name: string, domain?: string): string {
  return `public-entity:${hash(`${normalizePublicEntityName(name)}|${domain?.toLocaleLowerCase() ?? ""}`)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
