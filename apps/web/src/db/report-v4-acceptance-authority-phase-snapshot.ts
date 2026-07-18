import { createHash } from "node:crypto";
import { parseReportV4WebsiteSynthesisOutput } from "@open-geo-console/ai-report-engine";
import { fingerprintNormalizedReportV4CommerceAuthority } from "../report-v4/report-v4-commerce-authority-fingerprint";
import {
  loadReportV4CommerceAuthoritySnapshotInTransaction,
  type LoadReportV4CommerceAuthoritySnapshotInput,
  type ReportV4CommerceAuthoritySnapshot,
  type ReportV4CommerceAuthoritySnapshotSql,
  type ReportV4CommerceAuthoritySnapshotTransactionSql
} from "./report-v4-commerce-authority-snapshot";
import { loadReportV4SitePageAuthorityInTransaction, type ReportV4AuthoritySlot,
  type ReportV4SiteSnapshotPageAuthorityRecord, type ReportV4PageSummaryIntegrityAuthorityRecord } from "./report-v4-site-page-authority";
import { loadReportV4ArtifactAuthorityInTransaction, type ReportV4ArtifactAuthority } from "./report-v4-artifact-authority";
import { loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction,
  type ReportV4AcceptanceSiteReadManifestAuthority } from "./report-v4-site-read-manifest";
import { loadReportV4AcceptanceLedgerGuardAuthorityInTransaction,
  type ReportV4AcceptanceLedgerAuthority, type ReportV4ProhibitedOperationGuardAuthorityRecord } from "./report-v4-acceptance-ledger-guard-authority";
import { loadReportV4ZeroDatabaseEffectsAuthorityInTransaction,
  REPORT_V4_ZERO_DATABASE_FACT_NAMES, type ReportV4ZeroDatabaseEffectsAuthority } from "./report-v4-zero-database-effects-authority";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES, REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH } from "@/report-v4/prohibited-operation-manifest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const COMPLETE_PHASE_CONTRACT = "report-v4-acceptance-authority-phase-v1" as const;
const COMPLETE_AUTHORITY_SLOT_NAMES = [
  "site_snapshot_pages",
  "page_summary_integrity",
  "artifact_combined_payload_integrity",
  "site_read_manifest",
  "ledger_authority",
  "prohibited_operation_guard_authority",
  "zero_database_effect_counts"
] as const;
const ISSUED_COMPLETE_PHASE_PAYLOADS = new WeakMap<object, string>();

/** Runtime-observed evidence is intentionally outside the database phase projection. */
export const REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS = Object.freeze([
  "oversized_token_probe",
  "physical_provider_call_counts",
  "pdf_invocation_count"
] as const);

export interface ReportV4AcceptanceWebsiteCheckpointV38Authority {
  readonly state: "completed";
  readonly providerCallCount: 1;
  readonly correctionCount: 0;
  readonly pageSummaryCount: number;
  readonly identityHash: string;
  readonly inputIdentityHash: string;
  readonly pageSummaryIdentitySetHash: string;
  readonly outputHash: string;
}

export interface ReportV4AcceptanceAuthorityPhaseFoundation {
  readonly phase: "baseline" | "final";
  readonly capturedAt: string;
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly session: Readonly<{
    sessionIdHash: string;
    scenarioIdHash: string;
    sessionState: "collecting" | "sealed" | "failed";
    scenarioState: "collecting" | "sealed" | "failed";
    headSequence: number;
    headHash: string;
    eventCount: number;
  }>;
  readonly commerce: ReportV4CommerceAuthoritySnapshot;
  readonly paidAt: string;
  readonly websiteCheckpoint: ReportV4AcceptanceWebsiteCheckpointV38Authority | null;
  readonly foundationHash: string;
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
}

export interface ReportV4AcceptanceCompleteAuthorityPhasePayload {
  readonly contractVersion: typeof COMPLETE_PHASE_CONTRACT;
  readonly phase: "baseline" | "final";
  readonly capturedAt: string;
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly session: ReportV4AcceptanceAuthorityPhaseFoundation["session"];
  readonly commerce: ReportV4CommerceAuthoritySnapshot;
  readonly paidAt: string;
  readonly websiteCheckpoint: ReportV4AcceptanceWebsiteCheckpointV38Authority;
  readonly authorities: Readonly<{
    site_snapshot_pages: ReportV4AuthoritySlot<ReportV4SiteSnapshotPageAuthorityRecord>;
    page_summary_integrity: ReportV4AuthoritySlot<ReportV4PageSummaryIntegrityAuthorityRecord>;
    artifact_combined_payload_integrity: ReportV4ArtifactAuthority;
    site_read_manifest: ReportV4AcceptanceSiteReadManifestAuthority;
    ledger_authority: ReportV4AcceptanceLedgerAuthority;
    prohibited_operation_guard_authority: ReportV4ProhibitedOperationGuardAuthorityRecord;
    zero_database_effect_counts: ReportV4ZeroDatabaseEffectsAuthority;
  }>;
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
}

export interface PersistedReportV4AcceptanceAuthorityPhaseSnapshot {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
  readonly capturedAt: string;
  readonly payload: ReportV4AcceptanceCompleteAuthorityPhasePayload;
  readonly payloadHash: string;
  readonly commerceFingerprint: string;
  readonly workerGitSha: string;
}

export interface PersistReportV4AcceptanceAuthorityPhaseSnapshotInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
  readonly workerGitSha: string;
  readonly payload: unknown;
}

export interface ReportV4AcceptanceAuthorityPhaseSnapshotTestOnlyDependencies {
  /** Same-transaction adapter for projecting and validating the V38 checkpoint authority. */
  readonly loadWebsiteCheckpointV38InTransaction?: (
    tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
    input: LoadReportV4CommerceAuthoritySnapshotInput
  ) => Promise<ReportV4AcceptanceWebsiteCheckpointV38Authority | null>;
  readonly loadCommerceInTransaction?: typeof loadReportV4CommerceAuthoritySnapshotInTransaction;
  readonly loadSitePageInTransaction?: typeof loadReportV4SitePageAuthorityInTransaction;
  readonly loadSiteReadInTransaction?: typeof loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction;
  readonly loadArtifactInTransaction?: typeof loadReportV4ArtifactAuthorityInTransaction;
  readonly loadLedgerGuardInTransaction?: typeof loadReportV4AcceptanceLedgerGuardAuthorityInTransaction;
  readonly loadZeroEffectsInTransaction?: typeof loadReportV4ZeroDatabaseEffectsAuthorityInTransaction;
}

export async function loadReportV4AcceptanceAuthorityPhaseSnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput
): Promise<ReportV4AcceptanceCompleteAuthorityPhasePayload> {
  const payload = await assembleReportV4AcceptanceAuthorityPhaseSnapshot(sql, input, {
    loadCommerceInTransaction: loadReportV4CommerceAuthoritySnapshotInTransaction,
    loadWebsiteCheckpointV38InTransaction: loadWebsiteCheckpointV38AuthorityInTransaction,
    loadSitePageInTransaction: loadReportV4SitePageAuthorityInTransaction,
    loadSiteReadInTransaction: loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction,
    loadArtifactInTransaction: loadReportV4ArtifactAuthorityInTransaction,
    loadLedgerGuardInTransaction: loadReportV4AcceptanceLedgerGuardAuthorityInTransaction,
    loadZeroEffectsInTransaction: loadReportV4ZeroDatabaseEffectsAuthorityInTransaction
  });
  ISSUED_COMPLETE_PHASE_PAYLOADS.set(payload, digest(stableJson(payload)));
  return payload;
}

/** Test-only composition seam. It validates fake authority outputs but never issues a persistable payload. */
export async function assembleReportV4AcceptanceAuthorityPhaseSnapshotForTestOnly(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
  dependencies: ReportV4AcceptanceAuthorityPhaseSnapshotTestOnlyDependencies
): Promise<ReportV4AcceptanceCompleteAuthorityPhasePayload> {
  return assembleReportV4AcceptanceAuthorityPhaseSnapshot(sql, input, dependencies);
}

async function assembleReportV4AcceptanceAuthorityPhaseSnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
  dependencies: ReportV4AcceptanceAuthorityPhaseSnapshotTestOnlyDependencies
): Promise<ReportV4AcceptanceCompleteAuthorityPhasePayload> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const foundation = await loadFoundationInTransaction(tx, parsed, dependencies);
    const binding = exactlyOne(await tx.unsafe(`/* phase-authority:composition-binding */
      SELECT report_id,pre_admission_job_id,enhancement_job_id
      FROM report_v4_acceptance_scenarios WHERE session_id=$1 AND id=$2`,
    [parsed.sessionId, parsed.scenarioId]), "composition binding");
    const reportId = text(binding.report_id, "report_id");
    const preAdmissionJobId = text(binding.pre_admission_job_id, "pre_admission_job_id");
    const enhancementJobId = binding.enhancement_job_id === null ? null : text(binding.enhancement_job_id, "enhancement_job_id");
    if (foundation.websiteCheckpoint === null) throw new Error("Complete authority phase requires the exact V38 website checkpoint authority.");
    const sitePage = await (dependencies.loadSitePageInTransaction ?? loadReportV4SitePageAuthorityInTransaction)(tx, parsed);
    const siteReadManifest = await (dependencies.loadSiteReadInTransaction ?? loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction)(tx, {
      ...parsed, scenarioKind: foundation.scenarioKind, reportId, preAdmissionJobId, enhancementJobId
    });
    const artifact = await (dependencies.loadArtifactInTransaction ?? loadReportV4ArtifactAuthorityInTransaction)(tx, parsed);
    const ledgerGuard = await (dependencies.loadLedgerGuardInTransaction ?? loadReportV4AcceptanceLedgerGuardAuthorityInTransaction)(tx, parsed);
    const zeroEffects = await (dependencies.loadZeroEffectsInTransaction ?? loadReportV4ZeroDatabaseEffectsAuthorityInTransaction)(tx, parsed, foundation.commerce);
    const payload: ReportV4AcceptanceCompleteAuthorityPhasePayload = Object.freeze({
      contractVersion: COMPLETE_PHASE_CONTRACT,
      phase: foundation.phase,
      capturedAt: foundation.capturedAt,
      scenarioKind: foundation.scenarioKind,
      session: foundation.session,
      commerce: foundation.commerce,
      paidAt: foundation.paidAt,
      websiteCheckpoint: foundation.websiteCheckpoint,
      authorities: Object.freeze({
        site_snapshot_pages: sitePage.siteSnapshotPages,
        page_summary_integrity: sitePage.pageSummaryIntegrity,
        artifact_combined_payload_integrity: artifact,
        site_read_manifest: siteReadManifest,
        ledger_authority: ledgerGuard.ledgerAuthority,
        prohibited_operation_guard_authority: ledgerGuard.prohibitedOperationGuardAuthority,
        zero_database_effect_counts: zeroEffects
      }),
      transactionProfile: foundation.transactionProfile
    });
    assertReportV4AcceptanceCompleteAuthorityPhasePayload(payload);
    return payload;
  });
}

export async function persistReportV4AcceptanceAuthorityPhaseSnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: PersistReportV4AcceptanceAuthorityPhaseSnapshotInput
): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot> {
  const raw = exactRecord(input, ["payload", "phase", "scenarioId", "sessionId", "workerGitSha"], "phase persistence input");
  const identity = parsePhaseIdentity(raw as unknown as Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">);
  if (typeof raw.workerGitSha !== "string" || !GIT_SHA.test(raw.workerGitSha)) {
    throw new Error("workerGitSha must be a lowercase full Git SHA.");
  }
  const workerGitSha = raw.workerGitSha;
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(raw.payload);
  const payload = raw.payload;
  if (ISSUED_COMPLETE_PHASE_PAYLOADS.get(payload) !== digest(stableJson(payload))) {
    throw new Error("Report V4 authority phase persistence requires the exact payload object issued by the complete RR/RO loader.");
  }
  assertPayloadIdentity(payload, identity);
  const payloadHash = digest(stableJson(payload));
  const commerceFingerprint = payload.commerce.fingerprint;
  return sql.begin("read write", async (tx) => {
    await assertLivePersistenceAuthority(tx, identity, payload, workerGitSha);
    const inserted = await tx.unsafe(`INSERT INTO report_v4_acceptance_authority_phase_snapshots
      (session_id,scenario_id,phase,captured_at,payload,payload_hash,commerce_fingerprint,worker_git_sha)
      VALUES($1,$2,$3,$4,$5::text::jsonb,$6,$7,$8)
      ON CONFLICT(session_id,scenario_id,phase) DO NOTHING
      RETURNING session_id,scenario_id,phase,captured_at,payload,payload_hash,commerce_fingerprint,worker_git_sha`,
    [identity.sessionId, identity.scenarioId, identity.phase, payload.capturedAt, stableJson(payload), payloadHash,
      commerceFingerprint, workerGitSha]);
    if (inserted.length > 1) throw new Error("Report V4 authority phase persistence insert returned multiple rows.");
    const persisted = inserted[0]
      ? parsePersistedRow(inserted[0])
      : await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, identity);
    if (!persisted || persisted.payloadHash !== payloadHash || persisted.commerceFingerprint !== commerceFingerprint
        || persisted.workerGitSha !== workerGitSha || stableJson(persisted.payload) !== stableJson(payload)) {
      throw new Error("Report V4 authority phase persistence conflict is not an exact idempotent replay.");
    }
    return persisted;
  });
}

async function assertLivePersistenceAuthority(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  identity: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">,
  payload: ReportV4AcceptanceCompleteAuthorityPhasePayload,
  workerGitSha: string
): Promise<void> {
  const live = exactlyOne(await tx.unsafe(`SELECT sessions.state session_state,sessions.environment,sessions.worker_git_sha,
      sessions.head_sequence,sessions.head_hash,sessions.event_count,scenarios.state scenario_state,scenarios.kind scenario_kind
    FROM report_v4_acceptance_sessions sessions
    JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id AND scenarios.id=$2
    WHERE sessions.id=$1 FOR SHARE`, [identity.sessionId, identity.scenarioId]), "live persistence authority");
  if (live.environment !== "protected_staging" || live.session_state !== "collecting" || live.scenario_state !== "collecting"
      || live.worker_git_sha !== workerGitSha || live.scenario_kind !== payload.scenarioKind
      || nonnegativeInteger(live.head_sequence, "live head_sequence") !== payload.session.headSequence
      || hash(live.head_hash, "live head_hash") !== payload.session.headHash
      || nonnegativeInteger(live.event_count, "live event_count") !== payload.session.eventCount) {
    throw new Error("Report V4 authority phase capture is stale or no longer matches the live collecting authority.");
  }
  if (identity.phase === "final") {
    const baseline = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, { ...identity, phase: "baseline" });
    if (!baseline) throw new Error("A final authority phase requires its exact persisted baseline.");
    assertReportV4AcceptanceAuthorityCaptureOrder(baseline.payload, payload);
    const immutableScopeFields = ["reportIdHash", "orderIdHash", "siteSnapshotIdHash", "configSnapshotIdHash",
      "questionSetIdHash", "preAdmissionJobIdHash", "coreJobIdHash", "coreArtifactRevisionIdHash"] as const;
    for (const field of immutableScopeFields) {
      if (baseline.payload.commerce.scope[field] !== payload.commerce.scope[field]) {
        throw new Error(`Final authority phase immutable commerce ${field} drifted from baseline.`);
      }
    }
  }
}

function assertPayloadIdentity(
  payload: ReportV4AcceptanceCompleteAuthorityPhasePayload,
  identity: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">
): void {
  if (payload.phase !== identity.phase || payload.session.sessionIdHash !== digest(identity.sessionId)
      || payload.session.scenarioIdHash !== digest(identity.scenarioId)) {
    throw new Error("Complete authority phase payload does not match its persistence identity.");
  }
}

function parsePersistedRow(row: Record<string, unknown>): PersistedReportV4AcceptanceAuthorityPhaseSnapshot {
  const exact = exactRecord(row, ["captured_at", "commerce_fingerprint", "payload", "payload_hash", "phase", "scenario_id",
    "session_id", "worker_git_sha"], "persisted authority phase row");
  const identity = parsePhaseIdentity({ sessionId: exact.session_id as string, scenarioId: exact.scenario_id as string,
    phase: exact.phase as "baseline" | "final" });
  const rawPayload = typeof exact.payload === "string" ? JSON.parse(exact.payload) as unknown : exact.payload;
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(rawPayload);
  assertPayloadIdentity(rawPayload, identity);
  const capturedAt = text(exact.captured_at, "persisted captured_at");
  if (capturedAt !== rawPayload.capturedAt || canonicalUtcInstant(capturedAt, "persisted captured_at") < 0) {
    throw new Error("Persisted authority phase captured_at differs from its complete payload.");
  }
  const payloadHash = hash(exact.payload_hash, "persisted payload_hash");
  const commerceFingerprint = hash(exact.commerce_fingerprint, "persisted commerce_fingerprint");
  const workerGitSha = text(exact.worker_git_sha, "persisted worker_git_sha");
  if (!GIT_SHA.test(workerGitSha) || payloadHash !== digest(stableJson(rawPayload))
      || commerceFingerprint !== rawPayload.commerce.fingerprint) {
    throw new Error("Persisted authority phase hash, commerce fingerprint, or worker SHA is invalid.");
  }
  return Object.freeze({ ...identity, capturedAt, payload: rawPayload, payloadHash, commerceFingerprint, workerGitSha });
}

export async function loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">
): Promise<PersistedReportV4AcceptanceAuthorityPhaseSnapshot | null> {
  const identity = parsePhaseIdentity(input);
  const rows = await tx.unsafe(`SELECT session_id,scenario_id,phase,captured_at,payload,payload_hash,commerce_fingerprint,worker_git_sha
    FROM report_v4_acceptance_authority_phase_snapshots
    WHERE session_id=$1 AND scenario_id=$2 AND phase=$3`, [identity.sessionId, identity.scenarioId, identity.phase]);
  if (rows.length > 1) throw new Error("Report V4 authority phase persistence identity is not unique.");
  return rows[0] ? parsePersistedRow(rows[0]) : null;
}

export function assertReportV4AcceptanceAuthorityCaptureOrder(
  baseline: Pick<ReportV4AcceptanceAuthorityPhaseFoundation, "phase" | "capturedAt" | "scenarioKind" | "session" | "commerce">,
  final: Pick<ReportV4AcceptanceAuthorityPhaseFoundation, "phase" | "capturedAt" | "scenarioKind" | "session" | "commerce">
): void {
  if (baseline.phase !== "baseline" || final.phase !== "final") {
    throw new TypeError("Authority capture order requires complete baseline and final phase foundations.");
  }
  const baselineCapturedAt = canonicalUtcInstant(baseline.capturedAt, "baseline capturedAt");
  const finalCapturedAt = canonicalUtcInstant(final.capturedAt, "final capturedAt");
  if (baselineCapturedAt >= finalCapturedAt) {
    throw new Error("Authority baseline capture must strictly precede final capture.");
  }
  if (baseline.session.sessionIdHash !== final.session.sessionIdHash
      || baseline.session.scenarioIdHash !== final.session.scenarioIdHash
      || baseline.scenarioKind !== final.scenarioKind) {
    throw new Error("Authority baseline and final captures must share one exact scenario identity.");
  }
  assertPhaseTopology(baseline);
  assertPhaseTopology(final);
}

async function loadFoundationInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
  dependencies: ReportV4AcceptanceAuthorityPhaseSnapshotTestOnlyDependencies
): Promise<ReportV4AcceptanceAuthorityPhaseFoundation> {
  const isolationRows = await tx.unsafe(`/* phase-authority:isolation */
    SELECT current_setting('transaction_isolation') transaction_isolation,
      current_setting('transaction_read_only') transaction_read_only,
      clock_timestamp() captured_at`);
  const isolation = exactlyOne(isolationRows, "transaction isolation");
  if (isolation.transaction_isolation !== "repeatable read" || isolation.transaction_read_only !== "on") {
    throw new Error("Report V4 authority phase requires one repeatable-read read-only transaction.");
  }
  timestamp(isolation.captured_at, "captured_at");
  const metadataRows = await tx.unsafe(`/* phase-authority:session-scenario */
    SELECT sessions.id session_id,sessions.state session_state,sessions.head_sequence,sessions.head_hash,
      sessions.event_count,scenarios.id scenario_id,scenarios.kind scenario_kind,scenarios.state scenario_state
    FROM report_v4_acceptance_sessions sessions
    JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id
    WHERE sessions.id=$1 AND scenarios.id=$2`, [input.sessionId, input.scenarioId]);
  const metadata = exactlyOne(metadataRows, "session/scenario authority");
  const scenarioKind = parseScenarioKind(metadata.scenario_kind);
  const commerce = await (dependencies.loadCommerceInTransaction ?? loadReportV4CommerceAuthoritySnapshotInTransaction)(tx, input);
  if (commerce.scenarioKind !== scenarioKind) throw new Error("Commerce and session scenario authority disagree.");
  const paidAt = commerce.orders[0]?.paidAt;
  if (!paidAt) throw new Error("The exact paid order timestamp is required for authority capture.");
  const websiteCheckpointCandidate = dependencies.loadWebsiteCheckpointV38InTransaction
    ? await dependencies.loadWebsiteCheckpointV38InTransaction(tx, input)
    : null;
  const websiteCheckpoint = websiteCheckpointCandidate ?? null;
  if (websiteCheckpoint !== null) assertReportV4AcceptanceWebsiteCheckpointV38Authority(websiteCheckpoint);
  const session = Object.freeze({
    sessionIdHash: digest(text(metadata.session_id, "session_id")),
    scenarioIdHash: digest(text(metadata.scenario_id, "scenario_id")),
    sessionState: parseState(metadata.session_state, "session state"),
    scenarioState: parseState(metadata.scenario_state, "scenario state"),
    headSequence: nonnegativeInteger(metadata.head_sequence, "head_sequence"),
    headHash: hash(metadata.head_hash, "head_hash"),
    eventCount: nonnegativeInteger(metadata.event_count, "event_count")
  });
  const foundation = {
    phase: input.phase,
    capturedAt: commerce.capturedAt,
    scenarioKind,
    session,
    commerce,
    paidAt,
    websiteCheckpoint,
    transactionProfile: Object.freeze({ isolation: "repeatable read" as const, readOnly: true as const })
  };
  const projected = Object.freeze({ ...foundation, foundationHash: digest(stableJson(foundation)) });
  assertPhaseTopology(projected);
  return projected;
}

async function loadWebsiteCheckpointV38AuthorityInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput
): Promise<ReportV4AcceptanceWebsiteCheckpointV38Authority | null> {
  const rows = await tx.unsafe(`/* phase-authority:v38-website-checkpoint */
    SELECT checkpoint.identity_hash,checkpoint.report_id,checkpoint.order_id,checkpoint.core_job_id,
      checkpoint.config_snapshot_id,checkpoint.site_snapshot_id,checkpoint.operation_id,checkpoint.profile_id,
      checkpoint.input_identity_hash,checkpoint.page_summary_identity_set_hash,checkpoint.page_summary_count,
      checkpoint.state,checkpoint.provider_call_count,checkpoint.correction_count,checkpoint.output_payload,checkpoint.output_hash,
      scenario.report_id scenario_report_id,scenario.order_id scenario_order_id,scenario.core_job_id scenario_core_job_id,
      scenario.config_snapshot_id scenario_config_snapshot_id,scenario.site_snapshot_id scenario_site_snapshot_id
    FROM report_v4_acceptance_scenarios scenario
    JOIN report_v4_website_synthesis_checkpoints checkpoint ON checkpoint.core_job_id=scenario.core_job_id
    WHERE scenario.session_id=$1 AND scenario.id=$2`, [input.sessionId, input.scenarioId]);
  if (rows.length === 0) return null;
  return projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly(
    exactlyOne(rows, "V38 website checkpoint")
  );
}

/** Pure projector exposed only so unit tests can prove persisted V38 tamper rejection. */
export function projectReportV4AcceptanceWebsiteCheckpointV38AuthorityForTestOnly(
  value: unknown
): ReportV4AcceptanceWebsiteCheckpointV38Authority {
  const row = exactRecord(value, ["config_snapshot_id", "core_job_id", "correction_count", "identity_hash",
    "input_identity_hash", "operation_id", "order_id", "output_hash", "output_payload", "page_summary_count",
    "page_summary_identity_set_hash", "profile_id", "provider_call_count", "report_id", "scenario_config_snapshot_id",
    "scenario_core_job_id", "scenario_order_id", "scenario_report_id", "scenario_site_snapshot_id", "site_snapshot_id", "state"],
  "V38 website checkpoint row");
  for (const [actual, expected, label] of [
    [row.report_id, row.scenario_report_id, "report"], [row.order_id, row.scenario_order_id, "order"],
    [row.core_job_id, row.scenario_core_job_id, "core job"], [row.config_snapshot_id, row.scenario_config_snapshot_id, "config"],
    [row.site_snapshot_id, row.scenario_site_snapshot_id, "site snapshot"]
  ] as const) {
    if (text(actual, `V38 ${label}`) !== text(expected, `V38 scenario ${label}`)) {
      throw new Error(`V38 website checkpoint ${label} lineage does not match the exact scenario.`);
    }
  }
  const checkpointIdentity = {
    reportId: text(row.report_id, "V38 report_id"), orderId: text(row.order_id, "V38 order_id"),
    coreJobId: text(row.core_job_id, "V38 core_job_id"), configSnapshotId: text(row.config_snapshot_id, "V38 config_snapshot_id"),
    siteSnapshotId: text(row.site_snapshot_id, "V38 site_snapshot_id"), operationId: text(row.operation_id, "V38 operation_id"),
    profileId: text(row.profile_id, "V38 profile_id"), inputIdentityHash: hash(row.input_identity_hash, "V38 input_identity_hash"),
    pageSummaryIdentitySetHash: hash(row.page_summary_identity_set_hash, "V38 page_summary_identity_set_hash"),
    pageSummaryCount: nonnegativeInteger(row.page_summary_count, "V38 page_summary_count")
  };
  if (hash(row.identity_hash, "V38 identity_hash") !== digest(stableJson(checkpointIdentity))) {
    throw new Error("V38 website checkpoint identity hash does not match its exact persisted lineage and input authority.");
  }
  if (row.state !== "completed" || Number(row.provider_call_count) !== 1 || Number(row.correction_count) !== 0
      || row.output_payload === null || row.output_payload === undefined) {
    throw new Error("V38 website checkpoint is not one exact completed provider call without correction.");
  }
  const rawOutput = typeof row.output_payload === "string" ? JSON.parse(row.output_payload) as unknown : row.output_payload;
  const parsedOutput = parseReportV4WebsiteSynthesisOutput(rawOutput);
  const outputHash = hash(row.output_hash, "V38 output_hash");
  if (outputHash !== digest(JSON.stringify(parsedOutput))) {
    throw new Error("V38 website checkpoint output hash does not match the parsed canonical synthesis output.");
  }
  const authority = Object.freeze({ state: "completed" as const, providerCallCount: 1 as const, correctionCount: 0 as const,
    pageSummaryCount: checkpointIdentity.pageSummaryCount, identityHash: String(row.identity_hash),
    inputIdentityHash: checkpointIdentity.inputIdentityHash,
    pageSummaryIdentitySetHash: checkpointIdentity.pageSummaryIdentitySetHash,
    outputHash });
  assertReportV4AcceptanceWebsiteCheckpointV38Authority(authority);
  return authority;
}

function assertPhaseTopology(value: Pick<ReportV4AcceptanceAuthorityPhaseFoundation, "phase" | "scenarioKind" | "commerce">): void {
  const enhancementJob = value.commerce.scope.enhancementJobIdHash;
  const enhancementArtifact = value.commerce.scope.enhancementArtifactRevisionIdHash;
  if (value.phase === "baseline" && (enhancementJob !== null || enhancementArtifact !== null)) {
    throw new Error("Authority baseline must not contain enhancement lineage.");
  }
  if (value.phase === "final") {
    const expectsEnhancement = value.scenarioKind !== "question_failure";
    if (expectsEnhancement !== (enhancementJob !== null && enhancementArtifact !== null)) {
      throw new Error("Authority final enhancement lineage conflicts with scenario topology.");
    }
  }
}

export function assertReportV4AcceptanceWebsiteCheckpointV38Authority(
  value: unknown
): asserts value is ReportV4AcceptanceWebsiteCheckpointV38Authority {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("V38 website checkpoint authority must be a complete object.");
  }
  const checkpoint = value as Record<string, unknown>;
  const expectedFields = [
    "correctionCount",
    "identityHash",
    "inputIdentityHash",
    "outputHash",
    "pageSummaryCount",
    "pageSummaryIdentitySetHash",
    "providerCallCount",
    "state"
  ];
  if (Object.keys(checkpoint).sort().join("\u001f") !== expectedFields.join("\u001f")) {
    throw new Error("V38 website checkpoint authority fields are incomplete or non-canonical.");
  }
  if (checkpoint.state !== "completed" || checkpoint.providerCallCount !== 1 || checkpoint.correctionCount !== 0) {
    throw new Error("V38 website checkpoint must be completed exactly once without correction.");
  }
  if (!Number.isSafeInteger(checkpoint.pageSummaryCount)
      || Number(checkpoint.pageSummaryCount) < 1 || Number(checkpoint.pageSummaryCount) > 50) {
    throw new Error("V38 website checkpoint pageSummaryCount is missing or invalid.");
  }
  for (const field of [
    "identityHash",
    "inputIdentityHash",
    "pageSummaryIdentitySetHash",
    "outputHash"
  ] as const) {
    const candidate = checkpoint[field];
    if (typeof candidate !== "string" || !HASH.test(candidate)) {
      throw new Error(`V38 website checkpoint ${field} is missing or invalid.`);
    }
  }
}

export function assertReportV4AcceptanceCompleteAuthorityPhasePayload(
  value: unknown
): asserts value is ReportV4AcceptanceCompleteAuthorityPhasePayload {
  const payload = exactRecord(value, [
    "authorities", "capturedAt", "commerce", "contractVersion", "paidAt", "phase", "scenarioKind", "session",
    "transactionProfile", "websiteCheckpoint"
  ], "complete authority phase payload");
  if (payload.contractVersion !== COMPLETE_PHASE_CONTRACT) throw new Error("Complete authority phase contractVersion is invalid.");
  if (payload.phase !== "baseline" && payload.phase !== "final") throw new Error("Complete authority phase is invalid.");
  canonicalUtcInstant(payload.capturedAt, "complete payload capturedAt");
  canonicalUtcInstant(payload.paidAt, "complete payload paidAt");
  if (payload.scenarioKind !== "success" && payload.scenarioKind !== "diagnosis_failure" && payload.scenarioKind !== "question_failure") {
    throw new Error("Complete authority phase scenarioKind is invalid.");
  }
  validateCompleteSession(payload.session);
  assertReportV4AcceptanceWebsiteCheckpointV38Authority(payload.websiteCheckpoint);
  validateTransactionProfile(payload.transactionProfile);
  const commerce = validateCompleteCommerce(payload.commerce, payload.phase, payload.scenarioKind);
  if (payload.capturedAt !== commerce.capturedAt) {
    throw new Error("Complete authority phase capturedAt must exactly equal commerce capturedAt.");
  }
  if (!Array.isArray(commerce.orders) || commerce.orders.length !== 1
      || !commerce.orders[0] || typeof commerce.orders[0] !== "object" || Array.isArray(commerce.orders[0])
      || (commerce.orders[0] as Record<string, unknown>).paidAt !== payload.paidAt) {
    throw new Error("Complete authority phase paidAt must exactly equal the unique commerce order paidAt.");
  }
  assertPhaseTopology({
    phase: payload.phase as "baseline" | "final",
    scenarioKind: payload.scenarioKind as ReportV4AcceptanceAuthorityPhaseFoundation["scenarioKind"],
    commerce: payload.commerce as ReportV4CommerceAuthoritySnapshot
  });
  const authorities = exactRecord(payload.authorities, COMPLETE_AUTHORITY_SLOT_NAMES, "complete DB authorities");
  const sitePages = validateSitePageSlot(authorities.site_snapshot_pages, "site_snapshot_pages", [
    "analyzable", "analyzablePageCount", "candidatePageCount", "collectorConfigIdentityHash", "contentHash",
    "coreJobIdHash", "excludedPageCount", "exclusionReasonHash", "jsDependentPageCount", "locationIdentityHash",
    "ordinal", "pageIdHash", "pageIdentityHash", "readMode", "reportIdHash", "scenarioIdHash", "selectedPageCount",
    "snapshotContentIdentityHash", "snapshotIdHash", "snapshotStatus", "sourceLength", "summaryHash"
  ]);
  const summaries = validateSitePageSlot(authorities.page_summary_integrity, "page_summary_integrity", [
    "chunksHash", "contentHash", "coreJobIdHash", "ordinal", "pageIdHash", "readability", "reportIdHash",
    "scenarioIdHash", "snapshotIdHash", "sourceLength", "summaryIdentityHash", "summaryPayloadHash", "websiteInputSetHash"
  ]);
  const artifact = validateArtifactAuthority(authorities.artifact_combined_payload_integrity, payload.phase, payload.scenarioKind);
  const manifest = validateSiteReadAuthority(authorities.site_read_manifest, payload.phase, payload.scenarioKind);
  const ledger = validateLedgerAuthority(authorities.ledger_authority, payload.phase);
  const guard = validateGuardAuthority(authorities.prohibited_operation_guard_authority, payload.phase);
  const zero = validateZeroAuthority(authorities.zero_database_effect_counts, payload.phase, payload.scenarioKind);
  validateCrossSlotLineage(payload as unknown as ReportV4AcceptanceCompleteAuthorityPhasePayload,
    sitePages, summaries, artifact, manifest, ledger, guard, zero);
}

function validateSitePageSlot(value: unknown, label: string, recordFields: readonly string[]): Record<string, unknown>[] {
  const slot = exactRecord(value, ["canonicalHash", "recordCount", "records"], label);
  if (!Array.isArray(slot.records) || slot.records.length < 1 || slot.recordCount !== slot.records.length) {
    throw new Error(`${label} must contain its complete nonempty record set.`);
  }
  const records = slot.records.map((record, index) => exactRecord(record, recordFields, `${label} record ${index}`));
  records.forEach((record) => {
    for (const [field, child] of Object.entries(record)) {
      if (field.endsWith("Hash") && child !== null) hash(child, `${label} ${field}`);
    }
  });
  if (label === "site_snapshot_pages") {
    if (records.length > 50 || records.some((record, index) => record.ordinal !== index + 1
        || !["completed", "completed_limited"].includes(String(record.snapshotStatus))
        || !Number.isSafeInteger(record.candidatePageCount) || Number(record.candidatePageCount) < records.length
        || record.selectedPageCount !== records.length || !Number.isSafeInteger(record.analyzablePageCount)
        || !Number.isSafeInteger(record.excludedPageCount)
        || Number(record.analyzablePageCount) + Number(record.excludedPageCount) !== records.length
        || (record.analyzable === true ? !["direct_readable", "js_dependent"].includes(String(record.readMode))
          : record.readMode !== null))) throw new Error("site_snapshot_pages record topology is invalid.");
    if (new Set(records.map((record) => record.pageIdHash)).size !== records.length
        || new Set(records.map((record) => record.locationIdentityHash)).size !== records.length) throw new Error("site_snapshot_pages identities are duplicated.");
  } else if (new Set(records.map((record) => record.pageIdHash)).size !== records.length
      || new Set(records.map((record) => record.summaryIdentityHash)).size !== records.length
      || records.some((record) => !["direct_readable", "js_dependent"].includes(String(record.readability)))) {
    throw new Error("page_summary_integrity identities or readability are invalid.");
  }
  if (slot.canonicalHash !== digest(stableJson(records))) throw new Error(`${label} canonicalHash is invalid.`);
  return records;
}

function validateArtifactAuthority(value: unknown, phase: string, scenarioKind: string): Record<string, unknown> {
  const artifact = exactRecord(value, ["activeArtifactRevisionIdHash", "artifacts", "canonicalHash", "capturedAt",
    "faultQuestionIdHash", "faultSourceIdHash", "phase", "scenarioKind", "transactionProfile"], "artifact authority");
  if (artifact.phase !== phase || artifact.scenarioKind !== scenarioKind) throw new Error("Artifact authority phase/scenario mismatch.");
  canonicalUtcInstant(artifact.capturedAt, "artifact capturedAt"); validateTransactionProfile(artifact.transactionProfile);
  hash(artifact.activeArtifactRevisionIdHash, "artifact active revision hash"); hash(artifact.faultQuestionIdHash, "artifact fault question hash");
  if (artifact.faultSourceIdHash !== null) hash(artifact.faultSourceIdHash, "artifact fault source hash");
  if (!Array.isArray(artifact.artifacts) || artifact.artifacts.length < 1 || artifact.artifacts.length > 2) {
    throw new Error("Artifact authority must contain one or two exact revisions.");
  }
  for (const [index, item] of artifact.artifacts.entries()) {
    const record = exactRecord(item, ["artifactRevisionIdHash", "configSnapshotIdHash", "diagnosisContentHashes", "jobIdHash",
      "orderIdHash", "payloadIdentityHash", "preservedContentHash", "questionContentHashes", "questionSetIdHash", "reportIdHash",
      "revision", "revisionKind", "sourceArtifactRevisionIdHash", "status"], `artifact record ${index}`);
    for (const field of ["artifactRevisionIdHash", "configSnapshotIdHash", "jobIdHash", "orderIdHash", "payloadIdentityHash",
      "preservedContentHash", "questionSetIdHash", "reportIdHash"] as const) hash(record[field], `artifact ${field}`);
    if (record.sourceArtifactRevisionIdHash !== null) hash(record.sourceArtifactRevisionIdHash, "artifact source revision hash");
    validateHashTuple(record.questionContentHashes, false, "artifact question hashes");
    validateHashTuple(record.diagnosisContentHashes, true, "artifact diagnosis hashes");
    if (!Number.isSafeInteger(record.revision) || Number(record.revision) < 1
        || !["generation", "diagnosis_enhancement"].includes(String(record.revisionKind))
        || !["ready", "active"].includes(String(record.status))) throw new Error("Artifact record topology is invalid.");
  }
  const artifactRecords = artifact.artifacts as Record<string, unknown>[];
  if (artifactRecords.some((record, index) => record.revision !== index + 1)
      || artifactRecords[0]?.revisionKind !== "generation" || artifactRecords[0]?.sourceArtifactRevisionIdHash !== null
      || (artifactRecords.length === 2 && (artifactRecords[1]?.revisionKind !== "diagnosis_enhancement"
        || artifactRecords[1]?.sourceArtifactRevisionIdHash !== artifactRecords[0]?.artifactRevisionIdHash))
      || artifactRecords.filter((record) => record.status === "active").length !== 1
      || artifactRecords.find((record) => record.status === "active")?.artifactRevisionIdHash !== artifact.activeArtifactRevisionIdHash) {
    throw new Error("Artifact revision order/status/preservation topology is invalid.");
  }
  const canonical = { phase: artifact.phase, scenarioKind: artifact.scenarioKind, faultQuestionIdHash: artifact.faultQuestionIdHash,
    faultSourceIdHash: artifact.faultSourceIdHash, activeArtifactRevisionIdHash: artifact.activeArtifactRevisionIdHash,
    artifacts: artifact.artifacts, transactionProfile: artifact.transactionProfile };
  if (artifact.canonicalHash !== digest(stableJson(canonical))) throw new Error("Artifact authority canonicalHash is invalid.");
  return artifact;
}

function validateHashTuple(value: unknown, nullable: boolean, label: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain exactly three entries.`);
  value.forEach((entry) => { if (nullable && entry === null) return; hash(entry, label); });
}

function validateSiteReadAuthority(value: unknown, phase: string, scenarioKind: string): Record<string, unknown> {
  const manifest = exactRecord(value, ["allowedIdentityHashes", "authorityHash", "contractVersion", "enhancementJobIdHash",
    "phase", "preAdmissionJobIdHash", "records", "reportIdHash", "requiredIdentityHashes", "scenarioIdHash",
    "scenarioKind", "sessionIdHash"], "site-read manifest authority");
  if (manifest.contractVersion !== "report-v4-acceptance-site-read-manifest-authority-v1"
      || manifest.phase !== phase || manifest.scenarioKind !== scenarioKind || !Array.isArray(manifest.records)
      || !Array.isArray(manifest.requiredIdentityHashes) || !Array.isArray(manifest.allowedIdentityHashes)) {
    throw new Error("Site-read manifest authority contract is invalid.");
  }
  for (const field of ["sessionIdHash", "scenarioIdHash", "reportIdHash", "preAdmissionJobIdHash"] as const) hash(manifest[field], field);
  if (manifest.enhancementJobIdHash !== null) hash(manifest.enhancementJobIdHash, "manifest enhancement job hash");
  const records = manifest.records.map((item, index) => exactRecord(item, ["attempt", "identityHash", "jobIdHash", "mode",
    "networkPerformed", "ownerQuestionIdHash", "ownerSourceIdHash", "pairBindingHash", "purpose", "reportIdHash", "scope",
    "semanticState", "startedAt", "terminalAt", "terminalPhase", "urlHash"], `site-read record ${index}`));
  records.forEach((record) => {
    for (const field of ["identityHash", "jobIdHash", "pairBindingHash", "reportIdHash", "urlHash"] as const) hash(record[field], `site-read ${field}`);
    if (record.ownerQuestionIdHash !== null) hash(record.ownerQuestionIdHash, "site-read question hash");
    if (record.ownerSourceIdHash !== null) hash(record.ownerSourceIdHash, "site-read source hash");
    canonicalUtcInstant(record.startedAt, "site-read startedAt"); if (record.terminalAt !== null) canonicalUtcInstant(record.terminalAt, "site-read terminalAt");
    if (![0, 1].includes(Number(record.attempt)) || record.networkPerformed !== true
        || !["terminal", "started_only"].includes(String(record.semanticState))
        || !["raw", "browser"].includes(String(record.mode))
        || !["admission_discovery", "admission_page", "enhancement_source"].includes(String(record.scope))
        || !["homepage", "robots", "sitemap", "page", "source"].includes(String(record.purpose))
        || (record.terminalPhase !== null && !["completed", "failed"].includes(String(record.terminalPhase)))) throw new Error("Site-read record topology is invalid.");
    const enhancement = record.scope === "enhancement_source";
    if ((!enhancement && (record.attempt !== 0 || record.ownerQuestionIdHash !== null || record.ownerSourceIdHash !== null))
        || (enhancement && (record.purpose !== "source" || record.attempt !== 1
          || record.ownerQuestionIdHash === null || record.ownerSourceIdHash === null))
        || (record.scope === "admission_page" && record.purpose !== "page")
        || (record.scope === "admission_discovery" && !["homepage", "robots", "sitemap"].includes(String(record.purpose)))
        || (record.semanticState === "terminal") !== (record.terminalPhase !== null && record.terminalAt !== null)
        || (record.semanticState === "started_only") !== (record.terminalPhase === null && record.terminalAt === null)
        || (record.terminalAt !== null && canonicalUtcInstant(record.startedAt, "site-read startedAt")
          > canonicalUtcInstant(record.terminalAt, "site-read terminalAt"))) throw new Error("Site-read ownership/terminal topology is invalid.");
  });
  const identities = records.map((record) => record.identityHash);
  if (new Set(identities).size !== identities.length || stableJson([...identities].sort()) !== stableJson(identities)) {
    throw new Error("Site-read records must be unique and canonically sorted.");
  }
  const pairs = new Map<string, Record<string, unknown>[]>();
  records.forEach((record) => pairs.set(String(record.pairBindingHash), [...(pairs.get(String(record.pairBindingHash)) ?? []), record]));
  for (const pair of pairs.values()) {
    const raw = pair.filter((record) => record.mode === "raw"); const browser = pair.filter((record) => record.mode === "browser");
    if (pair.length > 2 || raw.length !== 1 || browser.length > 1 || (browser.length === 1 && raw[0]!.semanticState !== "terminal")) throw new Error("Site-read raw/browser pair topology is invalid.");
  }
  if (records.some((record) => record.jobIdHash !== (record.scope === "enhancement_source"
    ? manifest.enhancementJobIdHash : manifest.preAdmissionJobIdHash))) {
    throw new Error("Site-read record job lineage does not match its admission/enhancement scope.");
  }
  if (stableJson(manifest.allowedIdentityHashes) !== stableJson(identities)
      || stableJson(manifest.requiredIdentityHashes) !== stableJson(records.filter((record) => record.semanticState === "terminal").map((record) => record.identityHash))) {
    throw new Error("Site-read identity sets do not match records.");
  }
  const withoutHash = { ...manifest }; delete withoutHash.authorityHash;
  if (manifest.authorityHash !== digest(`ogc:report-v4:acceptance-site-read-manifest:authority:v1\x1f${stableLocaleJson(withoutHash)}`)) {
    throw new Error("Site-read authorityHash is invalid.");
  }
  return manifest;
}

function validateLedgerAuthority(value: unknown, phase: string): Record<string, unknown> {
  const ledger = exactRecord(value, ["canonicalHash", "contractVersion", "events", "phase", "scenario", "session"], "ledger authority");
  if (ledger.contractVersion !== "report-v4-acceptance-ledger-authority-v1" || ledger.phase !== phase || !Array.isArray(ledger.events)) {
    throw new Error("Ledger authority contract is invalid.");
  }
  const session = exactRecord(ledger.session, ["eventCount", "headHash", "headSequence", "previewDeploymentIdHash",
    "protectedAliasUrlHash", "sessionIdHash", "startedAt", "state", "webGitSha", "workerGitSha"], "ledger session");
  if (session.state !== "collecting" || session.headSequence !== session.eventCount || session.eventCount !== ledger.events.length) throw new Error("Ledger session topology is invalid.");
  for (const field of ["headHash", "previewDeploymentIdHash", "protectedAliasUrlHash", "sessionIdHash"] as const) hash(session[field], field);
  if (!GIT_SHA.test(String(session.webGitSha)) || session.webGitSha !== session.workerGitSha) throw new Error("Ledger Git lineage is invalid.");
  canonicalUtcInstant(session.startedAt, "ledger startedAt");
  const scenario = exactRecord(ledger.scenario, ["baselineFingerprint", "configSnapshotIdHash", "coreArtifactRevisionIdHash",
    "coreJobIdHash", "createdAt", "enhancementArtifactRevisionIdHash", "enhancementJobIdHash", "expectedFaultOccurrences",
    "faultKind", "faultQuestionIdHash", "faultSourceIdHash", "finalFingerprint", "kind", "orderIdHash", "preAdmissionJobIdHash",
    "questionSetIdHash", "reportIdHash", "scenarioIdHash", "siteSnapshotIdHash", "state", "storedBaselineFingerprint"], "ledger scenario");
  if (scenario.state !== "collecting" || !["success", "diagnosis_failure", "question_failure"].includes(String(scenario.kind))) throw new Error("Ledger scenario must be collecting and typed.");
  for (const [index, item] of ledger.events.entries()) {
    const event = exactRecord(item, ["attempt", "details", "eventHash", "eventPhase", "fingerprint", "kind", "occurredAt",
      "operation", "previousHash", "scenarioIdHash", "sequence", "unitIdHash"], `ledger event ${index}`);
    if (event.sequence !== index + 1) throw new Error("Ledger event sequence is invalid.");
    for (const field of ["eventHash", "fingerprint", "previousHash", "scenarioIdHash", "unitIdHash"] as const) hash(event[field], field);
    canonicalUtcInstant(event.occurredAt, "ledger occurredAt"); validateProjectedLedgerDetails(event);
  }
  const eventRecords = ledger.events as Record<string, unknown>[];
  let previousHash = "0".repeat(64); const fingerprints = new Set<string>();
  for (const event of eventRecords) {
    if (event.previousHash !== previousHash || event.scenarioIdHash !== scenario.scenarioIdHash
        || fingerprints.has(String(event.fingerprint))) throw new Error("Ledger event chain, scenario, or fingerprint uniqueness is invalid.");
    fingerprints.add(String(event.fingerprint)); previousHash = String(event.eventHash);
  }
  const last = ledger.events.at(-1) as Record<string, unknown> | undefined;
  if (session.headHash !== (last?.eventHash ?? "0".repeat(64))) throw new Error("Ledger head does not match final event.");
  const withoutHash = { ...ledger }; delete withoutHash.canonicalHash;
  if (ledger.canonicalHash !== digest(`open-geo-console/report-v4/acceptance-ledger-authority/v1\x1f${stableLocaleJson(withoutHash)}`)) throw new Error("Ledger canonicalHash is invalid.");
  return ledger;
}

function validateProjectedLedgerDetails(event: Record<string, unknown>): void {
  const details = event.details as unknown;
  const kind = String(event.kind); const operation = String(event.operation); const phase = String(event.eventPhase);
  const attempt = Number(event.attempt);
  let fields: readonly string[];
  if (kind === "scenario_bound" && operation === "v4_dispatch" && attempt === 0 && phase === "observed") fields = ["bindingHash"];
  else if (kind === "crawl_run" && operation === "crawl" && ["started", "completed", "failed"].includes(phase)) fields = ["analyzablePages", "candidatePages", "excludedPages", "jsDependentPages"];
  else if (kind === "site_read" && ["site_raw_read", "site_browser_read"].includes(operation)
      && ["started", "completed", "failed"].includes(phase)) fields = ["networkPerformed", "readMode", "urlHash"];
  else if (kind === "model_operation" && ["page_analysis", "website_synthesis", "question_answer", "source_diagnosis"].includes(operation)
      && ["started", "completed", "failed", "rejected"].includes(phase)) fields = ["budgetOutcome", "inputTokens", "outputTokens", "providerCall", "retry"];
  else if ((kind === "html_assembly" && ["core_html", "enhancement_html"].includes(operation)
      && ["started", "completed", "failed"].includes(phase))
      || (kind === "artifact_activation" && operation === "artifact_activation" && attempt === 0 && phase === "observed")) fields = ["artifactRevisionIdHash", "htmlSha256"];
  else if (kind === "fault_injection" && ["question_failure", "diagnosis_failure", "independent_source_read_failure"].includes(operation)
      && phase === "consumed") fields = ["baselineFingerprint", "fault", "occurrence"];
  else if (kind === "checkpoint_terminal" && ["question_answer", "source_diagnosis"].includes(operation)
      && attempt === 0 && phase === "observed") fields = ["checkpointHash", "state"];
  else if (kind === "commerce_fingerprint" && operation === "commerce" && attempt === 0 && phase === "observed") fields = ["fingerprint"];
  else if ((kind === "v4_dispatch" && operation === "v4_dispatch" && attempt === 0 && phase === "observed")
      || (kind === "prohibited_operation" && ["pdf", "provider_claim", "qualification", "four_snapshot", "replacement_fulfillment",
        "correction", "full_report_rerun", "legacy_mutation"].includes(operation) && attempt === 0 && phase === "started")) fields = [];
  else throw new Error(`Ledger event ${kind}/${operation}/${phase} is not allowed.`);
  const projected = exactRecord(details, fields, `ledger ${kind} details`);
  for (const [key, child] of Object.entries(projected)) {
    if (/(?:Hash|fingerprint)$/u.test(key)) hash(child, `ledger detail ${key}`);
  }
  if (kind === "crawl_run" && Object.values(projected).some((child) => !Number.isSafeInteger(child) || Number(child) < 0)) throw new Error("Ledger crawl counts are invalid.");
  if (kind === "site_read" && (projected.networkPerformed !== true || !["raw", "browser"].includes(String(projected.readMode)))) throw new Error("Ledger site-read details are invalid.");
  if (kind === "model_operation" && (typeof projected.providerCall !== "boolean" || typeof projected.retry !== "boolean"
      || !["allowed", "rejected"].includes(String(projected.budgetOutcome)) || !Number.isSafeInteger(projected.inputTokens)
      || Number(projected.inputTokens) < 0 || !Number.isSafeInteger(projected.outputTokens) || Number(projected.outputTokens) < 0)) throw new Error("Ledger model details are invalid.");
  if (kind === "fault_injection" && (projected.fault !== operation || ![1, 2].includes(Number(projected.occurrence)))) throw new Error("Ledger fault details are invalid.");
  if (kind === "checkpoint_terminal" && !["answered", "unavailable", "completed", "failed"].includes(String(projected.state))) throw new Error("Ledger checkpoint state is invalid.");
}

function validateGuardAuthority(value: unknown, phase: string): Record<string, unknown> {
  const guard = exactRecord(value, ["canonicalHash", "contractVersion", "counters", "phase", "run"], "guard authority");
  if (guard.contractVersion !== "report-v4-prohibited-operation-guard-authority-v1" || guard.phase !== phase || !Array.isArray(guard.counters)) throw new Error("Guard authority contract is invalid.");
  const run = exactRecord(guard.run, ["armedAt", "completedAt", "jobIdHash", "manifestHash", "runId", "scenarioIdHash",
    "sessionIdHash", "state", "workerGitSha"], "guard run");
  for (const field of ["jobIdHash", "manifestHash", "runId", "scenarioIdHash", "sessionIdHash"] as const) hash(run[field], field);
  if (!GIT_SHA.test(String(run.workerGitSha)) || run.manifestHash !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH
      || (phase === "baseline" ? (run.state !== "armed" || run.completedAt !== null)
        : (run.state !== "completed" || run.completedAt === null))) throw new Error("Guard run topology is invalid.");
  canonicalUtcInstant(run.armedAt, "guard armedAt"); if (run.completedAt !== null) canonicalUtcInstant(run.completedAt, "guard completedAt");
  if (guard.counters.length !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.length) throw new Error("Guard counter manifest is incomplete.");
  const sortedGuardManifest = [...REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES]
    .sort((left, right) => left.guardSite.localeCompare(right.guardSite));
  guard.counters.forEach((item, index) => {
    const counter = exactRecord(item, ["attemptCount", "attemptedAt", "guardSite", "matchingEventFingerprint", "operation", "seededAt"], `guard counter ${index}`);
    const expected = sortedGuardManifest[index];
    if (!expected || counter.guardSite !== expected.guardSite || counter.operation !== expected.operation) throw new Error("Guard counter manifest order is invalid.");
    if (counter.attemptCount !== 0 || counter.attemptedAt !== null || counter.matchingEventFingerprint !== null) throw new Error("Guard counter is nonzero.");
    canonicalUtcInstant(counter.seededAt, "guard seededAt");
  });
  const withoutHash = { ...guard }; delete withoutHash.canonicalHash;
  if (guard.canonicalHash !== digest(`open-geo-console/report-v4/prohibited-operation-guard-authority/v1\x1f${stableLocaleJson(withoutHash)}`)) throw new Error("Guard canonicalHash is invalid.");
  return guard;
}

function validateZeroAuthority(value: unknown, phase: string, scenarioKind: string): Record<string, unknown> {
  const zero = exactRecord(value, ["allowedCommerceTopology", "canonicalHash", "capturedAt", "contractVersion", "facts", "lineage",
    "paidAt", "phase", "scenarioKind", "semanticZeroProjection", "transactionProfile", "unavailableRuntimeFacts"], "zero-effects authority");
  if (zero.contractVersion !== "report-v4-zero-database-effects-authority-v1" || zero.phase !== phase
      || zero.scenarioKind !== scenarioKind || !Array.isArray(zero.facts)
      || zero.facts.length !== REPORT_V4_ZERO_DATABASE_FACT_NAMES.length) throw new Error("Zero-effects authority contract is invalid.");
  canonicalUtcInstant(zero.capturedAt, "zero capturedAt"); canonicalUtcInstant(zero.paidAt, "zero paidAt"); validateTransactionProfile(zero.transactionProfile);
  zero.facts.forEach((item, index) => { const fact = exactRecord(item, ["count", "name", "scope"], `zero fact ${index}`); if (fact.name !== REPORT_V4_ZERO_DATABASE_FACT_NAMES[index] || fact.count !== 0 || fact.scope !== "exact_report_order_job_lineage") throw new Error("Zero-effect fact set is noncanonical or nonzero."); });
  const withoutCaptured = { ...zero }; delete withoutCaptured.canonicalHash; delete withoutCaptured.capturedAt;
  if (zero.canonicalHash !== digest(stableZeroJson(withoutCaptured))) throw new Error("Zero-effects canonicalHash is invalid.");
  return zero;
}

function validateCrossSlotLineage(payload: ReportV4AcceptanceCompleteAuthorityPhasePayload, sitePages: Record<string, unknown>[],
  summaries: Record<string, unknown>[], artifact: Record<string, unknown>, manifest: Record<string, unknown>, ledger: Record<string, unknown>,
  guard: Record<string, unknown>, zero: Record<string, unknown>): void {
  const scope = payload.commerce.scope;
  const scenario = ledger.scenario as Record<string, unknown>; const ledgerSession = ledger.session as Record<string, unknown>;
  const zeroLineage = exactRecord(zero.lineage, ["activeArtifactRevisionIdHash", "artifactRevisionIdSetHash", "configSnapshotIdHash",
    "coreArtifactRevisionIdHash", "coreJobIdHash", "enhancementArtifactRevisionIdHash", "enhancementJobIdHash", "jobIdSetHash",
    "orderIdHash", "preAdmissionJobIdHash", "questionSetIdHash", "reportIdHash", "scenarioIdHash", "sessionIdHash", "siteSnapshotIdSetHash"], "zero lineage");
  const expected = { reportIdHash: scope.reportIdHash, orderIdHash: scope.orderIdHash, preAdmissionJobIdHash: scope.preAdmissionJobIdHash,
    coreJobIdHash: scope.coreJobIdHash, enhancementJobIdHash: scope.enhancementJobIdHash, configSnapshotIdHash: scope.configSnapshotIdHash,
    questionSetIdHash: scope.questionSetIdHash, coreArtifactRevisionIdHash: scope.coreArtifactRevisionIdHash,
    enhancementArtifactRevisionIdHash: scope.enhancementArtifactRevisionIdHash, activeArtifactRevisionIdHash: scope.activeArtifactRevisionIdHash };
  for (const [field, value] of Object.entries(expected)) {
    if ((field !== "activeArtifactRevisionIdHash" && scenario[field] !== value) || zeroLineage[field] !== value) {
      throw new Error(`Cross-slot ${field} lineage mismatch.`);
    }
  }
  if (scenario.kind !== payload.scenarioKind || scenario.faultQuestionIdHash !== artifact.faultQuestionIdHash
      || scenario.faultSourceIdHash !== artifact.faultSourceIdHash
      || (payload.scenarioKind === "success") !== (artifact.faultSourceIdHash !== null)) {
    throw new Error("Cross-slot scenario/fault topology mismatch.");
  }
  if (ledgerSession.sessionIdHash !== payload.session.sessionIdHash || ledgerSession.headSequence !== payload.session.headSequence
      || ledgerSession.headHash !== payload.session.headHash || ledgerSession.eventCount !== payload.session.eventCount
      || scenario.scenarioIdHash !== payload.session.scenarioIdHash
      || manifest.sessionIdHash !== payload.session.sessionIdHash || manifest.scenarioIdHash !== payload.session.scenarioIdHash
      || zeroLineage.sessionIdHash !== payload.session.sessionIdHash || zeroLineage.scenarioIdHash !== payload.session.scenarioIdHash) throw new Error("Cross-slot session/scenario lineage mismatch.");
  if (manifest.reportIdHash !== scope.reportIdHash || manifest.preAdmissionJobIdHash !== scope.preAdmissionJobIdHash
      || manifest.enhancementJobIdHash !== scope.enhancementJobIdHash) throw new Error("Cross-slot site-read lineage mismatch.");
  for (const record of [...sitePages, ...summaries]) {
    if (record.scenarioIdHash !== payload.session.scenarioIdHash || record.reportIdHash !== scope.reportIdHash
        || record.coreJobIdHash !== scope.coreJobIdHash) throw new Error("Cross-slot site/page lineage mismatch.");
  }
  const selectedPageCount = Number(sitePages[0]?.selectedPageCount);
  const pageIdentities = sitePages.map((record) => `${record.pageIdHash}:${record.ordinal}:${record.contentHash ?? "null"}`);
  if (selectedPageCount !== sitePages.length || new Set(pageIdentities).size !== pageIdentities.length
      || sitePages.some((record) => record.snapshotIdHash !== scope.siteSnapshotIdHash || record.selectedPageCount !== selectedPageCount)
      || summaries.length !== sitePages.filter((record) => record.analyzable === true).length
      || summaries.some((summary) => summary.snapshotIdHash !== scope.siteSnapshotIdHash
        || !sitePages.some((page) => page.pageIdHash === summary.pageIdHash
        && page.ordinal === summary.ordinal && page.contentHash === summary.contentHash))) {
    throw new Error("Cross-slot site/page exact set mismatch.");
  }
  const analyzablePageIds = sitePages.filter((record) => record.analyzable === true).map((record) => record.pageIdHash).sort();
  const summaryPageIds = summaries.map((record) => record.pageIdHash).sort();
  if (stableJson(analyzablePageIds) !== stableJson(summaryPageIds)) {
    throw new Error("Cross-slot page-summary set does not equal the exact analyzable page set.");
  }
  if (artifact.activeArtifactRevisionIdHash !== scope.activeArtifactRevisionIdHash) throw new Error("Cross-slot active artifact lineage mismatch.");
  const artifacts = artifact.artifacts as Record<string, unknown>[];
  const expectedArtifacts = [
    { kind: "generation", id: scope.coreArtifactRevisionIdHash, job: scope.coreJobIdHash, source: null },
    ...(scope.enhancementArtifactRevisionIdHash === null ? [] : [{ kind: "diagnosis_enhancement", id: scope.enhancementArtifactRevisionIdHash,
      job: scope.enhancementJobIdHash, source: scope.coreArtifactRevisionIdHash }])
  ];
  if (artifacts.length !== expectedArtifacts.length || artifacts.some((record, index) => {
    const expectedArtifact = expectedArtifacts[index]!;
    return record.revisionKind !== expectedArtifact.kind || record.artifactRevisionIdHash !== expectedArtifact.id
      || record.jobIdHash !== expectedArtifact.job || record.sourceArtifactRevisionIdHash !== expectedArtifact.source
      || record.reportIdHash !== scope.reportIdHash || record.orderIdHash !== scope.orderIdHash
      || record.configSnapshotIdHash !== scope.configSnapshotIdHash || record.questionSetIdHash !== scope.questionSetIdHash;
  })) throw new Error("Cross-slot artifact lineage mismatch.");
  const guardRun = guard.run as Record<string, unknown>;
  if (guardRun.sessionIdHash !== payload.session.sessionIdHash || guardRun.scenarioIdHash !== payload.session.scenarioIdHash
      || guardRun.workerGitSha !== ledgerSession.workerGitSha
      || ![scope.preAdmissionJobIdHash, scope.coreJobIdHash, scope.enhancementJobIdHash].includes(guardRun.jobIdHash as string | null)) throw new Error("Cross-slot guard lineage mismatch.");
  validateZeroCommerceTopology(zero, payload.commerce);
  const websiteSetHashes = new Set(summaries.map((record) => record.websiteInputSetHash));
  const recomputedWebsiteSetHash = digest(JSON.stringify(summaries.map((record) => hash(record.summaryIdentityHash,
    "summary identity hash")).sort()));
  if (websiteSetHashes.size !== 1 || !websiteSetHashes.has(recomputedWebsiteSetHash)
      || payload.websiteCheckpoint.pageSummaryCount !== summaries.length
      || payload.websiteCheckpoint.pageSummaryIdentitySetHash !== recomputedWebsiteSetHash) {
    throw new Error("V38 website checkpoint does not match page-summary authority.");
  }
  if (payload.paidAt !== zero.paidAt) throw new Error("Cross-slot paidAt mismatch.");
  if (canonicalUtcInstant(artifact.capturedAt, "artifact capturedAt") < canonicalUtcInstant(payload.capturedAt, "payload capturedAt")
      || canonicalUtcInstant(zero.capturedAt, "zero capturedAt") < canonicalUtcInstant(payload.capturedAt, "payload capturedAt")) throw new Error("Slot capture time precedes phase capture.");
}

function validateZeroCommerceTopology(zero: Record<string, unknown>, commerce: ReportV4CommerceAuthoritySnapshot): void {
  const topology = exactRecord(zero.allowedCommerceTopology, ["accessKeyIds", "accessTokenIds", "creditLedgerIds", "emailDeliveryIds",
    "emailEventIds", "paymentEventIds", "refundIds"], "zero allowed commerce topology");
  const collections: Record<string, readonly { idHash: string }[]> = {
    paymentEventIds: commerce.paymentEvents, accessKeyIds: commerce.creditAuthority.accessKeys,
    creditLedgerIds: commerce.creditAuthority.creditLedger, refundIds: commerce.creditAuthority.refunds,
    emailDeliveryIds: commerce.emailAuthority.deliveries, emailEventIds: commerce.emailAuthority.events,
    accessTokenIds: commerce.accessTokens
  };
  for (const [name, values] of Object.entries(collections)) {
    const entry = exactRecord(topology[name], ["authorityRowsHash", "count", "idSetHash"], `zero commerce ${name}`);
    const ids = values.map((item) => item.idHash).sort();
    hash(entry.idSetHash, `zero commerce ${name} idSetHash`);
    if (entry.count !== ids.length || entry.authorityRowsHash !== digest(stableZeroJson(values))) {
      throw new Error(`Zero commerce ${name} differs from trusted commerce.`);
    }
  }
  const semantic = exactRecord(zero.semanticZeroProjection, ["databaseSupported", "runtimeOnly"], "zero semantic projection");
  const databaseSupported = exactRecord(semantic.databaseSupported, ["correctionFulfillmentCount", "extraSnapshotCountAfterPayment",
    "fullRerunCount", "replacementFulfillmentCount"], "zero database semantic projection");
  if (Object.values(databaseSupported).some((value) => value !== 0)
      || stableJson(semantic.runtimeOnly) !== stableJson({ pdfInvocationCount: "unavailable" })) throw new Error("Zero semantic projection is invalid.");
  if (stableJson(zero.unavailableRuntimeFacts) !== stableJson([{ name: "pdf_invocation_count", availability: "runtime_only",
    reason: "no_attempt_authority_in_postgresql" }])) throw new Error("Zero runtime-only fact boundary is invalid.");
}

function validateCompleteCommerce(value: unknown, phase: "baseline" | "final", scenarioKind: string): Record<string, unknown> {
  const commerce = exactRecord(value, [
    "accessTokens", "artifacts", "capturedAt", "creditAuthority", "diagnosisCheckpoints", "dispatches", "emailAuthority",
    "fingerprint", "jobs", "orders", "paymentEvents", "phase", "questionCheckpoints", "scenarioKind", "scope", "transactionProfile"
  ], "complete commerce authority");
  if (commerce.phase !== phase || commerce.scenarioKind !== scenarioKind) throw new Error("Complete commerce phase/scenario topology mismatch.");
  canonicalUtcInstant(commerce.capturedAt, "commerce capturedAt");
  validateTransactionProfile(commerce.transactionProfile);
  const normalized = {
    phase: commerce.phase,
    capturedAt: commerce.capturedAt,
    scope: commerce.scope,
    orders: commerce.orders,
    paymentEvents: commerce.paymentEvents,
    jobs: commerce.jobs,
    dispatches: commerce.dispatches,
    creditAuthority: commerce.creditAuthority,
    emailAuthority: commerce.emailAuthority,
    accessTokens: commerce.accessTokens,
    artifacts: commerce.artifacts,
    questionCheckpoints: commerce.questionCheckpoints,
    diagnosisCheckpoints: commerce.diagnosisCheckpoints
  };
  const recomputed = fingerprintNormalizedReportV4CommerceAuthority(normalized);
  if (commerce.fingerprint !== recomputed) throw new Error("Complete commerce fingerprint does not match its canonical full payload.");
  return commerce;
}

function validateCompleteSession(value: unknown): void {
  const session = exactRecord(value, [
    "eventCount", "headHash", "headSequence", "scenarioIdHash", "scenarioState", "sessionIdHash", "sessionState"
  ], "complete phase session authority");
  hash(session.sessionIdHash, "sessionIdHash");
  hash(session.scenarioIdHash, "scenarioIdHash");
  hash(session.headHash, "headHash");
  const headSequence = nonnegativeInteger(session.headSequence, "headSequence");
  const eventCount = nonnegativeInteger(session.eventCount, "eventCount");
  if (headSequence !== eventCount) throw new Error("Complete phase session eventCount must equal headSequence.");
  if (parseState(session.sessionState, "session state") !== "collecting"
      || parseState(session.scenarioState, "scenario state") !== "collecting") {
    throw new Error("Complete phase session and scenario must be collecting at capture time.");
  }
}

function validateTransactionProfile(value: unknown): void {
  const profile = exactRecord(value, ["isolation", "readOnly"], "authority transaction profile");
  if (profile.isolation !== "repeatable read" || profile.readOnly !== true) {
    throw new Error("Authority transaction profile must be repeatable-read and read-only.");
  }
}

function parsePhaseIdentity(
  input: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">
): Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase"> {
  if (!input || typeof input !== "object" || !UUID.test(input.sessionId) || !UUID.test(input.scenarioId)
      || (input.phase !== "baseline" && input.phase !== "final")) {
    throw new TypeError("Report V4 authority phase persistence identity is invalid.");
  }
  return { sessionId: input.sessionId, scenarioId: input.scenarioId, phase: input.phase };
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an exact object.`);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are incomplete or non-canonical.`);
  }
  return value as Record<string, unknown>;
}

function parseInput(input: LoadReportV4CommerceAuthoritySnapshotInput): LoadReportV4CommerceAuthoritySnapshotInput {
  if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "phase,scenarioId,sessionId"
      || !UUID.test(input.sessionId) || !UUID.test(input.scenarioId)
      || (input.phase !== "baseline" && input.phase !== "final")) {
    throw new TypeError("Report V4 authority phase input is invalid.");
  }
  return input;
}

function exactlyOne(rows: readonly Record<string, unknown>[], label: string): Record<string, unknown> {
  if (rows.length !== 1) throw new Error(`Report V4 authority phase ${label} must contain exactly one row.`);
  return rows[0]!;
}

function parseScenarioKind(value: unknown): ReportV4AcceptanceAuthorityPhaseFoundation["scenarioKind"] {
  if (value !== "success" && value !== "diagnosis_failure" && value !== "question_failure") {
    throw new Error("Report V4 authority phase scenario kind is invalid.");
  }
  return value;
}

function parseState(value: unknown, label: string): "collecting" | "sealed" | "failed" {
  if (value !== "collecting" && value !== "sealed" && value !== "failed") {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  const candidate = text(value, label);
  if (!HASH.test(candidate)) throw new Error(`Report V4 authority phase ${label} is not a SHA-256 hash.`);
  return candidate;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return candidate;
}

function timestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : new Date(text(value, label));
  if (!Number.isFinite(date.getTime())) throw new Error(`Report V4 authority phase ${label} is invalid.`);
  return date.toISOString();
}

function canonicalUtcInstant(value: unknown, label: string): number {
  if (typeof value !== "string") throw new Error(`Report V4 authority phase ${label} must be a canonical UTC ISO instant.`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`Report V4 authority phase ${label} must be a canonical UTC ISO instant.`);
  }
  return milliseconds;
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  throw new TypeError("Report V4 authority phase canonical payload contains an unsupported value.");
}

function stableLocaleJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableLocaleJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableLocaleJson(child)}`).join(",")}}`;
  }
  throw new TypeError("Report V4 authority canonical payload contains an unsupported locale-sorted value.");
}

function stableZeroJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableZeroJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableZeroJson(child)}`).join(",")}}`;
  }
  throw new TypeError("Report V4 zero-effects canonical payload contains an unsupported value.");
}
