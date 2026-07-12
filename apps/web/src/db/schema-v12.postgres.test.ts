import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  V10_DATABASE_MIGRATIONS,
  V11_DATABASE_MIGRATIONS,
  V12_DATABASE_MIGRATIONS,
  V9_DATABASE_MIGRATIONS
} from "./migrations";

const V12_SCHEMA_VERSION = 12;
const V12_FULL_MIGRATIONS = [
  ...V9_DATABASE_MIGRATIONS,
  ...V10_DATABASE_MIGRATIONS,
  ...V11_DATABASE_MIGRATIONS,
  ...V12_DATABASE_MIGRATIONS
] as const;

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

type SchemaShape = {
  tables: string[];
  constraints: string[];
  indexes: string[];
  functions: string[];
  triggers: string[];
};

describeDisposablePostgres("schema v12 disposable PostgreSQL migration", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const upgradeName = `ogc_v12_upgrade_${suffix}`;
  const bootstrapName = `ogc_v12_bootstrap_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    for (const database of [upgradeName, bootstrapName]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    }
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("converges from v11 and a fresh V9+V10+V11+V12 bootstrap", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(upgradeName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(bootstrapName)}`);
    const upgrade = postgres(withDatabase(adminUrl!, upgradeName), { max: 1, prepare: false });
    const bootstrap = postgres(withDatabase(adminUrl!, bootstrapName), { max: 1, prepare: false });
    try {
      await executeStatements(upgrade, [
        ...V9_DATABASE_MIGRATIONS,
        ...V10_DATABASE_MIGRATIONS,
        ...V11_DATABASE_MIGRATIONS
      ]);
      await upgrade`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now())`;
      await upgrade`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, 11)`;
      await executeStatements(upgrade, V12_DATABASE_MIGRATIONS);
      await upgrade`UPDATE ogc_schema_state SET version=12, updated_at=now() WHERE singleton=true`;

      await executeStatements(bootstrap, V12_FULL_MIGRATIONS);
      await bootstrap`CREATE TABLE ogc_schema_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
        version integer NOT NULL CHECK (version > 0),
        updated_at timestamptz NOT NULL DEFAULT now())`;
      await bootstrap`INSERT INTO ogc_schema_state (singleton, version) VALUES (true, 12)`;

      expect(V12_SCHEMA_VERSION).toBe(12);
      expect(V12_FULL_MIGRATIONS).toEqual([
        ...V9_DATABASE_MIGRATIONS, ...V10_DATABASE_MIGRATIONS,
        ...V11_DATABASE_MIGRATIONS, ...V12_DATABASE_MIGRATIONS
      ]);
      expect(await schemaShape(upgrade)).toEqual(await schemaShape(bootstrap));
      await expectV12DatabaseGuards(upgrade, suffix);
    } finally {
      await upgrade.end({ timeout: 5 });
      await bootstrap.end({ timeout: 5 });
    }
  }, 120_000);
});

async function expectV12DatabaseGuards(sql: postgres.Sql, suffix: string): Promise<void> {
  const authority = `authority-${suffix}`;
  const snapshot = `snapshot-${suffix}`;
  const firstQuery = `query-a-${suffix}`;
  const secondQuery = `query-b-${suffix}`;
  const thirdQuery = `query-c-${suffix}`;
  const succeededAttempt = `attempt-success-${suffix}`;
  const pendingAttempt = `attempt-pending-${suffix}`;

  await sql`INSERT INTO public_search_surface_authorities
    (authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,
     terms_reviewed_at,evidence_references,active,captured_at)
    VALUES (${authority},'surface-v12','v1','staging','["zh-CN"]','["CN"]',now(),'[]',true,now())`;
  await sql`INSERT INTO market_snapshot_questions
    (id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
     surface_id,surface_version,fanout_version,status,completion_version)
    VALUES (${snapshot},${`cache-${suffix}`},'深圳到台湾的运输公司有哪些',${`question-hash-${suffix}`},'zh-CN','CN',
      ${authority},'surface-v12','v1','fanout-v1','refreshing',1)`;
  await sql`INSERT INTO market_snapshot_queries
    (id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
    VALUES
      (${firstQuery},${snapshot},0,'深圳 台湾 运输 公司',${`query-a-hash-${suffix}`},'exact-question'),
      (${secondQuery},${snapshot},1,'深圳 台湾 专线 物流',${`query-b-hash-${suffix}`},'buyer-variant'),
      (${thirdQuery},${snapshot},2,'深圳 台湾 海运 公司',${`query-c-hash-${suffix}`},'buyer-variant')`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage,completed_at)
    VALUES (${succeededAttempt},${snapshot},${firstQuery},${authority},1,'succeeded',${`idem-success-${suffix}`},
      '{"inputTokens":10}',now())`;
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
    VALUES (${pendingAttempt},${snapshot},${secondQuery},${authority},2,'pending',${`idem-pending-${suffix}`},'{}')`;

  await expect(sql`UPDATE market_snapshot_questions
    SET status='completed',query_fanout_hash='fanout-hash',completed_at=now() WHERE id=${snapshot}`)
    .rejects.toThrow(/pending attempts/i);
  await sql`UPDATE market_search_attempts
    SET request_status='timeout',completed_at=now() WHERE id=${pendingAttempt}`;
  await expect(sql`UPDATE market_snapshot_questions
    SET status='completed',query_fanout_hash='fanout-hash',completed_at=now() WHERE id=${snapshot}`)
    .rejects.toThrow(/every market snapshot query requires a terminal attempt/i);
  await sql`INSERT INTO market_search_attempts
    (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage,completed_at)
    VALUES (${`attempt-terminal-${suffix}`},${snapshot},${thirdQuery},${authority},3,'unavailable',
      ${`idem-terminal-${suffix}`},'{}',now())`;

  const invalidScalars = [
    "private@example.test",
    "reportId=report-12345",
    "tokenId=token-12345",
    "token-abc123",
    "clientIP=203.0.113.9",
    "submittedUrl=https://customer.example/private",
    "203.0.113.9",
    "2001:db8::1"
  ];
  for (const [index, scalar] of invalidScalars.entries()) {
    const payload = { text: scalar };
    const validation = await sql<Array<{ valid: boolean }>>`
      SELECT ogc_public_jsonb_metadata_valid(${sql.json(payload)}::jsonb) AS valid`;
    expect(validation[0]?.valid, scalar).toBe(false);
    await expect(sql`INSERT INTO market_search_attempts
      (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage)
      VALUES (${`private-attempt-${index}-${suffix}`},${snapshot},${firstQuery},${authority},${100 + index},'pending',
        ${`private-idem-${index}-${suffix}`},${sql.json(payload)}::jsonb)`).rejects.toThrow();
    await expect(sql`INSERT INTO market_search_observations
      (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,
       result_status,result_metadata,content_hash,observed_at)
      VALUES (${`private-observation-${index}-${suffix}`},${snapshot},${firstQuery},${succeededAttempt},${100 + index},
        'https://source.example/private','https://source.example/private','Private','returned',
        ${sql.json(payload)}::jsonb,'private-hash',now())`).rejects.toThrow();
  }
  const publicUsage = { billing: { inputTokens: 10, outputTokens: 20 }, text: "public aggregate usage" };
  expect((await sql<Array<{ valid: boolean }>>`
    SELECT ogc_public_jsonb_metadata_valid(${sql.json(publicUsage)}::jsonb) AS valid`)[0]?.valid).toBe(true);

  await sql`UPDATE market_snapshot_questions
    SET status='completed',query_fanout_hash='fanout-hash',completed_at=now() WHERE id=${snapshot}`;
  await sql`INSERT INTO market_search_observations
    (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,
     result_status,result_metadata,content_hash,observed_at)
    VALUES (${`observation-future-${suffix}`},${snapshot},${firstQuery},${succeededAttempt},0,
      'https://source.example/future','https://source.example/future','Future','returned','{}',
      'future-content-hash',now()),
     (${`observation-expired-${suffix}`},${snapshot},${firstQuery},${succeededAttempt},1,
      'https://source.example/expired','https://source.example/expired','Expired','returned','{}',
      'expired-content-hash',now())`;
  await sql`INSERT INTO market_source_evidence
    (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,
     source_category,evidence_family_identity,retrieved_at,expires_at)
    VALUES
      (${`source-future-${suffix}`},${snapshot},${`observation-future-${suffix}`},'https://source.example/future',
       'source.example','available','Future evidence','future-excerpt-hash','future-content-hash','company_owned',
       ${`future-family-${suffix}`},now(),now()+interval '1 day'),
      (${`source-expired-${suffix}`},${snapshot},${`observation-expired-${suffix}`},'https://source.example/expired',
       'source.example','available','Expired evidence','expired-excerpt-hash','expired-content-hash','company_owned',
       ${`expired-family-${suffix}`},now()-interval '1 day',now()-interval '1 second')`;

  await expect(sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ogc.market_source_expiry = 'allowed'");
    await tx`UPDATE market_source_evidence SET retrieval_state='expired',excerpt=NULL
      WHERE id=${`source-future-${suffix}`}`;
  })).rejects.toThrow(/retention deadline/i);
  await expect(sql`SELECT ogc_expire_market_source_excerpt(clock_timestamp()+interval '1 hour')`)
    .rejects.toThrow(/cutoff cannot be in the future/i);
  const expired = await sql<Array<{ count: number }>>`
    SELECT ogc_expire_market_source_excerpt(clock_timestamp()) AS count`;
  expect(expired[0]?.count).toBe(1);
  const retained = await sql<Array<{
    id: string;
    retrieval_state: string;
    excerpt: string | null;
    excerpt_hash: string;
    content_hash: string;
  }>>`SELECT id,retrieval_state,excerpt,excerpt_hash,content_hash
      FROM market_source_evidence ORDER BY id`;
  expect(retained.find((row) => row.id === `source-expired-${suffix}`)).toMatchObject({
    retrieval_state: "expired",
    excerpt: null,
    excerpt_hash: "expired-excerpt-hash",
    content_hash: "expired-content-hash"
  });
  expect(retained.find((row) => row.id === `source-future-${suffix}`)).toMatchObject({
    retrieval_state: "available",
    excerpt: "Future evidence"
  });
}

async function executeStatements(sql: postgres.Sql, statements: readonly string[]): Promise<void> {
  await sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
}

async function schemaShape(sql: postgres.Sql): Promise<SchemaShape> {
  const tables = [
    "public_search_surface_authorities", "market_snapshot_questions", "market_snapshot_queries",
    "market_search_attempts", "market_search_observations", "market_source_evidence",
    "market_snapshot_leases", "report_market_snapshot_refs", "report_source_forensics"
  ];
  const tableRows = await sql<Array<{ identity: string }>>`
    SELECT table_name AS identity FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ${sql(tables)} ORDER BY identity`;
  const constraints = await sql<Array<{ identity: string }>>`
    SELECT conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid) AS identity
    FROM pg_constraint WHERE connamespace='public'::regnamespace
      AND conrelid::regclass::text IN ${sql(tables)} ORDER BY identity`;
  const indexes = await sql<Array<{ identity: string }>>`
    SELECT tablename || '.' || indexname || ':' || indexdef AS identity
    FROM pg_indexes WHERE schemaname='public' AND tablename IN ${sql(tables)} ORDER BY identity`;
  const functions = await sql<Array<{ identity: string }>>`
    SELECT proname || ':' || pg_get_functiondef(oid) AS identity FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname LIKE 'ogc_%' ORDER BY identity`;
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
