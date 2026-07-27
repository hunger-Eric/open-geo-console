import type { ReportV4CommerceAuthoritySnapshotSql, ReportV4CommerceAuthoritySnapshotTransactionSql } from "../db/report-v4-commerce-authority-snapshot";

export interface InspectReportV4AcceptanceTerminalInput {
  readonly sql: ReportV4CommerceAuthoritySnapshotSql;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly coreJobId: string;
  readonly currentJobId: string;
  readonly target: "core" | "enhancement";
}

/**
 * Reads only the durable job terminal needed to decide whether a guarded stage
 * may complete. This is deliberately weaker than final commerce authority:
 * the subsequent phase loader still validates every commerce and artifact
 * authority before issuing final evidence.
 */
export async function inspectReportV4AcceptanceDurableTerminal(
  input: InspectReportV4AcceptanceTerminalInput,
): Promise<boolean> {
  const parsed = parseInput(input);
  if (parsed.target === "core" && parsed.currentJobId !== parsed.coreJobId) return false;
  return parsed.sql.begin("isolation level repeatable read read only", (tx) => inspectInTransaction(tx, parsed));
}

function parseInput(value: unknown): InspectReportV4AcceptanceTerminalInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Durable terminal input must be an object.");
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.join("\x1f") !== ["coreJobId", "currentJobId", "scenarioId", "sessionId", "sql", "target"].join("\x1f")) {
    throw new TypeError("Durable terminal input fields must match the exact contract.");
  }
  if (!input.sql || (typeof input.sql !== "object" && typeof input.sql !== "function")
    || typeof (input.sql as { begin?: unknown }).begin !== "function") throw new TypeError("A SQL authority is required.");
  if (typeof input.sessionId !== "string" || !UUID.test(input.sessionId)) throw new TypeError("sessionId must be a lowercase UUID.");
  if (typeof input.scenarioId !== "string" || !UUID.test(input.scenarioId)) throw new TypeError("scenarioId must be a lowercase UUID.");
  for (const field of ["coreJobId", "currentJobId"] as const) {
    const id = input[field];
    if (typeof id !== "string" || !id || id.trim() !== id || id.length > 500) throw new TypeError(`${field} must be a bounded nonblank job ID.`);
  }
  if (input.target !== "core" && input.target !== "enhancement") throw new TypeError("target must be core or enhancement.");
  return input as unknown as InspectReportV4AcceptanceTerminalInput;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

async function inspectInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: InspectReportV4AcceptanceTerminalInput,
): Promise<boolean> {
  const rows = await tx.unsafe(`SELECT sessions.state session_state, scenarios.state scenario_state,
      scenarios.kind scenario_kind, scenarios.core_job_id, scenarios.enhancement_job_id,
      core.stage core_stage, core.execution_state core_execution_state,
      enhancement.stage enhancement_stage, enhancement.execution_state enhancement_execution_state
    FROM report_v4_acceptance_sessions sessions
    JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id AND scenarios.id=$2
    LEFT JOIN scan_jobs core ON core.id=scenarios.core_job_id
    LEFT JOIN scan_jobs enhancement ON enhancement.id=scenarios.enhancement_job_id
    WHERE sessions.id=$1`, [input.sessionId, input.scenarioId]);
  if (rows.length > 1) throw new Error("Report V4 acceptance durable terminal authority is ambiguous.");
  const row = rows[0];
  if (!row || row.session_state !== "collecting" || row.scenario_state !== "collecting") return false;
  if (input.target === "core") {
    return row.scenario_kind === "question_failure" && row.core_job_id === input.coreJobId
      && row.enhancement_job_id == null && row.core_stage === "completed"
      && row.core_execution_state === "completed";
  }
  return (row.scenario_kind === "success" || row.scenario_kind === "diagnosis_failure")
    && row.core_job_id === input.coreJobId && row.enhancement_job_id === input.currentJobId
    && ((row.enhancement_stage === "completed" && row.enhancement_execution_state === "completed")
      || (row.enhancement_stage === "failed" && row.enhancement_execution_state === "failed"));
}
