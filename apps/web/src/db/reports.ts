import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import { scanReports, type ScanReportRow } from "./schema";

export async function saveGeoReport(url: string, report: GeoAuditReport): Promise<ScanReportRow> {
  const row = {
    id: randomUUID(),
    url,
    kind: "geo",
    score: report.score,
    payload: report,
    createdAt: new Date()
  };

  getDb().insert(scanReports).values(row).run();
  return row;
}

export async function getGeoReport(id: string): Promise<ScanReportRow | null> {
  const row = await getDb().query.scanReports.findFirst({
    where: eq(scanReports.id, id)
  });
  return row ?? null;
}

export async function getRecentReports(limit = 5): Promise<ScanReportRow[]> {
  return getDb().query.scanReports.findMany({
    orderBy: desc(scanReports.createdAt),
    limit
  });
}
