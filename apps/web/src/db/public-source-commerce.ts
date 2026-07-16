import { createHash, createHmac, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { normalizeReportLanguage, parseCombinedGeoReportV4, parseRecommendationForensicReportV2, type CombinedGeoReportV4, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";
import { hmacSecret, requireSecret } from "./secrets";
import { prepareSourceForensicReportRow } from "./source-forensic-reports";
import { snapshotReferenceBinding } from "./combined-correction-terminalization";
import type { ScanJobCoverage } from "./jobs";
import { JobTransitionService } from "@/worker/job-transition-service";
import {
  assertReportV4DiagnosisEnhancementJobIdentity,
  buildReportV4DiagnosisEnhancementJob,
  REPORT_V4_DIAGNOSIS_INITIAL_PHASE,
  type ReportV4Locale,
  type ReportV4ProductionEnhancementJob,
  type ReportV4ProductionLineage
} from "./report-v4-production-jobs";

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
    const job = (await tx<Array<{ id:string;report_id:string;stage:string;execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;product_contract:string;fulfillment_methodology:string;recommendation_report_version:number }>>`
      SELECT id,report_id,stage,execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,product_contract,fulfillment_methodology,recommendation_report_version
      FROM scan_jobs WHERE id=${report.jobId} FOR UPDATE`)[0];
    if (!job || job.report_id!==report.reportId || job.product_contract!=="recommendation_forensics_v1" || job.fulfillment_methodology!==report.methodology || Number(job.recommendation_report_version)!==2 ||
        job.execution_state!=="running" || job.lease_owner!==input.workerId || !job.lease_expires_at || Date.parse(job.lease_expires_at)<=Date.now() || ["completed","completed_limited","failed"].includes(job.stage)) throw new Error("V2 terminalization requires its exact active leased job.");
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
      const snapshot=(await tx<Array<{completed_at:string}>>`SELECT completed_at FROM market_snapshot_questions
        WHERE id=${ref.snapshotId} AND cache_identity=${ref.cacheIdentity} AND status='completed'`)[0];
      if(!snapshot)throw new Error("The public-source snapshot is not complete and bindable.");
      const binding=snapshotReferenceBinding(report.evidenceCutoffAt,snapshot.completed_at);
      const bindingHash=sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,binding.evidenceCutoff]);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        SELECT ${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},snapshot.id,snapshot.cache_identity,${binding.evidenceCutoff},${binding.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${bindingHash}
        FROM market_snapshot_questions snapshot WHERE snapshot.id=${ref.snapshotId} AND snapshot.cache_identity=${ref.cacheIdentity} AND snapshot.status='completed'
        ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const storedRefs=await tx<Array<{snapshot_id:string}>>`SELECT snapshot_id FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;
    if(storedRefs.length!==input.snapshotRefs.length) throw new Error("Every report snapshot must be atomically bound.");
    fault(input.faultAfter,"refs");
    await tx`UPDATE scan_jobs SET stage=${report.commercialOutcome},execution_state=${report.commercialOutcome==='failed'?'failed':'completed'},current_phase='terminalization',retry_not_before=NULL,repair_reason_code=NULL,repair_deadline_at=NULL,progress=CASE WHEN ${report.commercialOutcome}='failed' THEN progress ELSE 100 END,
      planned_pages=${input.coverage.plannedPages},successful_pages=${input.coverage.successfulPages},failed_pages=${input.coverage.failedPages},lease_owner=NULL,lease_expires_at=NULL,
      error_code=CASE WHEN ${report.commercialOutcome}='failed' THEN 'public_source_coverage_failed' ELSE NULL END,
      public_error=CASE WHEN ${report.commercialOutcome}='failed' THEN 'The public-source evidence was not sufficient for a usable report.' ELSE NULL END,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx, { jobId: report.jobId, fromState: job.execution_state,
      toState: report.commercialOutcome==='failed'?'failed':'completed', phase: 'terminalization',
      checkpointRevision: job.checkpoint_revision, reasonCode: 'public_source_terminalization' });
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

export async function terminalizePaidReportV4Core(input: {
  report: unknown;
  workerId: string;
  faultAfter?: "job" | "credit" | "refund" | "order" | "access" | "email" | "enhancement";
  pdfSha256?: never;
  pdfStorageKey?: never;
  pageCount?: never;
}): Promise<{
  report: CombinedGeoReportV4;
  outcome: "completed" | "completed_limited";
  orderId: string;
  refundId: string | null;
  accessTokenId: string;
  emailDeliveryId: string;
  enhancementJobId: string;
}> {
  if (["pdfSha256", "pdfStorageKey", "pageCount"].some((field) => Object.hasOwn(input, field))) {
    throw new Error("V4 commercial terminalization rejects every PDF readiness input.");
  }
  const report = parseCombinedGeoReportV4(input.report);
  if (!input.workerId.trim()) throw new Error("A V4 terminalization worker identity is required.");
  const outcome = requireV4CommerceOutcome(report.status);
  if (report.questions.some((question) => question.diagnosis !== undefined)) {
    throw new Error("A V4 diagnosis enhancement cannot trigger commercial terminalization.");
  }
  const tokenSecret = requireSecret("OGC_TOKEN_HASH_SECRET");
  await ensureDatabase();

  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-commerce:${report.reportId}`},0))`;
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-enhancement:${report.reportId}`},0))`;
    const artifact = (await tx<Array<V4ArtifactCommerceRow>>`
      SELECT core.id,core.report_id,core.order_id,core.job_id,core.revision_kind,core.artifact_contract,
        core.status,core.html_sha256,core.pdf_sha256,core.pdf_storage_key,core.ready_at,core.config_snapshot_id,
        combined.report_id AS combined_report_id,combined.order_id AS combined_order_id,
        combined.job_id AS combined_job_id,combined.question_set_id,combined.payload,
        scan.active_artifact_revision_id,scan.report_locale AS scan_report_locale,
        config.report_id AS config_report_id,config.order_id AS config_order_id,config.core_job_id AS config_core_job_id,
        active.revision_kind AS active_revision_kind,active.source_artifact_revision_id AS active_source_artifact_revision_id,
        active.artifact_contract AS active_artifact_contract,active.status AS active_status,
        active.order_id AS active_order_id,active.report_id AS active_report_id,
        active.html_sha256 AS active_html_sha256,active.pdf_sha256 AS active_pdf_sha256,
        active.pdf_storage_key AS active_pdf_storage_key,active.ready_at AS active_ready_at
      FROM report_artifact_revisions core
      JOIN combined_geo_reports combined ON combined.artifact_revision_id=core.id
      JOIN scan_reports scan ON scan.id=core.report_id
      LEFT JOIN report_v4_config_snapshots config ON config.id=core.config_snapshot_id
      LEFT JOIN report_artifact_revisions active ON active.id=scan.active_artifact_revision_id
      WHERE core.id=${report.artifactRevisionId} AND core.report_id=${report.reportId}
      FOR UPDATE OF core,combined,scan
    `)[0];
    if (!artifact) throw new Error("The exact persisted V4 core artifact is required.");
    assertV4CoreArtifact(artifact, report);

    const job = (await tx<Array<V4JobCommerceRow>>`
      SELECT id,report_id,site_snapshot_id,locale,stage,execution_state,checkpoint_revision,lease_owner,lease_expires_at,
        credit_reservation_id,product_contract,fulfillment_methodology,recommendation_report_version,
        artifact_contract,business_question_set_id,reason,correction_id,replacement_fulfillment_id
      FROM scan_jobs WHERE id=${artifact.job_id} AND report_id=${report.reportId} FOR UPDATE
    `)[0];
    if (!job || job.product_contract !== "recommendation_forensics_v1" ||
        job.fulfillment_methodology !== "two_stage_geo_report_v4" || Number(job.recommendation_report_version) !== 4 ||
        job.artifact_contract !== "combined_geo_report_v4" || job.business_question_set_id !== artifact.question_set_id ||
        !v4LocaleMatches(report.locale, job.locale) ||
        job.reason !== "standard" || job.correction_id !== null || job.replacement_fulfillment_id !== null ||
        !job.site_snapshot_id || !job.credit_reservation_id) {
      throw new Error("V4 commercial terminalization requires its exact standard paid core job.");
    }
    const order = (await tx<Array<V4OrderCommerceRow>>`
      SELECT id,report_id,site_snapshot_id,fulfillment_job_id,provider,amount_minor,currency,report_locale,product_code,
        fulfillment_methodology,recommendation_report_version,business_question_set_id,payment_status,
        fulfillment_status,refund_status,delivery_status
      FROM payment_orders WHERE id=${artifact.order_id} FOR UPDATE
    `)[0];
    if (!order || order.report_id !== report.reportId || order.site_snapshot_id !== job.site_snapshot_id || order.fulfillment_job_id !== job.id ||
        order.product_code !== "recommendation_forensics_v1" || order.fulfillment_methodology !== "two_stage_geo_report_v4" ||
        Number(order.recommendation_report_version) !== 4 || order.business_question_set_id !== artifact.question_set_id ||
        !v4LocaleMatches(report.locale, order.report_locale) || order.payment_status !== "paid") {
      throw new Error("V4 commercial terminalization requires its exact verified paid order.");
    }
    const credit = (await tx<Array<V4CreditCommerceRow>>`
      SELECT id,status,access_key_id,credits,job_id,report_id,payment_order_id
      FROM credit_ledger WHERE id=${job.credit_reservation_id} FOR UPDATE
    `)[0];
    if (!credit || credit.job_id !== job.id || credit.report_id !== report.reportId ||
        credit.payment_order_id !== order.id || !Number.isSafeInteger(credit.credits) || credit.credits <= 0) {
      throw new Error("The V4 paid credit reservation identity is invalid.");
    }

    const expectedCreditStatus = outcome === "completed" ? "settled" : "refunded";
    const firstRun = job.execution_state === "running" && job.lease_owner === input.workerId &&
      Boolean(job.lease_expires_at) && Date.parse(job.lease_expires_at!) > Date.now() &&
      !["completed", "completed_limited", "failed"].includes(job.stage) && credit.status === "reserved" &&
      ["queued", "processing"].includes(order.fulfillment_status) && order.refund_status === "not_required";
    const idempotentReentry = job.execution_state === "completed" && job.stage === outcome &&
      order.fulfillment_status === outcome && credit.status === expectedCreditStatus;
    if (!firstRun && !idempotentReentry) throw new Error("V4 commercial state conflicts with this core artifact outcome.");
    assertV4CoreActivationLineage(artifact, firstRun);

    if (firstRun) {
      const jobs = await tx<Array<{ id: string }>>`
        UPDATE scan_jobs SET stage=${outcome},execution_state='completed',current_phase='terminalization',progress=100,
          retry_not_before=NULL,repair_reason_code=NULL,repair_deadline_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
          error_code=NULL,public_error=NULL,updated_at=now()
        WHERE id=${job.id} AND execution_state='running' AND credit_reservation_id=${credit.id}
        RETURNING id
      `;
      if (jobs.length !== 1) throw new Error("The V4 core job could not be terminalized exactly once.");
      await JobTransitionService.appendTransition(tx, {
        jobId: job.id,
        fromState: job.execution_state,
        toState: "completed",
        phase: "terminalization",
        checkpointRevision: job.checkpoint_revision,
        reasonCode: "report_v4_core_commerce_terminalized"
      });
      fault(input.faultAfter, "job");

      if (outcome === "completed") {
        const settled = await tx<Array<{ id: string }>>`
          UPDATE credit_ledger SET status='settled',settled_at=now(),refunded_at=NULL
          WHERE id=${credit.id} AND status='reserved' RETURNING id
        `;
        if (settled.length !== 1) throw new Error("The V4 paid credit could not be settled exactly once.");
      } else {
        const keys = await tx<Array<{ id: string }>>`
          UPDATE access_keys SET credits_remaining=credits_remaining+${credit.credits},
            status=CASE WHEN status='exhausted' THEN 'active' ELSE status END
          WHERE id=${credit.access_key_id} RETURNING id
        `;
        if (keys.length !== 1) throw new Error("The V4 limited-report credit could not be returned.");
        const refunded = await tx<Array<{ id: string }>>`
          UPDATE credit_ledger SET status='refunded',refunded_at=now(),settled_at=NULL
          WHERE id=${credit.id} AND status='reserved' RETURNING id
        `;
        if (refunded.length !== 1) throw new Error("The V4 paid credit could not be refunded exactly once.");
      }
      fault(input.faultAfter, "credit");

      if (outcome === "completed_limited") {
        await tx`INSERT INTO payment_refunds(id,order_id,provider,reason,amount_minor,currency,state,idempotency_key)
          VALUES(${randomUUID()},${order.id},${order.provider},'completed_limited',${order.amount_minor},${order.currency},'pending',${`full_refund/${order.id}`})
          ON CONFLICT(order_id) DO NOTHING`;
        fault(input.faultAfter, "refund");
      }
      const orders = await tx<Array<{ id: string }>>`
        UPDATE payment_orders SET fulfillment_status=${outcome},fulfilled_at=COALESCE(fulfilled_at,now()),
          refund_status=CASE WHEN ${outcome}='completed_limited' AND refund_status='not_required' THEN 'pending' ELSE refund_status END,
          delivery_status=CASE WHEN delivery_status='not_queued' THEN 'queued' ELSE delivery_status END,updated_at=now()
        WHERE id=${order.id} AND fulfillment_status IN ('queued','processing') RETURNING id
      `;
      if (orders.length !== 1) throw new Error("The V4 paid order could not be terminalized exactly once.");
      fault(input.faultAfter, "order");
    }

    const refundId = await requireV4RefundTruth(tx, order, outcome);
    const template = outcome === "completed" ? "report_ready" : "limited_report_refund";
    const businessKey = `${template}/${report.artifactRevisionId}/v1`;
    const token = deterministicReportAccessToken(report.reportId, businessKey, tokenSecret);
    const tokenId = randomUUID();
    await tx`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
      VALUES(${tokenId},${report.reportId},${token.displayPrefix},${hmacSecret(token.raw, tokenSecret)},'combined_geo_report_v4',now()+interval '30 days')
      ON CONFLICT(token_hmac) DO NOTHING`;
    const access = (await tx<Array<{ id: string; report_id: string; artifact_scope: string }>>`
      SELECT id,report_id,artifact_scope FROM report_access_tokens
      WHERE token_hmac=${hmacSecret(token.raw, tokenSecret)} FOR UPDATE
    `)[0];
    if (!access || access.report_id !== report.reportId || access.artifact_scope !== "combined_geo_report_v4") {
      throw new Error("The V4 report access token identity conflicts with the core artifact.");
    }
    fault(input.faultAfter, "access");

    const emailId = randomUUID();
    await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state)
      VALUES(${emailId},${order.id},${report.reportId},${template},'v1',${order.report_locale},${order.id},'resend',${businessKey},'queued')
      ON CONFLICT(business_idempotency_key) DO NOTHING`;
    const email = (await tx<Array<{ id: string; order_id: string; report_id: string; template_type: string }>>`
      SELECT id,order_id,report_id,template_type FROM email_deliveries
      WHERE business_idempotency_key=${businessKey} FOR UPDATE
    `)[0];
    if (!email || email.order_id !== order.id || email.report_id !== report.reportId || email.template_type !== template) {
      throw new Error("The V4 terminal email identity conflicts with the core artifact.");
    }
    fault(input.faultAfter, "email");
    const enhancement = await ensurePaidReportV4EnhancementJob(tx, {
      reportId: report.reportId,
      orderId: order.id,
      coreJobId: job.id,
      coreArtifactRevisionId: report.artifactRevisionId,
      configSnapshotId: artifact.config_snapshot_id!,
      siteSnapshotId: job.site_snapshot_id,
      questionSetId: artifact.question_set_id,
      locale: normalizeReportLanguage(report.locale) as ReportV4Locale
    }, firstRun);
    if (firstRun) fault(input.faultAfter, "enhancement");
    return {
      report, outcome, orderId: order.id, refundId, accessTokenId: access.id,
      emailDeliveryId: email.id, enhancementJobId: enhancement.id
    };
  });
}

export interface TerminalizeUnavailablePaidReportV4CoreInput {
  reportId: string;
  coreJobId: string;
  orderId: string;
  siteSnapshotId: string;
  questionSetId: string;
  configSnapshotId: string;
  locale: string;
  workerId: string;
  faultAfter?: "job" | "access" | "credit" | "order" | "refund" | "email";
  pdfSha256?: never;
  pdfStorageKey?: never;
  pageCount?: never;
}

export interface UnavailablePaidReportV4CoreResult {
  outcome: "unavailable";
  reportId: string;
  coreJobId: string;
  orderId: string;
  siteSnapshotId: string;
  questionSetId: string;
  configSnapshotId: string;
  creditReservationId: string;
  refundId: string;
  emailDeliveryId: string;
}

/**
 * Atomically fails and refunds one paid V4 standard core after all three
 * independently checkpointed questions have reached `unavailable`.
 *
 * This boundary deliberately accepts no report payload or artifact identity:
 * an unavailable core has no customer artifact and therefore no report access
 * token. Zero-page admission failures are rejected before any write.
 */
export async function terminalizeUnavailablePaidReportV4Core(
  input: TerminalizeUnavailablePaidReportV4CoreInput
): Promise<UnavailablePaidReportV4CoreResult> {
  if (["pdfSha256", "pdfStorageKey", "pageCount"].some((field) => Object.hasOwn(input, field))) {
    throw new Error("V4 unavailable commercial terminalization rejects every PDF readiness input.");
  }
  const identity = {
    reportId: requiredV4Identity(input.reportId, "report"),
    coreJobId: requiredV4Identity(input.coreJobId, "core job"),
    orderId: requiredV4Identity(input.orderId, "order"),
    siteSnapshotId: requiredV4Identity(input.siteSnapshotId, "site snapshot"),
    questionSetId: requiredV4Identity(input.questionSetId, "question set"),
    configSnapshotId: requiredV4Identity(input.configSnapshotId, "configuration snapshot"),
    locale: normalizeReportLanguage(input.locale),
    workerId: requiredV4Identity(input.workerId, "worker")
  };
  await ensureDatabase();

  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-commerce:${identity.reportId}`},0))`;

    const job = (await tx<Array<V4UnavailableJobRow>>`
      SELECT id,report_id,site_snapshot_id,locale,stage,execution_state,checkpoint_revision,
        lease_owner,lease_expires_at,credit_reservation_id,product_contract,fulfillment_methodology,
        recommendation_report_version,artifact_contract,business_question_set_id,reason,
        correction_id,replacement_fulfillment_id
      FROM scan_jobs WHERE id=${identity.coreJobId} AND report_id=${identity.reportId} FOR UPDATE
    `)[0];
    if (!job || job.site_snapshot_id !== identity.siteSnapshotId || job.product_contract !== "recommendation_forensics_v1" ||
        job.fulfillment_methodology !== "two_stage_geo_report_v4" || Number(job.recommendation_report_version) !== 4 ||
        job.artifact_contract !== "combined_geo_report_v4" || job.business_question_set_id !== identity.questionSetId ||
        !v4LocaleMatches(identity.locale, job.locale) || job.reason !== "standard" || job.correction_id !== null ||
        job.replacement_fulfillment_id !== null || !job.credit_reservation_id) {
      throw new Error("V4 unavailable terminalization requires its exact standard paid core job lineage.");
    }

    const order = (await tx<Array<V4OrderCommerceRow>>`
      SELECT id,report_id,site_snapshot_id,fulfillment_job_id,provider,amount_minor,currency,report_locale,
        product_code,fulfillment_methodology,recommendation_report_version,business_question_set_id,
        payment_status,fulfillment_status,refund_status,delivery_status
      FROM payment_orders WHERE id=${identity.orderId} FOR UPDATE
    `)[0];
    if (!order || order.report_id !== identity.reportId || order.site_snapshot_id !== identity.siteSnapshotId ||
        order.fulfillment_job_id !== job.id || order.product_code !== "recommendation_forensics_v1" ||
        order.fulfillment_methodology !== "two_stage_geo_report_v4" || Number(order.recommendation_report_version) !== 4 ||
        order.business_question_set_id !== identity.questionSetId || !v4LocaleMatches(identity.locale, order.report_locale) ||
        order.payment_status !== "paid") {
      throw new Error("V4 unavailable terminalization requires its exact verified paid order lineage.");
    }

    const config = (await tx<Array<{ id: string; report_id: string; order_id: string; core_job_id: string; model_profile_hash: string }>>`
      SELECT id,report_id,order_id,core_job_id,model_profile_hash FROM report_v4_config_snapshots
      WHERE id=${identity.configSnapshotId} FOR UPDATE
    `)[0];
    if (!config || config.report_id !== identity.reportId || config.order_id !== identity.orderId || config.core_job_id !== identity.coreJobId) {
      throw new Error("V4 unavailable terminalization requires its exact immutable configuration snapshot lineage.");
    }

    const snapshot = (await tx<Array<{ id: string; report_id: string; status: string; content_identity_hash: string | null; analyzable_page_count: number }>>`
      SELECT id,report_id,status,content_identity_hash,analyzable_page_count FROM report_v4_site_snapshots
      WHERE id=${identity.siteSnapshotId} FOR UPDATE
    `)[0];
    if (!snapshot || snapshot.report_id !== identity.reportId || !["completed", "completed_limited"].includes(snapshot.status) ||
        !snapshot.content_identity_hash || !Number.isSafeInteger(snapshot.analyzable_page_count) ||
        snapshot.analyzable_page_count < 1 || snapshot.analyzable_page_count > 50) {
      throw new Error("V4 all-questions-unavailable terminalization requires an analyzable completed site snapshot.");
    }

    const questionSet = (await tx<Array<{ id: string; report_id: string; order_id: string | null; locale: string; status: string }>>`
      SELECT id,report_id,order_id,locale,status FROM report_business_question_sets
      WHERE id=${identity.questionSetId} FOR UPDATE
    `)[0];
    if (!questionSet || questionSet.report_id !== identity.reportId || questionSet.order_id !== identity.orderId ||
        questionSet.status !== "locked" || !v4LocaleMatches(identity.locale, questionSet.locale)) {
      throw new Error("V4 unavailable terminalization requires the exact locked paid question set.");
    }
    const questions = await tx<Array<{ id: string; ordinal: number }>>`
      SELECT id,ordinal FROM report_business_questions WHERE question_set_id=${identity.questionSetId}
      ORDER BY ordinal FOR UPDATE
    `;
    const checkpoints = await tx<Array<V4UnavailableQuestionCheckpointRow>>`
      SELECT identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,
        model_config_identity_hash,provider_call_count,answer_payload,answer_content_hash
      FROM report_v4_question_checkpoints WHERE job_id=${identity.coreJobId} AND report_id=${identity.reportId}
      ORDER BY ordinal FOR UPDATE
    `;
    assertAllThreeV4QuestionsUnavailable(questions, checkpoints, identity, config.model_profile_hash);

    const delivery = (await tx<Array<{ active_artifact_revision_id: string | null; artifacts: number; combined_reports: number; access_tokens: number }>>`
      SELECT scan.active_artifact_revision_id,
        (SELECT count(*)::int FROM report_artifact_revisions WHERE report_id=${identity.reportId}) AS artifacts,
        (SELECT count(*)::int FROM combined_geo_reports WHERE report_id=${identity.reportId}) AS combined_reports,
        (SELECT count(*)::int FROM report_access_tokens WHERE report_id=${identity.reportId}) AS access_tokens
      FROM scan_reports scan WHERE scan.id=${identity.reportId} FOR UPDATE
    `)[0];
    if (!delivery || delivery.active_artifact_revision_id !== null || delivery.artifacts !== 0 ||
        delivery.combined_reports !== 0 || delivery.access_tokens !== 0) {
      throw new Error("An unavailable V4 core cannot have an artifact or report access token.");
    }

    const credit = (await tx<Array<V4CreditCommerceRow & {
      key_payment_order_id: string | null; key_status: string; key_credits_remaining: number;
    }>>`
      SELECT credit.id,credit.status,credit.access_key_id,credit.credits,credit.job_id,credit.report_id,
        credit.payment_order_id,keys.payment_order_id AS key_payment_order_id,keys.status AS key_status,
        keys.credits_remaining AS key_credits_remaining
      FROM credit_ledger credit JOIN access_keys keys ON keys.id=credit.access_key_id
      WHERE credit.id=${job.credit_reservation_id} FOR UPDATE OF credit,keys
    `)[0];
    if (!credit || credit.job_id !== job.id || credit.report_id !== identity.reportId ||
        credit.payment_order_id !== order.id || credit.key_payment_order_id !== order.id ||
        !Number.isSafeInteger(credit.credits) || credit.credits <= 0) {
      throw new Error("The V4 unavailable paid credit reservation identity is invalid.");
    }

    const firstRun = job.execution_state === "running" && job.lease_owner === identity.workerId &&
      Boolean(job.lease_expires_at) && Date.parse(job.lease_expires_at!) > Date.now() &&
      !["completed", "completed_limited", "failed"].includes(job.stage) && credit.status === "reserved" &&
      credit.key_status === "exhausted" && credit.key_credits_remaining === 0 &&
      ["queued", "processing"].includes(order.fulfillment_status) && order.refund_status === "not_required";
    const idempotentReentry = job.execution_state === "failed" && job.stage === "failed" && credit.status === "refunded" &&
      credit.key_status === "active" && credit.key_credits_remaining === credit.credits &&
      order.fulfillment_status === "failed" && order.refund_status !== "not_required";
    if (!firstRun && !idempotentReentry) {
      throw new Error("V4 unavailable commercial state conflicts with the current database truth.");
    }

    if (firstRun) {
      const jobs = await tx<Array<{ id: string }>>`
        UPDATE scan_jobs SET stage='failed',execution_state='failed',current_phase='terminalization',
          retry_not_before=NULL,repair_reason_code=NULL,repair_deadline_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
          error_code='report_v4_all_questions_unavailable',
          public_error='The three report questions could not be answered from the configured public-search model.',updated_at=now()
        WHERE id=${job.id} AND execution_state='running' AND credit_reservation_id=${credit.id} RETURNING id
      `;
      if (jobs.length !== 1) throw new Error("The unavailable V4 core job could not be failed exactly once.");
      await JobTransitionService.appendTransition(tx, {
        jobId: job.id,
        fromState: job.execution_state,
        toState: "failed",
        phase: "terminalization",
        checkpointRevision: job.checkpoint_revision,
        reasonCode: "report_v4_all_questions_unavailable"
      });
      fault(input.faultAfter, "job");

      const keys = await tx<Array<{ id: string }>>`
        UPDATE access_keys SET credits_remaining=credits_remaining+${credit.credits},
          status=CASE WHEN status='exhausted' THEN 'active' ELSE status END
        WHERE id=${credit.access_key_id} AND payment_order_id=${order.id} RETURNING id
      `;
      if (keys.length !== 1) throw new Error("The unavailable V4 internal credit could not be returned.");
      fault(input.faultAfter, "access");
      const credits = await tx<Array<{ id: string }>>`
        UPDATE credit_ledger SET status='refunded',refunded_at=now(),settled_at=NULL
        WHERE id=${credit.id} AND status='reserved' RETURNING id
      `;
      if (credits.length !== 1) throw new Error("The unavailable V4 paid credit could not be refunded exactly once.");
      fault(input.faultAfter, "credit");

      const orders = await tx<Array<{ id: string }>>`
        UPDATE payment_orders SET fulfillment_status='failed',fulfilled_at=COALESCE(fulfilled_at,now()),
          refund_status=CASE WHEN refund_status='not_required' THEN 'pending' ELSE refund_status END,
          delivery_status=CASE WHEN delivery_status='not_queued' THEN 'queued' ELSE delivery_status END,updated_at=now()
        WHERE id=${order.id} AND fulfillment_status IN ('queued','processing') RETURNING id
      `;
      if (orders.length !== 1) throw new Error("The unavailable V4 paid order could not be failed exactly once.");
      fault(input.faultAfter, "order");

      await tx`INSERT INTO payment_refunds(id,order_id,provider,reason,amount_minor,currency,state,idempotency_key)
        VALUES(${randomUUID()},${order.id},${order.provider},'report_failed',${order.amount_minor},${order.currency},'pending',${`full_refund/${order.id}`})
        ON CONFLICT(order_id) DO NOTHING`;
      fault(input.faultAfter, "refund");

      const businessKey = `report_failed_refund/${order.id}/v1`;
      await tx`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,business_idempotency_key,state)
        VALUES(${randomUUID()},${order.id},${identity.reportId},'report_failed_refund','v1',${order.report_locale},${order.id},'resend',${businessKey},'queued')
        ON CONFLICT(business_idempotency_key) DO NOTHING`;
      fault(input.faultAfter, "email");
    }

    const terminal = await requireUnavailableV4CommerceTruth(tx, identity.reportId, order, job.id);
    return {
      outcome: "unavailable",
      reportId: identity.reportId,
      coreJobId: identity.coreJobId,
      orderId: identity.orderId,
      siteSnapshotId: identity.siteSnapshotId,
      questionSetId: identity.questionSetId,
      configSnapshotId: identity.configSnapshotId,
      creditReservationId: credit.id,
      refundId: terminal.refundId,
      emailDeliveryId: terminal.emailDeliveryId
    };
  });
}

interface V4ArtifactCommerceRow {
  id: string; report_id: string; order_id: string; job_id: string; revision_kind: string; artifact_contract: string;
  status: string; html_sha256: string | null; pdf_sha256: string | null; pdf_storage_key: string | null; ready_at: string | null;
  config_snapshot_id: string | null; config_report_id: string | null; config_order_id: string | null; config_core_job_id: string | null;
  combined_report_id: string; combined_order_id: string; combined_job_id: string; question_set_id: string; payload: unknown;
  active_artifact_revision_id: string | null; scan_report_locale: string;
  active_revision_kind: string | null; active_source_artifact_revision_id: string | null; active_artifact_contract: string | null;
  active_status: string | null; active_order_id: string | null; active_report_id: string | null; active_html_sha256: string | null;
  active_pdf_sha256: string | null; active_pdf_storage_key: string | null; active_ready_at: string | null;
}
interface V4JobCommerceRow {
  id: string; report_id: string; site_snapshot_id: string | null; locale: string; stage: string; execution_state: string; checkpoint_revision: number; lease_owner: string | null;
  lease_expires_at: string | null; credit_reservation_id: string | null; product_contract: string; fulfillment_methodology: string | null;
  recommendation_report_version: number | null; artifact_contract: string | null; business_question_set_id: string | null;
  reason: string; correction_id: string | null; replacement_fulfillment_id: string | null;
}
interface V4OrderCommerceRow {
  id: string; report_id: string; site_snapshot_id: string | null; fulfillment_job_id: string | null; provider: string; amount_minor: number; currency: string;
  report_locale: string; product_code: string; fulfillment_methodology: string | null; recommendation_report_version: number | null;
  business_question_set_id: string | null; payment_status: string; fulfillment_status: string; refund_status: string; delivery_status: string;
}
interface V4CreditCommerceRow {
  id: string; status: string; access_key_id: string; credits: number; job_id: string | null; report_id: string; payment_order_id: string | null;
}
interface V4UnavailableJobRow extends V4JobCommerceRow {
  site_snapshot_id: string | null;
}
interface V4UnavailableQuestionCheckpointRow {
  identity_hash: string;
  report_id: string;
  job_id: string;
  question_set_id: string;
  question_id: string;
  snapshot_id: string;
  ordinal: number;
  state: string;
  model_config_identity_hash: string;
  provider_call_count: number;
  answer_payload: unknown;
  answer_content_hash: string | null;
}

async function ensurePaidReportV4EnhancementJob(
  tx: postgres.TransactionSql,
  lineage: ReportV4ProductionLineage,
  firstRun: boolean
): Promise<ReportV4ProductionEnhancementJob> {
  const expected = buildReportV4DiagnosisEnhancementJob(lineage);
  let rows = await loadPaidReportV4EnhancementJobs(tx, lineage.reportId);
  if (firstRun) {
    if (rows.length !== 0) {
      throw new Error("A V4 enhancement job cannot exist before its atomic core commercial terminalization.");
    }
    await tx`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,
      recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,
      current_phase,credit_reservation_id,correction_id,replacement_fulfillment_id)
      VALUES(${expected.id},${expected.reportId},${expected.siteSnapshotId},${expected.tier},${expected.productContract},
      ${expected.fulfillmentMethodology},${expected.recommendationReportVersion},${expected.artifactContract},
      ${expected.questionSetId},${expected.locale},${expected.reason},${expected.stage},${expected.executionState},
      ${REPORT_V4_DIAGNOSIS_INITIAL_PHASE},NULL,NULL,NULL)`;
    rows = await loadPaidReportV4EnhancementJobs(tx, lineage.reportId);
  }
  if (rows.length !== 1) {
    throw new Error(`Exactly one atomic V4 diagnosis enhancement job is required; found ${rows.length}.`);
  }
  const job = rows[0]!;
  assertReportV4DiagnosisEnhancementJobIdentity(job, lineage);
  return job;
}

async function loadPaidReportV4EnhancementJobs(
  tx: postgres.TransactionSql,
  reportId: string
): Promise<ReportV4ProductionEnhancementJob[]> {
  const rows = await tx<Array<{
    id:string;report_id:string;site_snapshot_id:string|null;tier:string;product_contract:string;
    fulfillment_methodology:string|null;recommendation_report_version:number|null;artifact_contract:string|null;
    business_question_set_id:string|null;locale:string;reason:string;stage:string;execution_state:string;
    credit_reservation_id:string|null;correction_id:string|null;replacement_fulfillment_id:string|null;
  }>>`SELECT id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,
    recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,
    credit_reservation_id,correction_id,replacement_fulfillment_id FROM scan_jobs
    WHERE report_id=${reportId} AND reason='v4_diagnosis_enhancement' FOR UPDATE`;
  return rows.map((row) => ({
    id:row.id,reportId:row.report_id,siteSnapshotId:row.site_snapshot_id as null,tier:row.tier,
    productContract:row.product_contract,fulfillmentMethodology:row.fulfillment_methodology,
    recommendationReportVersion:row.recommendation_report_version,artifactContract:row.artifact_contract,
    questionSetId:row.business_question_set_id,locale:row.locale,reason:row.reason,stage:row.stage,
    executionState:row.execution_state,creditReservationId:row.credit_reservation_id,
    correctionId:row.correction_id,replacementFulfillmentId:row.replacement_fulfillment_id
  }));
}

function assertV4CoreArtifact(row: V4ArtifactCommerceRow, report: CombinedGeoReportV4): void {
  if (!row.config_snapshot_id || row.config_report_id !== row.report_id || row.config_order_id !== row.order_id ||
      row.config_core_job_id !== row.job_id) {
    throw new Error("V4 commerce requires the core artifact's exact immutable configuration snapshot binding.");
  }
  if (row.id !== report.artifactRevisionId || row.report_id !== report.reportId || row.revision_kind !== "generation" ||
      row.combined_report_id !== row.report_id || row.combined_order_id !== row.order_id || row.combined_job_id !== row.job_id ||
      !v4LocaleMatches(report.locale, row.scan_report_locale) ||
      row.artifact_contract !== "combined_geo_report_v4" || !["active", "ready"].includes(row.status) ||
      !row.html_sha256 || !row.ready_at || row.pdf_sha256 !== null || row.pdf_storage_key !== null) {
    throw new Error("V4 commerce requires an HTML-only ready core generation revision.");
  }
  const persisted = parseCombinedGeoReportV4(row.payload);
  if (!isDeepStrictEqual(persisted, report)) throw new Error("The V4 core payload identity conflicts with its persisted artifact.");
}

function assertV4CoreActivationLineage(row: V4ArtifactCommerceRow, firstRun: boolean): void {
  if (row.status === "active" && row.active_artifact_revision_id === row.id) return;
  // A ready core behind an active enhancement is valid only for an already-terminal idempotent reentry.
  // The first commercial transition must observe the core itself as active before enhancement work may start.
  if (!firstRun && row.status === "ready" && row.active_artifact_revision_id &&
      row.active_revision_kind === "diagnosis_enhancement" && row.active_source_artifact_revision_id === row.id &&
      row.active_artifact_contract === "combined_geo_report_v4" && row.active_status === "active" &&
      row.active_order_id === row.order_id && row.active_report_id === row.report_id && row.active_html_sha256 && row.active_ready_at &&
      row.active_pdf_sha256 === null && row.active_pdf_storage_key === null) return;
  throw new Error("The V4 core artifact is not the active delivery revision or its exact enhanced ancestor.");
}

async function requireV4RefundTruth(
  tx: postgres.TransactionSql,
  order: V4OrderCommerceRow,
  outcome: "completed" | "completed_limited"
): Promise<string | null> {
  const currentOrders = await tx<Array<{ refund_status: string }>>`
    SELECT refund_status FROM payment_orders WHERE id=${order.id} FOR UPDATE
  `;
  const currentOrder = currentOrders[0];
  if (currentOrders.length !== 1 || !currentOrder) throw new Error("The V4 paid order refund truth is unavailable.");
  const refunds = await tx<Array<{ id: string; provider: string; reason: string; amount_minor: number; currency: string }>>`
    SELECT id,provider,reason,amount_minor,currency FROM payment_refunds WHERE order_id=${order.id} FOR UPDATE
  `;
  if (outcome === "completed") {
    if (refunds.length !== 0 || currentOrder.refund_status !== "not_required") throw new Error("A completed V4 order cannot carry refund side effects.");
    return null;
  }
  const refund = refunds[0];
  if (refunds.length !== 1 || !refund || refund.provider !== order.provider || refund.reason !== "completed_limited" ||
      Number(refund.amount_minor) !== Number(order.amount_minor) || refund.currency !== order.currency || currentOrder.refund_status === "not_required") {
    throw new Error("The V4 limited-report refund truth conflicts with the paid order.");
  }
  return refund.id;
}

function assertAllThreeV4QuestionsUnavailable(
  questions: readonly { id: string; ordinal: number }[],
  checkpoints: readonly V4UnavailableQuestionCheckpointRow[],
  identity: {
    reportId: string; coreJobId: string; siteSnapshotId: string; questionSetId: string;
  },
  modelProfileHash: string
): void {
  if (questions.length !== 3 || checkpoints.length !== 3) {
    throw new Error("V4 unavailable terminalization requires exactly three locked question checkpoints.");
  }
  for (const ordinal of [1, 2, 3]) {
    const question = questions[ordinal - 1];
    const checkpoint = checkpoints[ordinal - 1];
    if (!question || !checkpoint || question.ordinal !== ordinal || checkpoint.ordinal !== ordinal ||
        checkpoint.question_id !== question.id || checkpoint.report_id !== identity.reportId ||
        checkpoint.job_id !== identity.coreJobId || checkpoint.question_set_id !== identity.questionSetId ||
        checkpoint.snapshot_id !== identity.siteSnapshotId || checkpoint.state !== "unavailable" ||
        checkpoint.model_config_identity_hash !== modelProfileHash || !Number.isSafeInteger(checkpoint.provider_call_count) ||
        checkpoint.provider_call_count < 0 || checkpoint.provider_call_count > 2 ||
        checkpoint.answer_payload !== null || checkpoint.answer_content_hash !== null) {
      throw new Error("All three exact V4 question checkpoints must be terminal unavailable before refund.");
    }
  }
}

async function requireUnavailableV4CommerceTruth(
  tx: postgres.TransactionSql,
  reportId: string,
  order: V4OrderCommerceRow,
  coreJobId: string
): Promise<{ refundId: string; emailDeliveryId: string }> {
  const current = (await tx<Array<{
    job_stage: string; execution_state: string; credit_status: string; fulfillment_status: string; refund_status: string;
    artifacts: number; combined_reports: number; access_tokens: number;
  }>>`
    SELECT job.stage AS job_stage,job.execution_state,credit.status AS credit_status,
      orders.fulfillment_status,orders.refund_status,
      (SELECT count(*)::int FROM report_artifact_revisions WHERE report_id=${reportId}) AS artifacts,
      (SELECT count(*)::int FROM combined_geo_reports WHERE report_id=${reportId}) AS combined_reports,
      (SELECT count(*)::int FROM report_access_tokens WHERE report_id=${reportId}) AS access_tokens
    FROM scan_jobs job
    JOIN credit_ledger credit ON credit.id=job.credit_reservation_id
    JOIN payment_orders orders ON orders.id=${order.id}
    WHERE job.id=${coreJobId} FOR UPDATE OF job,credit,orders
  `)[0];
  if (!current || current.job_stage !== "failed" || current.execution_state !== "failed" || current.credit_status !== "refunded" ||
      current.fulfillment_status !== "failed" || current.refund_status === "not_required" || current.artifacts !== 0 ||
      current.combined_reports !== 0 || current.access_tokens !== 0) {
    throw new Error("The unavailable V4 terminal commercial truth is incomplete or conflicts.");
  }
  const refunds = await tx<Array<{ id: string; provider: string; reason: string; amount_minor: number; currency: string }>>`
    SELECT id,provider,reason,amount_minor,currency FROM payment_refunds WHERE order_id=${order.id} FOR UPDATE
  `;
  const refund = refunds[0];
  if (refunds.length !== 1 || !refund || refund.provider !== order.provider || refund.reason !== "report_failed" ||
      Number(refund.amount_minor) !== Number(order.amount_minor) || refund.currency !== order.currency) {
    throw new Error("The unavailable V4 full-refund truth conflicts with the paid order.");
  }
  const businessKey = `report_failed_refund/${order.id}/v1`;
  const emails = await tx<Array<{ id: string; order_id: string; report_id: string; template_type: string }>>`
    SELECT id,order_id,report_id,template_type FROM email_deliveries
    WHERE business_idempotency_key=${businessKey} FOR UPDATE
  `;
  const email = emails[0];
  if (emails.length !== 1 || !email || email.order_id !== order.id || email.report_id !== reportId ||
      email.template_type !== "report_failed_refund") {
    throw new Error("The unavailable V4 failure email truth conflicts with the paid order.");
  }
  return { refundId: refund.id, emailDeliveryId: email.id };
}

function deterministicReportAccessToken(reportId: string, businessKey: string, secret: string): { raw: string; displayPrefix: string } {
  const idempotencyKey = `${businessKey}/combined_geo_report_v4`;
  const material = createHmac("sha256", secret).update(`report-access\0${reportId}\0combined_geo_report_v4\0${idempotencyKey}`).digest("base64url");
  const raw = `ogc_report_${material}`;
  return { raw, displayPrefix: raw.slice(0, 19) };
}
function requireV4CommerceOutcome(status: CombinedGeoReportV4["status"]): "completed" | "completed_limited" {
  if (status === "unavailable") throw new Error("V4 commercial terminalization requires a deliverable core report.");
  return status;
}
function v4LocaleMatches(generationLocale: string, persistedLocale: string): boolean {
  try { return normalizeReportLanguage(generationLocale) === persistedLocale; }
  catch { return false; }
}
function requiredV4Identity(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) throw new Error(`A valid V4 ${label} identity is required.`);
  return normalized;
}
function assertCoverage(value:ScanJobCoverage){for(const item of Object.values(value))if(!Number.isSafeInteger(item)||item<0)throw new Error("Coverage counts must be non-negative integers.");}
function fault(actual:string|undefined,expected:string){if(actual===expected)throw new Error(`Injected fault after ${expected}.`);}
function sha(parts:string[]):string{return createHash("sha256").update(parts.join("\0")).digest("hex");}
