import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseRecommendationForensicReportV2, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryGetReport,
  memoryGetReportSourceForensicsForJob,
  memoryGetReportSourceForensicsForReport,
  memoryGetScanJob,
  memorySaveReportSourceForensics
} from "./memory";
import type { ReportSourceForensicsRow } from "./schema";

export async function saveSourceForensicReport(input: unknown): Promise<RecommendationForensicReportV2> {
  const report = parseRecommendationForensicReportV2(input);
  const row = prepareSourceForensicReportRow(report);
  if (isMemoryPersistence()) {
    if (!memoryGetReport(report.reportId)) throw new Error("The source-forensics report owner does not exist.");
    const job = memoryGetScanJob(report.jobId);
    assertV2Job(job, report.reportId);
    const existing = memoryGetReportSourceForensicsForReport(report.reportId) ?? memoryGetReportSourceForensicsForJob(report.jobId);
    if (existing) assertImmutable(existing, row); else memorySaveReportSourceForensics(row);
    return structuredClone(report);
  }
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<{ report_id: string; product_contract: string; fulfillment_methodology: string; recommendation_report_version: number }>>`
      SELECT report_id, product_contract, fulfillment_methodology, recommendation_report_version
      FROM scan_jobs WHERE id=${row.jobId} FOR UPDATE
    `)[0];
    assertV2Job(job ? {
      reportId: job.report_id, productContract: job.product_contract,
      fulfillmentMethodology: job.fulfillment_methodology, recommendationReportVersion: Number(job.recommendation_report_version)
    } : null, row.reportId);
    await tx`
      INSERT INTO report_source_forensics (
        id, report_id, job_id, report_version, fulfillment_methodology, product_contract,
        payload, authority_hash, provenance_hash, content_hash, is_private
      ) VALUES (
        ${row.id}, ${row.reportId}, ${row.jobId}, 2, ${row.fulfillmentMethodology}, ${row.productContract},
        ${JSON.stringify(row.payload)}::jsonb, ${row.authorityHash}, ${row.provenanceHash}, ${row.contentHash}, true
      ) ON CONFLICT (id) DO NOTHING
    `;
    const stored = (await tx<Array<Record<string, unknown>>>`SELECT * FROM report_source_forensics WHERE id=${row.id}`)[0];
    if (!stored) throw new Error("Source-forensics report identity conflict.");
    assertImmutable(fromDb(stored), row);
  });
  return structuredClone(report);
}

export async function getSourceForensicReportForJob(jobId: string): Promise<RecommendationForensicReportV2 | null> {
  return readOne("job_id", jobId);
}

export async function getSourceForensicReportForReport(reportId: string): Promise<RecommendationForensicReportV2 | null> {
  return readOne("report_id", reportId);
}

async function readOne(column: "job_id" | "report_id", value: string): Promise<RecommendationForensicReportV2 | null> {
  let row: ReportSourceForensicsRow | null;
  if (isMemoryPersistence()) row = column === "job_id" ? memoryGetReportSourceForensicsForJob(value) : memoryGetReportSourceForensicsForReport(value);
  else {
    await ensureDatabase();
    const stored = column === "job_id"
      ? (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM report_source_forensics WHERE job_id=${value} AND is_private=true`)[0]
      : (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM report_source_forensics WHERE report_id=${value} AND is_private=true`)[0];
    row = stored ? fromDb(stored) : null;
  }
  if (!row) return null;
  const report = parseRecommendationForensicReportV2(row.payload);
  assertImmutable(row, prepareSourceForensicReportRow(report));
  return report;
}

function assertV2Job(job: { reportId: string; productContract: string; fulfillmentMethodology?: string | null; recommendationReportVersion?: number | null } | null, reportId: string): void {
  if (!job || job.reportId !== reportId || job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "public_search_source_forensics_v1" || job.recommendationReportVersion !== 2) {
    throw new Error("Source-forensics reports require their exact V2 recommendation job.");
  }
}

export function prepareSourceForensicReportRow(report: RecommendationForensicReportV2): ReportSourceForensicsRow {
  const payload = structuredClone(report);
  return {
    id: hash([report.reportId, report.jobId, "recommendation-forensic-v2"]), reportId: report.reportId, jobId: report.jobId,
    reportVersion: 2, fulfillmentMethodology: "public_search_source_forensics_v1", productContract: "recommendation_forensics_v1",
    payload, authorityHash: hash([stableJson(report.authority)]),
    provenanceHash: hash([stableJson({ evidenceCutoffAt: report.evidenceCutoffAt, snapshotRefs: report.snapshotRefs, synthesisProvenance: report.synthesisProvenance })]),
    contentHash: hash([stableJson(payload)]), isPrivate: true, createdAt: new Date(), updatedAt: new Date()
  };
}

function fromDb(row: Record<string, unknown>): ReportSourceForensicsRow {
  return { id: String(row.id), reportId: String(row.report_id), jobId: String(row.job_id), reportVersion: Number(row.report_version),
    fulfillmentMethodology: row.fulfillment_methodology as ReportSourceForensicsRow["fulfillmentMethodology"], productContract: row.product_contract as ReportSourceForensicsRow["productContract"],
    payload: row.payload, authorityHash: String(row.authority_hash), provenanceHash: String(row.provenance_hash), contentHash: String(row.content_hash),
    isPrivate: row.is_private === true, createdAt: new Date(row.created_at as string), updatedAt: new Date(row.updated_at as string) };
}
function assertImmutable(existing: ReportSourceForensicsRow, proposed: ReportSourceForensicsRow): void {
  const comparable = (row: ReportSourceForensicsRow) => ({ ...row, createdAt: undefined, updatedAt: undefined });
  if (!isDeepStrictEqual(comparable(existing), comparable(proposed))) throw new Error("source-forensics report immutability violation.");
}
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`; return JSON.stringify(value); }
function hash(parts: string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }
