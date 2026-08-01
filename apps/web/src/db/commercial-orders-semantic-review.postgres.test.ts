import { createHash, randomUUID } from "node:crypto";
import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt
} from "@open-geo-console/ai-report-engine";
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

  it("verifies both Free direct receipts without forging the legacy Paid marker", async () => {
    const fixture = await seedPaidV3Fixture("direct", "direct");
    const first = await applyPaidPaymentEvent(eventInput(fixture.orderId, "direct"));
    const duplicate = await applyPaidPaymentEvent(eventInput(fixture.orderId, "direct"));
    expect(duplicate).toMatchObject({ duplicate: true, jobId: first.jobId });
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown> }>>`
      SELECT checkpoint FROM scan_jobs WHERE id=${first.jobId}
    `).resolves.toEqual([{ checkpoint: {} }]);
  }, 120_000);

  it("creates the Free carrier atomically and never retrofits an exactly-once row", async () => {
    await seedReport("repository-marked");
    const preview = previewIdentity("repository-marked");
    const first = await getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      preview,
      createPostgresReportV4AdmissionJobRepository(tx),
      { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION }
    ));
    const duplicate = await getSqlClient().begin((tx) => enqueueReportV4PreAdmissionAfterPreview(
      preview,
      createPostgresReportV4AdmissionJobRepository(tx),
      { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION }
    ));
    expect(first).toMatchObject({ created: true });
    expect(duplicate).toEqual({ jobId: first!.jobId, created: false });
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown>; max_attempts: number; dispatches: number }>>`
      SELECT checkpoint,max_attempts,
        (SELECT count(*)::int FROM job_dispatch_outbox WHERE job_id=scan_jobs.id) dispatches
      FROM scan_jobs WHERE id=${first!.jobId}
    `).resolves.toEqual([{ checkpoint: {
      freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION
    }, max_attempts: 1, dispatches: 1 }]);
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
      { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION }
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
      freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION,
      targetPageCount: 3
    });

    const legacy = await seedRunningPreAdmission("checkpoint-legacy", false);
    await expect(checkpointScanJob(legacy.jobId, "worker-legacy", {
      stage: "analyzing",
      phase: "page_analysis",
      progress: 50,
      checkpoint: { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION },
      expectedCheckpointRevision: 0
    })).rejects.toThrow(/immutable/i);
    await expect(getSqlClient()<Array<{ checkpoint: Record<string, unknown>; checkpoint_revision: number }>>`
      SELECT checkpoint,checkpoint_revision FROM scan_jobs WHERE id=${legacy.jobId}
    `).resolves.toEqual([{ checkpoint: {}, checkpoint_revision: 0 }]);
  }, 120_000);

  it("rejects a new Paid V3 transition when the Free authority is marker-absent", async () => {
    const fixture = await seedPaidV3Fixture("legacy", "absent");
    await expect(applyPaidPaymentEvent(eventInput(fixture.orderId, "legacy")))
      .rejects.toThrow(/marker|carrier/i);
    await expect(getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM scan_jobs
      WHERE report_id=${fixture.reportId} AND reason='standard' AND tier='deep'
    `).resolves.toEqual([{ count: 0 }]);
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

async function seedPaidV3Fixture(suffix: string, carrier: "direct" | "absent" | "mismatch") {
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

  const freeCheckpoint = carrier === "absent" ? {} : directFreeCheckpoint(reportId, questionSetId, questionSetIdentity);
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
  if (carrier === "mismatch") {
    const mismatched = {
      ...freeCheckpoint,
      freeTeaser: { ...freeCheckpoint.freeTeaser, questionSetIdentity: hash("wrong-lineage") }
    };
    await sql`UPDATE scan_jobs SET checkpoint=${JSON.stringify(mismatched)}::jsonb WHERE id=${`free-${suffix}`}`;
  }
  return { reportId, orderId: order.id };
}

function directFreeCheckpoint(reportId: string, questionSetId: string, questionSetIdentity: string) {
  const questions = ["Question 1?", "Question 2?", "Question 3?"];
  const answerSources = [{
    sourceId: "source-q1", title: "Source", canonicalUrl: "https://source.example/q1",
    registrableDomain: "source.example", citedText: "Evidence", providerResultOrder: 0
  }];
  const sources = answerSources.map((source) => ({ ...source, retrievalStatus: "search_source_only", ownershipCategory: "unknown" }));
  const bindings = [{ handle: "S1", evidenceRef: "source-q1" }];
  const answerResult = {
    questionId: "question-1", answerText: "Direct answer.", sources: answerSources, refusal: null,
    searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", providerResponseId: "response-1"
  };
  const provenance = {
    providerId: "fixture", model: "model", searchMode: "native", promptVersion: "generative-search-answer-v1",
    searchedAt: answerResult.searchedAt, completedAt: answerResult.completedAt,
    answerHash: hash(answerResult), sourceHash: hash(answerSources)
  };
  const analysis = {
    summary: "Direct natural analysis.", observations: [], recommendations: [], evidenceHandles: ["S1"]
  };
  const teaser: Record<string, unknown> = {
    version: "free-teaser-checkpoint-v1", stage: "ready", identityHash: "c".repeat(64), reportId,
    admissionSnapshotId: "admission-1", admissionContentIdentityHash: "d".repeat(64), foundationHash: "e".repeat(64),
    locale: "en", region: "US", authorityId: "authority-1", evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
    questionSetId, questionSetIdentity, directQuestionTexts: questions,
    directAnalysisStatus: "completed", directAnalysis: analysis, directAnalysisHandleBindings: bindings,
    readyAt: "2030-01-01T00:01:00.000Z", q1AnswerResult: answerResult,
    q1AnswerDraft: {
      questionId: "question-1", exactQuestion: "Question 1?", answerMode: "generative_search_v1", status: "answered",
      answerText: "Direct answer.", refusal: null, sources, provenance,
      audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 }
    }
  };
  teaser.directCoreReceipt = createFreeV4DirectCoreReceipt({
    questionSetIdentity, questions, questionId: "question-1", questionText: "Question 1?", answer: answerResult, sources,
    providerResponseId: "response-1", providerId: provenance.providerId, model: provenance.model,
    searchMode: provenance.searchMode, searchedAt: provenance.searchedAt, completedAt: provenance.completedAt,
    nonProseProjection: {
      version: teaser.version, identityHash: teaser.identityHash, reportId,
      admissionSnapshotId: teaser.admissionSnapshotId, admissionContentIdentityHash: teaser.admissionContentIdentityHash,
      foundationHash: teaser.foundationHash, locale: teaser.locale, region: teaser.region, authorityId: teaser.authorityId,
      evidenceCutoffAt: teaser.evidenceCutoffAt, questionSetId, questionSetIdentity,
      questionId: "question-1", answerHash: provenance.answerHash, sourceHash: provenance.sourceHash
    }
  });
  teaser.directAnalysisReceipt = createFreeV4DirectAnalysisReceipt({
    coreReceiptHash: (teaser.directCoreReceipt as { receiptHash: string }).receiptHash,
    analysis, handleBindings: bindings,
    nonProseProjection: {
      version: teaser.version, identityHash: teaser.identityHash, reportId,
      admissionSnapshotId: teaser.admissionSnapshotId, admissionContentIdentityHash: teaser.admissionContentIdentityHash,
      foundationHash: teaser.foundationHash, locale: teaser.locale, region: teaser.region,
      authorityId: teaser.authorityId, questionSetIdentity, analysisStatus: teaser.directAnalysisStatus
    }
  });
  return { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION, freeTeaser: teaser };
}

async function seedRunningPreAdmission(suffix: string, marked: boolean) {
  await seedReport(suffix);
  const jobId = `free-${suffix}`;
  await getSqlClient()`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,locale,reason,stage,execution_state,current_phase,progress,lease_owner,lease_expires_at,checkpoint)
    VALUES(${jobId},${`report-${suffix}`},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission','analyzing','running','page_analysis',40,${`worker-${marked ? "marked" : "legacy"}`},now()+interval '5 minutes',
      ${JSON.stringify(marked ? { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION } : {})}::jsonb)`;
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

function hash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
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
