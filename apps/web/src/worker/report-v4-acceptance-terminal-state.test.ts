import { describe, expect, it } from "vitest";
import { inspectReportV4AcceptanceDurableTerminal } from "./report-v4-acceptance-terminal-state";

const base = { sessionId: "11111111-1111-4111-8111-111111111111", scenarioId: "22222222-2222-4222-8222-222222222222", coreJobId: "core", currentJobId: "core", target: "core" as const };
function sql(row: Record<string, unknown> | Record<string, unknown>[]) {
  return { begin: async (_: string, work: (tx: { unsafe: () => Promise<Record<string, unknown>[]> }) => Promise<boolean>) => work({ unsafe: async () => Array.isArray(row) ? row : [row] }) } as never;
}
function functionSql(row: Record<string, unknown>) {
  const client = (() => undefined) as unknown as { begin: (options: string, work: (tx: { unsafe: () => Promise<Record<string, unknown>[]> }) => Promise<boolean>) => Promise<boolean> };
  client.begin = async (_options, work) => work({ unsafe: async () => [row] });
  return client as never;
}
const core = { session_state: "collecting", scenario_state: "collecting", scenario_kind: "question_failure", core_job_id: "core", enhancement_job_id: null, core_stage: "completed", core_execution_state: "completed", enhancement_stage: null, enhancement_execution_state: null };

describe("inspectReportV4AcceptanceDurableTerminal", () => {
  it("accepts exact question-failure core completion", async () => expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql(core), ...base })).toBe(true));
  it("accepts a function-shaped postgres.js client", async () => expect(await inspectReportV4AcceptanceDurableTerminal({ sql: functionSql(core), ...base })).toBe(true));
  it("accepts success/diagnosis enhancement completed or failed", async () => {
    for (const kind of ["success", "diagnosis_failure"]) for (const outcome of [["completed", "completed"], ["failed", "failed"]]) {
      expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql({ ...core, scenario_kind: kind, currentJobId: "enh", enhancement_job_id: "enh", enhancement_stage: outcome[0], enhancement_execution_state: outcome[1], target: "enhancement" }), ...base, currentJobId: "enh", target: "enhancement" })).toBe(true);
    }
  });
  it("rejects foreign, mismatched, incomplete, or disallowed jobs", async () => {
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql(core), ...base, currentJobId: "foreign" })).toBe(false);
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql({ ...core, scenario_kind: "success" }), ...base })).toBe(false);
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql({ ...core, core_stage: "fetching" }), ...base })).toBe(false);
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql({ ...core, session_state: "sealed" }), ...base })).toBe(false);
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql([]), ...base })).toBe(false);
  });
  it("fails closed for enhancement lineage mismatch and throws on ambiguity", async () => {
    expect(await inspectReportV4AcceptanceDurableTerminal({ sql: sql({ ...core, scenario_kind: "success", enhancement_job_id: "other", enhancement_stage: "completed", enhancement_execution_state: "completed" }), ...base, currentJobId: "enh", target: "enhancement" })).toBe(false);
    await expect(inspectReportV4AcceptanceDurableTerminal({ sql: sql([core, core]), ...base })).rejects.toThrow("ambiguous");
  });
  it("rejects malformed target, IDs, extra fields, and missing SQL before querying", async () => {
    const query = sql(core);
    await expect(inspectReportV4AcceptanceDurableTerminal({ ...base, sql: query, target: "other" } as never)).rejects.toThrow("target");
    await expect(inspectReportV4AcceptanceDurableTerminal({ ...base, sql: query, sessionId: "not-a-uuid" })).rejects.toThrow("sessionId");
    await expect(inspectReportV4AcceptanceDurableTerminal({ ...base, sql: query, coreJobId: " core" })).rejects.toThrow("coreJobId");
    await expect(inspectReportV4AcceptanceDurableTerminal({ ...base, sql: undefined } as never)).rejects.toThrow("SQL");
    await expect(inspectReportV4AcceptanceDurableTerminal({ ...base, sql: query, extra: true } as never)).rejects.toThrow("exact contract");
  });
});
