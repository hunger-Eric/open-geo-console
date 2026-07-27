import { describe, expect, it } from "vitest";
import {
  PublicSearchSurfaceRegistry,
  assertNoCustomerIdentity,
  classifyPublicSearchCoverage,
  classifySnapshotFreshness,
  createMarketSnapshotIdentity,
  createSearchQueryFanout,
  detectProhibitedClaims,
  generateCanonicalBuyerQuestions,
  observePublicSearch,
  parseMarketSearchObservation,
  parseSearchQueryFanout,
  type PublicSearchSurface,
  type PublicSearchSurfaceAdapter
} from "./index";
import {
  LOGISTICS_INPUT,
  LOGISTICS_SURFACE,
  createLogisticsFixtureAdapter,
  createLogisticsFixtureFanouts,
  createMalformedLogisticsFixtureAdapter
} from "./fixtures/logistics";

describe("public-search observer contracts", () => {
  it("generates byte-stable non-brand questions and exact identities", () => {
    const left = generateCanonicalBuyerQuestions(LOGISTICS_INPUT);
    const right = generateCanonicalBuyerQuestions(structuredClone(LOGISTICS_INPUT));
    expect(left).toEqual(right);
    expect(left.questions).toHaveLength(3);
    expect(left.questions.every((question) => question.derivation.ruleId.length > 0)).toBe(true);
    expect(JSON.stringify(left)).not.toMatch(/海达|itheheda|competitor/i);

    const fanout = createSearchQueryFanout({ question: left.questions[0]!, surface: LOGISTICS_SURFACE });
    const identity = createMarketSnapshotIdentity({
      question: left.questions[0]!, surface: LOGISTICS_SURFACE, fanout
    });
    expect(createMarketSnapshotIdentity({
      question: right.questions[0]!, surface: structuredClone(LOGISTICS_SURFACE), fanout: structuredClone(fanout)
    })).toEqual(identity);
  });

  it("changes exact identity for every cache dimension and never fuzzy-matches", () => {
    const question = generateCanonicalBuyerQuestions(LOGISTICS_INPUT).questions[0]!;
    const fanout = createSearchQueryFanout({ question, surface: LOGISTICS_SURFACE });
    const base = { question, surface: LOGISTICS_SURFACE, fanout };
    const id = createMarketSnapshotIdentity(base).id;
    const changed = [
      { ...base, question: { ...question, normalizedText: `${question.normalizedText}？` } },
      { ...base, question: { ...question, locale: "en" } },
      { ...base, question: { ...question, region: "TW" } },
      { ...base, surface: { ...LOGISTICS_SURFACE, surfaceId: "other-index" } },
      { ...base, surface: { ...LOGISTICS_SURFACE, surfaceVersion: "2026-08" } },
      { ...base, fanout: { ...fanout, fanoutVersion: "public-search-fanout-v2" } }
    ];
    expect(changed.map((input) => createMarketSnapshotIdentity(input).id)).not.toContain(id);
  });

  it("changes snapshot identity when the effective ordered query plan changes", () => {
    const question = generateCanonicalBuyerQuestions(LOGISTICS_INPUT).questions[0]!;
    const fanout = createSearchQueryFanout({ question, surface: LOGISTICS_SURFACE });
    const policyFanout = {
      ...fanout,
      queries: fanout.queries.map((query, index) => index === 1
        ? { ...query, exactQuery: `${question.normalizedText} 自有车队 固定运力` }
        : query)
    };

    expect(createMarketSnapshotIdentity({ question, surface: LOGISTICS_SURFACE, fanout }).id)
      .not.toBe(createMarketSnapshotIdentity({ question, surface: LOGISTICS_SURFACE, fanout: policyFanout }).id);
  });

  it("requires explicit evidence to expand beyond three questions and broadens low confidence", () => {
    expect(generateCanonicalBuyerQuestions({ ...LOGISTICS_INPUT, expansionEvidence: undefined }).questions).toHaveLength(3);
    expect(generateCanonicalBuyerQuestions({
      ...LOGISTICS_INPUT,
      expansionEvidence: { confidence: "high", distinctSupportedDimensions: ["route", "mode", "customs"] }
    }).questions).toHaveLength(5);
    const low = generateCanonicalBuyerQuestions({
      ...LOGISTICS_INPUT, categoryEvidence: [{ value: "台湾冷链专线", confidence: "low", sourceId: "site-1" }]
    });
    expect(low.confidence).toBe("low");
    expect(low.limitations).not.toHaveLength(0);
    expect(low.questions.every((question) => question.derivation.broadened)).toBe(true);
  });

  it("excludes customer, competitor, domain, email, order and private identities", () => {
    for (const value of ["深圳海达物流", "itheheda.com", "buyer@example.com", "order_123", "竞争者甲"]) {
      expect(() => assertNoCustomerIdentity(value, LOGISTICS_INPUT.excludedIdentities)).toThrow();
    }
    expect(() => generateCanonicalBuyerQuestions({
      ...LOGISTICS_INPUT, categoryEvidence: [{ value: "深圳海达物流台湾专线", confidence: "high", sourceId: "private-order_123" }]
    })).toThrow();
  });

  it("creates at most six derived queries with fixed depth and budget", () => {
    for (const fanout of createLogisticsFixtureFanouts()) {
      expect(fanout.queries).toHaveLength(6);
      expect(fanout.queries.every((query) => query.derivationRuleId && query.resultDepth === 10)).toBe(true);
      expect(fanout.budget.maxRequests).toBe(1);
    }
  });

  it("strictly validates fanout children and freshness boundaries", () => {
    const fanout = createLogisticsFixtureFanouts()[0]!;
    expect(parseSearchQueryFanout(fanout)).toEqual(fanout);
    expect(() => parseSearchQueryFanout({ ...fanout, queries: [...fanout.queries, fanout.queries[0]!] })).toThrow();
    expect(() => parseSearchQueryFanout({ ...fanout, customerId: "private" })).toThrow();
    const start = "2026-07-01T00:00:00.000Z";
    expect(classifySnapshotFreshness(start, "2026-07-08T00:00:00.000Z")).toBe("fresh");
    expect(classifySnapshotFreshness(start, "2026-07-08T00:00:00.001Z")).toBe("stale");
    expect(classifySnapshotFreshness(start, "2026-07-31T00:00:00.001Z")).toBe("expired");
  });

  it("reports surface-neutral coverage and exposes all logistics evidence scenarios", async () => {
    const adapter = createLogisticsFixtureAdapter("complete");
    const query = createLogisticsFixtureFanouts()[0]!.queries[0]!;
    const observation = await observePublicSearch({ adapter, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 50, maxCostMicros: 1000 }, signal: new AbortController().signal });
    expect(classifyPublicSearchCoverage({ expectedQueryCount: 1, observations: [observation] })).toMatchObject({ status: "complete", surfaceDomainCount: 7 });
    const scenarios = JSON.stringify(observation.results.map(({ metadata }) => metadata));
    for (const expected of ["duplicate_domain", "syndicated", "inaccessible", "ambiguous", "contradiction"]) expect(scenarios).toContain(expected);
    expect(JSON.stringify(observation)).not.toContain("深圳海达物流");
  });

  it("parses only surfaceResultOrder and preserves sanitized terminal/error states", async () => {
    for (const status of ["complete", "partial", "rate_limited", "timed_out", "unavailable", "malformed"] as const) {
      const result = await observePublicSearch({
        adapter: createLogisticsFixtureAdapter(status),
        query: createLogisticsFixtureFanouts()[0]!.queries[0]!,
        budget: { maxRequests: 1, maxResults: 10, timeoutMs: 50, maxCostMicros: 1000 },
        signal: new AbortController().signal
      });
      expect(result.status).toBe(status);
      expect(result.usage.requestCount).toBeLessThanOrEqual(1);
      expect(JSON.stringify(result)).not.toMatch(/api[-_ ]?key|bearer\s|token=/i);
      expect(() => parseMarketSearchObservation({ ...result, aiRank: 1 })).toThrow();
    }
  });

  it("propagates caller abort without leaking adapter errors", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await observePublicSearch({
      adapter: createLogisticsFixtureAdapter("complete"),
      query: createLogisticsFixtureFanouts()[0]!.queries[0]!,
      budget: { maxRequests: 1, maxResults: 10, timeoutMs: 50, maxCostMicros: 1000 },
      signal: controller.signal
    });
    expect(result.status).toBe("aborted");
    expect(result.usage.requestCount).toBe(0);
  });

  it("classifies real malformed, reject, timeout, and mid-flight abort paths", async () => {
    const query = createLogisticsFixtureFanouts()[0]!.queries[0]!;
    const budget = { maxRequests: 1, maxResults: 10, timeoutMs: 5, maxCostMicros: 1000 };
    expect((await observePublicSearch({ adapter: createMalformedLogisticsFixtureAdapter(), query, budget, signal: new AbortController().signal })).status).toBe("malformed");

    const base = createLogisticsFixtureAdapter("complete");
    const rejected: PublicSearchSurfaceAdapter = { ...base, search: async () => { throw new Error("Authorization: Bearer must-not-leak"); }, classifyError: () => "rate_limited" };
    const rejectedResult = await observePublicSearch({ adapter: rejected, query, budget, signal: new AbortController().signal });
    expect(rejectedResult).toMatchObject({ status: "rate_limited", usage: { requestCount: 1, costUncertain: true } });
    expect(JSON.stringify(rejectedResult)).not.toContain("must-not-leak");
    for (const status of ["authentication", "unsupported"] as const) {
      const adapter: PublicSearchSurfaceAdapter = {
        ...base,
        search: async () => { throw new Error("Authorization: Bearer must-not-leak"); },
        classifyError: () => status
      };
      await expect(observePublicSearch({ adapter, query, budget, signal: new AbortController().signal }))
        .resolves.toMatchObject({
          status,
          results: [],
          usage: { requestCount: 1, resultCount: 0, costUncertain: true }
        });
    }
    const invalidClassifier: PublicSearchSurfaceAdapter = { ...rejected, classifyError: () => "unknown-runtime-status" as never };
    expect((await observePublicSearch({ adapter: invalidClassifier, query, budget, signal: new AbortController().signal })).status).toBe("unavailable");

    let timeoutSignalObserved = false;
    const slow: PublicSearchSurfaceAdapter = { ...base, search: ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", () => { timeoutSignalObserved = true; resolve({}); }, { once: true })) };
    expect((await observePublicSearch({ adapter: slow, query, budget, signal: new AbortController().signal })).status).toBe("timed_out");
    expect(timeoutSignalObserved).toBe(true);

    const caller = new AbortController();
    let callerSignalObserved = false;
    const pending: PublicSearchSurfaceAdapter = { ...base, search: ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", () => { callerSignalObserved = true; resolve({}); }, { once: true })) };
    setTimeout(() => caller.abort(), 1);
    const aborted = await observePublicSearch({ adapter: pending, query, budget: { ...budget, timeoutMs: 50 }, signal: caller.signal });
    expect(aborted).toMatchObject({ status: "aborted", usage: { requestCount: 1, costUncertain: true } });
    expect(callerSignalObserved).toBe(true);
  });

  it("retains bounded cost evidence when an adapter exceeds its configured budget", async () => {
    const query = createLogisticsFixtureFanouts()[0]!.queries[0]!;
    const base = createLogisticsFixtureAdapter("complete");
    const costly: PublicSearchSurfaceAdapter = {
      ...base,
      search: async (request) => ({
        ...(await base.search(request) as object),
        usage: { requestCount: 1, resultCount: 8, estimatedCostMicros: 2000, providerReportedCostMicros: 2500 }
      })
    };
    const result = await observePublicSearch({ adapter: costly, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 50, maxCostMicros: 1000 }, signal: new AbortController().signal });
    expect(result).toMatchObject({ status: "malformed", usage: { requestCount: 1, resultCount: 0, estimatedCostMicros: 2000, providerReportedCostMicros: 2500, costUncertain: true } });
  });

  it("rejects attribution claims but permits explicit limitations", () => {
    for (const text of ["豆包推荐这家公司", "ranked first by AI", "all models agree", "AI citation probability: 80%", "搜索第一名就是AI排名第一"]) {
      expect(detectProhibitedClaims(text)).not.toHaveLength(0);
    }
    for (const text of [
      "本报告不能声称豆包推荐了这家公司。", "公开搜索顺序不代表 AI 排名。",
      "This methodology does not claim that any model recommended or ranked a supplier."
    ]) expect(detectProhibitedClaims(text)).toEqual([]);
  });

  it("keeps fixture adapters out of production and protected profiles", () => {
    const fixture = createLogisticsFixtureAdapter("complete");
    expect(() => new PublicSearchSurfaceRegistry({ runtimeEnvironment: "production" }).register(fixture)).toThrow();
    expect(() => new PublicSearchSurfaceRegistry({ runtimeEnvironment: "test", deploymentProfile: "protected_staging" }).register(fixture)).toThrow();
    expect(() => new PublicSearchSurfaceRegistry({ runtimeEnvironment: "test" }).register(fixture)).not.toThrow();
  });

  it("binds registration and execution to an exact authority and has no built-in adapter", async () => {
    const registry = new PublicSearchSurfaceRegistry({ runtimeEnvironment: "test" });
    expect(registry.list()).toEqual([]);
    const adapter: PublicSearchSurfaceAdapter = createLogisticsFixtureAdapter("complete");
    const otherSurface: PublicSearchSurface = { ...adapter.surface, surfaceVersion: "other" };
    expect(() => registry.register(adapter, { ...adapter.authority, surface: otherSurface })).toThrow();
    await expect(observePublicSearch({ adapter: { ...adapter, authority: { ...adapter.authority, active: false } }, query: createLogisticsFixtureFanouts()[0]!.queries[0]!, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 50, maxCostMicros: 1000 }, signal: new AbortController().signal })).rejects.toThrow();
  });

  it("does not treat negative model-attribution observations as methodology limitations", () => {
    expect(detectProhibitedClaims("豆包没有推荐这家公司")).not.toHaveLength(0);
    expect(detectProhibitedClaims("ChatGPT does not recommend this supplier")).not.toHaveLength(0);
  });
});
