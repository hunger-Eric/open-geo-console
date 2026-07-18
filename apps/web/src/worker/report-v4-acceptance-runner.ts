import {
  armReportV4ProhibitedOperationGuard,
  completeReportV4ProhibitedOperationGuard,
  loadReportV4ProhibitedOperationGuardAuthority,
  withReportV4ProhibitedOperationGuardSegment,
  type ArmReportV4ProhibitedOperationGuardInput,
  type ReportV4ProhibitedOperationGuardAuthority,
  type ReportV4ProhibitedOperationGuardCapability,
} from "../db/report-v4-prohibited-operation-guard";
import { captureReportV4AcceptancePhase, type CaptureReportV4AcceptancePhaseResult } from "./report-v4-acceptance-phase-capture";
import type { ReportV4CommerceAuthoritySnapshotSql } from "../db/report-v4-commerce-authority-snapshot";
import { loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction, type PersistedReportV4AcceptanceAuthorityPhaseSnapshot } from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";
import { ensureDatabase, getSqlClient } from "../db/index";

export interface RunReportV4AcceptanceStageInput<T> {
  readonly sql: ReportV4CommerceAuthoritySnapshotSql;
  readonly observer: ReportV4AcceptanceObserver;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly coreJobId: string;
  readonly workerGitSha: string;
  readonly inspectDurableTerminal: () => Promise<boolean>;
  readonly runStage: () => Promise<T>;
  readonly isTerminalResult: (result: T) => boolean;
  readonly testOnly?: RunReportV4AcceptanceStageTestOnlyDependencies<T>;
}

export interface RunReportV4AcceptanceStageTestOnlyDependencies<T> {
  readonly loadFinal?: (sql: ReportV4CommerceAuthoritySnapshotSql, input: { sessionId: string; scenarioId: string; phase: "final" }) => Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null>;
  readonly captureFinal?: (input: RunReportV4AcceptanceStageInput<T>) => Promise<CaptureReportV4AcceptancePhaseResult>;
  readonly guard?: GuardDependencies;
}

interface GuardDependencies {
  load(input: ArmReportV4ProhibitedOperationGuardInput): Promise<ReportV4ProhibitedOperationGuardAuthority | null>;
  arm(input: ArmReportV4ProhibitedOperationGuardInput): Promise<ReportV4ProhibitedOperationGuardCapability>;
  segment<T>(capability: ReportV4ProhibitedOperationGuardCapability, work: () => Promise<T>): Promise<T>;
  complete(capability: ReportV4ProhibitedOperationGuardCapability): Promise<void>;
}

export async function runReportV4AcceptanceStage<T>(input: RunReportV4AcceptanceStageInput<T>): Promise<{ readonly result: T | null; readonly final: CaptureReportV4AcceptancePhaseResult | null; readonly guardState: "absent" | "armed" | "completed" }> {
  if (input.testOnly && process.env.NODE_ENV !== "test") throw new Error("Report V4 acceptance runner test seams require NODE_ENV=test.");
  const identity: ArmReportV4ProhibitedOperationGuardInput = { sessionId: input.sessionId, scenarioId: input.scenarioId, jobId: input.coreJobId, workerGitSha: input.workerGitSha };
  const test = input.testOnly;
  const final = await (test?.loadFinal ?? loadFinalPhase)(input.sql, { sessionId: input.sessionId, scenarioId: input.scenarioId, phase: "final" });
  if (final) return { result: null, final: await captureFinal(input), guardState: "completed" };
  if (!test) {
    await ensureDatabase();
    if ((getSqlClient() as unknown) !== (input.sql as unknown)) throw new Error("Report V4 acceptance runner requires the phase and guard authorities to use the same database client.");
  }
  const guard = test?.guard ?? productionGuard(input.sql);
  const authority = await guard.load(identity);
  if (authority?.run.state === "completed") {
    if (!await input.inspectDurableTerminal()) throw new Error("A completed acceptance guard without a durable terminal stage cannot capture final authority.");
    return { result: null, final: await captureFinal(input), guardState: "completed" };
  }
  if (!authority && await input.inspectDurableTerminal()) throw new Error("A terminal acceptance stage cannot run without its exact persisted guard authority.");
  const capability = await guard.arm(identity);
  if (await input.inspectDurableTerminal()) {
    await guard.complete(capability);
    return { result: null, final: await captureFinal(input), guardState: "completed" };
  }
  let result: T;
  try {
    result = await guard.segment(capability, input.runStage);
  } catch (error) {
    throw error;
  }
  const resultClaimsTerminal = input.isTerminalResult(result);
  const durableTerminal = await input.inspectDurableTerminal();
  if (resultClaimsTerminal && !durableTerminal) throw new Error("A terminal stage result without a durable terminal authority cannot complete the acceptance guard.");
  if (!durableTerminal) return { result, final: null, guardState: "armed" };
  await guard.complete(capability);
  return { result, final: await captureFinal(input), guardState: "completed" };
}

async function captureFinal<T>(input: RunReportV4AcceptanceStageInput<T>): Promise<CaptureReportV4AcceptancePhaseResult> {
  return input.testOnly?.captureFinal
    ? input.testOnly.captureFinal(input)
    : captureReportV4AcceptancePhase({ sql: input.sql, sessionId: input.sessionId, scenarioId: input.scenarioId, phase: "final", workerGitSha: input.workerGitSha, observer: input.observer });
}

async function loadFinalPhase(sql: ReportV4CommerceAuthoritySnapshotSql, input: { sessionId: string; scenarioId: string; phase: "final" }): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null> {
  return sql.begin("isolation level repeatable read read only", (tx) => loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, input));
}

function productionGuard(sql: ReportV4CommerceAuthoritySnapshotSql): GuardDependencies {
  return {
    load: async (input) => loadReportV4ProhibitedOperationGuardAuthority(sql as never, input),
    arm: (input) => armReportV4ProhibitedOperationGuard(input),
    segment: withReportV4ProhibitedOperationGuardSegment,
    complete: completeReportV4ProhibitedOperationGuard,
  };
}
