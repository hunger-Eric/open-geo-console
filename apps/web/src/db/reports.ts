import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getDb, getSqlClient, isMemoryPersistence } from "./index";
import { memoryDeleteReport, memoryGetReport, memoryRecentReports, memorySaveReport } from "./memory";
import { scanReports, type ReportLocale, type ScanReportRow } from "./schema";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";

export interface CreateGeoReportShellInput {
  url: string;
  siteKey: string;
  reportLocale: ReportLocale;
  admissionIdempotencyHmac?: string;
  id?: string;
}

export async function saveGeoReport(
  url: string,
  report: GeoAuditReport,
  siteKey?: string,
  existingId?: string,
  reportLocale?: ReportLocale
): Promise<ScanReportRow> {
  return runReportV4GuardedOperation({ guardSite: "legacy_mutation", delegate: () => saveGeoReportUnsafe(url, report, siteKey, existingId, reportLocale) });
}

async function saveGeoReportUnsafe(
  url: string, report: GeoAuditReport, siteKey?: string, existingId?: string, reportLocale?: ReportLocale
): Promise<ScanReportRow> {
  const existingMemoryRow = isMemoryPersistence() && existingId ? memoryGetReport(existingId) : null;
  const row: ScanReportRow = {
    id: existingId ?? randomUUID(),
    url,
    siteKey: siteKey ?? null,
    kind: "geo",
    score: report.score,
    payload: report,
    technicalStatus: "completed",
    technicalErrorCode: null,
    technicalPublicError: null,
    admissionIdempotencyHmac: existingMemoryRow?.admissionIdempotencyHmac ?? null,
    reportLocale: reportLocale ?? existingMemoryRow?.reportLocale ?? null,
    localeCorrectionUsedAt: existingMemoryRow?.localeCorrectionUsedAt ?? null,
    activeArtifactRevisionId: existingMemoryRow?.activeArtifactRevisionId ?? null,
    createdAt: new Date()
  };

  if (isMemoryPersistence()) {
    return memorySaveReport(row);
  }
  await ensureDatabase();
  const insert = getDb().insert(scanReports).values(row);
  const [saved] = existingId
    ? await insert
        .onConflictDoUpdate({
          target: scanReports.id,
          set: {
            url: row.url,
            siteKey: row.siteKey,
            kind: row.kind,
            score: row.score,
            payload: row.payload,
            technicalStatus: "completed",
            technicalErrorCode: null,
            technicalPublicError: null,
            reportLocale: sql`COALESCE(${scanReports.reportLocale}, ${row.reportLocale})`,
            createdAt: row.createdAt
          }
        })
        .returning()
    : await insert.returning();
  return saved;
}

export async function createGeoReportShell(input: CreateGeoReportShellInput): Promise<ScanReportRow> {
  const row: ScanReportRow = {
    id: input.id ?? randomUUID(),
    url: input.url,
    siteKey: input.siteKey,
    kind: "geo",
    score: null,
    payload: null,
    technicalStatus: "pending",
    technicalErrorCode: null,
    technicalPublicError: null,
    admissionIdempotencyHmac: input.admissionIdempotencyHmac ?? null,
    reportLocale: input.reportLocale,
    localeCorrectionUsedAt: null,
    activeArtifactRevisionId: null,
    createdAt: new Date()
  };
  if (isMemoryPersistence()) return memorySaveReport(row);
  await ensureDatabase();
  const [saved] = await getDb().insert(scanReports).values(row).returning();
  return saved;
}

export async function markGeoReportTechnicalProcessing(id: string): Promise<ScanReportRow | null> {
  if (isMemoryPersistence()) {
    const current = memoryGetReport(id);
    if (!current) return null;
    const updated = { ...current, technicalStatus: "processing" as const };
    return memorySaveReport(updated);
  }
  await ensureDatabase();
  const [updated] = await getDb().update(scanReports)
    .set({ technicalStatus: "processing", technicalErrorCode: null, technicalPublicError: null })
    .where(eq(scanReports.id, id))
    .returning();
  return updated ?? null;
}

export async function completeGeoReportTechnical(
  id: string,
  input: { url: string; siteKey: string; report: GeoAuditReport }
): Promise<ScanReportRow | null> {
  if (isMemoryPersistence()) {
    const current = memoryGetReport(id);
    if (!current) return null;
    return memorySaveReport({
      ...current,
      url: input.url,
      siteKey: input.siteKey,
      score: input.report.score,
      payload: input.report,
      technicalStatus: "completed",
      technicalErrorCode: null,
      technicalPublicError: null
    });
  }
  await ensureDatabase();
  const [updated] = await getDb().update(scanReports)
    .set({
      url: input.url,
      siteKey: input.siteKey,
      score: input.report.score,
      payload: input.report,
      technicalStatus: "completed",
      technicalErrorCode: null,
      technicalPublicError: null
    })
    .where(eq(scanReports.id, id))
    .returning();
  return updated ?? null;
}

export async function failGeoReportTechnical(
  id: string,
  input: { code: string; publicMessage: string }
): Promise<ScanReportRow | null> {
  const code = input.code.slice(0, 100);
  const publicMessage = input.publicMessage.slice(0, 500);
  if (isMemoryPersistence()) {
    const current = memoryGetReport(id);
    if (!current) return null;
    return memorySaveReport({
      ...current,
      technicalStatus: "failed",
      technicalErrorCode: code,
      technicalPublicError: publicMessage
    });
  }
  await ensureDatabase();
  const [updated] = await getDb().update(scanReports)
    .set({ technicalStatus: "failed", technicalErrorCode: code, technicalPublicError: publicMessage })
    .where(eq(scanReports.id, id))
    .returning();
  return updated ?? null;
}

export async function getGeoReport(id: string): Promise<ScanReportRow | null> {
  if (isMemoryPersistence()) {
    return memoryGetReport(id);
  }
  await ensureDatabase();
  const [row] = await getDb().select().from(scanReports).where(eq(scanReports.id, id)).limit(1);
  return row ?? null;
}

export async function getRecentReports(limit = 5): Promise<ScanReportRow[]> {
  if (isMemoryPersistence()) {
    return memoryRecentReports(limit);
  }
  await ensureDatabase();
  return getDb().select().from(scanReports).orderBy(desc(scanReports.createdAt)).limit(limit);
}

export async function deleteGeoReport(id: string): Promise<boolean> {
  if (isMemoryPersistence()) {
    return memoryDeleteReport(id);
  }
  await ensureDatabase();
  const rows = await getDb().delete(scanReports).where(eq(scanReports.id, id)).returning({ id: scanReports.id });
  return rows.length === 1;
}

export async function persistLegacyReportLocale(reportId: string, locale: ReportLocale): Promise<ReportLocale | null> {
  if (isMemoryPersistence()) {
    const row = memoryGetReport(reportId);
    if (!row) return null;
    if (row.reportLocale && row.reportLocale !== locale) return row.reportLocale;
    memorySaveReport({ ...row, reportLocale: locale });
    return locale;
  }
  await ensureDatabase();
  const rows = await getSqlClient()<{ report_locale: ReportLocale | null }[]>`
    UPDATE scan_reports
    SET report_locale = ${locale}
    WHERE id = ${reportId} AND (report_locale IS NULL OR report_locale = ${locale})
    RETURNING report_locale
  `;
  if (rows[0]) return rows[0].report_locale;
  const current = await getSqlClient()<{ report_locale: ReportLocale | null }[]>`
    SELECT report_locale FROM scan_reports WHERE id = ${reportId}
  `;
  return current[0]?.report_locale ?? null;
}

export type LocaleCorrectionErrorCode =
  | "report_not_found"
  | "report_locale_missing"
  | "deep_report_missing"
  | "locale_already_matches"
  | "correction_already_used";

export class LocaleCorrectionError extends Error {
  constructor(public readonly code: LocaleCorrectionErrorCode, message: string) {
    super(message);
  }
}

export async function createLocaleCorrectionJob(reportId: string): Promise<{ jobId: string; locale: ReportLocale }> {
  await ensureDatabase();
  if (isMemoryPersistence()) {
    throw new Error("Locale correction jobs require PostgreSQL persistence.");
  }
  const jobId = randomUUID();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<{
      report_locale: ReportLocale | null;
      locale_correction_used_at: string | Date | null;
      ai_locale: string | null;
    }[]>`
      SELECT report.report_locale, report.locale_correction_used_at, ai.locale AS ai_locale
      FROM scan_reports report
      LEFT JOIN ai_reports ai ON ai.report_id = report.id AND ai.tier = 'deep'
      WHERE report.id = ${reportId}
      FOR UPDATE OF report
    `;
    const report = rows[0];
    if (!report) throw new LocaleCorrectionError("report_not_found", "Report not found.");
    if (!report.report_locale) {
      throw new LocaleCorrectionError("report_locale_missing", "The report language has not been established.");
    }
    if (!report.ai_locale) {
      throw new LocaleCorrectionError("deep_report_missing", "A completed deep report is required for language correction.");
    }
    if (report.ai_locale === report.report_locale) {
      throw new LocaleCorrectionError("locale_already_matches", "The generated report already uses the requested language.");
    }
    if (report.locale_correction_used_at) {
      throw new LocaleCorrectionError("correction_already_used", "The one-time report language correction was already used.");
    }

    await tx`
      UPDATE scan_reports
      SET locale_correction_used_at = now()
      WHERE id = ${reportId}
    `;
    await tx`
      INSERT INTO scan_jobs (id, report_id, tier, locale, reason, credit_reservation_id)
      VALUES (${jobId}, ${reportId}, 'deep', ${report.report_locale}, 'locale_correction', NULL)
    `;
    return { jobId, locale: report.report_locale };
  });
}
