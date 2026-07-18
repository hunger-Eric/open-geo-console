import { describe, expect, it, vi } from "vitest";
import { completePayload, h, reseal, stable, stableZero, websiteCheckpoint } from "./report-v4-acceptance-authority-phase-snapshot.test-fixture";
import { createReportV4CommerceAuthoritySnapshotPair } from "../report-v4/report-v4-commerce-authority-comparator.test-fixture";
import {
  REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS,
  assertReportV4AcceptanceAuthorityCaptureOrder,
  assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  assertReportV4AcceptanceWebsiteCheckpointV38Authority,
  assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly,
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  persistReportV4AcceptanceAuthorityPhaseSnapshot,
  projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly,
  type ReportV4AcceptanceCompleteAuthorityPhasePayload
} from "./report-v4-acceptance-authority-phase-snapshot";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const WORKER_SHA = "a".repeat(40);
const ZERO = "0".repeat(64);

describe("Report V4 complete acceptance authority phase snapshot", () => {
  it("composes all seven DB slots in one RR/RO transaction, in order, with the trusted commerce object", async () => {
    const fixture = completePayload();
    const calls: string[] = [];
    const tx = phaseTx(fixture, calls);
    const sql = { begin: vi.fn(async (_options: string, work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
    const result = await assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly(sql as never, {
      sessionId: SESSION, scenarioId: SCENARIO, phase: "baseline"
    }, {
      loadCommerceInTransaction: async (actualTx) => { expect(actualTx).toBe(tx); calls.push("commerce"); return fixture.commerce; },
      loadWebsiteCheckpointV38InTransaction: async (actualTx) => { expect(actualTx).toBe(tx); calls.push("v38"); return fixture.websiteCheckpoint; },
      loadSitePageInTransaction: async (actualTx) => { expect(actualTx).toBe(tx); calls.push("site-page"); return {
        siteSnapshotPages: fixture.authorities.site_snapshot_pages,
        pageSummaryIntegrity: fixture.authorities.page_summary_integrity,
        websiteInputSetHash: fixture.websiteCheckpoint.pageSummaryIdentitySetHash
      }; },
      loadSiteReadInTransaction: async (actualTx, input) => { expect(actualTx).toBe(tx); calls.push("site-read");
        expect(input).toMatchObject({ reportId: "report-1", preAdmissionJobId: "pre-job-1", enhancementJobId: null });
        return fixture.authorities.site_read_manifest; },
      loadArtifactInTransaction: async (actualTx) => { expect(actualTx).toBe(tx); calls.push("artifact"); return fixture.authorities.artifact_combined_payload_integrity; },
      loadLedgerGuardInTransaction: async (actualTx) => { expect(actualTx).toBe(tx); calls.push("ledger-guard"); return {
        ledgerAuthority: fixture.authorities.ledger_authority,
        prohibitedOperationGuardAuthority: fixture.authorities.prohibited_operation_guard_authority
      }; },
      loadZeroEffectsInTransaction: async (actualTx, _input, commerce) => { expect(actualTx).toBe(tx); expect(commerce).toBe(fixture.commerce);
        calls.push("zero"); return fixture.authorities.zero_database_effect_counts; }
    });
    expect(sql.begin).toHaveBeenCalledOnce();
    expect(sql.begin).toHaveBeenCalledWith("isolation level repeatable read read only", expect.any(Function));
    expect(calls).toEqual(["foundation-isolation", "foundation-metadata", "commerce", "v38", "composition-binding",
      "site-page", "site-read", "artifact", "ledger-guard", "zero"]);
    expect(result).toEqual(fixture);
    expect(Object.keys(result.authorities).sort()).toEqual([
      "artifact_combined_payload_integrity", "ledger_authority", "page_summary_integrity",
      "prohibited_operation_guard_authority", "site_read_manifest", "site_snapshot_pages", "zero_database_effect_counts"
    ]);
  });

  it("fails without V38 or whenever any in-transaction authority throws, returning no partial payload", async () => {
    const fixture = completePayload();
    const tx = phaseTx(fixture, []);
    const sql = { begin: async (_options: string, work: (value: typeof tx) => Promise<unknown>) => work(tx) };
    const base = dependencies(fixture);
    await expect(assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly(sql as never, identity(), {
      ...base, loadWebsiteCheckpointV38InTransaction: async () => null
    })).rejects.toThrow(/requires the exact V38/i);
    await expect(assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly(sql as never, identity(), {
      ...base, loadArtifactInTransaction: async () => { throw new Error("artifact unavailable"); }
    })).rejects.toThrow("artifact unavailable");
  });

  it("accepts a real-shape complete payload with different slot-local capture times and keeps runtime facts outside", () => {
    const payload = completePayload();
    const creditRows = payload.commerce.creditAuthority.creditLedger;
    expect(h(stable(creditRows))).not.toBe(h(stableZero(creditRows)));
    expect(payload.authorities.zero_database_effect_counts.allowedCommerceTopology.creditLedgerIds.authorityRowsHash)
      .toBe(h(stableZero(creditRows)));
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).not.toThrow();
    expect(payload.authorities.artifact_combined_payload_integrity.capturedAt).not.toBe(payload.capturedAt);
    expect(payload.authorities.zero_database_effect_counts.capturedAt).not.toBe(payload.capturedAt);
    expect(JSON.stringify(payload)).not.toContain("oversized_token_probe");
    expect(REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS).toEqual([
      "oversized_token_probe", "physical_provider_call_counts", "pdf_invocation_count"
    ]);
  });

  it.each([
    "site_snapshot_pages", "page_summary_integrity", "artifact_combined_payload_integrity", "site_read_manifest",
    "ledger_authority", "prohibited_operation_guard_authority", "zero_database_effect_counts"
  ] as const)("rejects tampered and resealed %s authority", (name) => {
    const payload = structuredClone(completePayload());
    if (name === "site_snapshot_pages") payload.authorities[name].records[0]!.reportIdHash = h("drift");
    else if (name === "page_summary_integrity") payload.authorities[name].records[0]!.coreJobIdHash = h("drift");
    else if (name === "artifact_combined_payload_integrity") payload.authorities[name].artifacts[0]!.questionSetIdHash = h("drift");
    else if (name === "site_read_manifest") payload.authorities[name].reportIdHash = h("drift");
    else if (name === "ledger_authority") (payload.authorities[name].scenario as Record<string, unknown>).orderIdHash = h("drift");
    else if (name === "prohibited_operation_guard_authority") payload.authorities[name].run.jobIdHash = h("drift");
    else payload.authorities[name].lineage.configSnapshotIdHash = h("drift");
    reseal(payload, name);
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).toThrow(/lineage|mismatch|differs/i);
  });

  it("rejects runtime slots, raw sensitive keys, malformed hashes, and missing/extra slots", () => {
    const runtime = structuredClone(completePayload()) as unknown as { authorities: Record<string, unknown> };
    runtime.authorities.pdf_invocation_count = 0;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(runtime)).toThrow(/fields.*incomplete|non-canonical/i);
    const sensitive = structuredClone(completePayload()) as unknown as { authorities: { site_read_manifest: Record<string, unknown> } };
    sensitive.authorities.site_read_manifest.apiKey = "raw";
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(sensitive)).toThrow(/fields.*incomplete|non-canonical/i);
    const hashDrift = structuredClone(completePayload());
    hashDrift.authorities.ledger_authority.events = [{ eventHash: "raw-url" }] as never;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(hashDrift)).toThrow();
    const missing = structuredClone(completePayload()) as unknown as { authorities: Record<string, unknown> };
    delete missing.authorities.ledger_authority;
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(missing)).toThrow(/incomplete|non-canonical/i);
  });

  it("rejects a resealed page-summary snapshot lineage drift", () => {
    const payload = structuredClone(completePayload());
    payload.authorities.page_summary_integrity.records[0]!.snapshotIdHash = h("other-snapshot");
    reseal(payload, "page_summary_integrity");
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).toThrow(/site\/page exact set|snapshot/i);
  });

  it("rejects a resealed site-read record with the wrong scoped job", () => {
    const payload = structuredClone(completePayload());
    payload.authorities.site_read_manifest.records[0]!.jobIdHash = h("wrong-job");
    reseal(payload, "site_read_manifest");
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload)).toThrow(/site-read record job lineage/i);
  });

  it("validates V38 exact fields and capture order", () => {
    const checkpoint = websiteCheckpoint(h("website-set"));
    expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority(checkpoint)).not.toThrow();
    expect(() => assertReportV4AcceptanceWebsiteCheckpointV38Authority({ ...checkpoint, rawUrl: "https://secret" })).toThrow(/non-canonical/i);
    const baseline = completePayload();
    const final = structuredClone(baseline); final.phase = "final"; final.capturedAt = "2026-07-17T00:00:01.000Z";
    final.commerce = createReportV4CommerceAuthoritySnapshotPair("question_failure").final;
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(baseline, final)).not.toThrow();
    expect(() => assertReportV4AcceptanceAuthorityCaptureOrder(baseline, { ...final, capturedAt: baseline.capturedAt })).toThrow(/strictly precede/i);
  });

  it("parses V38 synthesis output and rejects a stored output-hash tamper", () => {
    const row = v38Row();
    expect(projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly(row)).toMatchObject({
      state: "completed", providerCallCount: 1, correctionCount: 0, outputHash: row.output_hash
    });
    expect(() => projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly({
      ...row, output_hash: h("tampered-output")
    })).toThrow(/output hash.*parsed canonical synthesis output/i);
    expect(() => projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly({
      ...row, output_payload: { ...row.output_payload, prompt: "forbidden" }
    })).toThrow(/prompt|unknown/i);
  });

  it("never issues test-only or reconstructed payloads for persistence", async () => {
    const payload = await assembledPayload();
    const neverBegin = vi.fn();
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot({ begin: neverBegin } as never,
      persistenceInput(payload))).rejects.toThrow(/exact payload object issued/i);
    const reconstructed = structuredClone(payload);
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot({ begin: neverBegin } as never,
      persistenceInput(reconstructed))).rejects.toThrow(/exact payload object issued/i);
    expect(neverBegin).not.toHaveBeenCalled();
  });

  it("validates before writes and supports restart-safe load-existing instead of serialized resubmission", async () => {
    const payload = await assembledPayload();
    const invalid = structuredClone(payload) as unknown as Record<string, unknown>; delete invalid.websiteCheckpoint;
    const neverBegin = vi.fn();
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot({ begin: neverBegin } as never,
      { ...persistenceInput(payload), payload: invalid })).rejects.toThrow(/incomplete|non-canonical/i);
    expect(neverBegin).not.toHaveBeenCalled();
    const loaded = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(
      { unsafe: async () => [persistedRow(payload)] } as never, identity());
    expect(loaded).toMatchObject({ payloadHash: h(stable(payload)), workerGitSha: WORKER_SHA });
    await expect(loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(
      { unsafe: async () => [] } as never, identity())).resolves.toBeNull();
    const driftRow = persistedRow(payload); driftRow.payload_hash = h("drift");
    await expect(loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction({ unsafe: async () => [driftRow] } as never,
      identity())).rejects.toThrow(/hash.*invalid/i);
  });
});

function v38Row() {
  const identity = { reportId: "report-1", orderId: "order-1", coreJobId: "core-job-1", configSnapshotId: "config-1",
    siteSnapshotId: "snapshot-1", operationId: "website-synthesis", profileId: "profile-1",
    inputIdentityHash: h("v38-input"), pageSummaryIdentitySetHash: h("v38-pages"), pageSummaryCount: 1 };
  const outputPayload = { summary: "The target site presents a coherent service offer for business buyers.",
    strengths: ["The service scope is stated clearly."], gaps: ["Regional delivery evidence is limited."],
    actions: ["Add current region-specific delivery examples."] };
  return { identity_hash: h(stable(identity)), report_id: identity.reportId, order_id: identity.orderId,
    core_job_id: identity.coreJobId, config_snapshot_id: identity.configSnapshotId, site_snapshot_id: identity.siteSnapshotId,
    operation_id: identity.operationId, profile_id: identity.profileId, input_identity_hash: identity.inputIdentityHash,
    page_summary_identity_set_hash: identity.pageSummaryIdentitySetHash, page_summary_count: identity.pageSummaryCount,
    state: "completed", provider_call_count: 1, correction_count: 0, output_payload: outputPayload,
    output_hash: h(JSON.stringify(outputPayload)), scenario_report_id: identity.reportId, scenario_order_id: identity.orderId,
    scenario_core_job_id: identity.coreJobId, scenario_config_snapshot_id: identity.configSnapshotId,
    scenario_site_snapshot_id: identity.siteSnapshotId };
}
function identity() { return { sessionId: SESSION, scenarioId: SCENARIO, phase: "baseline" as const }; }
function persistenceInput(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload) { return { ...identity(), workerGitSha: WORKER_SHA, payload }; }
function dependencies(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload) { return {
  loadCommerceInTransaction: async () => payload.commerce, loadWebsiteCheckpointV38InTransaction: async () => payload.websiteCheckpoint,
  loadSitePageInTransaction: async () => ({ siteSnapshotPages: payload.authorities.site_snapshot_pages,
    pageSummaryIntegrity: payload.authorities.page_summary_integrity, websiteInputSetHash: payload.websiteCheckpoint.pageSummaryIdentitySetHash }),
  loadSiteReadInTransaction: async () => payload.authorities.site_read_manifest,
  loadArtifactInTransaction: async () => payload.authorities.artifact_combined_payload_integrity,
  loadLedgerGuardInTransaction: async () => ({ ledgerAuthority: payload.authorities.ledger_authority,
    prohibitedOperationGuardAuthority: payload.authorities.prohibited_operation_guard_authority }),
  loadZeroEffectsInTransaction: async () => payload.authorities.zero_database_effect_counts
}; }
async function assembledPayload(): Promise<ReportV4AcceptanceCompleteAuthorityPhasePayload> {
  const fixture = completePayload(); const tx = phaseTx(fixture, []);
  const sql = { begin: async (_options: string, work: (value: typeof tx) => Promise<ReportV4AcceptanceCompleteAuthorityPhasePayload>) => work(tx) };
  return assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly(sql as never, identity(), dependencies(fixture));
}
function phaseTx(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload, calls: string[]) { return { unsafe: async (query: string) => {
  if (query.includes("phase-authority:isolation")) { calls.push("foundation-isolation"); return [{ transaction_isolation: "repeatable read", transaction_read_only: "on", captured_at: payload.capturedAt }]; }
  if (query.includes("phase-authority:session-scenario")) { calls.push("foundation-metadata"); return [{ session_id: SESSION, scenario_id: SCENARIO,
    session_state: "collecting", scenario_state: "collecting", scenario_kind: "question_failure", head_sequence: 0, head_hash: ZERO, event_count: 0 }]; }
  if (query.includes("phase-authority:composition-binding")) { calls.push("composition-binding"); return [{ report_id: "report-1", pre_admission_job_id: "pre-job-1", enhancement_job_id: null }]; }
  throw new Error(`unexpected query ${query}`);
} }; }
function persistedRow(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload) { return { session_id: SESSION, scenario_id: SCENARIO,
  phase: payload.phase, captured_at: payload.capturedAt, payload, payload_hash: h(stable(payload)),
  commerce_fingerprint: payload.commerce.fingerprint, worker_git_sha: WORKER_SHA }; }
