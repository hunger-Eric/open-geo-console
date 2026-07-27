import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, isMemoryPersistence } from "./index";
import { memoryDeleteBotEvidence, memoryGetBotEvidence, memorySaveBotEvidence } from "./memory";
import { reportBotEvidence, type ReportBotEvidenceRow } from "./schema";

export async function getBotEvidence(reportId: string): Promise<ReportBotEvidenceRow | null> {
  if (isMemoryPersistence()) {
    return memoryGetBotEvidence(reportId);
  }
  await ensureDatabase();
  const [row] = await getDb().select().from(reportBotEvidence).where(eq(reportBotEvidence.reportId, reportId)).limit(1);
  return row ?? null;
}

export async function saveBotEvidence(
  reportId: string,
  summary: BotEvidenceSummary
): Promise<ReportBotEvidenceRow> {
  if (isMemoryPersistence()) {
    return memorySaveBotEvidence(reportId, summary);
  }
  await ensureDatabase();
  const updatedAt = new Date();
  const [row] = await getDb()
    .insert(reportBotEvidence)
    .values({ reportId, summary, updatedAt })
    .onConflictDoUpdate({
      target: reportBotEvidence.reportId,
      set: { summary, updatedAt }
    })
    .returning();

  return row;
}

export async function deleteBotEvidence(reportId: string): Promise<boolean> {
  if (isMemoryPersistence()) {
    return memoryDeleteBotEvidence(reportId);
  }
  await ensureDatabase();
  const rows = await getDb()
    .delete(reportBotEvidence)
    .where(eq(reportBotEvidence.reportId, reportId))
    .returning({ reportId: reportBotEvidence.reportId });
  return rows.length > 0;
}
