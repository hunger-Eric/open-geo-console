import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type {
  CreateReportV4AcceptanceScenarioInput,
  ReportV4AcceptanceLedgerStore,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import { createReportV4AcceptanceOperator } from "./report-v4-acceptance-operator";

const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OGC_DEPLOYMENT_PROFILE: "staging",
  VERCEL_ENV: "preview",
  COMMERCE_MODE: "test",
  DATABASE_URL: "postgres://secret-value"
};

describe("Report V4 acceptance operator", () => {
  it("rejects the wrong environment before touching the ledger", async () => {
    const store = mockStore();
    const operator = createReportV4AcceptanceOperator(store, { ...ENVIRONMENT, OGC_DEPLOYMENT_PROFILE: "production" });
    await expect(operator.execute("begin", beginPayload())).rejects.toThrow(/protected|staging|Preview/iu);
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["uppercase UUID", (payload: BeginPayload) => { payload.sessionId = `A${payload.sessionId.slice(1)}`; }],
    ["short Web SHA", (payload: BeginPayload) => { payload.webGitSha = "a".repeat(39); }],
    ["different Worker SHA", (payload: BeginPayload) => { payload.workerGitSha = "b".repeat(40); }],
    ["non-origin alias", (payload: BeginPayload) => { payload.protectedAliasUrl = "https://preview.example/path"; }],
    ["blank deployment ID", (payload: BeginPayload) => { payload.previewDeploymentId = " "; }]
  ])("validates the full begin payload before the first write: %s", async (_label, mutate) => {
    const payload = beginPayload();
    mutate(payload);
    const store = mockStore();
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT).execute("begin", payload)).rejects.toThrow();
    expect(store.createSession).not.toHaveBeenCalled();
    expect(store.createScenario).not.toHaveBeenCalled();
  });

  it("creates one exact session and the three fixed collecting scenarios with a delayed success source", async () => {
    const store = mockStore();
    const result = await createReportV4AcceptanceOperator(store, ENVIRONMENT).execute("begin", beginPayload());
    expect(store.createSession).toHaveBeenCalledTimes(1);
    expect(store.createScenario).toHaveBeenCalledTimes(3);
    const scenarios = vi.mocked(store.createScenario).mock.calls.map(([input]) => input);
    expect(scenarios).toEqual([
      expect.objectContaining({ kind: "success", faultKind: "independent_source_read_failure", expectedFaultOccurrences: 1 }),
      expect.objectContaining({ kind: "diagnosis_failure", faultKind: "diagnosis_failure", expectedFaultOccurrences: 2 }),
      expect.objectContaining({ kind: "question_failure", faultKind: "question_failure", expectedFaultOccurrences: 2 })
    ]);
    expect(scenarios[0]).not.toHaveProperty("faultSourceId");
    expect(result).toMatchObject({ action: "begin", scenarios: [{ kind: "success" }, { kind: "diagnosis_failure" }, { kind: "question_failure" }] });
  });

  it("allows an exact begin retry but propagates an idempotency conflict", async () => {
    const store = mockStore();
    const operator = createReportV4AcceptanceOperator(store, ENVIRONMENT);
    await operator.execute("begin", beginPayload());
    await expect(operator.execute("begin", beginPayload())).resolves.toMatchObject({ action: "begin" });
    vi.mocked(store.createSession).mockRejectedValueOnce(new Error("idempotency conflict"));
    await expect(operator.execute("begin", beginPayload())).rejects.toThrow(/idempotency conflict/u);
  });

  it.each([
    ["bind-source", { sessionId: SESSION_ID, scenarioId: SUCCESS_ID, sourceId: "source-1" }, "bindFaultSource"],
    ["bind-pre-admission", { sessionId: SESSION_ID, scenarioId: SUCCESS_ID, preAdmissionJobId: "pre-job-1" }, "bindPreAdmissionJob"],
    ["bind-lineage", lineagePayload(), "bindScenario"]
  ] as const)("keeps %s as an explicit guarded command", async (action, payload, method) => {
    const store = mockStore();
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT).execute(action, payload)).resolves.toMatchObject({ action });
    expect(store[method]).toHaveBeenCalledTimes(1);
  });

  it("makes terminal commands idempotent only for an exact terminal result and rejects conflicts", async () => {
    const store = mockStore();
    const sealed = scenarioRow({ state: "sealed", baselineFingerprint: "c".repeat(64), finalFingerprint: "d".repeat(64) });
    vi.mocked(store.loadScenarios).mockResolvedValue([sealed]);
    const operator = createReportV4AcceptanceOperator(store, ENVIRONMENT);
    const payload = { sessionId: SESSION_ID, scenarioId: SUCCESS_ID, baselineFingerprint: "c".repeat(64), finalFingerprint: "d".repeat(64) };
    await expect(operator.execute("seal-scenario", payload)).resolves.toMatchObject({ scenario: sealed });
    expect(store.sealScenario).not.toHaveBeenCalled();
    await expect(operator.execute("seal-scenario", { ...payload, finalFingerprint: "e".repeat(64) })).rejects.toThrow(/conflict|fingerprint/iu);

    vi.mocked(store.loadSession).mockResolvedValue(sessionRow({ state: "sealed" }));
    await expect(operator.execute("seal-session", { sessionId: SESSION_ID })).resolves.toMatchObject({ session: { state: "sealed" } });
    expect(store.sealSession).not.toHaveBeenCalled();
    await expect(operator.execute("fail-session", { sessionId: SESSION_ID })).rejects.toThrow(/conflict|sealed/iu);
  });

  it("contains no deployment, payment, email, browser, production-access, or Worker mutation path", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-v4-acceptance-operator.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/vercel\s+(deploy|alias)|payment|refund|email|browser|playwright|production-worker|worker\/|process\.env\.OGC_REPORT_V4_ACCEPTANCE_SESSION/iu);
    expect(source).not.toMatch(/DATABASE_URL/u);
  });
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SUCCESS_ID = "21111111-1111-4111-8111-111111111111";
const DIAGNOSIS_ID = "31111111-1111-4111-8111-111111111111";
const QUESTION_ID = "41111111-1111-4111-8111-111111111111";

interface BeginPayload {
  sessionId: string;
  previewDeploymentId: string;
  protectedAliasUrl: string;
  webGitSha: string;
  workerGitSha: string;
  scenarios: Array<Record<string, unknown>>;
}

function beginPayload(): BeginPayload {
  return {
    sessionId: SESSION_ID,
    previewDeploymentId: "dpl-preview-1",
    protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40),
    workerGitSha: "a".repeat(40),
    scenarios: [
      { scenarioId: SUCCESS_ID, kind: "success", faultQuestionId: "question-success" },
      { scenarioId: DIAGNOSIS_ID, kind: "diagnosis_failure", faultQuestionId: "question-diagnosis" },
      { scenarioId: QUESTION_ID, kind: "question_failure", faultQuestionId: "question-failure" }
    ]
  };
}

function lineagePayload() {
  return {
    sessionId: SESSION_ID,
    scenarioId: SUCCESS_ID,
    reportId: "report-1",
    orderId: "order-1",
    preAdmissionJobId: "pre-job-1",
    coreJobId: "core-job-1",
    enhancementJobId: "enhancement-job-1",
    siteSnapshotId: "site-1",
    configSnapshotId: "config-1",
    questionSetId: "questions-1",
    coreArtifactRevisionId: "core-artifact-1",
    enhancementArtifactRevisionId: "enhancement-artifact-1"
  };
}

function mockStore(): ReportV4AcceptanceLedgerStore {
  return {
    createSession: vi.fn(async (input) => sessionRow({ ...input })),
    createScenario: vi.fn(async (input) => scenarioFromInput(input)),
    bindFaultSource: vi.fn(async (input) => scenarioRow({ sessionId: input.sessionId, scenarioId: input.scenarioId, faultSourceId: input.sourceId })),
    bindPreAdmissionJob: vi.fn(async (input) => scenarioRow({ sessionId: input.sessionId, scenarioId: input.scenarioId, preAdmissionJobId: input.preAdmissionJobId })),
    bindScenario: vi.fn(async (input) => scenarioRow({ ...input })),
    appendEvent: vi.fn(),
    sealScenario: vi.fn(async (input) => scenarioRow({ ...input, state: "sealed" })),
    failScenario: vi.fn(async (input) => scenarioRow({ ...input, state: "failed" })),
    sealSession: vi.fn(async (sessionId) => sessionRow({ sessionId, state: "sealed" })),
    failSession: vi.fn(async (sessionId) => sessionRow({ sessionId, state: "failed" })),
    loadSession: vi.fn(async (sessionId) => sessionRow({ sessionId })),
    loadScenarios: vi.fn(async () => []),
    loadCollectingScenarioByJob: vi.fn(),
    loadEvents: vi.fn(async () => [])
  };
}

function sessionRow(overrides: Partial<ReportV4AcceptanceSession> = {}): ReportV4AcceptanceSession {
  return {
    sessionId: SESSION_ID,
    environment: "protected_staging",
    previewDeploymentId: "dpl-preview-1",
    protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40),
    workerGitSha: "a".repeat(40),
    state: "collecting",
    headSequence: 0,
    headHash: "0".repeat(64),
    eventCount: 0,
    startedAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: null,
    ...overrides
  };
}

function scenarioFromInput(input: CreateReportV4AcceptanceScenarioInput): ReportV4AcceptanceScenario {
  return scenarioRow({
    ...input,
    faultSourceId: "faultSourceId" in input ? input.faultSourceId ?? null : null
  });
}

function scenarioRow(overrides: Partial<ReportV4AcceptanceScenario> = {}): ReportV4AcceptanceScenario {
  return {
    sessionId: SESSION_ID,
    scenarioId: SUCCESS_ID,
    reportId: null,
    orderId: null,
    preAdmissionJobId: null,
    coreJobId: null,
    enhancementJobId: null,
    siteSnapshotId: null,
    configSnapshotId: null,
    questionSetId: null,
    coreArtifactRevisionId: null,
    enhancementArtifactRevisionId: null,
    kind: "success",
    faultKind: "independent_source_read_failure",
    faultQuestionId: "question-success",
    faultSourceId: null,
    expectedFaultOccurrences: 1,
    baselineFingerprint: null,
    finalFingerprint: null,
    state: "collecting",
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: null,
    ...overrides
  };
}
