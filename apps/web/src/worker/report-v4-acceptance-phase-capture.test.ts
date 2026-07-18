import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureReportV4AcceptancePhase } from "./report-v4-acceptance-phase-capture";
import type { ReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";

const sessionId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";
const workerGitSha = "a".repeat(40);
const fingerprint = "b".repeat(64);

function observer(overrides: Partial<ReportV4AcceptanceObserver> = {}): ReportV4AcceptanceObserver {
  return {
    session: {
      sessionId, environment: "protected_staging", previewDeploymentId: "preview", protectedAliasUrl: "https://preview.example",
      webGitSha: workerGitSha, workerGitSha, state: "collecting", headSequence: 0, headHash: "0".repeat(64), eventCount: 0,
      startedAt: new Date(), terminalAt: null,
    },
    scenario: {
      sessionId, scenarioId, reportId: "report", orderId: "order", preAdmissionJobId: "pre", coreJobId: "core", enhancementJobId: null,
      siteSnapshotId: "site", configSnapshotId: "config", questionSetId: "questions", coreArtifactRevisionId: "core-artifact",
      enhancementArtifactRevisionId: null, kind: "success", faultKind: "independent_source_read_failure", faultQuestionId: "q",
      faultSourceId: "source", expectedFaultOccurrences: 1, baselineFingerprint: null, finalFingerprint: null, state: "collecting",
      createdAt: new Date(), terminalAt: null,
    },
    observe: vi.fn(async (event) => ({ inserted: true, event: event as never })),
    claimExternalIo: vi.fn(), finishExternalIo: vi.fn(),
    ...overrides,
  } as ReportV4AcceptanceObserver;
}

function sql() {
  return { begin: vi.fn(async (_options: string, work: (tx: { unsafe: (query?: string) => Promise<unknown[]> }) => unknown) => work({ unsafe: async (query = "") => query.includes("report_v4_acceptance_sessions") ? [{ environment: "protected_staging", session_state: "collecting", scenario_state: "collecting", worker_git_sha: workerGitSha }] : [] })) } as never;
}

function snapshot(phase: "baseline" | "final") {
  const payload = {
    phase, session: { sessionIdHash: digest(sessionId), scenarioIdHash: digest(scenarioId), } as never,
    commerce: { fingerprint },
  } as never;
  return { sessionId, scenarioId, phase, capturedAt: "2026-07-18T00:00:00.000Z", payload,
    payloadHash: digest(stableJson(payload)), commerceFingerprint: fingerprint, workerGitSha };
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

describe("captureReportV4AcceptancePhase", () => {
  it("persists before appending a new fingerprint event", async () => {
    const order: string[] = [];
    const loadPhase = vi.fn(async () => { order.push("load"); return {} as never; });
    const persistPhase = vi.fn(async () => { order.push("persist"); return snapshot("baseline"); });
    const obs = observer({ observe: vi.fn(async (event) => { order.push("event"); return { inserted: true, event: event as never }; }) });
    await captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "baseline", workerGitSha, observer: obs,
 testOnly: { loadPhase, persistPhase } });
    expect(order).toEqual(["load", "persist", "event"]);
    expect(obs.observe).toHaveBeenCalledWith(expect.objectContaining({ unitId: "commerce-baseline", details: { fingerprint } }));
  });

  it("reuses an existing row and appends the idempotent event", async () => {
    const loadPersisted = vi.fn(async () => snapshot("final"));
    const loadPhase = vi.fn(); const persistPhase = vi.fn(); const obs = observer();
    const result = await captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "final", workerGitSha, observer: obs,
 testOnly: { loadPersisted, loadPhase, persistPhase } });
    expect(result.snapshot.phase).toBe("final"); expect(loadPhase).not.toHaveBeenCalled(); expect(persistPhase).not.toHaveBeenCalled();
    expect(obs.observe).toHaveBeenCalledWith(expect.objectContaining({ unitId: "commerce-final", attempt: 0 }));
  });

  it("does not append when persistence fails and propagates event conflicts", async () => {
    const obs = observer();
    const persistError = new Error("persist failed");
    await expect(captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "baseline", workerGitSha, observer: obs,
 testOnly: { loadPhase: vi.fn(async () => ({} as never)), persistPhase: vi.fn(async () => { throw persistError; }) } })).rejects.toBe(persistError);
    expect(obs.observe).not.toHaveBeenCalled();
    const conflict = new Error("Report V4 acceptance event idempotency payload conflict.");
    await expect(captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "baseline", workerGitSha, observer: observer({ observe: vi.fn(async () => { throw conflict; }) }),
 testOnly: { loadPersisted: vi.fn(async () => snapshot("baseline")) } })).rejects.toBe(conflict);
  });

  it("fails closed for a non-collecting or non-protected observer", async () => {
    const obs = observer({ session: { ...observer().session, environment: "protected_staging", state: "sealed" } });
    await expect(captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "baseline", workerGitSha, observer: obs,
 testOnly: { loadPersisted: vi.fn(async () => snapshot("baseline")) } })).rejects.toThrow("collecting protected-staging");
  });

  it("converges only when a persist race reloads the exact winner row", async () => {
    const winner = snapshot("baseline");
    const loadPersisted = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    const obs = observer();
    const result = await captureReportV4AcceptancePhase({ sql: sql(), sessionId, scenarioId, phase: "baseline", workerGitSha, observer: obs,
 testOnly: {
        loadPersisted, loadPhase: vi.fn(async () => winner.payload),
        persistPhase: vi.fn(async () => { throw new Error("Report V4 authority phase persistence conflict is not an exact idempotent replay."); }),
      } });
    expect(result.snapshot).toBe(winner);
    expect(loadPersisted).toHaveBeenCalledTimes(2);
  });
});
