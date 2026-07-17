import { beforeEach, describe, expect, it, vi } from "vitest";

const replacementGuardHarness = vi.hoisted(() => {
  const state = { blockedSite: null as string | null, guardSites: [] as string[], delegatedSites: [] as string[] };
  const blocked = new Error("blocked by replacement guard test");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});
const replacementDatabase = vi.hoisted(() => {
  const sql = vi.fn();
  const begin = vi.fn(async (delegate: (tx: typeof sql) => Promise<unknown>) => delegate(sql));
  Object.assign(sql, { begin });
  return { ensureDatabase: vi.fn(), getSqlClient: vi.fn(() => sql), sql, begin };
});

vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: replacementGuardHarness.run
}));
vi.mock("./index", () => ({
  ensureDatabase: replacementDatabase.ensureDatabase,
  getSqlClient: replacementDatabase.getSqlClient
}));

import { APPROVED_REPLACEMENT_TARGET, prepareApprovedReportReplacement, replacementProviderClaimRepairPhase, resumeApprovedReplacementModelRepair } from "./report-replacement-fulfillments";

beforeEach(() => {
  vi.clearAllMocks();
  replacementGuardHarness.state.blockedSite = null;
  replacementGuardHarness.state.guardSites.length = 0;
  replacementGuardHarness.state.delegatedSites.length = 0;
  replacementDatabase.ensureDatabase.mockResolvedValue(undefined);
  replacementDatabase.begin.mockImplementation(async (delegate: (tx: typeof replacementDatabase.sql) => Promise<unknown>) => delegate(replacementDatabase.sql));
});

describe("approved replacement fulfillment guard", () => {
  it("is bound to the one approved paid failure lineage", () => {
    expect(APPROVED_REPLACEMENT_TARGET).toEqual({
      orderId: "c631f80e-4f6e-44a4-b0de-42aee8559c51",
      reportId: "4b4e71b8-c130-4c83-8d4a-e3787ded7009",
      originalFailedJobId: "146da7a2-b28b-4925-af89-0a30c9af0c23",
      failedArtifactRevisionId: "0c41d018-65aa-42e9-84c3-9953af4b60c8",
      questionSetId: "business-question-set-ba934fe710d804f389bf16c240f3fa23c7127e64f7f50d368e17f02c888baa6e"
    });
  });

  it("fails closed before database access without confirmation or a safe authorization reference", async () => {
    await expect(prepareApprovedReportReplacement({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
    await expect(prepareApprovedReportReplacement({ confirm: true, authorizationRef: "x" })).rejects.toThrow("authorization reference");
    await expect(resumeApprovedReplacementModelRepair({ confirm: false, authorizationRef: "approval-2026-07-15" })).rejects.toThrow("--confirm");
  });

  it("reopens only the exact terminal replacement provider-claim checkpoint", () => {
    const eligible = { replacement_state: "running", execution_state: "failed", error_code: "lease_exhausted", current_phase: "terminalization", provider_discovery_phase: "provider_claim_extraction" };
    expect(replacementProviderClaimRepairPhase(eligible)).toBe("provider_claim_extraction");
    expect(replacementProviderClaimRepairPhase({ ...eligible, execution_state: "running" })).toBeNull();
    expect(replacementProviderClaimRepairPhase({ ...eligible, provider_discovery_phase: "candidate_verification" })).toBeNull();
    expect(replacementProviderClaimRepairPhase({ ...eligible, error_code: "artifact_unavailable" })).toBeNull();
  });

  it.each([
    ["replacement_prepare", () => prepareApprovedReportReplacement({ confirm: true, authorizationRef: "approval-2026-07-17" })],
    ["replacement_resume", () => resumeApprovedReplacementModelRepair({ confirm: true, authorizationRef: "approval-2026-07-17" })]
  ] as const)("blocks %s before database access", async (site, operation) => {
    replacementGuardHarness.state.blockedSite = site;

    await expect(operation()).rejects.toBe(replacementGuardHarness.blocked);

    expect(replacementGuardHarness.state.guardSites).toEqual([site]);
    expect(replacementGuardHarness.state.delegatedSites).toEqual([]);
    expect(replacementDatabase.ensureDatabase).not.toHaveBeenCalled();
    expect(replacementDatabase.getSqlClient).not.toHaveBeenCalled();
    expect(replacementDatabase.begin).not.toHaveBeenCalled();
    expect(replacementDatabase.sql).not.toHaveBeenCalled();
  });

  it.each([
    ["replacement_prepare", () => prepareApprovedReportReplacement({ confirm: true, authorizationRef: "approval-2026-07-17" })],
    ["replacement_resume", () => resumeApprovedReplacementModelRepair({ confirm: true, authorizationRef: "approval-2026-07-17" })]
  ] as const)("delegates %s once and preserves its transaction failure", async (site, operation) => {
    const failure = new Error(`${site} transaction failed`);
    replacementDatabase.sql.mockRejectedValueOnce(failure);

    await expect(operation()).rejects.toBe(failure);

    expect(replacementGuardHarness.state.guardSites).toEqual([site]);
    expect(replacementGuardHarness.state.delegatedSites).toEqual([site]);
    expect(replacementDatabase.ensureDatabase).toHaveBeenCalledTimes(1);
    expect(replacementDatabase.begin).toHaveBeenCalledTimes(1);
    expect(replacementDatabase.sql).toHaveBeenCalledTimes(1);
  });
});
