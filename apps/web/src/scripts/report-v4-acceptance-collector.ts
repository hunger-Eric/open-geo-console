import { pathToFileURL } from "node:url";
import { closeDatabase, ensureDatabase, getSqlClient } from "../db";
import {
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  type PersistedReportV4AcceptanceAuthorityPhaseSnapshot
} from "../db/report-v4-acceptance-authority-phase-snapshot";
import {
  getReportV4ConfigSnapshotByIdInTransaction,
  type ReportV4ConfigSnapshotRow,
  type ReportV4ConfigSnapshotSqlTransaction
} from "../db/report-v4-config-snapshots";
import {
  createProductionReportV4AcceptanceLedgerRepository,
  createReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceLedgerStore
} from "../db/report-v4-acceptance-ledger";
import {
  verifyReportV4AcceptanceLedger,
  type ReportV4AcceptanceLedgerVerification
} from "../report-v4/acceptance-ledger-verifier";
import {
  projectReportV4AcceptanceSemanticAuthority,
  type ProjectReportV4AcceptanceSemanticAuthorityInput
} from "../report-v4/acceptance-semantic-authority-projector";
import {
  verifyReportV4AcceptanceScenarioSemantics,
  type ReportV4AcceptanceSemanticAuthority,
  type ReportV4AcceptanceSemanticVerification,
  type VerifyReportV4AcceptanceScenarioSemanticsInput
} from "../report-v4/acceptance-semantic-verifier";
import { assertProtectedStagingCommercePreview } from "../security/deployment-policy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type LedgerVerifier = typeof verifyReportV4AcceptanceLedger;

interface ReportV4AcceptanceCollectorDependencies {
  readonly verifyLedger: LedgerVerifier;
  readonly loadPersistedPhase: (input: {
    readonly sessionId: string;
    readonly scenarioId: string;
    readonly phase: "baseline" | "final";
  }) => Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null>;
  readonly loadConfigSnapshot: (configSnapshotId: string) => Promise<ReportV4ConfigSnapshotRow | null>;
  readonly projectSemanticAuthority: (
    input: ProjectReportV4AcceptanceSemanticAuthorityInput
  ) => ReportV4AcceptanceSemanticAuthority;
  readonly verifyScenarioSemantics: (
    input: VerifyReportV4AcceptanceScenarioSemanticsInput
  ) => ReportV4AcceptanceSemanticVerification;
}

export interface ReportV4AcceptanceCollector {
  collect(sessionId: string): Promise<ReportV4AcceptanceEvidence>;
}

export interface ReportV4AcceptanceEvidence {
  readonly contract: "report-v4-acceptance-semantic-evidence/v2";
  readonly structuralVerification: ReportV4AcceptanceLedgerVerification;
  readonly semanticScenarios: readonly ReportV4AcceptanceScenarioEvidence[];
  readonly session: NonNullable<Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadSession"]>>>;
  readonly scenarios: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadScenarios"]>>;
  readonly events: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadEvents"]>>;
}

export interface ReportV4AcceptanceScenarioEvidence {
  readonly scenarioId: string;
  readonly kind: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadScenarios"]>>[number]["kind"];
  readonly semanticVerification: ReportV4AcceptanceSemanticVerification;
  readonly semanticAuthority: ReportV4AcceptanceSemanticAuthority;
}

export function createReportV4AcceptanceCollector(
  store: ReportV4AcceptanceLedgerStore,
  environment: NodeJS.ProcessEnv = process.env,
  testDependencies: Partial<ReportV4AcceptanceCollectorDependencies> = {}
): ReportV4AcceptanceCollector {
  const ledger = createReportV4AcceptanceLedgerRepository(store, environment);
  const dependencies = { ...productionDependencies, ...testDependencies };
  return {
    async collect(rawSessionId) {
      assertProtectedStagingCommercePreview(environment);
      const sessionId = parseSessionId(rawSessionId);
      const session = await ledger.loadSession(sessionId);
      if (!session) throw new Error("The Report V4 acceptance session was not found.");
      const [scenarios, events] = await Promise.all([
        ledger.loadScenarios(sessionId),
        ledger.loadEvents(sessionId)
      ]);
      const structuralVerification = dependencies.verifyLedger(session, scenarios, events);
      const semanticScenarios: ReportV4AcceptanceScenarioEvidence[] = [];
      for (const scenario of scenarios) {
        const [baseline, final, config] = await Promise.all([
          dependencies.loadPersistedPhase({ sessionId, scenarioId: scenario.scenarioId, phase: "baseline" }),
          dependencies.loadPersistedPhase({ sessionId, scenarioId: scenario.scenarioId, phase: "final" }),
          loadExactScenarioConfig(dependencies, scenario)
        ]);
        const exact = assertExactScenarioAuthorityRows(session, scenario, baseline, final, config);
        const semanticAuthority = dependencies.projectSemanticAuthority({
          session,
          scenarios,
          scenario,
          events,
          baselinePhase: exact.baseline.payload,
          finalPhase: exact.final.payload,
          config: exact.config
        });
        const semanticVerification = dependencies.verifyScenarioSemantics({
          scenario,
          events: events.filter((event) => event.scenarioId === scenario.scenarioId),
          authority: semanticAuthority
        });
        semanticScenarios.push(Object.freeze({
          scenarioId: scenario.scenarioId,
          kind: scenario.kind,
          semanticVerification,
          semanticAuthority
        }));
      }
      return Object.freeze({
        contract: "report-v4-acceptance-semantic-evidence/v2",
        structuralVerification,
        semanticScenarios: Object.freeze(semanticScenarios),
        session,
        scenarios,
        events
      });
    }
  };
}

const productionDependencies: ReportV4AcceptanceCollectorDependencies = Object.freeze({
  verifyLedger: verifyReportV4AcceptanceLedger,
  loadPersistedPhase: loadProductionPersistedPhase,
  loadConfigSnapshot: loadProductionConfigSnapshot,
  projectSemanticAuthority: projectReportV4AcceptanceSemanticAuthority,
  verifyScenarioSemantics: verifyReportV4AcceptanceScenarioSemantics
});

async function loadProductionPersistedPhase(input: {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null> {
  await ensureDatabase();
  return getSqlClient().begin("isolation level repeatable read read only", (tx) =>
    loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, input));
}

async function loadProductionConfigSnapshot(configSnapshotId: string): Promise<ReportV4ConfigSnapshotRow | null> {
  await ensureDatabase();
  return getSqlClient().begin("isolation level repeatable read read only", (tx) =>
    getReportV4ConfigSnapshotByIdInTransaction(tx as unknown as ReportV4ConfigSnapshotSqlTransaction, configSnapshotId));
}

async function loadExactScenarioConfig(
  dependencies: ReportV4AcceptanceCollectorDependencies,
  scenario: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadScenarios"]>>[number]
): Promise<ReportV4ConfigSnapshotRow | null> {
  if (!scenario.configSnapshotId) throw new Error(`Scenario ${scenario.scenarioId} has no immutable configuration snapshot identity.`);
  return dependencies.loadConfigSnapshot(scenario.configSnapshotId);
}

function assertExactScenarioAuthorityRows(
  session: NonNullable<Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadSession"]>>>,
  scenario: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadScenarios"]>>[number],
  baseline: PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null,
  final: PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null,
  config: ReportV4ConfigSnapshotRow | null
): {
  readonly baseline: PersistedReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly final: PersistedReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly config: ReportV4ConfigSnapshotRow;
} {
  if (!baseline || !final) {
    throw new Error(`Scenario ${scenario.scenarioId} requires exact persisted baseline and final authority phases.`);
  }
  if (baseline.sessionId !== scenario.sessionId || final.sessionId !== scenario.sessionId
      || baseline.scenarioId !== scenario.scenarioId || final.scenarioId !== scenario.scenarioId
      || baseline.phase !== "baseline" || final.phase !== "final"
      || baseline.payload.scenarioKind !== scenario.kind || final.payload.scenarioKind !== scenario.kind
      || baseline.workerGitSha !== session.workerGitSha || final.workerGitSha !== session.workerGitSha
      || baseline.workerGitSha !== final.workerGitSha) {
    throw new Error(`Scenario ${scenario.scenarioId} authority phase identity or kind is mismatched.`);
  }
  if (!config) throw new Error(`Scenario ${scenario.scenarioId} immutable configuration snapshot was not found.`);
  if (config.id !== scenario.configSnapshotId || config.reportId !== scenario.reportId
      || config.orderId !== scenario.orderId || config.coreJobId !== scenario.coreJobId) {
    throw new Error(`Scenario ${scenario.scenarioId} immutable configuration snapshot lineage is mismatched.`);
  }
  return { baseline, final, config };
}

function parseSessionId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError("sessionId must be a lowercase UUID.");
  return value;
}

async function main(): Promise<number> {
  try {
    const [sessionId, ...extras] = process.argv.slice(2);
    if (!sessionId || extras.length > 0) throw new TypeError("Usage: report-v4-acceptance-collector <session-uuid>");
    const collector = createReportV4AcceptanceCollector(createProductionReportV4AcceptanceLedgerRepository(process.env), process.env);
    process.stdout.write(`${JSON.stringify(await collector.collect(sessionId))}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Report V4 acceptance collector failed.";
    process.stderr.write(`Report V4 acceptance collector failed: ${message}\n`);
    return 1;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
