import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";
import {
  terminalizeReportV4EnhancementJob,
  type ReportV4EnhancementTerminalizationInput
} from "./report-v4-enhancement-terminalization";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const dbName = `ogc_v4_enh_terminal_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const databaseUrl = (value: string) => `${value.replace(/\/[^/]+$/, "")}/${dbName}`;

suite("report v4 enhancement terminalizer PostgreSQL contract", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    process.env.DATABASE_URL = databaseUrl(adminUrl!);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    await initializeDatabaseEnvironment("staging");
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("terminalizes an active completed enhancement, preserves commercial truth and is idempotent after commit", async () => {
    const fixture = await seedLineage("completed", "active");
    const sql = getSqlClient();
    const before = await commercialTruth(fixture);

    await terminalizeReportV4EnhancementJob(input(fixture, "completed"));
    await expect(terminalizeReportV4EnhancementJob(input(fixture, "completed"))).resolves.toBeUndefined();

    expect(await enhancementState(fixture)).toMatchObject({
      stage: "completed", execution_state: "completed", current_phase: "terminalization", progress: 100,
      lease_owner: null, lease_expires_at: null, error_code: null, public_error: null,
      checkpoint: { reportV4Diagnosis: { completedQuestionIds: fixture.questionIds.slice(0, 2), failedQuestionIds: [fixture.questionIds[2]] } }
    });
    expect(await commercialTruth(fixture)).toEqual(before);
    expect((await sql`SELECT status FROM report_artifact_revisions WHERE id=${fixture.coreArtifactId}`)[0]?.status).toBe("ready");
  });

  it("terminalizes the exact two-question partition when one source-core question is unavailable", async () => {
    const fixture = await seedLineage("completed-partial", "active", { unavailableQuestion: 3 });
    const before = await commercialTruth(fixture);
    await terminalizeReportV4EnhancementJob({
      ...input(fixture, "completed"),
      completedQuestionIds: [fixture.questionIds[0]],
      failedQuestionIds: [fixture.questionIds[1]]
    });
    expect(await enhancementState(fixture)).toMatchObject({ stage: "completed", execution_state: "completed" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it("rejects a partition that omits an answered source-core question", async () => {
    const fixture = await seedLineage("partial-omitted", "active", { unavailableQuestion: 3 });
    const before = await commercialTruth(fixture);
    await expect(terminalizeReportV4EnhancementJob({
      ...input(fixture, "completed"),
      completedQuestionIds: [fixture.questionIds[0]],
      failedQuestionIds: []
    })).rejects.toThrow(/answered source-core question/i);
    expect(await enhancementState(fixture)).toMatchObject({ stage: "analyzing", execution_state: "running" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it("rejects a partition that includes an unavailable source-core question", async () => {
    const fixture = await seedLineage("partial-unavailable", "active", { unavailableQuestion: 3 });
    const before = await commercialTruth(fixture);
    await expect(terminalizeReportV4EnhancementJob({
      ...input(fixture, "completed"),
      completedQuestionIds: [fixture.questionIds[0]],
      failedQuestionIds: [fixture.questionIds[1], fixture.questionIds[2]]
    })).rejects.toThrow(/answered source-core question/i);
    expect(await enhancementState(fixture)).toMatchObject({ stage: "analyzing", execution_state: "running" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it("terminalizes a failed enhancement before any artifact revision exists", async () => {
    const fixture = await seedLineage("failed-no-revision", null);
    const before = await commercialTruth(fixture);

    await terminalizeReportV4EnhancementJob(input(fixture, "failed"));

    expect(await enhancementState(fixture)).toMatchObject({
      stage: "failed", execution_state: "failed", current_phase: "terminalization",
      lease_owner: null, lease_expires_at: null,
      error_code: "report_v4_diagnosis_enhancement_failed",
      public_error: "The diagnostic enhancement was not available."
    });
    expect(await commercialTruth(fixture)).toEqual(before);
    expect(await getSqlClient()`SELECT id FROM report_artifact_revisions WHERE job_id=${fixture.enhancementJobId}`).toEqual([]);
  });

  it("terminalizes a failed enhancement with its exact failed revision and remains idempotent", async () => {
    const fixture = await seedLineage("failed-revision", "failed");
    const before = await commercialTruth(fixture);
    const failedInput = input(fixture, "failed");

    await Promise.all([terminalizeReportV4EnhancementJob(failedInput), terminalizeReportV4EnhancementJob(failedInput)]);
    await expect(terminalizeReportV4EnhancementJob(failedInput)).resolves.toBeUndefined();

    expect(await enhancementState(fixture)).toMatchObject({ stage: "failed", execution_state: "failed" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it.each(["pending", "ready"] as const)("rejects a failed terminalization while its revision is %s", async (status) => {
    const fixture = await seedLineage(`reject-${status}`, status);
    const before = await commercialTruth(fixture);

    await expect(terminalizeReportV4EnhancementJob(input(fixture, "failed"))).rejects.toThrow(/pending, ready or active/i);

    expect(await enhancementState(fixture)).toMatchObject({ stage: "analyzing", execution_state: "running" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it.each([
    ["wrong owner", "different-worker", "future"],
    ["expired lease", "fixture-worker", "expired"]
  ] as const)("rejects an independently running enhancement with %s", async (_label, owner, expiry) => {
    const fixture = await seedLineage(`lease-${expiry}`, null, { leaseOwner: owner, leaseExpiry: expiry });
    const before = await commercialTruth(fixture);

    await expect(terminalizeReportV4EnhancementJob(input(fixture, "failed"))).rejects.toThrow(/not leased by this worker/i);

    expect(await enhancementState(fixture)).toMatchObject({ stage: "analyzing", execution_state: "running" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });

  it("serializes concurrent completed terminalization to one exact committed state", async () => {
    const fixture = await seedLineage("concurrent", "active");
    const completedInput = input(fixture, "completed");
    const before = await commercialTruth(fixture);

    await Promise.all(Array.from({ length: 12 }, () => terminalizeReportV4EnhancementJob(completedInput)));

    expect(await enhancementState(fixture)).toMatchObject({ stage: "completed", execution_state: "completed" });
    expect(await commercialTruth(fixture)).toEqual(before);
  });
});

type RevisionStatus = "pending" | "ready" | "active" | "failed" | null;

interface Fixture {
  suffix: string;
  reportId: string;
  siteSnapshotId: string;
  questionSetId: string;
  questionIds: readonly [string, string, string];
  coreJobId: string;
  orderId: string;
  accessKeyId: string;
  creditId: string;
  configSnapshotId: string;
  coreArtifactId: string;
  accessTokenId: string;
  enhancementJobId: string;
  enhancementArtifactId: string;
  workerId: string;
}

async function seedLineage(
  label: string,
  revisionStatus: RevisionStatus,
  options: { leaseOwner?: string; leaseExpiry?: "future" | "expired"; unavailableQuestion?: 1 | 2 | 3 } = {}
): Promise<Fixture> {
  const suffix = `${label}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const configIdentity = sha(`config-${suffix}`);
  const fixture: Fixture = {
    suffix,
    reportId: `report-${suffix}`,
    siteSnapshotId: `site-${suffix}`,
    questionSetId: `questions-${suffix}`,
    questionIds: [`question-${suffix}-1`, `question-${suffix}-2`, `question-${suffix}-3`],
    coreJobId: `core-${suffix}`,
    orderId: `order-${suffix}`,
    accessKeyId: `key-${suffix}`,
    creditId: `credit-${suffix}`,
    configSnapshotId: `v4-config-${configIdentity}`,
    coreArtifactId: `core-artifact-${suffix}`,
    accessTokenId: `token-${suffix}`,
    enhancementJobId: `enhancement-${suffix}`,
    enhancementArtifactId: `enhancement-artifact-${suffix}`,
    workerId: "fixture-worker"
  };
  const sql = getSqlClient();

  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${fixture.reportId},${`https://${suffix}.example/`},${`${suffix}.example`},'{}'::jsonb,'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
     candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${fixture.siteSnapshotId},${fixture.reportId},${`${suffix}.example`},'completed',now()-interval '1 minute',now(),
      ${sha(`collector-${suffix}`)},${sha(`content-${suffix}`)},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${fixture.questionSetId},${fixture.reportId},1,'en','US','candidate','high','v4','v4',${sha(`profile-${suffix}`)})`;
  for (const [index, purpose] of ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"].entries()) {
    const ordinal = index + 1;
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${fixture.questionIds[index]},${fixture.questionSetId},${ordinal},${purpose},${`Question ${ordinal}`},
        ${`Private ${ordinal}`},${`Neutral ${ordinal}`},${sha(`question-${suffix}-${ordinal}`)})`;
  }
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,progress)
    VALUES(${fixture.coreJobId},${fixture.reportId},${fixture.siteSnapshotId},'deep','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'combined_geo_report_v4',${fixture.questionSetId},'en','standard',
      'completed','completed','terminalization',100)`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,site_key,
     customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
     recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,
     payment_status,fulfillment_status,refund_status)
    VALUES(${fixture.orderId},${sha(`checkout-${suffix}`)},'airwallex',${fixture.reportId},${fixture.coreJobId},
      ${fixture.siteSnapshotId},${fixture.questionSetId},${`${suffix}.example`},'encrypted',${sha(`email-${suffix}`)},'v1',
      'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','en','USD',2900,
      'paid','completed','not_required')`;
  await sql`UPDATE report_business_question_sets SET order_id=${fixture.orderId},status='locked',
    content_hash=${sha(`questions-${suffix}`)},neutral_content_hash=${sha(`neutral-${suffix}`)},payload='{}'::jsonb,
    confirmed_at=now(),locked_at=now() WHERE id=${fixture.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${fixture.accessKeyId},${`key-${suffix}`},${sha(`key-${suffix}`)},${fixture.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger
    (id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status,settled_at)
    VALUES(${fixture.creditId},${fixture.accessKeyId},${fixture.reportId},${fixture.coreJobId},${`settled-${suffix}`},
      ${fixture.orderId},1,'settled',now())`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${fixture.creditId} WHERE id=${fixture.coreJobId}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${fixture.configSnapshotId},${fixture.reportId},${fixture.orderId},${fixture.coreJobId},${configIdentity},
      'model-v4',${sha(`model-${suffix}`)},'{}'::jsonb,'report-v4',${sha(`report-${suffix}`)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,
     payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${fixture.coreArtifactId},${fixture.reportId},${fixture.orderId},${fixture.coreJobId},${fixture.configSnapshotId},
      'generation',1,'combined_geo_report_v4','active',${sha(`core-payload-${suffix}`)},${sha(`core-html-${suffix}`)},
      '{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
    VALUES(${fixture.coreArtifactId},${fixture.reportId},${fixture.orderId},${fixture.coreJobId},${fixture.questionSetId},
      ${JSON.stringify(sourceCorePayload(fixture, options.unavailableQuestion))}::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${fixture.coreArtifactId} WHERE id=${fixture.reportId}`;
  await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
    VALUES(${fixture.accessTokenId},${fixture.reportId},'ogc_report_fixture',${sha(`token-${suffix}`)},
      'combined_geo_report_v4',now()+interval '30 days')`;

  const leaseOwner = options.leaseOwner ?? fixture.workerId;
  const leaseExpiry = options.leaseExpiry === "expired" ? "-1 minute" : "10 minutes";
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,progress,
     lease_owner,lease_expires_at,credit_reservation_id,correction_id,replacement_fulfillment_id)
    VALUES(${fixture.enhancementJobId},${fixture.reportId},NULL,'deep','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'combined_geo_report_v4',${fixture.questionSetId},'en','v4_diagnosis_enhancement',
      'analyzing','running','evidence_graph',50,${leaseOwner},now()+${leaseExpiry}::interval,NULL,NULL,NULL)`;

  if (revisionStatus) await seedEnhancementRevision(fixture, revisionStatus);
  return fixture;
}

async function seedEnhancementRevision(fixture: Fixture, status: Exclude<RevisionStatus, null>): Promise<void> {
  const sql = getSqlClient();
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision_kind,revision,
     artifact_contract,status,payload_identity_hash)
    VALUES(${fixture.enhancementArtifactId},${fixture.reportId},${fixture.orderId},${fixture.enhancementJobId},
      ${fixture.configSnapshotId},${fixture.coreArtifactId},'diagnosis_enhancement',2,'combined_geo_report_v4','pending',
      ${`v4-pending:${fixture.enhancementJobId}:${fixture.enhancementArtifactId}`})`;
  if (status === "pending") return;
  if (status === "failed") {
    await sql`UPDATE report_artifact_revisions SET status='failed' WHERE id=${fixture.enhancementArtifactId}`;
    return;
  }
  await sql`UPDATE report_artifact_revisions SET status='ready',payload_identity_hash=${sha(`enhanced-payload-${fixture.suffix}`)},
    html_sha256=${sha(`enhanced-html-${fixture.suffix}`)},readiness='{"htmlCanonical":true}'::jsonb,ready_at=now()
    WHERE id=${fixture.enhancementArtifactId}`;
  if (status === "ready") return;
  await sql.begin(async (transaction) => {
    await transaction`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL
      WHERE id=${fixture.coreArtifactId} AND status='active'`;
    await transaction`UPDATE report_artifact_revisions SET status='active',activated_at=now()
      WHERE id=${fixture.enhancementArtifactId} AND status='ready'`;
    await transaction`UPDATE scan_reports SET active_artifact_revision_id=${fixture.enhancementArtifactId}
      WHERE id=${fixture.reportId}`;
  });
}

function input(fixture: Fixture, outcome: "completed" | "failed"): ReportV4EnhancementTerminalizationInput {
  return {
    reportId: fixture.reportId,
    coreJobId: fixture.coreJobId,
    enhancementJobId: fixture.enhancementJobId,
    sourceCoreArtifactRevisionId: fixture.coreArtifactId,
    enhancementArtifactRevisionId: fixture.enhancementArtifactId,
    outcome,
    completedQuestionIds: outcome === "completed" ? fixture.questionIds.slice(0, 2) : [fixture.questionIds[0]],
    failedQuestionIds: outcome === "completed" ? [fixture.questionIds[2]] : fixture.questionIds.slice(1),
    workerId: fixture.workerId
  };
}

async function enhancementState(fixture: Fixture): Promise<Record<string, unknown>> {
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    SELECT stage,execution_state,current_phase,progress,lease_owner,lease_expires_at,error_code,public_error,checkpoint
    FROM scan_jobs WHERE id=${fixture.enhancementJobId}
  `;
  return rows[0]!;
}

async function commercialTruth(fixture: Fixture): Promise<Record<string, unknown>> {
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    SELECT core.stage AS core_stage,core.execution_state AS core_execution_state,
      core.credit_reservation_id,orders.payment_status,orders.fulfillment_status,orders.refund_status,
      credit.status AS credit_status,keys.status AS access_key_status,keys.credits_remaining,
      source.status AS source_status,source.payload_identity_hash AS source_payload_identity_hash,
      report.active_artifact_revision_id,
      (SELECT count(*)::int FROM report_access_tokens token WHERE token.report_id=${fixture.reportId}
        AND token.revoked_at IS NULL AND token.expires_at>now()
        AND token.artifact_scope='combined_geo_report_v4') AS active_access_count
    FROM scan_jobs core
    JOIN payment_orders orders ON orders.id=${fixture.orderId}
    JOIN credit_ledger credit ON credit.id=${fixture.creditId}
    JOIN access_keys keys ON keys.id=${fixture.accessKeyId}
    JOIN report_artifact_revisions source ON source.id=${fixture.coreArtifactId}
    JOIN scan_reports report ON report.id=${fixture.reportId}
    WHERE core.id=${fixture.coreJobId}
  `;
  return rows[0]!;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceCorePayload(fixture: Fixture, unavailableQuestion?: 1 | 2 | 3) {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: fixture.reportId,
    artifactRevisionId: fixture.coreArtifactId,
    targetUrl: `https://${fixture.suffix}.example/`,
    locale: "en",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: unavailableQuestion ? "completed_limited" : "completed",
    websiteSynthesis: {
      summary: "Website synthesis.", strengths: ["Strength."], gaps: ["Gap."], actions: ["Action."]
    },
    questions: fixture.questionIds.map((questionId, index) => {
      const order = index + 1;
      const unavailable = order === unavailableQuestion;
      return {
        order,
        questionId,
        questionText: `Question ${order}`,
        status: unavailable ? "unavailable" : "answered",
        answer: unavailable ? null : `Answer ${order}`,
        sources: []
      };
    })
  };
}
