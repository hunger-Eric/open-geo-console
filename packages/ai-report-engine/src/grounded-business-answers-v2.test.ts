import { describe, expect, it } from "vitest";
import { parseGroundedBusinessAnswersV2, type GroundedAnswerEvidence } from "./grounded-business-answers-v2";

describe("grounded business answers v2", () => {
  it("requires evidence for every factual answer claim", () => {
    const value = validAnswersV2();
    value.answers[0]!.claims[0]!.evidenceIds = [];
    expect(() => parseGroundedBusinessAnswersV2(value, evidenceContext())).toThrow(/evidence/i);
  });
  it("requires two domains for verified confidence", () => {
    const value = validAnswersV2();
    value.answers[0]!.claims[0]!.evidenceIds = ["q2-a"];
    expect(() => parseGroundedBusinessAnswersV2(value, evidenceContext())).toThrow(/independent domains/i);
  });
  it("allows one direct source only as an explicitly limited claim", () => {
    const value = validAnswersV2();
    value.answers[0]!.claims[0] = { ...value.answers[0]!.claims[0]!, evidenceIds: ["q2-a"], confidence: "limited", limitation: "Independent verification was not available at the evidence cutoff." };
    expect(parseGroundedBusinessAnswersV2(value, evidenceContext()).answers[0].claims[0]!.confidence).toBe("limited");
  });
});

function evidenceContext(): { evidence: GroundedAnswerEvidence[] } { return { evidence: [
  { evidenceId: "q2-a", questionId: "q2", subjectKey: "route", registrableDomain: "a.example", exactExcerpt: "Route available", eligible: true, direct: true },
  { evidenceId: "q2-b", questionId: "q2", subjectKey: "route", registrableDomain: "b.example", exactExcerpt: "Route available", eligible: true, direct: true },
  { evidenceId: "q3-a", questionId: "q3", subjectKey: "risk", registrableDomain: "a.example", exactExcerpt: "Terms vary", eligible: true, direct: true }
] }; }
function validAnswersV2() { return { version: "combined-business-question-answers-v2", synthesis: { mode: "claim_bound_model", modelId: "fixture", inputHash: "a".repeat(64) }, answers: [
  { questionId: "q2", purpose: "customer_region_fit", claims: [{ claimId: "claim-q2", subjectKey: "route", text: "The reviewed route is publicly listed as available.", evidenceIds: ["q2-a", "q2-b"], confidence: "verified" }] },
  { questionId: "q3", purpose: "purchase_delivery_risk", claims: [{ claimId: "claim-q3", subjectKey: "risk", text: "Published terms indicate that service conditions can vary.", evidenceIds: ["q3-a"], confidence: "limited", limitation: "Only one eligible direct source was available at the evidence cutoff." }] }
] }; }
