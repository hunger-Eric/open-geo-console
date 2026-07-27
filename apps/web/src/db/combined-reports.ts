import { parseCombinedGeoReportV1, type CombinedGeoReportV1 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export interface ActiveCombinedGeoReport {
  artifactRevisionId: string;
  revision: number;
  pdfStorageKey: string;
  htmlSha256: string;
  pdfSha256: string;
  report: CombinedGeoReportV1;
}

export async function getActiveCombinedGeoReport(reportId: string): Promise<ActiveCombinedGeoReport | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{
    artifact_revision_id: string;
    revision: number;
    pdf_storage_key: string;
    html_sha256: string;
    pdf_sha256: string;
    payload: unknown;
  }>>`
    SELECT artifact.id AS artifact_revision_id,artifact.revision,artifact.pdf_storage_key,
      artifact.html_sha256,artifact.pdf_sha256,combined.payload
    FROM scan_reports report
    JOIN report_artifact_revisions artifact ON artifact.id=report.active_artifact_revision_id
    JOIN combined_geo_reports combined ON combined.artifact_revision_id=artifact.id
    WHERE report.id=${reportId} AND artifact.status='active' AND artifact.artifact_contract='combined_geo_report_v1'
    LIMIT 1`;
  const row = rows[0];
  if (!row?.pdf_storage_key || !row.html_sha256 || !row.pdf_sha256) return null;
  const report = parseCombinedGeoReportV1(row.payload);
  if (report.reportId !== reportId || report.artifactRevisionId !== row.artifact_revision_id || report.artifactRevision !== row.revision) return null;
  return {
    artifactRevisionId: row.artifact_revision_id,
    revision: row.revision,
    pdfStorageKey: row.pdf_storage_key,
    htmlSha256: row.html_sha256,
    pdfSha256: row.pdf_sha256,
    report
  };
}

export async function getPendingPaidCombinedContext(jobId:string):Promise<{orderId:string;artifactRevisionId:string;artifactRevision:number}|null>{
  await ensureDatabase();
  const rows=await getSqlClient()<Array<{order_id:string;artifact_revision_id:string;artifact_revision:number}>>`
    SELECT artifact.order_id,artifact.id AS artifact_revision_id,artifact.revision AS artifact_revision
    FROM report_artifact_revisions artifact JOIN payment_orders orders ON orders.id=artifact.order_id
    WHERE artifact.job_id=${jobId} AND artifact.status='pending' AND artifact.correction_id IS NULL
      AND orders.fulfillment_job_id=${jobId} AND orders.payment_status='paid' LIMIT 1`;
  const row=rows[0];return row?{orderId:row.order_id,artifactRevisionId:row.artifact_revision_id,artifactRevision:row.artifact_revision}:null;
}
