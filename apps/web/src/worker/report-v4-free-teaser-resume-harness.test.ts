import { describe, expect, it } from "vitest";
import { FREE_TEASER_CHECKPOINT_VERSION, type FreeTeaserCheckpointV1 } from "./report-v4-free-teaser";
import {
  classifyFreeTeaserResumeKind,
  createInMemoryFreeTeaserCheckpointSink,
  expectedExpensiveCallsOnMarkedResume,
  matchesExpensiveCallBudget
} from "./report-v4-free-teaser-resume-harness";

function baseCheckpoint(overrides: Partial<FreeTeaserCheckpointV1> = {}): FreeTeaserCheckpointV1 {
  return {
    version: FREE_TEASER_CHECKPOINT_VERSION,
    stage: "questions_ready",
    identityHash: "a".repeat(64),
    reportId: "report-1",
    admissionSnapshotId: "admission-1",
    admissionContentIdentityHash: "b".repeat(64),
    foundationHash: "c".repeat(64),
    locale: "zh-CN",
    region: "CN",
    authorityId: "authority-1",
    evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("free-teaser resume dry harness", () => {
  it("classifies q1_answer_ready with and without diagnosis draft", () => {
    expect(classifyFreeTeaserResumeKind(baseCheckpoint({ stage: "q1_answer_ready" }))).toBe("q1_answer_ready");
    expect(classifyFreeTeaserResumeKind(baseCheckpoint({
      stage: "q1_answer_ready",
      q1DiagnosisDraft: {
        selectionSummary: "summary",
        observableFactors: [],
        targetGap: "gap",
        recommendedActions: [],
        detailedEvidenceRefs: []
      } as FreeTeaserCheckpointV1["q1DiagnosisDraft"]
    }))).toBe("q1_diagnosis_ready");
    expect(classifyFreeTeaserResumeKind(baseCheckpoint({ stage: "ready" }))).toBe("ready");
  });

  it("defines strict expensive-call budgets for each marked resume kind", () => {
    expect(expectedExpensiveCallsOnMarkedResume("ready")).toEqual({
      resolveSnapshot: 0,
      answerWithSources: 0,
      enhanceDiagnosis: 0,
      semanticInvoke: 0
    });
    expect(expectedExpensiveCallsOnMarkedResume("q1_diagnosis_ready").semanticInvoke).toBe(5);
    expect(expectedExpensiveCallsOnMarkedResume("q1_answer_ready")).toMatchObject({
      answerWithSources: 0,
      enhanceDiagnosis: 1,
      semanticInvoke: 5
    });
    expect(expectedExpensiveCallsOnMarkedResume("questions_ready").resolveSnapshot).toBe(3);
  });

  it("records cloned checkpoints and first-by-kind without mutating sources", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const first = baseCheckpoint({ stage: "observations_ready", observationSnapshotIds: ["s1", "s2", "s3"] });
    await sink.saveCheckpoint(first);
    await sink.saveCheckpoint(baseCheckpoint({
      stage: "q1_answer_ready",
      observationSnapshotIds: ["s1", "s2", "s3"],
      q1DiagnosisDraft: {
        selectionSummary: "summary",
        observableFactors: [],
        targetGap: "gap",
        recommendedActions: [],
        detailedEvidenceRefs: []
      } as FreeTeaserCheckpointV1["q1DiagnosisDraft"]
    }));

    expect(sink.firstByKind().observations_ready?.stage).toBe("observations_ready");
    expect(sink.firstByKind().q1_diagnosis_ready).toBeDefined();
    expect(sink.stageSequence()).toEqual(["observations_ready", "q1_answer_ready"]);

    const stored = sink.saved[0]!;
    (stored as { stage: string }).stage = "ready";
    // Mutation hits the sink clone only — the caller's original stays intact.
    expect(first.stage).toBe("observations_ready");
    expect(sink.saved[0]!.stage).toBe("ready");
  });

  it("matches expensive call budgets exactly", () => {
    const budget = expectedExpensiveCallsOnMarkedResume("observations_ready");
    expect(matchesExpensiveCallBudget({
      resolveSnapshot: 0,
      answerWithSources: 1,
      enhanceDiagnosis: 1,
      semanticInvoke: 5
    }, budget)).toBe(true);
    expect(matchesExpensiveCallBudget({
      resolveSnapshot: 1,
      answerWithSources: 1,
      enhanceDiagnosis: 1,
      semanticInvoke: 5
    }, budget)).toBe(false);
  });
});
