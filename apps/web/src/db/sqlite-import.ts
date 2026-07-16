import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import BetterSqlite3 from "better-sqlite3";
import { ensureDatabase, getSqlClient } from "./index";

interface LegacyReportRow {
  id: string;
  url: string;
  kind: string;
  score: number | null;
  payload: string;
  created_at: number;
}

interface LegacyEvidenceRow {
  report_id: string;
  summary: string;
  updated_at: number;
}

/**
 * Imports the two v1 SQLite tables without changing UUIDs. PostgreSQL upserts
 * make the operation safe to rerun; existing PostgreSQL rows are refreshed from
 * the selected legacy database.
 */
export async function importLegacySqliteDatabase(filePath: string): Promise<{
  reportsImported: number;
  botEvidenceImported: number;
}> {
  await ensureDatabase();
  const legacy = new BetterSqlite3(filePath, { readonly: true, fileMustExist: true });
  try {
    const reports = legacy.prepare("SELECT id, url, kind, score, payload, created_at FROM scan_reports").all() as LegacyReportRow[];
    const evidenceTable = legacy
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'report_bot_evidence'")
      .get();
    const evidence = evidenceTable
      ? (legacy.prepare("SELECT report_id, summary, updated_at FROM report_bot_evidence").all() as LegacyEvidenceRow[])
      : [];
    const sql = getSqlClient();
    await sql.begin(async (tx) => {
      for (const row of reports) {
        const payload = JSON.parse(row.payload) as GeoAuditReport;
        await tx`
          INSERT INTO scan_reports (id, url, kind, score, payload, created_at)
          VALUES (${row.id}, ${row.url}, ${row.kind}, ${row.score}, ${JSON.stringify(payload)}::jsonb, ${new Date(row.created_at).toISOString()})
          ON CONFLICT (id) DO UPDATE SET
            url = EXCLUDED.url, kind = EXCLUDED.kind, score = EXCLUDED.score,
            payload = EXCLUDED.payload, created_at = EXCLUDED.created_at
        `;
      }
      for (const row of evidence) {
        const summary = JSON.parse(row.summary) as BotEvidenceSummary;
        await tx`
          INSERT INTO report_bot_evidence (report_id, summary, updated_at)
          VALUES (${row.report_id}, ${JSON.stringify(summary)}::jsonb, ${new Date(row.updated_at).toISOString()})
          ON CONFLICT (report_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = EXCLUDED.updated_at
        `;
      }
    });
    return { reportsImported: reports.length, botEvidenceImported: evidence.length };
  } finally {
    legacy.close();
  }
}
