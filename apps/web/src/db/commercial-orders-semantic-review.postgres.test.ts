import { createHash, randomUUID } from "node:crypto";
import { REPORT_SEMANTIC_REVIEW_CONTRACT } from "@open-geo-console/ai-report-engine";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyPaidPaymentEvent,
  createPaymentOrder,
  type ApplyPaidPaymentEventInput
} from "./commercial-orders";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";
import { checkpointScanJob } from "./jobs";
import {
  createPostgresReportV4AdmissionJobRepository,
  enqueueReportV4PreAdmissionAfterPreview
} from "./report-v4-admission-jobs";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_semantic_carrier_${randomUUID().replaceAll("-", "")}`;
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  tokenHashSecret: process.env.OGC_TOKEN_HASH_SECRET
};

describeDisposablePostgres("Paid V3 semantic-review checkpoint carrier", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.OGC_TOKEN_HASH_SECRET = "semantic-carrier-test-token-hash-secret-32";
    await initializeDatabaseEnvironment("staging");
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    restoreEnvironment("DATABASE_URL", originalEnvironment.databaseUrl);
    restoreEnvironment("OGC_DEPLOYMENT_PROFILE", originalEnvironment.deploymentProfile);
    restoreEnvironment("OGC_TOKEN_HASH_SECRET", originalEnvironment.tokenHashSecret);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("copies an exact Free marker into the Paid V3 job and preserves it on idempotent replay", async () => {
    const fixture = await seedPaidV3Fixture("marked", "exact");
    const first = await applyPaidPaymentEvent(eventInput(fixture.orderId, "marked"));
    const duplicate = await applyPaidPaymentEvent(eventInput(fixture.orderId, "marked"));
    expect(duplicate).toMatchObject({ duplicate: true, jobId: first.jobId });
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown> }>>`
      SELECT checkpoint FROM scan_jobs WHERE id=${first.jobId}
    `).resolves.toEqual([{ checkpoint: {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    } }]);
  }, 120_000);

  it("creates the Free carrier atomically and never retrofits an exactly-once row", async () => {
    await seedReport("repository-marked");
    const preview = previewIdentity("repository-marked");
    const first = await getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      preview,
      createPostgresReportV4AdmissionJobRepository(tx),
      { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    ));
    const duplicate = await getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      preview,
      createPostgresReportV4AdmissionJobRepository(tx),
      { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    ));
    expect(first).toMatchObject({ created: true });
    expect(duplicate).toEqual({ jobId: first!.jobId, created: false });
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown>; dispatches: number }>>`
      SELECT checkpoint,
        (SELECT count(*)::int FROM job_dispatch_outbox WHERE job_id=scan_jobs.id) dispatches
      FROM scan_jobs WHERE id=${first!.jobId}
    `).resolves.toEqual([{ checkpoint: {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    }, dispatches: 1 }]);
    await expect(getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      preview,
      createPostgresReportV4AdmissionJobRepository(tx)
    ))).rejects.toThrow(/creation authority/i);

    await seedReport("repository-legacy");
    const legacyPreview = previewIdentity("repository-legacy");
    const legacy = await getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      legacyPreview,
      createPostgresReportV4AdmissionJobRepository(tx)
    ));
    await expect(getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      legacyPreview,
      createPostgresReportV4AdmissionJobRepository(tx),
      { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    ))).rejects.toThrow(/creation authority/i);
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown> }>>`
      SELECT checkpoint FROM scan_jobs WHERE id=${legacy!.jobId}
    `).resolves.toEqual([{ checkpoint: {} }]);
  }, 120_000);

  it("preserves a created carrier across checkpoint writes and rejects a late add before persistence", async () => {
    const marked = await seedRunningPreAdmission("checkpoint-marked", true);
    const updated = await checkpointScanJob(marked.jobId, "worker-marked", {
      stage: "analyzing",
      phase: "page_analysis",
      progress: 50,
      checkpoint: { targetPageCount: 3 },
      expectedCheckpointRevision: 0
    });
    expect(updated.checkpoint).toMatchObject({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      targetPageCount: 3
    });

    const legacy = await seedRunningPreAdmission("checkpoint-legacy", false);
    await expect(checkpointScanJob(legacy.jobId, "worker-legacy", {
      stage: "analyzing",
      phase: "page_analysis",
      progress: 50,
      checkpoint: { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT },
      expectedCheckpointRevision: 0
    })).rejects.toThrow(/immutable/i);
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown>; checkpoint_revision: number }>>`
      SELECT checkpoint,checkpoint_revision FROM scan_jobs WHERE id=${legacy.jobId}
    `).resolves.toEqual([{ checkpoint: {}, checkpoint_revision: 0 }]);
  }, 120_000);

  it("keeps the Paid V3 checkpoint empty when the Free authority is marker-absent", async () => {
    const fixture = await seedPaidV3Fixture("legacy", "absent");
    const paid = await applyPaidPaymentEvent(eventInput(fixture.orderId, "legacy"));
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown> }>>`
      SELECT checkpoint FROM scan_jobs WHERE id=${paid.jobId}
    `).resolves.toEqual([{ checkpoint: {} }]);
  }, 120_000);

  it("rolls back payment, credit, job and artifact effects for a mismatched marker-bearing lineage", async () => {
    const fixture = await seedPaidV3Fixture("mismatch", "mismatch");
    await expect(applyPaidPaymentEvent(eventInput(fixture.orderId, "mismatch"))).rejects.toThrow(/semantic-review|lineage/i);
    const [state] = await getSqlClient()<Array<{
      payment_status: string;
      event_count: number;
      paid_job_count: number;
      credit_count: number;
      artifact_count: number;
    }>>`
      SELECT payment_status,
        (SELECT count(*)::int FROM payment_events WHERE order_id=${fixture.orderId}) event_count,
        (SELECT count(*)::int FROM scan_jobs WHERE report_id=${fixture.reportId} AND reason='standard' AND tier='deep') paid_job_count,
        (SELECT count(*)::int FROM credit_ledger WHERE payment_order_id=${fixture.orderId}) credit_count,
        (SELECT count(*)::int FROM report_artifact_revisions WHERE order_id=${fixture.orderId}) artifact_count
      FROM payment_orders WHERE id=${fixture.orderId}
    `;
    expect(state).toEqual({
      payment_status: "created",
      event_count: 0,
      paid_job_count: 0,
      credit_count: 0,
      artifact_count: 0
    });
  }, 120_000);
});

async function seedPaidV3Fixture(suffix: string, carrier: "exact" | "absent" | "mismatch") {
  const sql = getSqlClient();
  const reportId = `report-${suffix}`;
  const questionSetId = `questions-${suffix}`;
  const questionSetIdentity = hash(`private-${suffix}`);
  await seedReport(suffix);
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
     neutralization_version,profile_evidence_identity)
    VALUES(${questionSetId},${reportId},1,'en','US','candidate','high',false,'v4','v4',${`profile-${suffix}`})`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`question-${suffix}-${ordinal}`},${questionSetId},${ordinal},
       ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
       ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Neutral ${ordinal}?`},${hash(`question-${suffix}-${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='confirmed',confirmed_at=now(),
    content_hash=${questionSetIdentity},neutral_content_hash=${hash(`neutral-${suffix}`)},payload='{}'::jsonb
    WHERE id=${questionSetId}`;

  const freeCheckpoint = carrier === "absent" ? {} : {
    semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
    freeTeaser: {
      version: "free-teaser-checkpoint-v1",
      stage: "ready",
      reportId,
      questionSetId,
      questionSetIdentity: carrier === "mismatch" ? hash("wrong-lineage") : questionSetIdentity
    }
  };
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,locale,reason,stage,execution_state,current_phase,progress,checkpoint)
    VALUES(${`free-${suffix}`},${reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission','completed','completed','terminalization',100,
      ${JSON.stringify(freeCheckpoint)}::jsonb)`;
  const order = await createPaymentOrder({
    checkoutIdempotencyHmac: `checkout-${suffix}`,
    provider: "airwallex",
    reportId,
    siteKey: `${suffix}.example`,
    customerEmailEncrypted: "cipher",
    customerEmailHmac: `email-${suffix}`,
    emailKeyVersion: "v1",
    productCode: "recommendation_forensics_v1",
    businessQuestionSetId: questionSetId,
    catalogVersion: "v3",
    termsVersion: "v3",
    refundPolicyVersion: "v3",
    reportLocale: "en",
    currency: "USD",
    amountMinor: 2900
  });
  return { reportId, orderId: order.id };
}

async function seedRunningPreAdmission(suffix: string, marked: boolean) {
  await seedReport(suffix);
  const jobId = `free-${suffix}`;
  await getSqlClient()`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,locale,reason,stage,execution_state,current_phase,progress,lease_owner,lease_expires_at,checkpoint)
    VALUES(${jobId},${`report-${suffix}`},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission','analyzing','running','page_analysis',40,${`worker-${marked ? "marked" : "legacy"}`},now()+interval '5 minutes',
      ${JSON.stringify(marked ? { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT } : {})}::jsonb)`;
  return { jobId };
}

async function seedReport(suffix: string): Promise<void> {
  await getSqlClient()`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${`report-${suffix}`},${`https://${suffix}.example/`},${`${suffix}.example`},'en','completed')`;
}

function previewIdentity(suffix: string) {
  return {
    reportId: `report-${suffix}`,
    locale: "en" as const,
    tier: "free" as const,
    productContract: "legacy_website_audit_v1" as const,
    reason: "standard" as const,
    stage: "completed" as const
  };
}

function eventInput(orderId: string, suffix: string): ApplyPaidPaymentEventInput {
  return {
    provider: "airwallex",
    providerEventId: `event-${suffix}`,
    eventType: "payment_intent.succeeded",
    orderId,
    providerPaymentId: `intent-${suffix}`,
    providerCreatedAt: new Date("2026-07-23T00:00:00.000Z"),
    payloadHash: hash(`event-${suffix}`)
  };
}

function hash(value: string): string {
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

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
