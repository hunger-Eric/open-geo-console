import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4ArtifactPersistenceStore,
  createReportV4ArtifactPersistencePostgresDatabase,
  getReportV4ArtifactPayload,
  persistReportV4ArtifactPayload,
  type ReportV4ArtifactPersistencePostgresDatabase,
  type ReportV4ArtifactPersistenceSql,
  type ReportV4ArtifactPersistenceSqlValue
} from "./report-v4-artifact-persistence";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_payload_${randomUUID().replaceAll("-", "")}`;
const canonicalHtml = '<main data-report-version="4"><h1>Canonical V4 report</h1></main>';

// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describeDisposablePostgres("V4 artifact payload PostgreSQL persistence", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    await sql.begin(async (tx) => {
      for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement);
    });
    await seedGenerationLineage(sql);
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("persists object JSON, recovers pending hashes, and reads ready and active artifacts", async () => {
    const [{ server_version_num: serverVersion }] = await sql<Array<{ server_version_num: number }>>`
      SELECT current_setting('server_version_num')::int AS server_version_num`;
    expect(serverVersion).toBeGreaterThanOrEqual(170_000);
    expect(serverVersion).toBeLessThan(180_000);

    const database = createReportV4ArtifactPersistencePostgresDatabase(sql);
    const store = createPostgresReportV4ArtifactPersistenceStore(database);
    const input = persistenceInput();
    const first = await persistReportV4ArtifactPayload(input, store);

    const lockAcquired = deferred();
    const releasePersistence = deferred();
    const pausingStore = createPostgresReportV4ArtifactPersistenceStore(
      pauseAfterPaymentLock(database, lockAcquired.resolve, releasePersistence.promise)
    );
    const persistenceWhileLocked = persistReportV4ArtifactPayload(input, pausingStore);
    await lockAcquired.promise;
    const contender = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    let lockAssertionError: unknown;
    try {
      const updateOutcome = await contender.begin(async (tx) => {
        await tx.unsafe("SET LOCAL lock_timeout = '1s'");
        await tx`UPDATE payment_orders SET fulfillment_status='failed' WHERE id='order-v4-payload'`;
        throw new Error("Concurrent order update crossed the persistence payment lock.");
      }).then(() => "unexpected commit", (error: unknown) => error instanceof Error ? error.message : String(error));
      try {
        expect(updateOutcome).toMatch(/lock timeout|canceling statement due to lock timeout/i);
      } catch (error) {
        lockAssertionError = error;
      }
    } finally {
      releasePersistence.resolve();
      await contender.end({ timeout: 5 });
    }
    await expect(persistenceWhileLocked).resolves.toEqual(first);
    if (lockAssertionError) throw lockAssertionError;

    const [stored] = await sql<Array<{
      payload_type: string;
      payload_version: number;
      payload_identity_hash: string;
      html_sha256: string | null;
    }>>`
      SELECT jsonb_typeof(combined.payload) AS payload_type,
        (combined.payload->>'version')::int AS payload_version,
        artifact.payload_identity_hash,artifact.html_sha256
      FROM combined_geo_reports combined
      JOIN report_artifact_revisions artifact ON artifact.id=combined.artifact_revision_id
      WHERE combined.artifact_revision_id='core-revision'
    `;
    expect(stored).toEqual({
      payload_type: "object",
      payload_version: 4,
      payload_identity_hash: first.payloadIdentityHash,
      html_sha256: first.htmlSha256
    });

    await sql`UPDATE report_artifact_revisions
      SET payload_identity_hash='v4-pending:core-job:core-revision',html_sha256=NULL
      WHERE id='core-revision' AND status='pending'`;
    await expect(persistReportV4ArtifactPayload(input, store)).resolves.toEqual(first);
    const [recovered] = await sql<Array<{ payload_identity_hash: string; html_sha256: string | null }>>`
      SELECT payload_identity_hash,html_sha256 FROM report_artifact_revisions WHERE id='core-revision'`;
    expect(recovered).toEqual({ payload_identity_hash: first.payloadIdentityHash, html_sha256: first.htmlSha256 });

    await sql`UPDATE report_artifact_revisions SET status='ready',ready_at=now() WHERE id='core-revision'`;
    await expect(getReportV4ArtifactPayload("core-revision", store)).resolves.toEqual(first);
    await sql.begin(async (tx) => {
      await tx`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id='core-revision'`;
      await tx`UPDATE scan_reports SET active_artifact_revision_id='core-revision' WHERE id='report-v4-payload'`;
    });
    await expect(getReportV4ArtifactPayload("core-revision", store)).resolves.toEqual(first);

    await sql`UPDATE payment_orders SET fulfillment_status='failed' WHERE id='order-v4-payload'`;
    await expect(getReportV4ArtifactPayload("core-revision", store)).rejects.toThrow(/order|paid|fulfilling|completed/i);
  }, 120_000);
});

async function seedGenerationLineage(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES('report-v4-payload','https://payload.example/','payload.example','zh','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
     candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES('snapshot-v4-payload','report-v4-payload','payload.example','completed',now(),now(),${hash("collector")},${hash("content")},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
     neutralization_version,profile_evidence_identity)
    VALUES('questions-v4-payload','report-v4-payload',1,'zh','CN','candidate','high',false,'v4','v4','profile-v4')`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`question-v4-${ordinal}`},'questions-v4-payload',${ordinal},
       ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
       ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Neutral question ${ordinal}?`},${hash(`question-${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${hash("private-questions")},
    neutral_content_hash=${hash("neutral-questions")},payload='{}'::jsonb,confirmed_at=now(),locked_at=now()
    WHERE id='questions-v4-payload'`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason)
    VALUES('core-job','report-v4-payload','snapshot-v4-payload','deep','recommendation_forensics_v1',
     'two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4-payload','zh','standard')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,
     customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,
     fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
     report_locale,currency,amount_minor,payment_status,fulfillment_status)
    VALUES('order-v4-payload','checkout-v4-payload','airwallex','report-v4-payload','snapshot-v4-payload','core-job',
     'payload.example','cipher','email-v4-payload','v1','recommendation_forensics_v1','questions-v4-payload',
     'two_stage_geo_report_v4',4,'v4','v4','v4','zh','USD',100,'paid','processing')`;
  await sql`UPDATE report_business_question_sets SET order_id='order-v4-payload' WHERE id='questions-v4-payload'`;
  const configIdentity = hash("config");
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${`v4-config-${configIdentity}`},'report-v4-payload','order-v4-payload','core-job',${configIdentity},
     'model-v4',${hash("model")},'{}'::jsonb,'report-profile-v4',${hash("profile")},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
    VALUES('core-revision','report-v4-payload','order-v4-payload','core-job',${`v4-config-${configIdentity}`},1,
     'generation','combined_geo_report_v4','pending','v4-pending:core-job:core-revision')`;
}

function persistenceInput() {
  return {
    report: report(),
    canonicalHtml,
    artifactRevisionId: "core-revision",
    reportId: "report-v4-payload",
    orderId: "order-v4-payload",
    jobId: "core-job",
    coreJobId: "core-job",
    questionSetId: "questions-v4-payload",
    configSnapshotId: `v4-config-${hash("config")}`,
    siteSnapshotId: "snapshot-v4-payload",
    revisionKind: "generation" as const,
    sourceArtifactRevisionId: null
  };
}

function report() {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4-payload",
    artifactRevisionId: "core-revision",
    targetUrl: "https://payload.example/",
    locale: "zh-CN",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status: "completed" as const,
    websiteSynthesis: {
      summary: "Website summary.",
      strengths: ["Clear services."],
      gaps: ["Delivery evidence is limited."],
      actions: ["Publish delivery evidence."]
    },
    questions: ([1, 2, 3] as const).map((order) => ({
      order,
      questionId: `question-v4-${order}`,
      questionText: `Question ${order}?`,
      status: "answered" as const,
      answer: `Answer ${order}.`,
      sources: []
    }))
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

function pauseAfterPaymentLock(
  database: ReportV4ArtifactPersistencePostgresDatabase,
  locked: () => void,
  release: Promise<void>
): ReportV4ArtifactPersistencePostgresDatabase {
  let paused = false;
  return {
    transaction: (work) => database.transaction(async (sql) => {
      const pausingSql: ReportV4ArtifactPersistenceSql = async <T extends Record<string, unknown> = Record<string, unknown>>(
        strings: TemplateStringsArray,
        ...values: readonly ReportV4ArtifactPersistenceSqlValue[]
      ): Promise<T[]> => {
        const rows = await sql<T>(strings, ...values);
        const statement = strings.join(" ");
        if (!paused && statement.includes("FROM report_artifact_revisions artifact")) {
          paused = true;
          locked();
          await release;
        }
        return rows;
      };
      return work(pausingSql);
    })
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
