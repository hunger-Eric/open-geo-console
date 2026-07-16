import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V20_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("schema v20 provider evidence persistence", () => {
  const databaseName = `ogc_v20_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  afterAll(async () => { await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`); await admin.end({ timeout: 5 }); }, 60_000);

  it("adds snapshot ancestry plus immutable passage and claim tables", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect(DATABASE_SCHEMA_VERSION).toBe(31);
      expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V20_DATABASE_MIGRATIONS]));
      const columns = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name='market_snapshot_questions'`;
      expect(columns.map(({ column_name }) => column_name)).toEqual(expect.arrayContaining(["snapshot_kind", "parent_snapshot_id", "candidate_set_hash", "query_plan_version"]));
      const tables = await sql<{ passages: string | null; claims: string | null }[]>`SELECT to_regclass('market_source_passages')::text passages,to_regclass('market_provider_claims')::text claims`;
      expect(tables[0]).toEqual({ passages: "market_source_passages", claims: "market_provider_claims" });
      const constraints = await sql<{ definition: string }[]>`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname IN ('scan_jobs_artifact_contract_check','report_access_tokens_artifact_scope_check','report_artifact_revisions_contract_check','report_artifact_revisions_lineage_check')`;
      const definitions = constraints.map(({ definition }) => definition).join("\n");
      expect(definitions).toContain("combined_geo_report_v2");
      expect(definitions).toContain("evidence_refresh");

      await sql`INSERT INTO public_search_surface_authorities(authority_version,adapter_id,provider_id,product_id,model_id,adapter_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,terms_reviewed_at,evidence_references,captured_at,active) VALUES('authority','adapter','provider','product','model','adapter-v1','surface','v1','staging','["en"]','["US"]',now(),'["review"]',now(),true)`;
      await sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,completion_version,snapshot_kind,query_plan_version) VALUES('historical','historical-cache','question','hash','en','US','authority','surface','v1','legacy',1,'standard_question','legacy-standard-v1')`;
      expect((await sql<{ snapshot_kind: string }[]>`SELECT snapshot_kind FROM market_snapshot_questions WHERE id='historical'`)[0]?.snapshot_kind).toBe("standard_question");

      await sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,completion_version,snapshot_kind,query_plan_version) VALUES('discovery','discovery-cache','providers','hash','en','US','authority','surface','v1','provider-v1',1,'provider_discovery','provider-query-plan-v1')`;
      await expect(sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,completion_version,snapshot_kind,parent_snapshot_id,candidate_set_hash,query_plan_version) VALUES('bad-verification','bad-cache','verify','hash','en','US','authority','surface','v1','provider-v1',1,'candidate_verification','discovery',${"a".repeat(64)},'provider-query-plan-v1')`).rejects.toThrow(/completed provider-discovery/i);
      await sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule) VALUES('discovery-query','discovery',0,'providers','query-hash','canonical')`;
      await sql`INSERT INTO market_search_attempts(id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,completed_at) VALUES('discovery-attempt','discovery','discovery-query','authority',1,'succeeded','discovery-request',now())`;
      await sql`UPDATE market_snapshot_questions SET status='completed',query_fanout_hash='fanout',completed_at=now() WHERE id='discovery'`;
      await expect(sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,completion_version,snapshot_kind,parent_snapshot_id,candidate_set_hash,query_plan_version) VALUES('verification','verification-cache','verify','hash','en','US','authority','surface','v1','provider-v1',1,'candidate_verification','discovery',${"b".repeat(64)},'provider-query-plan-v1')`).resolves.toBeDefined();
    } finally { await sql.end({ timeout: 5 }); }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
