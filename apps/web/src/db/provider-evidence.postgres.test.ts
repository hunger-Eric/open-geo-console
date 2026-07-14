import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("provider evidence database invariants", () => {
  const databaseName = `ogc_provider_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  afterAll(async () => { await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`); await admin.end({ timeout: 5 }); }, 60_000);

  it("limits passages and keeps passages and claims append-only", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await sql`INSERT INTO public_search_surface_authorities(authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,terms_reviewed_at,evidence_references,captured_at,active) VALUES('authority','surface','v1','staging','["en"]','["US"]',now(),'["review"]',now(),true)`;
      await sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,completion_version,snapshot_kind,query_plan_version) VALUES('snapshot','cache','providers','hash','en','US','authority','surface','v1','provider-v1',1,'provider_discovery','provider-query-plan-v1')`;
      await sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule) VALUES('query','snapshot',0,'providers','query-hash','canonical')`;
      await sql`INSERT INTO market_search_attempts(id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,completed_at) VALUES('attempt','snapshot','query','authority',1,'succeeded','request',now())`;
      await sql`INSERT INTO market_search_observations(id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,result_status,content_hash,observed_at) VALUES('observation','snapshot','query','attempt',1,'https://alpha.example','https://alpha.example/','Alpha','returned','content',now())`;
      const excerpt = "Alpha Logistics self-operated freight owned fleet warehouse route";
      await sql`INSERT INTO market_source_evidence(id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,source_category,evidence_family_identity,retrieved_at,expires_at) VALUES('source','snapshot','observation','https://alpha.example/','alpha.example','available',${excerpt},${sha(excerpt)},${sha("content")},'company_owned','alpha',now(),now()+interval '1 day')`;
      for (let index=0; index<3; index++) await sql`INSERT INTO market_source_passages(id,source_evidence_id,passage_order,exact_excerpt,excerpt_hash,relevance_score,selector_version) VALUES(${`passage-${index}`},'source',${index},${`${excerpt} ${index}`},${sha(`${excerpt} ${index}`)},100,'selector-v1')`;
      await expect(sql`INSERT INTO market_source_passages(id,source_evidence_id,passage_order,exact_excerpt,excerpt_hash,relevance_score,selector_version) VALUES('passage-3','source',3,'fourth passage',${sha("fourth passage")},90,'selector-v1')`).rejects.toThrow(/three/i);
      await expect(sql`UPDATE market_source_passages SET relevance_score=90 WHERE id='passage-0'`).rejects.toThrow(/immutable/i);
      await expect(sql`DELETE FROM market_source_passages WHERE id='passage-0'`).rejects.toThrow(/immutable/i);
      await sql`INSERT INTO market_provider_claims(id,passage_id,provider_entity_id,canonical_name,generic_role,policy_role,capability,operating_mode,exact_excerpt,claim_hash,extraction_model,extraction_contract,validation_status) VALUES('claim','passage-0','provider-alpha','Alpha Logistics','service_provider','domestic','transport_control','owned',${excerpt},${sha("claim")},'model','contract-v1','accepted')`;
      await expect(sql`UPDATE market_provider_claims SET operating_mode='unknown' WHERE id='claim'`).rejects.toThrow(/immutable/i);
    } finally { await sql.end({ timeout: 5 }); }
  }, 120_000);
});

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
