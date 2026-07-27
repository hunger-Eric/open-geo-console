import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ReportV4QuestionCheckpoint } from "../db/report-v4-question-checkpoints";
import type { ReportV4DiagnosisCheckpoint } from "../db/report-v4-diagnosis-checkpoints";
import {
  computeReportV4DiagnosisTerminalCheckpointFingerprint,
  computeReportV4QuestionTerminalCheckpointFingerprint
} from "./report-v4-acceptance-checkpoint-fingerprints";

describe("Report V4 acceptance terminal checkpoint fingerprints", () => {
  it("returns a deterministic opaque hash for an exact answered question checkpoint", () => {
    const checkpoint = answeredQuestionCheckpoint();

    const fingerprint = computeReportV4QuestionTerminalCheckpointFingerprint(checkpoint);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(fingerprint).toBe(computeReportV4QuestionTerminalCheckpointFingerprint({ ...checkpoint }));
    expect(fingerprint).not.toContain("source.example");
    expect(fingerprint).not.toContain("Answer text");
  });

  it("accepts an exact unavailable question terminal and rejects inconsistent question terminals", () => {
    const unavailable = {
      ...answeredQuestionCheckpoint(),
      state: "unavailable",
      providerCallCount: 2,
      answerPayload: null,
      sourcePayload: [],
      answerContentHash: null
    } as ReportV4QuestionCheckpoint;
    expect(computeReportV4QuestionTerminalCheckpointFingerprint(unavailable)).toMatch(/^[a-f0-9]{64}$/u);

    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...answeredQuestionCheckpoint(), state: "answering"
    } as ReportV4QuestionCheckpoint)).toThrow(/terminal|answered|unavailable/i);
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...answeredQuestionCheckpoint(), providerCallCount: 0
    })).toThrow(/provider call/i);
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...answeredQuestionCheckpoint(), answerContentHash: "f".repeat(64)
    })).toThrow(/content hash/i);
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...unavailable, sourcePayload: answeredQuestionCheckpoint().sourcePayload
    })).toThrow(/unavailable|source/i);
  });

  it("rejects extra, undefined, and non-finite question checkpoint data", () => {
    const checkpoint = answeredQuestionCheckpoint();
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...checkpoint,
      sourcePayload: [{ ...checkpoint.sourcePayload[0]!, rawProviderPayload: "forbidden" }]
    } as ReportV4QuestionCheckpoint)).toThrow(/unknown|field/i);
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...checkpoint, answerPayload: { ...checkpoint.answerPayload!, answer: undefined }
    } as unknown as ReportV4QuestionCheckpoint)).toThrow(/answer|undefined/i);
    expect(() => computeReportV4QuestionTerminalCheckpointFingerprint({
      ...checkpoint, ordinal: Number.POSITIVE_INFINITY
    } as unknown as ReportV4QuestionCheckpoint)).toThrow(/ordinal/i);
  });

  it("returns deterministic opaque hashes for completed and failed diagnosis terminals", () => {
    const completed = completedDiagnosisCheckpoint();
    const failed = {
      ...completed,
      state: "failed",
      diagnosis: null,
      diagnosisContentHash: null
    } as ReportV4DiagnosisCheckpoint;

    const completedHash = computeReportV4DiagnosisTerminalCheckpointFingerprint(completed);
    const failedHash = computeReportV4DiagnosisTerminalCheckpointFingerprint(failed);

    expect(completedHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(failedHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(completedHash).not.toBe(failedHash);
    expect(completedHash).not.toContain("source.example");
  });

  it("rejects non-terminal or internally inconsistent diagnosis checkpoints", () => {
    const checkpoint = completedDiagnosisCheckpoint();
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint, state: "running"
    } as ReportV4DiagnosisCheckpoint)).toThrow(/terminal|completed|failed/i);
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint, diagnosisContentHash: "f".repeat(64)
    })).toThrow(/content hash/i);
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint, inputIdentityHash: "e".repeat(64)
    })).toThrow(/input identity/i);
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint,
      sourceAudits: [{ ...checkpoint.sourceAudits[0]!, canonicalUrl: "https://other.example/" }]
    })).toThrow(/source audit|lineage/i);
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint, diagnosisInput: { ...checkpoint.diagnosisInput, extra: undefined }
    } as unknown as ReportV4DiagnosisCheckpoint)).toThrow(/unknown|undefined/i);
    expect(() => computeReportV4DiagnosisTerminalCheckpointFingerprint({
      ...checkpoint,
      diagnosisInput: {
        ...checkpoint.diagnosisInput,
        targetPages: [{ ...checkpoint.diagnosisInput.targetPages[0]!, sourceLocations: [{ locationId: "target-location-1", startOffset: Number.NaN, endOffset: 80 }] }]
      }
    } as ReportV4DiagnosisCheckpoint)).toThrow(/finite|offset|number/i);
  });
});

function answeredQuestionCheckpoint(): ReportV4QuestionCheckpoint {
  const answerPayload = {
    order: 1 as const,
    questionId: "question-1",
    questionText: "Question text?",
    status: "answered" as const,
    answer: "Answer text."
  };
  const sourcePayload = [{
    questionId: "question-1",
    sourceId: "source-1",
    title: "Source title",
    canonicalUrl: "https://source.example/",
    citedText: "Source excerpt.",
    retrievalStatus: "available" as const
  }];
  return {
    identityHash: sha(JSON.stringify({
      reportId: "report-1", jobId: "job-1", questionSetId: "questions-1", snapshotId: "v4-site-snapshot-1",
      modelConfigIdentityHash: "b".repeat(64), order: 1, questionId: "question-1",
      questionIdentityHash: "c".repeat(64), inputIdentityHash: "d".repeat(64)
    })),
    reportId: "report-1",
    jobId: "job-1",
    questionSetId: "questions-1",
    questionId: "question-1",
    snapshotId: "v4-site-snapshot-1",
    ordinal: 1,
    questionIdentityHash: "c".repeat(64),
    modelConfigIdentityHash: "b".repeat(64),
    inputIdentityHash: "d".repeat(64),
    state: "answered",
    providerCallCount: 1,
    answerPayload,
    sourcePayload,
    answerContentHash: sha(JSON.stringify({ answerPayload, sourcePayload }))
  };
}

function completedDiagnosisCheckpoint(): ReportV4DiagnosisCheckpoint {
  const diagnosisInput = {
    question: { questionId: "question-1", text: "Which service fits this route?" },
    answer: "The available service supports this route under stated conditions.",
    locale: "en",
    sources: [{
      questionId: "question-1", sourceId: "source-1", title: "Source 1",
      canonicalUrl: "https://source.example/", excerpt: "The source states the route conditions.", retrievalStatus: "available" as const
    }],
    targetPages: [{
      questionId: "question-1", pageId: "target-page-1", url: "https://target.example/service",
      relevanceReason: "This page describes the service in the question.",
      summary: "The target page omits route conditions.",
      sourceLocations: [{ locationId: "target-location-1", startOffset: 10, endOffset: 80 }]
    }]
  };
  const diagnosis = {
    selectionSummary: "These sources state concrete route conditions that support the answer.",
    observableFactors: [
      { kind: "problem_match", observation: "The source directly addresses the route.", evidenceRefs: ["source-1"] },
      { kind: "factual_specificity", observation: "The source states concrete conditions.", evidenceRefs: ["source-1"] },
      { kind: "target_clarity", observation: "The target page omits those conditions.", evidenceRefs: ["target-location-1"] }
    ] as const,
    targetGap: "The target page does not state the route conditions clearly.",
    recommendedActions: [
      { priority: 1 as const, action: "Publish the route conditions on the service page.", evidenceRefs: ["target-location-1"] },
      { priority: 2 as const, action: "Clarify the service and route relationship.", evidenceRefs: ["source-1", "target-location-1"] },
      { priority: 3 as const, action: "Keep the service facts current and readable.", evidenceRefs: ["target-location-1"] }
    ] as const,
    detailedEvidenceRefs: ["source-1", "target-location-1"]
  };
  const lineage = {
    reportId: "report-1", enhancementJobId: "enhancement-1", coreArtifactRevisionId: "artifact-core-1",
    configSnapshotId: `v4-config-${"a".repeat(64)}`, questionSetId: "questions-1",
    snapshotId: "v4-site-snapshot-1", questionId: "question-1", ordinal: 1 as const
  };
  const inputIdentityHash = sha(stable(diagnosisInput));
  return {
    ...lineage,
    identityHash: sha(stable({ ...lineage, inputIdentityHash })),
    state: "completed",
    inputIdentityHash,
    diagnosisInput,
    providerCallCount: 1,
    sourceAudits: [{
      questionId: "question-1", sourceId: "source-1", canonicalUrl: "https://source.example/",
      status: "available", summary: "The source states the route conditions."
    }],
    diagnosis,
    diagnosisContentHash: sha(stable(diagnosis))
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("undefined");
  return json;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
