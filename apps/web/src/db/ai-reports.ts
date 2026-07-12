import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { ensureDatabase, getDb } from "./index";
import { getGeoReport } from "./reports";
import { aiReports, type AiReportRow, type ReportLocale, type ReportProductContract, type ReportTier, type StoredAiReport } from "./schema";

export interface SaveAiReportInput {
  reportId: string;
  jobId: string;
  tier: ReportTier;
  productContract?: ReportProductContract;
  locale: ReportLocale;
  payload: StoredAiReport;
  technicalPayload?: GeoAuditReport;
  model: string;
  promptVersion: string;
  contentHash: string;
}

export function assertAiReportLocale(reportLocale: ReportLocale | null, aiLocale: ReportLocale): void {
  if (!reportLocale) throw new Error("The scan report language has not been established.");
  if (reportLocale !== aiLocale) {
    throw new Error("The AI report language must match the persisted scan report language.");
  }
}

export async function saveAiReport(input: SaveAiReportInput): Promise<AiReportRow> {
  await ensureDatabase();
  const report = await getGeoReport(input.reportId);
  if (!report) throw new Error("The scan report does not exist.");
  assertAiReportLocale(report.reportLocale, input.locale);
  const now = new Date();
  const [row] = await getDb()
    .insert(aiReports)
    .values({
      id: randomUUID(),
      reportId: input.reportId,
      jobId: input.jobId,
      tier: input.tier,
      productContract: input.productContract ?? "legacy_website_audit_v1",
      locale: input.locale,
      payload: input.payload,
      technicalPayload: input.technicalPayload,
      model: input.model,
      promptVersion: input.promptVersion,
      contentHash: input.contentHash,
      isPrivate: input.tier === "deep",
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [aiReports.reportId, aiReports.tier, aiReports.productContract],
      set: {
        jobId: input.jobId,
        locale: input.locale,
        payload: input.payload,
        technicalPayload: input.technicalPayload,
        model: input.model,
        promptVersion: input.promptVersion,
        contentHash: input.contentHash,
        isPrivate: input.tier === "deep",
        updatedAt: now
      }
    })
    .returning();
  return row;
}

export async function getAiReport(
  reportId: string,
  tier: ReportTier,
  productContract: ReportProductContract = "legacy_website_audit_v1"
): Promise<AiReportRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(aiReports)
    .where(and(
      eq(aiReports.reportId, reportId),
      eq(aiReports.tier, tier),
      eq(aiReports.productContract, productContract)
    ))
    .limit(1);
  return row ?? null;
}
