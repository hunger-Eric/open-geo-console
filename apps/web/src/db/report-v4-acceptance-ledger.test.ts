import { describe, expect, it, vi } from "vitest";
import { databaseMigrationsAfter } from "./migrations";
import {
  createPostgresReportV4AcceptanceLedgerStore,
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

  it("serializes event details before the postgres-js parameter boundary", async () => {
    const sessionId = session().sessionId;
    const scenarioId = "22222222-2222-4222-8222-222222222222";
    const bindingHash = "b".repeat(64);
    let insertParameters: readonly unknown[] = [];
    const transaction = Object.assign((strings: TemplateStringsArray, ...parameters: unknown[]) => {
      const source = strings.join("?");
      if (source.includes("FROM report_v4_acceptance_sessions")) {
        return Promise.resolve([{
          id: sessionId, environment: "protected_staging", preview_deployment_id: "dpl_preview_1",
          protected_alias_url: "https://preview.example", web_git_sha: "a".repeat(40), worker_git_sha: "a".repeat(40),
          state: "collecting", head_sequence: 0, head_hash: "0".repeat(64), event_count: 0,
          started_at: new Date("2026-07-18T00:00:00.000Z"), terminal_at: null
        }]);
      }
      if (source.includes("WHERE idempotency_key")) return Promise.resolve([]);
      if (source.includes("SELECT state FROM report_v4_acceptance_scenarios")) return Promise.resolve([{ state: "collecting" }]);
      if (source.includes("INSERT INTO report_v4_acceptance_events")) {
        insertParameters = parameters;
        return Promise.resolve([{
          idempotency_key: parameters[0], session_id: sessionId, scenario_id: scenarioId, sequence: 1,
          kind: "scenario_bound", operation: "v4_dispatch", unit_id: "pre-admission-job", attempt: 0, phase: "observed",
          details: JSON.parse(parameters[9] as string), details_canonical: JSON.stringify({ bindingHash }),
          prev_hash: "0".repeat(64), event_hash: "c".repeat(64),
          occurred_at: new Date("2026-07-18T00:00:00.000Z"), occurred_at_canonical: "2026-07-18T00:00:00.000000Z"
        }]);
      }
      throw new Error(`Unexpected SQL in parameter-boundary regression: ${source}`);
    }, {
      json: vi.fn((value: unknown) => ({ value, type: 3802 }))
    });
    const sql = Object.assign(transaction, {
      begin: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction))
    });

    const result = await createPostgresReportV4AcceptanceLedgerStore(sql as never).appendEvent({
      sessionId, scenarioId, kind: "scenario_bound", operation: "v4_dispatch", unitId: "pre-admission-job",
      attempt: 0, phase: "observed", details: { bindingHash }
    });

    expect(result.inserted).toBe(true);
    expect(transaction.json).not.toHaveBeenCalled();
    expect(insertParameters[9]).toBe(JSON.stringify({ bindingHash }));
    expect(insertParameters.every((parameter) => parameter === null || typeof parameter !== "object")).toBe(true);
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
