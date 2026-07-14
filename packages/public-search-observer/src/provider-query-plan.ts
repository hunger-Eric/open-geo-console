import { createHash } from "node:crypto";
import { deterministicId } from "./identity";
import type {
  CanonicalBuyerQuestion,
  CustomerIdentityExclusion,
  PublicSearchSurface,
  SearchExecutionBudget,
  SearchQueryVariant
} from "./types";
import { assertNoCustomerIdentity } from "./validation";

export const PROVIDER_QUERY_PLAN_VERSION = "provider-query-plan-v1" as const;

export interface ProviderQueryPolicyDescriptor {
  policyId: string;
  policyVersion: string;
  queryFacets: readonly { id: string; terms: Readonly<Record<"zh" | "en", readonly string[]>> }[];
}

export interface ProviderQueryPlanInput {
  question: CanonicalBuyerQuestion;
  surface: PublicSearchSurface;
  policy: ProviderQueryPolicyDescriptor;
  excludedIdentities: readonly CustomerIdentityExclusion[];
}

export interface ProviderCandidateQueryIdentity {
  entityId: string;
  canonicalName: string;
  rank: number;
}

export interface ProviderDiscoveryQueryPlanV1 {
  id: string;
  version: typeof PROVIDER_QUERY_PLAN_VERSION;
  kind: "provider_discovery";
  policyId: string;
  policyVersion: string;
  questionId: string;
  surface: PublicSearchSurface;
  queries: SearchQueryVariant[];
  budget: SearchExecutionBudget;
}

export interface ProviderVerificationQueryPlanV1 {
  id: string;
  version: typeof PROVIDER_QUERY_PLAN_VERSION;
  kind: "candidate_verification";
  parentPlanId: string;
  candidateSetHash: string;
  policyId: string;
  policyVersion: string;
  questionId: string;
  surface: PublicSearchSurface;
  candidates: ProviderCandidateQueryIdentity[];
  queries: SearchQueryVariant[];
  budget: SearchExecutionBudget;
}

const DISCOVERY_BUDGET: SearchExecutionBudget = Object.freeze({ maxRequests: 1, maxResults: 5, timeoutMs: 30_000, maxCostMicros: 100_000 });
const VERIFICATION_BUDGET: SearchExecutionBudget = Object.freeze({ maxRequests: 1, maxResults: 5, timeoutMs: 30_000, maxCostMicros: 100_000 });

export function createProviderDiscoveryQueryPlan(input: ProviderQueryPlanInput): ProviderDiscoveryQueryPlanV1 {
  assertInputIdentity(input);
  const language = input.question.locale.toLocaleLowerCase().startsWith("zh") ? "zh" : "en";
  const facets = input.policy.queryFacets.slice(0, 6);
  if (facets.length !== 6) throw new TypeError("Provider discovery requires exactly six reviewed query facets.");
  const queries = facets.map((facet, index): SearchQueryVariant => {
    const exactQuery = index === 0
      ? input.question.normalizedText
      : normalize(`${input.question.derivation.subject} ${facet.terms[language].join(" ")}`);
    assertProviderTextHasNoCustomerIdentity(exactQuery, input.excludedIdentities);
    return query(input, `provider-discovery-${facet.id}`, exactQuery, 5);
  });
  const identity = identityInput(input, { kind: "provider_discovery", queries: queries.map(({ exactQuery, derivationRuleId }) => ({ exactQuery, derivationRuleId })) });
  return {
    id: `provider-discovery-plan:${sha(identity)}`,
    version: PROVIDER_QUERY_PLAN_VERSION,
    kind: "provider_discovery",
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    questionId: input.question.id,
    surface: input.surface,
    queries,
    budget: { ...DISCOVERY_BUDGET }
  };
}

export function createProviderVerificationQueryPlan(input: ProviderQueryPlanInput & {
  parentPlanId: string;
  candidates: readonly ProviderCandidateQueryIdentity[];
}): ProviderVerificationQueryPlanV1 {
  assertInputIdentity(input);
  if (!input.parentPlanId.trim()) throw new TypeError("Provider verification requires a parent discovery plan.");
  const candidates = [...input.candidates]
    .sort((left, right) => left.rank - right.rank || left.entityId.localeCompare(right.entityId))
    .slice(0, 12)
    .map((candidate) => ({ ...candidate, canonicalName: normalize(candidate.canonicalName) }));
  if (new Set(candidates.map(({ entityId }) => entityId)).size !== candidates.length) throw new TypeError("Provider verification candidates must have unique identities.");
  for (const candidate of candidates) assertProviderTextHasNoCustomerIdentity(candidate.canonicalName, input.excludedIdentities);
  const language = input.question.locale.toLocaleLowerCase().startsWith("zh") ? "zh" : "en";
  const verificationTerms = input.policy.queryFacets.slice(2).flatMap((facet) => facet.terms[language]).slice(0, 12);
  const queries = candidates.map((candidate): SearchQueryVariant => {
    const exactQuery = normalize(`${candidate.canonicalName} ${verificationTerms.join(" ")}`);
    assertProviderTextHasNoCustomerIdentity(exactQuery, input.excludedIdentities);
    return query(input, `candidate-verification-${candidate.entityId}`, exactQuery, 5);
  });
  const candidateSetHash = sha(JSON.stringify(candidates.map(({ entityId, canonicalName, rank }) => ({ entityId, canonicalName, rank }))));
  const identity = identityInput(input, { kind: "candidate_verification", parentPlanId: input.parentPlanId, candidateSetHash, queries: queries.map(({ exactQuery, derivationRuleId }) => ({ exactQuery, derivationRuleId })) });
  return {
    id: `provider-verification-plan:${sha(identity)}`,
    version: PROVIDER_QUERY_PLAN_VERSION,
    kind: "candidate_verification",
    parentPlanId: input.parentPlanId,
    candidateSetHash,
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    questionId: input.question.id,
    surface: input.surface,
    candidates,
    queries,
    budget: { ...VERIFICATION_BUDGET }
  };
}

function query(input: ProviderQueryPlanInput, rule: string, exactQuery: string, resultDepth: number): SearchQueryVariant {
  const fanoutVersion = PROVIDER_QUERY_PLAN_VERSION;
  return {
    id: deterministicId("query", [input.question.id, fanoutVersion, rule, exactQuery, input.question.locale, input.question.region, input.surface.surfaceId, input.surface.surfaceVersion]),
    questionId: input.question.id,
    fanoutVersion,
    locale: input.question.locale,
    region: input.question.region,
    exactQuery,
    derivationRuleId: `${rule}-v1`,
    resultDepth
  };
}

function assertInputIdentity(input: ProviderQueryPlanInput): void {
  if (!input.policy.policyId.trim() || !input.policy.policyVersion.trim()) throw new TypeError("Provider query policy identity is required.");
  assertProviderTextHasNoCustomerIdentity(input.question.normalizedText, input.excludedIdentities);
  assertProviderTextHasNoCustomerIdentity(input.question.derivation.subject, input.excludedIdentities);
}

function assertProviderTextHasNoCustomerIdentity(
  value: string,
  excludedIdentities: readonly CustomerIdentityExclusion[]
): void {
  try {
    assertNoCustomerIdentity(value, excludedIdentities);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`Provider query contains excluded customer identity: ${detail}`);
  }
}

function identityInput(input: ProviderQueryPlanInput, details: unknown): string {
  return JSON.stringify({
    version: PROVIDER_QUERY_PLAN_VERSION,
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    questionId: input.question.id,
    locale: input.question.locale,
    region: input.question.region,
    surfaceId: input.surface.surfaceId,
    surfaceVersion: input.surface.surfaceVersion,
    details
  });
}

function normalize(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/g, " "); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
