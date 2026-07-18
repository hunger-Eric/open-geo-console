import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES, REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH } from "@/report-v4/prohibited-operation-manifest";
import { createReportV4CommerceAuthoritySnapshotPair } from "../report-v4/report-v4-commerce-authority-comparator.test-fixture";
import { REPORT_V4_ZERO_DATABASE_FACT_NAMES } from "./report-v4-zero-database-effects-authority";
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

function completePayload(): ReportV4AcceptanceCompleteAuthorityPhasePayload {
  const commerce = createReportV4CommerceAuthoritySnapshotPair("question_failure").baseline;
  const scope = commerce.scope; const pageIdHash = h("page-1"); const summaryIdentityHash = h("summary-identity");
  const websiteSetHash = h(JSON.stringify([summaryIdentityHash]));
  const siteRecords = [{ scenarioIdHash: h(SCENARIO), reportIdHash: scope.reportIdHash, coreJobIdHash: scope.coreJobIdHash!,
    snapshotIdHash: scope.siteSnapshotIdHash!, snapshotStatus: "completed" as const, snapshotContentIdentityHash: h("snapshot-content"),
    collectorConfigIdentityHash: h("collector-config"), candidatePageCount: 1, selectedPageCount: 1, analyzablePageCount: 1,
    excludedPageCount: 0, jsDependentPageCount: 0, pageIdHash, ordinal: 1, locationIdentityHash: h("location"), analyzable: true,
    readMode: "direct_readable" as const, summaryHash: h("summary"), sourceLength: 10, contentHash: h("content"),
    exclusionReasonHash: null, pageIdentityHash: h("page-identity") }];
  const summaryRecords = [{ scenarioIdHash: h(SCENARIO), reportIdHash: scope.reportIdHash, coreJobIdHash: scope.coreJobIdHash!,
    snapshotIdHash: scope.siteSnapshotIdHash!, pageIdHash, ordinal: 1, readability: "direct_readable" as const, sourceLength: 10,
    contentHash: h("content"), chunksHash: h("chunks"), summaryPayloadHash: h("summary-payload"),
    summaryIdentityHash, websiteInputSetHash: websiteSetHash }];
  const siteSnapshotPages = slot(siteRecords); const pageSummaryIntegrity = slot(summaryRecords);
  const artifactBase = { phase: "baseline" as const, scenarioKind: "question_failure" as const,
    faultQuestionIdHash: h("question-3"), faultSourceIdHash: null, capturedAt: "2026-07-17T00:00:00.001Z",
    activeArtifactRevisionIdHash: scope.activeArtifactRevisionIdHash!, artifacts: [{ artifactRevisionIdHash: scope.coreArtifactRevisionIdHash!,
      reportIdHash: scope.reportIdHash, orderIdHash: scope.orderIdHash, jobIdHash: scope.coreJobIdHash!, configSnapshotIdHash: scope.configSnapshotIdHash!,
      questionSetIdHash: scope.questionSetIdHash!, sourceArtifactRevisionIdHash: null, revisionKind: "generation" as const,
      status: "active" as const, revision: 1, payloadIdentityHash: h("payload"), preservedContentHash: h("preserved"),
      questionContentHashes: [h("q1"), h("q2"), h("q3")] as const, diagnosisContentHashes: [null, null, null] as const }],
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const } };
  const artifact = { ...artifactBase, canonicalHash: h(stable({ phase: artifactBase.phase, scenarioKind: artifactBase.scenarioKind,
    faultQuestionIdHash: artifactBase.faultQuestionIdHash, faultSourceIdHash: artifactBase.faultSourceIdHash,
    activeArtifactRevisionIdHash: artifactBase.activeArtifactRevisionIdHash, artifacts: artifactBase.artifacts,
    transactionProfile: artifactBase.transactionProfile })) };
  const readIdentityHash = h("site-read-1");
  const readRecords = [{ identityHash: readIdentityHash, reportIdHash: scope.reportIdHash, jobIdHash: scope.preAdmissionJobIdHash!,
    scope: "admission_page" as const, purpose: "page" as const, urlHash: h("site-read-url"), mode: "raw" as const,
    attempt: 0 as const, pairBindingHash: h("site-read-pair"), ownerQuestionIdHash: null, ownerSourceIdHash: null,
    networkPerformed: true as const, terminalPhase: "completed" as const, semanticState: "terminal" as const,
    startedAt: "2026-07-16T23:59:10.000Z", terminalAt: "2026-07-16T23:59:11.000Z" }];
  const manifestBase = { contractVersion: "report-v4-acceptance-site-read-manifest-authority-v1" as const, phase: "baseline" as const,
    scenarioKind: "question_failure" as const, sessionIdHash: h(SESSION), scenarioIdHash: h(SCENARIO), reportIdHash: scope.reportIdHash,
    preAdmissionJobIdHash: scope.preAdmissionJobIdHash!, enhancementJobIdHash: null, records: readRecords,
    requiredIdentityHashes: [readIdentityHash], allowedIdentityHashes: [readIdentityHash] };
  const manifest = { ...manifestBase, authorityHash: h(`ogc:report-v4:acceptance-site-read-manifest:authority:v1\x1f${stableLocale(manifestBase)}`) };
  const ledgerSession = { sessionIdHash: h(SESSION), previewDeploymentIdHash: h("preview"), protectedAliasUrlHash: h("alias"),
    webGitSha: WORKER_SHA, workerGitSha: WORKER_SHA, state: "collecting" as const, headSequence: 0, headHash: ZERO,
    eventCount: 0, startedAt: "2026-07-16T23:59:00.000Z" };
  const ledgerScenario = { scenarioIdHash: h(SCENARIO), reportIdHash: scope.reportIdHash, orderIdHash: scope.orderIdHash,
    preAdmissionJobIdHash: scope.preAdmissionJobIdHash, coreJobIdHash: scope.coreJobIdHash, enhancementJobIdHash: null,
    siteSnapshotIdHash: scope.siteSnapshotIdHash, configSnapshotIdHash: scope.configSnapshotIdHash,
    questionSetIdHash: scope.questionSetIdHash, coreArtifactRevisionIdHash: scope.coreArtifactRevisionIdHash,
    enhancementArtifactRevisionIdHash: null, kind: "question_failure", faultKind: "question_failure",
    faultQuestionIdHash: h("question-3"), faultSourceIdHash: null, expectedFaultOccurrences: 2,
    baselineFingerprint: null, storedBaselineFingerprint: null, finalFingerprint: null, state: "collecting", createdAt: "2026-07-16T23:59:00.000Z" };
  const ledgerBase = { contractVersion: "report-v4-acceptance-ledger-authority-v1" as const, phase: "baseline" as const,
    session: ledgerSession, scenario: ledgerScenario, events: [] };
  const ledger = { ...ledgerBase, canonicalHash: h(`open-geo-console/report-v4/acceptance-ledger-authority/v1\x1f${stableLocale(ledgerBase)}`) };
  const counters = [...REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES].sort((a, b) => a.guardSite.localeCompare(b.guardSite))
    .map((entry) => ({ operation: entry.operation, guardSite: entry.guardSite, attemptCount: 0 as const,
      seededAt: "2026-07-16T23:59:30.000Z", attemptedAt: null, matchingEventFingerprint: null }));
  const guardBase = { contractVersion: "report-v4-prohibited-operation-guard-authority-v1" as const, phase: "baseline" as const,
    run: { runId: h("guard-run"), sessionIdHash: h(SESSION), scenarioIdHash: h(SCENARIO), jobIdHash: scope.coreJobIdHash!,
      workerGitSha: WORKER_SHA, manifestHash: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH, state: "armed" as const,
      armedAt: "2026-07-16T23:59:30.000Z", completedAt: null }, counters };
  const guard = { ...guardBase, canonicalHash: h(`open-geo-console/report-v4/prohibited-operation-guard-authority/v1\x1f${stableLocale(guardBase)}`) };
  const commerceCollections = { paymentEventIds: commerce.paymentEvents, accessKeyIds: commerce.creditAuthority.accessKeys,
    creditLedgerIds: commerce.creditAuthority.creditLedger, refundIds: commerce.creditAuthority.refunds,
    emailDeliveryIds: commerce.emailAuthority.deliveries, emailEventIds: commerce.emailAuthority.events, accessTokenIds: commerce.accessTokens };
  const allowedCommerceTopology = Object.fromEntries(Object.entries(commerceCollections).map(([name, rows]) => [name,
    { count: rows.length, idSetHash: h(`raw-${name}`), authorityRowsHash: h(stableZero(rows)) }])) as never;
  const zeroBase = { contractVersion: "report-v4-zero-database-effects-authority-v1" as const, phase: "baseline" as const,
    scenarioKind: "question_failure" as const, capturedAt: "2026-07-17T00:00:00.002Z", paidAt: commerce.orders[0]!.paidAt!,
    lineage: { sessionIdHash: h(SESSION), scenarioIdHash: h(SCENARIO), reportIdHash: scope.reportIdHash, orderIdHash: scope.orderIdHash,
      preAdmissionJobIdHash: scope.preAdmissionJobIdHash!, coreJobIdHash: scope.coreJobIdHash!, enhancementJobIdHash: null,
      jobIdSetHash: h("jobs"), coreArtifactRevisionIdHash: scope.coreArtifactRevisionIdHash!, enhancementArtifactRevisionIdHash: null,
      artifactRevisionIdSetHash: h("artifacts"), siteSnapshotIdSetHash: h("snapshots"), configSnapshotIdHash: scope.configSnapshotIdHash!,
      questionSetIdHash: scope.questionSetIdHash!, activeArtifactRevisionIdHash: scope.activeArtifactRevisionIdHash! },
    allowedCommerceTopology, facts: REPORT_V4_ZERO_DATABASE_FACT_NAMES.map((name) => ({ name, count: 0 as const,
      scope: "exact_report_order_job_lineage" as const })), semanticZeroProjection: { databaseSupported: { replacementFulfillmentCount: 0 as const,
      correctionFulfillmentCount: 0 as const, fullRerunCount: 0 as const, extraSnapshotCountAfterPayment: 0 as const },
      runtimeOnly: { pdfInvocationCount: "unavailable" as const } }, unavailableRuntimeFacts: [{ name: "pdf_invocation_count" as const,
      availability: "runtime_only" as const, reason: "no_attempt_authority_in_postgresql" as const }] as const,
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const } };
  const zeroCanonical = { ...zeroBase } as Partial<typeof zeroBase>;
  delete zeroCanonical.capturedAt;
  const zero = { ...zeroBase, canonicalHash: h(stableZero(zeroCanonical)) };
  return { contractVersion: "report-v4-acceptance-authority-phase-v1", phase: "baseline", capturedAt: commerce.capturedAt,
    scenarioKind: "question_failure", session: { sessionIdHash: h(SESSION), scenarioIdHash: h(SCENARIO), sessionState: "collecting",
      scenarioState: "collecting", headSequence: 0, headHash: ZERO, eventCount: 0 }, commerce, paidAt: commerce.orders[0]!.paidAt!,
    websiteCheckpoint: websiteCheckpoint(websiteSetHash), authorities: { site_snapshot_pages: siteSnapshotPages,
      page_summary_integrity: pageSummaryIntegrity, artifact_combined_payload_integrity: artifact, site_read_manifest: manifest,
      ledger_authority: ledger, prohibited_operation_guard_authority: guard, zero_database_effect_counts: zero },
    transactionProfile: { isolation: "repeatable read", readOnly: true } };
}

function websiteCheckpoint(setHash: string) { return { state: "completed" as const, providerCallCount: 1 as const,
  correctionCount: 0 as const, pageSummaryCount: 1, identityHash: h("website-checkpoint"), inputIdentityHash: h("website-input"),
  pageSummaryIdentitySetHash: setHash, outputHash: h("website-output") }; }
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
function slot<T extends object>(records: T[]) { return { records, recordCount: records.length, canonicalHash: h(stable(records)) }; }
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
function reseal(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload, name: keyof ReportV4AcceptanceCompleteAuthorityPhasePayload["authorities"]) {
  const authority = payload.authorities[name] as unknown as Record<string, unknown>;
  if (name === "site_snapshot_pages" || name === "page_summary_integrity") authority.canonicalHash = h(stable(authority.records));
  else if (name === "artifact_combined_payload_integrity") authority.canonicalHash = h(stable({ phase: authority.phase, scenarioKind: authority.scenarioKind,
    faultQuestionIdHash: authority.faultQuestionIdHash, faultSourceIdHash: authority.faultSourceIdHash,
    activeArtifactRevisionIdHash: authority.activeArtifactRevisionIdHash, artifacts: authority.artifacts, transactionProfile: authority.transactionProfile }));
  else if (name === "site_read_manifest") { const copy = { ...authority }; delete copy.authorityHash; authority.authorityHash = h(`ogc:report-v4:acceptance-site-read-manifest:authority:v1\x1f${stableLocale(copy)}`); }
  else if (name === "ledger_authority") { const copy = { ...authority }; delete copy.canonicalHash; authority.canonicalHash = h(`open-geo-console/report-v4/acceptance-ledger-authority/v1\x1f${stableLocale(copy)}`); }
  else if (name === "prohibited_operation_guard_authority") { const copy = { ...authority }; delete copy.canonicalHash; authority.canonicalHash = h(`open-geo-console/report-v4/prohibited-operation-guard-authority/v1\x1f${stableLocale(copy)}`); }
  else { const copy = { ...authority }; delete copy.canonicalHash; delete copy.capturedAt; authority.canonicalHash = h(stableZero(copy)); }
}
function h(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string { if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; throw new Error("unsupported"); }
function stableLocale(value: unknown): string { if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableLocale).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableLocale(child)}`).join(",")}}`; throw new Error("unsupported"); }
function stableZero(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableZero).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableZero(child)}`).join(",")}}`; throw new Error("unsupported"); }
