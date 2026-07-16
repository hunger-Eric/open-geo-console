import type {
  PublicDocumentAttemptResult,
  QuestionAcquisitionCheckpoint,
  QuestionCollectionState
} from "@open-geo-console/site-crawler";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";

export interface PublicSourceRetrievalAttemptInput extends PublicDocumentAttemptResult {
  id: string;
  reportId: string;
  jobId: string;
  questionId: string;
  snapshotId: string;
  observationId: string;
  attemptOrder: number;
  extractorVersion?: string;
  decoderVersion?: string;
  browserPolicyVersion?: string;
  safeDetail?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface PublicSourceRetrievalAttemptRow extends PublicSourceRetrievalAttemptInput {
  createdAt?: Date;
}

export interface QuestionAcquisitionCheckpointRow extends QuestionAcquisitionCheckpoint {
  updatedAt: Date;
}

const memoryAttempts = new Map<string, PublicSourceRetrievalAttemptRow>();
const memoryCheckpoints = new Map<string, QuestionAcquisitionCheckpointRow>();

export function resetPublicSourceAcquisitionMemoryForTests(): void {
  memoryAttempts.clear();
  memoryCheckpoints.clear();
}

export async function appendPublicSourceRetrievalAttempt(
  value: PublicSourceRetrievalAttemptInput
): Promise<PublicSourceRetrievalAttemptRow> {
  const input = validateAttempt(value);
  if (isMemoryPersistence()) {
    const existing = memoryAttempts.get(input.id);
    if (existing && JSON.stringify(serializableAttempt(existing)) !== JSON.stringify(serializableAttempt(input))) {
      throw new Error("Public-source retrieval attempts are immutable.");
    }
    const row = existing ?? { ...input, createdAt: new Date() };
    memoryAttempts.set(input.id, row);
    return structuredClone(row);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  await sql`INSERT INTO public_source_retrieval_attempts (
    id,report_id,job_id,question_id,snapshot_id,observation_id,canonical_url,final_url,
    registrable_domain,method,attempt_order,stage,outcome,http_status,robots_outcome,
    content_type,content_bytes,duration_ms,extractor_version,decoder_version,
    browser_policy_version,retry_eligible,browser_eligible,safe_detail,started_at,completed_at
  ) VALUES (
    ${input.id},${input.reportId},${input.jobId},${input.questionId},${input.snapshotId},${input.observationId},
    ${input.canonicalUrl},${input.finalUrl ?? null},${input.registrableDomain},${input.method},${input.attemptOrder},
    ${input.stage},${input.outcome},${input.httpStatus ?? null},${input.robotsOutcome ?? null},${input.contentType ?? null},
    ${input.contentBytes ?? null},${input.durationMs},${input.extractorVersion ?? null},${input.decoderVersion ?? null},
    ${input.browserPolicyVersion ?? null},${input.retryEligible},${input.browserEligible},${input.safeDetail ?? null},
    ${input.startedAt.toISOString()},${input.completedAt.toISOString()}
  ) ON CONFLICT (id) DO NOTHING`;
  const row = (await sql<Array<Record<string, unknown>>>`SELECT * FROM public_source_retrieval_attempts WHERE id=${input.id}`)[0];
  if (!row) throw new Error("Public-source retrieval attempt disappeared after append.");
  const persisted = dbAttempt(row);
  if (JSON.stringify(serializableAttempt(persisted)) !== JSON.stringify(serializableAttempt(input))) {
    throw new Error("Public-source retrieval attempts are immutable.");
  }
  return persisted;
}

export async function listPublicSourceRetrievalAttempts(input: {
  jobId: string;
  questionId: string;
}): Promise<PublicSourceRetrievalAttemptRow[]> {
  const jobId = bounded(input.jobId, "jobId", 256);
  const questionId = bounded(input.questionId, "questionId", 256);
  if (isMemoryPersistence()) {
    return [...memoryAttempts.values()]
      .filter((row) => row.jobId === jobId && row.questionId === questionId)
      .sort((left, right) => left.attemptOrder - right.attemptOrder)
      .map((row) => structuredClone(row));
  }
  await ensureDatabase();
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    SELECT * FROM public_source_retrieval_attempts
    WHERE job_id=${jobId} AND question_id=${questionId}
    ORDER BY attempt_order,id`;
  return rows.map(dbAttempt);
}

export async function saveQuestionAcquisitionCheckpoint(
  value: QuestionAcquisitionCheckpoint
): Promise<QuestionAcquisitionCheckpointRow> {
  const input = validateCheckpoint(value);
  if (isMemoryPersistence()) {
    const current = [...memoryCheckpoints.values()].find((row) => row.jobId === input.jobId && row.questionId === input.questionId);
    assertCheckpointTransition(current, input);
    const row = { ...input, updatedAt: new Date() };
    memoryCheckpoints.set(input.identityHash, row);
    return structuredClone(row);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    const currentRow = (await tx<Array<Record<string, unknown>>>`SELECT * FROM question_acquisition_checkpoints WHERE job_id=${input.jobId} AND question_id=${input.questionId} FOR UPDATE`)[0];
    const current = currentRow ? dbCheckpoint(currentRow) : undefined;
    assertCheckpointTransition(current, input);
    await tx`INSERT INTO question_acquisition_checkpoints (
      identity_hash,report_id,job_id,question_id,snapshot_id,candidate_pool_hash,state,
      planned_candidates,attempted_candidates,remaining_candidates,returned_observations,
      extracted_documents,eligible_evidence_ids,independent_domains,query_rewrites_used,
      http_budget_used,browser_budget_used,revision,updated_at
    ) VALUES (
      ${input.identityHash},${input.reportId},${input.jobId},${input.questionId},${input.snapshotId},${input.candidatePoolHash},${input.state},
      ${input.plannedCandidates},${input.attemptedCandidates},${input.remainingCandidates},${input.returnedObservations},
      ${input.extractedDocuments},${JSON.stringify(input.eligibleEvidenceIds)}::jsonb,${JSON.stringify(input.independentDomains)}::jsonb,
      ${input.queryRewritesUsed},${input.httpBudgetUsed},${input.browserBudgetUsed},${input.revision},clock_timestamp()
    ) ON CONFLICT (identity_hash) DO UPDATE SET
      state=EXCLUDED.state,planned_candidates=EXCLUDED.planned_candidates,
      attempted_candidates=EXCLUDED.attempted_candidates,remaining_candidates=EXCLUDED.remaining_candidates,
      returned_observations=EXCLUDED.returned_observations,extracted_documents=EXCLUDED.extracted_documents,
      eligible_evidence_ids=EXCLUDED.eligible_evidence_ids,independent_domains=EXCLUDED.independent_domains,
      query_rewrites_used=EXCLUDED.query_rewrites_used,http_budget_used=EXCLUDED.http_budget_used,
      browser_budget_used=EXCLUDED.browser_budget_used,revision=EXCLUDED.revision,updated_at=clock_timestamp()`;
    const row = (await tx<Array<Record<string, unknown>>>`SELECT * FROM question_acquisition_checkpoints WHERE identity_hash=${input.identityHash}`)[0];
    if (!row) throw new Error("Question acquisition checkpoint disappeared after save.");
    return dbCheckpoint(row);
  });
}

export async function getQuestionAcquisitionCheckpoint(input: {
  jobId: string;
  questionId: string;
}): Promise<QuestionAcquisitionCheckpointRow | null> {
  const jobId = bounded(input.jobId, "jobId", 256);
  const questionId = bounded(input.questionId, "questionId", 256);
  if (isMemoryPersistence()) {
    const row = [...memoryCheckpoints.values()].find((candidate) => candidate.jobId === jobId && candidate.questionId === questionId);
    return row ? structuredClone(row) : null;
  }
  await ensureDatabase();
  const row = (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM question_acquisition_checkpoints WHERE job_id=${jobId} AND question_id=${questionId}`)[0];
  return row ? dbCheckpoint(row) : null;
}

function validateAttempt(value: PublicSourceRetrievalAttemptInput): PublicSourceRetrievalAttemptInput {
  for (const [label, text] of Object.entries({ id: value.id, reportId: value.reportId, jobId: value.jobId, questionId: value.questionId, snapshotId: value.snapshotId, observationId: value.observationId, registrableDomain: value.registrableDomain })) bounded(text, label, 256);
  safeUrl(value.canonicalUrl, "canonicalUrl");
  if (value.finalUrl) safeUrl(value.finalUrl, "finalUrl");
  nonnegative(value.attemptOrder, "attemptOrder");
  nonnegative(value.durationMs, "durationMs");
  if (value.httpStatus !== undefined && (!Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599)) throw new TypeError("httpStatus is invalid.");
  if (value.safeDetail && value.safeDetail.length > 240) throw new TypeError("safeDetail is too long.");
  if (!(value.startedAt instanceof Date) || !(value.completedAt instanceof Date) || !Number.isFinite(value.startedAt.getTime()) || value.completedAt < value.startedAt) throw new TypeError("Attempt timestamps are invalid.");
  return value;
}

function validateCheckpoint(value: QuestionAcquisitionCheckpoint): QuestionAcquisitionCheckpoint {
  if (!/^[a-f0-9]{64}$/.test(value.identityHash) || !/^[a-f0-9]{64}$/.test(value.candidatePoolHash)) throw new TypeError("Checkpoint hashes are invalid.");
  for (const [label, text] of Object.entries({ reportId: value.reportId, jobId: value.jobId, questionId: value.questionId, snapshotId: value.snapshotId })) bounded(text, label, 256);
  for (const [label, number] of Object.entries({ plannedCandidates: value.plannedCandidates, attemptedCandidates: value.attemptedCandidates, remainingCandidates: value.remainingCandidates, returnedObservations: value.returnedObservations, extractedDocuments: value.extractedDocuments, queryRewritesUsed: value.queryRewritesUsed, httpBudgetUsed: value.httpBudgetUsed, browserBudgetUsed: value.browserBudgetUsed })) nonnegative(number, label);
  if (value.revision < 1 || !Number.isInteger(value.revision)) throw new TypeError("Checkpoint revision is invalid.");
  if (value.attemptedCandidates + value.remainingCandidates > value.plannedCandidates) throw new TypeError("Checkpoint candidate counts are inconsistent.");
  return { ...value, eligibleEvidenceIds: unique(value.eligibleEvidenceIds), independentDomains: unique(value.independentDomains) };
}

function assertCheckpointTransition(current: QuestionAcquisitionCheckpointRow | undefined, next: QuestionAcquisitionCheckpoint): void {
  if (!current) {
    if (next.revision !== 1) throw new Error("The first acquisition checkpoint must use revision 1.");
    return;
  }
  if (current.identityHash !== next.identityHash || current.reportId !== next.reportId || current.snapshotId !== next.snapshotId || current.candidatePoolHash !== next.candidatePoolHash) throw new Error("Question acquisition checkpoint identity is immutable.");
  if (next.revision !== current.revision + 1) throw new Error("Question acquisition checkpoint revision must advance by one.");
  if (current.state !== "collecting" && next.state === "collecting") throw new Error("A terminal question acquisition checkpoint cannot return to collecting.");
  if (next.attemptedCandidates < current.attemptedCandidates || next.httpBudgetUsed < current.httpBudgetUsed || next.browserBudgetUsed < current.browserBudgetUsed) throw new Error("Question acquisition progress cannot move backward.");
}

function serializableAttempt(value: PublicSourceRetrievalAttemptInput | PublicSourceRetrievalAttemptRow): unknown {
  const row = { ...value } as PublicSourceRetrievalAttemptRow;
  delete row.createdAt;
  return { ...row, startedAt: row.startedAt.toISOString(), completedAt: row.completedAt.toISOString() };
}

function dbAttempt(row: Record<string, unknown>): PublicSourceRetrievalAttemptRow {
  return {
    id: String(row.id), reportId: String(row.report_id), jobId: String(row.job_id), questionId: String(row.question_id), snapshotId: String(row.snapshot_id), observationId: String(row.observation_id),
    canonicalUrl: String(row.canonical_url), ...(row.final_url ? { finalUrl: String(row.final_url) } : {}), registrableDomain: String(row.registrable_domain), method: row.method as "http" | "browser", attemptOrder: Number(row.attempt_order), stage: row.stage as PublicSourceRetrievalAttemptInput["stage"], outcome: row.outcome as PublicSourceRetrievalAttemptInput["outcome"],
    ...(row.http_status === null || row.http_status === undefined ? {} : { httpStatus: Number(row.http_status) }), ...(row.robots_outcome ? { robotsOutcome: row.robots_outcome as PublicSourceRetrievalAttemptInput["robotsOutcome"] } : {}), ...(row.content_type ? { contentType: String(row.content_type) } : {}), ...(row.content_bytes === null || row.content_bytes === undefined ? {} : { contentBytes: Number(row.content_bytes) }), durationMs: Number(row.duration_ms),
    ...(row.extractor_version ? { extractorVersion: String(row.extractor_version) } : {}), ...(row.decoder_version ? { decoderVersion: String(row.decoder_version) } : {}), ...(row.browser_policy_version ? { browserPolicyVersion: String(row.browser_policy_version) } : {}), retryEligible: Boolean(row.retry_eligible), browserEligible: Boolean(row.browser_eligible), ...(row.safe_detail ? { safeDetail: String(row.safe_detail) } : {}), startedAt: new Date(String(row.started_at)), completedAt: new Date(String(row.completed_at))
  };
}

function dbCheckpoint(row: Record<string, unknown>): QuestionAcquisitionCheckpointRow {
  return {
    identityHash: String(row.identity_hash), reportId: String(row.report_id), jobId: String(row.job_id), questionId: String(row.question_id), snapshotId: String(row.snapshot_id), candidatePoolHash: String(row.candidate_pool_hash), state: row.state as QuestionCollectionState,
    plannedCandidates: Number(row.planned_candidates), attemptedCandidates: Number(row.attempted_candidates), remainingCandidates: Number(row.remaining_candidates), returnedObservations: Number(row.returned_observations), extractedDocuments: Number(row.extracted_documents), eligibleEvidenceIds: arrayOfText(row.eligible_evidence_ids), independentDomains: arrayOfText(row.independent_domains), queryRewritesUsed: Number(row.query_rewrites_used), httpBudgetUsed: Number(row.http_budget_used), browserBudgetUsed: Number(row.browser_budget_used), revision: Number(row.revision), updatedAt: new Date(String(row.updated_at))
  };
}

function bounded(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}
function safeUrl(value: string, label: string): void { const url = new URL(value); if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new TypeError(`${label} is invalid.`); }
function nonnegative(value: number, label: string): void { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} is invalid.`); }
function unique(values: readonly string[]): string[] { return [...new Set(values.map((value) => bounded(value, "array value", 512)))]; }
function arrayOfText(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }
