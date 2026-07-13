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
import {
  createMiMoPublicSearchAdapter,
  createMiMoPublicSearchAdapterFactory
} from "./adapter";
import {readMiMoPublicSearchConfig} from "./config";

export interface PublicSearchProbeCaseSummary {
  id: "official-factual" | "chinese-b2b-discovery" | "narrow-no-result";
  status: SearchObservationStatus;
  passed: boolean;
  sourceDomains: string[];
  sourceCount: number;
  usage: {requestCount: number; resultCount: number; costUncertain: boolean};
  sanitizedErrorClass?: SearchObservationStatus;
}

export interface MiMoPublicSearchProbeSummary {
  adapterId: "mimo";
  identity: PublicSearchAdapterIdentity;
  cases: PublicSearchProbeCaseSummary[];
  failureSemantics: {authentication: boolean; rateLimited: boolean; timedOut: boolean; malformed: boolean};
}

const CASES = [
  {
    id: "official-factual" as const,
    query: "What official OpenAI announcement retired the Assistants API?",
    expectedDomain: "openai.com",
    expectedPathPrefix: "/index/",
    expectedStatus: "complete" as const
  },
  {
    id: "chinese-b2b-discovery" as const,
    query: "中国海运拼箱货运代理供应商有哪些？",
    expectedStatus: "complete" as const
  },
  {
    id: "narrow-no-result" as const,
    query: "site:public-search-no-result.invalid 一家不存在的物流服务商",
    expectedStatus: "malformed" as const
  }
] as const;

const PROBE_BUDGET: SearchExecutionBudget = Object.freeze({maxRequests: 3, maxResults: 20, timeoutMs: 20_000, maxCostMicros: 10_000_000});

export async function runMiMoPublicSearchProbe(input: {
  environment: NodeJS.ProcessEnv;
  locale: string;
  region: string;
  fetch?: typeof fetch;
}): Promise<MiMoPublicSearchProbeSummary> {
  const factory = createMiMoPublicSearchAdapterFactory();
  const identity = factory.resolveIdentity({environment: input.environment, locale: input.locale, region: input.region});
  const config = readMiMoPublicSearchConfig(input.environment, input.locale, input.region);
  const authority = probeAuthority(identity);
  const adapter = createMiMoPublicSearchAdapter({
    config,
    authority,
    fetch: input.fetch
  });
  const cases: PublicSearchProbeCaseSummary[] = [];
  for (const item of CASES) {
    const observation = await observePublicSearch({
      adapter,
      query: {id: `mimo-probe-${item.id}`, questionId: `mimo-probe-${item.id}`, fanoutVersion: "mimo-certification-v1", locale: input.locale, region: input.region, exactQuery: item.query, derivationRuleId: "mimo-certification", resultDepth: PROBE_BUDGET.maxResults},
      budget: PROBE_BUDGET,
      signal: AbortSignal.timeout(PROBE_BUDGET.timeoutMs)
    });
    const sourceDomains = [...new Set(observation.results.map(({url}) => new URL(url).hostname.toLowerCase()))].sort();
    const expectedDomain = "expectedDomain" in item ? item.expectedDomain : undefined;
    const expectedPathPrefix = "expectedPathPrefix" in item ? item.expectedPathPrefix : undefined;
    const expectedSource = expectedDomain === undefined || observation.results.some(({url}) => {
      const source = new URL(url);
      return source.hostname.toLowerCase() === expectedDomain && (expectedPathPrefix === undefined || source.pathname.startsWith(expectedPathPrefix));
    });
    cases.push({
      id: item.id,
      status: observation.status,
      passed: observation.status === item.expectedStatus && expectedSource,
      sourceDomains,
      sourceCount: observation.results.length,
      usage: {requestCount: observation.usage.requestCount, resultCount: observation.usage.resultCount, costUncertain: observation.usage.costUncertain === true},
      ...(observation.status === "complete" ? {} : {sanitizedErrorClass: observation.status})
    });
  }
  return {adapterId: "mimo", identity, cases, failureSemantics: await deterministicFailureSemantics({config, authority, surface: identity.surface, locale: input.locale, region: input.region})};
}

export function finalizeMiMoPublicSearchCertification(input: {
  probe: MiMoPublicSearchProbeSummary;
  locale: string;
  region: string;
  reviewedBy: string;
  reviewedAt: string;
  review: {termsReviewReference: string; commercialUseReviewReference: string; storageDisplayReviewReference: string};
  signing?: PublicSearchCertificationSigningConfig;
}): PublicSearchCertificationArtifact {
  if (input.probe.adapterId !== "mimo" || input.probe.identity.surface.locale !== input.locale || input.probe.identity.surface.region !== input.region) {
    throw new Error("MiMo certification probe identity does not match the requested locale and region.");
  }
  if (input.probe.cases.length !== CASES.length || input.probe.cases.some(({passed}) => !passed) || Object.values(input.probe.failureSemantics).some((passed) => !passed)) {
    throw new Error("MiMo certification quality and failure-semantics gates must all pass before artifact creation.");
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
    provenanceSemantics: "Only structured MiMo URL annotations are retained as public-search evidence; generated prose is excluded.",
    errorSemantics: "Authentication, unsupported capability, rate limiting, timeout, malformed response, and unavailable transport remain explicit terminal states without provider fallback.",
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
    evidenceReference: "probe://mimo/capability-only",
    supportedLocales: [identity.surface.locale],
    supportedRegions: [identity.surface.region]
  };
}

async function deterministicFailureSemantics(input: {
  config: ReturnType<typeof readMiMoPublicSearchConfig>;
  authority: PublicSearchSurfaceAuthority;
  surface: PublicSearchAdapterIdentity["surface"];
  locale: string;
  region: string;
}): Promise<MiMoPublicSearchProbeSummary["failureSemantics"]> {
  const statusFor = async (id: string, fetch: typeof globalThis.fetch, timeoutMs = 20): Promise<SearchObservationStatus> => {
    const adapter = createMiMoPublicSearchAdapter({config: input.config, authority: input.authority, fetch});
    return (await observePublicSearch({
      adapter,
      query: {id: `mimo-probe-failure-${id}`, questionId: `mimo-probe-failure-${id}`, fanoutVersion: "mimo-certification-v1", locale: input.locale, region: input.region, exactQuery: "deterministic provider failure classification", derivationRuleId: "mimo-certification", resultDepth: 1},
      budget: {...PROBE_BUDGET, maxRequests: 1, maxResults: 1, timeoutMs},
      signal: AbortSignal.timeout(timeoutMs * 2)
    })).status;
  };
  const [authentication, rateLimited, timedOut, malformed] = await Promise.all([
    statusFor("authentication", async () => new Response("{}", {status: 401})),
    statusFor("rate-limit", async () => new Response("{}", {status: 429})),
    statusFor("timeout", async () => new Promise<Response>(() => {}), 5),
    statusFor("malformed", async () => new Response(JSON.stringify({choices:[{message:{content:"not evidence"}}],usage:{web_search_usage:{tool_usage:1,page_usage:0}}}), {status: 200}))
  ]);
  return {authentication: authentication === "authentication", rateLimited: rateLimited === "rate_limited", timedOut: timedOut === "timed_out", malformed: malformed === "malformed"};
}

function requiredReview(value: string, label: string): string {
  if (!value.trim()) throw new Error(`MiMo certification ${label} review reference is required.`);
  return value.trim();
}
