import { describe, expect, it } from "vitest";
import { phaseForStage, stageForPhase } from "./job-state";

describe("analysis phase projections", () => {
  it("keeps legacy stage as a one-way compatibility projection", () => {
    expect(phaseForStage("analyzing")).toBe("page_analysis");
    expect(stageForPhase("source_retrieval")).toBe("synthesizing");
    expect(stageForPhase("provider_claim_extraction")).toBe("synthesizing");
    expect(phaseForStage("failed")).toBe("terminalization");
  });
});
