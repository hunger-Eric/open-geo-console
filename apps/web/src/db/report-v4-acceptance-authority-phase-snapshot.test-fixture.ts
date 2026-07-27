import { createHash } from "node:crypto";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES, REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH } from "@/report-v4/prohibited-operation-manifest";
import { createReportV4CommerceAuthoritySnapshotPair } from "../report-v4/report-v4-commerce-authority-comparator.test-fixture";
import { REPORT_V4_ZERO_DATABASE_FACT_NAMES } from "./report-v4-zero-database-effects-authority";
import type { ReportV4AcceptanceCompleteAuthorityPhasePayload } from "./report-v4-acceptance-authority-phase-snapshot";

export const REPORT_V4_ACCEPTANCE_FIXTURE_SESSION = "11111111-1111-4111-8111-111111111111";
export const REPORT_V4_ACCEPTANCE_FIXTURE_SCENARIO = "22222222-2222-4222-8222-222222222222";
const SESSION = REPORT_V4_ACCEPTANCE_FIXTURE_SESSION;
const SCENARIO = REPORT_V4_ACCEPTANCE_FIXTURE_SCENARIO;
const WORKER_SHA = "a".repeat(40);
const ZERO = "0".repeat(64);

export function completePayload(): ReportV4AcceptanceCompleteAuthorityPhasePayload {
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

export function websiteCheckpoint(setHash: string) { return { state: "completed" as const, providerCallCount: 1 as const,
  correctionCount: 0 as const, pageSummaryCount: 1, identityHash: h("website-checkpoint"), inputIdentityHash: h("website-input"),
  pageSummaryIdentitySetHash: setHash, outputHash: h("website-output") }; }

function slot<T extends object>(records: T[]) { return { records, recordCount: records.length, canonicalHash: h(stable(records)) }; }

export function reseal(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload, name: keyof ReportV4AcceptanceCompleteAuthorityPhasePayload["authorities"]) {
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
export function h(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function stable(value: unknown): string { if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; throw new Error("unsupported"); }
export function stableLocale(value: unknown): string { if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableLocale).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableLocale(child)}`).join(",")}}`; throw new Error("unsupported"); }
export function stableZero(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableZero).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableZero(child)}`).join(",")}}`; throw new Error("unsupported"); }
