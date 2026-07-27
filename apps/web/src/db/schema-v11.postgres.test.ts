import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { V10_DATABASE_MIGRATIONS, V11_DATABASE_MIGRATIONS, V9_DATABASE_MIGRATIONS } from "./migrations";

const V11_SCHEMA_VERSION = 11;

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

type SchemaShape = {
  tables: string[];
  constraints: string[];
  indexes: string[];
  functions: string[];
  triggers: string[];
};

describeDisposablePostgres("schema v11 disposable PostgreSQL migration", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const upgradeName = `ogc_v11_upgrade_${suffix}`;
  const bootstrapName = `ogc_v11_bootstrap_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    for (const database of [upgradeName, bootstrapName]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    }
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("converges from v10 and a fresh V9+V10+V11 bootstrap", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(upgradeName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(bootstrapName)}`);
    const upgrade = postgres(withDatabase(adminUrl!, upgradeName), { max: 1, prepare: false });
    const bootstrap = postgres(withDatabase(adminUrl!, bootstrapName), { max: 1, prepare: false });
    try {
      await executeStatements(upgrade, [...V9_DATABASE_MIGRATIONS, ...V10_DATABASE_MIGRATIONS]);
      await upgrade`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now())`;
      await upgrade`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, 10)`;
      await executeStatements(upgrade, V11_DATABASE_MIGRATIONS);
      await upgrade`UPDATE ogc_schema_state SET version=${V11_SCHEMA_VERSION}, updated_at=now() WHERE singleton=true`;

      await executeStatements(bootstrap, [...V9_DATABASE_MIGRATIONS, ...V10_DATABASE_MIGRATIONS, ...V11_DATABASE_MIGRATIONS]);
      await bootstrap`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now())`;
      await bootstrap`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, ${V11_SCHEMA_VERSION})`;

      expect(V11_SCHEMA_VERSION).toBe(11);
      expect(await schemaShape(upgrade)).toEqual(await schemaShape(bootstrap));
      await expectV11DatabaseGuards(upgrade, suffix);
    } finally {
      await upgrade.end({ timeout: 5 });
      await bootstrap.end({ timeout: 5 });
    }
  }, 120_000);
});

async function expectV11DatabaseGuards(sql: postgres.Sql, suffix: string): Promise<void> {
  const authority = `authority-${suffix}`;
  await sql`INSERT INTO public_search_surface_authorities
    (authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,
     terms_reviewed_at,evidence_references,active,captured_at)
    VALUES (${authority},'search-surface','v1','staging','["zh-CN"]','["CN"]',now(),'[]',true,now())`;
  await expect(sql`UPDATE public_search_surface_authorities SET evidence_references='[{"id":"rewritten"}]' WHERE authority_version=${authority}`).rejects.toThrow(/immutable/i);
  await expect(sql`INSERT INTO public_search_surface_authorities
    (authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,
     terms_reviewed_at,evidence_references,active,captured_at)
    VALUES (${`${authority}-active-2`},'search-surface','v2','staging','[]','[]',now(),'[]',true,now())`).rejects.toThrow();

  const snapshot = `snapshot-${suffix}`;
  const query = `query-${suffix}`;
  await sql`INSERT INTO market_snapshot_questions
    (id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
     surface_id,surface_version,fanout_version,status,completion_version)
    VALUES (${snapshot},'cache-shenzhen-taiwan','深圳到台湾的运输公司有哪些','question-hash','zh-CN','CN',
      ${authority},'search-surface','v1','fanout-v1','refreshing',1)`;
  await sql`INSERT INTO market_snapshot_queries
    (id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
    VALUES (${query},${snapshot},0,'深圳 台湾 运输 公司','query-hash','exact-question')`;
  await expect(sql`UPDATE market_snapshot_questions SET normalized_question='rewritten' WHERE id=${snapshot}`).rejects.toThrow(/identity/i);

  const privatePayloads = [
    { billing: { customer: { email: "private@example.test" } } },
    { billing: { auth_token: "private" } },
    { billing: { remoteAddress: "127.0.0.1" } }
  ];
  for (const [index, usage] of privatePayloads.entries()) {
    await expect(sql`INSERT INTO market_search_attempts
      (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
      VALUES (${`private-${index}-${suffix}`},${snapshot},${query},${authority},${index + 1},'pending',${`private-idem-${index}-${suffix}`},${sql.json(usage)})`).rejects.toThrow();
  }
  const tooDeep = { billing: { items: [{ details: { values: [{ count: 1 }] } }] } };
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${`deep-${suffix}`},${snapshot},${query},${authority},4,'pending',${`deep-idem-${suffix}`},${sql.json(tooDeep)})`).rejects.toThrow();
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${`large-${suffix}`},${snapshot},${query},${authority},5,'pending',${`large-idem-${suffix}`},
      ${sql.json({ billing: { items: Array.from({ length: 40 }, () => ({ text: "x".repeat(300) })) } })})`).rejects.toThrow();

  const attempt = `attempt-${suffix}`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${attempt},${snapshot},${query},${authority},1,'pending',${`attempt-idem-${suffix}`},
      '{"requestCount":1,"resultCount":1,"estimatedCostMicros":25,"providerReportedCostMicros":20,"costUncertain":false}')`;
  await expect(sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${`duplicate-number-${suffix}`},${snapshot},${query},${authority},1,'pending',${`duplicate-idem-${suffix}`},'{}')`).rejects.toThrow();
  await expect(sql`UPDATE market_search_attempts SET usage='{"requestCount":2,"resultCount":1}' WHERE id=${attempt}`).rejects.toThrow(/atomically/i);
  await expect(sql`UPDATE market_search_attempts SET request_status='succeeded' WHERE id=${attempt}`).rejects.toThrow();

  const pendingAttempt = `pending-${suffix}`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${pendingAttempt},${snapshot},${query},${authority},2,'pending',${`pending-idem-${suffix}`},'{}')`;
  await expect(sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at)
    VALUES (${`pending-observation-${suffix}`},${snapshot},${query},${pendingAttempt},0,'https://source.example/pending','https://source.example/pending','Pending','returned','hash',now())`).rejects.toThrow(/succeeded or partial/i);

  await sql`UPDATE market_search_attempts SET request_status='succeeded',completed_at=now(),provider_cost_micros=20 WHERE id=${attempt}`;
  const observation = `observation-${suffix}`;
  await sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at)
    VALUES (${observation},${snapshot},${query},${attempt},0,'https://source.example/a','https://source.example/a','Source','returned','hash',now())`;
  await expect(sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,
     source_category,evidence_family_identity,retrieved_at,expires_at)
    VALUES (${`bad-source-${suffix}`},${snapshot},${observation},'https://other.example/a','other.example','available','Text','eh','ch',
      'earned_editorial','family',now(),now()-interval '1 minute')`).rejects.toThrow(/canonical URL/i);
  const source = `source-${suffix}`;
  await sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,
     source_category,evidence_family_identity,retrieved_at,expires_at)
    VALUES (${source},${snapshot},${observation},'https://source.example/a','source.example','available','Text','eh','ch',
      'earned_editorial','family',now(),now()-interval '1 minute')`;
  await expect(sql`UPDATE market_source_evidence SET retrieval_state='expired',excerpt=NULL WHERE id=${source}`).rejects.toThrow(/ogc_expire/i);
  expect((await sql<Array<{ count: number }>>`SELECT ogc_expire_market_source_excerpt(now()) AS count`)[0]?.count).toBe(1);

  await sql`UPDATE market_snapshot_questions
    SET status='completed',query_fanout_hash='fanout-hash',completed_at=now()-interval '8 days' WHERE id=${snapshot}`;
  await expect(sql`UPDATE market_snapshot_questions SET status='failed' WHERE id=${snapshot}`).rejects.toThrow(/terminal/i);

  const report = `report-${suffix}`;
  const job = `job-${suffix}`;
  await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
    VALUES (${report},'https://customer.example','customer.example','zh','pending')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale)
    VALUES (${job},${report},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh')`;
  await expect(sql`INSERT INTO report_market_snapshot_refs
    (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,binding_hash)
    VALUES (${`fake-fresh-${suffix}`},${report},${job},${snapshot},'cache-shenzhen-taiwan',now(),'fresh','binding')`).rejects.toThrow(/freshness/i);
  await expect(sql`INSERT INTO report_market_snapshot_refs
    (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,binding_hash)
    VALUES (${`future-cutoff-${suffix}`},${report},${job},${snapshot},'cache-shenzhen-taiwan',now()+interval '1 hour','historical','binding')`).rejects.toThrow(/future/i);
  await sql`INSERT INTO report_market_snapshot_refs
    (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,binding_hash)
    VALUES (${`valid-ref-${suffix}`},${report},${job},${snapshot},'cache-shenzhen-taiwan',now(),'historical','binding')`;

  const legacyReport = `legacy-report-${suffix}`;
  const legacyJob = `legacy-job-${suffix}`;
  await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
    VALUES (${legacyReport},'https://legacy.example','legacy.example','en','pending')`;
  await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale)
    VALUES (${legacyJob},${legacyReport},'deep','legacy_website_audit_v1','en')`;
  await expect(sql`INSERT INTO report_market_snapshot_refs
    (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,binding_hash)
    VALUES (${`legacy-ref-${suffix}`},${legacyReport},${legacyJob},${snapshot},'cache-shenzhen-taiwan',now(),'historical','binding')`).rejects.toThrow(/V2/i);

  const snapshot2 = `snapshot-2-${suffix}`;
  const query2 = `query-2-${suffix}`;
  const attempt2 = `attempt-2-${suffix}`;
  await sql`INSERT INTO market_snapshot_questions
    (id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
     surface_id,surface_version,fanout_version,status,completion_version)
    VALUES (${snapshot2},'cache-shenzhen-taiwan','深圳到台湾的运输公司有哪些','question-hash','zh-CN','CN',
      ${authority},'search-surface','v1','fanout-v1','refreshing',2)`;
  await sql`INSERT INTO market_snapshot_queries (id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
    VALUES (${query2},${snapshot2},0,'深圳 台湾 运输 公司','query-hash','exact-question')`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage,completed_at)
    VALUES (${attempt2},${snapshot2},${query2},${authority},1,'partial',${`attempt-2-idem-${suffix}`},'{}',now())`;
  await sql`UPDATE market_snapshot_questions SET status='completed',query_fanout_hash='fanout-2',completed_at=now() WHERE id=${snapshot2}`;
  await expect(sql`INSERT INTO report_market_snapshot_refs
    (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,binding_hash)
    VALUES (${`duplicate-cache-ref-${suffix}`},${report},${job},${snapshot2},'cache-shenzhen-taiwan',now(),'fresh','binding-2')`).rejects.toThrow();
}

async function executeStatements(sql: postgres.Sql, statements: readonly string[]): Promise<void> {
  // Neon can recycle a connection during the several-minute historical bootstrap.
  // Bounded transactions keep this disposable convergence test stable; production
  // still runs DATABASE_MIGRATIONS in one advisory-locked transaction.
  for (let offset = 0; offset < statements.length; offset += 25) {
    const chunk = statements.slice(offset, offset + 25);
    await sql.begin(async (tx) => {
      for (const [localIndex, statement] of chunk.entries()) {
        try {
          await tx.unsafe(statement);
        } catch (error) {
          throw new Error(`Migration statement ${offset + localIndex} failed: ${statement.slice(0, 120)}`, { cause: error });
        }
      }
    });
  }
}

async function schemaShape(sql: postgres.Sql): Promise<SchemaShape> {
  const tables = [
    "public_search_surface_authorities", "market_snapshot_questions", "market_snapshot_queries",
    "market_search_attempts", "market_search_observations", "market_source_evidence",
    "report_market_snapshot_refs", "report_source_forensics"
  ];
  const tableRows = await sql<Array<{ identity: string }>>`
    SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS identity
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN ${sql(tables)} ORDER BY identity`;
  const constraints = await sql<Array<{ identity: string }>>`
    SELECT conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid) AS identity
    FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid::regclass::text IN ${sql(tables)} ORDER BY identity`;
  const indexes = await sql<Array<{ identity: string }>>`
    SELECT tablename || '.' || indexname || ':' || indexdef AS identity
    FROM pg_indexes WHERE schemaname='public' AND tablename IN ${sql(tables)} ORDER BY identity`;
  const functions = await sql<Array<{ identity: string }>>`
    SELECT proname || ':' || pg_get_functiondef(oid) AS identity FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname LIKE 'ogc_%market%' ORDER BY proname`;
  const triggers = await sql<Array<{ identity: string }>>`
    SELECT tgrelid::regclass::text || '.' || tgname || ':' || pg_get_triggerdef(oid) AS identity
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ${sql(tables)} ORDER BY identity`;
  return {
    tables: tableRows.map(({ identity }) => normalize(identity)),
    constraints: constraints.map(({ identity }) => normalize(identity)),
    indexes: indexes.map(({ identity }) => normalize(identity)),
    functions: functions.map(({ identity }) => normalize(identity)),
    triggers: triggers.map(({ identity }) => normalize(identity))
  };
}

function normalize(value: string): string { return value.replaceAll(/\s+/g, " ").trim(); }
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
