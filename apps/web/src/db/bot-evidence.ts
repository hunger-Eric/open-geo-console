import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { reportBotEvidence, type ReportBotEvidenceRow } from "./schema";

export async function getBotEvidence(reportId: string): Promise<ReportBotEvidenceRow | null> {
  const row = await getDb().query.reportBotEvidence.findFirst({
    where: eq(reportBotEvidence.reportId, reportId)
  });
  return row ?? null;
}

export async function saveBotEvidence(
  reportId: string,
  summary: BotEvidenceSummary
): Promise<ReportBotEvidenceRow> {
  const updatedAt = new Date();
  getDb()
    .insert(reportBotEvidence)
    .values({ reportId, summary, updatedAt })
    .onConflictDoUpdate({
      target: reportBotEvidence.reportId,
      set: { summary, updatedAt }
    })
    .run();

  return { reportId, summary, updatedAt };
}

export async function deleteBotEvidence(reportId: string): Promise<boolean> {
  const result = getDb()
    .delete(reportBotEvidence)
    .where(eq(reportBotEvidence.reportId, reportId))
    .run();
  return result.changes > 0;
}
