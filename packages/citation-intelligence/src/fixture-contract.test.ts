import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { answerObserverFixture } from "@open-geo-console/answer-engine-observer/testing";
import { validateOpportunityHypothesis } from "./index";
import { createCitationIntelligenceFixture } from "./testing";

describe("citation intelligence deterministic fixture", () => {
  it("is stable and references the observer fixture cells", () => {
    const first = createCitationIntelligenceFixture();
    const second = createCitationIntelligenceFixture();
    expect(first).toEqual(second);

    const observerCellIds = new Set(answerObserverFixture.cells.map(({ id }) => id));
    for (const evidence of first.evidence) {
      expect(observerCellIds.has(evidence.cellId)).toBe(true);
      for (const occurrence of evidence.repeatedPattern?.occurrences ?? []) {
        expect(observerCellIds.has(occurrence.cellId)).toBe(true);
      }
    }
  });

  it("pins the canonical fixture projection against silent contract drift", () => {
    const fixture = createCitationIntelligenceFixture();
    const projection = {
      fixtureId: fixture.fixtureId,
      recommendations: fixture.recommendations,
      entityResolutions: fixture.entityResolutions,
      sourceCategories: fixture.sourceCategories,
      evidence: fixture.evidence,
      opportunities: fixture.opportunities
    };
    expect(createHash("sha256").update(JSON.stringify(projection)).digest("hex")).toBe(
      "e4c6e778fd15f77788a43d2ce8737b812e44555e5715eadb181ea75b67adb22d"
    );
  });

  it("produces all four grades without a model or network call", () => {
    const fixture = createCitationIntelligenceFixture();
    expect(new Set(fixture.evidence.map(({ grade }) => grade))).toEqual(new Set(["A", "B", "C", "D"]));
    expect(fixture.evidence).toContainEqual(expect.objectContaining({ grade: "D", retrievalState: "inaccessible" }));
    expect(fixture.evidence).toContainEqual(expect.objectContaining({ grade: "D", entityAmbiguous: true }));
  });

  it("binds every source assessment to a source actually returned by its observer cell", () => {
    const fixture = createCitationIntelligenceFixture();
    const cellsById = new Map(answerObserverFixture.cells.map((cell) => [cell.id, cell]));
    for (const evidence of fixture.evidence) {
      if (!evidence.sourceUrl) continue;
      const cell = cellsById.get(evidence.cellId);
      expect(cell?.status).toBe("succeeded");
      if (!cell || cell.status !== "succeeded") continue;
      expect(cell.sources.map(({ url }) => url)).toContain(evidence.sourceUrl);
    }
  });

  it("uses genuine recommendation cells for repeated source patterns and opportunities", () => {
    const fixture = createCitationIntelligenceFixture();
    const cellsById = new Map(answerObserverFixture.cells.map((cell) => [cell.id, cell]));
    const gradeC = fixture.evidence.find(({ grade }) => grade === "C");
    expect(gradeC?.providerReturned).toBe(true);
    expect(gradeC?.verifiedExcerpt).toBeUndefined();
    expect(gradeC?.repeatedPattern).toMatchObject({
      kind: "source",
      value: "https://atlas.example.org/export-research"
    });
    for (const occurrence of gradeC?.repeatedPattern?.occurrences ?? []) {
      const cell = cellsById.get(occurrence.cellId);
      expect(cell?.status).toBe("succeeded");
      if (!cell || cell.status !== "succeeded") continue;
      expect(cell.recommendationOutcome).toBe("recommendations_present");
      expect(cell.sources.map(({ url }) => url)).toContain(gradeC?.repeatedPattern?.value);
    }
    for (const opportunity of fixture.opportunities) {
      for (const cellId of opportunity.evidenceCellIds) {
        const cell = cellsById.get(cellId);
        expect(cell?.status).toBe("succeeded");
        if (cell?.status === "succeeded") {
          expect(cell.recommendationOutcome).toBe("recommendations_present");
        }
      }
    }
  });

  it("keeps recommendations, ambiguity, categories, and no-recommendation state explicit", () => {
    const fixture = createCitationIntelligenceFixture();
    expect(fixture.recommendations.length).toBeGreaterThan(0);
    expect(fixture.entityResolutions).toContainEqual(expect.objectContaining({ status: "ambiguous" }));
    expect(fixture.sourceCategories.map(({ category }) => category)).toEqual(
      expect.arrayContaining([
        "owned_customer",
        "owned_competitor",
        "earned_editorial",
        "directory_or_reference",
        "community_or_ugc",
        "unknown"
      ])
    );
    expect(
      answerObserverFixture.cells.some(
        (cell) => cell.status === "succeeded" && cell.recommendationOutcome === "no_recommendation"
      )
    ).toBe(true);
  });

  it("contains only validated, evidence-linked opportunity hypotheses", () => {
    const fixture = createCitationIntelligenceFixture();
    for (const opportunity of fixture.opportunities) {
      expect(() => validateOpportunityHypothesis(opportunity)).not.toThrow();
      expect(opportunity.evidenceCellIds.length).toBeGreaterThan(0);
    }
  });
});
