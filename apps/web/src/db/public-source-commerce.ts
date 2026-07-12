import { createHash, randomUUID } from "node:crypto";
import { parseRecommendationForensicReportV2, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";
import { prepareSourceForensicReportRow } from "./source-forensic-reports";
import type { ScanJobCoverage } from "./jobs";

export interface PaidPublicSourceSnapshotRef {
  snapshotId: string; cacheIdentity: string; freshnessState: "fresh" | "historical" | "insufficient";
  actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number;
}

export async function terminalizePaidPublicSourceReport(input: {
  report: unknown; workerId: string; checkpointIdentityHash: string; coverage: ScanJobCoverage;
  snapshotRefs: readonly PaidPublicSourceSnapshotRef[];
  faultAfter?: "report" | "refs" | "job" | "credit" | "order" | "email";
}): Promise<{ report: RecommendationForensicReportV2; orderId: string; refundId: string | null; emailDeliveryId: string }> {
  const report = parseRecommendationForensicReportV2(input.report);
  if (!input.workerId.trim() || !input.checkpointIdentityHash.trim()) throw new Error("Worker and checkpoint identities are required.");
  if (new Set(input.snapshotRefs.map(({ snapshotId }) => snapshotId)).size !== input.snapshotRefs.length ||
      input.snapshotRefs.some((ref) => !report.snapshotRefs.some(({ snapshotId }) => snapshotId === ref.snapshotId))) throw new Error("Commercial snapshot refs must match the V2 report.");
  assertCoverage(input.coverage);
  const row = prepareSourceForensicReportRow(report);
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<{ id:string;report_id:string;stage:string;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;product_contract:string;fulfillment_methodology:string;recommendation_report_version:number }>>`
      SELECT id,report_id,stage,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,product_contract,fulfillment_methodology,recommendation_report_version
      FROM scan_jobs WHERE id=${report.jobId} FOR UPDATE`)[0];
    if (!job || job.report_id!==report.reportId || job.product_contract!=="recommendation_forensics_v1" || job.fulfillment_methodology!==report.methodology || Number(job.recommendation_report_version)!==2 ||
        job.lease_owner!==input.workerId || !job.lease_expires_at || Date.parse(job.lease_expires_at)<=Date.now() || ["completed","completed_limited","failed"].includes(job.stage)) throw new Error("V2 terminalization requires its exact active leased job.");
    const checkpoint=(job.checkpoint?.publicSourceForensics ?? null) as {identityHash?:unknown}|null;
    if (checkpoint?.identityHash!==input.checkpointIdentityHash) throw new Error("V2 terminalization checkpoint identity mismatch.");
    const order=(await tx<Array<{id:string;provider:string;amount_minor:number;currency:string;report_locale:string;fulfillment_status:string;refund_status:string}>>`
      SELECT id,provider,amount_minor,currency,report_locale,fulfillment_status,refund_status FROM payment_orders
      WHERE fulfillment_job_id=${report.jobId} AND report_id=${report.reportId} AND payment_status='paid'
        AND product_code='recommendation_forensics_v1' AND fulfillment_methodology='public_search_source_forensics_v1' AND recommendation_report_version=2
      FOR UPDATE`)[0];
    if(!order) throw new Error("A verified paid V2 order is required.");
    await tx`INSERT INTO report_source_forensics(id,report_id,job_id,report_version,fulfillment_methodology,product_contract,payload,authority_hash,provenance_hash,content_hash,is_private)
      VALUES(${row.id},${row.reportId},${row.jobId},2,${row.fulfillmentMethodology},${row.productContract},${JSON.stringify(row.payload)}::jsonb,${row.authorityHash},${row.provenanceHash},${row.contentHash},true) ON CONFLICT(id) DO NOTHING`;
    fault(input.faultAfter,"report");
    for(const ref of input.snapshotRefs){
      if(!Number.isSafeInteger(ref.actualCostMicros)||ref.actualCostMicros<0||!Number.isSafeInteger(ref.allocatedCostMicros)||ref.allocatedCostMicros<0||!Number.isSafeInteger(ref.avoidedCostMicros)||ref.avoidedCostMicros<0) throw new Error("Snapshot costs must be non-negative integers.");
      const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,report.evidenceCutoffAt]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${report.evidenceCutoffAt},${ref.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash}
        FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed'
        ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const storedRefs=await tx<Array<{snapshot_id:string}>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;
    if(storedRefs.length!==input.snapshotRefs.length) throw new Error("Every report snapshot must be atomically bound.");
    fault(input.faultAfter,"refs");
    await tx`UPDATE scan_jobs SET stage=${report.commercialOutcome},progress=CASE WHEN ${report.commercialOutcome}='failed' THEN progress ELSE 100 END,
      planned_pages=${input.coverage.plannedPages},successful_pages=${input.coverage.successfulPages},failed_pages=${input.coverage.failedPages},lease_owner=NULL,lease_expires_at=NULL,
      error_code=CASE WHEN ${report.commercialOutcome}='failed' THEN 'public_source_coverage_failed' ELSE NULL END,
      public_error=CASE WHEN ${report.commercialOutcome}='failed' THEN 'The public-source evidence was not sufficient for a usable report.' ELSE NULL END,updated_at=now() WHERE id=${report.jobId}`;
    fault(input.faultAfter,"job");
    if(job.credit_reservation_id){
      const target=report.commercialOutcome==="completed"?"settled":"refunded";
      const credit=(await tx<Array<{id:string;status:string;access_key_id:string;credits:number;job_id:string|null}>>`SELECT id,status,access_key_id,credits,job_id FROM credit_ledger WHERE id=${job.credit_reservation_id} FOR UPDATE`)[0];
      if(!credit||credit.status!=="reserved"||(credit.job_id&&credit.job_id!==report.jobId)) throw new Error("V2 credit reservation cannot be terminalized.");
      if(target==="settled") await tx`UPDATE credit_ledger SET status='settled',settled_at=now(),refunded_at=NULL WHERE id=${credit.id}`;
      else { await tx`UPDATE access_keys SET credits_remaining=credits_remaining+${credit.credits},status=CASE WHEN status='exhausted' THEN 'active' ELSE status END WHERE id=${credit.access_key_id}`; await tx`UPDATE credit_ledger SET status='refunded',refunded_at=now(),settled_at=NULL WHERE id=${credit.id}`; }
    }
    fault(input.faultAfter,"credit");
    let refundId:string|null=null;
    if(report.commercialOutcome!=="completed"){
      await tx`INSERT INTO payment_refunds(id,order_id,provider,reason,amount_minor,currency,state,idempotency_key) VALUES(${randomUUID()},${order.id},${order.provider},${report.commercialOutcome==="completed_limited"?"completed_limited":"report_failed"},${order.amount_minor},${order.currency},'pending',${`full_refund/${order.id}`}) ON CONFLICT(order_id) DO NOTHING`;
      refundId=(await tx<Array<{id:string}>>`SELECT id FROM payment_refunds WHERE order_id=${order.id}`)[0]!.id;
    }
    await tx`UPDATE payment_orders SET fulfillment_status=${report.commercialOutcome},fulfilled_at=COALESCE(fulfilled_at,now()),refund_status=CASE WHEN ${report.commercialOutcome}='completed' THEN refund_status WHEN refund_status='not_required' THEN 'pending' ELSE refund_status END,delivery_status=CASE WHEN delivery_status='not_queued' THEN 'queued' ELSE delivery_status END,updated_at=now() WHERE id=${order.id}`;
    fault(input.faultAfter,"order");
    const template=report.commercialOutcome==="completed"?"report_ready":report.commercialOutcome==="completed_limited"?"limited_report_refund":"report_failed_refund";
    const businessKey=`${template}/${order.id}/v1`, emailId=randomUUID();
    await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state) VALUES(${emailId},${order.id},${report.reportId},${template},'v1',${order.report_locale},${order.id},'resend',${businessKey},'queued') ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const storedEmail=(await tx<Array<{id:string}>>`SELECT id FROM email_deliveries WHERE business_idempotency_key=${businessKey}`)[0];
    if(!storedEmail) throw new Error("Terminal email intent was not persisted.");
    fault(input.faultAfter,"email");
    return {report,orderId:order.id,refundId,emailDeliveryId:storedEmail.id};
  });
}
function assertCoverage(value:ScanJobCoverage){for(const item of Object.values(value))if(!Number.isSafeInteger(item)||item<0)throw new Error("Coverage counts must be non-negative integers.");}
function fault(actual:string|undefined,expected:string){if(actual===expected)throw new Error(`Injected fault after ${expected}.`);}
function sha(parts:string[]):string{return createHash("sha256").update(parts.join("\0")).digest("hex");}
