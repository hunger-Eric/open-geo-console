import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { getDatabasePath } from "./index";
import type {
  AnswerSnapshotCellRow,
  AnswerExecutionCheckpointRow,
  AnswerSnapshotRunRow,
  AnswerSnapshotSourceRow,
  CitationSourceEvidenceRow,
  MarketSearchAttemptRow,
  MarketSearchObservationRow,
  MarketSnapshotLeaseRow,
  MarketSnapshotQueryRow,
  MarketSnapshotQuestionRow,
  MarketSourceEvidenceRow,
  PublicSearchSurfaceAuthorityRow,
  RecommendationCertificationAuthorityRow,
  RecommendationForensicReportRow,
  ReportSourceForensicsRow,
  ReportBotEvidenceRow,
  ReportMarketSnapshotRefRow,
  ScanJobRow,
  ScanReportRow,
  SourceClassificationAuthorityRow
} from "./schema";

interface MemoryStore {
  reports: Map<string, ScanReportRow>;
  botEvidence: Map<string, ReportBotEvidenceRow>;
  answerSnapshotRuns: Map<string, AnswerSnapshotRunRow>;
  answerSnapshotCells: Map<string, AnswerSnapshotCellRow>;
  answerSnapshotSources: Map<string, AnswerSnapshotSourceRow>;
  citationSourceEvidence: Map<string, CitationSourceEvidenceRow>;
  answerExecutionCheckpoints: Map<string, AnswerExecutionCheckpointRow>;
  recommendationCertificationAuthorities: Map<string, RecommendationCertificationAuthorityRow>;
  sourceClassificationAuthorities: Map<string, SourceClassificationAuthorityRow>;
  recommendationForensicReports: Map<string, RecommendationForensicReportRow>;
  reportSourceForensics: Map<string, ReportSourceForensicsRow>;
  publicSearchSurfaceAuthorities: Map<string, PublicSearchSurfaceAuthorityRow>;
  marketSnapshotQuestions: Map<string, MarketSnapshotQuestionRow>;
  marketSnapshotQueries: Map<string, MarketSnapshotQueryRow>;
  marketSearchAttempts: Map<string, MarketSearchAttemptRow>;
  marketSearchObservations: Map<string, MarketSearchObservationRow>;
  marketSourceEvidence: Map<string, MarketSourceEvidenceRow>;
  marketSnapshotLeases: Map<string, MarketSnapshotLeaseRow>;
  reportMarketSnapshotRefs: Map<string, ReportMarketSnapshotRefRow>;
  scanJobs: Map<string, ScanJobRow>;
}

const stores = new Map<string, MemoryStore>();

function currentStore(): MemoryStore {
  const key = getDatabasePath();
  let store = stores.get(key);
  if (!store) {
    store = {
      reports: new Map(),
      botEvidence: new Map(),
      answerSnapshotRuns: new Map(),
      answerSnapshotCells: new Map(),
      answerSnapshotSources: new Map(),
      citationSourceEvidence: new Map(),
      answerExecutionCheckpoints: new Map(),
      recommendationCertificationAuthorities: new Map(),
      sourceClassificationAuthorities: new Map(),
      recommendationForensicReports: new Map(),
      reportSourceForensics: new Map(),
      publicSearchSurfaceAuthorities: new Map(),
      marketSnapshotQuestions: new Map(),
      marketSnapshotQueries: new Map(),
      marketSearchAttempts: new Map(),
      marketSearchObservations: new Map(),
      marketSourceEvidence: new Map(),
      marketSnapshotLeases: new Map(),
      reportMarketSnapshotRefs: new Map(),
      scanJobs: new Map()
    };
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
  const runIds = [...store.answerSnapshotRuns.values()].filter((run) => run.reportId === id).map((run) => run.id);
  for (const runId of runIds) memoryDeleteAnswerSnapshotRun(runId);
  for (const row of store.recommendationForensicReports.values()) {
    if (row.reportId === id) store.recommendationForensicReports.delete(row.id);
  }
  for (const row of store.reportSourceForensics.values()) {
    if (row.reportId === id) store.reportSourceForensics.delete(row.id);
  }
  for (const job of store.scanJobs.values()) {
    if (job.reportId === id) store.scanJobs.delete(job.id);
  }
  for (const reference of store.reportMarketSnapshotRefs.values()) {
    if (reference.reportId === id) store.reportMarketSnapshotRefs.delete(reference.id);
  }
  return store.reports.delete(id);
}

export function memoryGetScanJob(id: string): ScanJobRow | null {
  return currentStore().scanJobs.get(id) ?? null;
}

export function memorySaveReportSourceForensics(row: ReportSourceForensicsRow): ReportSourceForensicsRow {
  currentStore().reportSourceForensics.set(row.id, row);
  return row;
}

export function memoryGetReportSourceForensicsForJob(jobId: string): ReportSourceForensicsRow | null {
  return [...currentStore().reportSourceForensics.values()].find((row) => row.jobId === jobId) ?? null;
}

export function memoryGetReportSourceForensicsForReport(reportId: string): ReportSourceForensicsRow | null {
  return [...currentStore().reportSourceForensics.values()].find((row) => row.reportId === reportId) ?? null;
}

export function memorySaveScanJob(row: ScanJobRow): ScanJobRow {
  if (row.productContract === "recommendation_forensics_v1" &&
      !((row.fulfillmentMethodology === "answer_engine_recommendation_forensics_v1" && row.recommendationReportVersion === 1) ||
        (row.fulfillmentMethodology === "public_search_source_forensics_v1" && row.recommendationReportVersion === 2))) {
    throw new Error("Recommendation-forensics memory jobs require a matching methodology and report version.");
  }
  if (row.productContract === "legacy_website_audit_v1" && (row.fulfillmentMethodology || row.recommendationReportVersion)) {
    throw new Error("Legacy memory jobs cannot use a recommendation fulfillment methodology or report version.");
  }
  currentStore().scanJobs.set(row.id, row);
  return row;
}

export function memoryGetAnswerSnapshotRun(id: string): AnswerSnapshotRunRow | null {
  return currentStore().answerSnapshotRuns.get(id) ?? null;
}

export function memorySaveAnswerSnapshotRun(row: AnswerSnapshotRunRow): AnswerSnapshotRunRow {
  currentStore().answerSnapshotRuns.set(row.id, row);
  return row;
}

export function memoryGetAnswerSnapshotRunsForJob(jobId: string): AnswerSnapshotRunRow[] {
  return [...currentStore().answerSnapshotRuns.values()].filter((run) => run.jobId === jobId);
}

export function memoryDeleteAnswerSnapshotRun(id: string): void {
  const store = currentStore();
  store.answerExecutionCheckpoints.delete(id);
  const cellIds = [...store.answerSnapshotCells.values()].filter((cell) => cell.runId === id).map((cell) => cell.id);
  for (const cellId of cellIds) {
    const sourceIds = [...store.answerSnapshotSources.values()].filter((source) => source.cellId === cellId).map((source) => source.id);
    for (const sourceId of sourceIds) {
      for (const evidence of store.citationSourceEvidence.values()) {
        if (evidence.sourceId === sourceId) store.citationSourceEvidence.delete(evidence.id);
      }
      store.answerSnapshotSources.delete(sourceId);
    }
    store.answerSnapshotCells.delete(cellId);
  }
  store.answerSnapshotRuns.delete(id);
}

export function memoryGetAnswerSnapshotCell(id: string): AnswerSnapshotCellRow | null {
  return currentStore().answerSnapshotCells.get(id) ?? null;
}

export function memorySaveAnswerSnapshotCell(row: AnswerSnapshotCellRow): AnswerSnapshotCellRow {
  currentStore().answerSnapshotCells.set(row.id, row);
  return row;
}

export function memoryGetAnswerSnapshotCellsForRuns(runIds: string[]): AnswerSnapshotCellRow[] {
  const ids = new Set(runIds);
  return [...currentStore().answerSnapshotCells.values()].filter((cell) => ids.has(cell.runId));
}

export function memoryGetAnswerSnapshotSource(id: string): AnswerSnapshotSourceRow | null {
  return currentStore().answerSnapshotSources.get(id) ?? null;
}

export function memoryGetAnswerSnapshotSourcesForCells(cellIds: string[]): AnswerSnapshotSourceRow[] {
  const ids = new Set(cellIds);
  return [...currentStore().answerSnapshotSources.values()].filter((source) => ids.has(source.cellId));
}

export function memorySaveAnswerSnapshotSource(row: AnswerSnapshotSourceRow): AnswerSnapshotSourceRow {
  currentStore().answerSnapshotSources.set(row.id, row);
  return row;
}

export function memoryGetCitationSourceEvidence(id: string): CitationSourceEvidenceRow | null {
  return currentStore().citationSourceEvidence.get(id) ?? null;
}

export function memoryGetCitationSourceEvidenceForSources(sourceIds: string[]): CitationSourceEvidenceRow[] {
  const ids = new Set(sourceIds);
  return [...currentStore().citationSourceEvidence.values()].filter((evidence) => ids.has(evidence.sourceId));
}

export function memorySaveCitationSourceEvidence(row: CitationSourceEvidenceRow): CitationSourceEvidenceRow {
  currentStore().citationSourceEvidence.set(row.id, row);
  return row;
}

export function memoryGetAnswerExecutionCheckpoint(runId: string): AnswerExecutionCheckpointRow | null {
  return currentStore().answerExecutionCheckpoints.get(runId) ?? null;
}

export function memorySaveAnswerExecutionCheckpoint(row: AnswerExecutionCheckpointRow): AnswerExecutionCheckpointRow {
  currentStore().answerExecutionCheckpoints.set(row.runId, row);
  return row;
}

export function memorySaveRecommendationCertificationAuthority(row: RecommendationCertificationAuthorityRow): RecommendationCertificationAuthorityRow {
  currentStore().recommendationCertificationAuthorities.set(row.authorityVersion, row);
  return row;
}

export function memoryListPublicSearchSurfaceAuthorities(): PublicSearchSurfaceAuthorityRow[] {
  return [...currentStore().publicSearchSurfaceAuthorities.values()];
}

export function memorySavePublicSearchSurfaceAuthority(row: PublicSearchSurfaceAuthorityRow): PublicSearchSurfaceAuthorityRow {
  currentStore().publicSearchSurfaceAuthorities.set(row.authorityVersion, row);
  return row;
}

export function memoryGetMarketSnapshotQuestion(id: string): MarketSnapshotQuestionRow | null {
  return currentStore().marketSnapshotQuestions.get(id) ?? null;
}

export function memoryListMarketSnapshotQuestions(): MarketSnapshotQuestionRow[] {
  return [...currentStore().marketSnapshotQuestions.values()];
}

export function memorySaveMarketSnapshotQuestion(row: MarketSnapshotQuestionRow): MarketSnapshotQuestionRow {
  currentStore().marketSnapshotQuestions.set(row.id, row);
  return row;
}

export function memoryListMarketSnapshotQueries(snapshotId?: string): MarketSnapshotQueryRow[] {
  return [...currentStore().marketSnapshotQueries.values()].filter((row) => !snapshotId || row.snapshotId === snapshotId);
}

export function memorySaveMarketSnapshotQuery(row: MarketSnapshotQueryRow): MarketSnapshotQueryRow {
  currentStore().marketSnapshotQueries.set(row.id, row);
  return row;
}

export function memoryListMarketSearchAttempts(snapshotId?: string): MarketSearchAttemptRow[] {
  return [...currentStore().marketSearchAttempts.values()].filter((row) => !snapshotId || row.snapshotId === snapshotId);
}

export function memoryGetMarketSearchAttempt(id: string): MarketSearchAttemptRow | null {
  return currentStore().marketSearchAttempts.get(id) ?? null;
}

export function memorySaveMarketSearchAttempt(row: MarketSearchAttemptRow): MarketSearchAttemptRow {
  currentStore().marketSearchAttempts.set(row.id, row);
  return row;
}

export function memoryListMarketSearchObservations(snapshotId?: string): MarketSearchObservationRow[] {
  return [...currentStore().marketSearchObservations.values()].filter((row) => !snapshotId || row.snapshotId === snapshotId);
}

export function memorySaveMarketSearchObservation(row: MarketSearchObservationRow): MarketSearchObservationRow {
  currentStore().marketSearchObservations.set(row.id, row);
  return row;
}

export function memoryListMarketSourceEvidence(snapshotId?: string): MarketSourceEvidenceRow[] {
  return [...currentStore().marketSourceEvidence.values()].filter((row) => !snapshotId || row.snapshotId === snapshotId);
}

export function memorySaveMarketSourceEvidence(row: MarketSourceEvidenceRow): MarketSourceEvidenceRow {
  currentStore().marketSourceEvidence.set(row.id, row);
  return row;
}

export function memoryGetMarketSnapshotLease(cacheIdentity: string): MarketSnapshotLeaseRow | null {
  return currentStore().marketSnapshotLeases.get(cacheIdentity) ?? null;
}

export function memorySaveMarketSnapshotLease(row: MarketSnapshotLeaseRow): MarketSnapshotLeaseRow {
  currentStore().marketSnapshotLeases.set(row.cacheIdentity, row);
  return row;
}

export function memoryListReportMarketSnapshotRefs(reportId?: string): ReportMarketSnapshotRefRow[] {
  return [...currentStore().reportMarketSnapshotRefs.values()].filter((row) => !reportId || row.reportId === reportId);
}

export function memorySaveReportMarketSnapshotRef(row: ReportMarketSnapshotRefRow): ReportMarketSnapshotRefRow {
  currentStore().reportMarketSnapshotRefs.set(row.id, row);
  return row;
}

export function memoryGetRecommendationCertificationAuthority(version: string): RecommendationCertificationAuthorityRow | null {
  return currentStore().recommendationCertificationAuthorities.get(version) ?? null;
}

export function memorySaveSourceClassificationAuthority(row: SourceClassificationAuthorityRow): SourceClassificationAuthorityRow {
  currentStore().sourceClassificationAuthorities.set(row.authorityVersion, row);
  return row;
}

export function memoryGetSourceClassificationAuthority(version: string): SourceClassificationAuthorityRow | null {
  return currentStore().sourceClassificationAuthorities.get(version) ?? null;
}

export function memorySaveRecommendationForensicReport(row: RecommendationForensicReportRow): RecommendationForensicReportRow {
  currentStore().recommendationForensicReports.set(row.id, row);
  return row;
}

export function memoryGetRecommendationForensicReportForJob(jobId: string): RecommendationForensicReportRow | null {
  return [...currentStore().recommendationForensicReports.values()].find((row) => row.jobId === jobId) ?? null;
}

export function memoryGetRecommendationForensicReportForReport(reportId: string): RecommendationForensicReportRow | null {
  return [...currentStore().recommendationForensicReports.values()].find((row) => row.reportId === reportId) ?? null;
}

export function memoryExpireCitationSourceContent(now: Date): number {
  let count = 0;
  for (const evidence of currentStore().citationSourceEvidence.values()) {
    if (evidence.retrievalState === "available" && evidence.expiresAt <= now) {
      currentStore().citationSourceEvidence.set(evidence.id, { ...evidence, retrievalState: "expired", excerpt: null });
      count += 1;
    }
  }
  return count;
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
