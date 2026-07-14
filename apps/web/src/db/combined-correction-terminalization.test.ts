import { describe, expect, it } from "vitest";
import { snapshotReferenceBinding } from "./combined-correction-terminalization";

describe("combined snapshot reference cutoff", () => {
  it("advances a search-start cutoff to the completed snapshot time", () => {
    expect(snapshotReferenceBinding(
      "2026-07-14T05:27:07.265Z",
      "2026-07-14T05:27:12.000Z",
      new Date("2026-07-14T05:28:00.000Z"),
    )).toEqual({ evidenceCutoff: "2026-07-14T05:27:12.000Z", freshnessState: "fresh" });
  });

  it("preserves a later report cutoff and derives database freshness", () => {
    expect(snapshotReferenceBinding(
      "2026-07-22T00:00:00.000Z",
      "2026-07-14T00:00:00.000Z",
      new Date("2026-08-20T00:00:00.000Z"),
    )).toEqual({ evidenceCutoff: "2026-07-22T00:00:00.000Z", freshnessState: "historical" });
  });
});
