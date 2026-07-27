import { createHash, randomUUID } from "node:crypto";
import type { CombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "../db";
import { claimScanJob } from "../db/jobs";
import { terminalizePaidReportV4Core } from "../db/public-source-commerce";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `ogc_v4_independent_claims_${suffix}`;
const ids = {
  reportId: `report-${suffix}`,
  orderId: `order-${suffix}`,
  coreJobId: `core-${suffix}`,
  coreArtifactId: `core-artifact-${suffix}`,
  siteSnapshotId: `site-${suffix}`,
  questionSetId: `questions-${suffix}`,
  accessKeyId: `key-${suffix}`,
  creditId: `credit-${suffix}`
};
const modelProfileHash = sha("model-profile");
const reportProfileHash = sha("report-profile");
const configIdentityHash = sha(stableJson({
  coreJobId: ids.coreJobId,
  modelProfileHash,
  orderId: ids.orderId,
  reportId: ids.reportId,
  reportProfileHash
}));
const configSnapshotId = `v4-config-${configIdentityHash}`;
const original = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  memoryPath: process.env.OPEN_GEO_DB_PATH,
  tokenSecret: process.env.OGC_TOKEN_HASH_SECRET
};

// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-COMMERCE-01
suite("Report V4 independent PostgreSQL claims", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.OGC_TOKEN_HASH_SECRET = `test-secret-${suffix}`;
    delete process.env.OPEN_GEO_DB_PATH;
    await initializeDatabaseEnvironment("staging");
    await seedQueuedCore();
  }, 180_000);

  afterAll(async () => {
    await closeDatabase();
    restore("DATABASE_URL", original.databaseUrl);
    restore("OGC_DEPLOYMENT_PROFILE", original.deploymentProfile);
    restore("OPEN_GEO_DB_PATH", original.memoryPath);
    restore("OGC_TOKEN_HASH_SECRET", original.tokenSecret);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("claims core and enhancement in separate transactions without duplicate or nested diagnosis work", async () => {
    const coreWorkers = [`core-worker-a-${suffix}`, `core-worker-b-${suffix}`];
    const concurrentCoreClaims = await Promise.all(coreWorkers.map(async (workerId) => ({
      workerId,
      job: await claimScanJob(workerId, "deep", 90)
    })));
    const coreWinners = concurrentCoreClaims.filter(({ job }) => job !== null);
    expect(coreWinners).toHaveLength(1);
    const coreWinner = coreWinners[0]!;
    expect(coreWinner.job).toMatchObject({
      id: ids.coreJobId,
      reason: "standard",
      siteSnapshotId: ids.siteSnapshotId,
      creditReservationId: ids.creditId,
      executionState: "running",
      leaseOwner: coreWinner.workerId
    });
    expect(concurrentCoreClaims.filter(({ job }) => job === null)).toHaveLength(1);

    const afterCoreClaim = (await getSqlClient()<Array<Record<string, unknown>>>`
      SELECT
        (SELECT count(*)::int FROM scan_jobs WHERE report_id=${ids.reportId}) jobs,
        (SELECT count(*)::int FROM scan_jobs WHERE report_id=${ids.reportId}
          AND reason='v4_diagnosis_enhancement') enhancements,
        (SELECT count(*)::int FROM report_v4_diagnosis_checkpoints
          WHERE report_id=${ids.reportId}) diagnoses,
        (SELECT count(*)::int FROM report_artifact_revisions WHERE report_id=${ids.reportId}
          AND revision_kind='diagnosis_enhancement') enhancement_artifacts
    `)[0]!;
    expect(afterCoreClaim).toEqual({ jobs: 1, enhancements: 0, diagnoses: 0, enhancement_artifacts: 0 });

    const report = coreReport();
    await persistActiveCore(report);
    const terminal = await terminalizePaidReportV4Core({ report, workerId: coreWinner.workerId });
    expect(terminal.enhancementJobId).not.toBe(ids.coreJobId);

    const lanes = await getSqlClient()<Array<Record<string, unknown>>>`
      SELECT id,reason,site_snapshot_id,credit_reservation_id,stage,execution_state,lease_owner
      FROM scan_jobs WHERE report_id=${ids.reportId} ORDER BY created_at,id
    `;
    expect(lanes).toEqual([
      expect.objectContaining({
        id: ids.coreJobId,
        reason: "standard",
        site_snapshot_id: ids.siteSnapshotId,
        credit_reservation_id: ids.creditId,
        stage: "completed",
        execution_state: "completed",
        lease_owner: null
      }),
      expect.objectContaining({
        id: terminal.enhancementJobId,
        reason: "v4_diagnosis_enhancement",
        site_snapshot_id: null,
        credit_reservation_id: null,
        stage: "queued",
        execution_state: "queued",
        lease_owner: null
      })
    ]);
    expect((await getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_v4_diagnosis_checkpoints WHERE report_id=${ids.reportId}
    `)[0]!.count).toBe(0);

    const enhancementWorker = `enhancement-worker-${suffix}`;
    const enhancementClaim = await claimScanJob(enhancementWorker, "deep", 90);
    expect(enhancementClaim).toMatchObject({
      id: terminal.enhancementJobId,
      reportId: ids.reportId,
      reason: "v4_diagnosis_enhancement",
      siteSnapshotId: null,
      creditReservationId: null,
      executionState: "running",
      leaseOwner: enhancementWorker
    });
    expect(await claimScanJob(`idle-worker-${suffix}`, "deep", 90)).toBeNull();
    expect((await getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM scan_job_transition_events
      WHERE job_id=${terminal.enhancementJobId} AND reason_code='lease_claimed'
    `)[0]!.count).toBe(1);
    expect((await getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_v4_diagnosis_checkpoints WHERE report_id=${ids.reportId}
    `)[0]!.count).toBe(0);
  }, 180_000);
});

async function seedQueuedCore(): Promise<void> {
  const sql = getSqlClient();
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${ids.reportId},'https://independent.example/','independent.example','{}'::jsonb,'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,
     content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.siteSnapshotId},${ids.reportId},'independent.example','completed',now()-interval '1 minute',now(),
      ${sha("collector")},${sha("content")},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,
     neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'en','US','candidate','high','v4','v4',${sha("profile")})`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`${ids.questionSetId}-q${ordinal}`},${ids.questionSetId},${ordinal},
        ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
        ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${sha(`question-${ordinal}`)})`;
  }
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase)
    VALUES(${ids.coreJobId},${ids.reportId},${ids.siteSnapshotId},'deep','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'en','standard','queued','queued',
      'website_synthesis')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,
     site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
     recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,
     amount_minor,payment_status,fulfillment_status)
    VALUES(${ids.orderId},${sha("checkout")},'airwallex',${ids.reportId},${ids.coreJobId},${ids.siteSnapshotId},
      ${ids.questionSetId},'independent.example','encrypted',${sha("email")},'v1','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','en','USD',2900,'paid','processing')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId},status='locked',
    content_hash=${sha("questions")},neutral_content_hash=${sha("neutral")},payload='{}'::jsonb,
    confirmed_at=now(),locked_at=now() WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${ids.accessKeyId},${`key-${suffix}`},${sha("access-key")},${ids.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger
    (id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status)
    VALUES(${ids.creditId},${ids.accessKeyId},${ids.reportId},${ids.coreJobId},${`reserve-${suffix}`},
      ${ids.orderId},1,'reserved')`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.creditId} WHERE id=${ids.coreJobId}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${configSnapshotId},${ids.reportId},${ids.orderId},${ids.coreJobId},${configIdentityHash},
      'model-v4',${modelProfileHash},'{}'::jsonb,'report-v4',${reportProfileHash},'{}'::jsonb)`;
}

async function persistActiveCore(report: CombinedGeoReportV4): Promise<void> {
  const sql = getSqlClient();
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,
     payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${ids.coreArtifactId},${ids.reportId},${ids.orderId},${ids.coreJobId},${configSnapshotId},
      'generation',1,'combined_geo_report_v4','active',${sha(stableJson(report))},${sha("core-html")},
      '{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`INSERT INTO combined_geo_reports
    (artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
    VALUES(${ids.coreArtifactId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.questionSetId},
      ${JSON.stringify(report)}::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.coreArtifactId} WHERE id=${ids.reportId}`;
}

function coreReport(): CombinedGeoReportV4 {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: ids.reportId,
    artifactRevisionId: ids.coreArtifactId,
    targetUrl: "https://independent.example/",
    locale: "en",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status: "completed",
    websiteSynthesis: {
      summary: "Independent core summary.",
      strengths: ["A durable strength."],
      gaps: ["A bounded gap."],
      actions: ["A concrete action."]
    },
    questions: ([1, 2, 3] as const).map((order) => ({
      order,
      questionId: `${ids.questionSetId}-q${order}`,
      questionText: `Question ${order}?`,
      status: "answered" as const,
      answer: `Answer ${order}.`,
      sources: []
    }))
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
