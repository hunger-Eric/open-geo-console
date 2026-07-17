import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  AppendReportV4AcceptanceEventInput,
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceLedgerRepository,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import {
  createReportV4AcceptanceFaultController,
  ReportV4AcceptanceFaultControllerError
} from "./report-v4-acceptance-fault-controller";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SCENARIO_ID = "22222222-2222-4222-8222-222222222222";
const SHA = "a".repeat(40);
const BASELINE = "b".repeat(64);

// @requirement GEO-V4-ACCEPT-01
describe("Report V4 acceptance DB-backed fault controller", () => {
  it("returns a true noop without repository access when the acceptance session is absent", async () => {
    const repository = fakeRepository(scenario("question_failure"));
    const controller = await createReportV4AcceptanceFaultController({
      jobId: "core-job", environment: { OGC_STAGING_LIVE_DRILL_FAULT: "question_failure" }, repository
    });

    expect(controller.mode).toBe("noop");
    await expect(controller.consume({
      jobId: "anything", questionId: "", occurrence: 2, baselineFingerprint: "not-a-hash"
    })).resolves.toEqual({ status: "noop" });
    expect(repository.loadSession).not.toHaveBeenCalled();
    expect(repository.loadCollectingScenarioByJob).not.toHaveBeenCalled();
    expect(repository.appendEvent).not.toHaveBeenCalled();
  });

  it("fails closed outside protected Staging before repository access", async () => {
    const repository = fakeRepository(scenario("question_failure"));
    await expect(createReportV4AcceptanceFaultController({
      jobId: "core-job", environment: environment({ VERCEL_ENV: "production" }), repository
    })).rejects.toThrow(/protected staging/i);
    expect(repository.loadSession).not.toHaveBeenCalled();
  });

  it("requires an exact collecting session, deployed SHA, target scenario, and target job role", async () => {
    const shaRepository = fakeRepository(scenario("question_failure"));
    await expect(createReportV4AcceptanceFaultController({
      jobId: "core-job", environment: environment({ OGC_DEPLOYMENT_VERSION: "c".repeat(40) }), repository: shaRepository
    })).rejects.toThrow(/deployment.*SHA/i);

    const roleRepository = fakeRepository(scenario("question_failure"));
    await expect(createReportV4AcceptanceFaultController({
      jobId: "pre-job", environment: environment(), repository: roleRepository
    })).rejects.toThrow(/exact question_failure job/i);
  });

  it("grants one question-failure injection per exact occurrence across concurrency and restart", async () => {
    const repository = fakeRepository(scenario("question_failure"));
    const controller = await activeController(repository, "core-job");
    const first = context({ jobId: "core-job", occurrence: 1 });

    expect(await controller.consume({ ...first, questionId: "other-question" })).toEqual({
      status: "not_targeted", reason: "question"
    });
    const competing = await Promise.all([controller.consume(first), controller.consume(first)]);
    expect(competing.map(({ status }) => status).sort()).toEqual(["already_consumed", "inject"]);
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: "fault_injection", operation: "question_failure", phase: "consumed",
      unitId: "core-job:question-1", attempt: 1,
      details: { fault: "question_failure", occurrence: 1, baselineFingerprint: BASELINE }
    }));

    const restarted = await activeController(repository, "core-job");
    await expect(restarted.consume(first)).resolves.toMatchObject({ status: "already_consumed" });
    await expect(restarted.consume(context({ jobId: "core-job", occurrence: 2 }))).resolves.toMatchObject({
      status: "inject", fault: "question_failure", occurrence: 2
    });
  });

  it("accepts exact fault details returned in a different PostgreSQL jsonb key order", async () => {
    const repository = fakeRepository(scenario("question_failure"));
    const append = repository.appendEvent;
    repository.appendEvent = vi.fn(async (input: AppendReportV4AcceptanceEventInput) => {
      const result = await append(input);
      const details = input.details as { fault: string; occurrence: number; baselineFingerprint: string };
      return {
        ...result,
        event: {
          ...result.event,
          details: {
            baselineFingerprint: details.baselineFingerprint,
            occurrence: details.occurrence,
            fault: details.fault
          }
        }
      };
    });
    const controller = await activeController(repository, "core-job");

    await expect(controller.consume(context({ jobId: "core-job", occurrence: 1 }))).resolves.toMatchObject({
      status: "inject", fault: "question_failure", occurrence: 1
    });
  });

  it("rejects wrong call job, out-of-order occurrence, and invented baseline changes", async () => {
    const repository = fakeRepository(scenario("diagnosis_failure"));
    const controller = await activeController(repository, "enh-job");

    await expect(controller.consume(context({ jobId: "other-job", occurrence: 1 })))
      .rejects.toBeInstanceOf(ReportV4AcceptanceFaultControllerError);
    await expect(controller.consume(context({ occurrence: 2 }))).rejects.toThrow(/occurrence 1/i);
    await expect(controller.consume(context({ occurrence: 1 }))).resolves.toMatchObject({ status: "inject" });
    await expect(controller.consume(context({ occurrence: 2, baselineFingerprint: "c".repeat(64) })))
      .rejects.toThrow(/baselineFingerprint/i);
    await expect(controller.consume(context({ occurrence: 2 }))).resolves.toMatchObject({
      status: "inject", fault: "diagnosis_failure", occurrence: 2
    });
  });

  it("binds the first exact success source once and never authorizes another source", async () => {
    const repository = fakeRepository(scenario("success", { faultSourceId: null }));
    const controller = await activeController(repository, "enh-job");
    const source = context({ occurrence: 1, sourceId: "source-1" });

    await expect(controller.consume({ ...source, questionId: "other-question" })).resolves.toEqual({
      status: "not_targeted", reason: "question"
    });
    expect(repository.bindFaultSource).not.toHaveBeenCalled();

    const competing = await Promise.all([controller.consume(source), controller.consume(source)]);
    expect(competing.map(({ status }) => status).sort()).toEqual(["already_consumed", "inject"]);
    expect(repository.bindFaultSource).toHaveBeenCalledWith({
      sessionId: SESSION_ID, scenarioId: SCENARIO_ID, sourceId: "source-1"
    });
    await expect(controller.consume(context({ occurrence: 1, sourceId: "source-2" }))).resolves.toEqual({
      status: "not_targeted", reason: "source"
    });
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      operation: "independent_source_read_failure", unitId: "enh-job:question-1:source-1", attempt: 1
    }));
    await expect(controller.consume(context({ occurrence: 2, sourceId: "source-1" }))).rejects.toThrow(/occurrence.*exactly 1/i);
  });
});

function environment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test",
    OGC_REPORT_V4_ACCEPTANCE_SESSION_ID: SESSION_ID, OGC_DEPLOYMENT_VERSION: SHA, ...overrides
  };
}

function session(overrides: Partial<ReportV4AcceptanceSession> = {}): ReportV4AcceptanceSession {
  return {
    sessionId: SESSION_ID, environment: "protected_staging", previewDeploymentId: "preview-1",
    protectedAliasUrl: "https://preview.example", webGitSha: SHA, workerGitSha: SHA, state: "collecting",
    headSequence: 0, headHash: "0".repeat(64), eventCount: 0,
    startedAt: new Date("2030-01-01T00:00:00.000Z"), terminalAt: null, ...overrides
  };
}

function scenario(
  kind: "success" | "diagnosis_failure" | "question_failure",
  overrides: Partial<ReportV4AcceptanceScenario> = {}
): ReportV4AcceptanceScenario {
  return {
    sessionId: SESSION_ID, scenarioId: SCENARIO_ID, reportId: "report-1", orderId: "order-1",
    preAdmissionJobId: "pre-job", coreJobId: "core-job", enhancementJobId: "enh-job",
    siteSnapshotId: "snapshot-1", configSnapshotId: "config-1", questionSetId: "questions-1",
    coreArtifactRevisionId: "core-artifact-1", enhancementArtifactRevisionId: "enh-artifact-1",
    kind, faultKind: kind === "success" ? "independent_source_read_failure" : kind,
    faultQuestionId: "question-1", faultSourceId: kind === "success" ? "source-1" : null,
    expectedFaultOccurrences: kind === "success" ? 1 : 2, baselineFingerprint: null, finalFingerprint: null,
    state: "collecting", createdAt: new Date("2030-01-01T00:00:00.000Z"), terminalAt: null, ...overrides
  };
}

function context(overrides: Partial<{
  jobId: string; questionId: string; sourceId: string; occurrence: 1 | 2; baselineFingerprint: string;
}> = {}) {
  return {
    jobId: "enh-job", questionId: "question-1", occurrence: 1 as 1 | 2,
    baselineFingerprint: BASELINE, ...overrides
  };
}

async function activeController(repository: ReportV4AcceptanceLedgerRepository, jobId: string) {
  return createReportV4AcceptanceFaultController({ jobId, environment: environment(), repository });
}

function fakeRepository(initialScenario: ReportV4AcceptanceScenario): ReportV4AcceptanceLedgerRepository & Record<string, ReturnType<typeof vi.fn>> {
  let currentScenario = initialScenario;
  const events: ReportV4AcceptanceEvent[] = [];
  const appendEvent = vi.fn(async (input: AppendReportV4AcceptanceEventInput) => {
    const idempotencyKey = createHash("sha256").update([
      input.sessionId, input.scenarioId, input.kind, input.operation, input.unitId, input.attempt, input.phase
    ].join("\x1f")).digest("hex");
    const existing = events.find((event) => event.idempotencyKey === idempotencyKey);
    if (existing) return { event: existing, inserted: false };
    const event = {
      ...input, idempotencyKey, sequence: events.length + 1, detailsCanonical: JSON.stringify(input.details),
      prevHash: events.at(-1)?.eventHash ?? "0".repeat(64), eventHash: "d".repeat(64),
      occurredAt: new Date("2030-01-01T00:00:00.000Z"), occurredAtCanonical: "2030-01-01T00:00:00.000000Z"
    } as ReportV4AcceptanceEvent;
    events.push(event);
    return { event, inserted: true };
  });
  const repository = {
    createSession: vi.fn(), createScenario: vi.fn(), bindPreAdmissionJob: vi.fn(), bindScenario: vi.fn(),
    bindFaultSource: vi.fn(async ({ sourceId }: { sourceId: string }) => {
      if (currentScenario.faultSourceId !== null && currentScenario.faultSourceId !== sourceId) throw new Error("cannot rebind fault source");
      currentScenario = { ...currentScenario, faultSourceId: sourceId };
      return currentScenario;
    }),
    appendEvent, sealScenario: vi.fn(), failScenario: vi.fn(), sealSession: vi.fn(), failSession: vi.fn(),
    loadSession: vi.fn(async () => session()), loadScenarios: vi.fn(),
    loadCollectingScenarioByJob: vi.fn(async () => currentScenario), loadEvents: vi.fn(async () => [...events])
  };
  return repository as unknown as ReportV4AcceptanceLedgerRepository & Record<string, ReturnType<typeof vi.fn>>;
}
