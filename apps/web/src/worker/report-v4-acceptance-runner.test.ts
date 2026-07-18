import { describe, expect, it, vi } from "vitest";
import { runReportV4AcceptanceStage } from "./report-v4-acceptance-runner";

const ids = { sessionId: "11111111-1111-4111-8111-111111111111", scenarioId: "22222222-2222-4222-8222-222222222222", coreJobId: "core", workerGitSha: "a".repeat(40) };
const observer = { session: { sessionId: ids.sessionId, workerGitSha: ids.workerGitSha, environment: "protected_staging", state: "collecting", terminalAt: null }, scenario: { scenarioId: ids.scenarioId, sessionId: ids.sessionId, state: "collecting", terminalAt: null } } as never;
const sql = {} as never;
const finalCapture = vi.fn(async () => ({ phase: "final", snapshot: {} as never, commerceFingerprintEvent: {} as never }));
function guard(state: "absent" | "armed" | "completed", calls: string[]) {
  const capability = {} as never;
  return { load: vi.fn(async () => state === "absent" ? null : ({ run: { state } } as never)), arm: vi.fn(async () => { calls.push("arm"); return capability; }), segment: vi.fn(async (_c, work) => { calls.push("segment"); return work(); }), complete: vi.fn(async () => { calls.push("complete"); }) };
}
function input<T>(overrides: Partial<Parameters<typeof runReportV4AcceptanceStage<T>>[0]> = {}) {
  return { sql, observer, ...ids, inspectDurableTerminal: vi.fn(async () => false), runStage: vi.fn(async () => "ok" as T), isTerminalResult: vi.fn(() => true), ...overrides } as Parameters<typeof runReportV4AcceptanceStage<T>>[0];
}

describe("runReportV4AcceptanceStage", () => {
  it("does no work when final already exists", async () => {
    const calls: string[] = []; const g = guard("armed", calls); const work = vi.fn();
    const result = await runReportV4AcceptanceStage(input({ runStage: work, testOnly: { guard: g, loadFinal: vi.fn(async () => ({ } as never)), captureFinal: finalCapture } }));
    expect(work).not.toHaveBeenCalled(); expect(calls).toEqual([]); expect(result.final).toBeTruthy();
  });
  it("captures after a completed guard or terminal durable recovery", async () => {
    const calls: string[] = []; const g = guard("completed", calls);
    await runReportV4AcceptanceStage(input({ inspectDurableTerminal: vi.fn(async () => true), testOnly: { guard: g, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }));
    expect(calls).toEqual([]);
    const calls2: string[] = []; const g2 = guard("armed", calls2); const terminal = vi.fn(async () => true);
    await runReportV4AcceptanceStage(input({ inspectDurableTerminal: terminal, testOnly: { guard: g2, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }));
    expect(calls2).toEqual(["arm", "complete"]);
  });
  it("keeps an armed guard without final for nonterminal work and errors", async () => {
    const calls: string[] = []; const g = guard("absent", calls); const result = await runReportV4AcceptanceStage(input({ isTerminalResult: () => false, testOnly: { guard: g, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }));
    expect(result.final).toBeNull(); expect(result.guardState).toBe("armed"); expect(calls).toEqual(["arm", "segment"]);
    const calls2: string[] = []; const g2 = guard("absent", calls2);
    await expect(runReportV4AcceptanceStage(input({ runStage: async () => { throw new Error("boom"); }, testOnly: { guard: g2, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }))).rejects.toThrow("boom");
    expect(calls2).toEqual(["arm", "segment"]);
  });
  it("rejects absent guard with a durable terminal", async () => {
    const calls: string[] = []; const g = guard("absent", calls);
    await expect(runReportV4AcceptanceStage(input({ inspectDurableTerminal: vi.fn(async () => true), testOnly: { guard: g, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }))).rejects.toThrow("without its exact persisted guard");
    expect(calls).toEqual([]);
  });
  it("rejects an in-memory terminal result without durable terminal evidence", async () => {
    const calls: string[] = []; const g = guard("absent", calls);
    await expect(runReportV4AcceptanceStage(input({ inspectDurableTerminal: vi.fn(async () => false), testOnly: { guard: g, loadFinal: vi.fn(async () => null), captureFinal: finalCapture } }))).rejects.toThrow("without a durable terminal");
    expect(calls).toEqual(["arm", "segment"]);
  });
});
