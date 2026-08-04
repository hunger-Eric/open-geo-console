import {
  observePublicSearch,
  type PublicSearchSurfaceAuthority,
  type SearchExecutionBudget,
  type SearchObservationStatus
} from "@open-geo-console/public-search-observer";
import {
  finalizePublicSearchCertificationArtifact,
  type PublicSearchCertificationArtifact,
  type PublicSearchCertificationSigningConfig
} from "@/public-search/certification-artifact";
import type { PublicSearchAdapterIdentity } from "../types";
import { createAnySearchPublicSearchAdapter, createAnySearchPublicSearchAdapterFactory } from "./adapter";
import { readAnySearchPublicSearchConfig } from "./config";

export interface AnySearchProbeCaseSummary {
  id: "official-factual" | "chinese-b2b-discovery" | "narrow-structured-search";
  status: SearchObservationStatus;
  passed: boolean;
  sourceDomains: string[];
  sourceCount: number;
  usage: { requestCount: number; resultCount: number; costUncertain: boolean };
  sanitizedErrorClass?: SearchObservationStatus;
}

export interface AnySearchPublicSearchProbeSummary {
  adapterId: "anysearch";
  identity: PublicSearchAdapterIdentity;
  cases: AnySearchProbeCaseSummary[];
  failureSemantics: { authentication: boolean; rateLimited: boolean; timedOut: boolean; malformed: boolean };
}

const CASES = [
  { id: "official-factual" as const, query: "World Wide Web Consortium official website", expectedDomain: "w3.org" },
  { id: "chinese-b2b-discovery" as const, query: "中国海运拼箱货运代理供应商有哪些" },
  { id: "narrow-structured-search" as const, query: "site:gov.cn 国际货运代理 管理办法", expectedDomain: "gov.cn" }
] as const;

const PROBE_BUDGET: SearchExecutionBudget = Object.freeze({ maxRequests: 1, maxResults: 3, timeoutMs: 60_000, maxCostMicros: 10_000_000 });

export async function runAnySearchPublicSearchProbe(input: {
  environment: NodeJS.ProcessEnv;
  locale: string;
  region: string;
  fetch?: typeof fetch;
}): Promise<AnySearchPublicSearchProbeSummary> {
  const factory = createAnySearchPublicSearchAdapterFactory();
  const identity = factory.resolveIdentity({ environment: input.environment, locale: input.locale, region: input.region });
  const config = readAnySearchPublicSearchConfig(input.environment, input.locale, input.region);
  const authority = probeAuthority(identity);
  const adapter = createAnySearchPublicSearchAdapter({ config, authority, fetch: input.fetch });
  const cases: AnySearchProbeCaseSummary[] = [];
  for (const item of CASES) {
    const observation = await observePublicSearch({
      adapter,
      query: {
        id: `anysearch-probe-${item.id}`,
        questionId: `anysearch-probe-${item.id}`,
        fanoutVersion: "anysearch-certification-v1",
        locale: input.locale,
        region: input.region,
        exactQuery: item.query,
        derivationRuleId: "anysearch-certification",
        resultDepth: PROBE_BUDGET.maxResults
      },
      budget: PROBE_BUDGET,
      signal: new AbortController().signal
    });
    const sourceDomains = [...new Set(observation.results.map(({ url }) => new URL(url).hostname.toLowerCase()))].sort();
    const expectedDomain = "expectedDomain" in item ? item.expectedDomain : undefined;
    const expectedSource = expectedDomain === undefined || sourceDomains.some((hostname) => hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`));
    cases.push({
      id: item.id,
      status: observation.status,
      passed: observation.status === "complete" && observation.results.length > 0 && expectedSource,
      sourceDomains,
      sourceCount: observation.results.length,
      usage: { requestCount: observation.usage.requestCount, resultCount: observation.usage.resultCount, costUncertain: observation.usage.costUncertain === true },
      ...(observation.status === "complete" ? {} : { sanitizedErrorClass: observation.status })
    });
  }
  return {
    adapterId: "anysearch",
    identity,
    cases,
    failureSemantics: await deterministicFailureSemantics({ config, authority, locale: input.locale, region: input.region })
  };
}

export function finalizeAnySearchPublicSearchCertification(input: {
  probe: AnySearchPublicSearchProbeSummary;
  locale: string;
  region: string;
  reviewedBy: string;
  reviewedAt: string;
  review: { termsReviewReference: string; commercialUseReviewReference: string; storageDisplayReviewReference: string };
  signing?: PublicSearchCertificationSigningConfig;
}): PublicSearchCertificationArtifact {
  if (input.probe.adapterId !== "anysearch" || input.probe.identity.surface.locale !== input.locale || input.probe.identity.surface.region !== input.region) {
    throw new Error("AnySearch certification probe identity does not match the requested locale and region.");
  }
  if (input.probe.cases.length !== CASES.length || input.probe.cases.some(({ passed }) => !passed) || Object.values(input.probe.failureSemantics).some((passed) => !passed)) {
    throw new Error("AnySearch certification quality and failure-semantics gates must all pass before artifact creation.");
  }
  return finalizePublicSearchCertificationArtifact({
    version: 1,
    mode: "live",
    installable: true,
    environment: "protected_staging",
    adapterId: input.probe.adapterId,
    modelId: input.probe.identity.modelId,
    surface: input.probe.identity.surface,
    supportedLocales: [input.locale],
    supportedRegions: [input.region],
    termsReviewReference: requiredReview(input.review.termsReviewReference, "terms"),
    commercialUseReviewReference: requiredReview(input.review.commercialUseReviewReference, "commercial use"),
    storageDisplayReviewReference: requiredReview(input.review.storageDisplayReviewReference, "storage/display"),
    provenanceSemantics: "Only AnySearch URL, title, and bounded snippet fields are retained; provider content is excluded.",
    errorSemantics: "Authentication, request rejection, rate limiting, timeout, malformed response, and unavailable transport remain explicit terminal states without provider fallback.",
    budget: PROBE_BUDGET,
    reviewedBy: requiredReview(input.reviewedBy, "reviewer"),
    reviewedAt: input.reviewedAt
  }, input.signing);
}

function probeAuthority(identity: PublicSearchAdapterIdentity): PublicSearchSurfaceAuthority {
  return {
    authorityId: `probe-${identity.adapterId}`,
    environment: "test",
    surface: identity.surface,
    active: true,
    certifiedAt: "1970-01-01T00:00:00.000Z",
    evidenceReference: "probe://anysearch/capability-only",
    supportedLocales: [identity.surface.locale],
    supportedRegions: [identity.surface.region]
  };
}

async function deterministicFailureSemantics(input: {
  config: ReturnType<typeof readAnySearchPublicSearchConfig>;
  authority: PublicSearchSurfaceAuthority;
  locale: string;
  region: string;
}): Promise<AnySearchPublicSearchProbeSummary["failureSemantics"]> {
  const statusFor = async (id: string, transport: typeof globalThis.fetch, timeoutMs = 20): Promise<SearchObservationStatus> => {
    const adapter = createAnySearchPublicSearchAdapter({ config: input.config, authority: input.authority, fetch: transport });
    return (await observePublicSearch({
      adapter,
      query: { id: `anysearch-failure-${id}`, questionId: `anysearch-failure-${id}`, fanoutVersion: "anysearch-certification-v1", locale: input.locale, region: input.region, exactQuery: "deterministic provider failure classification", derivationRuleId: "anysearch-certification", resultDepth: 1 },
      budget: { ...PROBE_BUDGET, maxRequests: 1, maxResults: 1, timeoutMs },
      signal: AbortSignal.timeout(timeoutMs * 2)
    })).status;
  };
  const [authentication, rateLimited, timedOut, malformed] = await Promise.all([
    statusFor("authentication", async () => new Response("{}", { status: 401 })),
    statusFor("rate-limit", async () => new Response("{}", { status: 429 })),
    statusFor("timeout", async () => new Promise<Response>(() => {}), 5),
    statusFor("malformed", async () => new Response(JSON.stringify({ code: 0, data: { results: [{ title: "Unsafe", url: "http://127.0.0.1/", snippet: "private" }] } }), { status: 200 }))
  ]);
  return { authentication: authentication === "authentication", rateLimited: rateLimited === "rate_limited", timedOut: timedOut === "timed_out", malformed: malformed === "malformed" };
}

function requiredReview(value: string, label: string): string {
  if (!value.trim()) throw new Error(`AnySearch certification ${label} review reference is required.`);
  return value.trim();
}
