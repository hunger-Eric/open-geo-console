import { createHash } from "node:crypto";
import {
  PROVIDER_PASSAGE_SELECTOR_VERSION,
  selectProviderPassages,
  selectProviderQualificationPolicy,
  validateProviderClaimCandidate,
  type ProviderClaim,
  type ProviderEvidencePassage,
  type ProviderQualificationPolicy
} from "@open-geo-console/citation-intelligence";
import {
  extractProviderClaimCandidates,
  PROVIDER_CLAIM_EXTRACTION_CONTRACT,
  type JsonCompletionClient,
  type ProviderDiscoveryV1
} from "@open-geo-console/ai-report-engine";
import {
  createProviderDiscoveryQueryPlan,
  createProviderVerificationQueryPlan,
  PROVIDER_QUERY_PLAN_VERSION,
  assertNoCustomerIdentity,
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet,
  type CustomerIdentityExclusion,
  type ProviderCandidateQueryIdentity,
  type PublicSearchSurfaceAdapter,
  type PublicSearchSurfaceAuthority,
  type SearchQueryFanout
} from "@open-geo-console/public-search-observer";
import { appendCompletedMarketProviderClaims, getMarketProviderEvidenceBundle, providerClaimPersistenceHash } from "@/db/provider-evidence";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import type { PublicSearchAdapterIdentity } from "@/public-search-adapters/types";
import { executePublicSourceRetrieval } from "./public-source-retriever";
import { createPublicSourceQuestionFanouts } from "./public-source-forensics";
import { resolvePublicSourceSnapshot, type InjectedPublicSourceRetrieval, type PublicSourceRetriever } from "./public-source-snapshot-resolver";
import type {
  ProviderDiscoveryCheckpointV1,
  ProviderDiscoveryIdentity,
  ProviderDiscoveryPipelineDependencies,
  ProviderDiscoveryStage,
  ProviderRetrievalStage
} from "./provider-discovery-pipeline";

export interface ProductionProviderDiscoveryRuntime {
  adapter: PublicSearchSurfaceAdapter;
  authority: PublicSearchSurfaceAuthority;
  identity: PublicSearchAdapterIdentity;
}

export interface ProductionProviderDiscoveryInput {
  runtime: ProductionProviderDiscoveryRuntime;
  questionSet: ConfirmedBusinessQuestionSet;
  artifactContract: "combined_geo_report_v2" | "combined_geo_report_v3";
  websiteCategories: string[];
  websiteFoundationHash: string;
  workerId: string;
  evidenceCutoffAt: string;
  extractionClient: JsonCompletionClient;
  extractionModel: string;
  forceSnapshotRefreshAfter?: string;
  getCheckpoint(): Promise<ProviderDiscoveryCheckpointV1 | null>;
  saveCheckpoint(checkpoint: ProviderDiscoveryCheckpointV1): Promise<void>;
}

export interface ProductionProviderDiscoveryContext {
  identity: ProviderDiscoveryIdentity;
  policy: ProviderQualificationPolicy;
  discoveryFanout: SearchQueryFanout;
  dependencies: ProviderDiscoveryPipelineDependencies;
  resolveForensicSnapshot: typeof resolvePublicSourceSnapshot;
  snapshotIds(): { discovery: string | null; verification: string | null; standard: string[] };
}

export function createProductionProviderDiscoveryContext(input: ProductionProviderDiscoveryInput): ProductionProviderDiscoveryContext {
  const canonical = toCanonicalBuyerQuestionSet(input.questionSet);
  const question = canonical.questions[0]!;
  const policy = selectProviderQualificationPolicy({ question: question.normalizedText, locale: question.locale, websiteCategories: input.websiteCategories });
  const excludedIdentities: CustomerIdentityExclusion[] = input.questionSet.identityExclusions.map((value) => ({ kind: "private_identity", value }));
  const planInput = { question, surface: input.runtime.authority.surface, policy: { policyId: policy.policyId, policyVersion: policy.version, queryFacets: policy.queryFacets }, excludedIdentities };
  const discoveryPlan = createProviderDiscoveryQueryPlan(planInput);
  const discoveryFanout = toFanout(discoveryPlan, canonical.questionSetVersion);
  const identity: ProviderDiscoveryIdentity = {
    methodology: "public_search_source_forensics_v1",
    artifactContract: input.artifactContract,
    policyId: policy.policyId,
    policyVersion: policy.version,
    queryPlanVersion: PROVIDER_QUERY_PLAN_VERSION,
    passageSelectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION,
    claimExtractionContract: PROVIDER_CLAIM_EXTRACTION_CONTRACT,
    claimExtractionModel: input.extractionModel,
    evidenceCutoffAt: input.evidenceCutoffAt,
    adapterIdentityHash: sha(input.runtime.identity),
    websiteFoundationHash: input.websiteFoundationHash,
    questionSetIdentity: input.questionSet.contentHash
  };
  let discoveryResolved: Awaited<ReturnType<typeof resolvePublicSourceSnapshot>> | null = null;
  let verificationResolved: Awaited<ReturnType<typeof resolvePublicSourceSnapshot>> | null = null;
  let verificationFanout: SearchQueryFanout | null = null;
  let candidates: ProviderCandidateQueryIdentity[] = [];
  let verificationBundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>> | null = null;
  let passages: ProviderEvidencePassage[] = [];
  let claims: ProviderClaim[] = [];
  let standardSnapshotIds: string[] = [];
  let standardPlannedQueries = 0;
  let standardCompletedQueries = 0;
  let standardReturnedObservations = 0;
  let standardSafePages = 0;
  const candidateDomains = new Map<string, string>();

  const dependencies: ProviderDiscoveryPipelineDependencies = {
    getCheckpoint: async () => sanitizePreVerificationCheckpoint(await input.getCheckpoint(), excludedIdentities),
    saveCheckpoint: input.saveCheckpoint,
    runDiscovery: async (signal) => {
      discoveryResolved = await resolvePublicSourceSnapshot({
        authority: input.runtime.authority, adapter: input.runtime.adapter, question, fanout: discoveryFanout,
        evidenceCutoffAt: input.evidenceCutoffAt, leaseOwner: input.workerId, signal,
        forceRefreshAfter: input.forceSnapshotRefreshAfter,
        retrieveSource: createLegacyRetriever(), maxSourceRetrievals: 6, maxAvailableSources: 3, maxSourcesPerDomain: 2,
        snapshotMetadata: { snapshotKind: "provider_discovery", queryPlanVersion: PROVIDER_QUERY_PLAN_VERSION }
      });
      candidates = resolveProviderCandidates(discoveryResolved.observations, candidateDomains, excludedIdentities);
      return {
        snapshotId: discoveryResolved.snapshotId,
        candidates,
        plannedQueries: discoveryFanout.queries.length,
        completedQueries: completedQueries(discoveryResolved.observations),
        returnedObservations: discoveryResolved.observations.reduce((total, observation) => total + observation.results.length, 0)
      };
    },
    runVerification: async ({ discovery, candidateSetHash, signal }) => {
      candidates = discovery.candidates;
      if (!candidateDomains.size) {
        const bundle = await requireSnapshotBundle(discovery.snapshotId);
        const domains = unique(bundle.observations.map(({ canonicalUrl }) => safeDomain(canonicalUrl)).filter((value): value is string => Boolean(value)));
        candidates.forEach((candidate) => { const domain = domains[candidate.rank]; if (domain) candidateDomains.set(candidate.entityId, domain); });
      }
      const verificationPlan = createProviderVerificationQueryPlan({ ...planInput, parentPlanId: discoveryPlan.id, candidates });
      if (verificationPlan.candidateSetHash !== candidateSetHash) throw new Error("Provider verification candidate identity changed.");
      verificationFanout = toFanout(verificationPlan, canonical.questionSetVersion);
      verificationResolved = await resolvePublicSourceSnapshot({
        authority: input.runtime.authority, adapter: input.runtime.adapter, question, fanout: verificationFanout,
        evidenceCutoffAt: input.evidenceCutoffAt, leaseOwner: input.workerId, signal,
        forceRefreshAfter: input.forceSnapshotRefreshAfter,
        retrieveSource: createProviderRetriever(candidateDomains, candidates), maxSourceRetrievals: 42, maxAvailableSources: 42, maxSourcesPerDomain: 5,
        selectProviderPassages: ({ fact, sourceEvidenceId }) => selectPassagesForFact(fact, sourceEvidenceId, candidates, policy),
        snapshotMetadata: { snapshotKind: "candidate_verification", parentSnapshotId: discovery.snapshotId, candidateSetHash, queryPlanVersion: PROVIDER_QUERY_PLAN_VERSION }
      });
      verificationBundle = await requireSnapshotBundle(verificationResolved.snapshotId);
      passages = await loadPassages(verificationResolved.snapshotId);
      return { snapshotId: verificationResolved.snapshotId, candidateSetHash };
    },
    retrieveSources: async ({ verification }) => {
      if (!candidates.length) candidates = (await input.getCheckpoint())?.artifacts.discovery?.candidates ?? [];
      verificationBundle ??= await requireSnapshotBundle(verification.snapshotId);
      const available = verificationBundle.sources.filter(({ retrievalState }) => retrievalState === "available");
      return { verificationSnapshotId: verification.snapshotId, safelyRetrievedPages: available.length, sourceEvidenceIds: available.map(({ id }) => id).sort() };
    },
    selectPassages: async ({ verification }) => {
      if (!passages.length) passages = await loadPassages(verification.snapshotId);
      return passages;
    },
    extractClaims: async ({ passages: selected, signal }) => {
      if (claims.length) return claims;
      verificationBundle ??= await requireSnapshotBundle(verificationResolved?.snapshotId ?? "");
      claims = await extractClaims({ client: input.extractionClient, locale: question.locale, question: question.normalizedText, policy, candidates, passages: selected, bundle: verificationBundle, signal });
      if (claims.length) {
        await appendCompletedMarketProviderClaims({ snapshotId: verificationBundle.snapshot.id, claims: claims.map((claim) => {
          const base = { passageId: claim.passageId, providerEntityId: claim.subjectEntityId, canonicalName: claim.subjectName, genericRole: claim.genericRole,
            policyRole: claim.policyRole, capability: claim.capability, operatingMode: claim.operatingMode, serviceScope: claim.serviceScope,
            routeScope: claim.routeScope, exactExcerpt: claim.exactExcerpt, validationStatus: "accepted" as const, rejectionReason: null };
          return { ...base, id: claim.claimId, claimHash: providerClaimPersistenceHash(base), extractionModel: input.extractionModel, extractionContract: PROVIDER_CLAIM_EXTRACTION_CONTRACT };
        }) });
      }
      return claims;
    },
    qualify: async ({ claims: values }) => policy.qualify({ claims: values }),
    projectProviderDiscovery: async ({ discovery, retrieval, passages: selected, claims: values, qualification }) => {
      verificationBundle ??= await requireSnapshotBundle(verificationResolved?.snapshotId ?? "");
      return projectProviderDiscovery({ policy, discovery, retrieval, passages: selected, claims: values, qualification, bundle: verificationBundle,
        extractionModel: input.extractionModel, verificationPlannedQueries: verificationFanout?.queries.length ?? 0,
        verificationCompletedQueries: verificationResolved ? completedQueries(verificationResolved.observations) : 0,
        verificationReturnedObservations: verificationResolved?.observations.reduce((total, observation) => total + observation.results.length, 0) ?? 0,
        standardPlannedQueries, standardCompletedQueries, standardReturnedObservations, standardSafePages });
    },
    resolveStandardQuestions: async ({ signal }) => {
      const fanouts = createPublicSourceQuestionFanouts({ questions: canonical, authority: input.runtime.authority, excludedIdentities, ordinals: [1, 2] });
      const resolved = await Promise.all(fanouts.map((fanout, index) => resolvePublicSourceSnapshot({
        authority: input.runtime.authority, adapter: input.runtime.adapter, question: canonical.questions[index + 1]!, fanout,
        evidenceCutoffAt: input.evidenceCutoffAt, leaseOwner: input.workerId, signal, retrieveSource: createQuestionRetriever(canonical.questions[index + 1]!),
        forceRefreshAfter: input.forceSnapshotRefreshAfter,
        maxSourceRetrievals: 6, maxAvailableSources: 3, maxSourcesPerDomain: 2
      })));
      standardPlannedQueries = fanouts.reduce((total, fanout) => total + fanout.queries.length, 0);
      standardCompletedQueries = resolved.reduce((total, value) => total + completedQueries(value.observations), 0);
      standardReturnedObservations = resolved.reduce((total, value) => total + value.observations.reduce((sum, observation) => sum + observation.results.length, 0), 0);
      standardSafePages = resolved.reduce((total, value) => total + value.availableSourceCount, 0);
      standardSnapshotIds = resolved.map(({ snapshotId }) => snapshotId);
      return standardSnapshotIds as [string, string];
    }
  };

  const resolveForensicSnapshot: typeof resolvePublicSourceSnapshot = async (request) => {
    if (request.question.id !== question.id) return resolvePublicSourceSnapshot(request);
    return resolvePublicSourceSnapshot({
      ...request,
      fanout: discoveryFanout,
      snapshotMetadata: { snapshotKind: "provider_discovery", queryPlanVersion: PROVIDER_QUERY_PLAN_VERSION }
    });
  };
  return {
    identity, policy, discoveryFanout, dependencies, resolveForensicSnapshot,
    snapshotIds: () => ({ discovery: discoveryResolved?.snapshotId ?? null, verification: verificationResolved?.snapshotId ?? null, standard: [...standardSnapshotIds] })
  };
}

function toFanout(plan: { version: string; questionId: string; surface: SearchQueryFanout["surface"]; queries: SearchQueryFanout["queries"]; budget: SearchQueryFanout["budget"] }, questionSetVersion: string): SearchQueryFanout {
  return { questionId: plan.questionId, questionSetVersion, fanoutVersion: plan.version, surface: plan.surface, queries: plan.queries, budget: plan.budget };
}

export function resolveProviderCandidates(
  observations: Awaited<ReturnType<typeof resolvePublicSourceSnapshot>>["observations"],
  domains: Map<string, string>,
  excludedIdentities: readonly CustomerIdentityExclusion[]
): ProviderCandidateQueryIdentity[] {
  const byDomain = new Map<string, { name: string; domain: string; order: number }>();
  for (const observation of observations) for (const result of observation.results) {
    const domain = safeDomain(result.url);
    if (!domain || byDomain.has(domain)) continue;
    const name = candidateName(result.title, domain);
    if (!isPublicProviderCandidate(name, domain, excludedIdentities)) continue;
    byDomain.set(domain, { name, domain, order: result.surfaceResultOrder });
  }
  return [...byDomain.values()].sort((left, right) => left.order - right.order || left.domain.localeCompare(right.domain)).slice(0, 12).map((value, rank) => {
    const entityId = `provider:${sha({ name: value.name.toLocaleLowerCase(), domain: value.domain })}`;
    domains.set(entityId, value.domain);
    return { entityId, canonicalName: value.name, rank };
  });
}

export function sanitizePreVerificationCheckpoint(
  checkpoint: ProviderDiscoveryCheckpointV1 | null,
  excludedIdentities: readonly CustomerIdentityExclusion[]
): ProviderDiscoveryCheckpointV1 | null {
  const discovery = checkpoint?.artifacts.discovery;
  if (!checkpoint || !discovery || checkpoint.artifacts.verification) return checkpoint;
  const candidates = discovery.candidates.filter(({ canonicalName }) => isPublicIdentityText(canonicalName, excludedIdentities));
  if (candidates.length === discovery.candidates.length) return checkpoint;
  return {
    ...checkpoint,
    phase: "candidate_resolution",
    candidateSetHash: null,
    artifacts: { ...checkpoint.artifacts, discovery: { ...discovery, candidates } }
  };
}

function isPublicProviderCandidate(
  name: string,
  domain: string,
  excludedIdentities: readonly CustomerIdentityExclusion[]
): boolean {
  return isPublicIdentityText(name, excludedIdentities) && isPublicIdentityText(domain, excludedIdentities);
}

function isPublicIdentityText(value: string, excludedIdentities: readonly CustomerIdentityExclusion[]): boolean {
  try { assertNoCustomerIdentity(value, excludedIdentities); return true; } catch { return false; }
}

function candidateName(title: string, domain: string): string {
  const segment = title.normalize("NFKC").split(/\s+[|–—-]\s+/, 1)[0]?.replace(/\s+/g, " ").trim();
  if (segment && segment.length >= 2 && segment.length <= 120) return segment;
  return domain.split(".")[0]!.replace(/[-_]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function createProviderRetriever(candidateDomains: ReadonlyMap<string, string>, candidates: readonly ProviderCandidateQueryIdentity[]): PublicSourceRetriever {
  const candidateNames = new Map(candidates.map((candidate) => [candidate.entityId, candidate.canonicalName]));
  const knownDomains = new Set([...candidateDomains].flatMap(([entityId, domain]) =>
    isLikelyCompanyOwnedProviderDomain(candidateNames.get(entityId) ?? "", domain) ? [domain] : []));
  return async ({ observation, result, signal }): Promise<InjectedPublicSourceRetrieval> => {
    const fact = await executePublicSourceRetrieval({ observationId: observation.observationId, queryId: observation.queryId, resultUrl: result.url }, { signal });
    const excerpt = fact.normalizedText?.slice(0, 1_200) ?? null;
    const sourceCategory = knownDomains.has(safeDomain(fact.finalUrl ?? fact.resultUrl) ?? "") ? "company_owned" : institutional(fact.finalUrl ?? fact.resultUrl) ? "institution" : "earned_editorial";
    return { fact, source: {
      retrievalState: fact.retrievalState === "available" ? "available" : "inaccessible",
      ...(fact.retrievalState === "available" && excerpt ? { excerpt, excerptHash: digest(fact.normalizedContentHash), contentHash: digest(fact.normalizedContentHash) } : {}),
      sourceCategory, entities: fact.entityMentions ?? [], claims: fact.claims ?? [], contradictions: [], evidenceFamilyIdentity: sha(fact.finalUrl ?? fact.resultUrl)
    } };
  };
}

export function isLikelyCompanyOwnedProviderDomain(canonicalName: string, domain: string): boolean {
  const label = domain.toLocaleLowerCase().split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  if (!label) return false;
  const generic = new Set(["company", "freight", "group", "international", "logistics", "shipping", "supply", "transport"]);
  const tokens = canonicalName.normalize("NFKC").toLocaleLowerCase().match(/[a-z0-9]{4,}/g)?.filter((token) => !generic.has(token)) ?? [];
  return tokens.some((token) => label.includes(token) || token.includes(label) && label.length >= 5);
}

function createLegacyRetriever(): PublicSourceRetriever {
  return async ({ observation, result, signal }) => {
    const fact = await executePublicSourceRetrieval({ observationId: observation.observationId, queryId: observation.queryId, resultUrl: result.url }, { signal, excerptMode: "legacy_prefix" });
    return { fact, source: { retrievalState: fact.retrievalState === "available" ? "available" : "inaccessible",
      ...(fact.retrievalState === "available" ? { excerpt: fact.verifiedExcerpt ?? null, excerptHash: digest(fact.normalizedContentHash), contentHash: digest(fact.normalizedContentHash) } : {}),
      sourceCategory: "unknown", entities: fact.entityMentions ?? [], claims: fact.claims ?? [], contradictions: [], evidenceFamilyIdentity: sha(fact.finalUrl ?? fact.resultUrl) } };
  };
}

function createQuestionRetriever(question: { normalizedText: string; derivation: { subject: string } }): PublicSourceRetriever {
  const terms = relevanceTerms(`${question.normalizedText} ${question.derivation.subject}`);
  return async ({ observation, result, signal }) => {
    const raw = await executePublicSourceRetrieval({ observationId: observation.observationId, queryId: observation.queryId, resultUrl: result.url }, { signal });
    const excerpt = raw.normalizedText ? relevantExcerpt(raw.normalizedText, terms) : null;
    const fact = excerpt ? { ...raw, verifiedExcerpt: excerpt } : raw;
    return { fact, source: { retrievalState: fact.retrievalState === "available" ? "available" : "inaccessible",
      ...(fact.retrievalState === "available" && excerpt ? { excerpt, excerptHash: digest(fact.normalizedContentHash), contentHash: digest(fact.normalizedContentHash) } : {}),
      sourceCategory: "unknown", entities: fact.entityMentions ?? [], claims: fact.claims ?? [], contradictions: [], evidenceFamilyIdentity: sha(fact.finalUrl ?? fact.resultUrl) } };
  };
}

function relevantExcerpt(text: string, terms: string[]): string {
  const chunks = text.match(/.{1,900}(?:[。！？.!?]|$)/gu) ?? [text.slice(0, 900)];
  return chunks.map((value) => ({ value: value.trim(), score: terms.filter((term) => value.toLocaleLowerCase().includes(term)).length }))
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length)[0]!.value.slice(0, 1_000);
}
function relevanceTerms(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const chineseRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const chinese = chineseRuns.flatMap((run) => run.length <= 6 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)));
  return unique([...latin, ...chinese]).filter((term) => !["which", "what", "where", "provide", "哪些", "什么", "如何", "是否"].includes(term));
}

function selectPassagesForFact(fact: { normalizedText?: string }, sourceEvidenceId: string, candidates: readonly ProviderCandidateQueryIdentity[], policy: ProviderQualificationPolicy): ProviderEvidencePassage[] {
  if (!fact.normalizedText) return [];
  const language = policy.queryFacets.flatMap(({ terms }) => [...terms.en, ...terms.zh]);
  const controlTerms = ["self-operated", "direct-operated", "owned", "dedicated", "charter", "in-house", "no outsourcing", "自营", "直营", "自有", "专线", "包机", "无外包"];
  const capabilityTerms = policy.capabilityDimensions.flatMap(({ id, label }) => [id.replaceAll("_", " "), label.en, label.zh, ...id.split("_")]);
  return selectProviderPassages({ sourceEvidenceId, normalizedText: fact.normalizedText, candidateNames: candidates.map(({ canonicalName }) => canonicalName),
    serviceTerms: language, controlTerms, capabilityTerms, selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION });
}

async function extractClaims(input: { client: JsonCompletionClient; locale: string; question: string; policy: ProviderQualificationPolicy; candidates: readonly ProviderCandidateQueryIdentity[]; passages: ProviderEvidencePassage[]; bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>; signal?: AbortSignal }): Promise<ProviderClaim[]> {
  const accepted: ProviderClaim[] = [];
  for (const source of input.bundle.sources) {
    const sourcePassages = input.passages.filter(({ sourceEvidenceId }) => sourceEvidenceId === source.id);
    if (!sourcePassages.length) continue;
    const observation = input.bundle.observations.find(({ id }) => id === source.observationId);
    for (const candidate of input.candidates.filter(({ canonicalName }) => sourcePassages.some(({ matchedEntityTerms }) => matchedEntityTerms.some((term) => same(term, canonicalName))))) {
      const extracted = await extractProviderClaimCandidates(input.client, { locale: input.locale, question: input.question, policy: input.policy, candidate,
        source: { sourceEvidenceId: source.id, canonicalUrl: source.canonicalUrl, title: observation?.title ?? source.registrableDomain, registrableDomain: source.registrableDomain }, passages: sourcePassages, signal: input.signal });
      for (const candidateClaim of extracted.candidates) {
        const passage = sourcePassages.find(({ exactExcerpt }) => exactExcerpt.includes(candidateClaim.exactExcerpt));
        if (!passage) continue;
        const validation = validateProviderClaimCandidate(candidateClaim, { passage, policy: input.policy, subjectEntityId: candidate.entityId,
          canonicalSubjectName: candidate.canonicalName, registrableDomain: source.registrableDomain, sourceAuthority: source.sourceCategory,
          sourceEligibility: source.retrievalState === "available" && !["unknown", "directory_or_reference", "community_or_ugc"].includes(source.sourceCategory) });
        if (validation.status === "accepted") accepted.push(validation.accepted);
      }
    }
  }
  return [...new Map(accepted.map((claim) => [claim.claimId, claim])).values()].sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function projectProviderDiscovery(input: { policy: ProviderQualificationPolicy; discovery: ProviderDiscoveryStage; retrieval: ProviderRetrievalStage; passages: ProviderEvidencePassage[]; claims: ProviderClaim[]; qualification: ReturnType<ProviderQualificationPolicy["qualify"]>; bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>; extractionModel: string; verificationPlannedQueries: number; verificationCompletedQueries: number; verificationReturnedObservations: number; standardPlannedQueries: number; standardCompletedQueries: number; standardReturnedObservations: number; standardSafePages: number }): ProviderDiscoveryV1 {
  const represented = new Set([...input.qualification.strict, ...input.qualification.candidates, ...input.qualification.rejected].map(({ entityId }) => entityId));
  const candidates = [...input.qualification.candidates];
  for (const candidate of input.discovery.candidates.filter(({ entityId }) => !represented.has(entityId))) {
    const leads = input.passages.filter(({ matchedEntityTerms }) => matchedEntityTerms.some((term) => same(term, candidate.canonicalName))).map(({ sourceEvidenceId }) => sourceEvidenceId);
    if (leads.length) candidates.push({ entityId: candidate.entityId, canonicalName: candidate.canonicalName, genericRole: "unknown", policyRole: "unknown", leadEvidenceIds: unique(leads), missingProof: ["Direct capability and operating-control evidence is required."] });
    else input.qualification.rejected.push({ entityId: candidate.entityId, canonicalName: candidate.canonicalName, reason: "inaccessible", evidenceIds: [] });
  }
  const evidence = unique(input.passages.map(({ sourceEvidenceId }) => sourceEvidenceId)).map((sourceEvidenceId) => {
    const passage = input.passages.find((item) => item.sourceEvidenceId === sourceEvidenceId)!;
    const source = input.bundle.sources.find(({ id }) => id === sourceEvidenceId)!;
    const observation = input.bundle.observations.find(({ id }) => id === source.observationId);
    const claim = input.claims.find((item) => item.sourceEvidenceId === sourceEvidenceId);
    return { evidenceId: sourceEvidenceId, sourceEvidenceId, registrableDomain: source.registrableDomain, title: observation?.title ?? source.registrableDomain,
      sourceAuthority: source.sourceCategory, observedAt: source.retrievedAt.toISOString(), exactExcerpt: claim?.exactExcerpt ?? passage.exactExcerpt, capability: claim?.capability ?? "unverified_lead" };
  });
  const discoveredProviders = input.discovery.candidates.length;
  return { version: "provider-discovery-v1", policy: { policyId: input.policy.policyId, policyVersion: input.policy.version }, identity: {
    candidateSetHash: candidateHash(input.discovery.candidates), queryPlanVersion: PROVIDER_QUERY_PLAN_VERSION, passageSelectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION,
    claimExtractionContract: PROVIDER_CLAIM_EXTRACTION_CONTRACT, claimExtractionModel: input.extractionModel, claimSetHash: claimHash(input.claims)
  }, execution: { plannedQueries: input.discovery.plannedQueries + input.verificationPlannedQueries + input.standardPlannedQueries, completedQueries: input.discovery.completedQueries + input.verificationCompletedQueries + input.standardCompletedQueries,
    returnedObservations: input.discovery.returnedObservations + input.verificationReturnedObservations + input.standardReturnedObservations, safelyRetrievedPages: input.retrieval.safelyRetrievedPages + input.standardSafePages, relevantPassages: input.passages.length,
    discoveredProviders, strictProviders: input.qualification.strict.length, candidateProviders: candidates.length, rejectedProviders: input.qualification.rejected.length,
    coverage: input.discovery.completedQueries < input.discovery.plannedQueries || input.retrieval.safelyRetrievedPages === 0 ? "insufficient" : input.qualification.strict.length ? "complete" : "partial" },
    strict: input.qualification.strict, candidates, evidence, limitation: "Missing public evidence does not prove that a provider lacks a capability; evidence-limited entities remain candidates." };
}

async function loadPassages(snapshotId: string): Promise<ProviderEvidencePassage[]> {
  const bundle = await getMarketProviderEvidenceBundle([snapshotId]);
  return bundle.passages.map((row) => ({ passageId: row.id, sourceEvidenceId: row.sourceEvidenceId, passageOrder: row.passageOrder, exactExcerpt: row.exactExcerpt,
    excerptHash: row.excerptHash, relevanceScore: row.relevanceScore, matchedEntityTerms: row.matchedEntityTerms, matchedServiceTerms: row.matchedServiceTerms,
    matchedControlTerms: row.matchedControlTerms, matchedCapabilityTerms: row.matchedCapabilityTerms, selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION }));
}
async function requireSnapshotBundle(snapshotId: string) { const bundle = snapshotId ? await getMarketSnapshotBundle(snapshotId) : null; if (!bundle) throw new Error("Provider verification snapshot bundle is unavailable."); return bundle; }
function completedQueries(observations: readonly { status: string }[]) { return observations.filter(({ status }) => status === "complete" || status === "partial").length; }
function safeDomain(value: string): string | null { try { return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, ""); } catch { return null; } }
function institutional(value: string): boolean { const domain = safeDomain(value) ?? ""; return /(?:\.gov|\.edu|\.org)(?:\.[a-z]{2})?$/.test(domain); }
function digest(value?: string): string | null { if (!value) return null; const result = value.startsWith("sha256:") ? value.slice(7) : value; if (!/^[a-f0-9]{64}$/i.test(result)) throw new Error("Provider source content hash is invalid."); return result.toLocaleLowerCase(); }
function same(left: string, right: string) { return left.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim() === right.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim(); }
function unique(values: readonly string[]) { return [...new Set(values)].sort(); }
function sha(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function candidateHash(values: readonly ProviderCandidateQueryIdentity[]) { return sha([...values].sort((a, b) => a.rank - b.rank || a.entityId.localeCompare(b.entityId)).map(({ entityId, canonicalName, rank }) => ({ entityId, canonicalName, rank }))); }
function claimHash(values: readonly ProviderClaim[]) { return sha([...values].sort((a, b) => a.claimId.localeCompare(b.claimId)).map(({ claimId }) => claimId)); }
