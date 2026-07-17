import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1, CombinedGeoReportV1, ModelProfile, RecommendationForensicReportV1, ReportV4CustomerProseProfile, ReportV4PageSummaryChunk, SourceClassificationAuthoritySnapshot } from "@open-geo-console/ai-report-engine";
import type { BusinessQuestionCandidateSet, ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
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
export type ScanJobReason = "standard" | "system_recovery" | "locale_correction" | "staging_regeneration" | "paid_report_correction" | "staging_artifact_refresh" | "replacement_fulfillment" | "v4_diagnosis_enhancement" | "v4_pre_admission";
export type ArtifactRevisionKind = "generation" | "correction" | "presentation_refresh" | "evidence_refresh" | "replacement" | "diagnosis_enhancement";
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
export type ScanJobExecutionState = "queued" | "running" | "retry_wait" | "repair_wait" | "completed" | "failed";
export type ScanJobPhase =
  | "admission" | "discovery" | "planning" | "fetching" | "technical_audit" | "page_analysis"
  | "website_synthesis" | "public_source_preflight" | "question_generation" | "snapshot_resolution"
  | "provider_discovery_search" | "candidate_resolution" | "candidate_verification" | "provider_source_retrieval"
  | "provider_passage_selection" | "provider_claim_extraction" | "provider_qualification" | "grounded_answer_synthesis"
  | "source_retrieval" | "evidence_graph" | "report_build" | "artifact_verification" | "terminalization";

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
export type ReportArtifactContract = ReportProductContract | "combined_geo_report_v1" | "combined_geo_report_v2" | "combined_geo_report_v3" | "combined_geo_report_v4";
export type ReportArtifactScope = ReportArtifactContract;
export type RecommendationFulfillmentMethodology =
  | "answer_engine_recommendation_forensics_v1"
  | "public_search_source_forensics_v1"
  | "two_stage_geo_report_v4";
export type RecommendationReportVersion = 1 | 2 | 4;
export type PaymentRefundReason = "completed_limited" | "report_failed" | "sla_missed" | "operator_approved";
export type PaymentRefundState = "pending" | "submitted" | "succeeded" | "failed";
export type EmailTemplateType =
  | "payment_confirmed"
  | "report_ready"
  | "limited_report_refund"
  | "report_failed_refund"
  | "refund_succeeded"
  | "refund_assistance"
  | "link_reissue"
  | "corrected_report_ready"
  | "replacement_report_ready";
export type EmailDeliveryState = "queued" | "sent" | "delivered" | "bounced" | "failed";
export type ReportV4AcceptanceSessionState = "collecting" | "sealed" | "failed";
export type ReportV4AcceptanceScenarioKind = "success" | "diagnosis_failure" | "question_failure";
export type ReportV4AcceptanceFaultKind = "question_failure" | "diagnosis_failure" | "independent_source_read_failure";
export type ReportV4AcceptanceEventKind =
  | "scenario_bound" | "crawl_run" | "site_read" | "model_operation" | "html_assembly"
  | "fault_injection" | "checkpoint_terminal" | "v4_dispatch" | "prohibited_operation"
  | "artifact_activation" | "commerce_fingerprint";
export type ReportV4AcceptanceOperation =
  | "crawl" | "site_raw_read" | "site_browser_read" | "page_analysis" | "website_synthesis"
  | "question_answer" | "source_diagnosis" | "core_html" | "enhancement_html"
  | "question_failure" | "diagnosis_failure" | "independent_source_read_failure"
  | "v4_dispatch" | "pdf" | "provider_claim" | "qualification" | "four_snapshot"
  | "replacement_fulfillment" | "artifact_activation" | "commerce";
export type ReportV4AcceptanceEventPhase = "started" | "completed" | "failed" | "rejected" | "consumed" | "observed";
export type ReportV4AcceptanceSiteReadScope = "admission_discovery" | "admission_page" | "enhancement_source";
export type ReportV4AcceptanceSiteReadPurpose = "homepage" | "robots" | "sitemap" | "page" | "source";
export type ReportV4AcceptanceSiteReadMode = "raw" | "browser";
export type ReportV4AcceptanceSiteReadTerminalPhase = "completed" | "failed";
export type ReportV4AcceptanceEventDetails =
  | { readonly bindingHash: string }
  | { readonly candidatePages: number; readonly analyzablePages: number; readonly excludedPages: number; readonly jsDependentPages: number }
  | { readonly urlHash: string; readonly readMode: "raw" | "browser"; readonly networkPerformed: boolean }
  | { readonly providerCall: boolean; readonly retry: boolean; readonly budgetOutcome: "allowed" | "rejected"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly artifactRevisionId: string; readonly htmlSha256: string }
  | { readonly fault: ReportV4AcceptanceFaultKind; readonly occurrence: 1 | 2; readonly baselineFingerprint: string }
  | { readonly checkpointHash: string; readonly state: "answered" | "unavailable" | "completed" | "failed" }
  | { readonly fingerprint: string }
  | Record<string, never>;
export type JobDispatchState = "pending" | "published" | "abandoned";
export type BatchRunStatus = "running" | "succeeded" | "partial" | "failed";
export type EvidenceAssetKind = "issue_crop" | "context" | "compact" | "viewport";
export type EvidenceAssetStatus = "ready" | "unavailable";
export type AnswerSnapshotCellStatus = "succeeded" | "failed";
export type CitationEvidenceGrade = EvidenceGrade;
export type { CitationRetrievalState, CitationSourceCategory };

export interface JobCheckpoint {
  recovery?: {
    schemaVersion: 1;
    phase: ScanJobPhase;
    revision: number;
    phaseAttempt: number;
    resumeGeneration: number;
    identity: { jobId: string; reportId: string; productContract: string; methodology: string | null; locale: string; authorityId: string | null };
    inputHash: string;
    completedArtifacts: string[];
    remainingWork: string[];
    priorTransitionId: string | null;
  };
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
    activeArtifactRevisionId: text("active_artifact_revision_id"),
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

export type ReportV4SiteSnapshotStatus = "collecting" | "completed" | "completed_limited" | "unavailable" | "custom_service";
export type ReportV4SiteSnapshotReadMode = "direct_readable" | "js_dependent";

export const reportV4SiteSnapshots = pgTable(
  "report_v4_site_snapshots",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    siteKey: text("site_key").notNull(),
    status: text("status").$type<ReportV4SiteSnapshotStatus>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    collectorConfigIdentityHash: text("collector_config_identity_hash").notNull(),
    contentIdentityHash: text("content_identity_hash"),
    candidateUrlCount: integer("candidate_url_count").notNull().default(0),
    analyzablePageCount: integer("analyzable_page_count").notNull().default(0),
    excludedPageCount: integer("excluded_page_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_site_snapshots_report_identity_uidx").on(table.id, table.reportId),
    index("report_v4_site_snapshots_report_status_idx").on(table.reportId, table.status, table.capturedAt),
    check("report_v4_site_snapshots_site_check", sql`length(btrim(${table.siteKey})) > 0`),
    check("report_v4_site_snapshots_status_check", sql`${table.status} IN ('collecting','completed','completed_limited','unavailable','custom_service')`),
    check("report_v4_site_snapshots_hash_check", sql`${table.collectorConfigIdentityHash} ~ '^[a-f0-9]{64}$' AND (${table.contentIdentityHash} IS NULL OR ${table.contentIdentityHash} ~ '^[a-f0-9]{64}$')`),
    check("report_v4_site_snapshots_count_check", sql`${table.candidateUrlCount} >= 0 AND ${table.analyzablePageCount} >= 0 AND ${table.excludedPageCount} >= 0 AND ${table.candidateUrlCount} >= ${table.analyzablePageCount} + ${table.excludedPageCount}`),
    check("report_v4_site_snapshots_terminal_shape_check", sql`(
      (${table.status}='collecting' AND ${table.completedAt} IS NULL AND ${table.contentIdentityHash} IS NULL)
      OR (${table.status}='completed' AND ${table.completedAt} IS NOT NULL AND ${table.completedAt} >= ${table.capturedAt} AND ${table.contentIdentityHash} IS NOT NULL AND ${table.analyzablePageCount} BETWEEN 1 AND 50)
      OR (${table.status}='completed_limited' AND ${table.completedAt} IS NOT NULL AND ${table.completedAt} >= ${table.capturedAt} AND ${table.contentIdentityHash} IS NOT NULL AND ${table.analyzablePageCount} BETWEEN 1 AND 50 AND ${table.excludedPageCount} > 0)
      OR (${table.status}='unavailable' AND ${table.completedAt} IS NOT NULL AND ${table.completedAt} >= ${table.capturedAt} AND ${table.contentIdentityHash} IS NOT NULL AND ${table.analyzablePageCount}=0)
      OR (${table.status}='custom_service' AND ${table.completedAt} IS NOT NULL AND ${table.completedAt} >= ${table.capturedAt} AND ${table.contentIdentityHash} IS NOT NULL AND ${table.analyzablePageCount} >= 51)
    )`)
  ]
);
export type ReportV4SiteSnapshotRow = typeof reportV4SiteSnapshots.$inferSelect;

export const reportV4SiteSnapshotPages = pgTable(
  "report_v4_site_snapshot_pages",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull().references(() => reportV4SiteSnapshots.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    analyzable: boolean("analyzable").notNull(),
    readMode: text("read_mode").$type<ReportV4SiteSnapshotReadMode>(),
    summary: text("summary"),
    retainedCleanedText: text("retained_cleaned_text"),
    contentHash: text("content_hash"),
    exclusionReason: text("exclusion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_site_snapshot_pages_ordinal_uidx").on(table.snapshotId, table.ordinal),
    uniqueIndex("report_v4_site_snapshot_pages_url_uidx").on(table.snapshotId, table.normalizedUrl),
    uniqueIndex("report_v4_site_snapshot_pages_content_binding_uidx").on(table.id, table.snapshotId, table.contentHash),
    check("report_v4_site_snapshot_pages_ordinal_check", sql`${table.ordinal} > 0`),
    check("report_v4_site_snapshot_pages_url_check", sql`${table.normalizedUrl} ~ '^https?://'`),
    check("report_v4_site_snapshot_pages_read_mode_check", sql`${table.readMode} IS NULL OR ${table.readMode} IN ('direct_readable','js_dependent')`),
    check("report_v4_site_snapshot_pages_hash_check", sql`${table.contentHash} IS NULL OR ${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("report_v4_site_snapshot_pages_retained_text_check", sql`(
      ${table.analyzable}=true AND ${table.retainedCleanedText} IS NOT NULL
      AND length(btrim(${table.retainedCleanedText})) > 0
      AND char_length(${table.retainedCleanedText}) <= 100000 AND ${table.readMode} IS NOT NULL
      AND ${table.contentHash} IS NOT NULL AND ${table.exclusionReason} IS NULL
    ) OR (${table.analyzable}=false AND ${table.retainedCleanedText} IS NULL)`),
    check("report_v4_site_snapshot_pages_shape_check", sql`(
      (${table.analyzable}=true AND ${table.readMode} IS NOT NULL AND ${table.summary} IS NOT NULL AND length(btrim(${table.summary})) > 0 AND ${table.contentHash} IS NOT NULL AND ${table.exclusionReason} IS NULL)
      OR (${table.analyzable}=false AND ${table.readMode} IS NULL AND ${table.summary} IS NULL AND ${table.contentHash} IS NULL AND ${table.exclusionReason} IS NOT NULL AND length(btrim(${table.exclusionReason})) > 0)
    )`)
  ]
);
export type ReportV4SiteSnapshotPageRow = typeof reportV4SiteSnapshotPages.$inferSelect;

export const reportV4PageSummaries = pgTable(
  "report_v4_page_summaries",
  {
    identityHash: text("identity_hash").primaryKey(),
    reportId: text("report_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    pageId: text("page_id").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceLength: integer("source_length").notNull(),
    chunks: jsonb("chunks").$type<ReportV4PageSummaryChunk[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_page_summaries_page_uidx").on(table.pageId),
    index("report_v4_page_summaries_snapshot_idx").on(table.snapshotId, table.pageId),
    foreignKey({
      columns: [table.snapshotId, table.reportId],
      foreignColumns: [reportV4SiteSnapshots.id, reportV4SiteSnapshots.reportId],
      name: "report_v4_page_summaries_snapshot_report_fkey"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.pageId, table.snapshotId, table.contentHash],
      foreignColumns: [reportV4SiteSnapshotPages.id, reportV4SiteSnapshotPages.snapshotId, reportV4SiteSnapshotPages.contentHash],
      name: "report_v4_page_summaries_page_content_fkey"
    }).onDelete("restrict"),
    check("report_v4_page_summaries_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("report_v4_page_summaries_source_length_check", sql`${table.sourceLength} > 0`),
    check("report_v4_page_summaries_chunks_check", sql`ogc_report_v4_page_summary_chunks_valid(${table.chunks},${table.sourceLength})`)
  ]
);
export type ReportV4PageSummaryRow = typeof reportV4PageSummaries.$inferSelect;

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
    siteSnapshotId: text("site_snapshot_id").references(() => reportV4SiteSnapshots.id, { onDelete: "restrict" }),
    tier: text("tier").$type<ReportTier>().notNull(),
    productContract: text("product_contract").$type<ReportProductContract>().notNull().default("legacy_website_audit_v1"),
    fulfillmentMethodology: text("fulfillment_methodology").$type<RecommendationFulfillmentMethodology>(),
    recommendationReportVersion: integer("recommendation_report_version").$type<RecommendationReportVersion>(),
    artifactContract: text("artifact_contract").$type<ReportArtifactContract>(),
    correctionId: text("correction_id"),
    replacementFulfillmentId: text("replacement_fulfillment_id"),
    businessQuestionSetId: text("business_question_set_id"),
    locale: text("locale").$type<ReportLocale>().notNull(),
    reason: text("reason").$type<ScanJobReason>().notNull().default("standard"),
    stage: text("stage").$type<ScanJobStage>().notNull().default("queued"),
    executionState: text("execution_state").$type<ScanJobExecutionState>().notNull().default("queued"),
    currentPhase: text("current_phase").$type<ScanJobPhase>().notNull().default("admission"),
    checkpointRevision: integer("checkpoint_revision").notNull().default(0),
    phaseAttempt: integer("phase_attempt").notNull().default(0),
    resumeGeneration: integer("resume_generation").notNull().default(0),
    retryNotBefore: timestamp("retry_not_before", { withTimezone: true }),
    repairReasonCode: text("repair_reason_code"),
    repairDeadlineAt: timestamp("repair_deadline_at", { withTimezone: true }),
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
    index("scan_jobs_site_snapshot_idx").on(table.siteSnapshotId),
    uniqueIndex("scan_jobs_id_report_uidx").on(table.id, table.reportId),
    uniqueIndex("scan_jobs_correction_uidx").on(table.correctionId).where(sql`${table.correctionId} IS NOT NULL`),
    uniqueIndex("scan_jobs_replacement_fulfillment_uidx").on(table.replacementFulfillmentId).where(sql`${table.replacementFulfillmentId} IS NOT NULL`),
    uniqueIndex("scan_jobs_recommendation_contract_scope_uidx").on(
      table.id, table.reportId, table.productContract, table.fulfillmentMethodology, table.recommendationReportVersion
    ),
    uniqueIndex("scan_jobs_site_snapshot_binding_uidx").on(table.id, table.reportId, table.siteSnapshotId),
    uniqueIndex("scan_jobs_v4_pre_admission_report_uidx").on(table.reportId).where(sql`${table.reason} = 'v4_pre_admission'`),
    check("scan_jobs_locale_check", sql`${table.locale} IN ('en', 'zh')`),
    check("scan_jobs_product_contract_check", sql`${table.productContract} IN ('legacy_website_audit_v1','recommendation_forensics_v1')`),
    check("scan_jobs_methodology_contract_check", sql`(
      (${table.productContract} = 'legacy_website_audit_v1' AND ${table.fulfillmentMethodology} IS NULL AND ${table.recommendationReportVersion} IS NULL)
      OR (${table.productContract} = 'recommendation_forensics_v1'
        AND ${table.fulfillmentMethodology} IS NOT NULL
        AND ${table.recommendationReportVersion} IS NOT NULL
        AND ((${table.fulfillmentMethodology} = 'answer_engine_recommendation_forensics_v1' AND ${table.recommendationReportVersion} = 1)
          OR (${table.fulfillmentMethodology} = 'public_search_source_forensics_v1' AND ${table.recommendationReportVersion} = 2)
          OR (${table.fulfillmentMethodology} = 'two_stage_geo_report_v4' AND ${table.recommendationReportVersion} = 4)))
    )`),
    check("scan_jobs_reason_check", sql`${table.reason} IN ('standard', 'system_recovery', 'locale_correction', 'staging_regeneration', 'paid_report_correction', 'staging_artifact_refresh', 'replacement_fulfillment', 'v4_diagnosis_enhancement', 'v4_pre_admission')`),
    check("scan_jobs_artifact_contract_check", sql`${table.artifactContract} IS NULL OR ${table.artifactContract} IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4')`),
    check("scan_jobs_correction_credit_check", sql`${table.reason} <> 'paid_report_correction' OR (${table.creditReservationId} IS NULL AND ${table.artifactContract} IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND ${table.correctionId} IS NOT NULL AND ${table.businessQuestionSetId} IS NOT NULL)`),
    check("scan_jobs_refresh_credit_check", sql`${table.reason} <> 'staging_artifact_refresh' OR (${table.creditReservationId} IS NULL AND ${table.artifactContract} IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND ${table.correctionId} IS NULL AND ${table.businessQuestionSetId} IS NOT NULL AND ${table.tier} = 'deep')`),
    check("scan_jobs_replacement_fulfillment_check", sql`(${table.reason} = 'replacement_fulfillment' AND ${table.replacementFulfillmentId} IS NOT NULL AND ${table.creditReservationId} IS NULL AND ${table.artifactContract} = 'combined_geo_report_v3' AND ${table.correctionId} IS NULL AND ${table.businessQuestionSetId} IS NOT NULL AND ${table.tier} = 'deep') OR (${table.reason} <> 'replacement_fulfillment' AND ${table.replacementFulfillmentId} IS NULL)`),
    check("scan_jobs_v4_methodology_check", sql`(${table.artifactContract}='combined_geo_report_v4' AND ${table.fulfillmentMethodology}='two_stage_geo_report_v4' AND ${table.recommendationReportVersion}=4) OR ((${table.artifactContract} IS NULL OR ${table.artifactContract}<>'combined_geo_report_v4') AND (${table.fulfillmentMethodology} IS NULL OR ${table.fulfillmentMethodology}<>'two_stage_geo_report_v4'))`),
    check("scan_jobs_v4_enhancement_check", sql`${table.reason} <> 'v4_diagnosis_enhancement' OR (${table.tier}='deep' AND ${table.productContract}='recommendation_forensics_v1' AND ${table.fulfillmentMethodology}='two_stage_geo_report_v4' AND ${table.recommendationReportVersion}=4 AND ${table.artifactContract}='combined_geo_report_v4' AND ${table.businessQuestionSetId} IS NOT NULL AND ${table.creditReservationId} IS NULL AND ${table.correctionId} IS NULL AND ${table.replacementFulfillmentId} IS NULL)`),
    check("scan_jobs_v4_pre_admission_check", sql`${table.reason} <> 'v4_pre_admission' OR (${table.tier}='deep' AND ${table.productContract}='recommendation_forensics_v1' AND ${table.fulfillmentMethodology}='two_stage_geo_report_v4' AND ${table.recommendationReportVersion}=4 AND ${table.artifactContract}='combined_geo_report_v4' AND ${table.siteSnapshotId} IS NULL AND ${table.businessQuestionSetId} IS NULL AND ${table.creditReservationId} IS NULL AND ${table.correctionId} IS NULL AND ${table.replacementFulfillmentId} IS NULL)`),
    check(
      "scan_jobs_stage_check",
      sql`${table.stage} IN ('queued','discovering','planning','fetching','analyzing','synthesizing','completed','completed_limited','failed')`
    ),
    check("scan_jobs_execution_state_check", sql`${table.executionState} IN ('queued','running','retry_wait','repair_wait','completed','failed')`),
    check("scan_jobs_current_phase_check", sql`${table.currentPhase} IN ('admission','discovery','planning','fetching','technical_audit','page_analysis','website_synthesis','public_source_preflight','question_generation','snapshot_resolution','provider_discovery_search','candidate_resolution','candidate_verification','provider_source_retrieval','provider_passage_selection','provider_claim_extraction','provider_qualification','grounded_answer_synthesis','source_retrieval','evidence_graph','report_build','artifact_verification','terminalization')`)
  ]
);

export type ScanJobRow = typeof scanJobs.$inferSelect;

export const scanJobErrorEvents = pgTable("scan_job_error_events", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "cascade" }),
  phase: text("phase").$type<ScanJobPhase>().notNull(),
  checkpointRevision: integer("checkpoint_revision").notNull(),
  jobAttempt: integer("job_attempt").notNull(),
  phaseAttempt: integer("phase_attempt").notNull(),
  resumeGeneration: integer("resume_generation").notNull(),
  classification: text("classification").notNull(),
  code: text("code").notNull(),
  errorType: text("error_type").notNull(),
  message: text("message").notNull(),
  stack: text("stack"),
  causes: jsonb("causes").$type<string[]>().notNull().default([]),
  fingerprint: text("fingerprint").notNull(),
  retryableAt: timestamp("retryable_at", { withTimezone: true }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("scan_job_error_events_job_recorded_idx").on(table.jobId, table.recordedAt)]);
export type ScanJobErrorEventRow = typeof scanJobErrorEvents.$inferSelect;

export const scanJobTransitionEvents = pgTable("scan_job_transition_events", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "cascade" }),
  fromExecutionState: text("from_execution_state").$type<ScanJobExecutionState>(),
  toExecutionState: text("to_execution_state").$type<ScanJobExecutionState>().notNull(),
  phase: text("phase").$type<ScanJobPhase>().notNull(),
  checkpointRevision: integer("checkpoint_revision").notNull(),
  reasonCode: text("reason_code"),
  errorEventId: text("error_event_id").references(() => scanJobErrorEvents.id, { onDelete: "restrict" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("scan_job_transition_events_job_recorded_idx").on(table.jobId, table.recordedAt)]);
export type ScanJobTransitionEventRow = typeof scanJobTransitionEvents.$inferSelect;

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

export const publicSearchSurfaceAuthorities = pgTable(
  "public_search_surface_authorities",
  {
    authorityVersion: text("authority_version").primaryKey(),
    adapterId: text("adapter_id").notNull(),
    providerId: text("provider_id").notNull(),
    productId: text("product_id").notNull(),
    modelId: text("model_id").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    surfaceId: text("surface_id").notNull(),
    surfaceVersion: text("surface_version").notNull(),
    environment: text("environment").notNull(),
    localeCapabilities: jsonb("locale_capabilities").$type<unknown>().notNull(),
    regionCapabilities: jsonb("region_capabilities").$type<unknown>().notNull(),
    termsReviewedAt: timestamp("terms_reviewed_at", { withTimezone: true }).notNull(),
    evidenceReferences: jsonb("evidence_references").$type<unknown>().notNull(),
    active: boolean("active").notNull().default(false),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("public_search_surface_authorities_active_idx").on(table.environment, table.active, table.adapterId, table.providerId, table.productId, table.modelId, table.adapterVersion, table.surfaceId),
    uniqueIndex("public_search_surface_authorities_identity_uidx").on(
      table.environment, table.adapterId, table.providerId, table.productId, table.modelId, table.adapterVersion,
      table.surfaceId, table.surfaceVersion, table.authorityVersion
    ),
    uniqueIndex("public_search_surface_authorities_scope_uidx").on(
      table.authorityVersion, table.adapterId, table.providerId, table.productId, table.modelId, table.adapterVersion,
      table.surfaceId, table.surfaceVersion
    ),
    uniqueIndex("public_search_surface_authorities_one_active_uidx")
      .on(table.environment, table.adapterId, table.providerId, table.productId, table.modelId, table.adapterVersion, table.surfaceId)
      .where(sql`${table.active} = true`),
    check("public_search_surface_authorities_version_check", sql`length(btrim(${table.authorityVersion})) > 0`),
    check("public_search_surface_authorities_adapter_identity_check", sql`length(btrim(${table.adapterId})) > 0 AND length(btrim(${table.providerId})) > 0 AND length(btrim(${table.productId})) > 0 AND length(btrim(${table.modelId})) > 0 AND length(btrim(${table.adapterVersion})) > 0`),
    check("public_search_surface_authorities_surface_check", sql`length(btrim(${table.surfaceId})) > 0 AND length(btrim(${table.surfaceVersion})) > 0`),
    check("public_search_surface_authorities_environment_check", sql`${table.environment} IN ('staging','production')`),
    check("public_search_surface_authorities_locale_shape_check", sql`jsonb_typeof(${table.localeCapabilities}) = 'array'`),
    check("public_search_surface_authorities_region_shape_check", sql`jsonb_typeof(${table.regionCapabilities}) = 'array'`),
    check("public_search_surface_authorities_evidence_shape_check", sql`jsonb_typeof(${table.evidenceReferences}) = 'array'`)
  ]
);
export type PublicSearchSurfaceAuthorityRow = typeof publicSearchSurfaceAuthorities.$inferSelect;

export const marketSnapshotQuestions = pgTable(
  "market_snapshot_questions",
  {
    id: text("id").primaryKey(),
    cacheIdentity: text("cache_identity").notNull(),
    normalizedQuestion: text("normalized_question").notNull(),
    questionHash: text("question_hash").notNull(),
    locale: text("locale").notNull(),
    region: text("region").notNull(),
    surfaceAuthorityVersion: text("surface_authority_version").notNull()
      .references(() => publicSearchSurfaceAuthorities.authorityVersion, { onDelete: "restrict" }),
    surfaceId: text("surface_id").notNull(),
    surfaceVersion: text("surface_version").notNull(),
    fanoutVersion: text("fanout_version").notNull(),
    snapshotKind: text("snapshot_kind").notNull().default("standard_question"),
    parentSnapshotId: text("parent_snapshot_id"),
    candidateSetHash: text("candidate_set_hash"),
    queryPlanVersion: text("query_plan_version").notNull().default("legacy-standard-v1"),
    status: text("status").notNull().default("refreshing"),
    completionVersion: integer("completion_version").notNull(),
    queryFanoutHash: text("query_fanout_hash"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.surfaceAuthorityVersion, table.surfaceId, table.surfaceVersion],
      foreignColumns: [
        publicSearchSurfaceAuthorities.authorityVersion,
        publicSearchSurfaceAuthorities.surfaceId,
        publicSearchSurfaceAuthorities.surfaceVersion
      ],
      name: "market_snapshot_questions_authority_scope_fkey"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.parentSnapshotId],
      foreignColumns: [table.id],
      name: "market_snapshot_questions_parent_fkey"
    }).onDelete("restrict"),
    uniqueIndex("market_snapshot_questions_identity_version_uidx").on(table.cacheIdentity, table.completionVersion),
    uniqueIndex("market_snapshot_questions_id_cache_uidx").on(table.id, table.cacheIdentity),
    uniqueIndex("market_snapshot_questions_id_authority_uidx").on(table.id, table.surfaceAuthorityVersion),
    index("market_snapshot_questions_freshness_idx").on(table.cacheIdentity, table.status, table.completedAt),
    check("market_snapshot_questions_identity_check", sql`length(btrim(${table.cacheIdentity})) > 0 AND length(btrim(${table.questionHash})) > 0`),
    check("market_snapshot_questions_question_check", sql`length(btrim(${table.normalizedQuestion})) > 0`),
    check("market_snapshot_questions_locale_region_check", sql`length(btrim(${table.locale})) > 0 AND length(btrim(${table.region})) > 0`),
    check("market_snapshot_questions_completion_version_check", sql`${table.completionVersion} > 0`),
    check("market_snapshot_questions_status_check", sql`${table.status} IN ('refreshing','completed','failed')`),
    check("market_snapshot_questions_kind_check", sql`${table.snapshotKind} IN ('standard_question','provider_discovery','candidate_verification')`),
    check("market_snapshot_questions_query_plan_check", sql`length(btrim(${table.queryPlanVersion})) > 0`),
    check("market_snapshot_questions_ancestry_shape_check", sql`(
      (${table.snapshotKind} IN ('standard_question','provider_discovery') AND ${table.parentSnapshotId} IS NULL AND ${table.candidateSetHash} IS NULL)
      OR (${table.snapshotKind} = 'candidate_verification' AND ${table.parentSnapshotId} IS NOT NULL AND ${table.candidateSetHash} ~ '^[a-f0-9]{64}$')
    )`),
    check("market_snapshot_questions_terminal_check", sql`(
      (${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL AND ${table.queryFanoutHash} IS NOT NULL)
      OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)
    )`)
  ]
);
export type MarketSnapshotQuestionRow = typeof marketSnapshotQuestions.$inferSelect;

export const marketSnapshotQueries = pgTable(
  "market_snapshot_queries",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull().references(() => marketSnapshotQuestions.id, { onDelete: "cascade" }),
    queryOrder: integer("query_order").notNull(),
    queryText: text("query_text").notNull(),
    queryHash: text("query_hash").notNull(),
    derivationRule: text("derivation_rule").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("market_snapshot_queries_snapshot_order_uidx").on(table.snapshotId, table.queryOrder),
    uniqueIndex("market_snapshot_queries_snapshot_hash_uidx").on(table.snapshotId, table.queryHash),
    uniqueIndex("market_snapshot_queries_scope_uidx").on(table.id, table.snapshotId),
    check("market_snapshot_queries_order_check", sql`${table.queryOrder} >= 0`),
    check("market_snapshot_queries_text_check", sql`length(btrim(${table.queryText})) > 0 AND length(btrim(${table.derivationRule})) > 0`)
  ]
);
export type MarketSnapshotQueryRow = typeof marketSnapshotQueries.$inferSelect;

export const marketSearchAttempts = pgTable(
  "market_search_attempts",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull(),
    queryId: text("query_id").notNull(),
    authorityVersion: text("authority_version").notNull()
      .references(() => publicSearchSurfaceAuthorities.authorityVersion, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    requestStatus: text("request_status").notNull(),
    idempotencyReference: text("idempotency_reference").notNull(),
    usage: jsonb("usage").$type<unknown>().notNull().default({}),
    configuredCostMicros: integer("configured_cost_micros").notNull().default(0),
    providerCostMicros: integer("provider_cost_micros"),
    costUncertain: boolean("cost_uncertain").notNull().default(false),
    sanitizedError: text("sanitized_error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.queryId, table.snapshotId],
      foreignColumns: [marketSnapshotQueries.id, marketSnapshotQueries.snapshotId],
      name: "market_search_attempts_query_scope_fkey"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.snapshotId, table.authorityVersion],
      foreignColumns: [marketSnapshotQuestions.id, marketSnapshotQuestions.surfaceAuthorityVersion],
      name: "market_search_attempts_authority_scope_fkey"
    }).onDelete("cascade"),
    uniqueIndex("market_search_attempts_snapshot_number_uidx").on(table.snapshotId, table.attemptNumber),
    uniqueIndex("market_search_attempts_scope_uidx").on(table.id, table.snapshotId, table.queryId),
    uniqueIndex("market_search_attempts_idempotency_uidx").on(table.idempotencyReference),
    index("market_search_attempts_snapshot_idx").on(table.snapshotId, table.startedAt),
    check("market_search_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check("market_search_attempts_status_check", sql`${table.requestStatus} IN ('pending','succeeded','partial','timeout','rate_limited','unavailable','malformed','aborted','authentication','unsupported')`),
    check("market_search_attempts_cost_check", sql`${table.configuredCostMicros} >= 0 AND (${table.providerCostMicros} IS NULL OR ${table.providerCostMicros} >= 0)`),
    check("market_search_attempts_timing_check", sql`(
      (${table.requestStatus} = 'pending' AND ${table.completedAt} IS NULL)
      OR (${table.requestStatus} <> 'pending' AND ${table.completedAt} IS NOT NULL)
    )`),
    check("market_search_attempts_usage_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.usage})`)
  ]
);
export type MarketSearchAttemptRow = typeof marketSearchAttempts.$inferSelect;

export const marketSearchObservations = pgTable(
  "market_search_observations",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull(),
    queryId: text("query_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    surfaceResultOrder: integer("surface_result_order").notNull(),
    resultUrl: text("result_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    resultStatus: text("result_status").notNull(),
    resultMetadata: jsonb("result_metadata").$type<unknown>().notNull().default({}),
    contentHash: text("content_hash").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.attemptId, table.snapshotId, table.queryId],
      foreignColumns: [marketSearchAttempts.id, marketSearchAttempts.snapshotId, marketSearchAttempts.queryId],
      name: "market_search_observations_attempt_scope_fkey"
    }).onDelete("cascade"),
    uniqueIndex("market_search_observations_attempt_order_uidx").on(table.attemptId, table.surfaceResultOrder),
    uniqueIndex("market_search_observations_scope_uidx").on(table.id, table.snapshotId),
    index("market_search_observations_snapshot_idx").on(table.snapshotId, table.queryId, table.surfaceResultOrder),
    check("market_search_observations_order_check", sql`${table.surfaceResultOrder} >= 0`),
    check("market_search_observations_url_check", sql`${table.resultUrl} ~ '^https?://' AND ${table.canonicalUrl} ~ '^https?://'`),
    check("market_search_observations_status_check", sql`${table.resultStatus} IN ('returned','duplicate','inaccessible','filtered')`),
    check("market_search_observations_metadata_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.resultMetadata})`)
  ]
);
export type MarketSearchObservationRow = typeof marketSearchObservations.$inferSelect;

export const marketSourceEvidence = pgTable(
  "market_source_evidence",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull(),
    observationId: text("observation_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    registrableDomain: text("registrable_domain").notNull(),
    retrievalState: text("retrieval_state").notNull(),
    excerpt: text("excerpt"),
    excerptHash: text("excerpt_hash"),
    contentHash: text("content_hash"),
    sourceCategory: text("source_category").notNull(),
    entities: jsonb("entities").$type<unknown>().notNull().default([]),
    claims: jsonb("claims").$type<unknown>().notNull().default([]),
    contradictions: jsonb("contradictions").$type<unknown>().notNull().default([]),
    evidenceFamilyIdentity: text("evidence_family_identity").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.observationId, table.snapshotId],
      foreignColumns: [marketSearchObservations.id, marketSearchObservations.snapshotId],
      name: "market_source_evidence_observation_scope_fkey"
    }).onDelete("cascade"),
    uniqueIndex("market_source_evidence_observation_uidx").on(table.observationId),
    index("market_source_evidence_snapshot_family_idx").on(table.snapshotId, table.evidenceFamilyIdentity),
    index("market_source_evidence_expiry_idx").on(table.retrievalState, table.expiresAt),
    check("market_source_evidence_url_check", sql`${table.canonicalUrl} ~ '^https?://'`),
    check("market_source_evidence_state_check", sql`${table.retrievalState} IN ('available','inaccessible','not_retrieved','expired')`),
    check("market_source_evidence_category_check", sql`${table.sourceCategory} IN ('company_owned','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown')`),
    check("market_source_evidence_excerpt_bound_check", sql`${table.excerpt} IS NULL OR char_length(${table.excerpt}) <= 1200`),
    check("market_source_evidence_content_check", sql`(
      (${table.retrievalState} = 'available' AND ${table.excerpt} IS NOT NULL AND ${table.excerptHash} IS NOT NULL AND ${table.contentHash} IS NOT NULL)
      OR (${table.retrievalState} IN ('inaccessible','not_retrieved') AND ${table.excerpt} IS NULL AND ${table.excerptHash} IS NULL AND ${table.contentHash} IS NULL)
      OR (${table.retrievalState} = 'expired' AND ${table.excerpt} IS NULL
        AND ${table.excerptHash} IS NOT NULL AND ${table.contentHash} IS NOT NULL)
    )`),
    check("market_source_evidence_entities_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.entities})`),
    check("market_source_evidence_claims_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.claims})`),
    check("market_source_evidence_contradictions_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.contradictions})`)
  ]
);
export type MarketSourceEvidenceRow = typeof marketSourceEvidence.$inferSelect;

export const publicSourceRetrievalAttempts = pgTable(
  "public_source_retrieval_attempts",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    questionId: text("question_id").notNull().references(() => reportBusinessQuestions.id, { onDelete: "restrict" }),
    snapshotId: text("snapshot_id").notNull().references(() => marketSnapshotQuestions.id, { onDelete: "restrict" }),
    observationId: text("observation_id").notNull().references(() => marketSearchObservations.id, { onDelete: "restrict" }),
    canonicalUrl: text("canonical_url").notNull(),
    finalUrl: text("final_url"),
    registrableDomain: text("registrable_domain").notNull(),
    method: text("method").$type<"http" | "browser">().notNull(),
    attemptOrder: integer("attempt_order").notNull(),
    stage: text("stage").notNull(),
    outcome: text("outcome").notNull(),
    httpStatus: integer("http_status"),
    robotsOutcome: text("robots_outcome"),
    contentType: text("content_type"),
    contentBytes: integer("content_bytes"),
    durationMs: integer("duration_ms").notNull(),
    extractorVersion: text("extractor_version"),
    decoderVersion: text("decoder_version"),
    browserPolicyVersion: text("browser_policy_version"),
    retryEligible: boolean("retry_eligible").notNull(),
    browserEligible: boolean("browser_eligible").notNull(),
    safeDetail: text("safe_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("public_source_retrieval_attempts_scope_uidx").on(table.snapshotId, table.questionId, table.canonicalUrl, table.method, table.attemptOrder),
    index("public_source_retrieval_attempts_question_idx").on(table.reportId, table.jobId, table.questionId, table.attemptOrder),
    check("public_source_retrieval_attempts_method_check", sql`${table.method} IN ('http','browser')`),
    check("public_source_retrieval_attempts_url_check", sql`${table.canonicalUrl} ~ '^https?://' AND (${table.finalUrl} IS NULL OR ${table.finalUrl} ~ '^https?://')`),
    check("public_source_retrieval_attempts_order_check", sql`${table.attemptOrder} >= 0`),
    check("public_source_retrieval_attempts_duration_check", sql`${table.durationMs} >= 0`)
  ]
);
export type PublicSourceRetrievalAttemptRow = typeof publicSourceRetrievalAttempts.$inferSelect;

export const questionAcquisitionCheckpoints = pgTable(
  "question_acquisition_checkpoints",
  {
    identityHash: text("identity_hash").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    questionId: text("question_id").notNull().references(() => reportBusinessQuestions.id, { onDelete: "restrict" }),
    snapshotId: text("snapshot_id").notNull().references(() => marketSnapshotQuestions.id, { onDelete: "restrict" }),
    candidatePoolHash: text("candidate_pool_hash").notNull(),
    state: text("state").$type<"collecting" | "evidence_target_met" | "exhausted" | "collection_failed">().notNull(),
    plannedCandidates: integer("planned_candidates").notNull(),
    attemptedCandidates: integer("attempted_candidates").notNull(),
    remainingCandidates: integer("remaining_candidates").notNull(),
    returnedObservations: integer("returned_observations").notNull(),
    extractedDocuments: integer("extracted_documents").notNull(),
    eligibleEvidenceIds: jsonb("eligible_evidence_ids").$type<string[]>().notNull().default([]),
    independentDomains: jsonb("independent_domains").$type<string[]>().notNull().default([]),
    queryRewritesUsed: integer("query_rewrites_used").notNull(),
    httpBudgetUsed: integer("http_budget_used").notNull(),
    browserBudgetUsed: integer("browser_budget_used").notNull(),
    revision: integer("revision").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("question_acquisition_checkpoints_job_question_uidx").on(table.jobId, table.questionId),
    check("question_acquisition_checkpoints_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.candidatePoolHash} ~ '^[a-f0-9]{64}$'`),
    check("question_acquisition_checkpoints_count_check", sql`${table.plannedCandidates} >= 0 AND ${table.attemptedCandidates} >= 0 AND ${table.remainingCandidates} >= 0 AND ${table.revision} >= 1`)
  ]
);
export type QuestionAcquisitionCheckpointRow = typeof questionAcquisitionCheckpoints.$inferSelect;

export const marketSourcePassages = pgTable(
  "market_source_passages",
  {
    id: text("id").primaryKey(),
    sourceEvidenceId: text("source_evidence_id").notNull().references(() => marketSourceEvidence.id, { onDelete: "restrict" }),
    passageOrder: integer("passage_order").notNull(),
    exactExcerpt: text("exact_excerpt").notNull(),
    excerptHash: text("excerpt_hash").notNull(),
    relevanceScore: integer("relevance_score").notNull(),
    matchedEntityTerms: jsonb("matched_entity_terms").$type<string[]>().notNull().default([]),
    matchedServiceTerms: jsonb("matched_service_terms").$type<string[]>().notNull().default([]),
    matchedControlTerms: jsonb("matched_control_terms").$type<string[]>().notNull().default([]),
    matchedCapabilityTerms: jsonb("matched_capability_terms").$type<string[]>().notNull().default([]),
    selectorVersion: text("selector_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("market_source_passages_source_order_uidx").on(table.sourceEvidenceId, table.passageOrder),
    uniqueIndex("market_source_passages_source_hash_uidx").on(table.sourceEvidenceId, table.excerptHash),
    index("market_source_passages_source_score_idx").on(table.sourceEvidenceId, table.relevanceScore),
    check("market_source_passages_order_check", sql`${table.passageOrder} >= 0`),
    check("market_source_passages_excerpt_check", sql`char_length(btrim(${table.exactExcerpt})) BETWEEN 1 AND 1200`),
    check("market_source_passages_hash_check", sql`${table.excerptHash} ~ '^[a-f0-9]{64}$'`),
    check("market_source_passages_score_check", sql`${table.relevanceScore} BETWEEN 0 AND 100`),
    check("market_source_passages_selector_check", sql`length(btrim(${table.selectorVersion})) > 0`),
    check("market_source_passages_entity_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.matchedEntityTerms})`),
    check("market_source_passages_service_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.matchedServiceTerms})`),
    check("market_source_passages_control_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.matchedControlTerms})`),
    check("market_source_passages_capability_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.matchedCapabilityTerms})`)
  ]
);
export type MarketSourcePassageRow = typeof marketSourcePassages.$inferSelect;

export const marketProviderClaims = pgTable(
  "market_provider_claims",
  {
    id: text("id").primaryKey(),
    passageId: text("passage_id").notNull().references(() => marketSourcePassages.id, { onDelete: "restrict" }),
    providerEntityId: text("provider_entity_id").notNull(),
    canonicalName: text("canonical_name").notNull(),
    genericRole: text("generic_role").notNull(),
    policyRole: text("policy_role").notNull(),
    capability: text("capability").notNull(),
    operatingMode: text("operating_mode").notNull(),
    serviceScope: jsonb("service_scope").$type<string[]>().notNull().default([]),
    routeScope: jsonb("route_scope").$type<string[]>().notNull().default([]),
    exactExcerpt: text("exact_excerpt").notNull(),
    claimHash: text("claim_hash").notNull(),
    extractionModel: text("extraction_model").notNull(),
    extractionContract: text("extraction_contract").notNull(),
    validationStatus: text("validation_status").notNull(),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("market_provider_claims_passage_hash_uidx").on(table.passageId, table.claimHash),
    index("market_provider_claims_provider_idx").on(table.providerEntityId, table.validationStatus),
    check("market_provider_claims_excerpt_check", sql`char_length(btrim(${table.exactExcerpt})) BETWEEN 1 AND 1200`),
    check("market_provider_claims_hash_check", sql`${table.claimHash} ~ '^[a-f0-9]{64}$'`),
    check("market_provider_claims_status_check", sql`${table.validationStatus} IN ('accepted','rejected')`),
    check("market_provider_claims_rejection_check", sql`(
      (${table.validationStatus} = 'accepted' AND ${table.rejectionReason} IS NULL)
      OR (${table.validationStatus} = 'rejected' AND char_length(btrim(${table.rejectionReason})) BETWEEN 1 AND 240)
    )`),
    check("market_provider_claims_service_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.serviceScope})`),
    check("market_provider_claims_route_privacy_check", sql`ogc_public_jsonb_metadata_valid(${table.routeScope})`)
  ]
);
export type MarketProviderClaimRow = typeof marketProviderClaims.$inferSelect;

export const marketSnapshotLeases = pgTable(
  "market_snapshot_leases",
  {
    cacheIdentity: text("cache_identity").primaryKey(),
    leaseOwner: text("lease_owner").notNull(),
    state: text("state").notNull().default("active"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    terminalSnapshotId: text("terminal_snapshot_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.terminalSnapshotId, table.cacheIdentity],
      foreignColumns: [marketSnapshotQuestions.id, marketSnapshotQuestions.cacheIdentity],
      name: "market_snapshot_leases_terminal_scope_fkey"
    }).onDelete("restrict"),
    index("market_snapshot_leases_expiry_idx").on(table.state, table.expiresAt),
    check("market_snapshot_leases_state_check", sql`${table.state} IN ('active','completed','failed')`),
    check("market_snapshot_leases_attempt_check", sql`${table.attemptNumber} > 0`),
    check("market_snapshot_leases_terminal_check", sql`(
      (${table.state} = 'completed' AND ${table.terminalSnapshotId} IS NOT NULL)
      OR (${table.state} <> 'completed' AND ${table.terminalSnapshotId} IS NULL)
    )`)
  ]
);
export type MarketSnapshotLeaseRow = typeof marketSnapshotLeases.$inferSelect;

export const reportMarketSnapshotRefs = pgTable(
  "report_market_snapshot_refs",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    snapshotId: text("snapshot_id").notNull().references(() => marketSnapshotQuestions.id, { onDelete: "restrict" }),
    cacheIdentity: text("cache_identity").notNull(),
    evidenceCutoff: timestamp("evidence_cutoff", { withTimezone: true }).notNull(),
    freshnessState: text("freshness_state").notNull(),
    actualCostMicros: integer("actual_cost_micros").notNull().default(0),
    allocatedCostMicros: integer("allocated_cost_micros").notNull().default(0),
    avoidedCostMicros: integer("avoided_cost_micros").notNull().default(0),
    bindingHash: text("binding_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.jobId, table.reportId],
      foreignColumns: [scanJobs.id, scanJobs.reportId],
      name: "report_market_snapshot_refs_job_report_fkey"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.snapshotId, table.cacheIdentity],
      foreignColumns: [marketSnapshotQuestions.id, marketSnapshotQuestions.cacheIdentity],
      name: "report_market_snapshot_refs_snapshot_cache_fkey"
    }).onDelete("restrict"),
    uniqueIndex("report_market_snapshot_refs_job_snapshot_uidx").on(table.jobId, table.snapshotId),
    index("report_market_snapshot_refs_report_idx").on(table.reportId, table.createdAt),
    check("report_market_snapshot_refs_freshness_check", sql`${table.freshnessState} IN ('fresh','historical','insufficient')`),
    check("report_market_snapshot_refs_cost_check", sql`${table.actualCostMicros} >= 0 AND ${table.allocatedCostMicros} >= 0 AND ${table.avoidedCostMicros} >= 0`)
  ]
);
export type ReportMarketSnapshotRefRow = typeof reportMarketSnapshotRefs.$inferSelect;

export const reportSourceForensics = pgTable(
  "report_source_forensics",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    reportVersion: integer("report_version").notNull(),
    fulfillmentMethodology: text("fulfillment_methodology").$type<RecommendationFulfillmentMethodology>().notNull(),
    productContract: text("product_contract").$type<ReportProductContract>().notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    authorityHash: text("authority_hash").notNull(),
    provenanceHash: text("provenance_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    isPrivate: boolean("is_private").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.jobId, table.reportId],
      foreignColumns: [scanJobs.id, scanJobs.reportId],
      name: "report_source_forensics_job_report_fkey"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.jobId, table.reportId, table.productContract, table.fulfillmentMethodology, table.reportVersion],
      foreignColumns: [
        scanJobs.id, scanJobs.reportId, scanJobs.productContract,
        scanJobs.fulfillmentMethodology, scanJobs.recommendationReportVersion
      ],
      name: "report_source_forensics_v2_job_fkey"
    }).onDelete("cascade"),
    uniqueIndex("report_source_forensics_report_uidx").on(table.reportId),
    uniqueIndex("report_source_forensics_job_uidx").on(table.jobId),
    check("report_source_forensics_version_check", sql`${table.reportVersion} = 2`),
    check("report_source_forensics_methodology_check", sql`${table.fulfillmentMethodology} = 'public_search_source_forensics_v1'`),
    check("report_source_forensics_product_check", sql`${table.productContract} = 'recommendation_forensics_v1'`),
    check("report_source_forensics_private_check", sql`${table.isPrivate} = true`)
  ]
);
export type ReportSourceForensicsRow = typeof reportSourceForensics.$inferSelect;

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
    siteSnapshotId: text("site_snapshot_id").references(() => reportV4SiteSnapshots.id, { onDelete: "restrict" }),
    fulfillmentJobId: text("fulfillment_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
    siteKey: text("site_key").notNull(),
    customerEmailEncrypted: text("customer_email_encrypted").notNull(),
    customerEmailHmac: text("customer_email_hmac").notNull(),
    emailKeyVersion: text("email_key_version").notNull(),
    productCode: text("product_code").notNull(),
    businessQuestionSetId: text("business_question_set_id"),
    fulfillmentMethodology: text("fulfillment_methodology").$type<RecommendationFulfillmentMethodology>(),
    recommendationReportVersion: integer("recommendation_report_version").$type<RecommendationReportVersion>(),
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
      .where(sql`${table.paymentStatus} IN ('created','pending') OR (${table.paymentStatus} = 'paid' AND ${table.refundStatus} <> 'refunded')`),
    index("payment_orders_email_hmac_idx").on(table.customerEmailHmac, table.createdAt),
    index("payment_orders_site_snapshot_idx").on(table.siteSnapshotId),
    index("payment_orders_sla_idx").on(table.fulfillmentStatus, table.deliveryDeadlineAt),
    foreignKey({
      columns: [table.fulfillmentJobId, table.reportId, table.siteSnapshotId],
      foreignColumns: [scanJobs.id, scanJobs.reportId, scanJobs.siteSnapshotId],
      name: "payment_orders_fulfillment_snapshot_fkey"
    }).onDelete("restrict"),
    check("payment_orders_provider_check", sql`${table.provider} IN ('airwallex','stripe')`),
    check("payment_orders_report_locale_check", sql`${table.reportLocale} IN ('en','zh')`),
    check("payment_orders_currency_check", sql`${table.currency} IN ('CNY','USD','HKD')`),
    check("payment_orders_amount_check", sql`${table.amountMinor} > 0`),
    check("payment_orders_methodology_product_check", sql`(
      (${table.productCode} = 'recommendation_forensics_v1'
        AND ${table.fulfillmentMethodology} IS NOT NULL
        AND ${table.recommendationReportVersion} IS NOT NULL
        AND ((${table.fulfillmentMethodology} = 'answer_engine_recommendation_forensics_v1' AND ${table.recommendationReportVersion} = 1)
          OR (${table.fulfillmentMethodology} = 'public_search_source_forensics_v1' AND ${table.recommendationReportVersion} = 2)
          OR (${table.fulfillmentMethodology} = 'two_stage_geo_report_v4' AND ${table.recommendationReportVersion} = 4)))
      OR (${table.productCode} <> 'recommendation_forensics_v1' AND ${table.fulfillmentMethodology} IS NULL AND ${table.recommendationReportVersion} IS NULL)
    )`),
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

export const reportBusinessQuestionSets = pgTable(
  "report_business_question_sets",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    locale: text("locale").notNull(),
    region: text("region").notNull(),
    status: text("status").notNull(),
    confidence: text("confidence").notNull(),
    acknowledgedLowConfidence: boolean("acknowledged_low_confidence").notNull().default(false),
    generationRuleVersion: text("generation_rule_version").notNull(),
    neutralizationVersion: text("neutralization_version").notNull(),
    profileEvidenceIdentity: text("profile_evidence_identity").notNull(),
    contentHash: text("content_hash"),
    neutralContentHash: text("neutral_content_hash"),
    payload: jsonb("payload").$type<BusinessQuestionCandidateSet | ConfirmedBusinessQuestionSet>(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_business_question_sets_v4_identity_uidx").on(table.id, table.reportId),
    uniqueIndex("report_business_question_sets_report_revision_uidx").on(table.reportId, table.revision),
    uniqueIndex("report_business_question_sets_order_revision_uidx").on(table.orderId, table.revision),
    check("report_business_question_sets_revision_check", sql`${table.revision} > 0`),
    check("report_business_question_sets_status_check", sql`${table.status} IN ('candidate','confirmed','locked','neutralization_failed')`),
    check("report_business_question_sets_confidence_check", sql`${table.confidence} IN ('low','high')`),
    check("report_business_question_sets_confirmation_check", sql`${table.status} NOT IN ('confirmed','locked') OR (${table.confirmedAt} IS NOT NULL AND ${table.contentHash} IS NOT NULL AND ${table.neutralContentHash} IS NOT NULL AND ${table.payload} IS NOT NULL)`)
  ]
);
export type ReportBusinessQuestionSetRow = typeof reportBusinessQuestionSets.$inferSelect;

export const reportBusinessQuestions = pgTable(
  "report_business_questions",
  {
    id: text("id").primaryKey(),
    questionSetId: text("question_set_id").notNull().references(() => reportBusinessQuestionSets.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    purpose: text("purpose").notNull(),
    generatedText: text("generated_text").notNull(),
    privateText: text("private_text"),
    neutralPublicText: text("neutral_public_text").notNull(),
    edited: boolean("edited").notNull().default(false),
    neutralContentHash: text("neutral_content_hash").notNull(),
    derivation: jsonb("derivation").notNull().default({})
  },
  (table) => [
    uniqueIndex("report_business_questions_v4_identity_uidx").on(table.id, table.questionSetId, table.ordinal),
    uniqueIndex("report_business_questions_set_ordinal_uidx").on(table.questionSetId, table.ordinal),
    uniqueIndex("report_business_questions_set_purpose_uidx").on(table.questionSetId, table.purpose),
    check("report_business_questions_ordinal_check", sql`${table.ordinal} BETWEEN 1 AND 3`),
    check("report_business_questions_purpose_check", sql`${table.purpose} IN ('core_service_discovery','customer_region_fit','purchase_delivery_risk')`)
  ]
);
export type ReportBusinessQuestionRow = typeof reportBusinessQuestions.$inferSelect;

export type ReportV4QuestionCheckpointState = "queued" | "answering" | "retrying" | "answered" | "unavailable";

export const reportV4QuestionCheckpoints = pgTable(
  "report_v4_question_checkpoints",
  {
    identityHash: text("identity_hash").primaryKey(),
    reportId: text("report_id").notNull(),
    jobId: text("job_id").notNull(),
    questionSetId: text("question_set_id").notNull(),
    questionId: text("question_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    state: text("state").$type<ReportV4QuestionCheckpointState>().notNull(),
    questionIdentityHash: text("question_identity_hash").notNull(),
    modelConfigIdentityHash: text("model_config_identity_hash").notNull(),
    inputIdentityHash: text("input_identity_hash").notNull(),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    answerPayload: jsonb("answer_payload").$type<unknown>(),
    sourcePayload: jsonb("source_payload").$type<unknown[]>().notNull().default([]),
    answerContentHash: text("answer_content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_question_checkpoints_job_ordinal_uidx").on(table.jobId, table.ordinal),
    uniqueIndex("report_v4_question_checkpoints_job_question_uidx").on(table.jobId, table.questionId),
    foreignKey({ columns: [table.jobId, table.reportId], foreignColumns: [scanJobs.id, scanJobs.reportId], name: "report_v4_question_checkpoints_job_report_fkey" }).onDelete("restrict"),
    foreignKey({ columns: [table.questionId, table.questionSetId, table.ordinal], foreignColumns: [reportBusinessQuestions.id, reportBusinessQuestions.questionSetId, reportBusinessQuestions.ordinal], name: "report_v4_question_checkpoints_question_fkey" }).onDelete("restrict"),
    foreignKey({ columns: [table.questionSetId, table.reportId], foreignColumns: [reportBusinessQuestionSets.id, reportBusinessQuestionSets.reportId], name: "report_v4_question_checkpoints_question_set_fkey" }).onDelete("restrict"),
    foreignKey({ columns: [table.snapshotId, table.reportId], foreignColumns: [reportV4SiteSnapshots.id, reportV4SiteSnapshots.reportId], name: "report_v4_question_checkpoints_snapshot_fkey" }).onDelete("restrict"),
    check("report_v4_question_checkpoints_ordinal_check", sql`${table.ordinal} BETWEEN 1 AND 3`),
    check("report_v4_question_checkpoints_state_check", sql`${table.state} IN ('queued','answering','retrying','answered','unavailable')`),
    check("report_v4_question_checkpoints_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.questionIdentityHash} ~ '^[a-f0-9]{64}$' AND ${table.modelConfigIdentityHash} ~ '^[a-f0-9]{64}$' AND ${table.inputIdentityHash} ~ '^[a-f0-9]{64}$' AND (${table.answerContentHash} IS NULL OR ${table.answerContentHash} ~ '^[a-f0-9]{64}$')`),
    check("report_v4_question_checkpoints_call_count_check", sql`${table.providerCallCount} BETWEEN 0 AND 2`),
    check("report_v4_question_checkpoints_source_check", sql`jsonb_typeof(${table.sourcePayload})='array' AND jsonb_array_length(${table.sourcePayload}) <= 5`),
    check("report_v4_question_checkpoints_answer_shape_check", sql`(${table.state}='answered' AND ${table.providerCallCount} BETWEEN 1 AND 2 AND ${table.answerPayload} IS NOT NULL AND ${table.answerContentHash} IS NOT NULL) OR (${table.state}<>'answered' AND ${table.answerPayload} IS NULL AND ${table.answerContentHash} IS NULL)`)
  ]
);
export type ReportV4QuestionCheckpointRow = typeof reportV4QuestionCheckpoints.$inferSelect;

export const reportCorrections = pgTable(
  "report_corrections",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, { onDelete: "restrict" }),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    originalPaidJobId: text("original_paid_job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    correctionJobId: text("correction_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
    questionSetId: text("question_set_id").notNull().references(() => reportBusinessQuestionSets.id, { onDelete: "restrict" }),
    activeArtifactRevisionId: text("active_artifact_revision_id"),
    state: text("state").notNull().default("review_required"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("report_corrections_order_uidx").on(table.orderId),
    uniqueIndex("report_corrections_job_uidx").on(table.correctionJobId),
    uniqueIndex("report_corrections_question_set_uidx").on(table.questionSetId),
    check("report_corrections_state_check", sql`${table.state} IN ('review_required','queued','running','repair_wait','completed','failed')`)
  ]
);
export type ReportCorrectionRow = typeof reportCorrections.$inferSelect;

export const reportV4ConfigSnapshots = pgTable(
  "report_v4_config_snapshots",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, { onDelete: "restrict" }),
    coreJobId: text("core_job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    identityHash: text("identity_hash").notNull(),
    modelProfileId: text("model_profile_id").notNull(),
    modelProfileHash: text("model_profile_hash").notNull(),
    modelProfilePayload: jsonb("model_profile_payload").$type<ModelProfile>().notNull(),
    reportProfileId: text("report_profile_id").notNull(),
    reportProfileHash: text("report_profile_hash").notNull(),
    reportProfilePayload: jsonb("report_profile_payload").$type<ReportV4CustomerProseProfile>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_config_snapshots_report_uidx").on(table.reportId),
    uniqueIndex("report_v4_config_snapshots_order_uidx").on(table.orderId),
    uniqueIndex("report_v4_config_snapshots_core_job_uidx").on(table.coreJobId),
    uniqueIndex("report_v4_config_snapshots_binding_uidx").on(table.id, table.reportId, table.orderId, table.coreJobId),
    check("report_v4_config_snapshots_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.modelProfileHash} ~ '^[a-f0-9]{64}$' AND ${table.reportProfileHash} ~ '^[a-f0-9]{64}$'`),
    check("report_v4_config_snapshots_identity_id_check", sql`${table.id} = 'v4-config-' || ${table.identityHash}`),
    check("report_v4_config_snapshots_profile_id_check", sql`length(btrim(${table.modelProfileId})) > 0 AND length(btrim(${table.reportProfileId})) > 0`),
    check("report_v4_config_snapshots_payload_check", sql`jsonb_typeof(${table.modelProfilePayload})='object' AND jsonb_typeof(${table.reportProfilePayload})='object'`)
  ]
);
export type ReportV4ConfigSnapshotSchemaRow = typeof reportV4ConfigSnapshots.$inferSelect;

export const reportArtifactRevisions = pgTable(
  "report_artifact_revisions",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, { onDelete: "restrict" }),
    jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    configSnapshotId: text("config_snapshot_id").references(() => reportV4ConfigSnapshots.id, { onDelete: "restrict" }),
    correctionId: text("correction_id").references(() => reportCorrections.id, { onDelete: "restrict" }),
    replacementFulfillmentId: text("replacement_fulfillment_id"),
    sourceArtifactRevisionId: text("source_artifact_revision_id"),
    revisionKind: text("revision_kind").$type<ArtifactRevisionKind>().notNull().default("generation"),
    revision: integer("revision").notNull(),
    artifactContract: text("artifact_contract").$type<ReportArtifactContract>().notNull(),
    status: text("status").notNull().default("pending"),
    payloadIdentityHash: text("payload_identity_hash").notNull(),
    htmlSha256: text("html_sha256"),
    pdfSha256: text("pdf_sha256"),
    pdfStorageKey: text("pdf_storage_key"),
    readiness: jsonb("readiness").notNull().default({}),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_artifact_revisions_report_revision_uidx").on(table.reportId, table.revision),
    uniqueIndex("report_artifact_revisions_job_uidx").on(table.jobId),
    uniqueIndex("report_artifact_revisions_correction_uidx").on(table.correctionId).where(sql`${table.correctionId} IS NOT NULL`),
    uniqueIndex("report_artifact_revisions_replacement_uidx").on(table.replacementFulfillmentId).where(sql`${table.replacementFulfillmentId} IS NOT NULL`),
    uniqueIndex("report_artifact_revisions_one_active_uidx").on(table.reportId).where(sql`${table.status} = 'active'`),
    uniqueIndex("report_artifact_revisions_v4_diagnosis_source_uidx").on(table.sourceArtifactRevisionId)
      .where(sql`${table.artifactContract}='combined_geo_report_v4' AND ${table.revisionKind}='diagnosis_enhancement'`),
    foreignKey({ columns: [table.sourceArtifactRevisionId], foreignColumns: [table.id], name: "report_artifact_revisions_source_fkey" }).onDelete("restrict"),
    check("report_artifact_revisions_revision_check", sql`${table.revision} > 0`),
    check("report_artifact_revisions_contract_check", sql`${table.artifactContract} IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4')`),
    check("report_artifact_revisions_status_check", sql`${table.status} IN ('pending','ready','active','failed')`),
    check("report_artifact_revisions_kind_check", sql`${table.revisionKind} IN ('generation','correction','presentation_refresh','evidence_refresh','replacement','diagnosis_enhancement')`),
    check("report_artifact_revisions_lineage_check", sql`(${table.revisionKind} IN ('presentation_refresh','evidence_refresh','diagnosis_enhancement') AND ${table.sourceArtifactRevisionId} IS NOT NULL AND ${table.correctionId} IS NULL AND ${table.replacementFulfillmentId} IS NULL) OR (${table.revisionKind} = 'replacement' AND ${table.sourceArtifactRevisionId} IS NULL AND ${table.correctionId} IS NULL AND ${table.replacementFulfillmentId} IS NOT NULL) OR (${table.revisionKind} IN ('generation','correction') AND ${table.sourceArtifactRevisionId} IS NULL AND ${table.replacementFulfillmentId} IS NULL)`),
    check("report_artifact_revisions_v4_kind_check", sql`(${table.artifactContract}='combined_geo_report_v4' AND ${table.revisionKind} IN ('generation','diagnosis_enhancement')) OR (${table.artifactContract} IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND ${table.revisionKind}<>'diagnosis_enhancement')`),
    check("report_artifact_revisions_v4_config_shape_check", sql`${table.artifactContract}='combined_geo_report_v4' OR ${table.configSnapshotId} IS NULL`),
    check("report_artifact_revisions_ready_check", sql`${table.status} NOT IN ('ready','active') OR (${table.readyAt} IS NOT NULL AND ${table.htmlSha256} IS NOT NULL AND ((${table.artifactContract}='combined_geo_report_v4' AND ${table.pdfSha256} IS NULL AND ${table.pdfStorageKey} IS NULL) OR (${table.artifactContract} IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND ${table.pdfSha256} IS NOT NULL AND ${table.pdfStorageKey} IS NOT NULL)))`)
  ]
);
export type ReportArtifactRevisionRow = typeof reportArtifactRevisions.$inferSelect;

export type ReportV4DiagnosisCheckpointState = "queued" | "running" | "completed" | "failed";

export const reportV4DiagnosisCheckpoints = pgTable(
  "report_v4_diagnosis_checkpoints",
  {
    identityHash: text("identity_hash").primaryKey(),
    reportId: text("report_id").notNull(),
    enhancementJobId: text("enhancement_job_id").notNull(),
    coreArtifactRevisionId: text("core_artifact_revision_id").notNull().references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
    configSnapshotId: text("config_snapshot_id").notNull().references(() => reportV4ConfigSnapshots.id, { onDelete: "restrict" }),
    questionSetId: text("question_set_id").notNull(),
    questionId: text("question_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    state: text("state").$type<ReportV4DiagnosisCheckpointState>().notNull(),
    inputIdentityHash: text("input_identity_hash").notNull(),
    diagnosisInputPayload: jsonb("diagnosis_input_payload").$type<Record<string, unknown>>().notNull(),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    sourceAuditPayload: jsonb("source_audit_payload").$type<unknown[]>().notNull().default([]),
    diagnosisPayload: jsonb("diagnosis_payload").$type<Record<string, unknown>>(),
    diagnosisContentHash: text("diagnosis_content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_v4_diagnosis_checkpoints_job_ordinal_uidx").on(table.enhancementJobId, table.ordinal),
    uniqueIndex("report_v4_diagnosis_checkpoints_job_question_uidx").on(table.enhancementJobId, table.questionId),
    foreignKey({
      columns: [table.enhancementJobId, table.reportId],
      foreignColumns: [scanJobs.id, scanJobs.reportId],
      name: "report_v4_diagnosis_checkpoints_job_report_fkey"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.questionId, table.questionSetId, table.ordinal],
      foreignColumns: [reportBusinessQuestions.id, reportBusinessQuestions.questionSetId, reportBusinessQuestions.ordinal],
      name: "report_v4_diagnosis_checkpoints_question_fkey"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.questionSetId, table.reportId],
      foreignColumns: [reportBusinessQuestionSets.id, reportBusinessQuestionSets.reportId],
      name: "report_v4_diagnosis_checkpoints_question_set_fkey"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.snapshotId, table.reportId],
      foreignColumns: [reportV4SiteSnapshots.id, reportV4SiteSnapshots.reportId],
      name: "report_v4_diagnosis_checkpoints_snapshot_fkey"
    }).onDelete("restrict"),
    check("report_v4_diagnosis_checkpoints_ordinal_check", sql`${table.ordinal} BETWEEN 1 AND 3`),
    check("report_v4_diagnosis_checkpoints_state_check", sql`${table.state} IN ('queued','running','completed','failed')`),
    check("report_v4_diagnosis_checkpoints_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.inputIdentityHash} ~ '^[a-f0-9]{64}$' AND (${table.diagnosisContentHash} IS NULL OR ${table.diagnosisContentHash} ~ '^[a-f0-9]{64}$')`),
    check("report_v4_diagnosis_checkpoints_input_payload_check", sql`jsonb_typeof(${table.diagnosisInputPayload})='object' AND octet_length(${table.diagnosisInputPayload}::text)<=262144`),
    check("report_v4_diagnosis_checkpoints_call_count_check", sql`${table.providerCallCount} BETWEEN 0 AND 2`),
    check("report_v4_diagnosis_checkpoints_source_audit_check", sql`ogc_report_v4_source_audit_payload_valid(${table.sourceAuditPayload},${table.questionId})`),
    check("report_v4_diagnosis_checkpoints_payload_check", sql`(${table.diagnosisPayload} IS NULL OR ogc_report_v4_diagnosis_payload_valid(${table.diagnosisPayload})) AND ((${table.state}='queued' AND ${table.providerCallCount}=0 AND jsonb_array_length(${table.sourceAuditPayload})=0 AND ${table.diagnosisPayload} IS NULL AND ${table.diagnosisContentHash} IS NULL) OR (${table.state}='running' AND ${table.diagnosisPayload} IS NULL AND ${table.diagnosisContentHash} IS NULL) OR (${table.state}='completed' AND ${table.providerCallCount} BETWEEN 1 AND 2 AND ${table.diagnosisPayload} IS NOT NULL AND ${table.diagnosisContentHash} IS NOT NULL) OR (${table.state}='failed' AND ${table.diagnosisPayload} IS NULL AND ${table.diagnosisContentHash} IS NULL))`)
  ]
);
export type ReportV4DiagnosisCheckpointRow = typeof reportV4DiagnosisCheckpoints.$inferSelect;

export const reportV4AcceptanceSessions = pgTable("report_v4_acceptance_sessions", {
  id: text("id").primaryKey(),
  environment: text("environment").notNull().default("protected_staging"),
  previewDeploymentId: text("preview_deployment_id").notNull(),
  protectedAliasUrl: text("protected_alias_url").notNull(),
  webGitSha: text("web_git_sha").notNull(),
  workerGitSha: text("worker_git_sha").notNull(),
  state: text("state").$type<ReportV4AcceptanceSessionState>().notNull().default("collecting"),
  headSequence: integer("head_sequence").notNull().default(0),
  headHash: text("head_hash").notNull().default("0".repeat(64)),
  eventCount: integer("event_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  terminalAt: timestamp("terminal_at", { withTimezone: true })
}, (table) => [
  check("report_v4_acceptance_sessions_id_check", sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
  check("report_v4_acceptance_sessions_environment_check", sql`${table.environment}='protected_staging'`),
  check("report_v4_acceptance_sessions_deployment_check", sql`${table.previewDeploymentId}=btrim(${table.previewDeploymentId}) AND length(${table.previewDeploymentId}) BETWEEN 1 AND 200 AND ${table.protectedAliasUrl} ~ '^https://[^/?#@[:space:]]+$'`),
  check("report_v4_acceptance_sessions_sha_check", sql`${table.webGitSha} ~ '^[a-f0-9]{40}$' AND ${table.workerGitSha} ~ '^[a-f0-9]{40}$' AND ${table.webGitSha}=${table.workerGitSha}`),
  check("report_v4_acceptance_sessions_state_check", sql`${table.state} IN ('collecting','sealed','failed')`),
  check("report_v4_acceptance_sessions_head_check", sql`${table.headSequence}>=0 AND ${table.eventCount}=${table.headSequence} AND ${table.headHash} ~ '^[a-f0-9]{64}$'`),
  check("report_v4_acceptance_sessions_terminal_check", sql`(${table.state}='collecting' AND ${table.terminalAt} IS NULL) OR (${table.state} IN ('sealed','failed') AND ${table.terminalAt} IS NOT NULL)`)
]);
export type ReportV4AcceptanceSessionRow = typeof reportV4AcceptanceSessions.$inferSelect;

export const reportV4AcceptanceScenarios = pgTable("report_v4_acceptance_scenarios", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => reportV4AcceptanceSessions.id, { onDelete: "restrict" }),
  kind: text("kind").$type<ReportV4AcceptanceScenarioKind>().notNull(),
  faultKind: text("fault_kind").$type<ReportV4AcceptanceFaultKind>(),
  faultQuestionId: text("fault_question_id"),
  faultSourceId: text("fault_source_id"),
  expectedFaultOccurrences: integer("expected_fault_occurrences").notNull().default(0),
  reportId: text("report_id").references(() => scanReports.id, { onDelete: "restrict" }),
  orderId: text("order_id").references(() => paymentOrders.id, { onDelete: "restrict" }),
  preAdmissionJobId: text("pre_admission_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
  coreJobId: text("core_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
  enhancementJobId: text("enhancement_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
  siteSnapshotId: text("site_snapshot_id").references(() => reportV4SiteSnapshots.id, { onDelete: "restrict" }),
  configSnapshotId: text("config_snapshot_id").references(() => reportV4ConfigSnapshots.id, { onDelete: "restrict" }),
  questionSetId: text("question_set_id").references(() => reportBusinessQuestionSets.id, { onDelete: "restrict" }),
  coreArtifactRevisionId: text("core_artifact_revision_id").references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
  enhancementArtifactRevisionId: text("enhancement_artifact_revision_id").references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
  baselineFingerprint: text("baseline_fingerprint"),
  finalFingerprint: text("final_fingerprint"),
  state: text("state").$type<ReportV4AcceptanceSessionState>().notNull().default("collecting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  terminalAt: timestamp("terminal_at", { withTimezone: true })
}, (table) => [
  uniqueIndex("report_v4_acceptance_scenarios_session_kind_uidx").on(table.sessionId, table.kind),
  uniqueIndex("report_v4_acceptance_scenarios_id_session_uidx").on(table.id, table.sessionId),
  uniqueIndex("report_v4_acceptance_scenarios_report_uidx").on(table.reportId).where(sql`${table.reportId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_order_uidx").on(table.orderId).where(sql`${table.orderId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_pre_job_uidx").on(table.preAdmissionJobId).where(sql`${table.preAdmissionJobId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_core_job_uidx").on(table.coreJobId).where(sql`${table.coreJobId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_enhancement_job_uidx").on(table.enhancementJobId).where(sql`${table.enhancementJobId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_core_artifact_uidx").on(table.coreArtifactRevisionId).where(sql`${table.coreArtifactRevisionId} IS NOT NULL`),
  uniqueIndex("report_v4_acceptance_scenarios_enhancement_artifact_uidx").on(table.enhancementArtifactRevisionId).where(sql`${table.enhancementArtifactRevisionId} IS NOT NULL`),
  check("report_v4_acceptance_scenarios_id_check", sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
  check("report_v4_acceptance_scenarios_kind_check", sql`${table.kind} IN ('success','diagnosis_failure','question_failure')`),
  check("report_v4_acceptance_scenarios_state_check", sql`${table.state} IN ('collecting','sealed','failed')`),
  check("report_v4_acceptance_scenarios_hash_check", sql`(${table.baselineFingerprint} IS NULL OR ${table.baselineFingerprint} ~ '^[a-f0-9]{64}$') AND (${table.finalFingerprint} IS NULL OR ${table.finalFingerprint} ~ '^[a-f0-9]{64}$')`),
  check("report_v4_acceptance_scenarios_fault_identity_check", sql`length(btrim(${table.faultQuestionId})) BETWEEN 1 AND 500 AND (${table.faultSourceId} IS NULL OR length(btrim(${table.faultSourceId})) BETWEEN 1 AND 500)`),
  check("report_v4_acceptance_scenarios_fault_check", sql`(${table.kind}='success' AND ${table.faultKind}='independent_source_read_failure' AND ${table.faultQuestionId} IS NOT NULL AND ${table.expectedFaultOccurrences}=1) OR (${table.kind}='diagnosis_failure' AND ${table.faultKind}='diagnosis_failure' AND ${table.faultQuestionId} IS NOT NULL AND ${table.faultSourceId} IS NULL AND ${table.expectedFaultOccurrences}=2) OR (${table.kind}='question_failure' AND ${table.faultKind}='question_failure' AND ${table.faultQuestionId} IS NOT NULL AND ${table.faultSourceId} IS NULL AND ${table.expectedFaultOccurrences}=2)`),
  check("report_v4_acceptance_scenarios_terminal_check", sql`(${table.state}='collecting' AND ${table.terminalAt} IS NULL) OR (${table.state} IN ('sealed','failed') AND ${table.terminalAt} IS NOT NULL)`)
]);
export type ReportV4AcceptanceScenarioRow = typeof reportV4AcceptanceScenarios.$inferSelect;

export const reportV4AcceptanceEvents = pgTable("report_v4_acceptance_events", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  sessionId: text("session_id").notNull().references(() => reportV4AcceptanceSessions.id, { onDelete: "restrict" }),
  scenarioId: text("scenario_id").notNull(),
  sequence: integer("sequence").notNull(),
  kind: text("kind").$type<ReportV4AcceptanceEventKind>().notNull(),
  operation: text("operation").$type<ReportV4AcceptanceOperation>().notNull(),
  unitId: text("unit_id").notNull(),
  attempt: integer("attempt").notNull(),
  phase: text("phase").$type<ReportV4AcceptanceEventPhase>().notNull(),
  details: jsonb("details").$type<ReportV4AcceptanceEventDetails>().notNull(),
  detailsCanonical: text("details_canonical").notNull(),
  prevHash: text("prev_hash").notNull(),
  eventHash: text("event_hash").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  occurredAtCanonical: text("occurred_at_canonical").notNull()
}, (table) => [
  uniqueIndex("report_v4_acceptance_events_session_sequence_uidx").on(table.sessionId, table.sequence),
  index("report_v4_acceptance_events_scenario_idx").on(table.scenarioId, table.sequence),
  foreignKey({
    columns: [table.scenarioId, table.sessionId],
    foreignColumns: [reportV4AcceptanceScenarios.id, reportV4AcceptanceScenarios.sessionId],
    name: "report_v4_acceptance_events_scenario_session_fkey"
  }).onDelete("restrict"),
  check("report_v4_acceptance_events_identity_check", sql`${table.idempotencyKey} ~ '^[a-f0-9]{64}$' AND ${table.sequence}>0 AND length(btrim(${table.unitId})) BETWEEN 1 AND 500 AND ${table.attempt} BETWEEN 0 AND 2`),
  check("report_v4_acceptance_events_hash_check", sql`${table.prevHash} ~ '^[a-f0-9]{64}$' AND ${table.eventHash} ~ '^[a-f0-9]{64}$'`),
  check("report_v4_acceptance_events_canonical_check", sql`${table.detailsCanonical}=${table.details}::text AND octet_length(${table.detailsCanonical})<=32768 AND ${table.occurredAtCanonical} ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$'`),
  check("report_v4_acceptance_events_kind_check", sql`${table.kind} IN ('scenario_bound','crawl_run','site_read','model_operation','html_assembly','fault_injection','checkpoint_terminal','v4_dispatch','prohibited_operation','artifact_activation','commerce_fingerprint')`),
  check("report_v4_acceptance_events_phase_check", sql`${table.phase} IN ('started','completed','failed','rejected','consumed','observed')`),
  check("report_v4_acceptance_events_details_check", sql`ogc_report_v4_acceptance_event_valid(${table.kind},${table.operation},${table.phase},${table.details})`)
]);
export type ReportV4AcceptanceEventRow = typeof reportV4AcceptanceEvents.$inferSelect;

export const reportV4AcceptanceSiteReadManifest = pgTable("report_v4_acceptance_site_read_manifest", {
  identityHash: text("identity_hash").primaryKey(),
  sessionId: text("session_id").notNull().references(() => reportV4AcceptanceSessions.id, { onDelete: "restrict" }),
  scenarioId: text("scenario_id").notNull(),
  reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
  jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
  scope: text("scope").$type<ReportV4AcceptanceSiteReadScope>().notNull(),
  purpose: text("purpose").$type<ReportV4AcceptanceSiteReadPurpose>().notNull(),
  urlHash: text("url_hash").notNull(),
  mode: text("mode").$type<ReportV4AcceptanceSiteReadMode>().notNull(),
  attempt: integer("attempt").notNull(),
  pairBindingHash: text("pair_binding_hash").notNull(),
  ownerQuestionId: text("owner_question_id"),
  ownerSourceId: text("owner_source_id"),
  networkPerformed: boolean("network_performed").notNull().default(true),
  terminalPhase: text("terminal_phase").$type<ReportV4AcceptanceSiteReadTerminalPhase>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  terminalAt: timestamp("terminal_at", { withTimezone: true })
}, (table) => [
  index("report_v4_acceptance_site_read_manifest_scenario_idx").on(table.sessionId, table.scenarioId, table.startedAt, table.identityHash),
  foreignKey({
    columns: [table.scenarioId, table.sessionId],
    foreignColumns: [reportV4AcceptanceScenarios.id, reportV4AcceptanceScenarios.sessionId],
    name: "report_v4_acceptance_site_read_manifest_scenario_session_fkey"
  }).onDelete("restrict"),
  check("report_v4_acceptance_site_read_manifest_hash_check", sql`${table.identityHash} ~ '^[a-f0-9]{64}$' AND ${table.urlHash} ~ '^[a-f0-9]{64}$' AND ${table.pairBindingHash} ~ '^[a-f0-9]{64}$'`),
  check("report_v4_acceptance_site_read_manifest_mode_check", sql`${table.mode} IN ('raw','browser')`),
  check("report_v4_acceptance_site_read_manifest_network_check", sql`${table.networkPerformed}=true`),
  check("report_v4_acceptance_site_read_manifest_owner_check", sql`(${table.ownerQuestionId} IS NULL OR (${table.ownerQuestionId}=btrim(${table.ownerQuestionId}) AND length(${table.ownerQuestionId}) BETWEEN 1 AND 500)) AND (${table.ownerSourceId} IS NULL OR (${table.ownerSourceId}=btrim(${table.ownerSourceId}) AND length(${table.ownerSourceId}) BETWEEN 1 AND 500))`),
  check("report_v4_acceptance_site_read_manifest_scope_check", sql`(${table.scope}='admission_discovery' AND ${table.purpose} IN ('homepage','robots','sitemap') AND ${table.attempt}=0 AND ${table.ownerQuestionId} IS NULL AND ${table.ownerSourceId} IS NULL) OR (${table.scope}='admission_page' AND ${table.purpose}='page' AND ${table.attempt}=0 AND ${table.ownerQuestionId} IS NULL AND ${table.ownerSourceId} IS NULL) OR (${table.scope}='enhancement_source' AND ${table.purpose}='source' AND ${table.attempt}=1 AND ${table.ownerQuestionId} IS NOT NULL AND ${table.ownerSourceId} IS NOT NULL)`),
  check("report_v4_acceptance_site_read_manifest_terminal_check", sql`(${table.terminalPhase} IS NULL AND ${table.terminalAt} IS NULL) OR (${table.terminalPhase} IN ('completed','failed') AND ${table.terminalAt} IS NOT NULL AND ${table.terminalAt}>=${table.startedAt})`)
]);
export type ReportV4AcceptanceSiteReadManifestRow = typeof reportV4AcceptanceSiteReadManifest.$inferSelect;

export const reportReplacementFulfillments = pgTable(
  "report_replacement_fulfillments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, { onDelete: "restrict" }),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    originalFailedJobId: text("original_failed_job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    failedArtifactRevisionId: text("failed_artifact_revision_id").notNull().references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
    questionSetId: text("question_set_id").notNull().references(() => reportBusinessQuestionSets.id, { onDelete: "restrict" }),
    replacementJobId: text("replacement_job_id").references(() => scanJobs.id, { onDelete: "restrict" }),
    activeArtifactRevisionId: text("active_artifact_revision_id").references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
    reasonCode: text("reason_code").notNull(),
    state: text("state").notNull().default("prepared"),
    operatorAuthorizationRef: text("operator_authorization_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("report_replacement_fulfillments_order_uidx").on(table.orderId),
    uniqueIndex("report_replacement_fulfillments_original_job_uidx").on(table.originalFailedJobId),
    uniqueIndex("report_replacement_fulfillments_failed_artifact_uidx").on(table.failedArtifactRevisionId),
    uniqueIndex("report_replacement_fulfillments_job_uidx").on(table.replacementJobId).where(sql`${table.replacementJobId} IS NOT NULL`),
    uniqueIndex("report_replacement_fulfillments_active_artifact_uidx").on(table.activeArtifactRevisionId).where(sql`${table.activeArtifactRevisionId} IS NOT NULL`),
    check("report_replacement_fulfillments_reason_check", sql`${table.reasonCode} = 'paid_report_not_delivered'`),
    check("report_replacement_fulfillments_state_check", sql`${table.state} IN ('prepared','queued','running','repair_wait','completed','failed')`),
    check("report_replacement_fulfillments_authorization_check", sql`length(btrim(${table.operatorAuthorizationRef})) > 0`)
  ]
);
export type ReportReplacementFulfillmentRow = typeof reportReplacementFulfillments.$inferSelect;

export const combinedGeoReports = pgTable(
  "combined_geo_reports",
  {
    artifactRevisionId: text("artifact_revision_id").primaryKey().references(() => reportArtifactRevisions.id, { onDelete: "restrict" }),
    reportId: text("report_id").notNull().references(() => scanReports.id, { onDelete: "restrict" }),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, { onDelete: "restrict" }),
    jobId: text("job_id").notNull().references(() => scanJobs.id, { onDelete: "restrict" }),
    questionSetId: text("question_set_id").notNull().references(() => reportBusinessQuestionSets.id, { onDelete: "restrict" }),
    payload: jsonb("payload").$type<CombinedGeoReportV1>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("combined_geo_reports_report_job_uidx").on(table.reportId, table.jobId)
  ]
);
export type CombinedGeoReportRow = typeof combinedGeoReports.$inferSelect;

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
    check("email_deliveries_template_type_check", sql`${table.templateType} IN ('payment_confirmed','report_ready','limited_report_refund','report_failed_refund','refund_succeeded','refund_assistance','link_reissue','corrected_report_ready','replacement_report_ready')`),
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
    productContract: text("product_contract").$type<ReportProductContract>().notNull().default("legacy_website_audit_v1"),
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
    uniqueIndex("ai_reports_report_tier_product_uidx").on(table.reportId, table.tier, table.productContract),
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
    artifactScope: text("artifact_scope").$type<ReportArtifactScope>().notNull().default("legacy_website_audit_v1"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("report_access_tokens_hmac_uidx").on(table.tokenHmac),
    index("report_access_tokens_report_idx").on(table.reportId),
    index("report_access_tokens_report_scope_idx").on(table.reportId, table.artifactScope)
  ]
);

export type ReportAccessTokenRow = typeof reportAccessTokens.$inferSelect;
