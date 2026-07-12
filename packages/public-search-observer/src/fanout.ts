import { deterministicId } from "./identity";
import type { CanonicalBuyerQuestion, PublicSearchSurface, SearchQueryFanout, SearchQueryVariant } from "./types";
import { assertNoCustomerIdentity, parseSearchExecutionBudget, parseSearchQueryFanout } from "./validation";
import type { CustomerIdentityExclusion, SearchExecutionBudget } from "./types";

export const DEFAULT_FANOUT_VERSION = "public-search-fanout-v1";
export const DEFAULT_QUERY_BUDGET: SearchExecutionBudget = Object.freeze({ maxRequests: 1, maxResults: 10, timeoutMs: 20_000, maxCostMicros: 100_000 });

export function createSearchQueryFanout(input: {
  question: CanonicalBuyerQuestion;
  surface: PublicSearchSurface;
  fanoutVersion?: string;
  excludedIdentities?: readonly CustomerIdentityExclusion[];
  resultDepth?: number;
  budget?: SearchExecutionBudget;
}): SearchQueryFanout {
  const fanoutVersion = input.fanoutVersion ?? DEFAULT_FANOUT_VERSION;
  const subject = input.question.derivation.subject;
  const support = input.question.derivation.supportingTerm;
  const zh = input.question.locale.toLocaleLowerCase().startsWith("zh");
  const derived = zh
    ? [
        ["canonical", input.question.normalizedText], ["supplier-discovery", `${subject} 公司 供应商`],
        ["capability", `${subject} 服务能力${support ? ` ${support}` : ""}`], ["delivery-risk", `${subject} 时效 交付条件 风险`],
        ["cases", `${subject} 案例 客户`], ["qualification", `${subject} 资质 标准`]
      ] as const
    : [
        ["canonical", input.question.normalizedText], ["supplier-discovery", `${subject} companies suppliers`],
        ["capability", `${subject} service capabilities${support ? ` ${support}` : ""}`], ["delivery-risk", `${subject} timing delivery conditions risks`],
        ["cases", `${subject} case studies customers`], ["qualification", `${subject} qualifications standards`]
      ] as const;
  const resultDepth = input.resultDepth ?? 10;
  const queries = derived.slice(0, 6).map(([rule, raw]): SearchQueryVariant => {
    const exactQuery = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
    assertNoCustomerIdentity(exactQuery, input.excludedIdentities ?? []);
    return {
      id: deterministicId("query", [input.question.id, fanoutVersion, rule, exactQuery, input.question.locale, input.question.region, input.surface.surfaceId, input.surface.surfaceVersion]),
      questionId: input.question.id, fanoutVersion, locale: input.question.locale, region: input.question.region,
      exactQuery, derivationRuleId: `query-${rule}-v1`, resultDepth
    };
  });
  return parseSearchQueryFanout({
    questionId: input.question.id, questionSetVersion: input.question.questionSetVersion, fanoutVersion,
    surface: input.surface, queries, budget: parseSearchExecutionBudget(input.budget ?? DEFAULT_QUERY_BUDGET)
  });
}
