import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V34_DATABASE_MIGRATIONS, V35_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;

describe("schema V34 immutable diagnosis input payload", () => {
  it("registers one forward-only bounded payload migration after V33", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(35);
    expect(databaseMigrationsAfter(33)).toEqual([...V34_DATABASE_MIGRATIONS, ...V35_DATABASE_MIGRATIONS]);
    const source = V34_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("diagnosis_input_payload jsonb");
    expect(source).toContain("ALTER COLUMN diagnosis_input_payload SET NOT NULL");
    expect(source).toContain("jsonb_typeof(diagnosis_input_payload)='object'");
    expect(source).toContain("octet_length(diagnosis_input_payload::text)<=262144");
    expect(source).not.toMatch(/UPDATE\s+report_v4_diagnosis_checkpoints\s+SET\s+diagnosis_input_payload/iu);
  });
});

suite("schema V34 diagnosis input PostgreSQL constraint", () => {
  const databaseName = `ogc_v34_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`CREATE TEMP TABLE diagnosis_input_probe
      (LIKE report_v4_diagnosis_checkpoints INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`;
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("accepts only a bounded JSON object", async () => {
    await expect(insertProbe(sql, "valid", JSON.stringify({ question: { questionId: "q" } }))).resolves.toBeDefined();
    await expect(insertProbe(sql, "array", JSON.stringify([]))).rejects.toThrow(/input_payload_check|check constraint/i);
    await expect(insertProbe(sql, "oversized", JSON.stringify({ value: "x".repeat(262_145) })))
      .rejects.toThrow(/input_payload_check|check constraint/i);
  });
});

function insertProbe(sql: ReturnType<typeof postgres>, suffix: string, payload: string) {
  const hash = suffix.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/gu, "a");
  return sql`INSERT INTO diagnosis_input_probe
    (identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,question_set_id,
     question_id,snapshot_id,ordinal,state,input_identity_hash,diagnosis_input_payload,provider_call_count,
     source_audit_payload,diagnosis_payload,diagnosis_content_hash)
    VALUES(${hash},'report','enhancement','core','config','questions',${`question-${suffix}`},'snapshot',1,
      'queued',${"b".repeat(64)},${payload}::text::jsonb,0,'[]'::jsonb,NULL,NULL)`;
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}
