import { createHash, randomUUID } from "node:crypto";
import { parseCombinedGeoReportV1, type CombinedGeoReportV1 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";
import type { PaidPublicSourceSnapshotRef } from "./public-source-commerce";
import { JobTransitionService } from "@/worker/job-transition-service";

export async function terminalizeCombinedCorrection(input: {
  report: unknown;
  workerId: string;
  checkpointIdentityHash: string;
  snapshotRefs: readonly PaidPublicSourceSnapshotRef[];
  htmlSha256: string;
  pdfSha256: string;
  pdfStorageKey: string;
  pageCount: number;
}): Promise<{ report: CombinedGeoReportV1; emailDeliveryId: string }> {
  const report = parseCombinedGeoReportV1(input.report);
  if (!input.workerId.trim() || !input.checkpointIdentityHash.trim() || input.pageCount < 5) throw new Error("Combined correction readiness identity is incomplete.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<{ execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;correction_id:string|null;business_question_set_id:string|null;artifact_contract:string|null }>>`
      SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,correction_id,business_question_set_id,artifact_contract
      FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const checkpoint=(job?.checkpoint?.publicSourceForensics ?? null) as {identityHash?:unknown}|null;
    if (!job || job.execution_state!=="running" || job.lease_owner!==input.workerId || !job.lease_expires_at || Date.parse(job.lease_expires_at)<=Date.now() ||
        job.credit_reservation_id!==null || job.correction_id===null || job.business_question_set_id!==report.questionSetIdentity ||
        job.artifact_contract!=="combined_geo_report_v1" || checkpoint?.identityHash!==input.checkpointIdentityHash) {
      throw new Error("Combined correction requires its exact active non-billable leased job.");
    }
    const correction=(await tx<Array<{ id:string;order_id:string;original_paid_job_id:string;question_set_id:string;state:string }>>`
      SELECT id,order_id,original_paid_job_id,question_set_id,state FROM report_corrections
      WHERE id=${job.correction_id} AND report_id=${report.reportId} FOR UPDATE`)[0];
    if (!correction || correction.order_id!==report.orderId || correction.original_paid_job_id!==report.originalPaidJobId || correction.question_set_id!==report.questionSetIdentity || correction.state==="completed") throw new Error("Correction identity changed before activation.");
    const order=(await tx<Array<{payment_status:string;fulfillment_status:string;refund_status:string;report_locale:string}>>`
      SELECT payment_status,fulfillment_status,refund_status,report_locale FROM payment_orders WHERE id=${report.orderId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    if (!order || order.payment_status!=="paid" || order.fulfillment_status!=="completed" || order.refund_status!=="not_required") throw new Error("The original paid order is not eligible for correction activation.");
    for (const ref of input.snapshotRefs) {
      const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,report.evidenceCutoffAt]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${report.evidenceCutoffAt},${ref.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash}
        FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed'
        ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const storedRefs=await tx<Array<{snapshot_id:string}>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;
    if(storedRefs.length!==input.snapshotRefs.length) throw new Error("Every correction snapshot must be atomically bound.");
    await tx`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
      VALUES(${report.artifactRevisionId},${report.reportId},${report.orderId},${report.jobId},${report.questionSetIdentity},${JSON.stringify(report)}::jsonb)`;
    await tx`UPDATE report_artifact_revisions SET status='ready',html_sha256=${input.htmlSha256},pdf_sha256=${input.pdfSha256},
      pdf_storage_key=${input.pdfStorageKey},payload_identity_hash=${sha([JSON.stringify(report)])},
      readiness=${JSON.stringify({ htmlCanonical:true,pageCount:input.pageCount,privateEvidenceReady:true })}::jsonb,
      ready_at=now() WHERE id=${report.artifactRevisionId} AND report_id=${report.reportId} AND job_id=${report.jobId} AND status='pending'`;
    await tx`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE report_id=${report.reportId} AND status='active' AND id<>${report.artifactRevisionId}`;
    const activated=await tx<{id:string}[]>`UPDATE report_artifact_revisions SET status='active',activated_at=now()
      WHERE id=${report.artifactRevisionId} AND status='ready' RETURNING id`;
    if(activated.length!==1) throw new Error("The ready correction artifact could not be activated.");
    await tx`UPDATE scan_reports SET active_artifact_revision_id=${report.artifactRevisionId} WHERE id=${report.reportId}`;
    await tx`UPDATE report_corrections SET state='completed',active_artifact_revision_id=${report.artifactRevisionId},completed_at=now() WHERE id=${correction.id}`;
    await tx`UPDATE scan_jobs SET stage='completed',execution_state='completed',current_phase='terminalization',progress=100,
      lease_owner=NULL,lease_expires_at=NULL,error_code=NULL,public_error=NULL,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx,{jobId:report.jobId,fromState:job.execution_state,toState:'completed',phase:'terminalization',checkpointRevision:job.checkpoint_revision,reasonCode:'combined_correction_activated'});
    const emailId=randomUUID(),businessKey=`corrected_report_ready/${report.artifactRevisionId}/v1`;
    await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state)
      VALUES(${emailId},${report.orderId},${report.reportId},'corrected_report_ready','v1',${order.report_locale},${report.orderId},'resend',${businessKey},'queued') ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const email=(await tx<Array<{id:string}>>`SELECT id FROM email_deliveries WHERE business_idempotency_key=${businessKey}`)[0];
    if(!email) throw new Error("Correction completion email was not persisted.");
    return {report,emailDeliveryId:email.id};
  });
}

export async function terminalizePaidCombinedReport(input: {
  report: unknown; workerId: string; checkpointIdentityHash: string; snapshotRefs: readonly PaidPublicSourceSnapshotRef[];
  htmlSha256:string;pdfSha256:string;pdfStorageKey:string;pageCount:number;
}):Promise<{report:CombinedGeoReportV1;emailDeliveryId:string}>{
  const report=parseCombinedGeoReportV1(input.report);
  if(report.publicSourceForensics.commercialOutcome!=="completed"||input.pageCount<5)throw new Error("Only a complete ready combined report may settle a paid order.");
  await ensureDatabase();
  return getSqlClient().begin(async(tx)=>{
    const job=(await tx<Array<{execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;business_question_set_id:string|null;artifact_contract:string|null}>>`
      SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,business_question_set_id,artifact_contract FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const checkpoint=(job?.checkpoint?.publicSourceForensics??null)as{identityHash?:unknown}|null;
    if(!job||job.execution_state!=="running"||job.lease_owner!==input.workerId||!job.lease_expires_at||Date.parse(job.lease_expires_at)<=Date.now()||!job.credit_reservation_id||job.business_question_set_id!==report.questionSetIdentity||job.artifact_contract!=="combined_geo_report_v1"||checkpoint?.identityHash!==input.checkpointIdentityHash)throw new Error("Paid combined activation requires its exact leased job and reservation.");
    const order=(await tx<Array<{id:string;report_locale:string;fulfillment_status:string;refund_status:string}>>`SELECT id,report_locale,fulfillment_status,refund_status FROM payment_orders WHERE id=${report.orderId} AND fulfillment_job_id=${report.jobId} AND report_id=${report.reportId} AND payment_status='paid' FOR UPDATE`)[0];
    if(!order||order.refund_status!=="not_required"||!["queued","processing"].includes(order.fulfillment_status))throw new Error("The paid combined order is not activatable.");
    const credit=(await tx<Array<{id:string;status:string;job_id:string|null}>>`SELECT id,status,job_id FROM credit_ledger WHERE id=${job.credit_reservation_id} FOR UPDATE`)[0];
    if(!credit||credit.status!=="reserved"||(credit.job_id&&credit.job_id!==report.jobId))throw new Error("The paid combined credit reservation is invalid.");
    for(const ref of input.snapshotRefs){const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,report.evidenceCutoffAt]);await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash) SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${report.evidenceCutoffAt},${ref.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash} FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed' ON CONFLICT(job_id,snapshot_id) DO NOTHING`;}
    const refs=await tx<Array<{snapshot_id:string}>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;if(refs.length!==input.snapshotRefs.length)throw new Error("Every paid combined snapshot must be bound.");
    await tx`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload) VALUES(${report.artifactRevisionId},${report.reportId},${report.orderId},${report.jobId},${report.questionSetIdentity},${JSON.stringify(report)}::jsonb)`;
    await tx`UPDATE report_artifact_revisions SET status='ready',html_sha256=${input.htmlSha256},pdf_sha256=${input.pdfSha256},pdf_storage_key=${input.pdfStorageKey},payload_identity_hash=${sha([JSON.stringify(report)])},readiness=${JSON.stringify({htmlCanonical:true,pageCount:input.pageCount,privateEvidenceReady:true})}::jsonb,ready_at=now() WHERE id=${report.artifactRevisionId} AND job_id=${report.jobId} AND status='pending'`;
    await tx`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE report_id=${report.reportId} AND status='active' AND id<>${report.artifactRevisionId}`;
    const active=await tx<{id:string}[]>`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${report.artifactRevisionId} AND status='ready' RETURNING id`;if(active.length!==1)throw new Error("The paid combined artifact could not activate.");
    await tx`UPDATE scan_reports SET active_artifact_revision_id=${report.artifactRevisionId} WHERE id=${report.reportId}`;
    await tx`UPDATE scan_jobs SET stage='completed',execution_state='completed',current_phase='terminalization',progress=100,lease_owner=NULL,lease_expires_at=NULL,error_code=NULL,public_error=NULL,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx,{jobId:report.jobId,fromState:job.execution_state,toState:'completed',phase:'terminalization',checkpointRevision:job.checkpoint_revision,reasonCode:'combined_paid_activated'});
    await tx`UPDATE credit_ledger SET status='settled',settled_at=now(),refunded_at=NULL WHERE id=${credit.id}`;
    await tx`UPDATE payment_orders SET fulfillment_status='completed',fulfilled_at=COALESCE(fulfilled_at,now()),delivery_status=CASE WHEN delivery_status='not_queued' THEN 'queued' ELSE delivery_status END,updated_at=now() WHERE id=${order.id}`;
    const emailId=randomUUID(),businessKey=`report_ready/${report.artifactRevisionId}/v1`;await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state) VALUES(${emailId},${order.id},${report.reportId},'report_ready','v1',${order.report_locale},${order.id},'resend',${businessKey},'queued') ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const email=(await tx<Array<{id:string}>>`SELECT id FROM email_deliveries WHERE business_idempotency_key=${businessKey}`)[0];if(!email)throw new Error("Paid combined completion email was not persisted.");return{report,emailDeliveryId:email.id};
  });
}
function sha(parts:string[]):string{return createHash("sha256").update(parts.join("\0")).digest("hex");}
