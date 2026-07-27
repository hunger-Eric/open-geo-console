import { deterministicId } from "../identity";
import { markFixtureAdapter } from "../fixture-marker";
import { createSearchQueryFanout } from "../fanout";
import { generateCanonicalBuyerQuestions } from "../questions";
import type {
  CanonicalQuestionGenerationInput,
  MarketSearchObservation,
  PublicSearchSurface,
  PublicSearchSurfaceAdapter,
  SearchObservationStatus,
  SearchResultObservation
} from "../types";

export const LOGISTICS_SURFACE: PublicSearchSurface = Object.freeze({
  surfaceId: "fixture-public-index-cn",
  providerId: "fixture-provider",
  productId: "fixture-public-web-results",
  surfaceKind: "licensed_index",
  contractVersion: "public-search-surface-v1",
  surfaceVersion: "fixture-2026-07",
  adapterVersion: "fixture-adapter-v1",
  locale: "zh-CN",
  region: "CN"
});

export const LOGISTICS_INPUT: CanonicalQuestionGenerationInput = {
  locale: "zh-CN",
  region: "CN",
  broadCategory: "跨境运输服务",
  categoryEvidence: [
    { value: "深圳到台湾运输", confidence: "high", sourceId: "site-route-page-1" }
  ],
  capabilityEvidence: [
    { value: "海运、空运与清关", confidence: "high", sourceId: "site-capability-page-1" }
  ],
  useCaseEvidence: [
    { value: "企业货物运输", confidence: "high", sourceId: "site-use-case-1" }
  ],
  excludedIdentities: [
    { kind: "customer_brand", value: "深圳海达物流" },
    { kind: "customer_domain", value: "itheheda.com" },
    { kind: "competitor_brand", value: "竞争者甲" },
    { kind: "email", value: "buyer@example.com" },
    { kind: "order_id", value: "order_123" },
    { kind: "private_identity", value: "private-customer-42" }
  ]
};

export function createLogisticsFixtureQuestionSet() {
  return generateCanonicalBuyerQuestions(LOGISTICS_INPUT);
}

export function createLogisticsFixtureFanouts() {
  return createLogisticsFixtureQuestionSet().questions.map((question) =>
    createSearchQueryFanout({ question, surface: LOGISTICS_SURFACE, excludedIdentities: LOGISTICS_INPUT.excludedIdentities })
  );
}

const RESULTS: readonly SearchResultObservation[] = [
  { surfaceResultOrder: 1, url: "https://logistics-directory.example/shenzhen-taiwan", title: "深圳台湾运输服务名录", snippet: "公开列出多家跨境运输企业及其服务范围。", displayedHost: "logistics-directory.example", metadata: { sourceScenario: "independent_directory", entity: "华南运输" } },
  { surfaceResultOrder: 2, url: "https://south-freight.example/routes/taiwan", title: "深圳至台湾海空运", snippet: "提供海运、空运、报关与末端配送条件。", displayedHost: "south-freight.example", metadata: { sourceScenario: "direct_company", entity: "华南运输" } },
  { surfaceResultOrder: 3, url: "https://south-freight.example/cases/taiwan-electronics", title: "台湾电子货物运输案例", snippet: "案例说明运输方式、时效口径与限制条件。", displayedHost: "south-freight.example", metadata: { sourceScenario: "duplicate_domain", entity: "华南运输" } },
  { surfaceResultOrder: 4, url: "https://trade-news-a.example/freight-route", title: "跨境货运线路观察", snippet: "行业稿件提及深圳台湾线路服务。", displayedHost: "trade-news-a.example", metadata: { sourceScenario: "syndicated", contentFamily: "syndicated-family-1" } },
  { surfaceResultOrder: 5, url: "https://trade-news-b.example/copied-freight-route", title: "跨境货运线路观察转载", snippet: "转载相同的线路服务内容。", displayedHost: "trade-news-b.example", metadata: { sourceScenario: "syndicated", contentFamily: "syndicated-family-1" } },
  { surfaceResultOrder: 6, url: "https://blocked-source.example/taiwan-route", title: "台湾线路页面", snippet: "结果元数据存在，但页面检索预期不可访问。", displayedHost: "blocked-source.example", metadata: { retrievalScenario: "inaccessible" } },
  { surfaceResultOrder: 7, url: "https://ambiguous-company.example/taiwan", title: "同名运输企业", snippet: "企业名称相同但缺少足够域名与法律主体证据。", displayedHost: "ambiguous-company.example", metadata: { entityScenario: "ambiguous" } },
  { surfaceResultOrder: 8, url: "https://contradiction.example/transit-time", title: "线路时效说明", snippet: "该来源的时效说法与另一公开来源冲突。", displayedHost: "contradiction.example", metadata: { claimScenario: "contradiction" } }
];

export function createLogisticsFixtureAdapter(status: SearchObservationStatus): PublicSearchSurfaceAdapter {
  return markFixtureAdapter({
    id: `fixture-logistics-${status}`,
    surface: LOGISTICS_SURFACE,
    authority: {
      authorityId: "fixture-authority-public-search-v1",
      environment: "test",
      surface: LOGISTICS_SURFACE,
      active: true,
      certifiedAt: "2026-07-12T00:00:00.000Z",
      evidenceReference: "fixture://public-search/logistics",
      supportedLocales: ["zh-CN"],
      supportedRegions: ["CN"]
    },
    async search({ query, surface, signal }): Promise<MarketSearchObservation> {
      if (signal.aborted) throw new DOMException("fixture aborted", "AbortError");
      const usableResults = status === "complete" ? RESULTS : status === "partial" ? RESULTS.slice(0, 3) : [];
      const requestedAt = "2026-07-12T01:00:00.000Z";
      const completedAt = "2026-07-12T01:00:00.050Z";
      return {
        observationId: deterministicId("observation", [surface.surfaceId, surface.surfaceVersion, query.id, requestedAt, status]),
        surface,
        queryId: query.id,
        exactQuery: query.exactQuery,
        requestedAt,
        completedAt,
        status,
        results: usableResults,
        usage: { requestCount: 1, resultCount: usableResults.length, estimatedCostMicros: 50, costUncertain: status === "timed_out" },
        ...(status === "complete" || status === "partial" ? {} : { sanitizedError: `Deterministic fixture status: ${status}.` })
      };
    },
    classifyError: () => status === "complete" || status === "partial" ? "unavailable" : status
  });
}

export function createMalformedLogisticsFixtureAdapter(): PublicSearchSurfaceAdapter {
  const fixture = createLogisticsFixtureAdapter("complete");
  return markFixtureAdapter({ ...fixture, id: "fixture-logistics-malformed-raw", search: async () => ({ aiRank: 1, rawCredential: "redacted" }) });
}
