import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import {
  parseAnswerSnapshotCell,
  type AnswerExecutionCheckpoint,
  type AnswerExecutionStateLedger,
  type AnswerSnapshotCell,
  type CertificationAuthoritySnapshot
} from "@open-geo-console/answer-engine-observer";
import {
  parseRecommendationForensicReportV1,
  type RecommendationForensicReportV1,
  type SourceClassificationAuthoritySnapshot
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryGetAnswerExecutionCheckpoint,
  memoryGetAnswerSnapshotCell,
  memoryGetAnswerSnapshotCellsForRuns,
  memoryGetAnswerSnapshotRun,
  memoryGetAnswerSnapshotSource,
  memoryGetAnswerSnapshotSourcesForCells,
  memoryGetRecommendationCertificationAuthority,
  memoryGetRecommendationForensicReportForJob,
  memoryGetRecommendationForensicReportForReport,
  memoryGetReport,
  memoryGetScanJob,
  memoryGetSourceClassificationAuthority,
  memorySaveAnswerExecutionCheckpoint,
  memorySaveAnswerSnapshotCell,
  memorySaveAnswerSnapshotSource,
  memorySaveRecommendationCertificationAuthority,
  memorySaveRecommendationForensicReport,
  memorySaveSourceClassificationAuthority
} from "./memory";
import type {
  AnswerSnapshotCellRow,
  AnswerSnapshotSourceRow,
  RecommendationCertificationAuthorityRow,
  RecommendationForensicReportRow,
  SourceClassificationAuthorityRow
} from "./schema";

const CERTIFICATION_CONFIG = "OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON";
const SOURCE_CONFIG = "OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON";

export function parseRecommendationCertificationAuthorityConfig(raw: string): CertificationAuthoritySnapshot {
  return parseCertificationConfig(raw);
}

export async function getPersistedRecommendationCertificationAuthority(
  authorityVersion: string
): Promise<CertificationAuthoritySnapshot | null> {
  if (!authorityVersion.trim()) return null;
  if (isMemoryPersistence()) return clone(memoryGetRecommendationCertificationAuthority(authorityVersion)?.snapshot ?? null);
  await ensureDatabase();
  const row = (await getSqlClient()<Array<{ snapshot: CertificationAuthoritySnapshot }>>`
    SELECT snapshot FROM recommendation_certification_authorities WHERE authority_version = ${authorityVersion}
  `)[0];
  return clone(row?.snapshot ?? null);
}

export async function installRecommendationAuthoritiesFromProtectedConfig(): Promise<{
  certificationAuthority: CertificationAuthoritySnapshot;
  sourceClassificationAuthority: SourceClassificationAuthoritySnapshot;
}> {
  const certificationAuthority = parseCertificationConfig(requiredConfig(CERTIFICATION_CONFIG));
  const sourceClassificationAuthority = parseSourceConfig(requiredConfig(SOURCE_CONFIG));
  const certificationRow: RecommendationCertificationAuthorityRow = {
    authorityVersion: certificationAuthority.authorityVersion,
    capturedAt: new Date(certificationAuthority.capturedAt),
    snapshot: structuredClone(certificationAuthority),
    evidenceReferences: certificationAuthority.certifications.map(({ evidence }) => evidence.evidenceReference),
    createdAt: new Date()
  };
  const sourceRow: SourceClassificationAuthorityRow = {
    authorityVersion: sourceClassificationAuthority.authorityVersion,
    capturedAt: new Date(sourceClassificationAuthority.capturedAt),
    snapshot: structuredClone(sourceClassificationAuthority),
    createdAt: new Date()
  };
  if (isMemoryPersistence()) {
    installMemoryAuthority(certificationRow, memoryGetRecommendationCertificationAuthority(certificationRow.authorityVersion), memorySaveRecommendationCertificationAuthority);
    installMemoryAuthority(sourceRow, memoryGetSourceClassificationAuthority(sourceRow.authorityVersion), memorySaveSourceClassificationAuthority);
  } else {
    await ensureDatabase();
    const sql = getSqlClient();
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO recommendation_certification_authorities (authority_version, captured_at, snapshot, evidence_references)
        VALUES (${certificationRow.authorityVersion}, ${certificationRow.capturedAt.toISOString()}, ${JSON.stringify(certificationRow.snapshot)}::jsonb, ${JSON.stringify(certificationRow.evidenceReferences)}::jsonb)
        ON CONFLICT (authority_version) DO NOTHING
      `;
      await tx`
        INSERT INTO source_classification_authorities (authority_version, captured_at, snapshot)
        VALUES (${sourceRow.authorityVersion}, ${sourceRow.capturedAt.toISOString()}, ${JSON.stringify(sourceRow.snapshot)}::jsonb)
        ON CONFLICT (authority_version) DO NOTHING
      `;
      const storedCertification = (await tx<Array<Record<string, unknown>>>`SELECT * FROM recommendation_certification_authorities WHERE authority_version = ${certificationRow.authorityVersion}`)[0];
      const storedSource = (await tx<Array<Record<string, unknown>>>`SELECT * FROM source_classification_authorities WHERE authority_version = ${sourceRow.authorityVersion}`)[0];
      assertAuthorityImmutable(storedCertification?.snapshot, certificationRow.snapshot);
      assertAuthorityImmutable(storedSource?.snapshot, sourceRow.snapshot);
    });
  }
  return { certificationAuthority, sourceClassificationAuthority };
}

export async function getAnswerExecutionCheckpoint(runId: string): Promise<AnswerExecutionStateLedger | null> {
  if (isMemoryPersistence()) return clone(memoryGetAnswerExecutionCheckpoint(runId)?.ledger ?? null);
  await ensureDatabase();
  const row = (await getSqlClient()<Array<{ ledger: AnswerExecutionStateLedger }>>`SELECT ledger FROM answer_execution_checkpoints WHERE run_id = ${runId}`)[0];
  return clone(row?.ledger ?? null);
}

export async function compareAndSwapAnswerExecutionCheckpoint(input: AnswerExecutionCheckpoint): Promise<AnswerExecutionStateLedger> {
  const cell = input.cell ? parseAnswerSnapshotCell(input.cell) : undefined;
  validateCheckpointShape(input.expectedRevision, input.executionState, cell);
  if (isMemoryPersistence()) return memoryCompareAndSwap(input.expectedRevision, input.executionState, cell);
  await ensureDatabase();
  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    const run = (await tx<Array<Record<string, unknown>>>`SELECT * FROM answer_snapshot_runs WHERE id = ${input.executionState.runId} FOR UPDATE`)[0];
    if (!run) throw new Error("The answer execution run does not exist.");
    const checkpoint = (await tx<Array<Record<string, unknown>>>`SELECT * FROM answer_execution_checkpoints WHERE run_id = ${input.executionState.runId} FOR UPDATE`)[0];
    const actualRevision = checkpoint ? Number(checkpoint.revision) : 0;
    if (actualRevision !== input.expectedRevision) throw new Error("Answer execution checkpoint revision mismatch.");
    validateMonotonicLedger(checkpoint?.ledger as AnswerExecutionStateLedger | undefined, input.executionState);
    const knownCells = await tx<Array<{ id: string; provider_id: string }>>`SELECT id, provider_id FROM answer_snapshot_cells WHERE run_id = ${input.executionState.runId}`;
    validateCellProviderAssignments(
      input.executionState,
      knownCells.map(({ id, provider_id }) => ({ id, providerId: provider_id })),
      cell
    );
    if (cell) await persistCellAndSourcesTx(tx, cell, input.executionState);
    if (checkpoint) {
      const rows = await tx<Array<{ run_id: string }>>`
        UPDATE answer_execution_checkpoints
        SET revision = ${input.executionState.checkpointRevision}, ledger = ${JSON.stringify(input.executionState)}::jsonb, updated_at = now()
        WHERE run_id = ${input.executionState.runId} AND revision = ${input.expectedRevision}
        RETURNING run_id
      `;
      if (rows.length !== 1) throw new Error("Answer execution checkpoint revision mismatch.");
    } else {
      await tx`
        INSERT INTO answer_execution_checkpoints (run_id, report_id, job_id, revision, ledger)
        VALUES (${input.executionState.runId}, ${String(run.report_id)}, ${String(run.job_id)}, ${input.executionState.checkpointRevision}, ${JSON.stringify(input.executionState)}::jsonb)
      `;
    }
    return clone(input.executionState);
  });
}

export async function saveRecommendationForensicReport(input: unknown): Promise<RecommendationForensicReportV1> {
  const identity = reportIdentity(input);
  const authorities = await loadAuthorities(identity.certificationVersion, identity.sourceVersion);
  const report = parseRecommendationForensicReportV1(input, authorities);
  const row = reportToRow(report);
  if (isMemoryPersistence()) {
    if (!memoryGetReport(report.reportId)) throw new Error("The recommendation report owner does not exist.");
    const job = memoryGetScanJob(report.jobId);
    if (!job || job.reportId !== report.reportId) throw new Error("The recommendation report job does not belong to its report.");
    if (job.productContract !== "recommendation_forensics_v1") throw new Error("Recommendation reports require a recommendation-forensics job contract.");
    const existingByReport = memoryGetRecommendationForensicReportForReport(report.reportId);
    const existingByJob = memoryGetRecommendationForensicReportForJob(report.jobId);
    const existing = existingByReport ?? existingByJob;
    if (existing) assertReportImmutable(existing, row);
    else memorySaveRecommendationForensicReport(row);
    return clone(report);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    const job = (await tx<Array<{ report_id: string; product_contract: string }>>`
      SELECT report_id, product_contract FROM scan_jobs WHERE id = ${row.jobId} FOR UPDATE
    `)[0];
    if (!job || job.report_id !== row.reportId || job.product_contract !== "recommendation_forensics_v1") {
      throw new Error("Recommendation reports require their matching recommendation-forensics job contract.");
    }
    await tx`
      INSERT INTO recommendation_forensic_reports (
        id, report_id, job_id, report_version, payload, certification_authority_version,
        source_classification_authority_version, content_hash, is_private
      ) VALUES (
        ${row.id}, ${row.reportId}, ${row.jobId}, ${row.reportVersion}, ${JSON.stringify(row.payload)}::jsonb,
        ${row.certificationAuthorityVersion}, ${row.sourceClassificationAuthorityVersion}, ${row.contentHash}, true
      ) ON CONFLICT (id) DO NOTHING
    `;
    const stored = (await tx<Array<Record<string, unknown>>>`SELECT * FROM recommendation_forensic_reports WHERE id = ${row.id}`)[0];
    if (!stored) throw new Error("Recommendation forensic report identity conflict.");
    assertReportImmutable(dbReportRow(stored), row);
  });
  return clone(report);
}

export async function getRecommendationForensicReportForJob(jobId: string): Promise<RecommendationForensicReportV1 | null> {
  let row: RecommendationForensicReportRow | null;
  if (isMemoryPersistence()) row = memoryGetRecommendationForensicReportForJob(jobId);
  else {
    await ensureDatabase();
    const stored = (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM recommendation_forensic_reports WHERE job_id = ${jobId} AND is_private = true`)[0];
    row = stored ? dbReportRow(stored) : null;
  }
  if (!row) return null;
  const authorities = await loadAuthorities(row.certificationAuthorityVersion, row.sourceClassificationAuthorityVersion);
  return parseRecommendationForensicReportV1(row.payload, authorities);
}

async function loadAuthorities(certificationVersion: string, sourceVersion: string) {
  if (isMemoryPersistence()) {
    const certification = memoryGetRecommendationCertificationAuthority(certificationVersion);
    const source = memoryGetSourceClassificationAuthority(sourceVersion);
    if (!certification || !source) throw new Error("Recommendation report authority is unavailable.");
    return { certificationAuthority: clone(certification.snapshot), sourceClassificationAuthority: clone(source.snapshot) };
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const certification = (await sql<Array<{ snapshot: CertificationAuthoritySnapshot }>>`SELECT snapshot FROM recommendation_certification_authorities WHERE authority_version = ${certificationVersion}`)[0];
  const source = (await sql<Array<{ snapshot: SourceClassificationAuthoritySnapshot }>>`SELECT snapshot FROM source_classification_authorities WHERE authority_version = ${sourceVersion}`)[0];
  if (!certification || !source) throw new Error("Recommendation report authority is unavailable.");
  return { certificationAuthority: certification.snapshot, sourceClassificationAuthority: source.snapshot };
}

function memoryCompareAndSwap(expectedRevision: number, next: AnswerExecutionStateLedger, cell?: AnswerSnapshotCell): AnswerExecutionStateLedger {
  const run = memoryGetAnswerSnapshotRun(next.runId);
  if (!run) throw new Error("The answer execution run does not exist.");
  const existingCheckpoint = memoryGetAnswerExecutionCheckpoint(next.runId);
  if ((existingCheckpoint?.revision ?? 0) !== expectedRevision) throw new Error("Answer execution checkpoint revision mismatch.");
  validateMonotonicLedger(existingCheckpoint?.ledger, next);
  validateCellProviderAssignments(
    next,
    memoryGetAnswerSnapshotCellsForRuns([next.runId]).map(({ id, providerId }) => ({ id, providerId })),
    cell
  );
  const prepared = cell ? prepareMemoryCellAndSources(cell, next) : null;
  if (prepared) {
    if (!prepared.existingCell) memorySaveAnswerSnapshotCell(prepared.cellRow);
    for (const source of prepared.sources) if (!source.existing) memorySaveAnswerSnapshotSource(source.row);
  }
  const now = new Date();
  memorySaveAnswerExecutionCheckpoint({
    runId: next.runId, reportId: run.reportId, jobId: run.jobId, revision: next.checkpointRevision,
    ledger: clone(next), createdAt: existingCheckpoint?.createdAt ?? now, updatedAt: now
  });
  return clone(next);
}

function prepareMemoryCellAndSources(cell: AnswerSnapshotCell, ledger: AnswerExecutionStateLedger) {
  validateCellLedgerBinding(cell, ledger);
  const cellRow = cellToRow(cell);
  const existingCell = memoryGetAnswerSnapshotCell(cell.id);
  if (existingCell && !isDeepStrictEqual(comparable(existingCell), comparable(cellRow))) throw new Error("snapshot cell immutability violation.");
  const existingSources = memoryGetAnswerSnapshotSourcesForCells([cell.id]);
  const sources = cell.status === "succeeded" ? cell.sources.map((source) => {
    const row = sourceToRow(cell.id, source);
    const existing = memoryGetAnswerSnapshotSource(row.id);
    const conflicts = memoryGetAnswerSnapshotSourcesForCells([cell.id]).some((candidate) => candidate.id !== row.id && (candidate.url === row.url || candidate.providerOrder === row.providerOrder));
    if (conflicts) throw new Error("Snapshot source identity conflict.");
    if (existing && !isDeepStrictEqual(comparable(existing), comparable(row))) throw new Error("snapshot source immutability violation.");
    return { row, existing };
  }) : [];
  if (existingCell && !isDeepStrictEqual(
    existingSources.map((row) => comparable(row)).sort(compareStable),
    sources.map(({ row }) => comparable(row)).sort(compareStable)
  )) throw new Error("snapshot source set immutability violation.");
  return { cellRow, existingCell, sources };
}

async function persistCellAndSourcesTx(tx: Transaction, cell: AnswerSnapshotCell, ledger: AnswerExecutionStateLedger): Promise<void> {
  validateCellLedgerBinding(cell, ledger);
  const row = cellToRow(cell);
  try {
    await tx`
      INSERT INTO answer_snapshot_cells (
        id, run_id, question_id, provider_id, product_id, model_id, collection_surface, locale, region,
        certification_state, consumer_application_label, status, answer_text, executed_at, execution_duration_ms,
        response_hash, recommendation_outcome, provider_request_id, usage, error_class, sanitized_error,
        attempt_count, failure_disposition
      ) VALUES (
        ${row.id}, ${row.runId}, ${row.questionId}, ${row.providerId}, ${row.productId}, ${row.modelId}, ${row.collectionSurface},
        ${row.locale}, ${row.region}, ${row.certificationState}, ${row.consumerApplicationLabel}, ${row.status}, ${row.answerText},
        ${row.executedAt.toISOString()}, ${row.executionDurationMs}, ${row.responseHash}, ${row.recommendationOutcome},
        ${row.providerRequestId}, ${row.usage ? JSON.stringify(row.usage) : null}::jsonb, ${row.errorClass}, ${row.sanitizedError},
        ${row.attemptCount}, ${row.failureDisposition}
      ) ON CONFLICT (id) DO NOTHING
    `;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Snapshot cell identity conflict.");
    throw error;
  }
  const stored = (await tx<Array<Record<string, unknown>>>`SELECT * FROM answer_snapshot_cells WHERE id = ${cell.id}`)[0];
  if (!stored || !isDeepStrictEqual(comparable(dbCellRow(stored)), comparable(row))) throw new Error("snapshot cell immutability violation.");
  if (cell.status !== "succeeded") return;
  for (const source of cell.sources) {
    const sourceRow = sourceToRow(cell.id, source);
    try {
      await tx`
        INSERT INTO answer_snapshot_sources (id, cell_id, url, title, provider_order, provider_metadata)
        VALUES (${sourceRow.id}, ${sourceRow.cellId}, ${sourceRow.url}, ${sourceRow.title}, ${sourceRow.providerOrder}, ${JSON.stringify(sourceRow.providerMetadata)}::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Snapshot source identity conflict.");
      throw error;
    }
    const storedSource = (await tx<Array<Record<string, unknown>>>`SELECT * FROM answer_snapshot_sources WHERE id = ${sourceRow.id}`)[0];
    if (!storedSource || !isDeepStrictEqual(comparable(dbSourceRow(storedSource)), comparable(sourceRow))) throw new Error("snapshot source immutability violation.");
  }
  const storedSources = (await tx<Array<Record<string, unknown>>>`SELECT * FROM answer_snapshot_sources WHERE cell_id = ${cell.id}`)
    .map(dbSourceRow).map((row) => comparable(row)).sort(compareStable);
  const proposedSources = cell.sources.map((source) => comparable(sourceToRow(cell.id, source))).sort(compareStable);
  if (!isDeepStrictEqual(storedSources, proposedSources)) throw new Error("snapshot source set immutability violation.");
}

function validateCheckpointShape(expectedRevision: number, next: AnswerExecutionStateLedger, cell?: AnswerSnapshotCell): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("expectedRevision must be a non-negative integer.");
  if (!next || !next.runId?.trim() || next.checkpointRevision !== expectedRevision + 1) throw new Error("Answer execution checkpoint must advance by exactly one revision.");
  if (!next.providers || typeof next.providers !== "object") throw new Error("Answer execution ledger providers are required.");
  for (const [providerId, provider] of Object.entries(next.providers)) {
    if (!providerId.trim() || !provider || !nonNegativeInteger(provider.requestCount) || !nonNegativeInteger(provider.estimatedCostMicros) || !provider.cells || typeof provider.cells !== "object") throw new Error("Answer execution provider ledger is invalid.");
    let attempts = 0;
    for (const [cellId, attempt] of Object.entries(provider.cells)) {
      if (!cellId.trim() || !attempt || !nonNegativeInteger(attempt.attemptCount) || !nonNegativeInteger(attempt.transientAttemptCount) || attempt.transientAttemptCount > attempt.attemptCount) throw new Error("Answer execution cell ledger is invalid.");
      attempts += attempt.attemptCount;
    }
    if (attempts !== provider.requestCount) throw new Error("Answer execution request count must equal recorded attempts.");
  }
  if (cell && cell.runId !== next.runId) throw new Error("Checkpoint cell must belong to the execution run.");
}

function validateCellProviderAssignments(
  ledger: AnswerExecutionStateLedger,
  persistedCells: Array<{ id: string; providerId: string }>,
  pendingCell?: AnswerSnapshotCell
): void {
  const expectedProviders = new Map(persistedCells.map(({ id, providerId }) => [id, providerId]));
  if (pendingCell) {
    const existing = expectedProviders.get(pendingCell.id);
    if (existing && existing !== pendingCell.surface.providerId) {
      throw new Error("Checkpoint cell conflicts with its persisted provider.");
    }
    expectedProviders.set(pendingCell.id, pendingCell.surface.providerId);
  }
  const assignments = new Map<string, string>();
  for (const [providerId, provider] of Object.entries(ledger.providers)) {
    for (const cellId of Object.keys(provider.cells)) {
      const previous = assignments.get(cellId);
      if (previous) throw new Error("Answer execution cell ledger may assign each cell to only one provider.");
      assignments.set(cellId, providerId);
      const expectedProvider = expectedProviders.get(cellId);
      if (expectedProvider && expectedProvider !== providerId) {
        throw new Error("Answer execution cell ledger is stored under a foreign provider.");
      }
    }
  }
}

function validateMonotonicLedger(previous: AnswerExecutionStateLedger | undefined, next: AnswerExecutionStateLedger): void {
  if (!previous) return;
  if (previous.runId !== next.runId || next.checkpointRevision !== previous.checkpointRevision + 1) throw new Error("Answer execution ledger is not monotonic.");
  for (const [providerId, prior] of Object.entries(previous.providers)) {
    const current = next.providers[providerId];
    if (!current || current.requestCount < prior.requestCount || current.estimatedCostMicros < prior.estimatedCostMicros) throw new Error("Answer execution provider ledger cannot move backwards.");
    for (const [cellId, attempt] of Object.entries(prior.cells)) {
      const currentAttempt = current.cells[cellId];
      if (!currentAttempt || currentAttempt.attemptCount < attempt.attemptCount || currentAttempt.transientAttemptCount < attempt.transientAttemptCount) throw new Error("Answer execution cell ledger cannot move backwards.");
    }
  }
}

function validateCellLedgerBinding(cell: AnswerSnapshotCell, ledger: AnswerExecutionStateLedger): void {
  const provider = ledger.providers[cell.surface.providerId];
  const attempt = provider?.cells[cell.id];
  if (!provider || !attempt || attempt.attemptCount < 1 || attempt.transientAttemptCount > attempt.attemptCount) throw new Error("Checkpoint cell is not bound to its provider execution ledger.");
  if (cell.status === "failed" && (cell.attemptCount !== attempt.attemptCount || !cell.failureDisposition)) throw new Error("Terminal failed checkpoint cell must match its attempt ledger.");
}

function reportIdentity(value: unknown): { certificationVersion: string; sourceVersion: string } {
  if (!value || typeof value !== "object") throw new Error("Recommendation report payload is invalid.");
  const provenance = (value as { provenanceAndLimitations?: unknown }).provenanceAndLimitations;
  if (!provenance || typeof provenance !== "object") throw new Error("Recommendation report authority provenance is required.");
  const input = provenance as Record<string, unknown>;
  if (typeof input.certificationAuthorityVersion !== "string" || typeof input.sourceClassificationAuthorityVersion !== "string") throw new Error("Recommendation report authority versions are required.");
  return { certificationVersion: input.certificationAuthorityVersion, sourceVersion: input.sourceClassificationAuthorityVersion };
}

function reportToRow(report: RecommendationForensicReportV1): RecommendationForensicReportRow {
  const payload = clone(report);
  return {
    id: hash([report.reportId, report.jobId, "recommendation-forensic-v1"]), reportId: report.reportId, jobId: report.jobId,
    reportVersion: report.version, payload, certificationAuthorityVersion: report.provenanceAndLimitations.certificationAuthorityVersion,
    sourceClassificationAuthorityVersion: report.provenanceAndLimitations.sourceClassificationAuthorityVersion,
    contentHash: hash([stableJson(payload)]), isPrivate: true, createdAt: new Date(), updatedAt: new Date()
  };
}

function assertReportImmutable(existing: RecommendationForensicReportRow, proposed: RecommendationForensicReportRow): void {
  if (!isDeepStrictEqual(comparable(existing, ["updatedAt"]), comparable(proposed, ["updatedAt"]))) throw new Error("recommendation forensic report immutability violation.");
}

function cellToRow(cell: AnswerSnapshotCell): AnswerSnapshotCellRow {
  const success = cell.status === "succeeded";
  return { id: cell.id, runId: cell.runId, questionId: cell.questionId, providerId: cell.surface.providerId, productId: cell.surface.productId, modelId: cell.surface.modelId, collectionSurface: cell.surface.collectionSurface, locale: cell.surface.locale, region: cell.surface.region, certificationState: cell.surface.certificationState, consumerApplicationLabel: cell.surface.consumerApplicationLabel ?? null, status: cell.status, answerText: success ? cell.answerText : null, executedAt: new Date(cell.executedAt), executionDurationMs: cell.executionDurationMs, responseHash: success ? cell.responseHash : null, recommendationOutcome: success ? cell.recommendationOutcome : null, providerRequestId: cell.providerRequestId ?? null, usage: cell.usage ? { ...cell.usage } as Record<string, unknown> : null, errorClass: success ? null : cell.errorClass, sanitizedError: success ? null : cell.sanitizedError ?? null, attemptCount: success ? null : cell.attemptCount ?? null, failureDisposition: success ? null : cell.failureDisposition ?? null, createdAt: new Date() };
}

function sourceToRow(cellId: string, source: Extract<AnswerSnapshotCell, { status: "succeeded" }>["sources"][number]): AnswerSnapshotSourceRow {
  return { id: hash([cellId, source.url]), cellId, url: source.url, title: source.title, providerOrder: source.providerOrder, providerMetadata: { ...source.providerMetadata } as Record<string, unknown>, createdAt: new Date() };
}

function dbCellRow(row: Record<string, unknown>): AnswerSnapshotCellRow { return { id: String(row.id), runId: String(row.run_id), questionId: String(row.question_id), providerId: String(row.provider_id), productId: String(row.product_id), modelId: String(row.model_id), collectionSurface: String(row.collection_surface), locale: String(row.locale), region: String(row.region), certificationState: String(row.certification_state), consumerApplicationLabel: nullableString(row.consumer_application_label), status: row.status as AnswerSnapshotCellRow["status"], answerText: nullableString(row.answer_text), executedAt: new Date(row.executed_at as string), executionDurationMs: Number(row.execution_duration_ms), responseHash: nullableString(row.response_hash), recommendationOutcome: nullableString(row.recommendation_outcome), providerRequestId: nullableString(row.provider_request_id), usage: row.usage as Record<string, unknown> | null, errorClass: nullableString(row.error_class), sanitizedError: nullableString(row.sanitized_error), attemptCount: row.attempt_count === null ? null : Number(row.attempt_count), failureDisposition: nullableString(row.failure_disposition), createdAt: new Date(row.created_at as string) }; }
function dbSourceRow(row: Record<string, unknown>): AnswerSnapshotSourceRow { return { id: String(row.id), cellId: String(row.cell_id), url: String(row.url), title: String(row.title), providerOrder: Number(row.provider_order), providerMetadata: row.provider_metadata as Record<string, unknown>, createdAt: new Date(row.created_at as string) }; }
function dbReportRow(row: Record<string, unknown>): RecommendationForensicReportRow { return { id: String(row.id), reportId: String(row.report_id), jobId: String(row.job_id), reportVersion: Number(row.report_version), payload: row.payload as RecommendationForensicReportV1, certificationAuthorityVersion: String(row.certification_authority_version), sourceClassificationAuthorityVersion: String(row.source_classification_authority_version), contentHash: String(row.content_hash), isPrivate: row.is_private === true, createdAt: new Date(row.created_at as string), updatedAt: new Date(row.updated_at as string) }; }

function parseCertificationConfig(raw: string): CertificationAuthoritySnapshot {
  const value = JSON.parse(raw) as CertificationAuthoritySnapshot;
  if (!value.authorityVersion?.trim() || !validDate(value.capturedAt) || !Array.isArray(value.certifications)) throw new Error("Protected certification authority config is invalid.");
  for (const certification of value.certifications) {
    if (certification.surface.certificationState !== "certified" || certification.evidence.environment !== "protected_staging" || !certification.evidence.evidenceReference.trim() || !validDate(certification.evidence.certifiedAt)) throw new Error("Protected certification authority evidence is invalid.");
  }
  return clone(value);
}
function parseSourceConfig(raw: string): SourceClassificationAuthoritySnapshot {
  const value = JSON.parse(raw) as SourceClassificationAuthoritySnapshot;
  if (!value.authorityVersion?.trim() || !validDate(value.capturedAt) || !value.context?.customerRegistrableDomain?.trim() || !Array.isArray(value.context.competitorRegistrableDomains) || !value.context.knownDomains || typeof value.context.knownDomains !== "object") throw new Error("Protected source classification authority config is invalid.");
  return clone(value);
}
function installMemoryAuthority<T extends { createdAt: Date }>(proposed: T, existing: T | null, save: (row: T) => T): void { if (existing) assertAuthorityImmutable(comparable(existing), comparable(proposed)); else save(proposed); }
function assertAuthorityImmutable(existing: unknown, proposed: unknown): void { if (!isDeepStrictEqual(existing, proposed)) throw new Error("Protected authority immutability violation."); }
function requiredConfig(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required at the protected config boundary.`); return value; }
function comparable(row: object, extra: string[] = []): Record<string, unknown> { return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "createdAt" && !extra.includes(key))); }
function compareStable(left: unknown, right: unknown): number { return stableJson(left).localeCompare(stableJson(right)); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`; return JSON.stringify(value); }
function hash(parts: string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }
function validDate(value: string): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function nullableString(value: unknown): string | null { return value === null || value === undefined ? null : String(value); }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function isUniqueViolation(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "23505"); }
function clone<T>(value: T): T { return structuredClone(value); }

type Transaction = postgres.TransactionSql;
