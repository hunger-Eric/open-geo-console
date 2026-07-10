import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { ensureDatabase, getDb } from "./index";
import { aiReports, type AiReportRow, type ReportTier, type StoredAiReport } from "./schema";

export interface SaveAiReportInput {
  reportId: string;
  jobId: string;
  tier: ReportTier;
  locale: string;
  payload: StoredAiReport;
  technicalPayload?: GeoAuditReport;
  model: string;
  promptVersion: string;
  contentHash: string;
}

export async function saveAiReport(input: SaveAiReportInput): Promise<AiReportRow> {
  await ensureDatabase();
  const now = new Date();
  const [row] = await getDb()
    .insert(aiReports)
    .values({
      id: randomUUID(),
      reportId: input.reportId,
      jobId: input.jobId,
      tier: input.tier,
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
      target: [aiReports.reportId, aiReports.tier],
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

export async function getAiReport(reportId: string, tier: ReportTier): Promise<AiReportRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(aiReports)
    .where(and(eq(aiReports.reportId, reportId), eq(aiReports.tier, tier)))
    .limit(1);
  return row ?? null;
}
