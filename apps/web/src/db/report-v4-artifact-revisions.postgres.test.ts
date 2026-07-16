import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  activateReportV4CoreRevision,
  activateReportV4DiagnosisEnhancement,
  createPostgresReportV4ArtifactRevisionExecutor,
  createReportV4ArtifactRevisionPostgresDatabase,
  prepareReportV4DiagnosisEnhancement,
} from "./report-v4-artifact-revisions";
import { DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_artifacts_${randomUUID().replaceAll("-", "")}`;
const admin = adminUrl ? postgres(adminUrl, { max: 1, prepare: false }) : null;
const configIdentityHash = "e".repeat(64);
const configSnapshotId = `v4-config-${configIdentityHash}`;

// @requirement GEO-V4-DELIVERY-01
describeDisposablePostgres("V4 artifact revision PostgreSQL executor", () => {
  afterAll(async () => {
    await admin!.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin!.end({ timeout: 5 });
  }, 60_000);

  it("locks, allocates, readies, activates and atomically advances the HTML-only report pointer", async () => {
    await admin!.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    try {
      await sql.begin(async (tx) => {
        for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement);
      });
      await seedV4Report(sql);
      const database = createReportV4ArtifactRevisionPostgresDatabase(sql);
      const executor = createPostgresReportV4ArtifactRevisionExecutor(database);
      const coreInput = {
        artifactRevisionId: "core-revision",
        reportId: "report-v4",
        orderId: "order-v4",
        jobId: "core-job",
        configSnapshotId,
        payloadIdentityHash: "a".repeat(64),
        htmlSha256: "b".repeat(64)
      };
      const enhancementIdentity = {
        artifactRevisionId: "enhancement-revision",
        reportId: "report-v4",
        orderId: "order-v4",
        jobId: "enhancement-job",
        configSnapshotId,
        sourceArtifactRevisionId: "core-revision"
      };

      expect(await activateReportV4CoreRevision(coreInput, executor)).toMatchObject({
        revision: 1,
        status: "active",
        artifactContract: "combined_geo_report_v4"
      });
      expect(await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor)).toMatchObject({
        revision: 2,
        status: "pending"
      });
      expect(await activateReportV4DiagnosisEnhancement({
        ...enhancementIdentity,
        payloadIdentityHash: "c".repeat(64),
        htmlSha256: "d".repeat(64)
      }, executor)).toMatchObject({ revision: 2, status: "active" });

      const revisions = await sql<Array<{
        id: string;
        status: string;
        activated_at: Date | null;
        pdf_sha256: string | null;
        pdf_storage_key: string | null;
      }>>`
        SELECT id,status,activated_at,pdf_sha256,pdf_storage_key
        FROM report_artifact_revisions WHERE report_id='report-v4' ORDER BY revision
      `;
      expect(revisions).toEqual([
        expect.objectContaining({
          id: "core-revision",
          status: "ready",
          activated_at: null,
          pdf_sha256: null,
          pdf_storage_key: null
        }),
        expect.objectContaining({
          id: "enhancement-revision",
          status: "active",
          activated_at: expect.any(Date),
          pdf_sha256: null,
          pdf_storage_key: null
        })
      ]);
      const reports = await sql<Array<{ active_artifact_revision_id: string | null }>>`
        SELECT active_artifact_revision_id FROM scan_reports WHERE id='report-v4'
      `;
      expect(reports).toEqual([{ active_artifact_revision_id: "enhancement-revision" }]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 180_000);
});

async function seedV4Report(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES('report-v4','https://example.com','example.com','{}','zh','completed')`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES('questions-v4','report-v4',1,'zh','CN','candidate','high','v4','v4','profile-v4')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason)
    VALUES('core-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','questions-v4','zh','standard')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason)
    VALUES('enhancement-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','questions-v4','zh','v4_diagnosis_enhancement')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,business_question_set_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
     product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
     report_locale,currency,amount_minor,payment_status)
    VALUES('order-v4','checkout-v4','airwallex','report-v4','core-job','questions-v4','example.com','cipher','email','v1',
      'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'paid')`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${configSnapshotId},'report-v4','order-v4','core-job',${configIdentityHash},'model-v4',${"b".repeat(64)},'{}'::jsonb,
      'report-v4',${"c".repeat(64)},'{}'::jsonb)`;
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
