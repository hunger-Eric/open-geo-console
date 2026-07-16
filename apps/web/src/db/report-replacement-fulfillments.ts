import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { ensureDatabase, getSqlClient } from "./index";

export const APPROVED_REPLACEMENT_TARGET = {
  orderId: "c631f80e-4f6e-44a4-b0de-42aee8559c51",
  reportId: "4b4e71b8-c130-4c83-8d4a-e3787ded7009",
  originalFailedJobId: "146da7a2-b28b-4925-af89-0a30c9af0c23",
  failedArtifactRevisionId: "0c41d018-65aa-42e9-84c3-9953af4b60c8",
  questionSetId: "business-question-set-ba934fe710d804f389bf16c240f3fa23c7127e64f7f50d368e17f02c888baa6e"
} as const;

export interface ReplacementFulfillmentSummary {
  replacementId: string;
  jobId: string | null;
  artifactRevisionId: string | null;
  state: string;
}

export interface ReplacementInspection {
  target: typeof APPROVED_REPLACEMENT_TARGET;
  eligible: boolean;
  reasons: string[];
  existing: ReplacementFulfillmentSummary | null;
}

export async function hasCompletedReportReplacement(orderId: string, reportId: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ present: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM report_replacement_fulfillments
      WHERE order_id=${orderId} AND report_id=${reportId} AND state='completed' AND active_artifact_revision_id IS NOT NULL
    ) AS present`;
  return rows[0]?.present === true;
}

interface EligibilityRow {
  payment_status: string;
  fulfillment_status: string;
  refund_status: string;
  job_stage: string;
  job_execution_state: string;
  job_tier: string;
  job_credit_reservation_id: string | null;
  report_active_artifact_revision_id: string | null;
  artifact_status: string;
  artifact_contract: string;
  question_status: string;
  question_content_hash: string | null;
  question_locale: string;
  reserved_credit_count: number;
  competing_job_count: number;
  correction_count: number;
}

export async function inspectApprovedReportReplacement(): Promise<ReplacementInspection> {
  await ensureDatabase();
  const sql = getSqlClient();
  const existing = await readExisting(sql);
  const row = (await eligibilityRows(sql))[0];
  const reasons = eligibilityReasons(row, existing);
  return { target: APPROVED_REPLACEMENT_TARGET, eligible: reasons.length === 0, reasons, existing };
}

export async function prepareApprovedReportReplacement(input: { confirm: boolean; authorizationRef: string }): Promise<ReplacementFulfillmentSummary> {
  if (!input.confirm) throw new Error("Explicit --confirm is required for replacement fulfillment preparation.");
  const authorizationRef = input.authorizationRef.trim();
  if (!/^[A-Za-z0-9@._:/ -]{3,160}$/.test(authorizationRef)) throw new Error("A safe operator authorization reference is required.");
  await ensureDatabase();
  const sql = getSqlClient();

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`replacement:${APPROVED_REPLACEMENT_TARGET.orderId}`},0))`;
    const existing = await readExisting(tx);
    if (existing) return existing;

    await tx`SELECT orders.id FROM payment_orders orders WHERE orders.id=${APPROVED_REPLACEMENT_TARGET.orderId} FOR UPDATE`;
    await tx`SELECT id FROM scan_jobs WHERE id=${APPROVED_REPLACEMENT_TARGET.originalFailedJobId} FOR UPDATE`;
    await tx`SELECT id FROM scan_reports WHERE id=${APPROVED_REPLACEMENT_TARGET.reportId} FOR UPDATE`;
    await tx`SELECT id FROM report_business_question_sets WHERE id=${APPROVED_REPLACEMENT_TARGET.questionSetId} FOR UPDATE`;
    await tx`SELECT id FROM report_artifact_revisions WHERE id=${APPROVED_REPLACEMENT_TARGET.failedArtifactRevisionId} FOR UPDATE`;
    await tx`SELECT id FROM credit_ledger WHERE payment_order_id=${APPROVED_REPLACEMENT_TARGET.orderId} FOR UPDATE`;

    const row = (await eligibilityRows(tx))[0];
    const reasons = eligibilityReasons(row, null);
    if (reasons.length) throw new Error(`The approved paid report is not eligible for replacement fulfillment: ${reasons.join(", ")}.`);

    const replacementId = randomUUID();
    const jobId = randomUUID();
    const artifactRevisionId = randomUUID();
    const dispatchId = randomUUID();
    const transitionId = randomUUID();
    const revisions = await tx<Array<{ revision: number }>>`
      SELECT COALESCE(max(revision),0)::integer AS revision
      FROM report_artifact_revisions WHERE report_id=${APPROVED_REPLACEMENT_TARGET.reportId}`;

    await tx`INSERT INTO report_replacement_fulfillments
      (id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,reason_code,state,operator_authorization_ref)
      VALUES(${replacementId},${APPROVED_REPLACEMENT_TARGET.orderId},${APPROVED_REPLACEMENT_TARGET.reportId},${APPROVED_REPLACEMENT_TARGET.originalFailedJobId},
        ${APPROVED_REPLACEMENT_TARGET.failedArtifactRevisionId},${APPROVED_REPLACEMENT_TARGET.questionSetId},'paid_report_not_delivered','prepared',${authorizationRef})`;
    await tx`INSERT INTO scan_jobs
      (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,replacement_fulfillment_id,
       business_question_set_id,locale,reason,stage,execution_state,current_phase,credit_reservation_id)
      VALUES(${jobId},${APPROVED_REPLACEMENT_TARGET.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3',
        ${replacementId},${APPROVED_REPLACEMENT_TARGET.questionSetId},${language(row!.question_locale)},'replacement_fulfillment','queued','queued','admission',NULL)`;
    await tx`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,replacement_fulfillment_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
      VALUES(${artifactRevisionId},${APPROVED_REPLACEMENT_TARGET.reportId},${APPROVED_REPLACEMENT_TARGET.orderId},${jobId},${replacementId},
        ${(revisions[0]?.revision ?? 0) + 1},'replacement','combined_geo_report_v3','pending',${`${row!.question_content_hash}:${jobId}`})`;
    await tx`UPDATE report_replacement_fulfillments SET replacement_job_id=${jobId},state='queued' WHERE id=${replacementId} AND state='prepared'`;
    await tx`UPDATE payment_orders SET courtesy_non_billable=true,updated_at=now() WHERE id=${APPROVED_REPLACEMENT_TARGET.orderId}`;
    await tx`INSERT INTO scan_job_transition_events(id,job_id,from_execution_state,to_execution_state,phase,checkpoint_revision,reason_code)
      VALUES(${transitionId},${jobId},NULL,'queued','admission',0,'replacement_fulfillment_prepared')`;
    await tx`INSERT INTO job_dispatch_outbox(id,job_id,tier,schema_version,state) VALUES(${dispatchId},${jobId},'deep',1,'pending')`;
    return { replacementId, jobId, artifactRevisionId, state: "queued" };
  });
}

export async function getReplacementExecutionContext(jobId: string): Promise<{
  replacementId: string;
  orderId: string;
  reportId: string;
  originalFailedJobId: string;
  questionSetId: string;
  artifactRevisionId: string;
  artifactRevision: number;
} | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{
    replacement_id: string; order_id: string; report_id: string; original_failed_job_id: string; question_set_id: string;
    artifact_revision_id: string; artifact_revision: number;
  }>>`
    SELECT replacement.id AS replacement_id,replacement.order_id,replacement.report_id,replacement.original_failed_job_id,replacement.question_set_id,
      artifact.id AS artifact_revision_id,artifact.revision AS artifact_revision
    FROM report_replacement_fulfillments replacement
    JOIN report_artifact_revisions artifact ON artifact.replacement_fulfillment_id=replacement.id AND artifact.job_id=${jobId}
    WHERE replacement.replacement_job_id=${jobId} AND replacement.state IN ('queued','running','repair_wait') AND artifact.status='pending'
    LIMIT 1`;
  const row = rows[0];
  return row ? {
    replacementId: row.replacement_id, orderId: row.order_id, reportId: row.report_id, originalFailedJobId: row.original_failed_job_id,
    questionSetId: row.question_set_id, artifactRevisionId: row.artifact_revision_id, artifactRevision: row.artifact_revision
  } : null;
}

export async function syncReplacementExecutionState(jobId: string, executionState: string): Promise<void> {
  await ensureDatabase();
  const state = executionState === "running" ? "running" : executionState === "repair_wait" ? "repair_wait" : executionState === "failed" ? "failed" : null;
  if (!state) return;
  await getSqlClient()`UPDATE report_replacement_fulfillments replacement SET state=${state}
    FROM scan_jobs job WHERE replacement.replacement_job_id=${jobId} AND job.id=${jobId} AND replacement.state<>'completed'`;
}

export async function resumeApprovedReplacementModelRepair(input: { confirm: boolean; authorizationRef: string }): Promise<ReplacementFulfillmentSummary> {
  if (!input.confirm) throw new Error("Explicit --confirm is required for replacement model repair.");
  const authorizationRef = input.authorizationRef.trim();
  if (!/^[A-Za-z0-9@._:/ -]{3,160}$/.test(authorizationRef)) throw new Error("A safe operator authorization reference is required.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`replacement:${APPROVED_REPLACEMENT_TARGET.orderId}`},0))`;
    const rows = await tx<Array<{
      replacement_id: string; replacement_state: string; job_id: string; execution_state: string; error_code: string | null;
      current_phase: string; checkpoint_revision: number; recovery_phase: string | null; has_answer_first_v3: boolean;
      artifact_revision_id: string; artifact_status: string;
    }>>`SELECT replacement.id AS replacement_id,replacement.state AS replacement_state,job.id AS job_id,job.execution_state,job.error_code,
      job.current_phase,job.checkpoint_revision,job.checkpoint->'recovery'->>'phase' AS recovery_phase,
      job.checkpoint ? 'answerFirstV3' AS has_answer_first_v3,
      artifact.id AS artifact_revision_id,artifact.status AS artifact_status
      FROM report_replacement_fulfillments replacement
      JOIN scan_jobs job ON job.id=replacement.replacement_job_id
      JOIN report_artifact_revisions artifact ON artifact.replacement_fulfillment_id=replacement.id
      WHERE replacement.order_id=${APPROVED_REPLACEMENT_TARGET.orderId} FOR UPDATE OF replacement,job,artifact`;
    const row = rows[0];
    const failedModelContract = row?.replacement_state === "failed" && row.execution_state === "failed" &&
      row.error_code === "answer_first_v3_model_contract_invalid" && row.recovery_phase === "artifact_verification";
    const repairedAnswerCheckpoint = row?.replacement_state === "repair_wait" && row.execution_state === "repair_wait" &&
      row.error_code === "report_language_validation_failed" && row.recovery_phase === "grounded_answer_synthesis" && row.has_answer_first_v3;
    if (!row || row.artifact_status !== "pending" || (!failedModelContract && !repairedAnswerCheckpoint)) {
      throw new Error("The approved replacement is not eligible for model-contract repair resume.");
    }
    const resumePhase = repairedAnswerCheckpoint ? "grounded_answer_synthesis" : "artifact_verification";
    await tx`UPDATE scan_jobs SET stage='synthesizing',execution_state='queued',current_phase=${resumePhase},phase_attempt=0,
      retry_not_before=NULL,repair_reason_code=NULL,repair_deadline_at=NULL,resume_generation=resume_generation+1,
      lease_owner=NULL,lease_expires_at=NULL,error_code=NULL,public_error=NULL,updated_at=now()
      WHERE id=${row.job_id} AND execution_state=${row.execution_state}`;
    await tx`UPDATE report_replacement_fulfillments SET state='queued',operator_authorization_ref=${authorizationRef} WHERE id=${row.replacement_id}`;
    await tx`INSERT INTO scan_job_transition_events(id,job_id,from_execution_state,to_execution_state,phase,checkpoint_revision,reason_code)
      VALUES(${randomUUID()},${row.job_id},${row.execution_state},'queued',${resumePhase},${row.checkpoint_revision},'replacement_model_contract_repair_approved')`;
    return { replacementId: row.replacement_id, jobId: row.job_id, artifactRevisionId: row.artifact_revision_id, state: "queued" };
  });
}

type SqlClient = ReturnType<typeof getSqlClient> | postgres.TransactionSql;

async function readExisting(sql: SqlClient): Promise<ReplacementFulfillmentSummary | null> {
  const rows = await sql<Array<{ id: string; replacement_job_id: string | null; state: string; artifact_revision_id: string | null }>>`
    SELECT replacement.id,replacement.replacement_job_id,replacement.state,artifact.id AS artifact_revision_id
    FROM report_replacement_fulfillments replacement
    LEFT JOIN report_artifact_revisions artifact ON artifact.replacement_fulfillment_id=replacement.id
    WHERE replacement.order_id=${APPROVED_REPLACEMENT_TARGET.orderId} LIMIT 1`;
  const row = rows[0];
  return row ? { replacementId: row.id, jobId: row.replacement_job_id, artifactRevisionId: row.artifact_revision_id, state: row.state } : null;
}

async function eligibilityRows(sql: SqlClient): Promise<EligibilityRow[]> {
  return sql<EligibilityRow[]>`
    SELECT orders.payment_status,orders.fulfillment_status,orders.refund_status,
      job.stage AS job_stage,job.execution_state AS job_execution_state,job.tier AS job_tier,job.credit_reservation_id AS job_credit_reservation_id,
      report.active_artifact_revision_id AS report_active_artifact_revision_id,artifact.status AS artifact_status,artifact.artifact_contract,
      questions.status AS question_status,questions.content_hash AS question_content_hash,questions.locale AS question_locale,
      (SELECT count(*)::integer FROM credit_ledger credit WHERE credit.payment_order_id=orders.id AND credit.status='reserved') AS reserved_credit_count,
      (SELECT count(*)::integer FROM scan_jobs competing WHERE competing.report_id=report.id AND competing.id<>job.id
        AND competing.reason IN ('paid_report_correction','staging_artifact_refresh','replacement_fulfillment')
        AND competing.stage NOT IN ('completed','completed_limited','failed')) AS competing_job_count,
      (SELECT count(*)::integer FROM report_corrections correction WHERE correction.order_id=orders.id AND correction.state NOT IN ('completed','failed')) AS correction_count
    FROM payment_orders orders
    JOIN scan_reports report ON report.id=orders.report_id
    JOIN scan_jobs job ON job.id=orders.fulfillment_job_id AND job.report_id=report.id
    JOIN report_artifact_revisions artifact ON artifact.id=${APPROVED_REPLACEMENT_TARGET.failedArtifactRevisionId} AND artifact.job_id=job.id
    JOIN report_business_question_sets questions ON questions.id=${APPROVED_REPLACEMENT_TARGET.questionSetId} AND questions.report_id=report.id AND questions.order_id=orders.id
    WHERE orders.id=${APPROVED_REPLACEMENT_TARGET.orderId} AND report.id=${APPROVED_REPLACEMENT_TARGET.reportId}
      AND job.id=${APPROVED_REPLACEMENT_TARGET.originalFailedJobId}`;
}

function eligibilityReasons(row: EligibilityRow | undefined, existing: ReplacementFulfillmentSummary | null): string[] {
  if (existing) return ["replacement_already_exists"];
  if (!row) return ["approved_lineage_not_found"];
  const reasons: string[] = [];
  if (row.payment_status !== "paid") reasons.push("order_not_paid");
  if (row.fulfillment_status !== "failed") reasons.push("original_fulfillment_not_failed");
  if (row.job_stage !== "failed" || row.job_execution_state !== "failed") reasons.push("original_job_not_terminal_failed");
  if (row.job_tier !== "deep") reasons.push("original_job_not_deep");
  if (row.reserved_credit_count !== 0) reasons.push("credit_still_reserved");
  if (row.report_active_artifact_revision_id !== null) reasons.push("report_already_has_active_artifact");
  if (!["pending", "failed"].includes(row.artifact_status) || row.artifact_contract !== "combined_geo_report_v3") reasons.push("failed_job_v3_artifact_missing");
  if (row.question_status !== "locked" || !row.question_content_hash) reasons.push("question_set_not_locked");
  if (row.competing_job_count !== 0) reasons.push("competing_recovery_job");
  if (row.correction_count !== 0) reasons.push("competing_correction");
  return reasons;
}

function language(locale: string): "en" | "zh" { return locale.toLowerCase().startsWith("zh") ? "zh" : "en"; }
