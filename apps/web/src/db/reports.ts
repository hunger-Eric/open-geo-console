import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getDb, isMemoryPersistence } from "./index";
import { memoryDeleteReport, memoryGetReport, memoryRecentReports, memorySaveReport } from "./memory";
import { scanReports, type ScanReportRow } from "./schema";

export async function saveGeoReport(
  url: string,
  report: GeoAuditReport,
  siteKey?: string,
  existingId?: string
): Promise<ScanReportRow> {
  const row: ScanReportRow = {
    id: existingId ?? randomUUID(),
    url,
    siteKey: siteKey ?? null,
    kind: "geo",
    score: report.score,
    payload: report,
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
          set: { url: row.url, siteKey: row.siteKey, kind: row.kind, score: row.score, payload: row.payload, createdAt: row.createdAt }
        })
        .returning()
    : await insert.returning();
  return saved;
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
