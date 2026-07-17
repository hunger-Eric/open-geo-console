import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createReportV4CommerceAuthoritySnapshotPair } from "../report-v4/report-v4-commerce-authority-comparator.test-fixture";
import type { ReportV4CommerceAuthoritySnapshot } from "./report-v4-commerce-authority-snapshot";
import {
  REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS,
  REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS,
  ReportV4AcceptanceAuthorityPhaseIncompleteError,
  ReportV4AcceptanceAuthorityPhaseUnavailableError,
  assertReportV4AcceptanceWebsiteCheckpointV38Authority,
  assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  assertReportV4AcceptanceAuthorityCaptureOrder,
  loadReportV4AcceptanceAuthorityPhaseSnapshot,
  persistReportV4AcceptanceAuthorityPhaseSnapshot,
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

  it("keeps a well-shaped generic seven-slot payload explicitly unavailable", () => {
    expectIncomplete(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(completePayload()));
  });

  it("rejects every empty, generic, deleted, or reduced-and-resealed slot before opening a write transaction", async () => {
    const generic = completePayload();
    const empty = structuredClone(generic);
    empty.authorities.site_snapshot_pages = { records: [], recordCount: 0, canonicalHash: testHash("[]") };
    const deleted = structuredClone(generic) as unknown as { authorities: Record<string, unknown> };
    delete deleted.authorities.ledger_authority;
    const reduced = structuredClone(generic);
    reduced.authorities.page_summary_integrity.records = [];
    reseal(reduced.authorities.page_summary_integrity);
    const sql = { begin: vi.fn() };

    for (const payload of [generic, empty, deleted, reduced]) {
      await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, {
        sessionId: SESSION, scenarioId: SCENARIO, phase: "baseline", workerGitSha: "a".repeat(40), payload
      })).rejects.toMatchObject({ code: "phase_authority_incomplete" });
    }
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it("binds future envelope time, paid order time, session count, and collecting state before declaring slots unavailable", () => {
    const aligned = completePayload();
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload({
      ...aligned, capturedAt: new Date(Date.parse(aligned.capturedAt) + 1_000).toISOString()
    })).toThrow(/capturedAt.*commerce/i);
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload({
      ...aligned, paidAt: new Date(Date.parse(aligned.paidAt) + 1_000).toISOString()
    })).toThrow(/paidAt.*order/i);
    const count = structuredClone(completePayload());
    count.session.eventCount = 1;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(count)).toThrow(/eventCount.*headSequence/i);
    const state = structuredClone(completePayload());
    state.session.scenarioState = "sealed" as never;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(state)).toThrow(/must be collecting/i);
  });

  it("recomputes the complete commerce fingerprint before declaring DB slots unavailable", () => {
    const payload = structuredClone(completePayload());
    payload.commerce.fingerprint = "f".repeat(64);
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).toThrow(/commerce fingerprint.*canonical full payload/i);
  });

  it.each([
    "api_key",
    "db-password",
    "accessToken2Value",
    "API2Key",
    "APIKey",
    "APIKEY",
    "DBPassword",
    "HTTPAuthorization",
    "OAuthToken",
    "URLCredential",
    "CustomerEMail",
    "customeremail",
    "credentials",
    "SECRETS"
  ])(
    "recursively rejects sensitive unknown authority key %s without a case or separator bypass",
    (key) => {
      const payload = structuredClone(completePayload());
      payload.authorities.site_read_manifest.records[0] = { nested: [{ [key]: "forbidden" }] };
      expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).toThrow(/forbidden sensitive unknown field/i);
    }
  );

  it("does not misclassify an unrelated word ending in key", () => {
    const payload = structuredClone(completePayload());
    payload.authorities.site_read_manifest.records[0] = { nested: [{ monkey: "not-sensitive" }] };
    expectIncomplete(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload));
  });

  it("keeps foundation fields exact before the unavailable Complete boundary", () => {
    const incomplete = structuredClone(completePayload()) as Record<string, unknown>;
    delete incomplete.websiteCheckpoint;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(incomplete)).toThrow(/incomplete|non-canonical/i);
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload({ ...completePayload(), extra: true })).toThrow(/non-canonical/i);
  });

  it("cannot persist the incomplete foundation and never opens a write transaction", async () => {
    const sql = { begin: vi.fn() };
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, {
      sessionId: SESSION,
      scenarioId: SCENARIO,
      phase: "baseline",
      workerGitSha: "a".repeat(40),
      payload: foundation("baseline", "question_failure", "2026-07-17T00:00:00.000Z", false)
    })).rejects.toMatchObject({ code: "phase_authority_incomplete" });
    expect(sql.begin).not.toHaveBeenCalled();
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

function completePayload() {
  const commerce = createReportV4CommerceAuthoritySnapshotPair("question_failure").baseline;
  const slot = (name: string) => {
    const records = [{ name, identityHash: testHash(name) }];
    return { records, recordCount: records.length, canonicalHash: testHash(stable(records)) };
  };
  return {
    contractVersion: "report-v4-acceptance-authority-phase-v1" as const,
    phase: "baseline" as const,
    capturedAt: commerce.capturedAt,
    scenarioKind: "question_failure" as const,
    session: {
      sessionIdHash: testHash(SESSION),
      scenarioIdHash: testHash(SCENARIO),
      sessionState: "collecting" as const,
      scenarioState: "collecting" as const,
      headSequence: 0,
      headHash: "0".repeat(64),
      eventCount: 0
    },
    commerce,
    paidAt: commerce.orders[0]!.paidAt!,
    websiteCheckpoint: websiteCheckpoint(),
    authorities: {
      site_snapshot_pages: slot("site_snapshot_pages"),
      page_summary_integrity: slot("page_summary_integrity"),
      artifact_combined_payload_integrity: slot("artifact_combined_payload_integrity"),
      site_read_manifest: slot("site_read_manifest"),
      ledger_authority: slot("ledger_authority"),
      prohibited_operation_guard_authority: slot("prohibited_operation_guard_authority"),
      zero_database_effect_counts: slot("zero_database_effect_counts")
    },
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const }
  };
}

function expectIncomplete(work: () => never): void {
  try {
    work();
    throw new Error("expected phase authority to remain incomplete");
  } catch (error) {
    expect(error).toBeInstanceOf(ReportV4AcceptanceAuthorityPhaseIncompleteError);
    expect(error).toMatchObject({ code: "phase_authority_incomplete" });
  }
}

function reseal(slot: { records: Record<string, unknown>[]; recordCount: number; canonicalHash: string }): void {
  slot.recordCount = slot.records.length;
  slot.canonicalHash = testHash(stable(slot.records));
}

function testHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
