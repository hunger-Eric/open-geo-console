import { createHash, randomUUID } from "node:crypto";
import { parseCombinedGeoReportV1, parseCombinedGeoReportV2, parseCombinedGeoReportV3, requireReadyCombinedGeoReport, requireReadyCombinedGeoReportV2, requireReadyCombinedGeoReportV3, type CombinedGeoReportV1, type CombinedGeoReportV2, type CombinedGeoReportV3 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";
import type { PaidPublicSourceSnapshotRef } from "./public-source-commerce";
import { snapshotReferenceBinding } from "./combined-correction-terminalization";
import { JobTransitionService } from "@/worker/job-transition-service";

export const STAGING_COMBINED_REFRESH_REPORT_ID = "a71d7481-c5dc-4e2a-a042-b9be878feab8";
export const STAGING_V3_REPLACEMENT_REFRESH_REPORT_ID = "0631932e-72b8-4c6f-b492-820e2533e23e";
export const STAGING_COMBINED_REFRESH_REPORT_IDS = [STAGING_COMBINED_REFRESH_REPORT_ID, STAGING_V3_REPLACEMENT_REFRESH_REPORT_ID] as const;

export interface StagingCombinedArtifactRefreshContext {
  reportId: string;
  orderId: string;
  jobId: string;
  artifactRevisionId: string;
  artifactRevision: number;
  sourceArtifactRevisionId: string;
  sourceReport: CombinedGeoReportV1 | CombinedGeoReportV2 | CombinedGeoReportV3;
}

export async function prepareStagingCombinedArtifactRefresh(reportId: string, expectedSourceRevisionId?: string): Promise<StagingCombinedArtifactRefreshContext> {
  if (!STAGING_COMBINED_REFRESH_REPORT_IDS.includes(reportId as typeof STAGING_COMBINED_REFRESH_REPORT_IDS[number])) throw new Error("The staging refresh is restricted to an approved report.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`artifact-revision:${reportId}`},0))`;
    const source=(await tx<Array<{artifact_revision_id:string;artifact_contract:string;revision:number;revision_kind:string;order_id:string;job_id:string;question_set_id:string;payload:unknown;payment_status:string;fulfillment_status:string;refund_status:string;credit_status:string|null;courtesy_non_billable:boolean;replacement_completed:boolean}>>`
      SELECT artifact.id AS artifact_revision_id,artifact.artifact_contract,artifact.revision,artifact.revision_kind,combined.order_id,combined.job_id,combined.question_set_id,combined.payload,
        orders.payment_status,orders.fulfillment_status,orders.refund_status,credits.status AS credit_status,orders.courtesy_non_billable,
        EXISTS(SELECT 1 FROM report_replacement_fulfillments replacement WHERE replacement.report_id=reports.id
          AND replacement.state='completed' AND replacement.active_artifact_revision_id=artifact.id) AS replacement_completed
      FROM scan_reports reports
      JOIN report_artifact_revisions artifact ON artifact.id=reports.active_artifact_revision_id AND artifact.status='active'
      JOIN combined_geo_reports combined ON combined.artifact_revision_id=artifact.id
      JOIN payment_orders orders ON orders.id=combined.order_id AND orders.report_id=reports.id
      LEFT JOIN credit_ledger credits ON credits.payment_order_id=orders.id
      WHERE reports.id=${reportId} FOR UPDATE OF reports,artifact,orders`)[0];
    if(!source) throw new Error("The approved staging report has no active combined artifact.");
    if(["presentation_refresh","evidence_refresh"].includes(source.revision_kind)&&!expectedSourceRevisionId) throw new Error("A repeated refresh requires --from-revision with the inspected active artifact ID.");
    if(expectedSourceRevisionId && source.artifact_revision_id!==expectedSourceRevisionId) throw new Error("The active artifact revision changed; inspect it before refreshing again.");
    const settledOriginal=source.payment_status==="paid"&&source.fulfillment_status==="completed"&&source.refund_status==="not_required"&&source.credit_status==="settled";
    const completedCourtesyReplacement=reportId===STAGING_V3_REPLACEMENT_REFRESH_REPORT_ID&&source.artifact_contract==="combined_geo_report_v3"&&
      source.payment_status==="paid"&&source.fulfillment_status==="failed"&&source.refund_status==="failed"&&source.credit_status==="refunded"&&
      source.courtesy_non_billable&&source.replacement_completed;
    if(!settledOriginal&&!completedCourtesyReplacement) {
      throw new Error("The original commercial outcome is not settled and refreshable.");
    }
    const sourceReport=parseCombined(source.payload,source.artifact_contract);
    const revisionKind=sourceReport.artifactContract==="combined_geo_report_v1"?"presentation_refresh":"evidence_refresh";
    const locked=(await tx<Array<{id:string}>>`SELECT id FROM report_business_question_sets WHERE id=${source.question_set_id} AND report_id=${reportId} AND status='locked'`)[0];
    if(!locked||sourceReport.questionSetIdentity!==locked.id) throw new Error("The active report question set is not locked and reusable.");
    const existing=(await tx<Array<{job_id:string;artifact_revision_id:string;revision:number}>>`
      SELECT job.id AS job_id,artifact.id AS artifact_revision_id,artifact.revision
      FROM report_artifact_revisions artifact JOIN scan_jobs job ON job.id=artifact.job_id
      WHERE artifact.report_id=${reportId} AND artifact.source_artifact_revision_id=${source.artifact_revision_id}
        AND artifact.revision_kind=${revisionKind} AND artifact.status='pending'
        AND job.execution_state IN ('queued','running','retry_wait','repair_wait') LIMIT 1`)[0];
    if(existing) return {reportId,orderId:source.order_id,jobId:existing.job_id,artifactRevisionId:existing.artifact_revision_id,
      artifactRevision:existing.revision,sourceArtifactRevisionId:source.artifact_revision_id,sourceReport};
    const jobId=randomUUID(),artifactRevisionId=randomUUID(),dispatchId=randomUUID();
    const revision=(await tx<Array<{revision:number}>>`SELECT COALESCE(max(revision),0)::integer+1 AS revision FROM report_artifact_revisions WHERE report_id=${reportId}`)[0]!.revision;
    await tx`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason,stage,credit_reservation_id)
      VALUES(${jobId},${reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,
        ${sourceReport.artifactContract},${locked.id},${language(sourceReport.locale)},'staging_artifact_refresh','queued',NULL)`;
    await tx`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,source_artifact_revision_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
      VALUES(${artifactRevisionId},${reportId},${source.order_id},${jobId},${source.artifact_revision_id},${revision},${revisionKind},
        ${sourceReport.artifactContract},'pending',${`${source.artifact_revision_id}:${locked.id}:${jobId}`})`;
    await tx`INSERT INTO job_dispatch_outbox(id,job_id,tier,schema_version,state) VALUES(${dispatchId},${jobId},'deep',1,'pending')`;
    return {reportId,orderId:source.order_id,jobId,artifactRevisionId,artifactRevision:revision,
      sourceArtifactRevisionId:source.artifact_revision_id,sourceReport};
  });
}

export async function getStagingCombinedArtifactRefreshContext(jobId:string):Promise<StagingCombinedArtifactRefreshContext|null>{
  await ensureDatabase();
  const row=(await getSqlClient()<Array<{report_id:string;order_id:string;artifact_revision_id:string;artifact_contract:string;revision:number;source_artifact_revision_id:string;payload:unknown}>>`
    SELECT artifact.report_id,artifact.order_id,artifact.id AS artifact_revision_id,artifact.artifact_contract,artifact.revision,artifact.source_artifact_revision_id,combined.payload
    FROM report_artifact_revisions artifact
    JOIN combined_geo_reports combined ON combined.artifact_revision_id=artifact.source_artifact_revision_id
    JOIN scan_jobs job ON job.id=artifact.job_id AND job.reason='staging_artifact_refresh'
    WHERE artifact.job_id=${jobId} AND artifact.status='pending' AND artifact.revision_kind IN ('presentation_refresh','evidence_refresh') LIMIT 1`)[0];
  return row?{reportId:row.report_id,orderId:row.order_id,jobId,artifactRevisionId:row.artifact_revision_id,
    artifactRevision:row.revision,sourceArtifactRevisionId:row.source_artifact_revision_id,sourceReport:parseCombined(row.payload,row.artifact_contract)}:null;
}

export async function failStagingCombinedArtifactRefresh(jobId:string):Promise<void>{
  await ensureDatabase();
  await getSqlClient()`UPDATE report_artifact_revisions SET status='failed'
    WHERE job_id=${jobId} AND revision_kind IN ('presentation_refresh','evidence_refresh') AND status='pending'`;
}

export async function terminalizeStagingCombinedArtifactRefresh(input:{report:unknown;workerId:string;checkpointIdentityHash:string;
  snapshotRefs:readonly PaidPublicSourceSnapshotRef[];htmlSha256:string;pdfSha256:string;pdfStorageKey:string;pageCount:number}):Promise<CombinedGeoReportV1|CombinedGeoReportV2|CombinedGeoReportV3>{
  const report=readyCombined(input.report);
  if(!STAGING_COMBINED_REFRESH_REPORT_IDS.includes(report.reportId as typeof STAGING_COMBINED_REFRESH_REPORT_IDS[number])||input.pageCount<5||!input.workerId.trim()) throw new Error("Staging refresh readiness identity is incomplete.");
  await ensureDatabase();
  return getSqlClient().begin(async(tx)=>{
    const job=(await tx<Array<{execution_state:string;checkpoint_revision:number;lease_owner:string|null;lease_expires_at:string|null;credit_reservation_id:string|null;checkpoint:Record<string,unknown>;reason:string;business_question_set_id:string|null}>>`
      SELECT execution_state,checkpoint_revision,lease_owner,lease_expires_at,credit_reservation_id,checkpoint,reason,business_question_set_id
      FROM scan_jobs WHERE id=${report.jobId} AND report_id=${report.reportId} FOR UPDATE`)[0];
    const identity=((report.artifactContract==="combined_geo_report_v3"?job?.checkpoint?.answerFirstV3:report.artifactContract==="combined_geo_report_v2"?job?.checkpoint?.providerDiscovery:job?.checkpoint?.publicSourceForensics) as {identityHash?:unknown}|undefined)?.identityHash;
    if(!job||job.reason!=="staging_artifact_refresh"||job.execution_state!=="running"||job.lease_owner!==input.workerId||
      !job.lease_expires_at||Date.parse(job.lease_expires_at)<=Date.now()||job.credit_reservation_id!==null||
      job.business_question_set_id!==report.questionSetIdentity||identity!==input.checkpointIdentityHash) throw new Error("Refresh requires its exact active non-billable leased job.");
    const artifact=(await tx<Array<{source_artifact_revision_id:string;order_id:string;revision_kind:string}>>`
      SELECT source_artifact_revision_id,order_id,revision_kind FROM report_artifact_revisions WHERE id=${report.artifactRevisionId} AND job_id=${report.jobId}
        AND report_id=${report.reportId} AND status='pending' AND revision_kind IN ('presentation_refresh','evidence_refresh') AND artifact_contract=${report.artifactContract} FOR UPDATE`)[0];
    if(!artifact||artifact.order_id!==report.orderId) throw new Error("The pending refresh artifact identity changed.");
    const active=(await tx<Array<{active_artifact_revision_id:string|null}>>`SELECT active_artifact_revision_id FROM scan_reports WHERE id=${report.reportId} FOR UPDATE`)[0];
    if(!active||active.active_artifact_revision_id!==artifact.source_artifact_revision_id) throw new Error("The source artifact is no longer active.");
    for(const ref of input.snapshotRefs){
      const snapshot=(await tx<Array<{completed_at:string}>>`SELECT completed_at FROM market_snapshot_questions WHERE id=${ref.snapshotId} AND cache_identity=${ref.cacheIdentity} AND status='completed'`)[0];
      if(!snapshot) throw new Error("A refresh snapshot is not complete and bindable.");
      const binding=snapshotReferenceBinding(report.evidenceCutoffAt,snapshot.completed_at);
      await tx`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
        VALUES(${sha([report.jobId,ref.snapshotId])},${report.reportId},${report.jobId},${ref.snapshotId},${ref.cacheIdentity},${binding.evidenceCutoff},${binding.freshnessState},${ref.actualCostMicros},${ref.allocatedCostMicros},${ref.avoidedCostMicros},${sha([report.reportId,report.jobId,ref.snapshotId,ref.cacheIdentity,binding.evidenceCutoff])})
        ON CONFLICT(job_id,snapshot_id) DO NOTHING`;
    }
    const refs=await tx<Array<{count:number}>>`SELECT count(*)::integer AS count FROM report_market_snapshot_refs WHERE job_id=${report.jobId}`;
    if(refs[0]?.count!==input.snapshotRefs.length) throw new Error("Every refresh snapshot must be atomically bound.");
    await tx`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
      VALUES(${report.artifactRevisionId},${report.reportId},${report.orderId},${report.jobId},${report.questionSetIdentity},${JSON.stringify(report)}::jsonb)`;
    const ready=await tx<{id:string}[]>`UPDATE report_artifact_revisions SET status='ready',html_sha256=${input.htmlSha256},pdf_sha256=${input.pdfSha256},
      pdf_storage_key=${input.pdfStorageKey},payload_identity_hash=${sha([JSON.stringify(report)])},
      readiness=${JSON.stringify({htmlCanonical:true,pageCount:input.pageCount,privateEvidenceReady:true,presentationRefresh:artifact.revision_kind==="presentation_refresh",evidenceRefresh:artifact.revision_kind==="evidence_refresh"})}::jsonb,ready_at=now()
      WHERE id=${report.artifactRevisionId} AND status='pending' RETURNING id`;
    if(ready.length!==1) throw new Error("The refresh artifact did not become ready.");
    await tx`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE id=${artifact.source_artifact_revision_id} AND status='active'`;
    const activated=await tx<{id:string}[]>`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${report.artifactRevisionId} AND status='ready' RETURNING id`;
    if(activated.length!==1) throw new Error("The refresh artifact could not activate.");
    await tx`UPDATE scan_reports SET active_artifact_revision_id=${report.artifactRevisionId} WHERE id=${report.reportId}`;
    await tx`UPDATE scan_jobs SET stage='completed',execution_state='completed',current_phase='terminalization',progress=100,
      lease_owner=NULL,lease_expires_at=NULL,error_code=NULL,public_error=NULL,updated_at=now() WHERE id=${report.jobId}`;
    await JobTransitionService.appendTransition(tx,{jobId:report.jobId,fromState:job.execution_state,toState:'completed',phase:'terminalization',checkpointRevision:job.checkpoint_revision,reasonCode:'staging_combined_refresh_activated'});
    return report;
  });
}

function language(locale:string):"en"|"zh"{return locale.toLowerCase().startsWith("zh")?"zh":"en";}
function sha(parts:string[]):string{return createHash("sha256").update(parts.join("\0")).digest("hex");}
function parseCombined(value:unknown,contract:string):CombinedGeoReportV1|CombinedGeoReportV2|CombinedGeoReportV3{return contract==="combined_geo_report_v3"?parseCombinedGeoReportV3(value):contract==="combined_geo_report_v2"?parseCombinedGeoReportV2(value):parseCombinedGeoReportV1(value);}
function readyCombined(value:unknown):CombinedGeoReportV1|CombinedGeoReportV2|CombinedGeoReportV3{const contract=value&&typeof value==="object"&&!Array.isArray(value)?(value as {artifactContract?:unknown}).artifactContract:null;return contract==="combined_geo_report_v3"?requireReadyCombinedGeoReportV3(value):contract==="combined_geo_report_v2"?requireReadyCombinedGeoReportV2(value):requireReadyCombinedGeoReport(value);}
