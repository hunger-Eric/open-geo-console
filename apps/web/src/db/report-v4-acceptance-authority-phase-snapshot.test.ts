import { describe, expect, it } from "vitest";
import type { ReportV4CommerceAuthoritySnapshot } from "./report-v4-commerce-authority-snapshot";
import {
  REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS,
  REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS,
  ReportV4AcceptanceAuthorityPhaseUnavailableError,
  assertReportV4AcceptanceWebsiteCheckpointV38Authority,
  assertReportV4AcceptanceAuthorityCaptureOrder,
  loadReportV4AcceptanceAuthorityPhaseSnapshot,
  type ReportV4AcceptanceAuthorityPhaseFoundation
} from "./report-v4-acceptance-authority-phase-snapshot";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";

describe("Report V4 acceptance authority phase snapshot foundation", () => {
  it("opens one RR/RO transaction and passes its exact transaction into the commerce helper", async () => {
    const calls: string[] = [];
    const tx = {
      async unsafe<T extends Record<string, unknown>[]>(query: string): Promise<T> {
        if (query.includes("phase-authority:isolation")) {
          return [{ transaction_isolation: "repeatable read", transaction_read_only: "on",
            captured_at: "2026-07-17T00:00:00.000Z" }] as T;
        }
        if (query.includes("phase-authority:session-scenario")) {
          return [{ session_id: SESSION, scenario_id: SCENARIO, session_state: "collecting",
            scenario_state: "collecting", scenario_kind: "question_failure", head_sequence: 0,
            head_hash: "0".repeat(64), event_count: 0 }] as T;
        }
        if (query.includes("authority:isolation")) {
          calls.push("commerce-used-same-tx");
          throw new Error("stop after transaction handoff");
        }
        throw new Error(`unexpected query: ${query}`);
      }
    };
    const sql = {
      async begin<T>(options: string, work: (value: typeof tx) => Promise<T>): Promise<T> {
        calls.push(`begin:${options}`);
        return work(tx);
      }
    };

    await expect(loadReportV4AcceptanceAuthorityPhaseSnapshot(sql, {
      sessionId: SESSION,
      scenarioId: SCENARIO,
      phase: "baseline"
    })).rejects.toThrow("stop after transaction handoff");
    expect(calls).toEqual([
      "begin:isolation level repeatable read read only",
      "commerce-used-same-tx"
    ]);
  });

  it("keeps every not-yet-implemented DB authority explicit and fail-closed", () => {
    const missing = [...REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS, "website_checkpoint_v38_hashes"] as const;
    const error = new ReportV4AcceptanceAuthorityPhaseUnavailableError(
      "baseline",
      missing,
      "a".repeat(64)
    );
    expect(error.missingAuthorities).toEqual(missing);
    expect(error.message).toMatch(/page_summary_integrity|website_checkpoint_v38_hashes/u);
    expect(JSON.stringify(error)).not.toMatch(/https?:|html|prompt|secret|token/iu);
    expect(REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS).toEqual([
      "oversized_token_probe",
      "physical_provider_call_counts",
      "pdf_invocation_count"
    ]);
  });

  it.each([
    "state",
    "providerCallCount",
    "correctionCount",
    "pageSummaryCount",
    "identityHash",
    "inputIdentityHash",
    "pageSummaryIdentitySetHash",
    "outputHash"
  ] as const)("rejects V38 adapter authority with omitted %s", (field) => {
    const checkpoint = { ...websiteCheckpoint() } as Record<string, unknown>;
    delete checkpoint[field];
    expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority(checkpoint))
      .toThrow(/incomplete|missing|canonical/i);
  });

  it.each([
    "identityHash",
    "inputIdentityHash",
    "pageSummaryIdentitySetHash",
    "outputHash"
  ] as const)("rejects V38 adapter authority with malformed %s", (field) => {
    expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority({
      ...websiteCheckpoint(),
      [field]: "A".repeat(64)
    })).toThrow(new RegExp(field, "u"));
  });

  it("rejects null, undefined, extra fields, invalid state/call counts, and invalid page count", () => {
    for (const value of [null, undefined]) {
      expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority(value)).toThrow(/complete object/i);
    }
    expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority({
      ...websiteCheckpoint(), rawUrl: "https://secret.example/"
    })).toThrow(/non-canonical/i);
    for (const drift of [
      { state: "running" },
      { providerCallCount: 0 },
      { providerCallCount: 2 },
      { correctionCount: 1 },
      { pageSummaryCount: 0 },
      { pageSummaryCount: 51 },
      { pageSummaryCount: 1.5 }
    ]) {
      expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority({
        ...websiteCheckpoint(), ...drift
      })).toThrow(/completed exactly once|pageSummaryCount/i);
    }
  });

  it("requires full baseline and final foundations, strict capture order, and exact topology", () => {
    const baseline = foundation("baseline", "question_failure", "2026-07-17T00:00:00.000Z", false);
    const final = foundation("final", "question_failure", "2026-07-17T00:00:01.000Z", false);
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(baseline, final)).not.toThrow();
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(final, baseline)).toThrow(/baseline and final|capture order/u);
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      baseline,
      { ...final, capturedAt: baseline.capturedAt }
    )).toThrow(/strictly precede/u);
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      baseline,
      foundation("final", "success", "2026-07-17T00:00:01.000Z", false)
    )).toThrow(/scenario identity|topology/u);
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      foundation("baseline", "success", "2026-07-17T00:00:00.000Z", true),
      foundation("final", "success", "2026-07-17T00:00:01.000Z", true)
    )).toThrow(/baseline.*enhancement/u);
  });

  it.each([
    ["invalid", "not-a-date"],
    ["empty", ""],
    ["offset", "2026-07-17T08:00:00.000+08:00"],
    ["noncanonical fractional", "2026-07-17T00:00:00.00Z"]
  ])("rejects %s baseline capturedAt", (_label, capturedAt) => {
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      foundation("baseline", "question_failure", capturedAt, false),
      foundation("final", "question_failure", "2026-07-17T00:00:01.000Z", false)
    )).toThrow(/baseline capturedAt.*canonical UTC ISO instant/i);
  });

  it.each([
    ["invalid", "not-a-date"],
    ["empty", ""],
    ["offset", "2026-07-17T08:00:01.000+08:00"],
    ["noncanonical fractional", "2026-07-17T00:00:01.00Z"]
  ])("rejects %s final capturedAt", (_label, capturedAt) => {
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      foundation("baseline", "question_failure", "2026-07-17T00:00:00.000Z", false),
      foundation("final", "question_failure", capturedAt, false)
    )).toThrow(/final capturedAt.*canonical UTC ISO instant/i);
  });

  it.each([
    ["equal", "2026-07-17T00:00:00.000Z", "2026-07-17T00:00:00.000Z"],
    ["reversed", "2026-07-17T00:00:01.000Z", "2026-07-17T00:00:00.000Z"]
  ])("rejects %s canonical capture order", (_label, baselineCapturedAt, finalCapturedAt) => {
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(
      foundation("baseline", "question_failure", baselineCapturedAt, false),
      foundation("final", "question_failure", finalCapturedAt, false)
    )).toThrow(/strictly precede/i);
  });
});

function foundation(
  phase: "baseline" | "final",
  scenarioKind: "success" | "diagnosis_failure" | "question_failure",
  capturedAt: string,
  enhancement: boolean
): ReportV4AcceptanceAuthorityPhaseFoundation {
  const commerce = {
    phase,
    scenarioKind,
    scope: {
      enhancementJobIdHash: enhancement ? "e".repeat(64) : null,
      enhancementArtifactRevisionIdHash: enhancement ? "f".repeat(64) : null
    }
  } as unknown as ReportV4CommerceAuthoritySnapshot;
  return {
    phase,
    capturedAt,
    scenarioKind,
    session: {
      sessionIdHash: "a".repeat(64),
      scenarioIdHash: "b".repeat(64),
      sessionState: "collecting",
      scenarioState: "collecting",
      headSequence: 0,
      headHash: "0".repeat(64),
      eventCount: 0
    },
    commerce,
    paidAt: "2026-07-16T00:00:00.000Z",
    websiteCheckpoint: null,
    foundationHash: "c".repeat(64),
    transactionProfile: { isolation: "repeatable read", readOnly: true }
  };
}

function websiteCheckpoint() {
  return {
    state: "completed" as const,
    providerCallCount: 1 as const,
    correctionCount: 0 as const,
    pageSummaryCount: 1,
    identityHash: "1".repeat(64),
    inputIdentityHash: "2".repeat(64),
    pageSummaryIdentitySetHash: "3".repeat(64),
    outputHash: "4".repeat(64)
  };
}
