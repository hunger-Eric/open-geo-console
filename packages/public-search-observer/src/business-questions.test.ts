import { describe, expect, it } from "vitest";
import { confirmBusinessQuestionSet, generateBusinessQuestionCandidates, toCanonicalBuyerQuestionSet } from "./business-questions";

const profile = {
  organizationName: "Shun Express",
  brandNames: ["Shun Express", "顺速物流"],
  legalEntity: "Shun Express Limited",
  domain: "shun-express.com",
  businessModel: "cross-border logistics provider",
  productsAndServices: ["Air freight", "China to UK door-to-door logistics"],
  capabilities: ["customs clearance", "door-to-door delivery"],
  targetAudiences: ["UK importers", "Chinese exporters"],
  marketsAndRegions: ["United Kingdom", "China"],
  summary: "Door-to-door China to the United Kingdom logistics for UK importers with customs clearance.",
  confidence: "high" as const,
  evidence: [
    { url: "https://shun-express.com/service", quote: "China to UK door-to-door logistics and customs clearance for UK importers." },
    { url: "https://shun-express.com/about", quote: "Door-to-door delivery between China and the United Kingdom." }
  ]
};

describe("business question contracts", () => {
  it("always generates exactly three fixed-purpose questions from service, audience, and region evidence", () => {
    const set = generateBusinessQuestionCandidates({ locale: "en", region: "global", profile });
    expect(set.questions.map(({ purpose }) => purpose)).toEqual([
      "core_service_discovery", "customer_region_fit", "purchase_delivery_risk"
    ]);
    expect(set.questions).toHaveLength(3);
    expect(set.questions[0].generatedText).toContain("China to UK door-to-door logistics");
    expect(set.questions[1].generatedText).toMatch(/UK importers.*United Kingdom/i);
  });

  it("uses evidence strength and discovery order instead of lexical order", () => {
    const set = generateBusinessQuestionCandidates({ locale: "en", region: "global", profile: {
      ...profile,
      productsAndServices: ["AAA generic freight", "China to UK door-to-door logistics"],
      evidence: [{ url: "https://shun-express.com/service", quote: "China to UK door-to-door logistics China to UK door-to-door logistics for UK importers." }]
    } });
    expect(set.questions[0].generatedText).toContain("China to UK door-to-door logistics");
    expect(set.questions[0].generatedText).not.toContain("AAA generic freight");
  });

  it("keeps target-owned operating claims out of neutral market questions", () => {
    const set = generateBusinessQuestionCandidates({ locale: "zh-CN", region: "CN", profile: {
      ...profile,
      productsAndServices: ["自营专线（台湾海快/海运/空运专线）"],
      capabilities: ["全球17个网点运营"],
      targetAudiences: ["外贸企业"],
      marketsAndRegions: ["台湾"],
      summary: "该公司声明自营台湾海快、海运和空运专线，并运营全球17个网点。",
      evidence: [{ url: "https://shun-express.com/service", quote: "自营台湾海快、海运和空运专线，全球17个网点运营。" }]
    } });

    expect(set.questions.map(({ purpose }) => purpose)).toEqual([
      "core_service_discovery", "customer_region_fit", "purchase_delivery_risk"
    ]);
    expect(set.questions.map(({ generatedText }) => generatedText).join(" ")).not.toMatch(/自营|直营|自有|17个网点/);
    expect(set.questions[0].generatedText).toMatch(/台湾.*海快.*海运.*空运/);
    expect(set.questions[2].generatedText).toMatch(/服务范围.*交付条件.*限制.*风险/);
  });

  it("compacts long Chinese route lists into a source-driven service focus", () => {
    const service = "台湾海快、海运、空运专线、菲律宾专线、阿联酋专线、沙特专线";
    const set = generateBusinessQuestionCandidates({ locale: "zh-CN", region: "CN", profile: {
      ...profile,
      businessModel: "跨境物流服务商",
      productsAndServices: [service],
      targetAudiences: ["外贸企业"],
      marketsAndRegions: ["台湾", "菲律宾", "中东"],
      summary: `面向外贸企业提供${service}等跨境物流服务。`,
      evidence: [{ url: "https://shun-express.com/service", quote: `公开提供${service}。` }]
    } });

    expect(set.questions.map(({ generatedText }) => generatedText)).toEqual([
      "哪些服务商公开提供跨境物流服务（如台湾海快、海运、空运专线等）？",
      "哪些跨境物流服务方案适合外贸企业进入台湾、菲律宾、中东市场，分别适用于什么货型、时效与交付条件？",
      "采购跨境物流服务时，应核验哪些服务范围、交付条件、限制与风险？"
    ]);
    expect(set.questions[1].generatedText).not.toContain("面向台湾的台湾海快");
    expect(set.questions[1].generatedText.match(/台湾海快/g)).toBeNull();
  });

  it("requires acknowledgement before confirming a low-confidence set", () => {
    const candidates = generateBusinessQuestionCandidates({ locale: "en", region: "global", profile: {
      ...profile, confidence: "low", productsAndServices: [], targetAudiences: [], marketsAndRegions: [], evidence: []
    } });
    expect(candidates.confidence).toBe("low");
    expect(() => confirmBusinessQuestionSet({ candidates, finalTexts: candidates.questions.map(({ generatedText }) => generatedText), acknowledgedLowConfidence: false, confirmedAt: "2026-07-14T00:00:00.000Z" })).toThrow(/acknowledgement/i);
  });

  it("keeps private brand wording but produces identity-neutral public variants", () => {
    const candidates = generateBusinessQuestionCandidates({ locale: "en", region: "global", profile });
    const confirmed = confirmBusinessQuestionSet({
      candidates,
      finalTexts: [
        "Which providers can replace Shun Express for China to UK door-to-door logistics?",
        "Which providers fit Shun Express customers who are UK importers in the United Kingdom?",
        "How should Shun Express compare customs, delivery conditions, and risk?"
      ],
      acknowledgedLowConfidence: true,
      confirmedAt: "2026-07-14T00:00:00.000Z"
    });
    expect(confirmed.questions.map(({ privateText }) => privateText).join(" ")).toContain("Shun Express");
    expect(confirmed.questions.map(({ neutralPublicText }) => neutralPublicText).join(" ")).not.toMatch(/Shun Express|顺速物流|shun-express/i);
    expect(confirmed.questions).toHaveLength(3);
  });

  it("rejects duplicate, empty, contact-bearing, and unneutralizable question sets", () => {
    const candidates = generateBusinessQuestionCandidates({ locale: "en", region: "global", profile });
    const base = candidates.questions.map(({ generatedText }) => generatedText) as [string, string, string];
    expect(() => confirmBusinessQuestionSet({ candidates, finalTexts: [base[0], base[0], base[2]], acknowledgedLowConfidence: true, confirmedAt: "2026-07-14T00:00:00.000Z" })).toThrow(/distinct/i);
    expect(() => confirmBusinessQuestionSet({ candidates, finalTexts: ["", base[1], base[2]], acknowledgedLowConfidence: true, confirmedAt: "2026-07-14T00:00:00.000Z" })).toThrow();
    expect(() => confirmBusinessQuestionSet({ candidates, finalTexts: ["Contact buyer@example.com about freight", base[1], base[2]], acknowledgedLowConfidence: true, confirmedAt: "2026-07-14T00:00:00.000Z" })).toThrow(/contact/i);
  });

  it("converts only the three neutral variants into the shared public-search contract", () => {
    const candidates=generateBusinessQuestionCandidates({locale:"en",region:"global",profile});
    const confirmed=confirmBusinessQuestionSet({candidates,finalTexts:[
      "Which providers can replace Shun Express for China to UK door-to-door logistics?",
      "Which providers fit Shun Express customers who are UK importers in the United Kingdom?",
      "How should Shun Express compare customs, delivery conditions, and risk?"
    ],acknowledgedLowConfidence:true,confirmedAt:"2026-07-14T00:00:00.000Z"});
    const publicSet=toCanonicalBuyerQuestionSet(confirmed);
    expect(publicSet.questions).toHaveLength(3);
    expect(JSON.stringify(publicSet)).not.toMatch(/Shun Express|shun-express\.com/i);
    expect(publicSet.questions.map(({normalizedText})=>normalizedText)).toEqual(confirmed.questions.map(({neutralPublicText})=>neutralPublicText));
    expect(publicSet.questions[2]!.derivation.subject.length).toBeLessThan(publicSet.questions[2]!.normalizedText.length);
  });
});
