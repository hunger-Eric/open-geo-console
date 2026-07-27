import { describe, expect, it } from "vitest";
import {
  createAnswerSnapshotCellId,
  parseAnswerEngineSurface,
  parseAnswerQuestion,
  parseAnswerSnapshotCell,
  parseAnswerSnapshotRun
} from "./index";
import { answerObserverFixture } from "./testing";

describe("deterministic answer observer fixture", () => {
  it("contains a valid report/job run, two surfaces, four questions, eight successes and a failure", () => {
    expect(parseAnswerSnapshotRun(answerObserverFixture.run)).toEqual(answerObserverFixture.run);
    expect(answerObserverFixture.run).toMatchObject({
      id: "fixture-run-1",
      reportId: "fixture-report-1",
      jobId: "fixture-deep-job-1"
    });
    expect(answerObserverFixture.questions).toHaveLength(4);
    expect(answerObserverFixture.surfaces).toHaveLength(2);
    answerObserverFixture.questions.forEach((question) => expect(parseAnswerQuestion(question)).toEqual(question));
    answerObserverFixture.surfaces.forEach((surface) =>
      expect(parseAnswerEngineSurface(surface)).toEqual(surface)
    );
    answerObserverFixture.cells.forEach((cell) => expect(parseAnswerSnapshotCell(cell)).toEqual(cell));
    expect(answerObserverFixture.cells.filter((cell) => cell.status === "succeeded")).toHaveLength(8);
    expect(answerObserverFixture.cells.filter((cell) => cell.status === "failed")).toHaveLength(1);
  });

  it("keeps every fixture provider explicitly uncertified", () => {
    for (const cell of answerObserverFixture.cells) {
      expect(cell.surface.certificationState).toBe("candidate_uncertified");
      expect(cell.surface.providerId).toMatch(/^fixture-global-[ab]$/);
    }
  });

  it("uses reserved example evidence only", () => {
    for (const cell of answerObserverFixture.cells) {
      expect(cell.surface.providerId).toMatch(/^fixture-/);
      if (cell.status === "failed") continue;
      expect(cell.answerText).toMatch(/Example|example|not enough fixture evidence/);
      for (const source of cell.sources) {
        const hostname = new URL(source.url).hostname;
        expect(hostname === "example.com" || hostname.endsWith(".example.com") || hostname === "example.org" || hostname.endsWith(".example.org")).toBe(true);
      }
    }
  });

  it("has stable IDs and response hashes derived from immutable content", () => {
    for (const cell of answerObserverFixture.cells) {
      expect(cell.id).toBe(
        createAnswerSnapshotCellId({
          runId: cell.runId,
          questionId: cell.questionId,
          surface: cell.surface
        })
      );
      if (cell.status === "succeeded") expect(cell.responseHash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(answerObserverFixture.cells.map((cell) => cell.id)).toEqual([
      "e91e5a1323a82440cd55615112b415bfb8b32a5e679351f33f412552883d3ee6",
      "051a3fa3ba419c824c27ed759769bb46a5e4f36af0affb4907ba885248657724",
      "d8e2cab17c4b236fc448167fad735163ce18e13e1cdade09478b806d9d7cbaa1",
      "9223e21d729d08c3a2af8c3640df0b18ce45b7382116f4e39f4b8f1849097442",
      "a50fe9dd23e2b2036530756ea20dfdf0e5b55281093696713478eca1f05d2a6f",
      "68a801bccc191b681e511a9d2c8e258d4a987d323871dc7255136b514cceb086",
      "6dfe2b2d800dd856c057284da90961bc1ff957d73352c2b00ab8711c5de7c911",
      "4bbdd213be40d35d3baebecc1ea087dc1962c138295cda12bd724af3711ab28c",
      "07b4a8d2a64a4c9353c3e97680839431e7a540d2fcde303e2e9ee795cdbd3d29"
    ]);
    expect(
      answerObserverFixture.cells
        .filter((cell) => cell.status === "succeeded")
        .map((cell) => cell.responseHash)
    ).toEqual([
      "98631a7ae7f336a74e6f9bed872168a1e9a580740d7257d8296c04feef6adf1a",
      "02434367603e8217af1a07d062536e9d95ee5f400c8582dde5cbabcb2ec57f80",
      "5bd90ae7ce75586a036ad3276856fc511fbf691acce7ef68ce60e762fd85a0e4",
      "4143cfe90f2a57210bde79c74795db66a6a27d449b4d5346de0ffb7c3b7ae56e",
      "3eae49ab3bb7a18110149fef34a098123372c4e64672e3814025d54486e84eb6",
      "f2f399146006d32e50bab4dbbacce95f56e3a35788e5082e1f6dda2e98103128",
      "a3c4b4d1e770612678270357c3ee6ede07fce5e460cb0521761a926c916f7cc4",
      "7aed5a72f1a75689be97272137dd8e0566d46604da0120dcf1745a66f8d7e278"
    ]);
  });

  it("includes owned, editorial, directory, community, inaccessible, ambiguous and no-recommendation evidence", () => {
    const successful = answerObserverFixture.cells.filter((cell) => cell.status === "succeeded");
    const urls = successful.flatMap((cell) => cell.sources.map((source) => source.url));
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining("customer.example.com"),
      expect.stringContaining("atlas.example.org"),
      expect.stringContaining("editorial.example.com"),
      expect.stringContaining("directory.example.org"),
      expect.stringContaining("community.example.com"),
      expect.stringContaining("unavailable.example.org")
    ]));
    const metadata = successful.flatMap((cell) => cell.sources.map((source) => source.providerMetadata));
    expect(metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "owned_customer" }),
      expect.objectContaining({ sourceType: "owned_competitor" }),
      expect.objectContaining({ sourceType: "earned_editorial" }),
      expect.objectContaining({ sourceType: "directory_or_reference" }),
      expect.objectContaining({ sourceType: "community_or_ugc" }),
      expect.objectContaining({ sourceType: "unknown" })
    ]));
    expect(JSON.stringify(metadata)).not.toMatch(/supportingExcerpt|fullPageContent|authorization|apiKey/i);
    expect(successful).toEqual(expect.arrayContaining([
      expect.objectContaining({
        answerText: expect.stringMatching(/ambiguous/i),
        sources: [expect.objectContaining({ url: expect.stringContaining("unavailable.example.org") })]
      })
    ]));
    expect(successful).toEqual(expect.arrayContaining([
      expect.objectContaining({ recommendationOutcome: "no_recommendation", sources: [] })
    ]));
  });
});
