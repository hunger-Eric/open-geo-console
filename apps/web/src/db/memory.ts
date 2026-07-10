import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { getDatabasePath } from "./index";
import type { ReportBotEvidenceRow, ScanReportRow } from "./schema";

interface MemoryStore {
  reports: Map<string, ScanReportRow>;
  botEvidence: Map<string, ReportBotEvidenceRow>;
}

const stores = new Map<string, MemoryStore>();

function currentStore(): MemoryStore {
  const key = getDatabasePath();
  let store = stores.get(key);
  if (!store) {
    store = { reports: new Map(), botEvidence: new Map() };
    stores.set(key, store);
  }
  return store;
}

export function memorySaveReport(row: ScanReportRow): ScanReportRow {
  currentStore().reports.set(row.id, row);
  return row;
}

export function memoryGetReport(id: string): ScanReportRow | null {
  return currentStore().reports.get(id) ?? null;
}

export function memoryDeleteReport(id: string): boolean {
  const store = currentStore();
  store.botEvidence.delete(id);
  return store.reports.delete(id);
}

export function memoryRecentReports(limit: number): ScanReportRow[] {
  return [...currentStore().reports.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function memoryGetBotEvidence(reportId: string): ReportBotEvidenceRow | null {
  return currentStore().botEvidence.get(reportId) ?? null;
}

export function memorySaveBotEvidence(reportId: string, summary: BotEvidenceSummary): ReportBotEvidenceRow {
  const row = { reportId, summary, updatedAt: new Date() };
  currentStore().botEvidence.set(reportId, row);
  return row;
}

export function memoryDeleteBotEvidence(reportId: string): boolean {
  return currentStore().botEvidence.delete(reportId);
}
