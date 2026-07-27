import { createHash } from "node:crypto";
import {
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  loadReportV4AcceptanceAuthorityPhaseSnapshot,
  persistReportV4AcceptanceAuthorityPhaseSnapshot,
  type PersistedReportV4AcceptanceAuthorityPhaseSnapshot,
} from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4CommerceAuthoritySnapshotSql } from "../db/report-v4-commerce-authority-snapshot";
import type { ReportV4AcceptanceEventAppendResult } from "../db/report-v4-acceptance-ledger";
import type { ReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";

export interface CaptureReportV4AcceptancePhaseInput {
  readonly sql: ReportV4CommerceAuthoritySnapshotSql;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
  readonly workerGitSha: string;
  readonly observer: ReportV4AcceptanceObserver;
  /** Test-only seams. Production always uses the hardwired authority loader/persister. */
  readonly testOnly?: CaptureReportV4AcceptancePhaseTestOnlyDependencies;
}

export interface CaptureReportV4AcceptancePhaseTestOnlyDependencies {
  readonly loadPhase?: typeof loadReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly persistPhase?: typeof persistReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly loadPersisted?: (
    sql: ReportV4CommerceAuthoritySnapshotSql,
    input: { readonly sessionId: string; readonly scenarioId: string; readonly phase: "baseline" | "final" },
  ) => Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null>;
}

export interface CaptureReportV4AcceptancePhaseResult {
  readonly phase: "baseline" | "final";
  readonly snapshot: PersistedReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly commerceFingerprintEvent: ReportV4AcceptanceEventAppendResult;
}

/**
 * Persists the complete RR/RO phase authority before appending its commerce
 * fingerprint observation. A persisted row is reused verbatim, which makes a
 * crash between the two operations restart-safe without recapturing authority.
 */
export async function captureReportV4AcceptancePhase(
  input: CaptureReportV4AcceptancePhaseInput,
): Promise<CaptureReportV4AcceptancePhaseResult> {
  if (input.testOnly && process.env.NODE_ENV !== "test") {
    throw new Error("Report V4 acceptance phase-capture test seams require NODE_ENV=test.");
  }
  if (input.observer.session.sessionId !== input.sessionId || input.observer.scenario.scenarioId !== input.scenarioId) {
    throw new Error("Report V4 acceptance phase capture requires an observer for the exact session and scenario.");
  }
  if (input.observer.session.environment !== "protected_staging" || input.observer.session.state !== "collecting"
    || input.observer.session.terminalAt !== null || input.observer.scenario.sessionId !== input.sessionId
    || input.observer.scenario.state !== "collecting" || input.observer.scenario.terminalAt !== null) {
    throw new Error("A collecting protected-staging acceptance session and scenario are required for phase capture.");
  }
  if (input.observer.session.workerGitSha !== input.workerGitSha) {
    throw new Error("Report V4 acceptance phase capture worker SHA must match the acceptance session.");
  }

  const identity = { sessionId: input.sessionId, scenarioId: input.scenarioId, phase: input.phase } as const;
  const test = input.testOnly;
  const existing = await (test?.loadPersisted ?? loadPersistedPhase)(input.sql, identity);
  if (existing && (existing.sessionId !== input.sessionId || existing.scenarioId !== input.scenarioId
    || existing.phase !== input.phase || existing.workerGitSha !== input.workerGitSha
    || existing.payload.phase !== input.phase || existing.payload.session.sessionIdHash !== digest(input.sessionId)
    || existing.payload.session.scenarioIdHash !== digest(input.scenarioId))) {
    throw new Error("Persisted Report V4 acceptance phase identity or worker SHA conflicts with the capture request.");
  }
  if (existing) await assertLiveCollectingAuthority(input.sql, input, existing);
  const snapshot = existing ?? await captureAndPersist(input, test);
  const event = await input.observer.observe({
    kind: "commerce_fingerprint",
    operation: "commerce",
    unitId: input.phase === "baseline" ? "commerce-baseline" : "commerce-final",
    attempt: 0,
    phase: "observed",
    details: { fingerprint: snapshot.commerceFingerprint },
  });
  return Object.freeze({ phase: input.phase, snapshot, commerceFingerprintEvent: event });
}

async function captureAndPersist(
  input: CaptureReportV4AcceptancePhaseInput,
  test: CaptureReportV4AcceptancePhaseTestOnlyDependencies | undefined,
): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot> {
  const payload = await (test?.loadPhase ?? loadReportV4AcceptanceAuthorityPhaseSnapshot)(input.sql, {
    sessionId: input.sessionId,
    scenarioId: input.scenarioId,
    phase: input.phase,
  });
  try {
    return await (test?.persistPhase ?? persistReportV4AcceptanceAuthorityPhaseSnapshot)(input.sql, {
      sessionId: input.sessionId, scenarioId: input.scenarioId, phase: input.phase,
      workerGitSha: input.workerGitSha, payload,
    });
  } catch (error) {
    const winner = await (test?.loadPersisted ?? loadPersistedPhase)(input.sql, { sessionId: input.sessionId, scenarioId: input.scenarioId, phase: input.phase });
    if (winner && winner.workerGitSha === input.workerGitSha && winner.payloadHash === digestJson(payload)
      && winner.commerceFingerprint === payload.commerce.fingerprint) {
      await assertLiveCollectingAuthority(input.sql, input, winner);
      return winner;
    }
    throw error;
  }
}

async function assertLiveCollectingAuthority(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: CaptureReportV4AcceptancePhaseInput,
  snapshot: PersistedReportV4AcceptanceAuthorityPhaseSnapshot,
): Promise<void> {
  await sql.begin("read only", async (tx) => {
    const rows = await tx.unsafe(`SELECT sessions.state session_state,sessions.environment,sessions.worker_git_sha,
      scenarios.state scenario_state FROM report_v4_acceptance_sessions sessions
      JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id AND scenarios.id=$2
      WHERE sessions.id=$1`, [input.sessionId, input.scenarioId]);
    if (rows.length !== 1 || rows[0].environment !== "protected_staging" || rows[0].session_state !== "collecting"
      || rows[0].scenario_state !== "collecting" || rows[0].worker_git_sha !== input.workerGitSha
      || snapshot.sessionId !== input.sessionId || snapshot.scenarioId !== input.scenarioId) {
      throw new Error("Live Report V4 acceptance phase authority is no longer a collecting protected-staging session.");
    }
  });
}

async function loadPersistedPhase(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: { readonly sessionId: string; readonly scenarioId: string; readonly phase: "baseline" | "final" },
): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null> {
  return sql.begin("isolation level repeatable read read only", (tx) =>
    loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, input));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): string {
  return digest(stableJson(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
