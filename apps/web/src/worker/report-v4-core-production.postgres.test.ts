import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "../db";
import { createReportV4ProductionJobRepository } from "../db/report-v4-production-jobs";
import { terminalizePaidReportV4Core } from "../db/public-source-commerce";
import { runReportV4CoreStage, type ReportV4CoreStageDependencies } from "./report-v4-orchestrator";
import {
  buildReportV4CoreArtifactRevisionId,
  createReportV4CoreProduction,
  createReportV4CoreProductionWithDependencies,
  type ReportV4CoreProductionInput
} from "./report-v4-core-production";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres = adminUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `ogc_v4_core_transition_${suffix}`;
const baseIds = {
  reportId: `report-${suffix}`, orderId: `order-${suffix}`, coreJobId: `core-${suffix}`,
  siteSnapshotId: `site-${suffix}`,
  questionSetId: `questions-${suffix}`, workerId: `worker-${suffix}`,
  accessKeyId: `key-${suffix}`, creditId: `credit-${suffix}`
};
const configIdentityHash = hashStable({
  coreJobId: baseIds.coreJobId,
  modelProfileHash: sha("model"),
  orderId: baseIds.orderId,
  reportId: baseIds.reportId,
  reportProfileHash: sha("report")
});
const ids = { ...baseIds, configSnapshotId: `v4-config-${configIdentityHash}` };
const exactInput: ReportV4CoreProductionInput = {
  ...ids,
  locale: "zh",
  leaseMs: 60_000,
  signal: new AbortController().signal
};
const artifactRevisionId = buildReportV4CoreArtifactRevisionId(exactInput);
const original = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  memoryPath: process.env.OPEN_GEO_DB_PATH,
  tokenSecret: process.env.OGC_TOKEN_HASH_SECRET
};

describePostgres("Report V4 core production PostgreSQL crash transitions", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.OGC_TOKEN_HASH_SECRET = `test-secret-${suffix}`;
    delete process.env.OPEN_GEO_DB_PATH;
    await initializeDatabaseEnvironment("staging");
    await seedReservedActiveCore();
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

  it("rejects wrong and expired leases before any new write or provider work", async () => {
    const before = await counts();
    let providerCalls = 0;
    const production = createReportV4CoreProduction({
      environment: {},
      fetch: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      }
    });

    await expect(production({
      coreJobId: ids.coreJobId,
      workerId: "wrong-worker",
      leaseMs: 60_000,
      signal: new AbortController().signal
    })).rejects.toThrow(/lease.*worker|worker.*lease/i);
    expect(await counts()).toEqual(before);
    expect(providerCalls).toBe(0);

    await getSqlClient()`UPDATE scan_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=${ids.coreJobId}`;
    await expect(production({
      coreJobId: ids.coreJobId,
      workerId: ids.workerId,
      leaseMs: 60_000,
      signal: new AbortController().signal
    })).rejects.toThrow(/live lease|lease.*worker/i);
    expect(await counts()).toEqual(before);
    expect(providerCalls).toBe(0);
    await getSqlClient()`UPDATE scan_jobs SET lease_expires_at=now()+interval '5 minutes' WHERE id=${ids.coreJobId}`;
  });

  it("reloads an exact active-reserved crash with zero model calls and atomically completes commerce", async () => {
    const context = await createReportV4ProductionJobRepository().loadClaimedPaidCoreContext({
      coreJobId: ids.coreJobId,
      workerId: ids.workerId
    });
    expect(context.commercePhase).toBe("reserved_active");
    let modelCalls = 0;
    let prepareCalls = 0;
    const run = createReportV4CoreProductionWithDependencies({
      async loadPaidCoreContext() { return context; },
      async loadConfigSnapshot() {
        return {
          id: ids.configSnapshotId, reportId: ids.reportId, orderId: ids.orderId, coreJobId: ids.coreJobId,
          identityHash: configIdentityHash, modelProfileId: "model-v4", modelProfileHash: sha("model"),
          modelProfile: {} as never, reportProfileId: "report-v4", reportProfileHash: sha("report"),
          reportProfile: {} as never, createdAt: new Date()
        };
      },
      resolveLockedConfiguration() { return { modelRuntime: {} as never, reportRuntime: {} as never }; },
      createCoreStageDependencies(): ReportV4CoreStageDependencies {
        return {
          nowMs: () => 1,
          nowIso: () => "2026-07-17T00:00:00.000Z",
          async loadCoreArtifact() {
            return { report: coreReport(), payloadIdentityHash: sha(JSON.stringify(coreReport())), htmlSha256: sha("html") };
          },
          async resolveSnapshot() { return snapshotBundle(); },
          async synthesizeWebsite() { modelCalls += 1; throw new Error("must reuse"); },
          async answerQuestions() { modelCalls += 1; throw new Error("must reuse"); },
          async prepareCoreRevision() { prepareCalls += 1; },
          async renderCoreHtml() { throw new Error("must reuse"); },
          async persistCoreArtifact() { throw new Error("must reuse"); },
          async activateCoreRevision() {},
          async terminalizeUnavailableCore() { throw new Error("not unavailable"); },
          async terminalizeDeliverableCoreAndEnqueueEnhancement({ report }) {
            const terminal = await terminalizePaidReportV4Core({ report, workerId: ids.workerId });
            return { enhancementJobId: terminal.enhancementJobId };
          }
        };
      }
    });

    const result = await run({ ...exactInput, signal: new AbortController().signal });
    expect(result.delivery).toBe("core_active");
    expect(result.counters.modelCalls.total).toBe(0);
    expect(modelCalls).toBe(0);
    expect(prepareCalls).toBe(0);
    expect(await counts()).toMatchObject({ artifacts: 1, jobCompleted: 1, settledCredits: 1, accessTokens: 1, enhancements: 1 });
  }, 180_000);

  it("keeps all-unavailable orchestration artifact-free", async () => {
    let prepared = 0;
    const unavailableReportId = `unavailable-${suffix}`;
    const dependencies: ReportV4CoreStageDependencies = {
      nowMs: () => 1, nowIso: () => "2026-07-17T00:00:00.000Z",
      async loadCoreArtifact() { return null; },
      async resolveSnapshot() { return { ...snapshotBundle(), snapshot: { ...snapshotBundle().snapshot, reportId: unavailableReportId } }; },
      async synthesizeWebsite() { return { websiteSynthesis: coreReport().websiteSynthesis, modelCalls: 0 }; },
      async answerQuestions() {
        return {
          questions: ([1, 2, 3] as const).map((order) => ({
            order, questionId: `uq${order}`, questionText: `Unavailable ${order}?`,
            status: "unavailable" as const, answer: null, sources: []
          })),
          reusedQuestionIds: [], modelCalls: 0, providerRetries: 0
        };
      },
      async prepareCoreRevision() { prepared += 1; },
      async renderCoreHtml() { throw new Error("must not render"); },
      async persistCoreArtifact() { throw new Error("must not persist"); },
      async activateCoreRevision() { throw new Error("must not activate"); },
      async terminalizeUnavailableCore() {},
      async terminalizeDeliverableCoreAndEnqueueEnhancement() { throw new Error("must not deliver"); }
    };
    const result = await runReportV4CoreStage({
      reportId: unavailableReportId, orderId: "unavailable-order", coreJobId: "unavailable-job",
      configSnapshotId: "unavailable-config", questionSetId: "unavailable-questions",
      coreArtifactRevisionId: "unavailable-artifact", targetUrl: "https://crash.example/", locale: "zh",
      snapshotIdentity: { id: ids.siteSnapshotId, reportId: unavailableReportId, siteKey: "crash.example", collectorConfigIdentityHash: sha("collector"), contentIdentityHash: sha("content") },
      questions: [1, 2, 3].map((order) => ({ order: order as 1 | 2 | 3, questionId: `uq${order}`, questionText: `Unavailable ${order}?` })) as never
    }, dependencies);
    expect(result.delivery).toBe("unavailable");
    expect(prepared).toBe(0);
    const rows = await getSqlClient()<Array<{ count: number }>>`SELECT count(*)::int count FROM report_artifact_revisions WHERE report_id=${unavailableReportId}`;
    expect(rows[0]!.count).toBe(0);
  });
});

function coreReport(): CombinedGeoReportV4 {
  return {
    version: 4, artifactContract: "combined_geo_report_v4", reportId: ids.reportId, artifactRevisionId,
    targetUrl: "https://crash.example/", locale: "zh", generatedAt: "2026-07-17T00:00:00.000Z",
    status: "completed", websiteSynthesis: { summary: "Summary", strengths: [], gaps: [], actions: [] },
    questions: ([1, 2, 3] as const).map((order) => ({
      order, questionId: `${ids.questionSetId}-q${order}`, questionText: `Question ${order}?`,
      status: "answered" as const, answer: `Answer ${order}.`, sources: []
    }))
  };
}

function snapshotBundle() {
  const date = new Date("2026-07-17T00:00:00.000Z");
  return {
    snapshot: {
      id: ids.siteSnapshotId, reportId: ids.reportId, siteKey: "crash.example",
      collectorConfigIdentityHash: sha("collector"), capturedAt: date, status: "completed" as const,
      completedAt: date, contentIdentityHash: sha("content"), candidateUrlCount: 1,
      analyzablePageCount: 1, excludedPageCount: 0, createdAt: date
    },
    pages: [{
      id: `page-${suffix}`, snapshotId: ids.siteSnapshotId, ordinal: 1, normalizedUrl: "https://crash.example/",
      analyzable: true, readMode: "direct_readable" as const, summary: null, retainedText: "content",
      contentHash: sha("page"), exclusionReason: null, createdAt: date
    }]
  };
}

async function seedReservedActiveCore() {
  const sql = getSqlClient();
  const report = coreReport();
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${ids.reportId},${report.targetUrl},'crash.example','{}','zh','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.siteSnapshotId},${ids.reportId},'crash.example','completed',now()-interval '1 minute',now(),${sha("collector")},${sha("content")},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'zh','CN','candidate','high','v4','v4',${sha("profile")})`;
  for (const ordinal of [1, 2, 3]) await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
    VALUES(${`${ids.questionSetId}-q${ordinal}`},${ids.questionSetId},${ordinal},${["core_service_discovery","customer_region_fit","purchase_delivery_risk"][ordinal-1]!},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${sha(`q${ordinal}`)})`;
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,lease_owner,lease_expires_at)
    VALUES(${ids.coreJobId},${ids.reportId},${ids.siteSnapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'zh','standard','synthesizing','running','terminalization',${ids.workerId},now()+interval '5 minutes')`;
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
    VALUES(${ids.orderId},${sha("checkout")},'airwallex',${ids.reportId},${ids.siteSnapshotId},${ids.coreJobId},'crash.example','encrypted',${sha("email")},'v1','recommendation_forensics_v1',${ids.questionSetId},'two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId},status='locked',
    content_hash=${sha("questions-content")},neutral_content_hash=${sha("questions-neutral")},
    payload=${JSON.stringify({ questions: coreReport().questions.map(({ order, questionId, questionText }) => ({ order, questionId, questionText })) })}::jsonb,
    confirmed_at=now(),locked_at=now() WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining) VALUES(${ids.accessKeyId},'key',${sha("key")},${ids.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status) VALUES(${ids.creditId},${ids.accessKeyId},${ids.reportId},${ids.coreJobId},'reserve',${ids.orderId},1,'reserved')`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.creditId} WHERE id=${ids.coreJobId}`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${ids.configSnapshotId},${ids.reportId},${ids.orderId},${ids.coreJobId},${configIdentityHash},'model-v4',${sha("model")},'{}','report-v4',${sha("report")},'{}')`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${artifactRevisionId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.configSnapshotId},'generation',1,'combined_geo_report_v4','active',${sha(JSON.stringify(report))},${sha("html")},'{"htmlCanonical":true}',now(),now())`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload) VALUES(${artifactRevisionId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.questionSetId},${JSON.stringify(report)}::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${artifactRevisionId} WHERE id=${ids.reportId}`;
}

async function counts() {
  return (await getSqlClient()<Array<{ artifacts: number; jobCompleted: number; settledCredits: number; accessTokens: number; enhancements: number }>>`
    SELECT (SELECT count(*)::int FROM report_artifact_revisions WHERE report_id=${ids.reportId}) artifacts,
      (SELECT count(*)::int FROM scan_jobs WHERE id=${ids.coreJobId} AND execution_state='completed') "jobCompleted",
      (SELECT count(*)::int FROM credit_ledger WHERE id=${ids.creditId} AND status='settled') "settledCredits",
      (SELECT count(*)::int FROM report_access_tokens WHERE report_id=${ids.reportId}) "accessTokens",
      (SELECT count(*)::int FROM scan_jobs WHERE report_id=${ids.reportId} AND reason='v4_diagnosis_enhancement') enhancements`)[0]!;
}

function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function hashStable(value: unknown) { return sha(stableJson(value)); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function quote(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string) { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function restore(key: string, value: string | undefined) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
