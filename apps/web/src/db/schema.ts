import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scanReports = sqliteTable("scan_reports", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("geo"),
  score: integer("score"),
  payload: text("payload", { mode: "json" }).$type<GeoAuditReport>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export type ScanReportRow = typeof scanReports.$inferSelect;
