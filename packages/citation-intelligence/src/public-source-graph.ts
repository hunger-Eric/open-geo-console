import { createHash } from "node:crypto";
import type { MarketSearchObservation } from "@open-geo-console/public-search-observer";
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "./domain-independence";
import { createEvidenceFamilies, evidenceFamilyId, publicEvidenceId } from "./evidence-families";
import { assessPublicSourceEvidenceGrade } from "./public-source-evidence";
import { normalizePublicEntityName, resolvePublicEntities } from "./public-source-entities";
import { scoreRetrievalReadiness } from "./retrieval-readiness";
import { scoreSourceEligibility } from "./source-eligibility";
import type {
  PublicSourceEvidence,
  PublicSourceEvidenceGraph,
  PublicSourceGraphInput,
  PublicSourceOwnershipCategory,
  PublicSourcePatternEvidence,
  RetrievedPublicSourceFact,
  VerifiedPublicClaim
} from "./types";

export function buildPublicSourceEvidenceGraph(input: PublicSourceGraphInput): PublicSourceEvidenceGraph {
  validateRetrievalProvenance(input);
  const families = createEvidenceFamilies(input.retrievals);
  const familyByEvidence = new Map(families.flatMap((family) => family.evidenceIds.map((id) => [id, family] as const)));
  const observations = new Map(input.observations.map((observation) => [observation.observationId, observation]));
  const retrievalGroups = groupRetrievalsByCanonicalUrlAndContent(input.retrievals);
  const preliminary = [...retrievalGroups.values()].map((retrievals) => {
    const representative = retrievals[0]!;
    const canonicalUrl = canonicalizePublicSourceUrl(representative.finalUrl ?? representative.resultUrl);
    const evidenceId = publicEvidenceId(canonicalUrl, representative.normalizedContentHash);
    const domain = getPublicSourceDomainIdentity(canonicalUrl).registrableDomain;
    const refs = retrievals.flatMap((retrieval) => observationRefs(observations.get(retrieval.observationId), retrieval));
    const mentions = retrievals.flatMap((retrieval) => retrieval.entityMentions ?? []);
    const normalizedNames = mentions.map(({ name }) => normalizePublicEntityName(name));
    const entityAmbiguous = normalizedNames.some((name) => {
      const ids = new Set(input.retrievals.flatMap((item) => (item.entityMentions ?? [])
        .filter((mention) => normalizePublicEntityName(mention.name) === name)
        .map((mention) => mention.entityId ?? mention.registrableDomain ?? getPublicSourceDomainIdentity(item.finalUrl ?? item.resultUrl).registrableDomain)));
      return ids.size > 1;
    });
    const claims = retrievals.flatMap((retrieval) => retrieval.claims ?? []);
    const contradictoryGroups = contradictionGroups(input.retrievals);
    const contradictory = claims.some((claim) => claim.contradictionGroupId && contradictoryGroups.has(claim.contradictionGroupId));
    const directFactSupport = claims.some((claim) => claim.directFactSupport);
    const preciseEntityMapping = directFactSupport && claims.filter((claim) => claim.directFactSupport).every((claim) => claim.preciseEntityMapping);
    const normalizedText = retrievals.find(({ normalizedText }) => normalizedText?.trim())?.normalizedText;
    const verifiedExcerpt = retrievals.find(({ verifiedExcerpt }) => verifiedExcerpt?.trim())?.verifiedExcerpt;
    const metadataOnly = !normalizedText?.trim();
    const retrievalState = retrievals.find(({ retrievalState }) => retrievalState === "available")?.retrievalState ?? representative.retrievalState;
    const retrievalReadiness = scoreRetrievalReadiness({
      retrievalState,
      canonicalUrlValid: true,
      publiclyRoutable: retrievals.every(({ publiclyRoutable }) => publiclyRoutable),
      robotsAllowed: retrievals.every(({ robotsAllowed }) => robotsAllowed),
      accessBarrierAbsent: retrievals.every(({ accessBarrier }) => accessBarrier === "none"),
      boundedContent: retrievals.every(({ contentBytes }) => contentBytes !== undefined && contentBytes >= 0 && contentBytes <= 2_097_152),
      usableText: !metadataOnly
    });
    const sourceEligibility = scoreSourceEligibility({
      retrievalReady: retrievalReadiness.ready,
      entityResolved: !entityAmbiguous,
      claimTraceable: claims.length > 0 && claims.every((claim) => claim.subjectName.trim() && claim.predicate.trim() && claim.value.trim()),
      contradictionAbsent: !contradictory,
      metadataOnly
    });
    const family = familyByEvidence.get(evidenceId);
    const grade = assessPublicSourceEvidenceGrade({
      retrievalState,
      verifiedExcerpt,
      directFactSupport,
      preciseEntityMapping,
      entityAmbiguous,
      contradictory,
      metadataOnly,
      independentPattern: false
    });
    return {
      evidenceId,
      canonicalUrl,
      registrableDomain: domain,
      ownershipCategory: categorizePublicOwnership(domain, input),
      retrievalState,
      ...(representative.normalizedContentHash ? { normalizedContentHash: representative.normalizedContentHash } : {}),
      ...(verifiedExcerpt ? { verifiedExcerpt } : {}),
      directFactSupport,
      preciseEntityMapping,
      entityAmbiguous,
      contradictory,
      metadataOnly,
      observationRefs: uniqueRefs(refs),
      queryVariantIds: uniqueSorted(refs.map(({ queryVariantId }) => queryVariantId)),
      entityIds: [] as string[],
      claimIds: [] as string[],
      evidenceFamilyId: family?.evidenceFamilyId ?? evidenceFamilyId(`url:${canonicalUrl}`),
      retrievalReadiness,
      sourceEligibility,
      grade
    } satisfies PublicSourceEvidence;
  }).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));

  const entities = resolvePublicEntities(input.retrievals, preliminary);
  const claims = resolvePublicClaims(input.retrievals, entities);
  const entityIdsByEvidence = new Map<string, string[]>();
  for (const entity of entities) for (const id of entity.evidenceIds) entityIdsByEvidence.set(id, [...(entityIdsByEvidence.get(id) ?? []), entity.entityId]);
  const claimIdsByEvidence = new Map<string, string[]>();
  for (const claim of claims) for (const id of claim.evidenceIds) claimIdsByEvidence.set(id, [...(claimIdsByEvidence.get(id) ?? []), claim.claimId]);
  const evidence = preliminary.map((item) => ({
    ...item,
    entityIds: uniqueSorted(entityIdsByEvidence.get(item.evidenceId) ?? []),
    claimIds: uniqueSorted(claimIdsByEvidence.get(item.evidenceId) ?? [])
  }));
  const patterns = buildPatterns(entities, evidence);
  const attempted = input.observations.filter((observation) => {
    const attemptedUrls = new Set(input.retrievals.filter(({ observationId }) => observationId === observation.observationId).map(({ resultUrl }) => canonicalizePublicSourceUrl(resultUrl)));
    return observation.status === "complete" && observation.results.every(({ url }) => attemptedUrls.has(canonicalizePublicSourceUrl(url)));
  }).map(({ queryId }) => queryId);
  return {
    version: "public-source-evidence-graph-v1",
    evidence,
    evidenceFamilies: families,
    entities,
    claims,
    patterns,
    dimensions: {
      exactQueries: uniqueSorted(input.observations.map(({ exactQuery }) => exactQuery)),
      queryVariantIds: uniqueSorted(input.observations.map(({ queryId }) => queryId)),
      registrableDomains: uniqueSorted(evidence.map(({ registrableDomain }) => registrableDomain)),
      evidenceFamilyIds: uniqueSorted(families.map(({ evidenceFamilyId: id }) => id))
    },
    retrievalAttemptedQueryVariantIds: uniqueSorted(attempted),
    observedQueryVariantIds: uniqueSorted(input.observations.filter(({ status }) => status === "complete").map(({ queryId }) => queryId))
  };
}

function validateRetrievalProvenance(input: PublicSourceGraphInput): void {
  const observations = new Map(input.observations.map((observation) => [observation.observationId, observation]));
  for (const retrieval of input.retrievals) {
    const observation = observations.get(retrieval.observationId);
    if (!observation || observation.queryId !== retrieval.queryId) {
      throw new Error("Every retrieved public source must bind to its exact observation and query variant.");
    }
    const target = canonicalizePublicSourceUrl(retrieval.resultUrl);
    if (!observation.results.some(({ url }) => canonicalizePublicSourceUrl(url) === target)) {
      throw new Error("Retrieved public source URL was not present in the bound search observation.");
    }
  }
}

export function evaluatePublicEntityPresence(input: {
  entityDomain: string;
  expectedQueryVariantIds: readonly string[];
  graph: PublicSourceEvidenceGraph;
}): { status: "present" | "absent" | "unknown"; basis: "matched_registrable_domain" | "complete_observation_and_retrieval" | "incomplete_observation_or_retrieval"; evidenceIds: readonly string[] } {
  const domain = getPublicSourceDomainIdentity(`https://${input.entityDomain}`).registrableDomain;
  const matches = input.graph.evidence.filter(({ registrableDomain }) => registrableDomain === domain).map(({ evidenceId }) => evidenceId);
  if (matches.length > 0) return { status: "present", basis: "matched_registrable_domain", evidenceIds: uniqueSorted(matches) };
  const expected = uniqueSorted(input.expectedQueryVariantIds);
  const observed = new Set(input.graph.observedQueryVariantIds);
  const attempted = new Set(input.graph.retrievalAttemptedQueryVariantIds);
  const complete = expected.length > 0 && expected.every((id) => observed.has(id) && attempted.has(id));
  return complete
    ? { status: "absent", basis: "complete_observation_and_retrieval", evidenceIds: [] }
    : { status: "unknown", basis: "incomplete_observation_or_retrieval", evidenceIds: [] };
}

function groupRetrievalsByCanonicalUrlAndContent(retrievals: readonly RetrievedPublicSourceFact[]) {
  const groups = new Map<string, RetrievedPublicSourceFact[]>();
  for (const retrieval of retrievals) {
    const canonical = canonicalizePublicSourceUrl(retrieval.finalUrl ?? retrieval.resultUrl);
    const contentIdentity = retrieval.normalizedContentHash?.trim() || `state:${retrieval.retrievalState}`;
    const key = `${canonical}\u0000${contentIdentity}`;
    groups.set(key, [...(groups.get(key) ?? []), retrieval]);
  }
  return groups;
}

function observationRefs(observation: MarketSearchObservation | undefined, retrieval: RetrievedPublicSourceFact) {
  if (!observation) return [];
  return observation.results
    .filter(({ url }) => canonicalizePublicSourceUrl(url) === canonicalizePublicSourceUrl(retrieval.resultUrl))
    .map((result) => ({
      observationId: observation.observationId,
      queryVariantId: observation.queryId,
      exactQuery: observation.exactQuery,
      surfaceResultOrder: result.surfaceResultOrder,
      observedUrl: result.url
    }));
}

function resolvePublicClaims(retrievals: readonly RetrievedPublicSourceFact[], entities: ReturnType<typeof resolvePublicEntities>): VerifiedPublicClaim[] {
  const candidates = retrievals.flatMap((retrieval) => (retrieval.claims ?? []).map((claim) => ({ claim, retrieval })));
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = [normalizePublicEntityName(candidate.claim.subjectName), normalize(candidate.claim.predicate), normalize(candidate.claim.value)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const provisional = [...groups.entries()].map(([key, items]) => {
    const first = items[0]!;
    const matchingEntity = entities.find(({ canonicalName }) => normalizePublicEntityName(canonicalName) === normalizePublicEntityName(first.claim.subjectName));
    const evidenceIds = uniqueSorted(items.map(({ retrieval }) => publicEvidenceId(retrieval.finalUrl ?? retrieval.resultUrl, retrieval.normalizedContentHash)));
    return {
      claimId: `public-claim:${hash(key)}`,
      subjectName: first.claim.subjectName,
      ...(matchingEntity ? { subjectEntityId: matchingEntity.entityId } : {}),
      predicate: first.claim.predicate,
      value: first.claim.value,
      status: matchingEntity?.status === "ambiguous" ? "ambiguous" as const : "supported" as const,
      directFactSupport: items.some(({ claim }) => claim.directFactSupport),
      evidenceIds,
      observationIds: uniqueSorted(items.map(({ retrieval }) => retrieval.observationId)),
      contradictionClaimIds: [] as string[],
      contradictionGroupIds: uniqueSorted(items.map(({ claim }) => claim.contradictionGroupId ?? "").filter(Boolean))
    };
  });
  return provisional.map((claim): VerifiedPublicClaim => {
    const contradictions = provisional.filter((other) => other.claimId !== claim.claimId && claim.contradictionGroupIds.some((id) => other.contradictionGroupIds.includes(id)));
    return {
      claimId: claim.claimId,
      subjectName: claim.subjectName,
      ...(claim.subjectEntityId ? { subjectEntityId: claim.subjectEntityId } : {}),
      predicate: claim.predicate,
      value: claim.value,
      status: contradictions.length > 0 ? "contradictory" : claim.status,
      directFactSupport: claim.directFactSupport,
      evidenceIds: claim.evidenceIds,
      observationIds: claim.observationIds,
      contradictionClaimIds: uniqueSorted(contradictions.map(({ claimId }) => claimId))
    };
  }).sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function buildPatterns(entities: ReturnType<typeof resolvePublicEntities>, evidence: readonly PublicSourceEvidence[]): PublicSourcePatternEvidence[] {
  return entities.flatMap((entity) => {
    if (entity.status !== "resolved") return [];
    const items = evidence.filter(({ evidenceId }) => entity.evidenceIds.includes(evidenceId));
    const queryVariantIds = uniqueSorted(items.flatMap(({ queryVariantIds }) => queryVariantIds));
    const domains = uniqueSorted(items.map(({ registrableDomain }) => registrableDomain));
    const families = uniqueSorted(items.map(({ evidenceFamilyId: id }) => id));
    if (queryVariantIds.length < 2 && !(domains.length >= 2 && families.length >= 2)) return [];
    return [{
      patternId: `public-pattern:${hash(entity.entityId)}`,
      kind: domains.length >= 2 && families.length >= 2 ? "independent_repetition" as const : "query_variant_repetition" as const,
      value: entity.canonicalName,
      queryVariantIds,
      registrableDomains: domains,
      evidenceFamilyIds: families,
      evidenceIds: entity.evidenceIds,
      grade: "C" as const
    }];
  }).sort((left, right) => left.patternId.localeCompare(right.patternId));
}

function categorizePublicOwnership(domain: string, input: PublicSourceGraphInput): PublicSourceOwnershipCategory {
  if (domain === input.customerRegistrableDomain.toLocaleLowerCase()) return "owned_customer";
  if (input.competitorRegistrableDomains.map((item) => item.toLocaleLowerCase()).includes(domain)) return "owned_competitor";
  return input.knownSourceCategories?.[domain] ?? "unknown";
}

function contradictionGroups(retrievals: readonly RetrievedPublicSourceFact[]): Set<string> {
  const values = new Map<string, Set<string>>();
  for (const claim of retrievals.flatMap(({ claims }) => claims ?? [])) {
    if (!claim.contradictionGroupId) continue;
    const set = values.get(claim.contradictionGroupId) ?? new Set<string>();
    set.add(normalize(claim.value));
    values.set(claim.contradictionGroupId, set);
  }
  return new Set([...values.entries()].filter(([, groupValues]) => groupValues.size > 1).map(([id]) => id));
}

function uniqueRefs<T extends { observationId: string; queryVariantId: string; surfaceResultOrder: number; observedUrl: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [`${value.observationId}|${value.queryVariantId}|${value.surfaceResultOrder}|${value.observedUrl}`, value])).values()]
    .sort((left, right) => left.observationId.localeCompare(right.observationId) || left.surfaceResultOrder - right.surfaceResultOrder);
}

function normalize(value: string): string { return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function uniqueSorted(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
