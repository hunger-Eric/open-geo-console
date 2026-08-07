import { describe, expect, it } from "vitest";
import {
  confirmBusinessQuestionSet,
  createModelBusinessQuestionCandidates,
  toCanonicalBuyerQuestionSet
} from "./business-questions";

const profile = {
  organizationName: "Target Co",
  brandNames: ["Target Co"],
  legalEntity: null,
  domain: "target.example",
  businessModel: "Enterprise AI system design and delivery",
  productsAndServices: ["Enterprise AI system design", "Freight Lead Agent case study"],
  capabilities: ["Workflow discovery", "System delivery"],
  targetAudiences: ["Business operations teams"],
  marketsAndRegions: ["China"],
  summary: "Enterprise AI system design and delivery. The portfolio includes a Freight Lead Agent case study.",
  confidence: "high" as const,
  evidence: [{ url: "https://target.example/services", quote: "Enterprise AI system design and delivery." }]
};

const enterpriseAiOutput = {
  questions: [
    { purpose: "core_service_discovery", text: "Which providers design and deliver enterprise AI systems for operational teams?" },
    { purpose: "customer_region_fit", text: "Which enterprise AI implementation options fit operations teams that need workflow automation in China?" },
    { purpose: "purchase_delivery_risk", text: "What delivery scope, data constraints, and implementation risks should a buyer assess before commissioning an enterprise AI system?" }
  ]
};

function candidates(modelOutput: unknown = enterpriseAiOutput) {
  return createModelBusinessQuestionCandidates({ locale: "en", region: "global", profile, modelOutput });
}

describe("model-authored business question contracts", () => {
  it("preserves enterprise-AI questions authored by the model even when the profile contains a Freight Lead Agent case", () => {
    const set = candidates();
    const text = set.questions.map(({ generatedText }) => generatedText).join(" ");
    expect(text).toContain("enterprise AI");
    expect(text).not.toMatch(/logistics|freight/i);
    expect(set.questions.map(({ purpose }) => purpose).sort()).toEqual([
      "core_service_discovery", "customer_region_fit", "purchase_delivery_risk"
    ]);
  });

  it("accepts model-authored logistics questions without a logistics classifier", () => {
    const set = candidates({
      questions: [
        { purpose: "core_service_discovery", text: "Which providers offer cross-border logistics services between China and the United Kingdom?" },
        { purpose: "customer_region_fit", text: "Which logistics options fit United Kingdom importers needing customs clearance and door-to-door delivery?" },
        { purpose: "purchase_delivery_risk", text: "Which customs, delivery, and liability risks should buyers assess before selecting a logistics provider?" }
      ]
    });
    expect(set.questions.map(({ generatedText }) => generatedText).join(" ")).toMatch(/logistics/i);
  });

  it("rejects malformed, duplicate, or missing model output rather than generating fallback questions", () => {
    expect(() => candidates({ questions: enterpriseAiOutput.questions.slice(0, 2) })).toThrow(/exactly three/i);
    expect(() => candidates({ questions: [
      enterpriseAiOutput.questions[0], enterpriseAiOutput.questions[0], enterpriseAiOutput.questions[2]
    ] })).toThrow(/distinct/i);
    expect(() => candidates({ questions: [
      { purpose: "core_service_discovery", text: enterpriseAiOutput.questions[0].text },
      { purpose: "customer_region_fit", text: enterpriseAiOutput.questions[1].text },
      { purpose: "unknown", text: enterpriseAiOutput.questions[2].text }
    ] })).toThrow(/unsupported/i);
  });

  it("ignores additional model fields instead of rejecting otherwise usable questions", () => {
    const set = candidates({
      ...enterpriseAiOutput,
      optionalModelRationale: "Extra model detail is not part of the persisted contract.",
      questions: enterpriseAiOutput.questions.map((question) => ({ ...question, optionalDetail: "ignored" }))
    });
    expect(set.questions.map(({ generatedText }) => generatedText)).toEqual(enterpriseAiOutput.questions.map(({ text }) => text));
  });

  it("keeps structural acknowledgement and identity-neutrality safeguards", () => {
    const lowConfidence = createModelBusinessQuestionCandidates({
      locale: "en",
      region: "global",
      profile: { ...profile, confidence: "low" },
      modelOutput: {
        questions: [
          { purpose: "core_service_discovery", text: "Which providers offer services comparable to Target Co's enterprise AI delivery?" },
          { purpose: "customer_region_fit", text: "Which enterprise AI delivery options fit Target Co customers with operational automation needs?" },
          { purpose: "purchase_delivery_risk", text: "How should a buyer compare delivery scope and implementation risks for Target Co alternatives?" }
        ]
      }
    });
    expect(() => confirmBusinessQuestionSet({
      candidates: lowConfidence,
      finalTexts: lowConfidence.questions.map(({ generatedText }) => generatedText),
      acknowledgedLowConfidence: false,
      confirmedAt: "2026-08-07T00:00:00.000Z"
    })).toThrow(/acknowledgement/i);
    const confirmed = confirmBusinessQuestionSet({
      candidates: lowConfidence,
      finalTexts: lowConfidence.questions.map(({ generatedText }) => generatedText),
      acknowledgedLowConfidence: true,
      confirmedAt: "2026-08-07T00:00:00.000Z"
    });
    expect(JSON.stringify(confirmed.questions.map(({ neutralPublicText }) => neutralPublicText))).not.toContain("Target Co");
  });

  it("projects model text to public search without parsing question semantics in code", () => {
    const set = candidates();
    const confirmed = confirmBusinessQuestionSet({
      candidates: set,
      finalTexts: set.questions.map(({ generatedText }) => generatedText),
      acknowledgedLowConfidence: false,
      confirmedAt: "2026-08-07T00:00:00.000Z"
    });
    const publicSet = toCanonicalBuyerQuestionSet(confirmed);
    expect(publicSet.questions.map(({ exactText }) => exactText)).toEqual(confirmed.questions.map(({ neutralPublicText }) => neutralPublicText));
    expect(publicSet.questions.map(({ derivation }) => derivation.subject)).toEqual(confirmed.questions.map(({ neutralPublicText }) => neutralPublicText));
  });
});
