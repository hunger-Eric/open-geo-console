import { createHash } from "node:crypto";
import {
  loadReportV4CommerceAuthoritySnapshotInTransaction,
  type ReportV4CommerceAuthoritySnapshot
} from "./report-v4-commerce-authority-snapshot";

type Row = Record<string, unknown>;
type Rows = Row[];

export type ReportV4ZeroDatabaseEffectsTransactionSql = {
  unsafe<T extends Rows = Rows>(query: string, parameters?: unknown[]): Promise<T>;
};

export interface ReportV4ZeroDatabaseEffectsSql {
  begin<T>(options: string, work: (sql: ReportV4ZeroDatabaseEffectsTransactionSql) => Promise<T>): Promise<T>;
}

export interface ReportV4AllowedCommerceIds {
  readonly paymentEventIds: readonly string[];
  readonly accessKeyIds: readonly string[];
  readonly creditLedgerIds: readonly string[];
  readonly refundIds: readonly string[];
  readonly emailDeliveryIds: readonly string[];
  readonly emailEventIds: readonly string[];
  readonly accessTokenIds: readonly string[];
}

export interface LoadReportV4ZeroDatabaseEffectsAuthorityInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}

export const REPORT_V4_ZERO_DATABASE_FACT_NAMES = [
  "correction_fulfillment_records",
  "correction_fulfillment_jobs",
  "replacement_fulfillment_records",
  "replacement_fulfillment_jobs",
  "full_report_rerun_jobs",
  "extra_job_rows",
  "extra_artifact_rows",
  "extra_combined_payload_rows",
  "extra_order_rows",
  "extra_report_rows",
  "extra_payment_event_rows",
  "extra_access_key_rows",
  "extra_credit_reservation_or_settlement_rows",
  "extra_refund_rows",
  "extra_email_delivery_rows",
  "extra_email_event_rows",
  "extra_access_token_rows",
  "pdf_sha256_fields",
  "pdf_storage_keys",
  "pdf_readiness_fields",
  "customer_pdf_artifacts",
  "legacy_ai_report_rows",
  "legacy_crawl_evidence_rows",
  "legacy_evidence_asset_rows",
  "provider_claim_snapshot_refs",
  "provider_claim_rows",
  "qualification_report_rows",
  "four_snapshot_run_rows",
  "four_snapshot_report_rows",
  "extra_site_snapshots_after_payment",
  "extra_site_snapshot_pages_after_payment"
] as const;

export type ReportV4ZeroDatabaseFactName = typeof REPORT_V4_ZERO_DATABASE_FACT_NAMES[number];

export interface ReportV4ZeroDatabaseFactRecord {
  readonly name: ReportV4ZeroDatabaseFactName;
  readonly count: 0;
  readonly scope: "exact_report_order_job_lineage";
}

export interface ReportV4ZeroDatabaseEffectsAuthority {
  readonly contractVersion: "report-v4-zero-database-effects-authority-v1";
  readonly phase: "baseline" | "final";
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly capturedAt: string;
  readonly paidAt: string;
  readonly lineage: Readonly<{
    sessionIdHash: string;
    scenarioIdHash: string;
    reportIdHash: string;
    orderIdHash: string;
    preAdmissionJobIdHash: string;
    coreJobIdHash: string;
    enhancementJobIdHash: string | null;
    jobIdSetHash: string;
    coreArtifactRevisionIdHash: string;
    enhancementArtifactRevisionIdHash: string | null;
    artifactRevisionIdSetHash: string;
    siteSnapshotIdSetHash: string;
    configSnapshotIdHash: string;
    questionSetIdHash: string;
    activeArtifactRevisionIdHash: string;
  }>;
  readonly allowedCommerceTopology: Readonly<Record<keyof ReportV4AllowedCommerceIds, Readonly<{
    count: number;
    idSetHash: string;
    authorityRowsHash: string;
  }>>>;
  readonly facts: readonly ReportV4ZeroDatabaseFactRecord[];
  readonly semanticZeroProjection: Readonly<{
    databaseSupported: Readonly<{
      replacementFulfillmentCount: 0;
      correctionFulfillmentCount: 0;
      fullRerunCount: 0;
      extraSnapshotCountAfterPayment: 0;
    }>;
    runtimeOnly: Readonly<{ pdfInvocationCount: "unavailable" }>;
  }>;
  readonly unavailableRuntimeFacts: readonly [Readonly<{
    name: "pdf_invocation_count";
    availability: "runtime_only";
    reason: "no_attempt_authority_in_postgresql";
  }>];
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
  readonly canonicalHash: string;
}

export interface ReportV4ZeroDatabaseEffectsRawSnapshot {
  readonly capturedAt: unknown;
  readonly anchor: Row;
  readonly commerceAuthority: ReportV4CommerceAuthoritySnapshot;
  readonly commerceRows: Rows;
  readonly factRows: Rows;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const COMMERCE_COLLECTIONS = [
  "paymentEventIds", "accessKeyIds", "creditLedgerIds", "refundIds",
  "emailDeliveryIds", "emailEventIds", "accessTokenIds"
] as const;
const ENHANCEMENT_JOB_ANCHOR_KEYS = [
  "enhancement_job_id", "enhancement_job_row_id", "enhancement_report_id", "enhancement_site_snapshot_id",
  "enhancement_tier", "enhancement_product_contract", "enhancement_fulfillment_methodology",
  "enhancement_recommendation_report_version", "enhancement_artifact_contract", "enhancement_question_set_id",
  "enhancement_locale", "enhancement_reason", "enhancement_credit_reservation_id", "enhancement_correction_id",
  "enhancement_replacement_fulfillment_id"
] as const;
const ENHANCEMENT_ARTIFACT_ANCHOR_KEYS = [
  "enhancement_artifact_revision_id", "enhancement_artifact_row_id", "enhancement_artifact_report_id",
  "enhancement_artifact_order_id", "enhancement_artifact_job_id", "enhancement_artifact_config_snapshot_id",
  "enhancement_artifact_source_revision_id", "enhancement_artifact_revision_kind", "enhancement_artifact_row_contract",
  "enhancement_artifact_status", "enhancement_payload_report_id", "enhancement_payload_order_id",
  "enhancement_payload_job_id", "enhancement_payload_question_set_id"
] as const;
const ANCHOR_KEYS = [
  "session_id", "scenario_id", "kind", "scenario_state", "session_state", "report_id", "order_id",
  "pre_admission_job_id", "core_job_id", "site_snapshot_id", "config_snapshot_id", "question_set_id",
  "core_artifact_revision_id", "bound_report_id", "active_artifact_revision_id", "report_locale",
  "order_report_id", "order_core_job_id", "order_site_snapshot_id", "order_question_set_id", "order_report_locale",
  "order_provider", "payment_status", "fulfillment_status", "refund_status", "paid_at", "product_code", "fulfillment_methodology",
  "recommendation_report_version", "pre_job_id", "pre_report_id", "pre_site_snapshot_id", "pre_tier",
  "pre_product_contract", "pre_fulfillment_methodology", "pre_recommendation_report_version", "pre_artifact_contract",
  "pre_question_set_id", "pre_locale", "pre_reason", "pre_credit_reservation_id", "pre_correction_id",
  "pre_replacement_fulfillment_id", "core_job_row_id", "core_report_id", "core_site_snapshot_id", "core_tier",
  "core_product_contract", "core_fulfillment_methodology", "core_recommendation_report_version", "core_artifact_contract",
  "core_question_set_id", "core_locale", "core_reason", "core_credit_reservation_id", "core_correction_id",
  "core_replacement_fulfillment_id", "core_artifact_row_id", "core_artifact_report_id", "core_artifact_order_id",
  "core_artifact_job_id", "core_artifact_config_snapshot_id", "core_artifact_source_revision_id",
  "core_artifact_revision_kind", "core_artifact_row_contract", "core_artifact_status", "core_payload_report_id",
  "core_payload_order_id", "core_payload_job_id", "core_payload_question_set_id",
  ...ENHANCEMENT_JOB_ANCHOR_KEYS, ...ENHANCEMENT_ARTIFACT_ANCHOR_KEYS
] as const;

/**
 * Proves transaction-scoped PostgreSQL zero effects. It deliberately does not
 * claim invocation attempts; those are owned by the runtime acceptance ledger.
 * @requirement GEO-V4-ACCEPT-01
 * @requirement GEO-V4-COMMERCE-01
 * @requirement GEO-V4-PDF-01
 * @requirement GEO-V4-LEGACY-01
 */
export async function loadReportV4ZeroDatabaseEffectsAuthority(
  sql: ReportV4ZeroDatabaseEffectsSql,
  input: LoadReportV4ZeroDatabaseEffectsAuthorityInput
): Promise<ReportV4ZeroDatabaseEffectsAuthority> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const commerceAuthority = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, parsed);
    return loadReportV4ZeroDatabaseEffectsAuthorityInTransaction(tx, parsed, commerceAuthority);
  });
}

/** Caller-owned transaction variant. It never opens or nests a transaction. */
export async function loadReportV4ZeroDatabaseEffectsAuthorityInTransaction(
  tx: ReportV4ZeroDatabaseEffectsTransactionSql,
  input: LoadReportV4ZeroDatabaseEffectsAuthorityInput,
  commerceAuthority: ReportV4CommerceAuthoritySnapshot
): Promise<ReportV4ZeroDatabaseEffectsAuthority> {
  const parsed = parseInput(input);
  const isolation = one(await query(tx, "isolation", `SELECT current_setting('transaction_isolation') transaction_isolation,
    current_setting('transaction_read_only') transaction_read_only,clock_timestamp() captured_at`), "transaction isolation");
  exactKeys(isolation, ["transaction_isolation", "transaction_read_only", "captured_at"], "transaction isolation");
  if (isolation.transaction_isolation !== "repeatable read" || isolation.transaction_read_only !== "on") {
    fail("repeatable-read read-only transaction is required");
  }

  const anchor = one(await query(tx, "anchor", `SELECT s.session_id,s.id scenario_id,s.kind,s.state scenario_state,
    session.state session_state,s.report_id,s.order_id,s.pre_admission_job_id,s.core_job_id,s.enhancement_job_id,
    s.site_snapshot_id,s.config_snapshot_id,s.question_set_id,s.core_artifact_revision_id,s.enhancement_artifact_revision_id,
    r.id bound_report_id,r.active_artifact_revision_id,r.report_locale,
    o.report_id order_report_id,o.fulfillment_job_id order_core_job_id,o.site_snapshot_id order_site_snapshot_id,
    o.business_question_set_id order_question_set_id,o.report_locale order_report_locale,o.payment_status,o.fulfillment_status,o.refund_status,
    o.provider order_provider,o.paid_at,o.product_code,o.fulfillment_methodology,o.recommendation_report_version,
    pre.id pre_job_id,pre.report_id pre_report_id,pre.site_snapshot_id pre_site_snapshot_id,pre.tier pre_tier,
    pre.product_contract pre_product_contract,pre.fulfillment_methodology pre_fulfillment_methodology,
    pre.recommendation_report_version pre_recommendation_report_version,pre.artifact_contract pre_artifact_contract,
    pre.business_question_set_id pre_question_set_id,pre.locale pre_locale,pre.reason pre_reason,
    pre.credit_reservation_id pre_credit_reservation_id,pre.correction_id pre_correction_id,
    pre.replacement_fulfillment_id pre_replacement_fulfillment_id,
    core.id core_job_row_id,core.report_id core_report_id,core.site_snapshot_id core_site_snapshot_id,core.tier core_tier,
    core.product_contract core_product_contract,core.fulfillment_methodology core_fulfillment_methodology,
    core.recommendation_report_version core_recommendation_report_version,core.artifact_contract core_artifact_contract,
    core.business_question_set_id core_question_set_id,core.locale core_locale,core.reason core_reason,
    core.credit_reservation_id core_credit_reservation_id,core.correction_id core_correction_id,
    core.replacement_fulfillment_id core_replacement_fulfillment_id,
    enhancement.id enhancement_job_row_id,enhancement.report_id enhancement_report_id,
    enhancement.site_snapshot_id enhancement_site_snapshot_id,enhancement.tier enhancement_tier,
    enhancement.product_contract enhancement_product_contract,enhancement.fulfillment_methodology enhancement_fulfillment_methodology,
    enhancement.recommendation_report_version enhancement_recommendation_report_version,
    enhancement.artifact_contract enhancement_artifact_contract,enhancement.business_question_set_id enhancement_question_set_id,
    enhancement.locale enhancement_locale,enhancement.reason enhancement_reason,
    enhancement.credit_reservation_id enhancement_credit_reservation_id,enhancement.correction_id enhancement_correction_id,
    enhancement.replacement_fulfillment_id enhancement_replacement_fulfillment_id,
    core_artifact.id core_artifact_row_id,core_artifact.report_id core_artifact_report_id,
    core_artifact.order_id core_artifact_order_id,core_artifact.job_id core_artifact_job_id,
    core_artifact.config_snapshot_id core_artifact_config_snapshot_id,
    core_artifact.source_artifact_revision_id core_artifact_source_revision_id,
    core_artifact.revision_kind core_artifact_revision_kind,core_artifact.artifact_contract core_artifact_row_contract,
    core_artifact.status core_artifact_status,
    core_payload.report_id core_payload_report_id,core_payload.order_id core_payload_order_id,
    core_payload.job_id core_payload_job_id,core_payload.question_set_id core_payload_question_set_id,
    enhancement_artifact.id enhancement_artifact_row_id,enhancement_artifact.report_id enhancement_artifact_report_id,
    enhancement_artifact.order_id enhancement_artifact_order_id,enhancement_artifact.job_id enhancement_artifact_job_id,
    enhancement_artifact.config_snapshot_id enhancement_artifact_config_snapshot_id,
    enhancement_artifact.source_artifact_revision_id enhancement_artifact_source_revision_id,
    enhancement_artifact.revision_kind enhancement_artifact_revision_kind,
    enhancement_artifact.artifact_contract enhancement_artifact_row_contract,enhancement_artifact.status enhancement_artifact_status,
    enhancement_payload.report_id enhancement_payload_report_id,enhancement_payload.order_id enhancement_payload_order_id,
    enhancement_payload.job_id enhancement_payload_job_id,enhancement_payload.question_set_id enhancement_payload_question_set_id
    FROM report_v4_acceptance_scenarios s
    JOIN report_v4_acceptance_sessions session ON session.id=s.session_id
    JOIN scan_reports r ON r.id=s.report_id
    JOIN payment_orders o ON o.id=s.order_id
    JOIN scan_jobs pre ON pre.id=s.pre_admission_job_id
    JOIN scan_jobs core ON core.id=s.core_job_id
    LEFT JOIN scan_jobs enhancement ON enhancement.id=s.enhancement_job_id
    JOIN report_artifact_revisions core_artifact ON core_artifact.id=s.core_artifact_revision_id
    JOIN combined_geo_reports core_payload ON core_payload.artifact_revision_id=core_artifact.id
    LEFT JOIN report_artifact_revisions enhancement_artifact ON enhancement_artifact.id=s.enhancement_artifact_revision_id
    LEFT JOIN combined_geo_reports enhancement_payload ON enhancement_payload.artifact_revision_id=enhancement_artifact.id
    WHERE s.session_id=$1 AND s.id=$2`, [parsed.sessionId, parsed.scenarioId]), "zero-effects anchor");
  const binding = parseAnchor(anchor, parsed);

  const commerceRows = await query(tx, "commerce", `WITH scoped_deliveries AS (
      SELECT id,order_id,report_id,provider,provider_email_id FROM email_deliveries
      WHERE report_id=$2 OR order_id=$1
    ), email_event_candidates AS (
      SELECT e.* FROM email_delivery_events e WHERE EXISTS (
        SELECT 1 FROM scoped_deliveries d WHERE e.delivery_id=d.id OR e.provider_email_id=d.provider_email_id)
    ), matched_email_events AS (
      SELECT e.id,match.order_id,match.report_id,match.delivery_id FROM email_event_candidates e
      CROSS JOIN LATERAL (
        SELECT min(d.order_id) order_id,min(d.report_id) report_id,min(d.id) delivery_id,count(*)::integer match_count
        FROM scoped_deliveries d WHERE CASE WHEN e.delivery_id IS NULL
          THEN d.provider=e.provider AND d.provider_email_id=e.provider_email_id
          ELSE d.id=e.delivery_id AND d.provider=e.provider AND d.provider_email_id=e.provider_email_id END
      ) match WHERE match.match_count=1
    ) SELECT 'paymentEventIds' collection,id,order_id,NULL::text report_id,NULL::text parent_id,
      event_type role,processing_status status,NULL::integer numeric_value,provider,provider_created_at occurred_at,NULL::text auxiliary_id
    FROM payment_events WHERE order_id=$1
    UNION ALL SELECT 'accessKeyIds',id,payment_order_id,NULL,NULL,NULL,status,credits_remaining,NULL,NULL,NULL
      FROM access_keys WHERE payment_order_id=$1
    UNION ALL SELECT 'creditLedgerIds',id,payment_order_id,report_id,job_id,NULL,status,credits,NULL,settled_at,access_key_id
      FROM credit_ledger WHERE report_id=$2 OR payment_order_id=$1
    UNION ALL SELECT 'refundIds',id,order_id,NULL,NULL,reason,state,amount_minor,provider,succeeded_at,NULL
      FROM payment_refunds WHERE order_id=$1
    UNION ALL SELECT 'emailDeliveryIds',id,order_id,report_id,NULL,template_type,state,attempts,provider,delivered_at,provider_email_id
      FROM email_deliveries WHERE report_id=$2 OR order_id=$1
    UNION ALL SELECT 'emailEventIds',e.id,m.order_id,m.report_id,m.delivery_id,e.event_type,e.processing_status,NULL,e.provider,
      e.provider_created_at,e.provider_email_id FROM email_event_candidates e JOIN matched_email_events m ON m.id=e.id
    UNION ALL SELECT 'accessTokenIds',id,NULL,report_id,NULL,artifact_scope,
      CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'revoked' END,NULL,NULL,NULL,NULL
      FROM report_access_tokens WHERE report_id=$2
    ORDER BY collection,id`, [binding.orderId, binding.reportId]);

  const commerceIds = validateCommerceAuthority(commerceAuthority, commerceRows, binding, parsed);

  const factRows = await query(tx, "facts", zeroFactsSql(), [
    binding.reportId, binding.orderId, binding.paidAt, binding.jobIds, binding.artifactRevisionIds,
    commerceIds.paymentEventIds, commerceIds.accessKeyIds, commerceIds.creditLedgerIds, commerceIds.refundIds,
    commerceIds.emailDeliveryIds, commerceIds.emailEventIds, commerceIds.accessTokenIds, [binding.siteSnapshotId]
  ]);

  return projectReportV4ZeroDatabaseEffectsAuthority(parsed, {
    capturedAt: isolation.captured_at, anchor, commerceAuthority, commerceRows, factRows
  });
}

export function projectReportV4ZeroDatabaseEffectsAuthority(
  input: LoadReportV4ZeroDatabaseEffectsAuthorityInput,
  raw: ReportV4ZeroDatabaseEffectsRawSnapshot
): ReportV4ZeroDatabaseEffectsAuthority {
  const parsed = parseInput(input);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("raw snapshot is invalid");
  const binding = parseAnchor(raw.anchor, parsed);
  const capturedAt = instant(raw.capturedAt, "captured_at");
  const allowedCommerceTopology = projectCommerce(raw.commerceAuthority, raw.commerceRows, binding, parsed);
  const facts = projectFacts(raw.factRows);
  const lineage = Object.freeze({
    sessionIdHash: sha(parsed.sessionId), scenarioIdHash: sha(parsed.scenarioId),
    reportIdHash: sha(binding.reportId), orderIdHash: sha(binding.orderId),
    preAdmissionJobIdHash: sha(binding.preAdmissionJobId), coreJobIdHash: sha(binding.coreJobId),
    enhancementJobIdHash: binding.enhancementJobId ? sha(binding.enhancementJobId) : null,
    jobIdSetHash: setHash(binding.jobIds), artifactRevisionIdSetHash: setHash(binding.artifactRevisionIds),
    coreArtifactRevisionIdHash: sha(binding.coreArtifactRevisionId),
    enhancementArtifactRevisionIdHash: binding.enhancementArtifactRevisionId ? sha(binding.enhancementArtifactRevisionId) : null,
    siteSnapshotIdSetHash: setHash([binding.siteSnapshotId]), configSnapshotIdHash: sha(binding.configSnapshotId),
    questionSetIdHash: sha(binding.questionSetId), activeArtifactRevisionIdHash: sha(binding.activeArtifactRevisionId)
  });
  const unavailableRuntimeFacts = Object.freeze([Object.freeze({
    name: "pdf_invocation_count" as const,
    availability: "runtime_only" as const,
    reason: "no_attempt_authority_in_postgresql" as const
  })]) as unknown as ReportV4ZeroDatabaseEffectsAuthority["unavailableRuntimeFacts"];
  const semanticZeroProjection = Object.freeze({
    databaseSupported: Object.freeze({
      replacementFulfillmentCount: 0 as const,
      correctionFulfillmentCount: 0 as const,
      fullRerunCount: 0 as const,
      extraSnapshotCountAfterPayment: 0 as const
    }),
    runtimeOnly: Object.freeze({ pdfInvocationCount: "unavailable" as const })
  });
  const projection = {
    contractVersion: "report-v4-zero-database-effects-authority-v1" as const,
    phase: parsed.phase, scenarioKind: binding.scenarioKind, capturedAt, paidAt: binding.paidAt,
    lineage, allowedCommerceTopology, facts, semanticZeroProjection, unavailableRuntimeFacts,
    transactionProfile: Object.freeze({ isolation: "repeatable read" as const, readOnly: true as const })
  };
  return Object.freeze({ ...projection, canonicalHash: hashJson({ ...projection, capturedAt: undefined }) });
}

type Binding = {
  scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  reportId: string; orderId: string; siteSnapshotId: string; paidAt: string; orderProvider: string;
  preAdmissionJobId: string; coreJobId: string; enhancementJobId: string | null;
  coreArtifactRevisionId: string; enhancementArtifactRevisionId: string | null;
  configSnapshotId: string; questionSetId: string; activeArtifactRevisionId: string;
  jobIds: readonly string[]; artifactRevisionIds: readonly string[];
};

function parseAnchor(row: Row, input: ReturnType<typeof parseInput>): Binding {
  exactKeys(row, ANCHOR_KEYS, "anchor row");
  equal(row.session_id, input.sessionId, "session");
  equal(row.scenario_id, input.scenarioId, "scenario");
  if (row.session_state !== "collecting" || row.scenario_state !== "collecting") fail("acceptance lineage must remain collecting");
  const scenarioKind = enumValue(row.kind, ["success", "diagnosis_failure", "question_failure"], "scenario kind");
  const reportId = required(row.report_id, "report id");
  const orderId = required(row.order_id, "order id");
  const configSnapshotId = required(row.config_snapshot_id, "config snapshot id");
  const questionSetId = required(row.question_set_id, "question set id");
  equal(row.bound_report_id, reportId, "bound report");
  equal(row.order_report_id, reportId, "order report");
  const preAdmissionJobId = required(row.pre_admission_job_id, "pre-admission job id");
  const coreJobId = required(row.core_job_id, "core job id");
  if (preAdmissionJobId === coreJobId) fail("pre-admission and core job identities must be distinct");
  const siteSnapshotId = required(row.site_snapshot_id, "site snapshot id");
  equal(row.order_core_job_id, coreJobId, "order core job");
  equal(row.order_site_snapshot_id, siteSnapshotId, "order site snapshot");
  equal(row.order_question_set_id, questionSetId, "order question set");
  equal(row.order_report_locale, row.report_locale, "order report locale");
  if (row.product_code !== "recommendation_forensics_v1" || row.fulfillment_methodology !== "two_stage_geo_report_v4"
      || row.recommendation_report_version !== 4 || row.payment_status !== "paid" || row.fulfillment_status !== "completed"
      || row.refund_status !== "not_required") fail("order is not the exact settled V4 commerce topology");
  const enhancementJobId = nullable(row.enhancement_job_id, "enhancement job id");
  const coreArtifactRevisionId = required(row.core_artifact_revision_id, "core artifact revision id");
  const enhancementArtifactRevisionId = nullable(row.enhancement_artifact_revision_id, "enhancement artifact revision id");
  const shouldEnhance = input.phase === "final" && scenarioKind !== "question_failure";
  if (shouldEnhance !== (enhancementJobId !== null) || shouldEnhance !== (enhancementArtifactRevisionId !== null)) {
    fail("scenario phase enhancement topology is invalid");
  }
  if (enhancementJobId && (enhancementJobId === preAdmissionJobId || enhancementJobId === coreJobId)) {
    fail("pre-admission, core, and enhancement job identities must be distinct");
  }
  if (enhancementArtifactRevisionId === coreArtifactRevisionId) fail("core and enhancement artifact identities must be distinct");
  assertJob(row, "pre", {
    id: preAdmissionJobId, reportId, siteSnapshotId: null, questionSetId: null,
    locale: row.report_locale, reason: "v4_pre_admission", creditRequired: false
  });
  assertJob(row, "core", {
    id: coreJobId, reportId, siteSnapshotId, questionSetId,
    locale: row.report_locale, reason: "standard", creditRequired: true
  });
  if (shouldEnhance) {
    const expectedEnhancementJobId = `v4-diagnosis-job-${createHash("sha256").update([
      reportId, orderId, coreJobId, coreArtifactRevisionId, configSnapshotId, siteSnapshotId, questionSetId,
      required(row.report_locale, "report locale")
    ].join("\0")).digest("hex")}`;
    equal(enhancementJobId, expectedEnhancementJobId, "deterministic enhancement job");
    assertJob(row, "enhancement", {
      id: enhancementJobId!, reportId, siteSnapshotId: null, questionSetId,
      locale: row.report_locale, reason: "v4_diagnosis_enhancement", creditRequired: false
    });
  } else {
    assertNullColumns(row, "enhancement job", ENHANCEMENT_JOB_ANCHOR_KEYS);
  }
  assertArtifact(row, "core", {
    id: coreArtifactRevisionId, reportId, orderId, jobId: coreJobId, configSnapshotId, questionSetId,
    sourceArtifactRevisionId: null, revisionKind: "generation", status: shouldEnhance ? "ready" : "active"
  });
  if (shouldEnhance) {
    assertArtifact(row, "enhancement", {
      id: enhancementArtifactRevisionId!, reportId, orderId, jobId: enhancementJobId!, configSnapshotId, questionSetId,
      sourceArtifactRevisionId: coreArtifactRevisionId, revisionKind: "diagnosis_enhancement", status: "active"
    });
    equal(row.active_artifact_revision_id, enhancementArtifactRevisionId, "active enhancement artifact");
  } else {
    assertNullColumns(row, "enhancement artifact", ENHANCEMENT_ARTIFACT_ANCHOR_KEYS);
    equal(row.active_artifact_revision_id, coreArtifactRevisionId, "active core artifact");
  }
  const paidAt = instant(row.paid_at, "order paid_at");
  const orderProvider = enumValue(row.order_provider, ["airwallex", "stripe"], "order provider");
  const activeArtifactRevisionId = required(row.active_artifact_revision_id, "active artifact revision id");
  return {
    scenarioKind, reportId, orderId, siteSnapshotId, paidAt, orderProvider,
    preAdmissionJobId, coreJobId, enhancementJobId, coreArtifactRevisionId, enhancementArtifactRevisionId,
    configSnapshotId, questionSetId, activeArtifactRevisionId,
    jobIds: Object.freeze([preAdmissionJobId, coreJobId, ...(enhancementJobId ? [enhancementJobId] : [])].sort()),
    artifactRevisionIds: Object.freeze([coreArtifactRevisionId, ...(enhancementArtifactRevisionId ? [enhancementArtifactRevisionId] : [])].sort())
  };
}

type JobRole = "pre" | "core" | "enhancement";
function assertJob(row: Row, prefix: JobRole, expected: {
  id: string; reportId: string; siteSnapshotId: string | null; questionSetId: string | null;
  locale: unknown; reason: string; creditRequired: boolean;
}): void {
  const idKey = prefix === "pre" ? "pre_job_id" : `${prefix}_job_row_id`;
  for (const [actual, value, label] of [
    [row[idKey],expected.id,`${prefix} job identity`], [row[`${prefix}_report_id`],expected.reportId,`${prefix} job report`],
    [row[`${prefix}_site_snapshot_id`],expected.siteSnapshotId,`${prefix} job site snapshot`],
    [row[`${prefix}_question_set_id`],expected.questionSetId,`${prefix} job question set`],
    [row[`${prefix}_locale`],expected.locale,`${prefix} job locale`]
  ] as const) equal(actual, value, label);
  if (row[`${prefix}_tier`] !== "deep" || row[`${prefix}_product_contract`] !== "recommendation_forensics_v1"
      || row[`${prefix}_fulfillment_methodology`] !== "two_stage_geo_report_v4"
      || row[`${prefix}_recommendation_report_version`] !== 4
      || row[`${prefix}_artifact_contract`] !== "combined_geo_report_v4" || row[`${prefix}_reason`] !== expected.reason
      || row[`${prefix}_correction_id`] !== null || row[`${prefix}_replacement_fulfillment_id`] !== null
      || (expected.creditRequired ? nullable(row[`${prefix}_credit_reservation_id`], `${prefix} credit reservation`) === null
        : row[`${prefix}_credit_reservation_id`] !== null)) {
    fail(`${prefix} job does not match its exact production V4 role`);
  }
}

function assertArtifact(row: Row, prefix: "core" | "enhancement", expected: {
  id: string; reportId: string; orderId: string; jobId: string; configSnapshotId: string; questionSetId: string;
  sourceArtifactRevisionId: string | null; revisionKind: string; status: string;
}): void {
  for (const [actual, value, label] of [
    [row[`${prefix}_artifact_row_id`],expected.id,`${prefix} artifact identity`],
    [row[`${prefix}_artifact_report_id`],expected.reportId,`${prefix} artifact report`],
    [row[`${prefix}_artifact_order_id`],expected.orderId,`${prefix} artifact order`],
    [row[`${prefix}_artifact_job_id`],expected.jobId,`${prefix} artifact job`],
    [row[`${prefix}_artifact_config_snapshot_id`],expected.configSnapshotId,`${prefix} artifact config`],
    [row[`${prefix}_artifact_source_revision_id`],expected.sourceArtifactRevisionId,`${prefix} artifact source`],
    [row[`${prefix}_artifact_revision_kind`],expected.revisionKind,`${prefix} artifact revision kind`],
    [row[`${prefix}_artifact_row_contract`],"combined_geo_report_v4",`${prefix} artifact contract`],
    [row[`${prefix}_artifact_status`],expected.status,`${prefix} artifact status`],
    [row[`${prefix}_payload_report_id`],expected.reportId,`${prefix} payload report`],
    [row[`${prefix}_payload_order_id`],expected.orderId,`${prefix} payload order`],
    [row[`${prefix}_payload_job_id`],expected.jobId,`${prefix} payload job`],
    [row[`${prefix}_payload_question_set_id`],expected.questionSetId,`${prefix} payload question set`]
  ] as const) equal(actual, value, label);
}

function assertNullColumns(row: Row, label: string, keys: readonly string[]): void {
  if (keys.some((key) => row[key] !== null)) fail(`${label} null topology is invalid`);
}

function validateCommerceAuthority(
  expected: ReportV4CommerceAuthoritySnapshot,
  rows: Rows,
  binding: Binding,
  input: ReturnType<typeof parseInput>
): ReportV4AllowedCommerceIds {
  projectCommerce(expected, rows, binding, input);
  const ids = {} as Record<string, readonly string[]>;
  for (const collection of COMMERCE_COLLECTIONS) {
    ids[collection] = Object.freeze(rows.filter((row) => row.collection === collection)
      .map((row) => required(row.id, `${collection} id`)).sort());
  }
  return Object.freeze(ids) as unknown as ReportV4AllowedCommerceIds;
}

function projectCommerce(
  expected: ReportV4CommerceAuthoritySnapshot,
  rows: Rows,
  binding: Binding,
  input: ReturnType<typeof parseInput>
): ReportV4ZeroDatabaseEffectsAuthority["allowedCommerceTopology"] {
  if (!Array.isArray(rows)) fail("commerce rows are invalid");
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
      || expected.phase !== input.phase || expected.scenarioKind !== binding.scenarioKind) {
    fail("trusted commerce authority phase or scenario mismatch");
  }
  if (!Array.isArray(expected.orders) || expected.orders.length !== 1 || expected.orders[0]?.paidAt !== binding.paidAt) {
    fail("trusted commerce authority paidAt does not match the unique bound order");
  }
  const trustedScope = expected.scope;
  if (!trustedScope || trustedScope.reportIdHash !== sha(binding.reportId) || trustedScope.orderIdHash !== sha(binding.orderId)
      || trustedScope.siteSnapshotIdHash !== sha(binding.siteSnapshotId)
      || trustedScope.configSnapshotIdHash !== sha(binding.configSnapshotId)
      || trustedScope.questionSetIdHash !== sha(binding.questionSetId)
      || trustedScope.preAdmissionJobIdHash !== sha(binding.preAdmissionJobId)
      || trustedScope.coreJobIdHash !== sha(binding.coreJobId)
      || trustedScope.enhancementJobIdHash !== (binding.enhancementJobId ? sha(binding.enhancementJobId) : null)
      || trustedScope.coreArtifactRevisionIdHash !== sha(binding.coreArtifactRevisionId)
      || trustedScope.enhancementArtifactRevisionIdHash !== (binding.enhancementArtifactRevisionId ? sha(binding.enhancementArtifactRevisionId) : null)
      || trustedScope.activeArtifactRevisionIdHash !== sha(binding.activeArtifactRevisionId)) {
    fail("trusted commerce authority scope does not match the exact zero-effects lineage");
  }
  const expectedRows: Record<keyof ReportV4AllowedCommerceIds, readonly unknown[]> = {
    paymentEventIds: expected.paymentEvents,
    accessKeyIds: expected.creditAuthority.accessKeys,
    creditLedgerIds: expected.creditAuthority.creditLedger,
    refundIds: expected.creditAuthority.refunds,
    emailDeliveryIds: expected.emailAuthority.deliveries,
    emailEventIds: expected.emailAuthority.events,
    accessTokenIds: expected.accessTokens
  };
  const expectedHashes: Record<keyof ReportV4AllowedCommerceIds, readonly string[]> = {
    paymentEventIds: expected.paymentEvents.map((row) => row.idHash),
    accessKeyIds: expected.creditAuthority.accessKeys.map((row) => row.idHash),
    creditLedgerIds: expected.creditAuthority.creditLedger.map((row) => row.idHash),
    refundIds: expected.creditAuthority.refunds.map((row) => row.idHash),
    emailDeliveryIds: expected.emailAuthority.deliveries.map((row) => row.idHash),
    emailEventIds: expected.emailAuthority.events.map((row) => row.idHash),
    accessTokenIds: expected.accessTokens.map((row) => row.idHash)
  };
  const scopedDeliveryIds = new Set(rows.filter((row) => row.collection === "emailDeliveryIds")
    .map((row) => required(row.id, "emailDeliveryIds id")));
  const output = {} as Record<string, Readonly<{ count: number; idSetHash: string; authorityRowsHash: string }>>;
  for (const collection of COMMERCE_COLLECTIONS) {
    const selected = rows.filter((row) => row.collection === collection);
    for (const row of selected) {
      exactKeys(row, ["collection", "id", "order_id", "report_id", "parent_id", "role", "status",
        "numeric_value", "provider", "occurred_at", "auxiliary_id"], `${collection} row`);
      required(row.id, `${collection} id`);
      if (collection === "paymentEventIds" || collection === "accessKeyIds" || collection === "refundIds") {
        equal(row.order_id, binding.orderId, `${collection} order`);
      } else if (collection === "creditLedgerIds" || collection === "emailDeliveryIds" || collection === "emailEventIds") {
        equal(row.order_id, binding.orderId, `${collection} order`);
        equal(row.report_id, binding.reportId, `${collection} report`);
        if (collection === "emailEventIds" && !scopedDeliveryIds.has(required(row.parent_id, "email event delivery id"))) {
          fail("emailEventIds is not paired to an allowed email delivery");
        }
      } else {
        equal(row.report_id, binding.reportId, `${collection} report`);
      }
    }
    const actualIds = selected.map((row) => required(row.id, `${collection} id`)).sort();
    const actualHashes = actualIds.map(sha).sort();
    const trustedHashes = [...expectedHashes[collection]].sort();
    if (stableJson(actualHashes) !== stableJson(trustedHashes)) {
      fail(`${collection} does not match the trusted commerce authority hash set`);
    }
    output[collection] = Object.freeze({ count: actualIds.length, idSetHash: setHash(actualIds),
      authorityRowsHash: hashJson(expectedRows[collection]) });
  }
  if (rows.some((row) => !COMMERCE_COLLECTIONS.includes(row.collection as typeof COMMERCE_COLLECTIONS[number]))) {
    fail("commerce rows contain an unknown collection");
  }
  assertCommerceRowsMatchTrustedRoles(rows, expected);
  assertExactCommerceRoles(rows, binding);
  return Object.freeze(output) as ReportV4ZeroDatabaseEffectsAuthority["allowedCommerceTopology"];
}

function assertCommerceRowsMatchTrustedRoles(rows: Rows, expected: ReportV4CommerceAuthoritySnapshot): void {
  const byHash = <T extends { idHash: string }>(values: readonly T[]): Map<string, T> =>
    new Map(values.map((value) => [value.idHash, value]));
  const payments = byHash(expected.paymentEvents);
  const keys = byHash(expected.creditAuthority.accessKeys);
  const credits = byHash(expected.creditAuthority.creditLedger);
  const deliveries = byHash(expected.emailAuthority.deliveries);
  const events = byHash(expected.emailAuthority.events);
  const tokens = byHash(expected.accessTokens);
  for (const row of rows) {
    const idHash = sha(required(row.id, "commerce role id"));
    if (row.collection === "paymentEventIds") {
      const trusted = payments.get(idHash);
      if (!trusted || row.role !== trusted.eventType || row.status !== trusted.processingStatus || row.provider !== trusted.provider) {
        fail("payment event role does not match trusted commerce authority");
      }
    } else if (row.collection === "accessKeyIds") {
      const trusted = keys.get(idHash);
      if (!trusted || row.status !== trusted.status || Number(row.numeric_value) !== trusted.creditsRemaining) {
        fail("access key role does not match trusted commerce authority");
      }
    } else if (row.collection === "creditLedgerIds") {
      const trusted = credits.get(idHash);
      if (!trusted || sha(required(row.parent_id, "credit job id")) !== trusted.jobIdHash
          || sha(required(row.auxiliary_id, "credit access key id")) !== trusted.accessKeyIdHash
          || row.status !== trusted.status || Number(row.numeric_value) !== trusted.credits) {
        fail("credit role does not match trusted commerce authority");
      }
    } else if (row.collection === "emailDeliveryIds") {
      const trusted = deliveries.get(idHash);
      if (!trusted || row.role !== trusted.templateType || row.status !== trusted.state || row.provider !== trusted.provider) {
        fail("email delivery role does not match trusted commerce authority");
      }
    } else if (row.collection === "emailEventIds") {
      const trusted = events.get(idHash);
      if (!trusted || row.role !== trusted.eventType || row.status !== trusted.processingStatus || row.provider !== trusted.provider) {
        fail("email event role does not match trusted commerce authority");
      }
    } else if (row.collection === "accessTokenIds") {
      const trusted = tokens.get(idHash);
      if (!trusted || row.role !== trusted.artifactScope
          || row.status !== (trusted.revokedAt === null ? "active" : "revoked")) {
        fail("access token role does not match trusted commerce authority");
      }
    }
  }
}

function assertExactCommerceRoles(rows: Rows, binding: Binding): void {
  const selected = (collection: keyof ReportV4AllowedCommerceIds) => rows.filter((row) => row.collection === collection);
  const payments = selected("paymentEventIds");
  if (payments.length !== 1 || payments[0]!.provider !== binding.orderProvider || payments[0]!.status !== "processed"
      || instant(payments[0]!.occurred_at, "payment provider_created_at") !== binding.paidAt
      || !required(payments[0]!.role, "payment event type")) fail("paymentEventIds is not the unique processed paid-order event");
  const keys = selected("accessKeyIds");
  if (keys.length !== 1 || keys[0]!.status !== "exhausted" || Number(keys[0]!.numeric_value) !== 0) {
    fail("accessKeyIds is not the unique exhausted paid-order entitlement");
  }
  const credits = selected("creditLedgerIds");
  if (credits.length !== 1 || credits[0]!.parent_id !== binding.coreJobId || credits[0]!.auxiliary_id !== keys[0]!.id
      || credits[0]!.status !== "settled" || Number(credits[0]!.numeric_value) !== 1 || credits[0]!.occurred_at === null) {
    fail("creditLedgerIds is not the unique settled core-job reservation");
  }
  if (selected("refundIds").length !== 0) fail("refundIds must be empty for the settled no-refund order");
  const deliveries = selected("emailDeliveryIds");
  if (stableJson(deliveries.map((row) => row.role).sort()) !== stableJson(["payment_confirmed", "report_ready"])) {
    fail("emailDeliveryIds must be the exact payment-confirmed and report-ready intents");
  }
  if (deliveries.some((row) => row.provider !== "resend" || !["queued", "sent", "delivered"].includes(String(row.status)))) {
    fail("emailDeliveryIds contains an invalid delivery role or state");
  }
  const deliveryById = new Map(deliveries.map((row) => [row.id, row]));
  const events = selected("emailEventIds");
  if (events.length > deliveries.length || new Set(events.map((row) => row.parent_id)).size !== events.length
      || events.some((row) => row.provider !== "resend" || row.status !== "processed"
        || deliveryById.get(row.parent_id)?.auxiliary_id !== row.auxiliary_id)) {
    fail("emailEventIds is not an at-most-once exact delivery-event topology");
  }
  const tokens = selected("accessTokenIds");
  if (tokens.length !== 1 || tokens[0]!.role !== "combined_geo_report_v4" || tokens[0]!.status !== "active") {
    fail("accessTokenIds is not the unique active V4 report grant");
  }
}

function projectFacts(rows: Rows): readonly ReportV4ZeroDatabaseFactRecord[] {
  if (!Array.isArray(rows)) fail("fact rows are invalid");
  if (rows.length !== REPORT_V4_ZERO_DATABASE_FACT_NAMES.length) fail("zero fact set is incomplete");
  const byName = new Map<string, Row>();
  for (const row of rows) {
    exactKeys(row, ["fact_name", "count"], "zero fact row");
    const name = required(row.fact_name, "fact name");
    if (!REPORT_V4_ZERO_DATABASE_FACT_NAMES.includes(name as ReportV4ZeroDatabaseFactName) || byName.has(name)) {
      fail("zero fact set contains an unknown or duplicate fact");
    }
    byName.set(name, row);
  }
  return Object.freeze(REPORT_V4_ZERO_DATABASE_FACT_NAMES.map((name) => {
    const count = countValue(byName.get(name)?.count, name);
    if (count !== 0) fail(`${name} must be zero; observed ${count}`);
    return Object.freeze({ name, count: 0 as const, scope: "exact_report_order_job_lineage" as const });
  }));
}

function zeroFactsSql(): string {
  return `WITH allowed_jobs AS (SELECT unnest($4::text[]) id), allowed_artifacts AS (SELECT unnest($5::text[]) id),
    allowed_deliveries AS (
      SELECT id,provider,provider_email_id FROM email_deliveries
      WHERE id=ANY($10::text[]) AND (report_id=$1 OR order_id=$2)
    ), email_event_candidates AS (
      SELECT e.* FROM email_delivery_events e WHERE e.id=ANY($11::text[]) OR EXISTS (
        SELECT 1 FROM allowed_deliveries d WHERE e.delivery_id=d.id OR e.provider_email_id=d.provider_email_id)
    ), facts AS (
    SELECT 'correction_fulfillment_records' fact_name,count(*)::integer count FROM report_corrections WHERE report_id=$1 OR order_id=$2
    UNION ALL SELECT 'correction_fulfillment_jobs',count(*)::integer FROM scan_jobs WHERE report_id=$1 AND (correction_id IS NOT NULL OR reason='paid_report_correction')
    UNION ALL SELECT 'replacement_fulfillment_records',count(*)::integer FROM report_replacement_fulfillments WHERE report_id=$1 OR order_id=$2
    UNION ALL SELECT 'replacement_fulfillment_jobs',count(*)::integer FROM scan_jobs WHERE report_id=$1 AND (replacement_fulfillment_id IS NOT NULL OR reason='replacement_fulfillment')
    UNION ALL SELECT 'full_report_rerun_jobs',count(*)::integer FROM scan_jobs WHERE report_id=$1 AND id NOT IN (SELECT id FROM allowed_jobs)
      AND correction_id IS NULL AND replacement_fulfillment_id IS NULL
    UNION ALL SELECT 'extra_job_rows',count(*)::integer FROM scan_jobs WHERE report_id=$1 AND id NOT IN (SELECT id FROM allowed_jobs)
    UNION ALL SELECT 'extra_artifact_rows',count(*)::integer FROM report_artifact_revisions WHERE report_id=$1 AND id NOT IN (SELECT id FROM allowed_artifacts)
    UNION ALL SELECT 'extra_combined_payload_rows',count(*)::integer FROM combined_geo_reports WHERE report_id=$1 AND artifact_revision_id NOT IN (SELECT id FROM allowed_artifacts)
    UNION ALL SELECT 'extra_order_rows',count(*)::integer FROM payment_orders WHERE report_id=$1 AND id<>$2
    UNION ALL SELECT 'extra_report_rows',count(*)::integer FROM payment_orders WHERE id=$2 AND report_id<>$1
    UNION ALL SELECT 'extra_payment_event_rows',count(*)::integer FROM payment_events WHERE order_id=$2 AND NOT (id=ANY($6::text[]))
    UNION ALL SELECT 'extra_access_key_rows',count(*)::integer FROM access_keys WHERE payment_order_id=$2 AND NOT (id=ANY($7::text[]))
    UNION ALL SELECT 'extra_credit_reservation_or_settlement_rows',count(*)::integer FROM credit_ledger WHERE (report_id=$1 OR payment_order_id=$2) AND NOT (id=ANY($8::text[]))
    UNION ALL SELECT 'extra_refund_rows',count(*)::integer FROM payment_refunds WHERE order_id=$2 AND NOT (id=ANY($9::text[]))
    UNION ALL SELECT 'extra_email_delivery_rows',count(*)::integer FROM email_deliveries WHERE (report_id=$1 OR order_id=$2) AND NOT (id=ANY($10::text[]))
    UNION ALL SELECT 'extra_email_event_rows',count(*)::integer FROM email_event_candidates e WHERE NOT (
      e.id=ANY($11::text[]) AND (SELECT count(*) FROM allowed_deliveries d WHERE CASE WHEN e.delivery_id IS NULL
        THEN d.provider=e.provider AND d.provider_email_id=e.provider_email_id
        ELSE d.id=e.delivery_id AND d.provider=e.provider AND d.provider_email_id=e.provider_email_id END)=1)
    UNION ALL SELECT 'extra_access_token_rows',count(*)::integer FROM report_access_tokens WHERE report_id=$1 AND NOT (id=ANY($12::text[]))
    UNION ALL SELECT 'pdf_sha256_fields',count(*)::integer FROM report_artifact_revisions WHERE report_id=$1 AND pdf_sha256 IS NOT NULL
    UNION ALL SELECT 'pdf_storage_keys',count(*)::integer FROM report_artifact_revisions WHERE report_id=$1 AND pdf_storage_key IS NOT NULL
    UNION ALL SELECT 'pdf_readiness_fields',count(*)::integer FROM report_artifact_revisions WHERE report_id=$1
      AND readiness ?| ARRAY['pageCount','privateEvidenceReady','pdfSha256','pdfStorageKey']
    UNION ALL SELECT 'customer_pdf_artifacts',count(*)::integer FROM report_artifact_revisions WHERE report_id=$1
      AND (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') OR pdf_sha256 IS NOT NULL OR pdf_storage_key IS NOT NULL)
    UNION ALL SELECT 'legacy_ai_report_rows',count(*)::integer FROM ai_reports WHERE report_id=$1
    UNION ALL SELECT 'legacy_crawl_evidence_rows',count(*)::integer FROM crawl_evidence WHERE report_id=$1
    UNION ALL SELECT 'legacy_evidence_asset_rows',count(*)::integer FROM report_evidence_assets WHERE report_id=$1
    UNION ALL SELECT 'provider_claim_snapshot_refs',count(*)::integer FROM report_market_snapshot_refs r JOIN market_snapshot_questions s ON s.id=r.snapshot_id
      WHERE r.report_id=$1 AND s.snapshot_kind IN ('provider_discovery','candidate_verification')
    UNION ALL SELECT 'provider_claim_rows',count(*)::integer FROM report_market_snapshot_refs r
      JOIN market_source_evidence e ON e.snapshot_id=r.snapshot_id JOIN market_source_passages p ON p.source_evidence_id=e.id
      JOIN market_provider_claims c ON c.passage_id=p.id WHERE r.report_id=$1
    UNION ALL SELECT 'qualification_report_rows',count(*)::integer FROM report_source_forensics WHERE report_id=$1
    UNION ALL SELECT 'four_snapshot_run_rows',count(*)::integer FROM answer_snapshot_runs WHERE report_id=$1
    UNION ALL SELECT 'four_snapshot_report_rows',count(*)::integer FROM recommendation_forensic_reports WHERE report_id=$1
    UNION ALL SELECT 'extra_site_snapshots_after_payment',count(*)::integer FROM report_v4_site_snapshots
      WHERE report_id=$1 AND created_at >= $3::timestamptz AND NOT (id=ANY($13::text[]))
    UNION ALL SELECT 'extra_site_snapshot_pages_after_payment',count(*)::integer FROM report_v4_site_snapshot_pages p
      JOIN report_v4_site_snapshots s ON s.id=p.snapshot_id WHERE s.report_id=$1 AND p.created_at >= $3::timestamptz
        AND NOT (s.id=ANY($13::text[]))
  ) SELECT fact_name,count FROM facts ORDER BY fact_name`;
}

function parseInput(input: LoadReportV4ZeroDatabaseEffectsAuthorityInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("input is invalid");
  exactKeys(input as unknown as Row, ["sessionId", "scenarioId", "phase"], "input");
  return Object.freeze({
    sessionId: uuid(input.sessionId, "session id"), scenarioId: uuid(input.scenarioId, "scenario id"),
    phase: enumValue(input.phase, ["baseline", "final"], "phase")
  });
}

async function query(tx: ReportV4ZeroDatabaseEffectsTransactionSql, label: string, sql: string, parameters: unknown[] = []): Promise<Rows> {
  try { return await tx.unsafe(sql, parameters); } catch (error) {
    throw new Error(`Report V4 zero-effects ${label} query failed closed.`, { cause: error });
  }
}

function one(rows: Rows, label: string): Row { if (!Array.isArray(rows) || rows.length !== 1) fail(`${label} must have exactly one row`); return rows[0]!; }
function exactKeys(row: Row, keys: readonly string[], label: string): void {
  if (!row || typeof row !== "object" || Array.isArray(row) || stableJson(Object.keys(row).sort()) !== stableJson([...keys].sort())) fail(`${label} has a non-canonical shape`);
}
function required(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) fail(`${label} is invalid`); return value; }
function nullable(value: unknown, label: string): string | null { return value === null ? null : required(value, label); }
function uuid(value: unknown, label: string): string { const result = required(value, label); if (!UUID.test(result)) fail(`${label} is not a canonical UUID`); return result; }
function instant(value: unknown, label: string): string { const date = value instanceof Date ? value : new Date(required(value, label)); if (!Number.isFinite(date.getTime())) fail(`${label} is invalid`); return date.toISOString(); }
function enumValue<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] { if (typeof value !== "string" || !values.includes(value)) fail(`${label} is invalid`); return value as T[number]; }
function equal(actual: unknown, expected: unknown, label: string): void { if (actual !== expected) fail(`${label} mismatch`); }
function countValue(value: unknown, label: string): number {
  const count = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(count) || (count as number) < 0) fail(`${label} count is invalid`);
  return count as number;
}
function setHash(values: readonly string[]): string { return sha(stableJson([...values].sort())); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function hashJson(value: unknown): string { return sha(stableJson(value)); }
function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value as Row).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  fail("canonical value is invalid");
}
function fail(message: string): never { throw new Error(`Report V4 zero database effects authority: ${message}.`); }
