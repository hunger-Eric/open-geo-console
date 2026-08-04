import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V43_DATABASE_MIGRATIONS, V44_DATABASE_MIGRATIONS, V45_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v44_shared_content_${randomUUID().replaceAll("-", "")}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const withDb = (url: string, database: string) => url.replace(/\/[^/]+$/, `/${database}`);

suite("schema V44 shared-market result-side identity guard", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDb(adminUrl!, databaseName), { max: 1, prepare: false });
    const throughV43 = DATABASE_MIGRATIONS.slice(0, -databaseMigrationsAfter(43).length);
    await sql.begin(async (tx) => { for (const statement of throughV43) await tx.unsafe(statement); });
    await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
      VALUES('historical-report','https://historical.example/','historical.example','{}','en','completed')`;
    await sql`INSERT INTO report_business_question_sets(
      id,report_id,revision,locale,region,status,confidence,generation_rule_version,
      neutralization_version,profile_evidence_identity,payload
    ) VALUES(
      'historical-questions','historical-report',1,'en','US','candidate','high','v1','v1','profile',
      '{"identityExclusions":["MiMo","shun-express.com"]}'::jsonb
    )`;
    await sql`INSERT INTO public_search_surface_authorities(
      authority_version,adapter_id,provider_id,product_id,model_id,adapter_version,
      surface_id,surface_version,environment,locale_capabilities,region_capabilities,
      terms_reviewed_at,evidence_references,active,captured_at
    ) VALUES(
      'authority-v1','adapter','provider','product','model','adapter-v1',
      'mimo-native-web-search','mimo-native-web-search-v1','staging','["en"]','["US"]',
      now(),'["evidence"]',true,now()
    )`;
    await sql.begin(async (tx) => { for (const statement of V44_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("registers replay-safe V44 and keeps the seven trigger tables", async () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(45);
    expect(databaseMigrationsAfter(43)).toEqual([...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(42)).toEqual([...V43_DATABASE_MIGRATIONS, ...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(44)).toEqual([...V45_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(45)).toEqual([]);
    await sql.begin(async (tx) => { for (const statement of V44_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    const triggers = await sql<Array<{ table_name: string }>>`
      SELECT c.relname AS table_name
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND p.proname='ogc_reject_private_identity_in_shared_market_data'
      ORDER BY c.relname`;
    expect(triggers.map(({ table_name }) => table_name)).toEqual([
      "market_provider_claims", "market_search_attempts", "market_search_observations",
      "market_snapshot_queries", "market_snapshot_questions", "market_source_evidence",
      "market_source_passages"
    ]);
  });

  it("still rejects brand exclusions on query-side rows", async () => {
    await expect(sql`INSERT INTO market_snapshot_questions(
      id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
      surface_id,surface_version,fanout_version,completion_version,snapshot_kind,query_plan_version
    ) VALUES(
      'snapshot-bad','cache-bad','MiMo logistics question','bad-hash','en','US','authority-v1',
      'mimo-native-web-search','mimo-native-web-search-v1','fanout-v1',1,'standard_question','plan-v1'
    )`).rejects.toThrow(/private customer identity/i);

    await sql`INSERT INTO market_snapshot_questions(
      id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
      surface_id,surface_version,fanout_version,completion_version,snapshot_kind,query_plan_version
    ) VALUES(
      'snapshot-safe','cache-safe','generic logistics question','question-hash','en','US','authority-v1',
      'mimo-native-web-search','mimo-native-web-search-v1','fanout-v1',1,'standard_question','plan-v1'
    )`;
    await expect(sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
      VALUES('query-bad','snapshot-safe',0,'MiMo logistics query','query-bad-hash','rule')`)
      .rejects.toThrow(/private customer identity/i);
    await sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
      VALUES('query-safe','snapshot-safe',0,'generic logistics query','query-hash','rule')`;
  });

  it("allows public brand mentions in observation title/snippet while still rejecting report_id leakage", async () => {
    await sql`INSERT INTO market_search_attempts(
      id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,
      usage,configured_cost_micros,cost_uncertain,completed_at
    ) VALUES('attempt-safe','snapshot-safe','query-safe','authority-v1',1,'succeeded','idempotency','{}',0,false,now())`;

    await expect(sql`INSERT INTO market_search_observations(
      id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,snippet,
      result_status,result_metadata,content_hash,observed_at
    ) VALUES('observation-brand','snapshot-safe','query-safe','attempt-safe',1,'https://source.example/a',
      'https://source.example/a','MiMo and shun-express.com logistics','Public SERP snippet','returned','{}','content-brand',now())`)
      .resolves.toBeDefined();

    await expect(sql`INSERT INTO market_search_observations(
      id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,snippet,
      result_status,result_metadata,content_hash,observed_at
    ) VALUES('observation-report','snapshot-safe','query-safe','attempt-safe',2,'https://source.example/b',
      'https://source.example/b','mentions historical-report id','snippet','returned','{}','content-report',now())`)
      .rejects.toThrow(/private customer identity/i);

    await expect(sql`INSERT INTO market_source_evidence(
      id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,
      content_hash,source_category,entities,claims,contradictions,evidence_family_identity,retrieved_at,expires_at
    ) VALUES('source-brand','snapshot-safe','observation-brand','https://source.example/a','source.example','available',
      'MiMo public evidence',${"a".repeat(64)},${"b".repeat(64)},'unknown','[]','[]','[]','family',now(),now()+interval '1 day')`)
      .resolves.toBeDefined();
  }, 120_000);
});
