import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMemoryReportV4DiagnosisCheckpointStore,
  createReportV4DiagnosisCheckpointRepository,
  type InitializeReportV4DiagnosisCheckpointsInput,
  type ReportV4DiagnosisQuestionBinding
} from "./report-v4-diagnosis-checkpoints";

// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
describe("V4 diagnosis checkpoint repository", () => {
  it("fails closed when any exact core, enhancement, config, snapshot or question binding is missing", async () => {
    const exact = initialization();
    for (const changed of [
      { ...exact, reportId: "wrong-report" },
      { ...exact, enhancementJobId: "wrong-enhancement" },
      { ...exact, coreArtifactRevisionId: "wrong-core" },
      { ...exact, configSnapshotId: "wrong-config" },
      { ...exact, snapshotId: "wrong-snapshot" },
      { ...exact, questionSetId: "wrong-question-set" },
      { ...exact, checkpoints: exact.checkpoints.map((checkpoint, index) => index === 0 ? { ...checkpoint, questionId: "wrong-question" } : checkpoint) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"] }
    ]) {
      await expect(repository().initialize(changed as InitializeReportV4DiagnosisCheckpointsInput)).rejects.toThrow(/exact|binding|lineage/i);
    }
  });

  it("requires exact parsed question, source and answer lineage and rejects raw payload fields", async () => {
    const repo = repository();
    const exact = initialization();
    await expect(repo.initialize({
      ...exact,
      checkpoints: exact.checkpoints.map((checkpoint, index) => index === 0
        ? { ...checkpoint, diagnosisInput: { ...diagnosisInput(1), answer: undefined } }
        : checkpoint) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
    })).rejects.toThrow(/answer/i);
    await expect(repo.initialize({
      ...exact,
      checkpoints: exact.checkpoints.map((checkpoint, index) => index === 0
        ? { ...checkpoint, diagnosisInput: { ...diagnosisInput(1), rawPrompt: "secret" } }
        : checkpoint) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
    })).rejects.toThrow(/unknown field rawPrompt/i);

    const initialized = await repo.initialize(exact);
    await expect(repo.startAttempt({
      identityHash: initialized[0].identityHash,
      expectedProviderCallCount: 0,
      diagnosisInput: { ...diagnosisInput(1), answer: "drifted answer" },
      sourceAudits: sourceAudits(1)
    })).rejects.toThrow(/input|answer|source|lineage|drift/i);
    await expect(repo.startAttempt({
      identityHash: initialized[0].identityHash,
      expectedProviderCallCount: 0,
      diagnosisInput: diagnosisInput(1),
      sourceAudits: [{ ...sourceAudits(1)[0]!, rawProviderResponse: "secret" }] as never
    })).rejects.toThrow(/unknown field rawProviderResponse/i);
  });

  it("initializes exactly three rows idempotently and rejects duplicate or drifted resume", async () => {
    const repo = repository();
    const exact = initialization();
    const first = await repo.initialize(exact);
    expect(first.map(({ ordinal, state }) => ({ ordinal, state }))).toEqual([
      { ordinal: 1, state: "queued" }, { ordinal: 2, state: "queued" }, { ordinal: 3, state: "queued" }
    ]);
    expect(first[0].diagnosisInput).toEqual(diagnosisInput(1));
    expect(await repo.initialize(exact)).toEqual(first);
    await expect(repo.initialize({
      ...exact,
      checkpoints: exact.checkpoints.map((checkpoint, index) => index === 1
        ? { ...checkpoint, diagnosisInput: { ...diagnosisInput(2), answer: "different exact answer" } }
        : checkpoint) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
    })).rejects.toThrow(/identity|idempotency|drift/i);
    await expect(repo.initialize({
      ...exact,
      checkpoints: [exact.checkpoints[0]!, exact.checkpoints[0]!, exact.checkpoints[2]!]
    })).rejects.toThrow(/duplicate|unique|ordinal/i);
  });

  it("allocates only an initial attempt plus one local retry and never resets the report", async () => {
    const repo = repository();
    const [checkpoint] = await repo.initialize(initialization());
    const first = await repo.startAttempt({
      identityHash: checkpoint.identityHash, expectedProviderCallCount: 0,
      diagnosisInput: diagnosisInput(1), sourceAudits: sourceAudits(1)
    });
    expect(first).toMatchObject({ state: "running", providerCallCount: 1 });
    const retry = await repo.startAttempt({
      identityHash: checkpoint.identityHash, expectedProviderCallCount: 1,
      diagnosisInput: diagnosisInput(1), sourceAudits: sourceAudits(1)
    });
    expect(retry).toMatchObject({ state: "running", providerCallCount: 2 });
    await expect(repo.startAttempt({
      identityHash: checkpoint.identityHash, expectedProviderCallCount: 2,
      diagnosisInput: diagnosisInput(1), sourceAudits: sourceAudits(1)
    })).rejects.toThrow(/one local retry|two|2/i);
    expect(repo).not.toHaveProperty("reset");
    expect(repo).not.toHaveProperty("rerunReport");
  });

  it("loads exactly three terminal checkpoints with completed diagnoses and failed questions preserved", async () => {
    const repo = repository();
    const checkpoints = await repo.initialize(initialization());
    await complete(repo, checkpoints[0]!.identityHash, 1);
    await expect(repo.loadForEnhancementComposition(initialization()))
      .rejects.toThrow(/three terminal|nonterminal|queued|running|partial/i);
    await repo.markFailed({
      identityHash: checkpoints[1]!.identityHash, providerCallCount: 0,
      diagnosisInput: diagnosisInput(2)
    });
    await complete(repo, checkpoints[2]!.identityHash, 3);
    const loaded = await repo.loadForEnhancementComposition(initialization());
    expect(loaded.map(({ ordinal, questionId, state }) => ({ ordinal, questionId, state }))).toEqual([
      { ordinal: 1, questionId: "question-1", state: "completed" },
      { ordinal: 2, questionId: "question-2", state: "failed" },
      { ordinal: 3, questionId: "question-3", state: "completed" }
    ]);
    expect(loaded[0].diagnosis).toEqual(diagnosis(1));
    expect(loaded[1].diagnosis).toBeNull();
    expect(loaded[2].diagnosis).toEqual(diagnosis(3));
    expect(Object.isFrozen(loaded)).toBe(true);
    const recovered = await repo.loadTerminalRecovery("enhancement-job-1");
    expect(recovered?.map(({ state }) => state)).toEqual(["completed", "failed", "completed"]);
    expect(recovered?.[0].diagnosisInput).toEqual(diagnosisInput(1));
    expect(Object.isFrozen(recovered?.[0].diagnosisInput)).toBe(true);

    const exact = await repo.complete({
      identityHash: checkpoints[0]!.identityHash, providerCallCount: 1,
      diagnosisInput: diagnosisInput(1), diagnosis: diagnosis(1)
    });
    expect(exact.state).toBe("completed");
    await expect(repo.complete({
      identityHash: checkpoints[0]!.identityHash, providerCallCount: 1,
      diagnosisInput: diagnosisInput(1), diagnosis: { ...diagnosis(1), selectionSummary: "drifted diagnosis" }
    })).rejects.toThrow(/terminal|immutable|drift|idempotency/i);
    await expect(repo.complete({
      identityHash: checkpoints[2]!.identityHash, providerCallCount: 1,
      diagnosisInput: diagnosisInput(3), diagnosis: { ...diagnosis(3), rawProviderResponse: {} }
    })).rejects.toThrow(/unknown field rawProviderResponse/i);
  });

  it("represents an all-failed terminal run without inventing diagnosis content", async () => {
    const repo = repository();
    const checkpoints = await repo.initialize(initialization());
    for (const [index, checkpoint] of checkpoints.entries()) {
      await repo.markFailed({
        identityHash: checkpoint.identityHash, providerCallCount: 0,
        diagnosisInput: diagnosisInput((index + 1) as 1 | 2 | 3)
      });
    }
    const loaded = await repo.loadForEnhancementComposition(initialization());
    expect(loaded.map(({ state, diagnosis: output }) => ({ state, diagnosis: output }))).toEqual([
      { state: "failed", diagnosis: null },
      { state: "failed", diagnosis: null },
      { state: "failed", diagnosis: null }
    ]);
  });
});

function repository() {
  const exact = initialization();
  return createReportV4DiagnosisCheckpointRepository(createMemoryReportV4DiagnosisCheckpointStore({
    bindings: exact.checkpoints.map((checkpoint) => binding(exact, checkpoint.questionId, checkpoint.ordinal))
  }));
}

async function complete(
  repo: ReturnType<typeof repository>, identityHash: string, ordinal: 1 | 2 | 3
): Promise<void> {
  await repo.startAttempt({
    identityHash, expectedProviderCallCount: 0,
    diagnosisInput: diagnosisInput(ordinal), sourceAudits: sourceAudits(ordinal)
  });
  await repo.complete({ identityHash, providerCallCount: 1, diagnosisInput: diagnosisInput(ordinal), diagnosis: diagnosis(ordinal) });
}

function initialization(): InitializeReportV4DiagnosisCheckpointsInput {
  return {
    reportId: "report-1",
    enhancementJobId: "enhancement-job-1",
    coreArtifactRevisionId: "core-revision-1",
    configSnapshotId: "config-1",
    questionSetId: "question-set-1",
    snapshotId: "snapshot-1",
    checkpoints: [1, 2, 3].map((ordinal) => ({
      ordinal: ordinal as 1 | 2 | 3,
      questionId: `question-${ordinal}`,
      diagnosisInput: diagnosisInput(ordinal as 1 | 2 | 3)
    })) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
  };
}

function binding(
  input: InitializeReportV4DiagnosisCheckpointsInput,
  questionId: string,
  ordinal: 1 | 2 | 3
): ReportV4DiagnosisQuestionBinding {
  return {
    reportId: input.reportId, enhancementJobId: input.enhancementJobId,
    coreArtifactRevisionId: input.coreArtifactRevisionId, configSnapshotId: input.configSnapshotId,
    questionSetId: input.questionSetId, snapshotId: input.snapshotId, questionId, ordinal
  };
}

function diagnosisInput(ordinal: 1 | 2 | 3) {
  return {
    question: { questionId: `question-${ordinal}`, text: `Question ${ordinal}?` },
    answer: `Answer ${ordinal}.`, locale: "en",
    sources: [{
      questionId: `question-${ordinal}`, sourceId: `source-${ordinal}`, title: `Source ${ordinal}`,
      canonicalUrl: `https://source-${ordinal}.example/evidence`, excerpt: `Evidence ${ordinal}.`, retrievalStatus: "available"
    }],
    targetPages: [{
      questionId: `question-${ordinal}`, pageId: `page-${ordinal}`, url: `https://target.example/page-${ordinal}`,
      relevanceReason: `Relevant ${ordinal}.`, summary: `Target summary ${ordinal}.`,
      sourceLocations: [{ locationId: `location-${ordinal}`, startOffset: 0, endOffset: 20 }]
    }]
  };
}

function sourceAudits(ordinal: 1 | 2 | 3) {
  return [{
    questionId: `question-${ordinal}`, sourceId: `source-${ordinal}`,
    canonicalUrl: `https://source-${ordinal}.example/evidence`, status: "available" as const,
    summary: `Audited evidence ${ordinal}.`
  }];
}

function diagnosis(ordinal: 1 | 2 | 3) {
  const refs = [`source-${ordinal}`, `location-${ordinal}`];
  return {
    selectionSummary: `Selection summary ${ordinal}.`,
    observableFactors: ["problem_match", "factual_specificity", "target_clarity"].map((kind, index) => ({
      kind, observation: `Observation ${ordinal}-${index}.`, evidenceRefs: refs
    })),
    targetGap: `Target gap ${ordinal}.`,
    recommendedActions: [1, 2, 3].map((priority) => ({
      priority, action: `Action ${ordinal}-${priority}.`, evidenceRefs: refs
    })),
    detailedEvidenceRefs: refs
  };
}

export function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
