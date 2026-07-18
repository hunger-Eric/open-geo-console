import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type {
  CreateReportV4AcceptanceScenarioInput,
  ReportV4AcceptanceLedgerStore,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "../report-v4/report-v4-acceptance-fingerprints";
import {
  createReportV4AcceptanceOperator,
  type ReportV4AcceptanceOperatorTestOnlyDependencies
} from "./report-v4-acceptance-operator";

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
    const collecting = boundScenario();
    const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(collecting);
    const sealed = { ...collecting, state: "sealed" as const, baselineFingerprint, finalFingerprint: "d".repeat(64) };
    vi.mocked(store.loadScenarios).mockResolvedValue([sealed]);
    const operator = createReportV4AcceptanceOperator(store, ENVIRONMENT, authorityDependencies({ scenarioState: "sealed" }));
    const payload = { sessionId: SESSION_ID, scenarioId: SUCCESS_ID, baselineFingerprint, finalFingerprint: "d".repeat(64) };
    await expect(operator.execute("seal-scenario", payload)).resolves.toMatchObject({ scenario: sealed });
    expect(store.sealScenario).not.toHaveBeenCalled();
    await expect(operator.execute("seal-scenario", { ...payload, finalFingerprint: "e".repeat(64) })).rejects.toThrow(/conflict|fingerprint/iu);

    vi.mocked(store.loadSession).mockResolvedValue(sessionRow({ state: "sealed" }));
    await expect(operator.execute("seal-session", { sessionId: SESSION_ID })).resolves.toMatchObject({ session: { state: "sealed" } });
    expect(store.sealSession).not.toHaveBeenCalled();
    await expect(operator.execute("fail-session", { sessionId: SESSION_ID })).rejects.toThrow(/conflict|sealed/iu);
  });

  it.each(["seal-scenario", "fail-scenario"] as const)(
    "recomputes the exact persisted fault baseline before the first %s terminal write",
    async (action) => {
      const store = mockStore();
      const scenario = boundScenario({
        scenarioId: QUESTION_ID,
        kind: "question_failure",
        faultKind: "question_failure",
        faultQuestionId: "question-failure",
        expectedFaultOccurrences: 2,
        enhancementJobId: null,
        enhancementArtifactRevisionId: null
      });
      const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario);
      vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
      const operator = createReportV4AcceptanceOperator(store, ENVIRONMENT, authorityDependencies({
        scenarioId: QUESTION_ID,
        scenarioKind: "question_failure"
      }));
      const payload = {
        sessionId: SESSION_ID,
        scenarioId: QUESTION_ID,
        baselineFingerprint,
        finalFingerprint: "d".repeat(64)
      };

      await expect(operator.execute(action, { ...payload, baselineFingerprint: "c".repeat(64) }))
        .rejects.toThrow(/baseline|fingerprint/iu);
      expect(store.sealScenario).not.toHaveBeenCalled();
      expect(store.failScenario).not.toHaveBeenCalled();

      await expect(operator.execute(action, payload)).resolves.toMatchObject({ action });
      expect(store[action === "seal-scenario" ? "sealScenario" : "failScenario"])
        .toHaveBeenCalledExactlyOnceWith(payload);
    }
  );

  it("rejects a scenario row that does not belong to the exact requested session before terminal writes", async () => {
    const store = mockStore();
    const scenario = boundScenario({ sessionId: "51111111-1111-4111-8111-111111111111" });
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    const payload = {
      sessionId: SESSION_ID,
      scenarioId: SUCCESS_ID,
      baselineFingerprint: computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario),
      finalFingerprint: "d".repeat(64)
    };

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, authorityDependencies()).execute("seal-scenario", payload))
      .rejects.toThrow(/exact|not found|session/iu);
    expect(store.sealScenario).not.toHaveBeenCalled();
    expect(store.failScenario).not.toHaveBeenCalled();
  });

  it.each([
    ["seal-scenario", "sealed", "sealScenario"],
    ["fail-scenario", "failed", "failScenario"]
  ] as const)("keeps an exact %s terminal retry idempotent after baseline recomputation", async (action, state, method) => {
    const store = mockStore();
    const collecting = boundScenario();
    const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(collecting);
    const terminal = {
      ...collecting,
      state,
      baselineFingerprint,
      finalFingerprint: "d".repeat(64)
    };
    vi.mocked(store.loadScenarios).mockResolvedValue([terminal]);
    const payload = {
      sessionId: SESSION_ID,
      scenarioId: SUCCESS_ID,
      baselineFingerprint,
      finalFingerprint: "d".repeat(64)
    };

    await expect(createReportV4AcceptanceOperator(
      store,
      ENVIRONMENT,
      action === "seal-scenario" ? authorityDependencies({ scenarioState: "sealed" }) : undefined
    ).execute(action, payload))
      .resolves.toMatchObject({ action, scenario: terminal });
    expect(store[method]).not.toHaveBeenCalled();
  });

  // @requirement GEO-V4-ACCEPT-01
  // @requirement GEO-V4-COMMERCE-01
  it("seals only after the exact persisted phase pair is fully revalidated and commerce-verified", async () => {
    const store = mockStore();
    const scenario = boundScenario();
    const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario);
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    const dependencies = authorityDependencies();
    const payload = { sessionId: SESSION_ID, scenarioId: SUCCESS_ID, baselineFingerprint, finalFingerprint: FINAL_COMMERCE };

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", payload))
      .resolves.toMatchObject({ action: "seal-scenario", scenario: { state: "sealed" } });
    expect(dependencies.loadSealAuthorityPair).toHaveBeenCalledExactlyOnceWith(payload);
    expect(dependencies.assertCompleteAuthorityPhase).toHaveBeenCalledTimes(2);
    expect(dependencies.assertCaptureOrder).toHaveBeenCalledTimes(1);
    expect(dependencies.compareCommerce).toHaveBeenCalledTimes(1);
    expect(store.sealScenario).toHaveBeenCalledExactlyOnceWith(payload);
  });

  it("fails closed for a missing phase row before the terminal write", async () => {
    const store = mockStore();
    const scenario = boundScenario();
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    const dependencies = authorityDependencies();
    vi.mocked(dependencies.loadSealAuthorityPair).mockRejectedValue(new Error("persisted baseline and final required"));

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", sealPayload(scenario)))
      .rejects.toThrow(/baseline|final|required/iu);
    expect(store.sealScenario).not.toHaveBeenCalled();
  });

  it.each([
    ["tampered payload", "tampered complete payload", "complete"],
    ["reversed capture times", "final capture precedes baseline", "order"],
    ["equal capture times", "baseline capture must strictly precede final", "order"]
  ] as const)("rejects %s", async (_label, failure, failureSource) => {
    const scenario = boundScenario();
    const store = mockStore();
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    const dependencies = authorityDependencies();
    const assertion = failureSource === "complete" ? dependencies.assertCompleteAuthorityPhase : dependencies.assertCaptureOrder;
    vi.mocked(assertion).mockImplementation(() => { throw new Error(failure); });
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", sealPayload(scenario)))
      .rejects.toThrow(new RegExp(failure.split(" ")[0]!, "iu"));
    expect(store.sealScenario).not.toHaveBeenCalled();
  });

  it("does not permit test dependency injection in a production runtime", () => {
    expect(() => createReportV4AcceptanceOperator(mockStore(), { ...ENVIRONMENT, NODE_ENV: "production" }, authorityDependencies()))
      .toThrow(/test-only/iu);
  });

  it.each([
    ["lineage", () => authorityDependencies({ scenarioKind: "question_failure" })],
    ["Worker SHA", () => authorityDependencies({ finalWorkerGitSha: "b".repeat(40) })],
    ["comparator", () => authorityDependencies({ comparisonValid: false })],
    ["final fingerprint", () => authorityDependencies({ finalCommerceFingerprint: "e".repeat(64) })]
  ] as const)("rejects %s drift before sealing", async (_label, makeDependencies) => {
    const store = mockStore();
    const scenario = boundScenario();
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, makeDependencies()).execute("seal-scenario", sealPayload(scenario)))
      .rejects.toThrow();
    expect(store.sealScenario).not.toHaveBeenCalled();
  });

  it("reruns durable authority checks for an exact sealed replay and fails if the pair disappeared", async () => {
    const store = mockStore();
    const collecting = boundScenario();
    const payload = sealPayload(collecting);
    const sealed = { ...collecting, state: "sealed" as const, baselineFingerprint: payload.baselineFingerprint, finalFingerprint: payload.finalFingerprint };
    vi.mocked(store.loadScenarios).mockResolvedValue([sealed]);
    const valid = authorityDependencies({ scenarioState: "sealed" });
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, valid).execute("seal-scenario", payload))
      .resolves.toMatchObject({ scenario: sealed });
    expect(valid.assertCompleteAuthorityPhase).toHaveBeenCalledTimes(2);
    expect(store.sealScenario).not.toHaveBeenCalled();

    const missing = authorityDependencies({ scenarioState: "sealed" });
    vi.mocked(missing.loadSealAuthorityPair).mockRejectedValue(new Error("final phase row missing"));
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, missing).execute("seal-scenario", payload))
      .rejects.toThrow(/missing/iu);
  });

  it("keeps fail-scenario available without any authority phase pair", async () => {
    const store = mockStore();
    const scenario = boundScenario();
    vi.mocked(store.loadScenarios).mockResolvedValue([scenario]);
    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT).execute("fail-scenario", sealPayload(scenario)))
      .resolves.toMatchObject({ action: "fail-scenario", scenario: { state: "failed" } });
    expect(store.failScenario).toHaveBeenCalledTimes(1);
  });

  it("routes production-style sealing through the atomic authority operation and never calls the ledger seal", async () => {
    const store = mockStore();
    const collecting = boundScenario();
    const payload = sealPayload(collecting);
    const sealed = { ...collecting, state: "sealed" as const,
      baselineFingerprint: payload.baselineFingerprint, finalFingerprint: payload.finalFingerprint };
    vi.mocked(store.loadScenarios).mockResolvedValueOnce([collecting]).mockResolvedValueOnce([sealed]);
    const dependencies = atomicSealDependencies();

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", payload))
      .resolves.toMatchObject({ scenario: sealed });
    expect(dependencies.sealScenarioAtomically).toHaveBeenCalledExactlyOnceWith(payload);
    expect(dependencies.loadSealAuthorityPair).not.toHaveBeenCalled();
    expect(store.sealScenario).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic authority operation detects a stale final event head", async () => {
    const store = mockStore();
    const collecting = boundScenario();
    vi.mocked(store.loadScenarios).mockResolvedValue([collecting]);
    const dependencies = atomicSealDependencies(new Error("final authority phase is stale because the event head advanced"));

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", sealPayload(collecting)))
      .rejects.toThrow(/stale|head advanced/iu);
    expect(store.sealScenario).not.toHaveBeenCalled();
    expect(store.loadScenarios).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the locked persisted lineage recomputes a different fault baseline", async () => {
    const store = mockStore();
    const collecting = boundScenario();
    vi.mocked(store.loadScenarios).mockResolvedValue([collecting]);
    const dependencies = atomicSealDependencies(new Error("locked fault-provenance baseline does not match"));

    await expect(createReportV4AcceptanceOperator(store, ENVIRONMENT, dependencies).execute("seal-scenario", sealPayload(collecting)))
      .rejects.toThrow(/locked|fault-provenance|baseline/iu);
    expect(store.sealScenario).not.toHaveBeenCalled();
    expect(store.loadScenarios).toHaveBeenCalledTimes(1);
  });

  it("hard-wires lock-order, live-head comparison, and terminal CAS into one production transaction", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-v4-acceptance-operator.ts", import.meta.url)), "utf8");
    expect(source).toMatch(/begin\("isolation level repeatable read read write"[\s\S]*atomic-seal-session-lock[\s\S]*FOR UPDATE[\s\S]*atomic-seal-scenario-lock[\s\S]*FOR UPDATE/iu);
    expect(source).toMatch(/session\.head_sequence[\s\S]*final\.payload\.session\.headSequence[\s\S]*session\.head_hash[\s\S]*final\.payload\.session\.headHash[\s\S]*session\.event_count[\s\S]*final\.payload\.session\.eventCount/iu);
    expect(source).toMatch(/atomic-seal-cas[\s\S]*UPDATE report_v4_acceptance_scenarios[\s\S]*state='collecting'[\s\S]*RETURNING state/iu);
    expect(source).toMatch(/atomic-seal-scenario-lock[\s\S]*report_id,order_id,pre_admission_job_id,core_job_id,enhancement_job_id[\s\S]*config_snapshot_id,question_set_id,core_artifact_revision_id,enhancement_artifact_revision_id[\s\S]*FOR UPDATE/iu);
    expect(source).toMatch(/parseLockedAcceptanceScenario\(scenario\)[\s\S]*computeReportV4AcceptanceFaultProvenanceBaselineFingerprint\(lockedScenario\)[\s\S]*lockedBaselineFingerprint !== input\.baselineFingerprint[\s\S]*atomic-seal-cas/iu);
  });

  it("registers both operator and collector CLIs through the workspace script contract", () => {
    const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../package.json", import.meta.url)), "utf8"));
    const webPackage = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
    expect(rootPackage.scripts).toMatchObject({
      "report-v4:acceptance:operator": "npm run report-v4:acceptance:operator --workspace apps/web --",
      "report-v4:acceptance:collect": "npm run report-v4:acceptance:collect --workspace apps/web --"
    });
    expect(webPackage.scripts).toMatchObject({
      "report-v4:acceptance:operator": "node --import tsx src/scripts/report-v4-acceptance-operator.ts",
      "report-v4:acceptance:collect": "node --import tsx src/scripts/report-v4-acceptance-collector.ts"
    });
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
const BASELINE_COMMERCE = "b".repeat(64);
const FINAL_COMMERCE = "d".repeat(64);

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

function boundScenario(overrides: Partial<ReportV4AcceptanceScenario> = {}): ReportV4AcceptanceScenario {
  return scenarioRow({
    reportId: "report-1",
    orderId: "order-1",
    preAdmissionJobId: "pre-job-1",
    coreJobId: "core-job-1",
    enhancementJobId: "enhancement-job-1",
    siteSnapshotId: "site-1",
    configSnapshotId: "config-1",
    questionSetId: "questions-1",
    coreArtifactRevisionId: "core-artifact-1",
    enhancementArtifactRevisionId: "enhancement-artifact-1",
    ...overrides
  });
}

function sealPayload(scenario: ReportV4AcceptanceScenario) {
  return {
    sessionId: scenario.sessionId,
    scenarioId: scenario.scenarioId,
    baselineFingerprint: computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario),
    finalFingerprint: FINAL_COMMERCE
  };
}

function authorityDependencies(overrides: {
  scenarioId?: string;
  scenarioKind?: ReportV4AcceptanceScenario["kind"];
  scenarioState?: "collecting" | "sealed" | "failed";
  finalWorkerGitSha?: string;
  finalCommerceFingerprint?: string;
  comparisonValid?: boolean;
} = {}): ReportV4AcceptanceOperatorTestOnlyDependencies {
  const scenarioKind = overrides.scenarioKind ?? "success";
  const finalCommerceFingerprint = overrides.finalCommerceFingerprint ?? FINAL_COMMERCE;
  const commerce = (fingerprint: string) => ({ fingerprint }) as never;
  const payload = (phase: "baseline" | "final", fingerprint: string) => ({
    phase,
    scenarioKind,
    capturedAt: phase === "baseline" ? "2026-07-17T00:00:00.000Z" : "2026-07-17T00:01:00.000Z",
    session: { sessionIdHash: "1".repeat(64), scenarioIdHash: "2".repeat(64) },
    commerce: commerce(fingerprint)
  }) as never;
  const baselinePayload = payload("baseline", BASELINE_COMMERCE);
  const finalPayload = payload("final", finalCommerceFingerprint);
  const workerGitSha = "a".repeat(40);
  const pair = {
    baseline: {
      sessionId: SESSION_ID,
      scenarioId: overrides.scenarioId ?? SUCCESS_ID,
      phase: "baseline" as const,
      capturedAt: "2026-07-17T00:00:00.000Z",
      payload: baselinePayload,
      payloadHash: "1".repeat(64),
      commerceFingerprint: BASELINE_COMMERCE,
      workerGitSha
    },
    final: {
      sessionId: SESSION_ID,
      scenarioId: overrides.scenarioId ?? SUCCESS_ID,
      phase: "final" as const,
      capturedAt: "2026-07-17T00:01:00.000Z",
      payload: finalPayload,
      payloadHash: "2".repeat(64),
      commerceFingerprint: finalCommerceFingerprint,
      workerGitSha: overrides.finalWorkerGitSha ?? workerGitSha
    },
    sessionWorkerGitSha: workerGitSha,
    sessionState: "collecting" as const,
    scenarioState: overrides.scenarioState ?? "collecting",
    scenarioKind
  };
  const verified = {
    baselineFingerprint: true,
    finalFingerprint: true,
    distinctFingerprints: true,
    captureOrder: true,
    immutableLineage: true,
    componentAuthority: true,
    finalTopology: true
  };
  const comparisonValid = overrides.comparisonValid ?? true;
  return {
    loadSealAuthorityPair: vi.fn(async () => pair),
    assertCompleteAuthorityPhase: vi.fn(() => undefined) as never,
    assertCaptureOrder: vi.fn(() => undefined),
    compareCommerce: vi.fn(() => ({
      valid: comparisonValid,
      scenarioKind,
      baselineFingerprint: BASELINE_COMMERCE,
      finalFingerprint: finalCommerceFingerprint,
      components: {},
      violations: comparisonValid ? [] : [{ code: "drift", message: "drift", component: "snapshot" }],
      verified: comparisonValid ? verified : { ...verified, finalTopology: false }
    })) as never
  };
}

function atomicSealDependencies(error?: Error): ReportV4AcceptanceOperatorTestOnlyDependencies {
  const dependencies = authorityDependencies();
  return {
    ...dependencies,
    sealScenarioAtomically: vi.fn(async () => {
      if (error) throw error;
    })
  };
}
