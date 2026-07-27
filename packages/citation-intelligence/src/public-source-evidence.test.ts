import { describe, expect, it } from "vitest";
import {
  assessPublicSourceEvidenceGrade,
  arePublicSourcesIndependentlyControlled,
  buildPublicSourceEvidenceGraph,
  canonicalizePublicSourceUrl,
  createEvidenceFamilies,
  evaluatePublicEntityPresence,
  getPublicSourceDomainIdentity,
  scoreRetrievalReadiness,
  scoreSourceEligibility,
  createPublicSourceOpportunityHypothesis,
  type PublicSourceGraphInput
} from "./index";
import { createLogisticsPublicSourceFixture } from "./public-source-testing";

describe("public-source evidence forensics", () => {
  it("canonicalizes public URLs without turning result order into authority", () => {
    expect(canonicalizePublicSourceUrl("HTTPS://News.Example.co.uk:443/path/?utm_source=x&b=2&a=1#top"))
      .toBe("https://news.example.co.uk/path?a=1&b=2");
    const graph = buildPublicSourceEvidenceGraph(createLogisticsPublicSourceFixture());
    const first = graph.evidence.find((item) => item.observationRefs.some((ref) => ref.surfaceResultOrder === 1));
    const later = graph.evidence.find((item) => item.observationRefs.some((ref) => ref.surfaceResultOrder === 7));
    expect(first?.retrievalReadiness.score).toBe(later?.retrievalReadiness.score);
    expect(first?.sourceEligibility.score).toBe(later?.sourceEligibility.score);
  });

  it("uses public-suffix and private-suffix aware registrable domains", () => {
    expect(getPublicSourceDomainIdentity("https://a.example.co.uk/x").registrableDomain).toBe("example.co.uk");
    expect(getPublicSourceDomainIdentity("https://b.other.co.uk/x").registrableDomain).toBe("other.co.uk");
    expect(getPublicSourceDomainIdentity("https://one.github.io/x").registrableDomain).toBe("one.github.io");
    expect(getPublicSourceDomainIdentity("https://two.github.io/x").registrableDomain).toBe("two.github.io");
    expect(arePublicSourcesIndependentlyControlled("https://a.example.co.uk/x", "https://b.example.co.uk/y")).toBe(false);
    expect(arePublicSourcesIndependentlyControlled("https://example.co.uk/x", "https://other.co.uk/y")).toBe(true);
    expect(arePublicSourcesIndependentlyControlled("https://one.github.io/x", "https://two.github.io/y")).toBe(true);
  });

  it("collapses syndicated content and never counts same-domain pages as independent corroboration", () => {
    const graph = buildPublicSourceEvidenceGraph(createLogisticsPublicSourceFixture());
    const syndicated = graph.evidenceFamilies.find((family) => family.normalizedContentHash === "sha256:syndicated-route");
    expect(syndicated?.evidenceIds).toHaveLength(2);
    expect(syndicated?.independentDomainCount).toBe(2);
    expect(syndicated?.countsAsIndependentEvidence).toBe(false);
    const company = graph.entities.find((entity) => entity.canonicalName === "华南运输");
    expect(company?.independentRegistrableDomains).toEqual([
      "logistics-directory.example",
      "south-freight.example"
    ]);
    expect(company?.evidenceIds.filter((id) => id.includes("south-freight"))).toHaveLength(2);
  });

  it("retains observation and retrieved-evidence provenance on every entity and claim", () => {
    const graph = buildPublicSourceEvidenceGraph(createLogisticsPublicSourceFixture());
    for (const entity of graph.entities) {
      expect(entity.observationIds.length).toBeGreaterThan(0);
      expect(entity.evidenceIds.length).toBeGreaterThan(0);
    }
    for (const claim of graph.claims) {
      expect(claim.observationIds.length).toBeGreaterThan(0);
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(graph.dimensions.queryVariantIds.length).toBeGreaterThan(1);
    expect(graph.dimensions.exactQueries).toContain("深圳到台湾的运输公司有哪些？");
    expect(graph.dimensions.registrableDomains).toContain("trade-news-a.example");
    expect(graph.dimensions.evidenceFamilyIds.length).toBe(graph.evidenceFamilies.length);
  });

  it("grades direct facts A, associations B, independent repetition C, and unsafe evidence D", () => {
    const graph = buildPublicSourceEvidenceGraph(createLogisticsPublicSourceFixture());
    expect(graph.evidence.find((item) => item.canonicalUrl.includes("south-freight.example/routes"))?.grade).toBe("A");
    expect(graph.evidence.find((item) => item.canonicalUrl.includes("logistics-directory.example"))?.grade).toBe("B");
    expect(graph.patterns.find((item) => item.kind === "independent_repetition")?.grade).toBe("C");
    expect(graph.evidence.find((item) => item.canonicalUrl.includes("blocked-source.example"))?.grade).toBe("D");
    expect(graph.evidence.find((item) => item.canonicalUrl.includes("contradiction.example"))?.grade).toBe("D");
    expect(graph.evidence.find((item) => item.canonicalUrl.includes("ambiguous-company.example"))?.grade).toBe("D");
  });

  it("keeps readiness and eligibility versioned, explainable, and order-neutral", () => {
    const readiness = scoreRetrievalReadiness({
      retrievalState: "available",
      canonicalUrlValid: true,
      publiclyRoutable: true,
      robotsAllowed: true,
      accessBarrierAbsent: true,
      boundedContent: true,
      usableText: true
    });
    expect(readiness.version).toBe("retrieval-readiness-v1");
    expect(readiness.score).toBe(100);
    expect(readiness.signals.every((signal) => signal.explanation.length > 0)).toBe(true);
    const eligibility = scoreSourceEligibility({
      retrievalReady: true,
      entityResolved: true,
      claimTraceable: true,
      contradictionAbsent: true,
      metadataOnly: false
    });
    expect(eligibility.version).toBe("source-eligibility-v1");
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.signals.map(({ id }) => id)).not.toContain("surface_result_order");
  });

  it("records truthful absence only after complete observations and retrieval attempts", () => {
    const fixture = createLogisticsPublicSourceFixture();
    const graph = buildPublicSourceEvidenceGraph(fixture);
    expect(evaluatePublicEntityPresence({
      entityDomain: "customer-logistics.example",
      expectedQueryVariantIds: fixture.observations.map(({ queryId }) => queryId),
      graph
    })).toMatchObject({ status: "absent", basis: "complete_observation_and_retrieval" });
    expect(evaluatePublicEntityPresence({
      entityDomain: "customer-logistics.example",
      expectedQueryVariantIds: [...fixture.observations.map(({ queryId }) => queryId), "missing-query"],
      graph
    })).toMatchObject({ status: "unknown", basis: "incomplete_observation_or_retrieval" });
  });

  it("keeps customer-owned and independent source categories distinct", () => {
    const fixture = createLogisticsPublicSourceFixture();
    const graph = buildPublicSourceEvidenceGraph({ ...fixture, customerRegistrableDomain: "south-freight.example", competitorRegistrableDomains: [] });
    expect(graph.evidence.find(({ registrableDomain }) => registrableDomain === "south-freight.example")?.ownershipCategory).toBe("owned_customer");
    expect(graph.evidence.find(({ registrableDomain }) => registrableDomain === "logistics-directory.example")?.ownershipCategory).toBe("directory_or_reference");
    expect(graph.evidence.find(({ registrableDomain }) => registrableDomain === "trade-news-a.example")?.ownershipCategory).toBe("independent_editorial");
  });

  it("creates evidence-linked hypotheses but rejects causal ranking language", () => {
    expect(createPublicSourceOpportunityHypothesis({
      id: "route-facts",
      title: "Strengthen verifiable route facts",
      rationale: "Independent public sources repeatedly document route, mode, and customs facts.",
      evidenceIds: ["public-evidence:https://example.test/route"],
      suggestedAction: "Publish auditable route and customs evidence for public verification."
    })).toMatchObject({ id: "route-facts" });
    expect(() => createPublicSourceOpportunityHypothesis({
      id: "causal",
      title: "Guarantee AI ranking",
      rationale: "This will cause the model to recommend the company.",
      evidenceIds: ["evidence-1"],
      suggestedAction: "Publish it."
    })).toThrow(/causal ranking/i);
  });

  it("is deterministic and never emits model attribution or causal probability", () => {
    const input: PublicSourceGraphInput = createLogisticsPublicSourceFixture();
    const first = buildPublicSourceEvidenceGraph(input);
    const second = buildPublicSourceEvidenceGraph(input);
    expect(second).toEqual(first);
    const serialized = JSON.stringify(first).toLowerCase();
    expect(serialized).not.toMatch(/ai.?rank|model.?rank|recommendation.?probability|caused.?recommend/);
  });

  it("does not treat cross-domain copies as independent evidence families", () => {
    const fixture = createLogisticsPublicSourceFixture();
    const families = createEvidenceFamilies(fixture.retrievals);
    expect(families.filter(({ normalizedContentHash }) => normalizedContentHash === "sha256:syndicated-route"))
      .toEqual([expect.objectContaining({ countsAsIndependentEvidence: false })]);
  });

  it("keeps changed content at one canonical URL as separate immutable evidence", () => {
    const fixture = createLogisticsPublicSourceFixture();
    const original = fixture.retrievals[0]!;
    const graph = buildPublicSourceEvidenceGraph({
      ...fixture,
      retrievals: [
        ...fixture.retrievals,
        { ...original, normalizedContentHash: "sha256:directory-revised", normalizedText: "修订后的目录内容。", verifiedExcerpt: "修订后的目录内容。" }
      ]
    });
    expect(graph.evidence.filter(({ canonicalUrl }) => canonicalUrl === "https://logistics-directory.example/shenzhen-taiwan")).toHaveLength(2);
  });

  it("fails closed for ambiguous or contradictory direct-support inputs", () => {
    expect(assessPublicSourceEvidenceGrade({
      retrievalState: "available",
      verifiedExcerpt: "深圳到台湾运输时效为三天。",
      directFactSupport: true,
      preciseEntityMapping: true,
      entityAmbiguous: false,
      contradictory: true,
      metadataOnly: false,
      independentPattern: false
    })).toBe("D");
    expect(assessPublicSourceEvidenceGrade({
      retrievalState: "available",
      verifiedExcerpt: "该页面明确关联深圳台湾运输主题。",
      directFactSupport: true,
      preciseEntityMapping: false,
      entityAmbiguous: false,
      contradictory: false,
      metadataOnly: false,
      independentPattern: false
    })).toBe("B");
  });

  it("does not mark a source with no formal claim as eligible", () => {
    const graph = buildPublicSourceEvidenceGraph(createLogisticsPublicSourceFixture());
    const institution = graph.evidence.find(({ canonicalUrl }) => canonicalUrl.includes("port-authority.example"));
    expect(institution?.sourceEligibility.signals.find(({ id }) => id === "claim_traceable")?.passed).toBe(false);
    expect(institution?.sourceEligibility.eligible).toBe(false);
  });

  it.each([
    "AI 推荐该公司是因为这个来源。",
    "这篇文章使得 AI 推荐该公司。",
    "该来源促使模型排名靠前。"
  ])("rejects Chinese reverse causal claims: %s", (rationale) => {
    expect(() => createPublicSourceOpportunityHypothesis({
      id: "bad-cn", title: "公开来源分析", rationale,
      evidenceIds: ["evidence-1"], suggestedAction: "核对公开事实。"
    })).toThrow(/causal ranking/i);
  });

  it("allows explicit Chinese limitations that deny causal attribution", () => {
    expect(() => createPublicSourceOpportunityHypothesis({
      id: "limitation-cn",
      title: "公开来源限制",
      rationale: "不能说 AI 推荐该公司是因为这个来源；这里仅记录公开检索信号。",
      evidenceIds: ["evidence-1"],
      suggestedAction: "继续核对公开事实，不推断模型因果。"
    })).not.toThrow();
  });

  it("rejects retrieved facts that are not bound to an observed result", () => {
    const fixture = createLogisticsPublicSourceFixture();
    expect(() => buildPublicSourceEvidenceGraph({
      ...fixture,
      retrievals: [{ ...fixture.retrievals[0]!, resultUrl: "https://injected.example/not-observed" }]
    })).toThrow(/not present/i);
  });
});
