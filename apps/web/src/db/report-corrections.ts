import { randomUUID } from "node:crypto";
import type { BusinessQuestionCandidateSet, ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { ensureDatabase, getSqlClient } from "./index";
import { getAiReport } from "./ai-reports";
import { confirmBusinessQuestions, getBusinessQuestionSet, prepareBusinessQuestionCandidates } from "./business-questions";

export const APPROVED_CORRECTION_TARGET = {
  orderId: "5f999610-17d5-4df9-9aa0-a6cce5e5b741",
  reportId: "a71d7481-c5dc-4e2a-a042-b9be878feab8",
  originalPaidJobId: "dd2cff0b-ba16-43b0-aded-55fdc767e656"
} as const;

export async function prepareApprovedReportCorrection(): Promise<{ correctionId: string; questions: BusinessQuestionCandidateSet | ConfirmedBusinessQuestionSet }> {
  await assertApprovedCorrectionEligibility();
  const existing = await getSqlClient()<Array<{id:string;question_set_id:string;report_id:string;original_paid_job_id:string}>>`
    SELECT id,question_set_id,report_id,original_paid_job_id FROM report_corrections WHERE order_id=${APPROVED_CORRECTION_TARGET.orderId} LIMIT 1`;
  if (existing[0]) {
    if (existing[0].report_id !== APPROVED_CORRECTION_TARGET.reportId || existing[0].original_paid_job_id !== APPROVED_CORRECTION_TARGET.originalPaidJobId) {
      throw new Error("The existing correction does not match the approved staging target.");
    }
    const questions = await getBusinessQuestionSet(APPROVED_CORRECTION_TARGET.reportId, existing[0].question_set_id);
    if (!questions) throw new Error("The existing correction question set is unavailable.");
    return { correctionId: existing[0].id, questions };
  }
  const foundation = await getAiReport(APPROVED_CORRECTION_TARGET.reportId, "deep", "recommendation_forensics_v1");
  if (!foundation?.technicalPayload || foundation.payload.tier !== "deep") throw new Error("The paid deep technical foundation is unavailable for correction preparation.");
  const revisions = await getSqlClient()<Array<{revision:number}>>`SELECT COALESCE(max(revision),0)::integer AS revision FROM report_business_question_sets WHERE report_id=${APPROVED_CORRECTION_TARGET.reportId}`;
  const questions = await prepareBusinessQuestionCandidates({ reportId: APPROVED_CORRECTION_TARGET.reportId,
    revision: (revisions[0]?.revision ?? 0) + 1, foundation: foundation.payload });
  const correctionId = randomUUID();
  await getSqlClient().begin(async (tx) => {
    await tx`UPDATE report_business_question_sets SET order_id=${APPROVED_CORRECTION_TARGET.orderId},updated_at=now()
      WHERE id=${questions.id} AND report_id=${APPROVED_CORRECTION_TARGET.reportId} AND order_id IS NULL`;
    await tx`INSERT INTO report_corrections(id,order_id,report_id,original_paid_job_id,question_set_id,state)
      VALUES(${correctionId},${APPROVED_CORRECTION_TARGET.orderId},${APPROVED_CORRECTION_TARGET.reportId},${APPROVED_CORRECTION_TARGET.originalPaidJobId},${questions.id},'review_required')`;
  });
  return { correctionId, questions };
}

export async function confirmApprovedReportCorrection(input: { finalTexts: readonly string[]; acknowledgedLowConfidence: boolean }): Promise<{
  correctionId: string; jobId: string; artifactRevisionId: string; questions: ConfirmedBusinessQuestionSet;
}> {
  await assertApprovedCorrectionEligibility();
  const rows = await getSqlClient()<Array<{id:string;question_set_id:string;correction_job_id:string|null;state:string}>>`
    SELECT id,question_set_id,correction_job_id,state FROM report_corrections WHERE order_id=${APPROVED_CORRECTION_TARGET.orderId} LIMIT 1`;
  const correction = rows[0];
  if (!correction) throw new Error("Prepare the approved correction before confirming it.");
  if (correction.correction_job_id) {
    const existing = await getSqlClient()<Array<{id:string}>>`SELECT id FROM report_artifact_revisions WHERE correction_id=${correction.id} LIMIT 1`;
    const questions = await getBusinessQuestionSet(APPROVED_CORRECTION_TARGET.reportId, correction.question_set_id) as ConfirmedBusinessQuestionSet | null;
    if (!existing[0] || !questions?.confirmedAt) throw new Error("The existing correction identity is incomplete.");
    return { correctionId: correction.id, jobId: correction.correction_job_id, artifactRevisionId: existing[0].id, questions };
  }
  const questions = await confirmBusinessQuestions({ reportId: APPROVED_CORRECTION_TARGET.reportId, questionSetId: correction.question_set_id,
    finalTexts: input.finalTexts, acknowledgedLowConfidence: input.acknowledgedLowConfidence });
  const jobId = randomUUID(), artifactRevisionId = randomUUID(), dispatchId = randomUUID();
  await getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`artifact-revision:${APPROVED_CORRECTION_TARGET.reportId}`},0))`;
    const revisions=await tx<Array<{revision:number}>>`SELECT COALESCE(max(revision),0)::integer AS revision FROM report_artifact_revisions WHERE report_id=${APPROVED_CORRECTION_TARGET.reportId}`;
    await tx`UPDATE report_business_question_sets SET status='locked',locked_at=now(),updated_at=now() WHERE id=${questions.id} AND status='confirmed'`;
    await tx`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,correction_id,business_question_set_id,locale,reason,stage,credit_reservation_id)
      VALUES(${jobId},${APPROVED_CORRECTION_TARGET.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,
        'combined_geo_report_v1',${correction.id},${questions.id},${language(questions.locale)},'paid_report_correction','queued',NULL)`;
    await tx`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,correction_id,revision,artifact_contract,status,payload_identity_hash)
      VALUES(${artifactRevisionId},${APPROVED_CORRECTION_TARGET.reportId},${APPROVED_CORRECTION_TARGET.orderId},${jobId},${correction.id},${(revisions[0]?.revision ?? 0)+1},
        'combined_geo_report_v1','pending',${`${questions.contentHash}:${jobId}`})`;
    await tx`UPDATE report_corrections SET correction_job_id=${jobId},state='queued' WHERE id=${correction.id} AND correction_job_id IS NULL`;
    await tx`INSERT INTO job_dispatch_outbox(id,job_id,tier,schema_version,state) VALUES(${dispatchId},${jobId},'deep',1,'pending')`;
  });
  return { correctionId: correction.id, jobId, artifactRevisionId, questions };
}

export async function getCorrectionExecutionContext(jobId: string): Promise<{
  correctionId: string; orderId: string; originalPaidJobId: string; artifactRevisionId: string; artifactRevision: number;
} | null> {
  await ensureDatabase();
  const rows=await getSqlClient()<Array<{correction_id:string;order_id:string;original_paid_job_id:string;artifact_revision_id:string;artifact_revision:number}>>`
    SELECT correction.id AS correction_id,correction.order_id,correction.original_paid_job_id,
      artifact.id AS artifact_revision_id,artifact.revision AS artifact_revision
    FROM report_corrections correction JOIN report_artifact_revisions artifact ON artifact.correction_id=correction.id
    WHERE correction.correction_job_id=${jobId} AND artifact.job_id=${jobId} AND artifact.status='pending' LIMIT 1`;
  const row=rows[0];
  return row ? { correctionId:row.correction_id,orderId:row.order_id,originalPaidJobId:row.original_paid_job_id,
    artifactRevisionId:row.artifact_revision_id,artifactRevision:row.artifact_revision } : null;
}

async function assertApprovedCorrectionEligibility(): Promise<void> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{payment_status:string;fulfillment_status:string;refund_status:string;job_stage:string;credit_status:string|null}>>`
    SELECT orders.payment_status,orders.fulfillment_status,orders.refund_status,jobs.stage AS job_stage,credits.status AS credit_status
    FROM payment_orders orders JOIN scan_jobs jobs ON jobs.id=${APPROVED_CORRECTION_TARGET.originalPaidJobId} AND jobs.report_id=orders.report_id
    LEFT JOIN credit_ledger credits ON credits.payment_order_id=orders.id
    WHERE orders.id=${APPROVED_CORRECTION_TARGET.orderId} AND orders.report_id=${APPROVED_CORRECTION_TARGET.reportId}
      AND orders.fulfillment_job_id=${APPROVED_CORRECTION_TARGET.originalPaidJobId} AND orders.product_code='recommendation_forensics_v1'`;
  const row=rows[0];
  if(!row || row.payment_status!=="paid" || row.fulfillment_status!=="completed" || row.refund_status!=="not_required" ||
      !["completed","completed_limited"].includes(row.job_stage) || row.credit_status!=="settled") {
    throw new Error("The approved staging order is not eligible for its one free correction.");
  }
}
function language(locale:string):"en"|"zh" { return locale.toLowerCase().startsWith("zh") ? "zh" : "en"; }
