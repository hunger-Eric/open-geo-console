import type { MarketSearchObservation, PublicSearchSurface, SearchResultObservation } from "@open-geo-console/public-search-observer";
import type { PublicSourceGraphInput, RetrievedPublicSourceFact } from "./types";

const surface: PublicSearchSurface = {
  surfaceId: "fixture-public-web-cn",
  providerId: "fixture-search-index",
  productId: "fixture-public-results",
  surfaceKind: "licensed_index",
  contractVersion: "public-search-surface-v1",
  surfaceVersion: "fixture-2026-07",
  adapterVersion: "fixture-adapter-v1",
  locale: "zh-CN",
  region: "CN"
};

const primaryResults: SearchResultObservation[] = [
  result(1, "https://logistics-directory.example/shenzhen-taiwan", "深圳台湾运输企业目录"),
  result(2, "https://south-freight.example/routes/taiwan", "深圳至台湾海空运"),
  result(3, "https://south-freight.example/cases/taiwan-electronics", "台湾电子货物运输案例"),
  result(4, "https://trade-news-a.example/freight-route", "跨境货运线路观察"),
  result(5, "https://trade-news-b.example/copied-freight-route", "跨境货运线路观察转载"),
  result(6, "https://ambiguous-company.example/taiwan", "同名运输企业"),
  result(7, "https://port-authority.example/guidance/taiwan", "台湾航线公开运输指引"),
  result(8, "https://blocked-source.example/taiwan-route", "台湾线路页面")
];

const secondaryResults: SearchResultObservation[] = [
  result(1, "https://logistics-directory.example/shenzhen-taiwan", "深圳台湾运输企业目录"),
  result(2, "https://south-freight.example/routes/taiwan", "深圳至台湾海空运"),
  result(3, "https://contradiction.example/transit-time", "线路时效公开说明")
];

export function createLogisticsPublicSourceFixture(): PublicSourceGraphInput {
  const observations = [
    observation("obs-logistics-1", "query-supplier-discovery", "深圳到台湾的运输公司有哪些？", primaryResults),
    observation("obs-logistics-2", "query-capability-fit", "深圳到台湾海运清关公司", secondaryResults)
  ];
  const retrievals: RetrievedPublicSourceFact[] = [
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[0]!.url, {
      hash: "sha256:directory-original",
      excerpt: "目录列出华南运输提供深圳至台湾运输服务。",
      mentions: [{ name: "华南运输", entityId: "entity-south-freight", registrableDomain: "south-freight.example" }]
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[1]!.url, {
      hash: "sha256:company-route",
      excerpt: "华南运输提供深圳至台湾海运、空运与清关服务。",
      mentions: [{ name: "华南运输", entityId: "entity-south-freight", registrableDomain: "south-freight.example" }],
      claims: [{ subjectName: "华南运输", predicate: "运输能力", value: "深圳至台湾海运、空运与清关", directFactSupport: true, preciseEntityMapping: true }]
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[2]!.url, {
      hash: "sha256:company-case",
      excerpt: "案例记录华南运输承运台湾电子货物。",
      mentions: [{ name: "华南运输", entityId: "entity-south-freight", registrableDomain: "south-freight.example" }],
      claims: [{ subjectName: "华南运输", predicate: "公开案例", value: "台湾电子货物运输", directFactSupport: true, preciseEntityMapping: true }]
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[3]!.url, {
      hash: "sha256:syndicated-route", excerpt: "行业稿件介绍深圳台湾跨境货运线路。"
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[4]!.url, {
      hash: "sha256:syndicated-route", excerpt: "行业稿件介绍深圳台湾跨境货运线路。"
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[5]!.url, {
      hash: "sha256:ambiguous-company",
      excerpt: "远航物流提供台湾运输。",
      mentions: [
        { name: "远航物流", entityId: "entity-voyage-shenzhen", registrableDomain: "voyage-shenzhen.example" },
        { name: "远航物流", entityId: "entity-voyage-xiamen", registrableDomain: "voyage-xiamen.example" }
      ]
    }),
    available("obs-logistics-1", "query-supplier-discovery", primaryResults[6]!.url, {
      hash: "sha256:public-guidance", excerpt: "公开机构说明台湾航线的申报要求。"
    }),
    inaccessible("obs-logistics-1", "query-supplier-discovery", primaryResults[7]!.url),
    available("obs-logistics-2", "query-capability-fit", secondaryResults[0]!.url, {
      hash: "sha256:directory-original",
      excerpt: "目录列出华南运输提供深圳至台湾运输服务。",
      mentions: [{ name: "华南运输", entityId: "entity-south-freight", registrableDomain: "south-freight.example" }]
    }),
    available("obs-logistics-2", "query-capability-fit", secondaryResults[1]!.url, {
      hash: "sha256:company-route",
      excerpt: "华南运输提供深圳至台湾海运、空运与清关服务。",
      mentions: [{ name: "华南运输", entityId: "entity-south-freight", registrableDomain: "south-freight.example" }],
      claims: [{ subjectName: "华南运输", predicate: "运输能力", value: "深圳至台湾海运、空运与清关", directFactSupport: true, preciseEntityMapping: true }]
    }),
    available("obs-logistics-2", "query-capability-fit", secondaryResults[2]!.url, {
      hash: "sha256:contradictory-timing",
      excerpt: "同一公开页面分别写明三天和十天，口径无法确认。",
      mentions: [{ name: "东岸货运", entityId: "entity-east-freight", registrableDomain: "east-freight.example" }],
      claims: [
        { subjectName: "东岸货运", predicate: "运输时效", value: "3天", directFactSupport: true, preciseEntityMapping: true, contradictionGroupId: "east-transit-time" },
        { subjectName: "东岸货运", predicate: "运输时效", value: "10天", directFactSupport: true, preciseEntityMapping: true, contradictionGroupId: "east-transit-time" }
      ]
    })
  ];
  return {
    observations,
    retrievals,
    customerRegistrableDomain: "customer-logistics.example",
    competitorRegistrableDomains: ["south-freight.example"],
    knownSourceCategories: {
      "logistics-directory.example": "directory_or_reference",
      "trade-news-a.example": "independent_editorial",
      "trade-news-b.example": "independent_editorial",
      "port-authority.example": "public_body"
    }
  };
}

function result(surfaceResultOrder: number, url: string, title: string): SearchResultObservation {
  return { surfaceResultOrder, url, title, snippet: title, displayedHost: new URL(url).hostname };
}

function observation(observationId: string, queryId: string, exactQuery: string, results: SearchResultObservation[]): MarketSearchObservation {
  return {
    observationId,
    surface,
    queryId,
    exactQuery,
    requestedAt: "2026-07-12T00:00:00.000Z",
    completedAt: "2026-07-12T00:00:01.000Z",
    status: "complete",
    results,
    usage: { requestCount: 1, resultCount: results.length, estimatedCostMicros: 10 }
  };
}

function available(
  observationId: string,
  queryId: string,
  resultUrl: string,
  value: {
    hash: string;
    excerpt: string;
    mentions?: RetrievedPublicSourceFact["entityMentions"];
    claims?: RetrievedPublicSourceFact["claims"];
  }
): RetrievedPublicSourceFact {
  return {
    observationId, queryId, resultUrl, retrievalState: "available", publiclyRoutable: true,
    robotsAllowed: true, accessBarrier: "none", contentBytes: 500,
    normalizedText: value.excerpt, normalizedContentHash: value.hash, verifiedExcerpt: value.excerpt,
    entityMentions: value.mentions, claims: value.claims
  };
}

function inaccessible(observationId: string, queryId: string, resultUrl: string): RetrievedPublicSourceFact {
  return { observationId, queryId, resultUrl, retrievalState: "robots_denied", publiclyRoutable: true, robotsAllowed: false, accessBarrier: "unknown" };
}
