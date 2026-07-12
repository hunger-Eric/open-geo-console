import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1, RecommendationForensicReportV1, SourceClassificationAuthoritySnapshot } from "@open-geo-console/ai-report-engine";
import type { AnswerExecutionStateLedger, CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import type {
  CitationRetrievalState,
  CitationSourceCategory,
  EvidenceGrade
} from "@open-geo-console/citation-intelligence";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export type ReportTier = "free" | "deep";
export type ReportLocale = "en" | "zh";
export type ReportTechnicalStatus = "pending" | "processing" | "completed" | "failed";
export type ScanJobReason = "standard" | "system_recovery" | "locale_correction" | "staging_regeneration";
export type ScanJobStage =
  | "queued"
  | "discovering"
  | "planning"
  | "fetching"
  | "analyzing"
  | "synthesizing"
  | "completed"
  | "completed_limited"
  | "failed";

export const deploymentEnvironment = pgTable("deployment_environment", {
  singleton: boolean("singleton").primaryKey().notNull().default(true),
  profile: text("profile").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check("deployment_environment_singleton_check", sql`${table.singleton} = true`),
  check("deployment_environment_profile_check", sql`${table.profile} IN ('staging','production')`)
]);
export type AccessKeyStatus = "active" | "revoked" | "exhausted";
export type CreditStatus = "reserved" | "settled" | "refunded";
export type CommerceCurrency = "CNY" | "USD" | "HKD";
export type PaymentProvider = "airwallex" | "stripe";
export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "cancelled";
export type FulfillmentStatus =
  | "not_started"
  | "queued"
  | "processing"
  | "completed"
  | "completed_limited"
  | "failed";
export type OrderRefundStatus = "not_required" | "pending" | "submitted" | "refunded" | "failed";
export type OrderDeliveryStatus = "not_queued" | "queued" | "sent" | "delivered" | "bounced" | "failed";
export type PaymentEventProcessingStatus = "received" | "processed" | "ignored" | "failed";
export type ReportProductContract = "legacy_website_audit_v1" | "recommendation_forensics_v1";
export type PaymentRefundReason = "completed_limited" | "report_failed" | "sla_missed" | "operator_approved";
export type PaymentRefundState = "pending" | "submitted" | "succeeded" | "failed";
export type EmailTemplateType =
  | "payment_confirmed"
  | "report_ready"
  | "limited_report_refund"
  | "report_failed_refund"
  | "refund_succeeded"
  | "refund_assistance"
  | "link_reissue";
export type EmailDeliveryState = "queued" | "sent" | "delivered" | "bounced" | "failed";
export type JobDispatchState = "pending" | "published" | "abandoned";
export type BatchRunStatus = "running" | "succeeded" | "partial" | "failed";
export type EvidenceAssetKind = "issue_crop" | "context" | "compact" | "viewport";
export type EvidenceAssetStatus = "ready" | "unavailable";
export type AnswerSnapshotCellStatus = "succeeded" | "failed";
export type CitationEvidenceGrade = EvidenceGrade;
export type { CitationRetrievalState, CitationSourceCategory };

export interface JobCheckpoint {
  contractVersion?: 1 | 2;
  websiteFoundation?: { completed: boolean; synthesisInputHash?: string };
  recommendationForensics?: { runId?: string; questionsGenerated?: boolean; reportSaved?: boolean };
  targetPageCount?: number;
  rankedCandidateUrls?: string[];
  effectivePlannedUrls?: string[];
  permanentFailures?: Array<{ url: string; error: string; code?: string }>;
  transientAttemptCounts?: Record<string, number>;
  completedCrawlUrls?: string[];
  completedPageAnalyses?: Array<{ url: string; contentHash: string; analysis: unknown }>;
  synthesisInputHash?: string;
  // Legacy keys remain readable while existing jobs drain and migrate to the
  // explicit recovery contract above.
  discoveredUrls?: string[];
  candidateUrls?: string[];
  plannedUrls?: string[];
  completedUrls?: string[];
  failedUrls?: Array<{ url: string; error: string }>;
  [key: string]: unknown;
}

export type StoredAiReport = AiWebsiteReportV1;

export const scanReports = pgTable(
  "scan_reports",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    siteKey: text("site_key"),
    kind: text("kind").notNull().default("geo"),
    score: integer("score"),
    payload: jsonb("payload").$type<GeoAuditReport>(),
    technicalStatus: text("technical_status").$type<ReportTechnicalStatus>().notNull().default("completed"),
    technicalErrorCode: text("technical_error_code"),
    technicalPublicError: text("technical_public_error"),
    admissionIdempotencyHmac: text("admission_idempotency_hmac"),
    reportLocale: text("report_locale").$type<ReportLocale>(),
    localeCorrectionUsedAt: timestamp("locale_correction_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("scan_reports_created_at_idx").on(table.createdAt),
    index("scan_reports_site_key_idx").on(table.siteKey),
    uniqueIndex("scan_reports_admission_idempotency_uidx").on(table.admissionIdempotencyHmac),
    check("scan_reports_technical_status_check", sql`${table.technicalStatus} IN ('pending', 'processing', 'completed', 'failed')`),
    check("scan_reports_report_locale_check", sql`${table.reportLocale} IS NULL OR ${table.reportLocale} IN ('en', 'zh')`)
  ]
);

export type ScanReportRow = typeof scanReports.$inferSelect;

export const reportBotEvidence = pgTable("report_bot_evidence", {
  reportId: text("report_id")
    .primaryKey()
    .references(() => scanReports.id, { onDelete: "cascade" }),
  summary: jsonb("summary").$type<BotEvidenceSummary>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type ReportBotEvidenceRow = typeof reportBotEvidence.$inferSelect;

export const scanJobs = pgTable(
  "scan_jobs",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "cascade" }),
    tier: text("tier").$type<ReportTier>().notNull(),
    productContract: text("product_contract").$type<ReportProductContract>().notNull().default("legacy_website_audit_v1"),
    locale: text("locale").$type<ReportLocale>().notNull(),
    reason: text("reason").$type<ScanJobReason>().notNull().default("standard"),
    stage: text("stage").$type<ScanJobStage>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    checkpoint: jsonb("checkpoint").$type<JobCheckpoint>().notNull().default({}),
    plannedPages: integer("planned_pages").notNull().default(0),
    successfulPages: integer("successful_pages").notNull().default(0),
    failedPages: integer("failed_pages").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorCode: text("error_code"),
    publicError: text("public_error"),
    creditReservationId: text("credit_reservation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("scan_jobs_claim_idx").on(table.stage, table.leaseExpiresAt, table.createdAt),
    index("scan_jobs_tier_queue_idx").on(table.tier, table.stage, table.createdAt, table.id),
    index("scan_jobs_tier_lease_idx").on(table.tier, table.leaseExpiresAt),
    index("scan_jobs_report_idx").on(table.reportId, table.createdAt),
    uniqueIndex("scan_jobs_id_report_uidx").on(table.id, table.reportId),
    check("scan_jobs_locale_check", sql`${table.locale} IN ('en', 'zh')`),
    check("scan_jobs_product_contract_check", sql`${table.productContract} IN ('legacy_website_audit_v1','recommendation_forensics_v1')`),
    check("scan_jobs_reason_check", sql`${table.reason} IN ('standard', 'system_recovery', 'locale_correction', 'staging_regeneration')`),
    check(
      "scan_jobs_stage_check",
      sql`${table.stage} IN ('queued','discovering','planning','fetching','analyzing','synthesizing','completed','completed_limited','failed')`
    )
  ]
);

export type ScanJobRow = typeof scanJobs.$inferSelect;

export const answerSnapshotRuns = pgTable(
  "answer_snapshot_runs",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    locale: text("locale").notNull(),
    region: text("region").notNull(),
    questionSetVersion: text("question_set_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({ columns: [table.reportId], foreignColumns: [scanReports.id], name: "answer_snapshot_runs_report_fkey" }).onDelete("cascade"),
    foreignKey({ columns: [table.jobId, table.reportId], foreignColumns: [scanJobs.id, scanJobs.reportId], name: "answer_snapshot_runs_job_report_fkey" }).onDelete("cascade"),
    uniqueIndex("answer_snapshot_runs_scope_uidx").on(table.id, table.reportId, table.jobId),
    index("answer_snapshot_runs_job_idx").on(table.jobId, table.startedAt),
    index("answer_snapshot_runs_report_idx").on(table.reportId, table.startedAt),
    check("answer_snapshot_runs_locale_check", sql`length(btrim(${table.locale})) > 0`),
    check("answer_snapshot_runs_region_check", sql`length(btrim(${table.region})) > 0`),
    check("answer_snapshot_runs_question_set_check", sql`length(btrim(${table.questionSetVersion})) > 0`)
  ]
);

export type AnswerSnapshotRunRow = typeof answerSnapshotRuns.$inferSelect;

export const answerSnapshotCells = pgTable(
  "answer_snapshot_cells",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => answerSnapshotRuns.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    providerId: text("provider_id").notNull(),
    productId: text("product_id").notNull(),
    modelId: text("model_id").notNull(),
    collectionSurface: text("collection_surface").notNull(),
    locale: text("locale").notNull(),
    region: text("region").notNull(),
    certificationState: text("certification_state").notNull(),
    consumerApplicationLabel: text("consumer_application_label"),
    status: text("status").$type<AnswerSnapshotCellStatus>().notNull(),
    answerText: text("answer_text"),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    executionDurationMs: integer("execution_duration_ms").notNull(),
    responseHash: text("response_hash"),
    recommendationOutcome: text("recommendation_outcome"),
    providerRequestId: text("provider_request_id"),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    errorClass: text("error_class"),
    sanitizedError: text("sanitized_error"),
    attemptCount: integer("attempt_count"),
    failureDisposition: text("failure_disposition"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("answer_snapshot_cells_identity_uidx").on(
      table.runId, table.questionId, table.providerId, table.productId, table.modelId,
      table.collectionSurface, table.locale, table.region
    ),
    index("answer_snapshot_cells_run_order_idx").on(table.runId, table.questionId, table.providerId, table.productId, table.modelId),
    check("answer_snapshot_cells_status_check", sql`${table.status} IN ('succeeded','failed')`),
    check("answer_snapshot_cells_surface_check", sql`${table.collectionSurface} IN ('developer_api','approved_browser_capture')`),
    check("answer_snapshot_cells_certification_check", sql`${table.certificationState} IN ('candidate_uncertified','certified')`),
    check("answer_snapshot_cells_duration_check", sql`${table.executionDurationMs} >= 0`),
    check("answer_snapshot_cells_api_label_check", sql`${table.collectionSurface} <> 'developer_api' OR ${table.consumerApplicationLabel} IS NULL`),
    check("answer_snapshot_cells_error_class_check", sql`${table.errorClass} IS NULL OR ${table.errorClass} IN ('timeout','rate-limit','authentication','unsupported','provider-unavailable','invalid-response','policy-blocked')`),
    check("answer_snapshot_cells_outcome_check", sql`${table.recommendationOutcome} IS NULL OR ${table.recommendationOutcome} IN ('recommendations_present','no_recommendation')`),
    check("answer_snapshot_cells_failure_disposition_check", sql`${table.failureDisposition} IS NULL OR ${table.failureDisposition} IN ('non_retryable','retry_exhausted')`),
    check("answer_snapshot_cells_result_check", sql`(
      ${table.status} = 'succeeded'
      AND length(btrim(${table.answerText})) > 0
      AND ${table.responseHash} IS NOT NULL
      AND ${table.recommendationOutcome} IS NOT NULL
      AND ${table.errorClass} IS NULL
      AND ${table.sanitizedError} IS NULL
      AND ${table.attemptCount} IS NULL
      AND ${table.failureDisposition} IS NULL
    ) OR (
      ${table.status} = 'failed'
      AND ${table.answerText} IS NULL
      AND ${table.responseHash} IS NULL
      AND ${table.recommendationOutcome} IS NULL
      AND ${table.errorClass} IS NOT NULL
      AND ((${table.attemptCount} IS NULL AND ${table.failureDisposition} IS NULL)
        OR (${table.attemptCount} > 0 AND ${table.failureDisposition} IS NOT NULL))
    )`)
  ]
);

export type AnswerSnapshotCellRow = typeof answerSnapshotCells.$inferSelect;

export const answerSnapshotSources = pgTable(
  "answer_snapshot_sources",
  {
    id: text("id").primaryKey(),
    cellId: text("cell_id").notNull().references(() => answerSnapshotCells.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    providerOrder: integer("provider_order").notNull(),
    providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("answer_snapshot_sources_cell_order_uidx").on(table.cellId, table.providerOrder),
    uniqueIndex("answer_snapshot_sources_cell_url_uidx").on(table.cellId, table.url),
    check("answer_snapshot_sources_order_check", sql`${table.providerOrder} >= 0`),
    check("answer_snapshot_sources_url_check", sql`${table.url} ~ '^https?://'`)
  ]
);

export type AnswerSnapshotSourceRow = typeof answerSnapshotSources.$inferSelect;

export const citationSourceEvidence = pgTable(
  "citation_source_evidence",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => answerSnapshotSources.id, { onDelete: "cascade" }),
    category: text("category").$type<CitationSourceCategory>().notNull(),
    retrievalState: text("retrieval_state").$type<CitationRetrievalState>().notNull(),
    excerpt: text("excerpt"),
    excerptHash: text("excerpt_hash"),
    contentHash: text("content_hash"),
    grade: text("grade").$type<CitationEvidenceGrade>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("citation_source_evidence_source_uidx").on(table.sourceId),
    index("citation_source_evidence_expiry_idx").on(table.retrievalState, table.expiresAt),
    check("citation_source_evidence_category_check", sql`${table.category} IN ('owned_customer','owned_competitor','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown')`),
    check("citation_source_evidence_retrieval_check", sql`${table.retrievalState} IN ('available','inaccessible','not_retrieved','expired')`),
    check("citation_source_evidence_grade_check", sql`${table.grade} IN ('A','B','C','D')`),
    check("citation_source_evidence_excerpt_bound_check", sql`${table.excerpt} IS NULL OR char_length(${table.excerpt}) <= 1200`),
    check("citation_source_evidence_content_check", sql`(
      ${table.retrievalState} = 'available' AND ${table.excerpt} IS NOT NULL AND ${table.excerptHash} IS NOT NULL AND ${table.contentHash} IS NOT NULL
    ) OR (
      ${table.retrievalState} IN ('inaccessible','not_retrieved') AND ${table.excerpt} IS NULL AND ${table.excerptHash} IS NULL AND ${table.contentHash} IS NULL
    ) OR (
      ${table.retrievalState} = 'expired' AND ${table.excerpt} IS NULL
    )`)
  ]
);

export type CitationSourceEvidenceRow = typeof citationSourceEvidence.$inferSelect;

export const recommendationCertificationAuthorities = pgTable(
  "recommendation_certification_authorities",
  {
    authorityVersion: text("authority_version").primaryKey(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    snapshot: jsonb("snapshot").$type<CertificationAuthoritySnapshot>().notNull(),
    evidenceReferences: jsonb("evidence_references").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [check("recommendation_certification_authority_version_check", sql`length(btrim(${table.authorityVersion})) > 0`)]
);
export type RecommendationCertificationAuthorityRow = typeof recommendationCertificationAuthorities.$inferSelect;

export const sourceClassificationAuthorities = pgTable(
  "source_classification_authorities",
  {
    authorityVersion: text("authority_version").primaryKey(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    snapshot: jsonb("snapshot").$type<SourceClassificationAuthoritySnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [check("source_classification_authority_version_check", sql`length(btrim(${table.authorityVersion})) > 0`)]
);
export type SourceClassificationAuthorityRow = typeof sourceClassificationAuthorities.$inferSelect;

export const answerExecutionCheckpoints = pgTable(
  "answer_execution_checkpoints",
  {
    runId: text("run_id").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    revision: integer("revision").notNull(),
    ledger: jsonb("ledger").$type<AnswerExecutionStateLedger>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({ columns: [table.runId, table.reportId, table.jobId], foreignColumns: [answerSnapshotRuns.id, answerSnapshotRuns.reportId, answerSnapshotRuns.jobId], name: "answer_execution_checkpoints_run_scope_fkey" }).onDelete("cascade"),
    index("answer_execution_checkpoints_job_idx").on(table.jobId),
    check("answer_execution_checkpoints_revision_check", sql`${table.revision} >= 0`)
  ]
);
export type AnswerExecutionCheckpointRow = typeof answerExecutionCheckpoints.$inferSelect;

export const recommendationForensicReports = pgTable(
  "recommendation_forensic_reports",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    reportVersion: integer("report_version").notNull(),
    payload: jsonb("payload").$type<RecommendationForensicReportV1>().notNull(),
    certificationAuthorityVersion: text("certification_authority_version").notNull().references(() => recommendationCertificationAuthorities.authorityVersion, { onDelete: "restrict" }),
    sourceClassificationAuthorityVersion: text("source_classification_authority_version").notNull().references(() => sourceClassificationAuthorities.authorityVersion, { onDelete: "restrict" }),
    contentHash: text("content_hash").notNull(),
    isPrivate: boolean("is_private").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({ columns: [table.jobId, table.reportId], foreignColumns: [scanJobs.id, scanJobs.reportId], name: "recommendation_forensic_reports_job_report_fkey" }).onDelete("cascade"),
    uniqueIndex("recommendation_forensic_reports_report_uidx").on(table.reportId),
    uniqueIndex("recommendation_forensic_reports_job_uidx").on(table.jobId),
    check("recommendation_forensic_reports_version_check", sql`${table.reportVersion} = 1`),
    check("recommendation_forensic_reports_private_check", sql`${table.isPrivate} = true`)
  ]
);
export type RecommendationForensicReportRow = typeof recommendationForensicReports.$inferSelect;

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: text("id").primaryKey(),
    checkoutIdempotencyHmac: text("checkout_idempotency_hmac").notNull(),
    provider: text("provider").$type<PaymentProvider>().notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    providerPaymentId: text("provider_payment_id"),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "restrict" }),
    fulfillmentJobId: text("fulfillment_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
    siteKey: text("site_key").notNull(),
    customerEmailEncrypted: text("customer_email_encrypted").notNull(),
    customerEmailHmac: text("customer_email_hmac").notNull(),
    emailKeyVersion: text("email_key_version").notNull(),
    productCode: text("product_code").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    refundPolicyVersion: text("refund_policy_version").notNull(),
    reportLocale: text("report_locale").$type<ReportLocale>().notNull(),
    currency: text("currency").$type<CommerceCurrency>().notNull(),
    amountMinor: integer("amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("created"),
    fulfillmentStatus: text("fulfillment_status").$type<FulfillmentStatus>().notNull().default("not_started"),
    refundStatus: text("refund_status").$type<OrderRefundStatus>().notNull().default("not_required"),
    deliveryStatus: text("delivery_status").$type<OrderDeliveryStatus>().notNull().default("not_queued"),
    courtesyNonBillable: boolean("courtesy_non_billable").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveryDeadlineAt: timestamp("delivery_deadline_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    legacyRetirementCutoffAt: timestamp("legacy_retirement_cutoff_at", { withTimezone: true }),
    legacyRetiredAt: timestamp("legacy_retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("payment_orders_checkout_idempotency_uidx").on(table.checkoutIdempotencyHmac),
    uniqueIndex("payment_orders_provider_checkout_uidx").on(table.provider, table.providerCheckoutId),
    uniqueIndex("payment_orders_provider_payment_uidx").on(table.provider, table.providerPaymentId),
    uniqueIndex("payment_orders_fulfillment_job_uidx").on(table.fulfillmentJobId),
    uniqueIndex("payment_orders_report_active_product_uidx")
      .on(table.reportId, table.productCode)
      .where(sql`${table.paymentStatus} IN ('created','pending','paid')`),
    index("payment_orders_email_hmac_idx").on(table.customerEmailHmac, table.createdAt),
    index("payment_orders_sla_idx").on(table.fulfillmentStatus, table.deliveryDeadlineAt),
    check("payment_orders_provider_check", sql`${table.provider} IN ('airwallex','stripe')`),
    check("payment_orders_report_locale_check", sql`${table.reportLocale} IN ('en','zh')`),
    check("payment_orders_currency_check", sql`${table.currency} IN ('CNY','USD','HKD')`),
    check("payment_orders_amount_check", sql`${table.amountMinor} > 0`),
    check("payment_orders_tax_amount_check", sql`${table.taxAmountMinor} IS NULL OR ${table.taxAmountMinor} >= 0`),
    check("payment_orders_payment_status_check", sql`${table.paymentStatus} IN ('created','pending','paid','failed','cancelled')`),
    check(
      "payment_orders_fulfillment_status_check",
      sql`${table.fulfillmentStatus} IN ('not_started','queued','processing','completed','completed_limited','failed')`
    ),
    check(
      "payment_orders_refund_status_check",
      sql`${table.refundStatus} IN ('not_required','pending','submitted','refunded','failed')`
    ),
    check(
      "payment_orders_delivery_status_check",
      sql`${table.deliveryStatus} IN ('not_queued','queued','sent','delivered','bounced','failed')`
    )
  ]
);

export type PaymentOrderRow = typeof paymentOrders.$inferSelect;

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").$type<PaymentProvider>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    orderId: text("order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingStatus: text("processing_status").$type<PaymentEventProcessingStatus>().notNull().default("received"),
    payloadHash: text("payload_hash").notNull(),
    selectedFields: jsonb("selected_fields").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    errorCode: text("error_code")
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_uidx").on(table.provider, table.providerEventId),
    index("payment_events_order_idx").on(table.orderId, table.receivedAt),
    check("payment_events_provider_check", sql`${table.provider} IN ('airwallex','stripe')`),
    check(
      "payment_events_processing_status_check",
      sql`${table.processingStatus} IN ('received','processed','ignored','failed')`
    )
  ]
);

export type PaymentEventRow = typeof paymentEvents.$inferSelect;

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => paymentOrders.id, { onDelete: "restrict" }),
    provider: text("provider").$type<PaymentProvider>().notNull(),
    providerRefundId: text("provider_refund_id"),
    reason: text("reason").$type<PaymentRefundReason>().notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").$type<CommerceCurrency>().notNull(),
    state: text("state").$type<PaymentRefundState>().notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("payment_refunds_order_uidx").on(table.orderId),
    uniqueIndex("payment_refunds_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("payment_refunds_provider_refund_uidx").on(table.provider, table.providerRefundId),
    index("payment_refunds_retry_idx").on(table.state, table.nextRetryAt),
    check("payment_refunds_provider_check", sql`${table.provider} IN ('airwallex','stripe')`),
    check(
      "payment_refunds_reason_check",
      sql`${table.reason} IN ('completed_limited','report_failed','sla_missed','operator_approved')`
    ),
    check("payment_refunds_amount_check", sql`${table.amountMinor} > 0`),
    check("payment_refunds_currency_check", sql`${table.currency} IN ('CNY','USD','HKD')`),
    check("payment_refunds_state_check", sql`${table.state} IN ('pending','submitted','succeeded','failed')`),
    check("payment_refunds_attempts_check", sql`${table.attempts} >= 0`)
  ]
);

export type PaymentRefundRow = typeof paymentRefunds.$inferSelect;

export const jobDispatchOutbox = pgTable(
  "job_dispatch_outbox",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => scanJobs.id, { onDelete: "cascade" }),
    tier: text("tier").$type<ReportTier>().notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    state: text("state").$type<JobDispatchState>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("job_dispatch_outbox_job_uidx").on(table.jobId),
    index("job_dispatch_outbox_pending_idx").on(table.state, table.nextAttemptAt),
    check("job_dispatch_outbox_tier_check", sql`${table.tier} IN ('free','deep')`),
    check("job_dispatch_outbox_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("job_dispatch_outbox_state_check", sql`${table.state} IN ('pending','published','abandoned')`),
    check("job_dispatch_outbox_attempts_check", sql`${table.attempts} >= 0`)
  ]
);

export type JobDispatchOutboxRow = typeof jobDispatchOutbox.$inferSelect;

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "restrict" }),
    templateType: text("template_type").$type<EmailTemplateType>().notNull(),
    templateVersion: text("template_version").notNull(),
    locale: text("locale").$type<ReportLocale>().notNull(),
    recipientRef: text("recipient_ref").notNull(),
    provider: text("provider").notNull().default("resend"),
    providerEmailId: text("provider_email_id"),
    businessIdempotencyKey: text("business_idempotency_key").notNull(),
    state: text("state").$type<EmailDeliveryState>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastProviderEventAt: timestamp("last_provider_event_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("email_deliveries_business_idempotency_uidx").on(table.businessIdempotencyKey),
    uniqueIndex("email_deliveries_provider_email_uidx").on(table.provider, table.providerEmailId),
    index("email_deliveries_order_idx").on(table.orderId, table.createdAt),
    index("email_deliveries_order_template_idx").on(table.orderId, table.templateType, table.createdAt),
    index("email_deliveries_retry_idx").on(table.state, table.nextRetryAt),
    check("email_deliveries_template_type_check", sql`${table.templateType} IN ('payment_confirmed','report_ready','limited_report_refund','report_failed_refund','refund_succeeded','refund_assistance','link_reissue')`),
    check("email_deliveries_locale_check", sql`${table.locale} IN ('en','zh')`),
    check("email_deliveries_provider_check", sql`${table.provider} IN ('resend')`),
    check("email_deliveries_state_check", sql`${table.state} IN ('queued','sent','delivered','bounced','failed')`),
    check("email_deliveries_attempts_check", sql`${table.attempts} >= 0`)
  ]
);

export type EmailDeliveryRow = typeof emailDeliveries.$inferSelect;

export const emailDeliveryEvents = pgTable(
  "email_delivery_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("resend"),
    providerEventId: text("provider_event_id").notNull(),
    providerEmailId: text("provider_email_id").notNull(),
    deliveryId: text("delivery_id").references(() => emailDeliveries.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processingStatus: text("processing_status").$type<PaymentEventProcessingStatus>().notNull().default("received"),
    payloadHash: text("payload_hash").notNull(),
    errorCode: text("error_code")
  },
  (table) => [
    uniqueIndex("email_delivery_events_provider_event_uidx").on(table.provider, table.providerEventId),
    index("email_delivery_events_provider_email_idx").on(table.providerEmailId, table.receivedAt),
    index("email_delivery_events_delivery_idx").on(table.deliveryId, table.receivedAt),
    check("email_delivery_events_provider_check", sql`${table.provider} IN ('resend')`),
    check(
      "email_delivery_events_processing_status_check",
      sql`${table.processingStatus} IN ('received','processed','ignored','failed')`
    )
  ]
);

export const workerPresence = pgTable(
  "worker_presence",
  {
    instanceId: text("instance_id").primaryKey(),
    tier: text("tier").$type<ReportTier>().notNull(),
    deploymentVersion: text("deployment_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("worker_presence_tier_heartbeat_idx").on(table.tier, table.lastHeartbeatAt),
    check("worker_presence_tier_check", sql`${table.tier} IN ('free','deep')`)
  ]
);

export type WorkerPresenceRow = typeof workerPresence.$inferSelect;

export const batchRuns = pgTable(
  "batch_runs",
  {
    id: text("id").primaryKey(),
    tier: text("tier").$type<ReportTier>().notNull(),
    status: text("status").$type<BatchRunStatus>().notNull().default("running"),
    replicaCount: integer("replica_count").notNull().default(1),
    claimedJobs: integer("claimed_jobs").notNull().default(0),
    completedJobs: integer("completed_jobs").notNull().default(0),
    failedJobs: integer("failed_jobs").notNull().default(0),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true })
  },
  (table) => [
    index("batch_runs_tier_started_idx").on(table.tier, table.startedAt),
    check("batch_runs_tier_check", sql`${table.tier} IN ('free','deep')`),
    check("batch_runs_status_check", sql`${table.status} IN ('running','succeeded','partial','failed')`),
    check("batch_runs_replica_count_check", sql`${table.replicaCount} > 0`),
    check(
      "batch_runs_counts_check",
      sql`${table.claimedJobs} >= 0 AND ${table.completedJobs} >= 0 AND ${table.failedJobs} >= 0`
    )
  ]
);

export type BatchRunRow = typeof batchRuns.$inferSelect;

export const freeAiDailyBudgets = pgTable(
  "free_ai_daily_budgets",
  {
    bucketDate: date("bucket_date", { mode: "string" }).primaryKey(),
    usedCount: integer("used_count").notNull().default(0),
    limitSnapshot: integer("limit_snapshot").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("free_ai_daily_budgets_used_check", sql`${table.usedCount} >= 0`),
    check("free_ai_daily_budgets_limit_check", sql`${table.limitSnapshot} >= 0`)
  ]
);

export const freeAiBudgetReservations = pgTable(
  "free_ai_budget_reservations",
  {
    idempotencyHmac: text("idempotency_hmac").primaryKey(),
    bucketDate: date("bucket_date", { mode: "string" })
      .notNull()
      .references(() => freeAiDailyBudgets.bucketDate, { onDelete: "cascade" }),
    granted: boolean("granted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("free_ai_budget_reservations_date_idx").on(table.bucketDate)]
);

export const aiReports = pgTable(
  "ai_reports",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => scanJobs.id, { onDelete: "cascade" }),
    tier: text("tier").$type<ReportTier>().notNull(),
    locale: text("locale").notNull(),
    reportVersion: integer("report_version").notNull().default(1),
    payload: jsonb("payload").$type<StoredAiReport>().notNull(),
    technicalPayload: jsonb("technical_payload").$type<GeoAuditReport>(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    contentHash: text("content_hash").notNull(),
    isPrivate: boolean("is_private").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("ai_reports_report_tier_uidx").on(table.reportId, table.tier),
    index("ai_reports_job_idx").on(table.jobId)
  ]
);

export type AiReportRow = typeof aiReports.$inferSelect;

export const crawlEvidence = pgTable(
  "crawl_evidence",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => scanJobs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url"),
    pageType: text("page_type"),
    fetchStatus: text("fetch_status").notNull(),
    httpStatus: integer("http_status"),
    contentHash: text("content_hash"),
    normalizedContent: text("normalized_content"),
    evidenceExcerpts: jsonb("evidence_excerpts").$type<string[]>().notNull().default([]),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("crawl_evidence_job_url_uidx").on(table.jobId, table.url),
    index("crawl_evidence_expiry_idx").on(table.contentExpiresAt)
  ]
);

export type CrawlEvidenceRow = typeof crawlEvidence.$inferSelect;

export const reportEvidenceAssets = pgTable(
  "report_evidence_assets",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => scanJobs.id, { onDelete: "cascade" }),
    findingId: text("finding_id").notNull(),
    citationIndex: integer("citation_index").notNull(),
    kind: text("kind").$type<EvidenceAssetKind>().notNull(),
    status: text("status").$type<EvidenceAssetStatus>().notNull(),
    sourceUrl: text("source_url").notNull(),
    quote: text("quote").notNull(),
    pageElement: text("page_element"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    viewportWidth: integer("viewport_width").notNull(),
    viewportHeight: integer("viewport_height").notNull(),
    contentHash: text("content_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    assetHash: text("asset_hash"),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_evidence_assets_identity_uidx").on(
      table.jobId,
      table.findingId,
      table.citationIndex,
      table.kind
    ),
    index("report_evidence_assets_report_idx").on(table.reportId, table.findingId),
    check("report_evidence_assets_citation_index_check", sql`${table.citationIndex} >= 0`),
    check("report_evidence_assets_kind_check", sql`${table.kind} IN ('issue_crop','context','compact','viewport')`),
    check("report_evidence_assets_status_check", sql`${table.status} IN ('ready','unavailable')`),
    check("report_evidence_assets_viewport_check", sql`${table.viewportWidth} > 0 AND ${table.viewportHeight} > 0`),
    check("report_evidence_assets_byte_size_check", sql`${table.byteSize} IS NULL OR ${table.byteSize} >= 0`)
  ]
);

export type ReportEvidenceAssetRow = typeof reportEvidenceAssets.$inferSelect;

export const freeSiteTrials = pgTable("free_site_trials", {
  siteKey: text("site_key").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => scanReports.id, { onDelete: "cascade" }),
  jobId: text("job_id").references(() => scanJobs.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});

export const stagingFreeRegenerations = pgTable("staging_free_regenerations", {
  siteKey: text("site_key").primaryKey(),
  reservationId: text("reservation_id").notNull().unique(),
  reportId: text("report_id").references(() => scanReports.id, { onDelete: "set null" }),
  jobId: text("job_id").references(() => scanJobs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const anonymousRateBuckets = pgTable(
  "anonymous_rate_buckets",
  {
    ipHash: text("ip_hash").notNull(),
    bucketDate: date("bucket_date", { mode: "string" }).notNull(),
    siteKey: text("site_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("anonymous_rate_ip_date_site_uidx").on(table.ipHash, table.bucketDate, table.siteKey),
    index("anonymous_rate_ip_date_idx").on(table.ipHash, table.bucketDate)
  ]
);

export const accessKeys = pgTable(
  "access_keys",
  {
    id: text("id").primaryKey(),
    keyPrefix: text("key_prefix").notNull(),
    keyHmac: text("key_hmac").notNull(),
    paymentOrderId: text("payment_order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    status: text("status").$type<AccessKeyStatus>().notNull().default("active"),
    creditsRemaining: integer("credits_remaining").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("access_keys_hmac_uidx").on(table.keyHmac),
    uniqueIndex("access_keys_payment_order_uidx").on(table.paymentOrderId),
    index("access_keys_prefix_idx").on(table.keyPrefix)
  ]
);

export type AccessKeyRow = typeof accessKeys.$inferSelect;

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    accessKeyId: text("access_key_id")
      .notNull()
      .references(() => accessKeys.id, { onDelete: "restrict" }),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "restrict" }),
    jobId: text("job_id").references(() => scanJobs.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    paymentOrderId: text("payment_order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    credits: integer("credits").notNull().default(1),
    status: text("status").$type<CreditStatus>().notNull().default("reserved"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("credit_ledger_key_idempotency_uidx").on(table.accessKeyId, table.idempotencyKey),
    uniqueIndex("credit_ledger_payment_order_uidx").on(table.paymentOrderId),
    index("credit_ledger_report_idx").on(table.reportId)
  ]
);

export type CreditLedgerRow = typeof creditLedger.$inferSelect;

export const reportAccessTokens = pgTable(
  "report_access_tokens",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => scanReports.id, { onDelete: "cascade" }),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHmac: text("token_hmac").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_access_tokens_hmac_uidx").on(table.tokenHmac),
    index("report_access_tokens_report_idx").on(table.reportId)
  ]
);

export type ReportAccessTokenRow = typeof reportAccessTokens.$inferSelect;
