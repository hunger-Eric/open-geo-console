import { describe, expect, it, vi } from "vitest";
import type {
  ReportV4AcceptanceEventAppendResult,
  ReportV4AcceptanceLedgerRepository,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import {
  createReportV4AcceptanceObserver,
  ReportV4AcceptanceIndeterminateOperationError
} from "./report-v4-acceptance-observer";

// @requirement GEO-V4-ACCEPT-01

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SCENARIO_ID = "22222222-2222-4222-8222-222222222222";
const WORKER_SHA = "a".repeat(40);
const HASH = "b".repeat(64);

describe("Report V4 acceptance observer facade", () => {
  it("returns null with zero repository access when the optional session environment is absent", async () => {
    const repository = fakeRepository();

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: { NODE_ENV: "test" },
      repository
    })).resolves.toBeNull();

    expect(repository.loadSession).not.toHaveBeenCalled();
    expect(repository.loadCollectingScenarioByJob).not.toHaveBeenCalled();
    expect(repository.appendEvent).not.toHaveBeenCalled();
  });

  it("fails closed before repository access outside protected Staging", async () => {
    const repository = fakeRepository();

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment({ VERCEL_ENV: "production" }),
      repository
    })).rejects.toThrow(/protected staging/i);

    expect(repository.loadSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid session UUID before repository access", async () => {
    const repository = fakeRepository();

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment({ OGC_REPORT_V4_ACCEPTANCE_SESSION_ID: "not-a-uuid" }),
      repository
    })).rejects.toThrow(/session.*uuid/i);

    expect(repository.loadSession).not.toHaveBeenCalled();
  });

  it.each([
    ["missing session", null],
    ["terminal session", session({ state: "sealed", terminalAt: new Date("2030-01-01T00:01:00.000Z") })]
  ])("fails closed for a %s", async (_label, loadedSession) => {
    const repository = fakeRepository({ loadSession: vi.fn(async () => loadedSession) });

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment(),
      repository
    })).rejects.toThrow(/collecting.*session/i);

    expect(repository.loadCollectingScenarioByJob).not.toHaveBeenCalled();
  });

  it("requires the exact deployed worker SHA recorded by the session", async () => {
    const repository = fakeRepository();

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment({ OGC_DEPLOYMENT_VERSION: "c".repeat(40) }),
      repository
    })).rejects.toThrow(/OGC_DEPLOYMENT_VERSION.*worker/i);

    expect(repository.loadCollectingScenarioByJob).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["foreign session", scenario({ sessionId: "33333333-3333-4333-8333-333333333333" })],
    ["foreign job", scenario({ preAdmissionJobId: "pre-job", coreJobId: "other-core", enhancementJobId: "enh-job" })],
    ["terminal", scenario({ state: "failed", terminalAt: new Date("2030-01-01T00:01:00.000Z") })]
  ])("fails closed for a %s scenario lookup", async (_label, loadedScenario) => {
    const repository = fakeRepository({
      loadCollectingScenarioByJob: vi.fn(async () => loadedScenario)
    });

    await expect(createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment(),
      repository
    })).rejects.toThrow(/collecting scenario|job lineage/i);
  });

  it("exposes the exact collecting session and scenario", async () => {
    const repository = fakeRepository();

    const observer = await createReportV4AcceptanceObserver({
      jobId: "core-job",
      environment: acceptanceEnvironment(),
      repository
    });

    expect(observer?.session.sessionId).toBe(SESSION_ID);
    expect(observer?.scenario.scenarioId).toBe(SCENARIO_ID);
    expect(repository.loadCollectingScenarioByJob).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      jobId: "core-job"
    });
  });

  it("allows an idempotent non-I/O observation to return inserted false", async () => {
    const repository = fakeRepository({ appendEvent: vi.fn(async () => appendResult(false)) });
    const observer = await requiredObserver(repository);

    await expect(observer.observe({
      kind: "v4_dispatch",
      operation: "v4_dispatch",
      unitId: "core-job",
      attempt: 0,
      phase: "observed",
      details: {}
    })).resolves.toMatchObject({ inserted: false });

    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: SESSION_ID,
      scenarioId: SCENARIO_ID
    }));
  });

  it.each(["crawl_run", "site_read", "model_operation"] as const)(
    "forbids observe from writing a started %s external-I/O event",
    async (kind) => {
      const repository = fakeRepository();
      const observer = await requiredObserver(repository);
      const event = kind === "crawl_run"
        ? crawlEvent("started")
        : kind === "site_read"
          ? siteReadEvent("started")
          : modelEvent("started");

      await expect(observer.observe(event)).rejects.toThrow(/claimExternalIo/i);
      expect(repository.appendEvent).not.toHaveBeenCalled();
    }
  );

  it("authorizes only the transaction that first inserts an external-I/O started event", async () => {
    const repository = fakeRepository({ appendEvent: vi.fn(async () => appendResult(true)) });
    const observer = await requiredObserver(repository);

    await expect(observer.claimExternalIo(modelEvent("started"))).resolves.toMatchObject({ inserted: true });
  });

  it("rejects a concurrent or restarted duplicate physical-I/O claim with a typed error", async () => {
    const appendEvent = vi.fn()
      .mockResolvedValueOnce(appendResult(true))
      .mockResolvedValueOnce(appendResult(false));
    const observer = await requiredObserver(fakeRepository({ appendEvent }));
    const event = siteReadEvent("started");

    await expect(observer.claimExternalIo(event)).resolves.toMatchObject({ inserted: true });
    await expect(observer.claimExternalIo(event)).rejects.toBeInstanceOf(
      ReportV4AcceptanceIndeterminateOperationError
    );
  });

  it("rejects non-started events passed to claimExternalIo without appending", async () => {
    const repository = fakeRepository();
    const observer = await requiredObserver(repository);

    await expect(observer.claimExternalIo(modelEvent("completed"))).rejects.toThrow(/started/i);
    expect(repository.appendEvent).not.toHaveBeenCalled();
  });

  it("appends terminal external-I/O events and permits idempotent inserted-false replay", async () => {
    const repository = fakeRepository({ appendEvent: vi.fn(async () => appendResult(false)) });
    const observer = await requiredObserver(repository);

    await expect(observer.finishExternalIo(crawlEvent("completed"))).resolves.toMatchObject({ inserted: false });
  });
});

function acceptanceEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    OGC_DEPLOYMENT_PROFILE: "staging",
    COMMERCE_MODE: "test",
    OGC_REPORT_V4_ACCEPTANCE_SESSION_ID: SESSION_ID,
    OGC_DEPLOYMENT_VERSION: WORKER_SHA,
    ...overrides
  };
}

function session(overrides: Partial<ReportV4AcceptanceSession> = {}): ReportV4AcceptanceSession {
  return {
    sessionId: SESSION_ID,
    environment: "protected_staging",
    previewDeploymentId: "preview-1",
    protectedAliasUrl: "https://preview.example",
    webGitSha: "d".repeat(40),
    workerGitSha: WORKER_SHA,
    state: "collecting",
    headSequence: 0,
    headHash: "0".repeat(64),
    eventCount: 0,
    startedAt: new Date("2030-01-01T00:00:00.000Z"),
    terminalAt: null,
    ...overrides
  };
}

function scenario(overrides: Partial<ReportV4AcceptanceScenario> = {}): ReportV4AcceptanceScenario {
  return {
    sessionId: SESSION_ID,
    scenarioId: SCENARIO_ID,
    reportId: "report-1",
    orderId: "order-1",
    preAdmissionJobId: "pre-job",
    coreJobId: "core-job",
    enhancementJobId: "enh-job",
    siteSnapshotId: "snapshot-1",
    configSnapshotId: "config-1",
    questionSetId: "questions-1",
    coreArtifactRevisionId: "core-artifact-1",
    enhancementArtifactRevisionId: "enh-artifact-1",
    kind: "success",
    faultKind: "independent_source_read_failure",
    faultQuestionId: "question-1",
    faultSourceId: "source-1",
    expectedFaultOccurrences: 1,
    baselineFingerprint: null,
    finalFingerprint: null,
    state: "collecting",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    terminalAt: null,
    ...overrides
  };
}

function fakeRepository(
  overrides: Partial<ReportV4AcceptanceLedgerRepository> = {}
): ReportV4AcceptanceLedgerRepository & Record<string, ReturnType<typeof vi.fn>> {
  return {
    createSession: vi.fn(),
    createScenario: vi.fn(),
    bindPreAdmissionJob: vi.fn(),
    bindScenario: vi.fn(),
    appendEvent: vi.fn(async () => appendResult(true)),
    sealScenario: vi.fn(),
    failScenario: vi.fn(),
    sealSession: vi.fn(),
    failSession: vi.fn(),
    loadSession: vi.fn(async () => session()),
    loadScenarios: vi.fn(),
    loadCollectingScenarioByJob: vi.fn(async () => scenario()),
    loadEvents: vi.fn(),
    ...overrides
  } as ReportV4AcceptanceLedgerRepository & Record<string, ReturnType<typeof vi.fn>>;
}

async function requiredObserver(repository: ReportV4AcceptanceLedgerRepository) {
  const observer = await createReportV4AcceptanceObserver({
    jobId: "core-job",
    environment: acceptanceEnvironment(),
    repository
  });
  if (!observer) throw new Error("Expected an acceptance observer.");
  return observer;
}

function appendResult(inserted: boolean): ReportV4AcceptanceEventAppendResult {
  return { inserted, event: { idempotencyKey: HASH } } as ReportV4AcceptanceEventAppendResult;
}

function crawlEvent(phase: "started" | "completed" | "failed") {
  return {
    kind: "crawl_run" as const,
    operation: "crawl" as const,
    unitId: "pre-job",
    attempt: 0 as const,
    phase,
    details: { candidatePages: 1, analyzablePages: 1, excludedPages: 0, jsDependentPages: 0 }
  };
}

function siteReadEvent(phase: "started" | "completed" | "failed") {
  return {
    kind: "site_read" as const,
    operation: "site_raw_read" as const,
    unitId: "snapshot:url",
    attempt: 1 as const,
    phase,
    details: { urlHash: HASH, readMode: "raw" as const, networkPerformed: true }
  };
}

function modelEvent(phase: "started" | "completed" | "failed" | "rejected") {
  return {
    kind: "model_operation" as const,
    operation: "question_answer" as const,
    unitId: "question-checkpoint",
    attempt: 1 as const,
    phase,
    details: {
      providerCall: phase !== "rejected",
      retry: false,
      budgetOutcome: phase === "rejected" ? "rejected" as const : "allowed" as const,
      inputTokens: 10,
      outputTokens: 20
    }
  };
}
