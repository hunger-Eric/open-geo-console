import { describe, expect, it, vi } from "vitest";
import { databaseMigrationsAfter } from "./migrations";
import {
  createReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceLedgerStore
} from "./report-v4-acceptance-ledger";

const protectedEnvironment = {
  VERCEL_ENV: "preview",
  OGC_DEPLOYMENT_PROFILE: "staging",
  COMMERCE_MODE: "test"
} as NodeJS.ProcessEnv;

// @requirement GEO-V4-ACCEPT-01
describe("Report V4 protected-Staging acceptance ledger validation", () => {
  it("ships the scenario lock guard as a forward migration", () => {
    const upgrade = databaseMigrationsAfter(39).join("\n");
    expect(upgrade).toContain("ogc_guard_report_v4_acceptance_event");
    expect(upgrade).toMatch(/WHERE id=NEW\.scenario_id AND session_id=NEW\.session_id FOR UPDATE/u);
    expect(databaseMigrationsAfter(40)).toEqual([]);
  });
  it("rejects production before invoking persistence", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceLedgerRepository(store, {
      VERCEL_ENV: "production", OGC_DEPLOYMENT_PROFILE: "production", COMMERCE_MODE: "live"
    } as NodeJS.ProcessEnv);
    await expect(repository.createSession(session())).rejects.toThrow(/protected staging preview/i);
    await expect(repository.loadSession(session().sessionId)).rejects.toThrow(/protected staging preview/i);
    await expect(repository.loadScenarios(session().sessionId)).rejects.toThrow(/protected staging preview/i);
    await expect(repository.loadCollectingScenarioByJob({ sessionId: session().sessionId, jobId: "job-1" }))
      .rejects.toThrow(/protected staging preview/i);
    await expect(repository.loadEvents(session().sessionId)).rejects.toThrow(/protected staging preview/i);
    expect(store.createSession).not.toHaveBeenCalled();
    expect(store.loadSession).not.toHaveBeenCalled();
    expect(store.loadScenarios).not.toHaveBeenCalled();
    expect(store.loadCollectingScenarioByJob).not.toHaveBeenCalled();
    expect(store.loadEvents).not.toHaveBeenCalled();
  });

  it("requires canonical deployment identity and exact typed event details", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceLedgerRepository(store, protectedEnvironment);
    await expect(repository.createSession({ ...session(), protectedAliasUrl: "http://preview.example" }))
      .rejects.toThrow(/https/i);
    await expect(repository.createSession({ ...session(), webGitSha: "A".repeat(40) }))
      .rejects.toThrow(/sha/i);
    await expect(repository.createSession({ ...session(), workerGitSha: "b".repeat(40) }))
      .rejects.toThrow(/same deployment commit/i);
    const successScenario = {
      sessionId: session().sessionId, scenarioId: "22222222-2222-4222-8222-222222222222", kind: "success" as const,
      faultKind: "independent_source_read_failure" as const, faultQuestionId: "question-1", expectedFaultOccurrences: 1 as const
    };
    await repository.createScenario(successScenario);
    await expect(repository.createScenario({ ...successScenario, faultSourceId: "" })).rejects.toThrow(/nonblank/i);
    await expect(repository.bindFaultSource({ sessionId: successScenario.sessionId, scenarioId: successScenario.scenarioId, sourceId: "" }))
      .rejects.toThrow(/nonblank/i);
    await expect(repository.appendEvent({
      sessionId: session().sessionId,
      scenarioId: "22222222-2222-4222-8222-222222222222",
      kind: "model_operation",
      operation: "page_analysis",
      unitId: "page-1",
      attempt: 1,
      phase: "started",
      details: { providerCall: true, retry: false, budgetOutcome: "allowed", inputTokens: 10, outputTokens: 0, prompt: "leak" }
    } as never)).rejects.toThrow(/details|field|prompt/i);
    expect(store.appendEvent).not.toHaveBeenCalled();
  });

  it("accepts every canonical prohibited operation including the V37 expansion", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceLedgerRepository(store, protectedEnvironment);
    for (const operation of ["pdf", "provider_claim", "qualification", "four_snapshot", "replacement_fulfillment",
      "correction", "full_report_rerun", "legacy_mutation"] as const) {
      await repository.appendEvent({ sessionId: session().sessionId, scenarioId: "22222222-2222-4222-8222-222222222222",
        kind: "prohibited_operation", operation, unitId: operation, attempt: 0, phase: "started", details: {} });
    }
    expect(store.appendEvent).toHaveBeenCalledTimes(8);
    await expect(repository.appendEvent({ sessionId: session().sessionId,
      scenarioId: "22222222-2222-4222-8222-222222222222", kind: "prohibited_operation",
      operation: "unknown", unitId: "unknown", attempt: 0, phase: "started", details: {} } as never))
      .rejects.toThrow(/kind, operation, phase/u);
  });
});

function session() {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    previewDeploymentId: "dpl_preview_1",
    protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40),
    workerGitSha: "a".repeat(40)
  };
}

function fakeStore(): ReportV4AcceptanceLedgerStore & Record<string, ReturnType<typeof vi.fn>> {
  return {
    createSession: vi.fn(), createScenario: vi.fn(), bindFaultSource: vi.fn(), bindPreAdmissionJob: vi.fn(), bindScenario: vi.fn(), appendEvent: vi.fn(),
    sealScenario: vi.fn(), failScenario: vi.fn(), sealSession: vi.fn(), failSession: vi.fn(),
    loadSession: vi.fn(), loadScenarios: vi.fn(), loadCollectingScenarioByJob: vi.fn(), loadEvents: vi.fn()
  } as never;
}
