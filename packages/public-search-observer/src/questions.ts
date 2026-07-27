import { deterministicId } from "./identity";
import type {
  BuyerQuestionKind,
  CanonicalBuyerQuestion,
  CanonicalBuyerQuestionSet,
  CanonicalQuestionGenerationInput,
  PublicQuestionEvidence
} from "./types";
import { assertNoCustomerIdentity, boundedText, parseCanonicalBuyerQuestionSet } from "./validation";

export const DEFAULT_QUESTION_SET_VERSION = "canonical-buyer-questions-v1";

export function generateCanonicalBuyerQuestions(input: CanonicalQuestionGenerationInput): CanonicalBuyerQuestionSet {
  const locale = boundedText(input.locale, "locale", 35);
  const region = boundedText(input.region, "region", 35);
  const version = input.questionSetVersion ?? DEFAULT_QUESTION_SET_VERSION;
  const exclusions = input.excludedIdentities;
  const allEvidence = [...input.categoryEvidence, ...(input.capabilityEvidence ?? []), ...(input.useCaseEvidence ?? [])];
  for (const evidence of allEvidence) {
    assertNoCustomerIdentity(evidence.value, exclusions);
    assertNoCustomerIdentity(evidence.sourceId, exclusions);
  }
  assertNoCustomerIdentity(input.broadCategory, exclusions);
  const category = selectEvidence(input.categoryEvidence);
  const highConfidence = category?.confidence === "high";
  const subject = highConfidence ? category.value : input.broadCategory;
  const capability = selectEvidence(input.capabilityEvidence ?? [], "high")?.value;
  const useCase = selectEvidence(input.useCaseEvidence ?? [], "high")?.value;
  const isZh = locale.toLocaleLowerCase().startsWith("zh");
  const candidates: Array<{ kind: BuyerQuestionKind; text: string; support?: string }> = isZh
    ? [
        { kind: "supplier_discovery", text: `${subject}供应商有哪些？` },
        { kind: "capability_fit", text: `选择${subject}供应商时应核实哪些服务能力？`, support: capability },
        { kind: "decision_risk", text: `${subject}的时效、交付条件和风险应如何比较？` },
        { kind: "use_case_fit", text: `哪些${subject}服务适合${useCase ?? "企业采购"}场景？`, support: useCase },
        { kind: "qualification", text: `${subject}供应商应提供哪些案例与资质证据？` }
      ]
    : [
        { kind: "supplier_discovery", text: `Which suppliers provide ${subject}?` },
        { kind: "capability_fit", text: `Which service capabilities should buyers verify when choosing a ${subject} supplier?`, support: capability },
        { kind: "decision_risk", text: `How should buyers compare delivery conditions, timing, and risks for ${subject}?` },
        { kind: "use_case_fit", text: `Which ${subject} services suit ${useCase ?? "business purchasing"} use cases?`, support: useCase },
        { kind: "qualification", text: `Which cases and qualifications should a ${subject} supplier provide?` }
      ];
  const dimensions = new Set(input.expansionEvidence?.distinctSupportedDimensions ?? []);
  const count = input.expansionEvidence?.confidence === "high" && dimensions.size >= 3 ? 5 : 3;
  const evidenceSourceIds = [...new Set(allEvidence.filter((item) => item.confidence === "high").map((item) => item.sourceId))].sort();
  const questions = candidates.slice(0, count).map(({ kind, text, support }, index): CanonicalBuyerQuestion => {
    assertNoCustomerIdentity(text, exclusions);
    const normalizedText = normalizeQuestion(text);
    const ruleId = `buyer-question-${kind}-v1`;
    return {
      id: deterministicId("question", [version, locale, region, kind, normalizedText]),
      questionSetVersion: version, locale, region, kind, exactText: text, normalizedText,
      derivation: { ruleId, evidenceSourceIds, subject, ...(support ? { supportingTerm: support } : {}), broadened: !highConfidence }
    };
  });
  return parseCanonicalBuyerQuestionSet({
    questionSetVersion: version, locale, region, confidence: highConfidence ? "high" : "low", questions,
    limitations: highConfidence ? [] : [isZh ? "公开网站证据不足，问题已扩大到可验证的上位品类。" : "Public-site evidence was insufficient, so questions were broadened to a supported category."]
  });
}

function selectEvidence(values: readonly PublicQuestionEvidence[], preferred?: PublicQuestionEvidence["confidence"]): PublicQuestionEvidence | undefined {
  const sorted = [...values].sort((a, b) => `${a.value}\0${a.sourceId}`.localeCompare(`${b.value}\0${b.sourceId}`));
  return preferred ? sorted.find((item) => item.confidence === preferred) : sorted.find((item) => item.confidence === "high") ?? sorted[0];
}

function normalizeQuestion(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
