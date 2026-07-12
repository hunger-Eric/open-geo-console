import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { V10_DATABASE_MIGRATIONS, V9_DATABASE_MIGRATIONS } from "./migrations";

const V10_SCHEMA_VERSION = 10;

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

type SchemaShape = {
  columns: string[];
  constraints: string[];
  indexes: string[];
};

describeDisposablePostgres("schema v10 disposable PostgreSQL migration", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const upgradeName = `ogc_v10_upgrade_${suffix}`;
  const bootstrapName = `ogc_v10_bootstrap_${suffix}`;
  const failureName = `ogc_v10_failure_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    for (const database of [upgradeName, bootstrapName, failureName]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    }
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("converges from v9 and an empty bootstrap to the same v10 shape", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(upgradeName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(bootstrapName)}`);
    const upgrade = postgres(withDatabase(adminUrl!, upgradeName), { max: 1, prepare: false });
    const bootstrap = postgres(withDatabase(adminUrl!, bootstrapName), { max: 1, prepare: false });
    try {
      await executeStatements(upgrade, V9_DATABASE_MIGRATIONS);
      await upgrade`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await upgrade`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, 9)`;
      const reportId = `report-${suffix}`;
      const jobId = `job-${suffix}`;
      const orderId = `order-${suffix}`;
      await upgrade`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
        VALUES (${reportId},'https://example.test','example.test','en','pending')`;
      await upgrade`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale)
        VALUES (${jobId},${reportId},'deep','recommendation_forensics_v1','en')`;
      await upgrade`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,
         customer_email_encrypted,customer_email_hmac,email_key_version,product_code,
         catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
        VALUES (${orderId},${`checkout-${suffix}`},'airwallex',${reportId},${jobId},'example.test',
          'encrypted','email-hmac','v1','recommendation_forensics_v1','v1','v1','v1','en','USD',2900)`;

      await executeStatements(upgrade, V10_DATABASE_MIGRATIONS);
      await upgrade`UPDATE ogc_schema_state SET version=${V10_SCHEMA_VERSION}, updated_at=now() WHERE singleton=true`;

      await executeStatements(bootstrap, [...V9_DATABASE_MIGRATIONS, ...V10_DATABASE_MIGRATIONS]);
      await bootstrap`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await bootstrap`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, ${V10_SCHEMA_VERSION})`;

      const migrated = await upgrade<Array<{ fulfillment_methodology: string; recommendation_report_version: number }>>`
        SELECT fulfillment_methodology,recommendation_report_version FROM scan_jobs WHERE id=${jobId}`;
      const migratedOrder = await upgrade<Array<{ fulfillment_methodology: string; recommendation_report_version: number }>>`
        SELECT fulfillment_methodology,recommendation_report_version FROM payment_orders WHERE id=${orderId}`;
      expect(migrated[0]).toMatchObject({ fulfillment_methodology: "answer_engine_recommendation_forensics_v1", recommendation_report_version: 1 });
      expect(migratedOrder[0]).toMatchObject({ fulfillment_methodology: "answer_engine_recommendation_forensics_v1", recommendation_report_version: 1 });
      expect(await schemaShape(upgrade)).toEqual(await schemaShape(bootstrap));
      await expectMethodologyConstraints(upgrade, reportId);
      await expectSharedPrivacyConstraints(upgrade, reportId, jobId);
    } finally {
      await upgrade.end({ timeout: 5 });
      await bootstrap.end({ timeout: 5 });
    }
  }, 120_000);

  it("does not advance the marker when v10 DDL fails and converges on retry", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(failureName)}`);
    const sql = postgres(withDatabase(adminUrl!, failureName), { max: 1, prepare: false });
    try {
      await executeStatements(sql, V9_DATABASE_MIGRATIONS);
      await sql`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, 9)`;

      await expect(sql.begin(async (tx) => {
        for (const [index, statement] of V10_DATABASE_MIGRATIONS.entries()) {
          if (index === Math.floor(V10_DATABASE_MIGRATIONS.length / 2)) {
            await tx.unsafe("SELECT definitely_missing_v10_function()")
          }
          await tx.unsafe(statement);
        }
        await tx`UPDATE ogc_schema_state SET version=${V10_SCHEMA_VERSION} WHERE singleton=true`;
      })).rejects.toThrow();
      expect((await sql<Array<{ version: number }>>`SELECT version FROM ogc_schema_state WHERE singleton=true`)[0]?.version).toBe(9);

      await sql.begin(async (tx) => {
        for (const statement of V10_DATABASE_MIGRATIONS) await tx.unsafe(statement);
        await tx`UPDATE ogc_schema_state SET version=${V10_SCHEMA_VERSION} WHERE singleton=true`;
      });
      expect((await sql<Array<{ version: number }>>`SELECT version FROM ogc_schema_state WHERE singleton=true`)[0]?.version).toBe(10);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

async function executeStatements(sql: postgres.Sql, statements: readonly string[]): Promise<void> {
  await sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
}

async function schemaShape(sql: postgres.Sql): Promise<SchemaShape> {
  const tables = [
    "scan_jobs", "payment_orders", "public_search_surface_authorities",
    "market_snapshot_questions", "market_snapshot_queries", "market_search_attempts",
    "market_search_observations", "market_source_evidence", "market_snapshot_leases",
    "report_market_snapshot_refs", "report_source_forensics"
  ];
  const columns = await sql<Array<{ identity: string }>>`
    SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS identity
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ${sql(tables)}
    ORDER BY identity`;
  const constraints = await sql<Array<{ identity: string }>>`
    SELECT conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid) AS identity
    FROM pg_constraint
    WHERE connamespace='public'::regnamespace AND conrelid::regclass::text IN ${sql(tables)}
    ORDER BY identity`;
  const indexes = await sql<Array<{ identity: string }>>`
    SELECT tablename || '.' || indexname || ':' || indexdef AS identity
    FROM pg_indexes WHERE schemaname='public' AND tablename IN ${sql(tables)} ORDER BY identity`;
  return {
    columns: columns.map(({ identity }) => normalize(identity)),
    constraints: constraints.map(({ identity }) => normalize(identity)),
    indexes: indexes.map(({ identity }) => normalize(identity))
  };
}

async function expectMethodologyConstraints(sql: postgres.Sql, reportId: string): Promise<void> {
  await expect(sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,locale)
    VALUES ('bad-v2-job',${reportId},'deep','legacy_website_audit_v1','public_search_source_forensics_v1','en')`).rejects.toThrow();
  await expect(sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale)
    VALUES ('missing-methodology-job',${reportId},'deep','recommendation_forensics_v1','en')`).rejects.toThrow();
  await expect(sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale)
    VALUES ('mismatched-version-job',${reportId},'deep','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',2,'en')`).rejects.toThrow();
}

async function expectSharedPrivacyConstraints(sql: postgres.Sql, reportId: string, v1JobId: string): Promise<void> {
  await sql`INSERT INTO public_search_surface_authorities
    (authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,
     terms_reviewed_at,evidence_references,active,captured_at)
    VALUES ('authority-test','surface-test','v1','staging','["en"]','["global"]',now(),'[]',true,now())`;
  await sql`INSERT INTO market_snapshot_questions
    (id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
     surface_id,surface_version,fanout_version,status,completion_version)
    VALUES ('snapshot-test','cache-test','public buyer question','question-hash','en','global',
      'authority-test','surface-test','v1','fanout-v1','refreshing',1)`;
  await sql`INSERT INTO market_snapshot_queries
    (id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
    VALUES ('query-test','snapshot-test',0,'public query','query-hash','canonical')`;
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES ('attempt-private','snapshot-test','query-test','authority-test',1,'succeeded','idem-private',
      '{"customer":{"email":"private@example.test"}}'::jsonb)`).rejects.toThrow();
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES ('attempt-token','snapshot-test','query-test','authority-test',1,'succeeded','idem-token',
      '{"authToken":"private"}'::jsonb)`).rejects.toThrow();
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES ('attempt-ip','snapshot-test','query-test','authority-test',1,'succeeded','idem-ip',
      '{"ip":"127.0.0.1"}'::jsonb)`).rejects.toThrow();
  for (const alias of ["apiKey", "userIp", "remoteAddress", "password", "credential", "jwt", "refreshToken", "sessionId"]) {
    await expect(sql`INSERT INTO market_search_attempts
      (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
      VALUES (${`attempt-alias-${alias}`},'snapshot-test','query-test','authority-test',1,'succeeded',${`idem-alias-${alias}`},
        ${sql.json({ [alias]: "private" })})`).rejects.toThrow();
  }
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES ('attempt-public','snapshot-test','query-test','authority-test',1,'succeeded','idem-public',
      '{"inputTokens":10}'::jsonb)`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES ('attempt-delete','snapshot-test','query-test','authority-test',2,'succeeded','idem-delete','{}'::jsonb)`;
  await sql`UPDATE market_snapshot_questions
    SET status='completed', completed_at=now(), query_fanout_hash='fanout-hash'
    WHERE id='snapshot-test'`;
  await expect(sql`UPDATE market_snapshot_questions
    SET completed_at=completed_at + interval '1 hour' WHERE id='snapshot-test'`).rejects.toThrow(/immutable/i);
  await expect(sql`UPDATE market_snapshot_queries SET query_text='rewritten' WHERE id='query-test'`).rejects.toThrow(/immutable/i);
  await expect(sql`UPDATE market_search_attempts SET snapshot_id='different-snapshot' WHERE id='attempt-public'`).rejects.toThrow(/reassigned/i);
  await expect(sql`UPDATE market_search_attempts SET provider_cost_micros=999 WHERE id='attempt-public'`).rejects.toThrow(/immutable/i);
  await expect(sql`DELETE FROM market_search_attempts WHERE id='attempt-delete'`).rejects.toThrow(/cannot be deleted/i);
  await sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at)
    VALUES ('observation-test','snapshot-test','query-test','attempt-public',0,'https://source.example/a','https://source.example/a','Source','returned','content-hash',now())`;
  await expect(sql`UPDATE market_search_observations SET title='Rewritten' WHERE id='observation-test'`).rejects.toThrow(/immutable/i);
  await sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,source_category,
     entities,claims,contradictions,evidence_family_identity,retrieved_at,expires_at)
    VALUES ('source-test','snapshot-test','observation-test','https://source.example/a','source.example',
      'not_retrieved','company_owned','[]','[]','[]','family-test',now(),now()+interval '7 days')`;
  await expect(sql`UPDATE market_source_evidence SET snapshot_id='different-snapshot' WHERE id='source-test'`).rejects.toThrow(/reassigned/i);
  await expect(sql`DELETE FROM market_source_evidence WHERE id='source-test'`).rejects.toThrow(/cannot be deleted/i);
  await sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at)
    VALUES ('observation-available','snapshot-test','query-test','attempt-public',1,'https://source.example/b','https://source.example/b','Available','returned','content-b',now())`;
  await sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,
     source_category,entities,claims,contradictions,evidence_family_identity,retrieved_at,expires_at)
    VALUES ('source-available','snapshot-test','observation-available','https://source.example/b','source.example',
      'available','Evidence text','excerpt-hash','content-hash','company_owned','[]','[{"claim":"public"}]','[]',
      'family-available',now(),now()+interval '7 days')`;
  await expect(sql`UPDATE market_source_evidence SET content_hash='rewritten' WHERE id='source-available'`).rejects.toThrow(/append-only/i);
  await expect(sql`UPDATE market_source_evidence SET claims='[{"claim":"rewritten"}]'::jsonb WHERE id='source-available'`).rejects.toThrow(/append-only/i);
  await sql`UPDATE market_source_evidence SET retrieval_state='expired',excerpt=NULL WHERE id='source-available'`;
  await expect(sql`UPDATE market_source_evidence SET excerpt_hash='rewritten' WHERE id='source-available'`).rejects.toThrow(/append-only/i);
  await sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at)
    VALUES ('observation-expired','snapshot-test','query-test','attempt-public',2,'https://source.example/c','https://source.example/c','Expired','returned','content-c',now())`;
  await expect(sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,source_category,
     entities,claims,contradictions,evidence_family_identity,retrieved_at,expires_at)
    VALUES ('source-expired-invalid','snapshot-test','observation-expired','https://source.example/c','source.example',
      'expired','company_owned','[]','[]','[]','family-expired',now(),now()+interval '7 days')`).rejects.toThrow();
  await expect(sql`INSERT INTO report_source_forensics
    (id,report_id,job_id,report_version,fulfillment_methodology,product_contract,payload,authority_hash,provenance_hash,content_hash)
    VALUES ('v2-on-v1',${reportId},${v1JobId},2,'public_search_source_forensics_v1','recommendation_forensics_v1',
      '{}'::jsonb,'authority','provenance','content')`).rejects.toThrow();
}

function normalize(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
