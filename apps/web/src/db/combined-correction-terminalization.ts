import { createHash, randomUUID } from "node:crypto";
import { requireReadyCombinedGeoReport, requireReadyCombinedGeoReportV2, requireReadyCombinedGeoReportV3, type CombinedGeoReportV1, type CombinedGeoReportV2, type CombinedGeoReportV3, type LegacyEvidenceBoundAnswerCardV3, type OpenGeoAnswerCardV3 } from "@open-geo-console/ai-report-engine";
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
}): Promise<{ report: CombinedGeoReportV1 | CombinedGeoReportV2 | CombinedGeoReportV3; emailDeliveryId: string }> {
  const report = readyCombined(input.report);
  if (!input.workerId.trim() || !input.checkpointIdentityHash.trim() || input.pageCount < 5) throw new Error("Combined correction readiness identity is incomplete.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<{ execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;correction_id:string|null;business_question_set_id:string|null;artifact_contract:string|null }>>`
      SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,correction_id,business_question_set_id,artifact_contract
      FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const checkpoint=combinedCheckpoint(job?.checkpoint, report.artifactContract);
    if (!job || job.execution_state!=="running" || job.lease_owner!==input.workerId || !job.lease_expires_at || Date.parse(job.lease_expires_at)<=Date.now() ||
        job.credit_reservation_id!==null || job.correction_id===null || job.business_question_set_id!==report.questionSetIdentity ||
        job.artifact_contract!==report.artifactContract || checkpoint?.identityHash!==input.checkpointIdentityHash) {
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
      const snapshot=(await tx<Array<{completed_at:string}>>`SELECT completed_at FROM market_snapshot_questions
        WHERE id=${ref.snapshotId} AND cache_identity=${ref.cacheIdentity} AND status='completed'`)[0];
      if(!snapshot) throw new Error("The correction snapshot is not complete and bindable.");
      const reference=snapshotReferenceBinding(report.evidenceCutoffAt,snapshot.completed_at);
      const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,reference.evidenceCutoff]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${reference.evidenceCutoff},${reference.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash}
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
  faultAfter?:"report"|"refs"|"job"|"credit"|"order"|"email";
}):Promise<{report:CombinedGeoReportV1|CombinedGeoReportV2|CombinedGeoReportV3;outcome:"completed"|"completed_limited"|"failed";refundId:string|null;emailDeliveryId:string}>{
  const report=readyCombined(input.report);
  const outcome=report.artifactContract==="combined_geo_report_v3"?combinedV3CommercialOutcome(report.answerCards):report.publicSourceForensics.commercialOutcome;
  if((report.artifactContract!=="combined_geo_report_v3"&&outcome!=="completed")||input.pageCount<5)throw new Error("Only a ready combined report may terminalize a paid order.");
  await ensureDatabase();
  return getSqlClient().begin(async(tx)=>{
    const job=(await tx<Array<{execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;business_question_set_id:string|null;artifact_contract:string|null}>>`
      SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,business_question_set_id,artifact_contract FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const checkpoint=combinedCheckpoint(job?.checkpoint,report.artifactContract);
    if(!job||job.execution_state!=="running"||job.lease_owner!==input.workerId||!job.lease_expires_at||Date.parse(job.lease_expires_at)<=Date.now()||!job.credit_reservation_id||job.business_question_set_id!==report.questionSetIdentity||job.artifact_contract!==report.artifactContract||checkpoint?.identityHash!==input.checkpointIdentityHash)throw new Error("Paid combined activation requires its exact leased job and reservation.");
    const order=(await tx<Array<{id:string;provider:string;amount_minor:number;currency:string;report_locale:string;fulfillment_status:string;refund_status:string}>>`SELECT id,provider,amount_minor,currency,report_locale,fulfillment_status,refund_status FROM payment_orders WHERE id=${report.orderId} AND fulfillment_job_id=${report.jobId} AND report_id=${report.reportId} AND payment_status='paid' FOR UPDATE`)[0];
    if(!order||order.refund_status!=="not_required"||!["queued","processing"].includes(order.fulfillment_status))throw new Error("The paid combined order is not activatable.");
    const credit=(await tx<Array<{id:string;status:string;job_id:string|null;access_key_id:string;credits:number}>>`SELECT id,status,job_id,access_key_id,credits FROM credit_ledger WHERE id=${job.credit_reservation_id} FOR UPDATE`)[0];
    if(!credit||credit.status!=="reserved"||(credit.job_id&&credit.job_id!==report.jobId))throw new Error("The paid combined credit reservation is invalid.");
    for(const ref of input.snapshotRefs){
      const snapshot=(await tx<Array<{completed_at:string}>>`SELECT completed_at FROM market_snapshot_questions WHERE id=${ref.snapshotId} AND cache_identity=${ref.cacheIdentity} AND status='completed'`)[0];
      if(!snapshot)throw new Error("The paid combined snapshot is not complete and bindable.");
      const reference=snapshotReferenceBinding(report.evidenceCutoffAt,snapshot.completed_at);
      const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,reference.evidenceCutoff]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash) SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${reference.evidenceCutoff},${reference.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash} FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed' ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const refs=await tx<Array<{snapshot_id:string}>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;if(refs.length!==input.snapshotRefs.length)throw new Error("Every paid combined snapshot must be bound.");
    fault(input.faultAfter,"refs");
    await tx`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload) VALUES(${report.artifactRevisionId},${report.reportId},${report.orderId},${report.jobId},${report.questionSetIdentity},${JSON.stringify(report)}::jsonb)`;
    fault(input.faultAfter,"report");
    await tx`UPDATE report_artifact_revisions SET status='ready',html_sha256=${input.htmlSha256},pdf_sha256=${input.pdfSha256},pdf_storage_key=${input.pdfStorageKey},payload_identity_hash=${sha([JSON.stringify(report)])},readiness=${JSON.stringify({htmlCanonical:true,pageCount:input.pageCount,privateEvidenceReady:true})}::jsonb,ready_at=now() WHERE id=${report.artifactRevisionId} AND job_id=${report.jobId} AND status='pending'`;
    if(outcome!=="failed"){
      await tx`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE report_id=${report.reportId} AND status='active' AND id<>${report.artifactRevisionId}`;
      const active=await tx<{id:string}[]>`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${report.artifactRevisionId} AND status='ready' RETURNING id`;if(active.length!==1)throw new Error("The paid combined artifact could not activate.");
      await tx`UPDATE scan_reports SET active_artifact_revision_id=${report.artifactRevisionId} WHERE id=${report.reportId}`;
    }
    await tx`UPDATE scan_jobs SET stage=${outcome},execution_state=${outcome==='failed'?'failed':'completed'},current_phase='terminalization',progress=CASE WHEN ${outcome}='failed' THEN progress ELSE 100 END,lease_owner=NULL,lease_expires_at=NULL,error_code=CASE WHEN ${outcome}='failed' THEN 'combined_v3_evidence_failed' ELSE NULL END,public_error=CASE WHEN ${outcome}='failed' THEN 'The public evidence was not sufficient for a usable Open GEO answer report.' ELSE NULL END,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx,{jobId:report.jobId,fromState:job.execution_state,toState:outcome==='failed'?'failed':'completed',phase:'terminalization',checkpointRevision:job.checkpoint_revision,reasonCode:'combined_paid_terminalization'});
    fault(input.faultAfter,"job");
    if(outcome==="completed") await tx`UPDATE credit_ledger SET status='settled',settled_at=now(),refunded_at=NULL WHERE id=${credit.id}`;
    else { await tx`UPDATE access_keys SET credits_remaining=credits_remaining+${credit.credits},status=CASE WHEN status='exhausted' THEN 'active' ELSE status END WHERE id=${credit.access_key_id}`; await tx`UPDATE credit_ledger SET status='refunded',refunded_at=now(),settled_at=NULL WHERE id=${credit.id}`; }
    fault(input.faultAfter,"credit");
    let refundId:string|null=null;
    if(outcome!=="completed"){
      await tx`INSERT INTO payment_refunds(id,order_id,provider,reason,amount_minor,currency,state,idempotency_key) VALUES(${randomUUID()},${order.id},${order.provider},${outcome==="completed_limited"?"completed_limited":"report_failed"},${order.amount_minor},${order.currency},'pending',${`full_refund/${order.id}`}) ON CONFLICT(order_id) DO NOTHING`;
      refundId=(await tx<Array<{id:string}>>`SELECT id FROM payment_refunds WHERE order_id=${order.id}`)[0]!.id;
    }
    await tx`UPDATE payment_orders SET fulfillment_status=${outcome},fulfilled_at=COALESCE(fulfilled_at,now()),refund_status=CASE WHEN ${outcome}='completed' THEN refund_status WHEN refund_status='not_required' THEN 'pending' ELSE refund_status END,delivery_status=CASE WHEN delivery_status='not_queued' THEN 'queued' ELSE delivery_status END,updated_at=now() WHERE id=${order.id}`;
    fault(input.faultAfter,"order");
    const template=outcome==="completed"?"report_ready":outcome==="completed_limited"?"limited_report_refund":"report_failed_refund";
    const emailId=randomUUID(),businessKey=`${template}/${report.artifactRevisionId}/v1`;await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state) VALUES(${emailId},${order.id},${report.reportId},${template},'v1',${order.report_locale},${order.id},'resend',${businessKey},'queued') ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const email=(await tx<Array<{id:string}>>`SELECT id FROM email_deliveries WHERE business_idempotency_key=${businessKey}`)[0];if(!email)throw new Error("Paid combined completion email was not persisted.");
    fault(input.faultAfter,"email");
    return{report,outcome,refundId,emailDeliveryId:email.id};
  });
}
export function snapshotReferenceBinding(reportCutoff:string,snapshotCompletedAt:string,now=new Date()):{evidenceCutoff:string;freshnessState:"fresh"|"historical"|"insufficient"}{
  const reportTime=Date.parse(reportCutoff),completedTime=Date.parse(snapshotCompletedAt),nowTime=now.getTime();
  if(!Number.isFinite(reportTime)||!Number.isFinite(completedTime)||completedTime>nowTime)throw new Error("Snapshot reference timestamps are invalid.");
  const cutoff=Math.max(reportTime,completedTime);
  if(cutoff>nowTime)throw new Error("Snapshot reference cutoff cannot be in the future.");
  const age=cutoff-completedTime;
  return {evidenceCutoff:new Date(cutoff).toISOString(),freshnessState:age<=7*24*60*60_000?"fresh":age<=30*24*60*60_000?"historical":"insufficient"};
}
function sha(parts:string[]):string{return createHash("sha256").update(parts.join("\0")).digest("hex");}
export function combinedV3CommercialOutcome(cards: readonly OpenGeoAnswerCardV3[]): "completed" | "completed_limited" | "failed" {
  if(cards.length!==3)throw new TypeError("V3 commercial outcome requires exactly three answer cards.");
  const modes = new Set(cards.map((card) => card.answerMode ?? "legacy_evidence_bound_v1"));
  if (modes.size !== 1) throw new TypeError("V3 commercial outcome rejects mixed answer modes.");
  if (cards.every((card) => card.answerMode === "generative_search_v1")) {
    const generative = cards;
    if (generative.every((card) => card.status === "answered")) return "completed";
    if (generative.some((card) => card.status === "refused" && card.refusal === null)) return "failed";
    return generative.some((card) => card.status === "answered") ? "completed_limited" : "failed";
  }
  const legacyCards = cards.filter((card): card is LegacyEvidenceBoundAnswerCardV3 => card.answerMode !== "generative_search_v1");
  if (legacyCards.length !== cards.length) throw new TypeError("V3 commercial outcome rejects mixed answer modes.");
  if(legacyCards.every(({status})=>status==="answered"))return "completed";
  if(legacyCards.every(({status})=>status!=="insufficient"))return "completed_limited";
  return legacyCards.some(({sentences})=>sentences.some(({kind,evidenceIds})=>kind==="grounded_claim"&&evidenceIds.length>0))?"completed_limited":"failed";
}
function readyCombined(value:unknown):CombinedGeoReportV1|CombinedGeoReportV2|CombinedGeoReportV3{
  const contract=value&&typeof value==="object"&&!Array.isArray(value)?(value as {artifactContract?:unknown}).artifactContract:null;
  if(contract==="combined_geo_report_v3")return requireReadyCombinedGeoReportV3(value);
  if(contract==="combined_geo_report_v2")return requireReadyCombinedGeoReportV2(value);
  if(contract==="combined_geo_report_v1")return requireReadyCombinedGeoReport(value);
  throw new TypeError("Combined artifact contract is unsupported.");
}
function combinedCheckpoint(checkpoint:Record<string,unknown>|undefined,contract:string):{identityHash?:unknown}|null{
  if(!checkpoint)return null;
  return (contract==="combined_geo_report_v3"?checkpoint.answerFirstV3:contract==="combined_geo_report_v2"?checkpoint.providerDiscovery:checkpoint.publicSourceForensics) as {identityHash?:unknown}|null;
}
function fault(actual:string|undefined,expected:string):void{if(actual===expected)throw new Error(`Injected fault after ${expected}.`);}
