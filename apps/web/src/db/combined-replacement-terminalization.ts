import { createHash, randomUUID } from "node:crypto";
import { requireReadyCombinedGeoReportV3, type CombinedGeoReportV3 } from "@open-geo-console/ai-report-engine";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";
import { JobTransitionService } from "@/worker/job-transition-service";
import { ensureDatabase, getSqlClient } from "./index";
import type { PaidPublicSourceSnapshotRef } from "./public-source-commerce";
import { combinedV3CommercialOutcome, snapshotReferenceBinding } from "./combined-correction-terminalization";

export function terminalizeCombinedReplacement(
  input: Parameters<typeof terminalizeCombinedReplacementUnsafe>[0]
): ReturnType<typeof terminalizeCombinedReplacementUnsafe> {
  return runReportV4GuardedOperation({
    guardSite: "replacement_terminalize",
    delegate: () => terminalizeCombinedReplacementUnsafe(input)
  });
}

async function terminalizeCombinedReplacementUnsafe(input: {
  report: unknown;
  workerId: string;
  checkpointIdentityHash: string;
  snapshotRefs: readonly PaidPublicSourceSnapshotRef[];
  htmlSha256: string;
  pdfSha256: string;
  pdfStorageKey: string;
  pageCount: number;
}): Promise<{ report: CombinedGeoReportV3; emailDeliveryId: string }> {
  const report = requireReadyCombinedGeoReportV3(input.report);
  if (!input.workerId.trim() || !input.checkpointIdentityHash.trim() || input.pageCount < 5) throw new Error("Replacement readiness identity is incomplete.");
  if (combinedV3CommercialOutcome(report.answerCards) === "failed") throw new Error("Replacement activation requires a deliverable three-question report.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<{
      execution_state: string; checkpoint_revision: number; lease_owner: string | null; lease_expires_at: string | null;
      credit_reservation_id: string | null; checkpoint: Record<string, unknown>; replacement_fulfillment_id: string | null;
      business_question_set_id: string | null; artifact_contract: string | null; reason: string;
    }>>`SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,replacement_fulfillment_id,
      business_question_set_id,artifact_contract,reason FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const checkpoint = job?.checkpoint.answerFirstV3 as { identityHash?: unknown } | undefined;
    if (!job || job.execution_state !== "running" || job.lease_owner !== input.workerId || !job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.now() ||
        job.reason !== "replacement_fulfillment" || !job.replacement_fulfillment_id || job.credit_reservation_id !== null ||
        job.business_question_set_id !== report.questionSetIdentity || job.artifact_contract !== "combined_geo_report_v3" || checkpoint?.identityHash !== input.checkpointIdentityHash) {
      throw new Error("Replacement activation requires its exact active non-billable leased V3 job.");
    }
    const replacement = (await tx<Array<{
      id: string; order_id: string; original_failed_job_id: string; failed_artifact_revision_id: string; question_set_id: string; state: string;
    }>>`SELECT id,order_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,state
      FROM report_replacement_fulfillments WHERE id=${job.replacement_fulfillment_id} AND report_id=${report.reportId} FOR UPDATE`)[0];
    if (!replacement || replacement.order_id !== report.orderId || replacement.original_failed_job_id !== report.originalPaidJobId ||
        replacement.question_set_id !== report.questionSetIdentity || replacement.state === "completed") throw new Error("Replacement lineage changed before activation.");
    const original = (await tx<Array<{ stage: string; execution_state: string }>>`
      SELECT stage,execution_state FROM scan_jobs WHERE id=${replacement.original_failed_job_id} AND report_id=${report.reportId} FOR SHARE`)[0];
    const failedArtifact = (await tx<Array<{ status: string; artifact_contract: string }>>`
      SELECT status,artifact_contract FROM report_artifact_revisions WHERE id=${replacement.failed_artifact_revision_id}
        AND job_id=${replacement.original_failed_job_id} AND report_id=${report.reportId} FOR SHARE`)[0];
    if (!original || original.stage !== "failed" || original.execution_state !== "failed" || !failedArtifact ||
        !["pending", "failed"].includes(failedArtifact.status) || failedArtifact.artifact_contract !== "combined_geo_report_v3") {
      throw new Error("Original failed V3 lineage is no longer eligible for replacement activation.");
    }
    const order = (await tx<Array<{
      payment_status: string; fulfillment_status: string; refund_status: string; report_locale: string; courtesy_non_billable: boolean;
    }>>`SELECT payment_status,fulfillment_status,refund_status,report_locale,courtesy_non_billable FROM payment_orders
      WHERE id=${report.orderId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    if (!order || order.payment_status !== "paid" || order.fulfillment_status !== "failed" || !replacementRefundAllowsActivation(order.refund_status) || !order.courtesy_non_billable) {
      throw new Error("The original paid failure is not eligible for replacement activation.");
    }

    for (const ref of input.snapshotRefs) {
      const snapshot = (await tx<Array<{ completed_at: string }>>`SELECT completed_at FROM market_snapshot_questions
        WHERE id=${ref.snapshotId} AND cache_identity=${ref.cacheIdentity} AND status='completed'`)[0];
      if (!snapshot) throw new Error("The replacement snapshot is not complete and bindable.");
      const reference = snapshotReferenceBinding(report.evidenceCutoffAt, snapshot.completed_at);
      const bindingHash = sha([report.reportId, report.jobId, ref.snapshotId, ref.cacheIdentity, reference.evidenceCutoff]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${reference.evidenceCutoff},${reference.freshnessState},
          ${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash}
        FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed'
        ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const storedRefs = await tx<Array<{ snapshot_id: string }>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;
    if (storedRefs.length !== input.snapshotRefs.length) throw new Error("Every replacement snapshot must be atomically bound.");
    await tx`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
      VALUES(${report.artifactRevisionId},${report.reportId},${report.orderId},${report.jobId},${report.questionSetIdentity},${JSON.stringify(report)}::jsonb)`;
    const ready = await tx<Array<{ id: string }>>`UPDATE report_artifact_revisions SET status='ready',html_sha256=${input.htmlSha256},pdf_sha256=${input.pdfSha256},
      pdf_storage_key=${input.pdfStorageKey},payload_identity_hash=${sha([JSON.stringify(report)])},
      readiness=${JSON.stringify({ htmlCanonical: true, pageCount: input.pageCount, privateEvidenceReady: true })}::jsonb,ready_at=now()
      WHERE id=${report.artifactRevisionId} AND report_id=${report.reportId} AND job_id=${report.jobId}
        AND replacement_fulfillment_id=${replacement.id} AND revision_kind='replacement' AND status='pending' RETURNING id`;
    if (ready.length !== 1) throw new Error("The replacement artifact did not become ready.");
    const activated = await tx<Array<{ id: string }>>`UPDATE report_artifact_revisions SET status='active',activated_at=now()
      WHERE id=${report.artifactRevisionId} AND status='ready' RETURNING id`;
    if (activated.length !== 1) throw new Error("The ready replacement artifact could not be activated.");
    await tx`UPDATE scan_reports SET active_artifact_revision_id=${report.artifactRevisionId} WHERE id=${report.reportId}`;
    await tx`UPDATE report_replacement_fulfillments SET state='completed',active_artifact_revision_id=${report.artifactRevisionId},completed_at=now()
      WHERE id=${replacement.id}`;
    await tx`UPDATE scan_jobs SET stage='completed',execution_state='completed',current_phase='terminalization',progress=100,
      lease_owner=NULL,lease_expires_at=NULL,error_code=NULL,public_error=NULL,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx, { jobId: report.jobId, fromState: job.execution_state, toState: "completed", phase: "terminalization",
      checkpointRevision: job.checkpoint_revision, reasonCode: "combined_replacement_activated" });
    const emailId = randomUUID();
    const businessKey = `replacement_report_ready/${report.artifactRevisionId}/v1`;
    await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state)
      VALUES(${emailId},${report.orderId},${report.reportId},'replacement_report_ready','v1',${order.report_locale},${report.orderId},'resend',${businessKey},'queued')
      ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const email = (await tx<Array<{ id: string }>>`SELECT id FROM email_deliveries WHERE business_idempotency_key=${businessKey}`)[0];
    if (!email) throw new Error("Replacement completion email was not persisted.");
    return { report, emailDeliveryId: email.id };
  });
}

function sha(parts: string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }

export function replacementRefundAllowsActivation(status: string): boolean {
  return ["pending", "submitted", "refunded", "failed"].includes(status);
}
