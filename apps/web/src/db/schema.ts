import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export type ReportTier = "free" | "deep";
export type ScanJobStage =
  | "queued"
  | "discovering"
  | "planning"
  | "fetching"
  | "analyzing"
  | "synthesizing"
  | "completed"
  | "partial"
  | "failed";
export type AccessKeyStatus = "active" | "revoked" | "exhausted";
export type CreditStatus = "reserved" | "settled" | "refunded";

export interface JobCheckpoint {
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
    payload: jsonb("payload").$type<GeoAuditReport>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("scan_reports_created_at_idx").on(table.createdAt), index("scan_reports_site_key_idx").on(table.siteKey)]
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
    locale: text("locale").notNull(),
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
    index("scan_jobs_report_idx").on(table.reportId, table.createdAt)
  ]
);

export type ScanJobRow = typeof scanJobs.$inferSelect;

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

export const freeSiteTrials = pgTable("free_site_trials", {
  siteKey: text("site_key").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => scanReports.id, { onDelete: "cascade" }),
  jobId: text("job_id").references(() => scanJobs.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
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
    status: text("status").$type<AccessKeyStatus>().notNull().default("active"),
    creditsRemaining: integer("credits_remaining").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [uniqueIndex("access_keys_hmac_uidx").on(table.keyHmac), index("access_keys_prefix_idx").on(table.keyPrefix)]
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
    credits: integer("credits").notNull().default(1),
    status: text("status").$type<CreditStatus>().notNull().default("reserved"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("credit_ledger_key_idempotency_uidx").on(table.accessKeyId, table.idempotencyKey),
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
