import {
  parseCombinedGeoReportV1,
  parseCombinedGeoReportV2,
  parseCombinedGeoReportV3,
  parseCombinedGeoReportV4,
  type CombinedGeoReportV1,
  type CombinedGeoReportV2,
  type CombinedGeoReportV3,
  type CombinedGeoReportV4
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";
import type { ReportLocale } from "./schema";

export type LegacyCombinedGeoReportContract = "combined_geo_report_v1" | "combined_geo_report_v2" | "combined_geo_report_v3";
export type CombinedGeoReportContract = LegacyCombinedGeoReportContract | "combined_geo_report_v4";

interface ActiveCombinedGeoReportBase<TContract extends CombinedGeoReportContract, TReport> {
  artifactContract: TContract;
  artifactRevisionId: string;
  revision: number;
  reportLocale: ReportLocale;
  htmlSha256: string;
  report: TReport;
}

export type ActiveCombinedGeoReportV1 = ActiveCombinedGeoReportBase<"combined_geo_report_v1", CombinedGeoReportV1> & {
  pdfStorageKey: string;
  pdfSha256: string;
};
export type ActiveCombinedGeoReportV2 = ActiveCombinedGeoReportBase<"combined_geo_report_v2", CombinedGeoReportV2> & {
  pdfStorageKey: string;
  pdfSha256: string;
};
export type ActiveCombinedGeoReportV3 = ActiveCombinedGeoReportBase<"combined_geo_report_v3", CombinedGeoReportV3> & {
  pdfStorageKey: string;
  pdfSha256: string;
};
export type ActiveCombinedGeoReportV4 = ActiveCombinedGeoReportBase<"combined_geo_report_v4", CombinedGeoReportV4> & {
  pdfStorageKey: null;
  pdfSha256: null;
};
export type ActiveLegacyCombinedGeoReport = ActiveCombinedGeoReportV1 | ActiveCombinedGeoReportV2 | ActiveCombinedGeoReportV3;
export type ActiveCombinedGeoReport = ActiveLegacyCombinedGeoReport | ActiveCombinedGeoReportV4;

export function getActiveCombinedGeoReport(reportId: string): Promise<ActiveLegacyCombinedGeoReport | null>;
export function getActiveCombinedGeoReport(reportId: string, expectedContract: "combined_geo_report_v1"): Promise<ActiveCombinedGeoReportV1 | null>;
export function getActiveCombinedGeoReport(reportId: string, expectedContract: "combined_geo_report_v2"): Promise<ActiveCombinedGeoReportV2 | null>;
export function getActiveCombinedGeoReport(reportId: string, expectedContract: "combined_geo_report_v3"): Promise<ActiveCombinedGeoReportV3 | null>;
export function getActiveCombinedGeoReport(reportId: string, expectedContract: "combined_geo_report_v4"): Promise<ActiveCombinedGeoReportV4 | null>;
export function getActiveCombinedGeoReport(reportId: string, expectedContract: CombinedGeoReportContract): Promise<ActiveCombinedGeoReport | null>;
export async function getActiveCombinedGeoReport(
  reportId: string,
  expectedContract?: CombinedGeoReportContract
): Promise<ActiveCombinedGeoReport | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{
    artifact_revision_id: string;
    revision: number;
    pdf_storage_key: string | null;
    html_sha256: string | null;
    pdf_sha256: string | null;
    artifact_contract: string;
    report_locale: string | null;
    payload: unknown;
  }>>`
    SELECT artifact.id AS artifact_revision_id,artifact.revision,artifact.pdf_storage_key,artifact.artifact_contract,
      artifact.html_sha256,artifact.pdf_sha256,report.report_locale,combined.payload
    FROM scan_reports report
    JOIN report_artifact_revisions artifact ON artifact.id=report.active_artifact_revision_id AND artifact.report_id=report.id
    JOIN combined_geo_reports combined ON combined.artifact_revision_id=artifact.id AND combined.report_id=report.id
    WHERE report.id=${reportId} AND artifact.status='active'
      AND artifact.artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4')
    LIMIT 1`;
  const row = rows[0];
  if (!row || !isCombinedContract(row.artifact_contract) || !row.html_sha256?.trim()
    || !Number.isInteger(row.revision) || row.revision < 1 || !isReportLocale(row.report_locale)) return null;
  if (expectedContract ? row.artifact_contract !== expectedContract : row.artifact_contract === "combined_geo_report_v4") return null;
  if (row.artifact_contract === "combined_geo_report_v4") {
    if (row.pdf_storage_key !== null || row.pdf_sha256 !== null) return null;
    try {
      const report = parseCombinedGeoReportV4(row.payload);
      if (!matchesArtifactIdentity(report, row, reportId)) return null;
      return {
        artifactContract: row.artifact_contract,
        artifactRevisionId: row.artifact_revision_id,
        revision: row.revision,
        reportLocale: row.report_locale,
        htmlSha256: row.html_sha256,
        pdfStorageKey: null,
        pdfSha256: null,
        report
      };
    } catch {
      return null;
    }
  }
  if (!row.pdf_storage_key?.trim() || !row.pdf_sha256?.trim()) return null;
  const legacyArtifact = {
    artifactRevisionId: row.artifact_revision_id,
    revision: row.revision,
    reportLocale: row.report_locale,
    htmlSha256: row.html_sha256,
    pdfStorageKey: row.pdf_storage_key,
    pdfSha256: row.pdf_sha256
  };
  try {
    if (row.artifact_contract === "combined_geo_report_v3") {
      const report = parseCombinedGeoReportV3(row.payload);
      if (!matchesArtifactIdentity(report, row, reportId) || report.artifactRevision !== row.revision) return null;
      return { ...legacyArtifact, artifactContract: row.artifact_contract, report };
    }
    if (row.artifact_contract === "combined_geo_report_v2") {
      const report = parseCombinedGeoReportV2(row.payload);
      if (!matchesArtifactIdentity(report, row, reportId) || report.artifactRevision !== row.revision) return null;
      return { ...legacyArtifact, artifactContract: row.artifact_contract, report };
    }
    const report = parseCombinedGeoReportV1(row.payload);
    if (!matchesArtifactIdentity(report, row, reportId) || report.artifactRevision !== row.revision) return null;
    return { ...legacyArtifact, artifactContract: row.artifact_contract, report };
  } catch {
    return null;
  }
}

function matchesArtifactIdentity(
  report: CombinedGeoReportV1 | CombinedGeoReportV2 | CombinedGeoReportV3 | CombinedGeoReportV4,
  row: { artifact_contract: string; artifact_revision_id: string; report_locale: string | null },
  reportId: string
): boolean {
  return report.artifactContract === row.artifact_contract && report.reportId === reportId
    && report.artifactRevisionId === row.artifact_revision_id && localeOf(report.locale) === row.report_locale;
}

function isCombinedContract(value: string): value is CombinedGeoReportContract {
  return value === "combined_geo_report_v1" || value === "combined_geo_report_v2"
    || value === "combined_geo_report_v3" || value === "combined_geo_report_v4";
}

function isReportLocale(value: string | null): value is ReportLocale {
  return value === "en" || value === "zh";
}

function localeOf(value: string): ReportLocale | null {
  const locale = value.toLowerCase().split(/[-_]/, 1)[0];
  return locale === "en" || locale === "zh" ? locale : null;
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
