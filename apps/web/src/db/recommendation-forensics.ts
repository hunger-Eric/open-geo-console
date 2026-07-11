import {
  parseAnswerSnapshotCell,
  parseAnswerSnapshotRun,
  parseAnswerSnapshotSource,
  type AnswerSnapshotCell,
  type AnswerSnapshotRunContract,
  type AnswerSnapshotSource,
  type FailedAnswerSnapshotCell,
  type SuccessfulAnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryExpireCitationSourceContent,
  memoryGetAnswerSnapshotCell,
  memoryGetAnswerSnapshotCellsForRuns,
  memoryGetAnswerSnapshotRun,
  memoryGetAnswerSnapshotRunsForJob,
  memoryGetAnswerSnapshotSource,
  memoryGetAnswerSnapshotSourcesForCells,
  memoryGetCitationSourceEvidence,
  memoryGetCitationSourceEvidenceForSources,
  memoryGetReport,
  memoryGetScanJob,
  memorySaveAnswerSnapshotCell,
  memorySaveAnswerSnapshotRun,
  memorySaveAnswerSnapshotSource,
  memorySaveCitationSourceEvidence
} from "./memory";
import type {
  AnswerSnapshotCellRow,
  AnswerSnapshotRunRow,
  AnswerSnapshotSourceRow,
  CitationEvidenceGrade,
  CitationRetrievalState,
  CitationSourceCategory,
  CitationSourceEvidenceRow
} from "./schema";

export const MAX_CITATION_EXCERPT_LENGTH = 1200;

export interface CitationSourceEvidenceInput {
  id: string;
  sourceId: string;
  category: CitationSourceCategory;
  retrievalState: Exclude<CitationRetrievalState, "expired">;
  excerpt: string | null;
  excerptHash: string | null;
  contentHash: string | null;
  grade: CitationEvidenceGrade;
  retrievedAt: Date | string;
  expiresAt: Date | string;
}

export interface StoredAnswerSnapshotSource extends AnswerSnapshotSource {
  id: string;
  evidence: StoredCitationSourceEvidence | null;
}

export interface StoredCitationSourceEvidence extends Omit<CitationSourceEvidenceInput, "retrievalState" | "retrievedAt" | "expiresAt"> {
  retrievalState: CitationRetrievalState;
  retrievedAt: string;
  expiresAt: string;
}

export type StoredAnswerSnapshotCell =
  | (Omit<SuccessfulAnswerSnapshotCell, "sources"> & { sources: StoredAnswerSnapshotSource[] })
  | FailedAnswerSnapshotCell;

export interface AnswerSnapshotBundleForJob {
  jobId: string;
  runs: Array<{ run: AnswerSnapshotRunContract; cells: StoredAnswerSnapshotCell[] }>;
}

export async function createAnswerSnapshotRun(input: AnswerSnapshotRunContract): Promise<AnswerSnapshotRunContract> {
  const run = parseAnswerSnapshotRun(input);
  const row = runToRow(run);
  if (isMemoryPersistence()) {
    if (!memoryGetReport(run.reportId)) throw new Error("The snapshot report does not exist.");
    const job = memoryGetScanJob(run.jobId);
    if (!job || job.reportId !== run.reportId) throw new Error("The snapshot run job does not belong to its report.");
    const existing = memoryGetAnswerSnapshotRun(run.id);
    if (existing) assertImmutable("answer snapshot run", runRowComparable(existing), runRowComparable(row));
    else memorySaveAnswerSnapshotRun(row);
    return rowToRun(existing ?? row);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    const jobs = await tx<{ report_id: string }[]>`SELECT report_id FROM scan_jobs WHERE id = ${run.jobId}`;
    if (jobs[0]?.report_id !== run.reportId) throw new Error("The snapshot run job does not belong to its report.");
    await tx`
      INSERT INTO answer_snapshot_runs (id, report_id, job_id, locale, region, question_set_version, started_at)
      VALUES (${run.id}, ${run.reportId}, ${run.jobId}, ${run.locale}, ${run.region}, ${run.questionSetVersion}, ${run.startedAt})
      ON CONFLICT (id) DO NOTHING
    `;
    const existing = (await tx<AnswerSnapshotRunDb[]>`
      SELECT id, report_id, job_id, locale, region, question_set_version, started_at, created_at
      FROM answer_snapshot_runs WHERE id = ${run.id}
    `)[0];
    assertImmutable("answer snapshot run", runRowComparable(dbRunToRow(existing)), runRowComparable(row));
  });
  return run;
}

export async function saveAnswerSnapshotCellImmutable(input: AnswerSnapshotCell): Promise<AnswerSnapshotCell> {
  let cell: AnswerSnapshotCell;
  try {
    cell = parseAnswerSnapshotCell(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input && typeof input === "object" && "status" in input) {
      const status = (input as { status?: unknown }).status;
      if (status === "succeeded") throw new Error(`Invalid successful snapshot cell: ${message}`);
      if (status === "failed") throw new Error(`Invalid failed snapshot cell: ${message}`);
    }
    throw error;
  }
  const row = cellToRow(cell);
  if (isMemoryPersistence()) {
    if (!memoryGetAnswerSnapshotRun(cell.runId)) throw new Error("The snapshot run does not exist.");
    const identityConflict = memoryGetAnswerSnapshotCellsForRuns([cell.runId]).find((candidate) =>
      sameCellIdentity(candidate, row) && candidate.id !== row.id
    );
    if (identityConflict) throw new Error("Snapshot cell identity conflict.");
    const existing = memoryGetAnswerSnapshotCell(cell.id);
    if (existing) assertImmutable("snapshot cell", cellRowComparable(existing), cellRowComparable(row));
    else memorySaveAnswerSnapshotCell(row);
    return cell;
  }
  await ensureDatabase();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    try {
      await tx`
        INSERT INTO answer_snapshot_cells (
          id, run_id, question_id, provider_id, product_id, model_id, collection_surface,
          locale, region, certification_state, consumer_application_label, status, answer_text,
          executed_at, execution_duration_ms, response_hash, recommendation_outcome,
          provider_request_id, usage, error_class, sanitized_error
        ) VALUES (
          ${row.id}, ${row.runId}, ${row.questionId}, ${row.providerId}, ${row.productId}, ${row.modelId},
          ${row.collectionSurface}, ${row.locale}, ${row.region}, ${row.certificationState},
          ${row.consumerApplicationLabel}, ${row.status}, ${row.answerText}, ${row.executedAt.toISOString()},
          ${row.executionDurationMs}, ${row.responseHash}, ${row.recommendationOutcome},
          ${row.providerRequestId}, ${row.usage ? JSON.stringify(row.usage) : null}::jsonb,
          ${row.errorClass}, ${row.sanitizedError}
        ) ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Snapshot cell identity conflict.");
      throw error;
    }
    const existing = (await tx<AnswerSnapshotCellDb[]>`
      SELECT * FROM answer_snapshot_cells WHERE id = ${row.id}
    `)[0];
    assertImmutable("snapshot cell", cellRowComparable(dbCellToRow(existing)), cellRowComparable(row));
  });
  return cell;
}

export async function saveAnswerSnapshotSourcesImmutable(
  cellId: string,
  inputs: AnswerSnapshotSource[]
): Promise<Array<AnswerSnapshotSourceRow>> {
  const sources = inputs.map(parseAnswerSnapshotSource);
  assertUniqueSources(sources);
  const saved: AnswerSnapshotSourceRow[] = [];
  for (const source of sources) {
    const row = sourceToRow(cellId, source);
    if (isMemoryPersistence()) {
      if (!memoryGetAnswerSnapshotCell(cellId)) throw new Error("The snapshot cell does not exist.");
      const existingForCell = memoryGetAnswerSnapshotSourcesForCells([cellId]);
      const conflict = existingForCell.find((candidate) =>
        (candidate.providerOrder === row.providerOrder || candidate.url === row.url) && candidate.id !== row.id
      );
      if (conflict) throw new Error("Snapshot source identity conflict.");
      const existing = memoryGetAnswerSnapshotSource(row.id);
      if (existing) assertImmutable("snapshot source", sourceRowComparable(existing), sourceRowComparable(row));
      else memorySaveAnswerSnapshotSource(row);
      saved.push(existing ?? row);
      continue;
    }
    await ensureDatabase();
    const sql = getSqlClient();
    try {
      await sql`
        INSERT INTO answer_snapshot_sources (id, cell_id, url, title, provider_order, provider_metadata)
        VALUES (${row.id}, ${row.cellId}, ${row.url}, ${row.title}, ${row.providerOrder}, ${JSON.stringify(row.providerMetadata)}::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Snapshot source identity conflict.");
      throw error;
    }
    const existing = (await sql<AnswerSnapshotSourceDb[]>`SELECT * FROM answer_snapshot_sources WHERE id = ${row.id}`)[0];
    assertImmutable("snapshot source", sourceRowComparable(dbSourceToRow(existing)), sourceRowComparable(row));
    saved.push(dbSourceToRow(existing));
  }
  return saved.sort(sourceRowOrder);
}

export async function saveCitationSourceEvidenceImmutable(
  input: CitationSourceEvidenceInput
): Promise<StoredCitationSourceEvidence> {
  const row = evidenceToRow(input);
  validateEvidence(row);
  if (isMemoryPersistence()) {
    if (!memoryGetAnswerSnapshotSource(row.sourceId)) throw new Error("The snapshot source does not exist.");
    const conflictingSource = memoryGetCitationSourceEvidenceForSources([row.sourceId]).find((candidate) => candidate.id !== row.id);
    if (conflictingSource) throw new Error("Citation evidence source identity conflict.");
    const existing = memoryGetCitationSourceEvidence(row.id);
    if (existing) assertImmutable("citation source evidence", evidenceRowComparable(existing), evidenceRowComparable(row));
    else memorySaveCitationSourceEvidence(row);
    return rowToEvidence(existing ?? row);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  try {
    await sql`
      INSERT INTO citation_source_evidence (
        id, source_id, category, retrieval_state, excerpt, excerpt_hash, content_hash,
        grade, retrieved_at, expires_at
      ) VALUES (
        ${row.id}, ${row.sourceId}, ${row.category}, ${row.retrievalState}, ${row.excerpt},
        ${row.excerptHash}, ${row.contentHash}, ${row.grade}, ${row.retrievedAt.toISOString()}, ${row.expiresAt.toISOString()}
      ) ON CONFLICT (id) DO NOTHING
    `;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Citation evidence source identity conflict.");
    throw error;
  }
  const existing = (await sql<CitationSourceEvidenceDb[]>`SELECT * FROM citation_source_evidence WHERE id = ${row.id}`)[0];
  assertImmutable("citation source evidence", evidenceRowComparable(dbEvidenceToRow(existing)), evidenceRowComparable(row));
  return rowToEvidence(dbEvidenceToRow(existing));
}

export async function getAnswerSnapshotBundleForJob(jobId: string): Promise<AnswerSnapshotBundleForJob | null> {
  await ensureDatabase();
  let runs: AnswerSnapshotRunRow[];
  let cells: AnswerSnapshotCellRow[];
  let sources: AnswerSnapshotSourceRow[];
  let evidence: CitationSourceEvidenceRow[];
  if (isMemoryPersistence()) {
    runs = memoryGetAnswerSnapshotRunsForJob(jobId);
    cells = memoryGetAnswerSnapshotCellsForRuns(runs.map((run) => run.id));
    sources = memoryGetAnswerSnapshotSourcesForCells(cells.map((cell) => cell.id));
    evidence = memoryGetCitationSourceEvidenceForSources(sources.map((source) => source.id));
  } else {
    const sql = getSqlClient();
    runs = (await sql<AnswerSnapshotRunDb[]>`SELECT * FROM answer_snapshot_runs WHERE job_id = ${jobId}`).map(dbRunToRow);
    cells = runs.length === 0 ? [] : (await sql<AnswerSnapshotCellDb[]>`
      SELECT cell.* FROM answer_snapshot_cells cell
      JOIN answer_snapshot_runs run ON run.id = cell.run_id WHERE run.job_id = ${jobId}
    `).map(dbCellToRow);
    sources = cells.length === 0 ? [] : (await sql<AnswerSnapshotSourceDb[]>`
      SELECT source.* FROM answer_snapshot_sources source
      JOIN answer_snapshot_cells cell ON cell.id = source.cell_id
      JOIN answer_snapshot_runs run ON run.id = cell.run_id WHERE run.job_id = ${jobId}
    `).map(dbSourceToRow);
    evidence = sources.length === 0 ? [] : (await sql<CitationSourceEvidenceDb[]>`
      SELECT evidence.* FROM citation_source_evidence evidence
      JOIN answer_snapshot_sources source ON source.id = evidence.source_id
      JOIN answer_snapshot_cells cell ON cell.id = source.cell_id
      JOIN answer_snapshot_runs run ON run.id = cell.run_id WHERE run.job_id = ${jobId}
    `).map(dbEvidenceToRow);
  }
  if (runs.length === 0) return null;
  return {
    jobId,
    runs: runs.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id)).map((run) => ({
      run: rowToRun(run),
      cells: cells.filter((cell) => cell.runId === run.id).sort(cellRowOrder).map((cell) =>
        rowToCell(cell, sources.filter((source) => source.cellId === cell.id).sort(sourceRowOrder).map((source) => ({
          ...rowToSource(source),
          evidence: evidence.find((item) => item.sourceId === source.id) ? rowToEvidence(evidence.find((item) => item.sourceId === source.id)!) : null
        })))
      )
    }))
  };
}

export async function deleteExpiredCitationSourceContent(now = new Date()): Promise<number> {
  if (isMemoryPersistence()) return memoryExpireCitationSourceContent(now);
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ id: string }>>`
    UPDATE citation_source_evidence
    SET excerpt = NULL, retrieval_state = 'expired'
    WHERE retrieval_state = 'available' AND expires_at <= ${now.toISOString()}
    RETURNING id
  `;
  return rows.length;
}

function runToRow(run: AnswerSnapshotRunContract): AnswerSnapshotRunRow {
  return { ...run, startedAt: new Date(run.startedAt), createdAt: new Date() };
}
function rowToRun(row: AnswerSnapshotRunRow): AnswerSnapshotRunContract {
  return { id: row.id, reportId: row.reportId, jobId: row.jobId, locale: row.locale, region: row.region, questionSetVersion: row.questionSetVersion, startedAt: row.startedAt.toISOString() };
}
function cellToRow(cell: AnswerSnapshotCell): AnswerSnapshotCellRow {
  const success = cell.status === "succeeded";
  return {
    id: cell.id, runId: cell.runId, questionId: cell.questionId,
    providerId: cell.surface.providerId, productId: cell.surface.productId, modelId: cell.surface.modelId,
    collectionSurface: cell.surface.collectionSurface, locale: cell.surface.locale, region: cell.surface.region,
    certificationState: cell.surface.certificationState, consumerApplicationLabel: cell.surface.consumerApplicationLabel ?? null,
    status: cell.status, answerText: success ? cell.answerText : null, executedAt: new Date(cell.executedAt),
    executionDurationMs: cell.executionDurationMs, responseHash: success ? cell.responseHash : null,
    recommendationOutcome: success ? cell.recommendationOutcome : null,
    providerRequestId: cell.providerRequestId ?? null, usage: cell.usage ? { ...cell.usage } : null,
    errorClass: success ? null : cell.errorClass, sanitizedError: success ? null : cell.sanitizedError ?? null,
    createdAt: new Date()
  };
}
function rowToCell(row: AnswerSnapshotCellRow, sources: StoredAnswerSnapshotSource[]): StoredAnswerSnapshotCell {
  const common = {
    id: row.id, runId: row.runId, questionId: row.questionId,
    surface: { providerId: row.providerId, productId: row.productId, modelId: row.modelId, collectionSurface: row.collectionSurface as "developer_api" | "approved_browser_capture", locale: row.locale, region: row.region, certificationState: row.certificationState as "candidate_uncertified" | "certified", ...(row.consumerApplicationLabel ? { consumerApplicationLabel: row.consumerApplicationLabel } : {}) },
    executedAt: row.executedAt.toISOString(), executionDurationMs: row.executionDurationMs,
    ...(row.providerRequestId ? { providerRequestId: row.providerRequestId } : {}), ...(row.usage ? { usage: row.usage } : {})
  };
  return row.status === "succeeded"
    ? { ...common, status: "succeeded", answerText: row.answerText!, responseHash: row.responseHash!, recommendationOutcome: row.recommendationOutcome as "recommendations_present" | "no_recommendation", sources }
    : { ...common, status: "failed", errorClass: row.errorClass as FailedAnswerSnapshotCell["errorClass"], ...(row.sanitizedError ? { sanitizedError: row.sanitizedError } : {}) };
}
function sourceToRow(cellId: string, source: AnswerSnapshotSource): AnswerSnapshotSourceRow {
  return { id: hashIdentity([cellId, source.url]), cellId, ...source, providerMetadata: { ...source.providerMetadata }, createdAt: new Date() };
}
function rowToSource(row: AnswerSnapshotSourceRow): Omit<StoredAnswerSnapshotSource, "evidence"> {
  return { id: row.id, url: row.url, title: row.title, providerOrder: row.providerOrder, providerMetadata: { ...row.providerMetadata } };
}
function evidenceToRow(input: CitationSourceEvidenceInput): CitationSourceEvidenceRow {
  return { ...input, retrievedAt: new Date(input.retrievedAt), expiresAt: new Date(input.expiresAt), createdAt: new Date() };
}
function rowToEvidence(row: CitationSourceEvidenceRow): StoredCitationSourceEvidence {
  return { id: row.id, sourceId: row.sourceId, category: row.category, retrievalState: row.retrievalState, excerpt: row.excerpt, excerptHash: row.excerptHash, contentHash: row.contentHash, grade: row.grade, retrievedAt: row.retrievedAt.toISOString(), expiresAt: row.expiresAt.toISOString() };
}
function validateEvidence(row: CitationSourceEvidenceRow): void {
  if (!row.id.trim() || !row.sourceId.trim()) throw new Error("Citation evidence IDs are required.");
  if (row.excerpt && row.excerpt.length > MAX_CITATION_EXCERPT_LENGTH) throw new Error("Citation evidence excerpt exceeds the bounded limit.");
  if (row.retrievalState === "available" && (!row.excerpt || !row.excerptHash || !row.contentHash)) throw new Error("Available citation evidence requires excerpt and hashes.");
  if ((row.retrievalState === "inaccessible" || row.retrievalState === "not_retrieved") && (row.excerpt || row.excerptHash || row.contentHash)) throw new Error("Unretrieved citation evidence cannot contain excerpt or content hashes.");
  if (!Number.isFinite(row.retrievedAt.getTime()) || !Number.isFinite(row.expiresAt.getTime())) throw new Error("Citation evidence timestamps are invalid.");
}
function assertUniqueSources(sources: AnswerSnapshotSource[]): void {
  if (new Set(sources.map((source) => source.providerOrder)).size !== sources.length || new Set(sources.map((source) => source.url)).size !== sources.length) {
    throw new Error("Snapshot source identity conflict.");
  }
}
function hashIdentity(parts: string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }
function assertImmutable(label: string, existing: unknown, proposed: unknown): void {
  if (!isDeepStrictEqual(existing, proposed)) throw new Error(`${label} immutability violation.`);
}
function runRowComparable(row: AnswerSnapshotRunRow) { return withoutCreatedAt(row); }
function cellRowComparable(row: AnswerSnapshotCellRow) { return withoutCreatedAt(row); }
function sourceRowComparable(row: AnswerSnapshotSourceRow) { return withoutCreatedAt(row); }
function evidenceRowComparable(row: CitationSourceEvidenceRow) { return withoutCreatedAt(row); }
function withoutCreatedAt<T extends { createdAt: Date }>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "createdAt"));
}
function sameCellIdentity(a: AnswerSnapshotCellRow, b: AnswerSnapshotCellRow): boolean {
  return ["runId","questionId","providerId","productId","modelId","collectionSurface","locale","region"].every((key) => (a as unknown as Record<string, unknown>)[key] === (b as unknown as Record<string, unknown>)[key]);
}
function cellRowOrder(a: AnswerSnapshotCellRow, b: AnswerSnapshotCellRow): number { return a.questionId.localeCompare(b.questionId) || a.providerId.localeCompare(b.providerId) || a.productId.localeCompare(b.productId) || a.modelId.localeCompare(b.modelId) || a.id.localeCompare(b.id); }
function sourceRowOrder(a: AnswerSnapshotSourceRow, b: AnswerSnapshotSourceRow): number { return a.providerOrder - b.providerOrder || a.url.localeCompare(b.url); }
function isUniqueViolation(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "23505"); }

type AnswerSnapshotRunDb = { id: string; report_id: string; job_id: string; locale: string; region: string; question_set_version: string; started_at: Date; created_at: Date };
type AnswerSnapshotCellDb = Record<string, unknown> & { id: string };
type AnswerSnapshotSourceDb = Record<string, unknown> & { id: string };
type CitationSourceEvidenceDb = Record<string, unknown> & { id: string };
function dbRunToRow(row: AnswerSnapshotRunDb): AnswerSnapshotRunRow { return { id: row.id, reportId: row.report_id, jobId: row.job_id, locale: row.locale, region: row.region, questionSetVersion: row.question_set_version, startedAt: new Date(row.started_at), createdAt: new Date(row.created_at) }; }
function dbCellToRow(row: AnswerSnapshotCellDb): AnswerSnapshotCellRow { return { id: row.id, runId: row.run_id as string, questionId: row.question_id as string, providerId: row.provider_id as string, productId: row.product_id as string, modelId: row.model_id as string, collectionSurface: row.collection_surface as string, locale: row.locale as string, region: row.region as string, certificationState: row.certification_state as string, consumerApplicationLabel: row.consumer_application_label as string | null, status: row.status as AnswerSnapshotCellRow["status"], answerText: row.answer_text as string | null, executedAt: new Date(row.executed_at as string | Date), executionDurationMs: row.execution_duration_ms as number, responseHash: row.response_hash as string | null, recommendationOutcome: row.recommendation_outcome as string | null, providerRequestId: row.provider_request_id as string | null, usage: row.usage as Record<string, unknown> | null, errorClass: row.error_class as string | null, sanitizedError: row.sanitized_error as string | null, createdAt: new Date(row.created_at as string | Date) }; }
function dbSourceToRow(row: AnswerSnapshotSourceDb): AnswerSnapshotSourceRow { return { id: row.id, cellId: row.cell_id as string, url: row.url as string, title: row.title as string, providerOrder: row.provider_order as number, providerMetadata: row.provider_metadata as Record<string, unknown>, createdAt: new Date(row.created_at as string | Date) }; }
function dbEvidenceToRow(row: CitationSourceEvidenceDb): CitationSourceEvidenceRow { return { id: row.id, sourceId: row.source_id as string, category: row.category as CitationSourceCategory, retrievalState: row.retrieval_state as CitationRetrievalState, excerpt: row.excerpt as string | null, excerptHash: row.excerpt_hash as string | null, contentHash: row.content_hash as string | null, grade: row.grade as CitationEvidenceGrade, retrievedAt: new Date(row.retrieved_at as string | Date), expiresAt: new Date(row.expires_at as string | Date), createdAt: new Date(row.created_at as string | Date) }; }
