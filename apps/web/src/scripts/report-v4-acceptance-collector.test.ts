import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { PersistedReportV4AcceptanceAuthorityPhaseSnapshot } from "../db/report-v4-acceptance-authority-phase-snapshot";
import type {
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceLedgerStore,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import { ReportV4AcceptanceLedgerVerificationError } from "../report-v4/acceptance-ledger-verifier";
import { createReportV4AcceptanceCollector } from "./report-v4-acceptance-collector";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OGC_DEPLOYMENT_PROFILE: "staging",
  VERCEL_ENV: "preview",
  COMMERCE_MODE: "test",
  DATABASE_URL: "postgres://secret-value"
};

describe("Report V4 acceptance collector", () => {
  it("asserts protected staging before any read", async () => {
    const store = readStore();
    const collector = createReportV4AcceptanceCollector(store, { ...ENVIRONMENT, VERCEL_ENV: "production" });
    await expect(collector.collect(SESSION_ID)).rejects.toThrow(/protected|staging|Preview/iu);
    expect(store.loadSession).not.toHaveBeenCalled();
  });

  it("projects and verifies every exact scenario against the same structurally verified global ledger", async () => {
    const persistedSession = session();
    const persistedScenarios = scenarios();
    const persistedEvents = events(persistedScenarios);
    const store = readStore(persistedSession, persistedScenarios, persistedEvents);
    const dependencies = semanticDependencies(persistedScenarios);
    const result = await createReportV4AcceptanceCollector(store, ENVIRONMENT, dependencies).collect(SESSION_ID);

    expect(dependencies.verifyLedger).toHaveBeenCalledExactlyOnceWith(
      persistedSession,
      persistedScenarios,
      persistedEvents
    );
    expect(dependencies.projectSemanticAuthority).toHaveBeenCalledTimes(3);
    expect(dependencies.verifyScenarioSemantics).toHaveBeenCalledTimes(3);
    persistedScenarios.forEach((scenario, index) => {
      const projection = vi.mocked(dependencies.projectSemanticAuthority).mock.calls[index]![0];
      expect(projection.session).toBe(persistedSession);
      expect(projection.scenarios).toBe(persistedScenarios);
      expect(projection.events).toBe(persistedEvents);
      expect(projection.scenario).toBe(scenario);

      const semantic = vi.mocked(dependencies.verifyScenarioSemantics).mock.calls[index]![0];
      expect(semantic.scenario).toBe(scenario);
      expect(semantic.events).toEqual(persistedEvents.filter((event) => event.scenarioId === scenario.scenarioId));
      expect(semantic.events.every((event) => event.scenarioId === scenario.scenarioId)).toBe(true);
    });
    expect(result.semanticScenarios.map((row) => [row.scenarioId, row.kind, row.semanticVerification.valid]))
      .toEqual(persistedScenarios.map((scenario) => [scenario.scenarioId, scenario.kind, true]));
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      contract: "report-v4-acceptance-semantic-evidence/v2",
      structuralVerification: { valid: true, scenarioCount: 3 },
      session: { sessionId: SESSION_ID },
      semanticScenarios: persistedScenarios.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        kind: scenario.kind,
        semanticVerification: { valid: true, scenarioId: scenario.scenarioId },
        semanticAuthority: { scenarioId: scenario.scenarioId }
      }))
    });
    expect(JSON.stringify(result)).not.toMatch(/secret-value|DATABASE_URL|postgres:\/\//u);
  });

  it.each(["baseline", "final", "config"] as const)("fails closed when exact %s authority is missing", async (missing) => {
    const persistedScenarios = scenarios();
    const dependencies = semanticDependencies(persistedScenarios, missing);
    await expect(createReportV4AcceptanceCollector(
      readStore(session(), persistedScenarios, events(persistedScenarios)),
      ENVIRONMENT,
      dependencies
    ).collect(SESSION_ID)).rejects.toThrow(/baseline|final|configuration snapshot/iu);
    expect(dependencies.projectSemanticAuthority).not.toHaveBeenCalled();
  });

  it("fails closed for mismatched persisted authority identity or immutable config lineage", async () => {
    const persistedScenarios = scenarios();
    const phaseDrift = semanticDependencies(persistedScenarios);
    vi.mocked(phaseDrift.loadPersistedPhase).mockImplementation(async (input) => persistedPhase(
      persistedScenarios[0]!, input.phase, input.phase === "final" ? "question_failure" : persistedScenarios[0]!.kind
    ));
    await expect(createReportV4AcceptanceCollector(
      readStore(session(), persistedScenarios, events(persistedScenarios)), ENVIRONMENT, phaseDrift
    ).collect(SESSION_ID)).rejects.toThrow(/identity|kind|mismatch/iu);

    const configDrift = semanticDependencies(persistedScenarios);
    vi.mocked(configDrift.loadConfigSnapshot).mockImplementation(async (id) => ({
      ...configFor(persistedScenarios.find((scenario) => scenario.configSnapshotId === id)!),
      reportId: "wrong-report"
    }));
    await expect(createReportV4AcceptanceCollector(
      readStore(session(), persistedScenarios, events(persistedScenarios)), ENVIRONMENT, configDrift
    ).collect(SESSION_ID)).rejects.toThrow(/configuration snapshot lineage.*mismatch/iu);
  });

  it.each(["both-phases-vs-session", "baseline-vs-final"] as const)(
    "rejects persisted phase Worker SHA drift for %s before semantic projection",
    async (drift) => {
      const persistedScenarios = scenarios();
      const dependencies = semanticDependencies(persistedScenarios);
      vi.mocked(dependencies.loadPersistedPhase).mockImplementation(async (input) => {
        const scenario = persistedScenarios.find((candidate) => candidate.scenarioId === input.scenarioId)!;
        const phase = persistedPhase(scenario, input.phase, scenario.kind);
        return {
          ...phase,
          workerGitSha: drift === "both-phases-vs-session" || input.phase === "baseline"
            ? "f".repeat(40)
            : phase.workerGitSha
        };
      });
      await expect(createReportV4AcceptanceCollector(
        readStore(session(), persistedScenarios, events(persistedScenarios)), ENVIRONMENT, dependencies
      ).collect(SESSION_ID)).rejects.toThrow(/authority phase.*mismatch/iu);
      expect(dependencies.projectSemanticAuthority).not.toHaveBeenCalled();
    }
  );

  it.each(["projector", "verifier"] as const)("fails closed when the semantic %s fails", async (failure) => {
    const persistedScenarios = scenarios();
    const dependencies = semanticDependencies(persistedScenarios);
    const dependency = failure === "projector" ? dependencies.projectSemanticAuthority : dependencies.verifyScenarioSemantics;
    vi.mocked(dependency as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error(`${failure} rejected`); });
    await expect(createReportV4AcceptanceCollector(
      readStore(session(), persistedScenarios, events(persistedScenarios)), ENVIRONMENT, dependencies
    ).collect(SESSION_ID)).rejects.toThrow(new RegExp(failure));
  });

  it("runs structural verification before any semantic authority load", async () => {
    const persistedScenarios = scenarios();
    const dependencies = semanticDependencies(persistedScenarios);
    vi.mocked(dependencies.verifyLedger).mockImplementation(() => {
      throw new ReportV4AcceptanceLedgerVerificationError(["broken structural ledger"]);
    });
    await expect(createReportV4AcceptanceCollector(
      readStore(session(), persistedScenarios, events(persistedScenarios)), ENVIRONMENT, dependencies
    ).collect(SESSION_ID)).rejects.toBeInstanceOf(ReportV4AcceptanceLedgerVerificationError);
    expect(dependencies.loadPersistedPhase).not.toHaveBeenCalled();
    expect(dependencies.loadConfigSnapshot).not.toHaveBeenCalled();
    expect(dependencies.projectSemanticAuthority).not.toHaveBeenCalled();
  });

  it("is fail-closed for a missing or structurally incomplete ledger", async () => {
    const missing = readStore();
    vi.mocked(missing.loadSession).mockResolvedValue(null);
    await expect(createReportV4AcceptanceCollector(missing, ENVIRONMENT).collect(SESSION_ID)).rejects.toThrow(/not found/iu);

    const incomplete = readStore();
    await expect(createReportV4AcceptanceCollector(incomplete, ENVIRONMENT).collect(SESSION_ID))
      .rejects.toBeInstanceOf(ReportV4AcceptanceLedgerVerificationError);
  });

  it("hard-wires real read-only authorities and contains no mutation, deployment, payment, email, browser, or Worker path", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-v4-acceptance-collector.ts", import.meta.url)), "utf8");
    expect(source).toMatch(/productionDependencies[\s\S]*verifyReportV4AcceptanceLedger[\s\S]*loadProductionPersistedPhase[\s\S]*loadProductionConfigSnapshot[\s\S]*projectReportV4AcceptanceSemanticAuthority[\s\S]*verifyReportV4AcceptanceScenarioSemantics/u);
    expect(source).toMatch(/loadProductionConfigSnapshot[\s\S]*isolation level repeatable read read only[\s\S]*getReportV4ConfigSnapshotByIdInTransaction/u);
    expect(source).toMatch(/isolation level repeatable read read only/u);
    expect(source).not.toMatch(/createSession|createScenario|bindScenario|sealSession|failSession|appendEvent/u);
    expect(source).not.toMatch(/vercel\s+(deploy|alias)|payment|refund|email|browser|playwright|production-worker|worker\//iu);
    expect(source).not.toMatch(/DATABASE_URL/u);
  });
});

function readStore(
  persistedSession: ReportV4AcceptanceSession = session(),
  persistedScenarios: readonly ReportV4AcceptanceScenario[] = scenarios(),
  persistedEvents: readonly ReportV4AcceptanceEvent[] = []
): ReportV4AcceptanceLedgerStore {
  return {
    createSession: vi.fn(), createScenario: vi.fn(), bindFaultSource: vi.fn(), bindPreAdmissionJob: vi.fn(),
    bindScenario: vi.fn(), appendEvent: vi.fn(), sealScenario: vi.fn(), failScenario: vi.fn(),
    sealSession: vi.fn(), failSession: vi.fn(), loadCollectingScenarioByJob: vi.fn(),
    loadSession: vi.fn(async () => persistedSession),
    loadScenarios: vi.fn(async () => persistedScenarios),
    loadEvents: vi.fn(async () => persistedEvents)
  };
}

function semanticDependencies(scenarioRows: readonly ReportV4AcceptanceScenario[], missing?: "baseline" | "final" | "config") {
  return {
    verifyLedger: vi.fn(() => ({ valid: true as const, sessionId: SESSION_ID, scenarioCount: 3 as const,
      eventCount: scenarioRows.length, headHash: "a".repeat(64) })),
    loadPersistedPhase: vi.fn(async (input: { scenarioId: string; phase: "baseline" | "final" }) => {
      if (missing === input.phase) return null;
      const scenario = scenarioRows.find((candidate) => candidate.scenarioId === input.scenarioId)!;
      return persistedPhase(scenario, input.phase, scenario.kind);
    }),
    loadConfigSnapshot: vi.fn(async (id: string) => {
      if (missing === "config") return null;
      return configFor(scenarioRows.find((scenario) => scenario.configSnapshotId === id)!);
    }),
    projectSemanticAuthority: vi.fn((input: { scenario: ReportV4AcceptanceScenario }) => ({
      scenarioId: input.scenario.scenarioId
    }) as never),
    verifyScenarioSemantics: vi.fn((input: { scenario: ReportV4AcceptanceScenario; events: readonly ReportV4AcceptanceEvent[] }) => ({
      valid: true as const,
      scenarioId: input.scenario.scenarioId,
      verifiedEventCount: input.events.length
    }))
  };
}

function session(): ReportV4AcceptanceSession {
  return {
    sessionId: SESSION_ID, environment: "protected_staging", previewDeploymentId: "dpl-preview-1",
    protectedAliasUrl: "https://preview.example", webGitSha: "a".repeat(40), workerGitSha: "a".repeat(40),
    state: "sealed", headSequence: 3, headHash: "a".repeat(64), eventCount: 3,
    startedAt: new Date("2026-07-17T00:00:00.000Z"), terminalAt: new Date("2026-07-17T00:01:00.000Z")
  };
}

function scenarios(): readonly ReportV4AcceptanceScenario[] {
  return (["success", "diagnosis_failure", "question_failure"] as const).map((kind, index) => ({
    sessionId: SESSION_ID,
    scenarioId: `${index + 2}1111111-1111-4111-8111-111111111111`,
    reportId: `report-${index}`, orderId: `order-${index}`, preAdmissionJobId: `pre-${index}`,
    coreJobId: `core-${index}`, enhancementJobId: kind === "question_failure" ? null : `enhancement-${index}`,
    siteSnapshotId: `site-${index}`, configSnapshotId: `config-${index}`, questionSetId: `questions-${index}`,
    coreArtifactRevisionId: `core-artifact-${index}`,
    enhancementArtifactRevisionId: kind === "question_failure" ? null : `enhancement-artifact-${index}`,
    kind, faultKind: kind === "success" ? "independent_source_read_failure" : kind,
    faultQuestionId: `question-${kind}`, faultSourceId: kind === "success" ? `source-${index}` : null,
    expectedFaultOccurrences: kind === "success" ? 1 : 2,
    baselineFingerprint: "b".repeat(64), finalFingerprint: "d".repeat(64), state: "sealed" as const,
    createdAt: new Date("2026-07-17T00:00:00.000Z"), terminalAt: new Date("2026-07-17T00:01:00.000Z")
  }));
}

function events(scenarioRows: readonly ReportV4AcceptanceScenario[]): readonly ReportV4AcceptanceEvent[] {
  return scenarioRows.map((scenario, index) => ({
    eventId: `event-${index}`, sessionId: SESSION_ID, scenarioId: scenario.scenarioId, sequence: index + 1,
    idempotencyKey: `${index}`.repeat(64), kind: "fault_injection" as const, operation: scenario.faultKind,
    unitId: `unit-${index}`, attempt: 1 as const, phase: "consumed" as const,
    details: {}, detailsCanonical: "{}", prevHash: index === 0 ? "0".repeat(64) : `${index - 1}`.repeat(64),
    eventHash: `${index}`.repeat(64), occurredAtCanonical: `2026-07-17T00:00:0${index}.000000Z`,
    occurredAt: new Date(`2026-07-17T00:00:0${index}.000Z`)
  }));
}

function persistedPhase(
  scenario: ReportV4AcceptanceScenario,
  phase: "baseline" | "final",
  scenarioKind: ReportV4AcceptanceScenario["kind"]
): PersistedReportV4AcceptanceAuthorityPhaseSnapshot {
  return {
    sessionId: scenario.sessionId, scenarioId: scenario.scenarioId, phase,
    capturedAt: phase === "baseline" ? "2026-07-17T00:00:00.000000Z" : "2026-07-17T00:00:30.000000Z",
    payload: { phase, scenarioKind } as never,
    payloadHash: "a".repeat(64), commerceFingerprint: "b".repeat(64), workerGitSha: "a".repeat(40)
  };
}

function configFor(scenario: ReportV4AcceptanceScenario): ReportV4ConfigSnapshotRow {
  return {
    id: scenario.configSnapshotId!, reportId: scenario.reportId!, orderId: scenario.orderId!, coreJobId: scenario.coreJobId!,
    identityHash: "a".repeat(64), modelProfileId: "model", modelProfileHash: "b".repeat(64), modelProfile: {} as never,
    reportProfileId: "report", reportProfileHash: "c".repeat(64), reportProfile: {} as never,
    createdAt: new Date("2026-07-17T00:00:00.000Z")
  };
}
