import { describe, expect, it } from "vitest";
import { decidePublicSourceCommercialCoverage, PUBLIC_SOURCE_FRESH_MS, PUBLIC_SOURCE_MAX_HISTORICAL_MS } from "./coverage";

const ready = { authorityReady: true, evidenceIsolated: true, artifactReady: true };
const q = (questionId: string, ageMs: number, extra: Partial<Parameters<typeof decidePublicSourceCommercialCoverage>[0]["questions"][number]> = {}) =>
  ({ questionId, ageMs, sufficientlyEvidenced: true, refreshAttempted: false, refreshFailed: false, ...extra });

describe("public-source commercial coverage", () => {
  it("accepts exactly seven days and requires refresh one millisecond later", () => {
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [q("a",PUBLIC_SOURCE_FRESH_MS),q("b",0),q("c",0)] }).outcome).toBe("completed");
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [q("a",PUBLIC_SOURCE_FRESH_MS+1),q("b",0),q("c",0)] })).toMatchObject({ outcome: "failed", reasons: ["refresh_required"] });
  });
  it("labels 8-30 day refresh failures limited and rejects older evidence", () => {
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [q("a",PUBLIC_SOURCE_FRESH_MS+1,{refreshAttempted:true,refreshFailed:true}),q("b",0),q("c",0)] })).toMatchObject({ outcome:"completed_limited",settlement:"refund",historicalQuestionIds:["a"] });
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [q("a",PUBLIC_SOURCE_MAX_HISTORICAL_MS+1,{refreshAttempted:true,refreshFailed:true}),q("b",0),q("c",0)] })).toMatchObject({ outcome:"failed",settlement:"refund",reasons:["expired_refresh_failed"] });
  });
  it("settles three fresh, refunds two, and fails fewer than two or any hard gate", () => {
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions:[q("a",0),q("b",0),q("c",0)] })).toMatchObject({outcome:"completed",settlement:"settle"});
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions:[q("a",0),q("b",0),q("c",0,{sufficientlyEvidenced:false})] })).toMatchObject({outcome:"completed_limited",settlement:"refund"});
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions:[q("a",0),q("b",0,{sufficientlyEvidenced:false}),q("c",0,{sufficientlyEvidenced:false})] })).toMatchObject({outcome:"failed",settlement:"refund"});
    for (const gate of [{authorityReady:false},{evidenceIsolated:false},{artifactReady:false},{costCapExceeded:true}]) expect(decidePublicSourceCommercialCoverage({ ...ready,...gate,questions:[q("a",0),q("b",0),q("c",0)] }).outcome).toBe("failed");
  });
  it("requires three persisted available sources per question for settlement", () => {
    const counted = (id: string, count: number) => q(id, 0, { availableSourceCount: count, requiredSourceCount: 3 });
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [counted("a",3),counted("b",3),counted("c",3)] })).toMatchObject({ outcome:"completed", settlement:"settle" });
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [counted("a",1),counted("b",1),counted("c",1)] })).toMatchObject({ outcome:"completed_limited", settlement:"refund" });
    expect(decidePublicSourceCommercialCoverage({ ...ready, questions: [counted("a",3),counted("b",3),counted("c",2)] })).toMatchObject({ outcome:"completed_limited", settlement:"refund" });
  });
});
