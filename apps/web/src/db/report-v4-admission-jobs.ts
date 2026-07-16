import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { ensureDatabase, getDb } from "./index";
import {
  scanJobs,
  type ReportArtifactContract,
  type ReportLocale,
  type ReportProductContract,
  type ReportTier,
  type ScanJobReason,
  type ScanJobRow
} from "./schema";

export interface CompletedPreviewJobIdentity {
  reportId: string;
  locale: ReportLocale;
  tier: ReportTier;
  productContract: ReportProductContract;
  reason: ScanJobReason;
  stage: "completed" | "completed_limited" | "failed";
}

export interface ReportV4PreAdmissionJobIdentity {
  reportId: string;
  locale: ReportLocale;
  tier: "deep";
  productContract: "recommendation_forensics_v1";
  fulfillmentMethodology: "two_stage_geo_report_v4";
  recommendationReportVersion: 4;
  artifactContract: Extract<ReportArtifactContract, "combined_geo_report_v4">;
  reason: "v4_pre_admission";
}

export interface ReportV4AdmissionEnqueueResult {
  jobId: string;
  created: boolean;
}

/**
 * The terminalization transaction owns the concrete repository. Tests use an
 * in-memory implementation so lifecycle eligibility is verified without a
 * second persistence model for authoritative scan jobs.
 */
export interface ReportV4AdmissionJobRepository {
  createExactlyOnce(input: ReportV4PreAdmissionJobIdentity): Promise<ReportV4AdmissionEnqueueResult>;
}

export async function enqueueReportV4PreAdmissionAfterPreview(
  preview: CompletedPreviewJobIdentity,
  repository: ReportV4AdmissionJobRepository
): Promise<ReportV4AdmissionEnqueueResult | null> {
  if (preview.tier !== "free" ||
      preview.productContract !== "legacy_website_audit_v1" ||
      preview.reason !== "standard" ||
      (preview.stage !== "completed" && preview.stage !== "completed_limited")) {
    return null;
  }
  return repository.createExactlyOnce({
    reportId: preview.reportId,
    locale: preview.locale,
    tier: "deep",
    productContract: "recommendation_forensics_v1",
    fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4,
    artifactContract: "combined_geo_report_v4",
    reason: "v4_pre_admission"
  });
}

export function createPostgresReportV4AdmissionJobRepository(
  tx: postgres.TransactionSql
): ReportV4AdmissionJobRepository {
  return {
    async createExactlyOnce(input) {
      const requestedJobId = randomUUID();
      const inserted = await tx<Array<{ id: string }>>`
        INSERT INTO scan_jobs (
          id,report_id,tier,product_contract,fulfillment_methodology,
          recommendation_report_version,artifact_contract,locale,reason
        ) VALUES (
          ${requestedJobId},${input.reportId},${input.tier},${input.productContract},
          ${input.fulfillmentMethodology},${input.recommendationReportVersion},
          ${input.artifactContract},${input.locale},${input.reason}
        )
        ON CONFLICT (report_id) WHERE reason='v4_pre_admission' DO NOTHING
        RETURNING id
      `;
      const created = Boolean(inserted[0]);
      const existing = created ? inserted : await tx<Array<{ id: string }>>`
        SELECT id FROM scan_jobs
        WHERE report_id=${input.reportId} AND reason='v4_pre_admission'
        ORDER BY created_at,id
        LIMIT 1
      `;
      const jobId = existing[0]?.id;
      if (!jobId) throw new Error("The V4 pre-admission job identity could not be created or resolved.");
      if (created) {
        await tx`
          INSERT INTO job_dispatch_outbox (id,job_id,tier,schema_version,state)
          VALUES (${randomUUID()},${jobId},'deep',1,'pending')
        `;
      }
      return { jobId, created };
    }
  };
}

export async function getReportV4PreAdmissionJob(reportId: string): Promise<ScanJobRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(scanJobs).where(and(
    eq(scanJobs.reportId, reportId),
    eq(scanJobs.reason, "v4_pre_admission")
  )).orderBy(desc(scanJobs.createdAt), desc(scanJobs.id)).limit(1);
  return row ?? null;
}
