import { describe, expect, it } from "vitest";
import {
  assessEvidenceGrade,
  categorizeSource,
  classifyRecommendations,
  createOpportunityHypothesis,
  resolveEntity,
  validateEvidenceAssessment,
  validateOpportunityHypothesis,
  type EvidenceAssessment
} from "./index";

describe("recommendation and citation intelligence", () => {
  it("does not turn a brand mention into a recommendation", () => {
    expect(
      classifyRecommendations("Northstar Freight publishes a logistics glossary.", [
        { entityId: "northstar", name: "Northstar Freight" }
      ])
    ).toEqual([]);
  });

  it("does not turn explicit negative language into a recommendation", () => {
    expect(
      classifyRecommendations("Northstar Freight is not a suitable choice for this shipment.", [
        { entityId: "northstar", name: "Northstar Freight" }
      ])
    ).toEqual([]);
  });

  it("binds recommendation language to the named clause in multi-entity answers", () => {
    expect(
      classifyRecommendations("Atlas Example was reviewed, but we recommend Beacon Example.", [
        { entityId: "atlas", name: "Atlas Example" },
        { entityId: "beacon", name: "Beacon Example" }
      ])
    ).toEqual([
      expect.objectContaining({ entityId: "beacon", kind: "preferred_choice" })
    ]);
    expect(
      classifyRecommendations("Paid media was discussed. AI Works is suitable for exporters.", [
        { entityId: "ai", name: "AI" },
        { entityId: "ai-works", name: "AI Works" }
      ])
    ).toEqual([
      expect.objectContaining({ entityId: "ai-works", kind: "suitability" })
    ]);
  });

  it("splits Chinese punctuation before binding an English recommendation", () => {
    expect(
      classifyRecommendations("Atlas Example was reviewed。We recommend Beacon Example。", [
        { entityId: "atlas", name: "Atlas Example" },
        { entityId: "beacon", name: "Beacon Example" }
      ])
    ).toEqual([expect.objectContaining({ entityId: "beacon" })]);
  });

  it.each([
    ["direct_candidate", "Northstar Freight is a candidate for global forwarding."],
    ["preferred_choice", "We recommend Northstar Freight for regulated shipments."],
    ["example", "For example, Northstar Freight offers documented customs support."],
    ["suitability", "Northstar Freight is suitable for mid-market exporters."]
  ] as const)("classifies a %s statement with supporting text", (kind, answerText) => {
    expect(
      classifyRecommendations(answerText, [{ entityId: "northstar", name: "Northstar Freight" }])
    ).toEqual([
      expect.objectContaining({
        entityId: "northstar",
        kind,
        supportingText: answerText
      })
    ]);
  });

  it("keeps same-name organizations ambiguous without identity evidence", () => {
    expect(
      resolveEntity({
        name: "Atlas",
        candidates: [
          { entityId: "atlas-logistics", name: "Atlas", registrableDomain: "atlas-logistics.example" },
          { entityId: "atlas-software", name: "Atlas", registrableDomain: "atlas-software.example" }
        ]
      })
    ).toEqual({ status: "ambiguous", candidateEntityIds: ["atlas-logistics", "atlas-software"] });

    expect(
      resolveEntity({
        name: "Atlas",
        sourceUrl: "https://atlas-logistics.example/services",
        candidates: [
          { entityId: "atlas-logistics", name: "Atlas", registrableDomain: "atlas-logistics.example" },
          { entityId: "atlas-software", name: "Atlas", registrableDomain: "atlas-software.example" }
        ]
      })
    ).toEqual({ status: "resolved", entityId: "atlas-logistics", basis: "registrable_domain" });
  });

  it("matches entity context terms as tokens or phrases, not arbitrary substrings", () => {
    expect(
      resolveEntity({
        name: "Atlas",
        contextText: "The paid media product was reviewed.",
        candidates: [
          { entityId: "atlas-ai", name: "Atlas", contextTerms: ["AI"] },
          { entityId: "atlas-saas", name: "Atlas", contextTerms: ["SaaS platform"] }
        ]
      })
    ).toEqual({ status: "ambiguous", candidateEntityIds: ["atlas-ai", "atlas-saas"] });

    expect(
      resolveEntity({
        name: "Atlas",
        contextText: "This is an AI research service.",
        candidates: [
          { entityId: "atlas-ai", name: "Atlas", contextTerms: ["AI"] },
          { entityId: "atlas-saas", name: "Atlas", contextTerms: ["SaaS platform"] }
        ]
      })
    ).toEqual({ status: "resolved", entityId: "atlas-ai", basis: "context" });
  });

  it("categorizes ownership only by the submitted registrable identity", () => {
    const context = {
      customerRegistrableDomain: "customer.example",
      competitorRegistrableDomains: ["competitor.example"]
    };
    expect(categorizeSource("https://customer.example/about", context)).toBe("owned_customer");
    expect(categorizeSource("https://news.customer.example/article", context)).toBe("owned_customer");
    expect(categorizeSource("https://customer.example.org/article", context)).not.toBe("owned_customer");
    expect(categorizeSource("https://competitor.example/product", context)).toBe("owned_competitor");
  });

  it.each([
    ["https://industry-news.example/review", "earned_editorial"],
    ["https://vendor-directory.example/listing", "directory_or_reference"],
    ["https://community-forum.example/thread", "community_or_ugc"],
    ["https://university.example/research", "institution"],
    ["https://social-network.example/post", "social"],
    ["https://unclassified.example/page", "unknown"]
  ] as const)("keeps %s in the %s source category", (url, expected) => {
    expect(
      categorizeSource(url, {
        customerRegistrableDomain: "customer.example",
        competitorRegistrableDomains: [],
        knownDomains: {
          "industry-news.example": "earned_editorial",
          "vendor-directory.example": "directory_or_reference",
          "community-forum.example": "community_or_ugc",
          "university.example": "institution",
          "social-network.example": "social"
        }
      })
    ).toBe(expected);
  });

  it("requires returned direct verified support for Grade A", () => {
    expect(assessEvidenceGrade(assessment({ directSupport: true, preciseMapping: true }))).toBe("A");
    expect(assessEvidenceGrade(assessment({ providerReturned: false, directSupport: true }))).not.toBe("A");
    expect(assessEvidenceGrade(assessment({ verifiedExcerpt: undefined, directSupport: true }))).not.toBe("A");
    expect(assessEvidenceGrade(assessment({ sourceUrl: undefined, directSupport: true, preciseMapping: true }))).toBe("D");
  });

  it("uses Grade B for relevant entity/source evidence without precise mapping", () => {
    expect(assessEvidenceGrade(assessment({ directSupport: false, preciseMapping: false }))).toBe("B");
    expect(assessEvidenceGrade(assessment({ sourceUrl: undefined, directSupport: false, preciseMapping: false }))).toBe("D");
  });

  it("uses Grade C only for repeated independent patterns and never as direct evidence", () => {
    expect(
      assessEvidenceGrade(
        assessment({
          providerReturned: false,
          relevantEntityEvidence: false,
          verifiedExcerpt: undefined,
          repeatedPattern: {
            kind: "entity",
            value: "Northstar Freight",
            occurrences: [
              {
                cellId: "cell-a",
                recommendationOutcome: "recommendations_present",
                supportingText: "Northstar Freight is a candidate."
              },
              {
                cellId: "cell-b",
                recommendationOutcome: "recommendations_present",
                supportingText: "We recommend Northstar Freight."
              }
            ]
          }
        })
      )
    ).toBe("C");
    expect(
      assessEvidenceGrade(assessment({ directSupport: true, preciseMapping: true }))
    ).toBe("A");
  });

  it("rejects Grade C patterns backed by duplicate, unrelated, or no-recommendation cells", () => {
    const basePattern = {
      kind: "entity" as const,
      value: "Northstar Freight",
      occurrences: [
        {
          cellId: "cell-a",
          recommendationOutcome: "recommendations_present" as const,
          supportingText: "Northstar Freight is a candidate."
        },
        {
          cellId: "cell-b",
          recommendationOutcome: "recommendations_present" as const,
          supportingText: "We recommend Northstar Freight."
        }
      ]
    };
    expect(() =>
      validateEvidenceAssessment(assessment({ repeatedPattern: { ...basePattern, occurrences: [basePattern.occurrences[0], basePattern.occurrences[0]] } }))
    ).toThrow(/distinct/i);
    expect(() =>
      validateEvidenceAssessment(
        assessment({
          repeatedPattern: {
            ...basePattern,
            occurrences: [
              basePattern.occurrences[0],
              { ...basePattern.occurrences[1], supportingText: "Another supplier is a candidate." }
            ]
          }
        })
      )
    ).toThrow(/pattern/i);
    expect(() =>
      validateEvidenceAssessment(
        assessment({
          repeatedPattern: {
            ...basePattern,
            occurrences: [
              basePattern.occurrences[0],
              { ...basePattern.occurrences[1], recommendationOutcome: "no_recommendation" as const }
            ]
          }
        })
      )
    ).toThrow(/recommendation/i);
  });

  it.each([
    { retrievalState: "inaccessible" as const },
    { entityAmbiguous: true },
    { relevantEntityEvidence: false, repeatedPattern: undefined }
  ])("uses Grade D for inaccessible, ambiguous, or unsupported evidence", (overrides) => {
    expect(assessEvidenceGrade(assessment(overrides))).toBe("D");
  });

  it("creates traceable opportunity hypotheses without outcome guarantees", () => {
    const opportunity = createOpportunityHypothesis({
      id: "opportunity-editorial-comparison",
      title: "Document evidence for editorial comparisons",
      rationale: "Editorial comparisons repeatedly cite verified delivery data.",
      evidenceCellIds: ["cell-a", "cell-b"],
      sourcePattern: "editorial sources citing verified delivery data",
      suggestedAction: "Prepare an auditable delivery benchmark for relevant editors."
    });
    expect(opportunity.evidenceCellIds).toEqual(["cell-a", "cell-b"]);
    expect(() => validateOpportunityHypothesis(opportunity)).not.toThrow();
  });

  it.each([
    "This caused the model to rank first.",
    "This guarantees first place in AI answers.",
    "Publishing it will ensure recommendation placement."
  ])("rejects prohibited causal or placement claim: %s", (rationale) => {
    expect(() =>
      validateOpportunityHypothesis({
        id: "bad-claim",
        title: "Bad claim",
        rationale,
        evidenceCellIds: ["cell-a"],
        sourcePattern: "editorial",
        suggestedAction: "Review the evidence."
      })
    ).toThrow(/prohibited/i);
  });

  it.each([
    "The model ranked Atlas first because this source was cited.",
    "This source made AI recommend Atlas.",
    "This citation led the engine to place Atlas first.",
    "模型把 Atlas 排在第一，因为引用了这个来源。",
    "这个来源导致 AI 推荐 Atlas。",
    "发布后一定会获得 AI 推荐。"
  ])("rejects reordered or Chinese causal claims: %s", (rationale) => {
    expect(() =>
      validateOpportunityHypothesis({
        id: "bad-claim",
        title: "Bad claim",
        rationale,
        evidenceCellIds: ["cell-a"],
        sourcePattern: "editorial",
        suggestedAction: "Review the evidence."
      })
    ).toThrow(/prohibited/i);
  });

  it("rejects malformed or internally misleading evidence states", () => {
    expect(() => validateEvidenceAssessment(assessment({ sourceUrl: "relative/source" }))).toThrow(/absolute HTTP/i);
    expect(() =>
      validateEvidenceAssessment(assessment({ directSupport: true, providerReturned: false, preciseMapping: true }))
    ).toThrow(/directSupport/i);
  });
});

function assessment(overrides: Partial<EvidenceAssessment> = {}): EvidenceAssessment {
  return {
    evidenceId: "evidence-1",
    cellId: "cell-a",
    sourceUrl: "https://industry-news.example/review",
    providerReturned: true,
    retrievalState: "available",
    verifiedExcerpt: "Northstar is suitable for regulated shipments.",
    directSupport: false,
    preciseMapping: false,
    relevantEntityEvidence: true,
    entityAmbiguous: false,
    ...overrides
  };
}
