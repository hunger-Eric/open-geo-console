import { createHash } from "node:crypto";
import type { AnswerQuestion, GeneratedQuestionSet, QuestionGenerationInput } from "./types";
import { parseAnswerQuestion } from "./validation";
import { canonicalizeBrand, stripCanonicalBrands } from "./brands";

export function generatePurchaseQuestions(input: QuestionGenerationInput): GeneratedQuestionSet {
  const locale = input.locale.trim() || "en";
  if (typeof input.organizationName !== "string" || !input.organizationName.trim()) {
    throw new TypeError("organizationName is required for non-branded question generation.");
  }
  const organizationName = input.organizationName.trim();
  const organizationKey = canonicalizeBrand(organizationName);
  if (!organizationKey) throw new TypeError("organizationName must contain a brand identity beyond a company suffix.");
  const brandAliases = [...new Set((input.brandAliases ?? []).map((alias) => alias.trim()).filter(Boolean))]
    .filter((alias) => canonicalizeBrand(alias).length > 0 && canonicalizeBrand(alias) !== organizationKey);
  const brands = [organizationName, ...brandAliases];
  const category = nonBrandedFirst(input.categories, brands);
  const capability = nonBrandedFirst(input.capabilities, brands);
  const audience = nonBrandedFirst(input.audiences, brands);
  const useCase = nonBrandedFirst(input.useCases, brands);
  const isChinese = locale.toLocaleLowerCase().startsWith("zh");
  const confidence = category && (capability || audience || useCase) ? "high" : "low";
  const subject = category ?? (isChinese ? "这类服务" : "this type of service");
  const detail = capability ?? useCase ?? (isChinese ? "核心需求" : "core requirements");
  const buyer = audience ?? (isChinese ? "企业买家" : "business buyers");
  const exactTexts = isChinese
    ? [
        `${buyer}应该如何选择${subject}供应商？`,
        `哪些${subject}供应商适合需要${detail}的企业？`,
        `评估${subject}解决方案时最值得比较哪些选项？`,
        `哪些${subject}服务更适合${useCase ?? detail}场景？`
      ]
    : [
        `How should ${buyer} choose a ${subject} provider?`,
        `Which ${subject} providers suit companies that need ${detail}?`,
        `Which options are worth comparing when evaluating ${subject} solutions?`,
        `Which ${subject} services are suitable for ${useCase ?? detail} use cases?`
      ];
  const categories: AnswerQuestion["category"][] = [
    "supplier_selection", "use_case_suitability", "solution_comparison", "category_selection"
  ];
  const count = confidence === "high" ? 4 : 3;
  const basis = compact([
    ...input.sourceUrls.map((url) => `source:${url}`),
    category ? `category:${category}` : undefined,
    capability ? `capability:${capability}` : undefined,
    audience ? `audience:${audience}` : undefined,
    useCase ? `use-case:${useCase}` : undefined
  ]);
  const questions = exactTexts.slice(0, count).map((exactText, index) => parseAnswerQuestion({
    id: questionId(locale, categories[index]!, exactText),
    locale,
    category: categories[index],
    exactText,
    inferenceBasis: basis.length > 0 ? basis : ["public-site evidence was insufficient for a narrow category"]
  }));
  return {
    version: "purchase-v1",
    organizationName,
    brandAliases,
    confidence,
    ...(confidence === "low" ? { fallbackReason: "insufficient_category_evidence" as const } : {}),
    limitations: confidence === "low"
      ? [isChinese
          ? "官网证据不足，问题使用较宽泛的品类措辞。"
          : "Public site evidence was insufficient, so questions use broader category language."]
      : [],
    questions
  };
}

function questionId(locale: string, category: string, exactText: string): string {
  return `purchase-${createHash("sha256").update(JSON.stringify([locale, category, exactText])).digest("hex").slice(0, 20)}`;
}

function nonBrandedFirst(values: string[] | undefined, brands: string[]): string | undefined {
  return values
    ?.map((value) => removeBrands(value.trim(), brands))
    .map((value) => value.replace(/\s{2,}/g, " ").trim())
    .find(Boolean);
}

function removeBrands(value: string, brands: string[]): string {
  return stripCanonicalBrands(value, brands);
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
