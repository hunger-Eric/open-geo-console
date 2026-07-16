import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDatabaseProfileMatches,
  DATABASE_SCHEMA_VERSION,
  getDatabasePath,
  getDatabasePoolSize,
  shouldRunDatabaseMigrations
} from "./index";
import { DATABASE_MIGRATIONS, V22_DATABASE_MIGRATIONS, V23_DATABASE_MIGRATIONS, V24_DATABASE_MIGRATIONS, V25_DATABASE_MIGRATIONS, V26_DATABASE_MIGRATIONS, V27_DATABASE_MIGRATIONS, V28_DATABASE_MIGRATIONS, V29_DATABASE_MIGRATIONS, V30_DATABASE_MIGRATIONS, V31_DATABASE_MIGRATIONS, V32_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

describe("database path selection", () => {
  const originalOpenGeoDbPath = process.env.OPEN_GEO_DB_PATH;
  const originalVercel = process.env.VERCEL;
  const originalLambdaName = process.env.AWS_LAMBDA_FUNCTION_NAME;

  afterEach(() => {
    process.env.OPEN_GEO_DB_PATH = originalOpenGeoDbPath;
    process.env.VERCEL = originalVercel;
    process.env.AWS_LAMBDA_FUNCTION_NAME = originalLambdaName;
  });

  it("uses an explicit database path when configured", () => {
    process.env.OPEN_GEO_DB_PATH = join(tmpdir(), "custom-open-geo.sqlite");
    process.env.VERCEL = "1";

    expect(getDatabasePath()).toBe(process.env.OPEN_GEO_DB_PATH);
  });

  it("uses the writable temp directory in serverless runtimes", () => {
    delete process.env.OPEN_GEO_DB_PATH;
    process.env.VERCEL = "1";

    expect(getDatabasePath()).toBe(join(tmpdir(), "open-geo-console.sqlite"));
  });
});

describe("database pool sizing", () => {
  it("uses a configured positive integer", () => {
    expect(getDatabasePoolSize({ OGC_DATABASE_POOL_SIZE: "5" })).toBe(5);
  });

  it("falls back when the value is empty, zero, or invalid", () => {
    expect(getDatabasePoolSize({ OGC_DATABASE_POOL_SIZE: "" })).toBe(10);
    expect(getDatabasePoolSize({ OGC_DATABASE_POOL_SIZE: "0" })).toBe(10);
    expect(getDatabasePoolSize({ OGC_DATABASE_POOL_SIZE: "invalid" })).toBe(10);
  });
});

describe("database deployment marker", () => {
  it("accepts only an exact deployment profile match", () => {
    expect(() => assertDatabaseProfileMatches("staging", "staging")).not.toThrow();
    expect(() => assertDatabaseProfileMatches("staging", "production")).toThrow("database environment marker");
    expect(() => assertDatabaseProfileMatches(undefined, "production")).toThrow("database environment marker");
  });
});

describe("database schema marker", () => {
  it("uses the recoverable analysis-ledger schema with cascade-safe event cleanup", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(32);
  });

  it("contains the complete additive V2 authority and methodology migration", () => {
    const sql = DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("fulfillment_methodology");
    expect(sql).toContain("recommendation_report_version");
    expect(sql).toContain("answer_engine_recommendation_forensics_v1");
    expect(sql).toContain("public_search_source_forensics_v1");
    for (const table of [
      "public_search_surface_authorities",
      "market_snapshot_questions",
      "market_snapshot_queries",
      "market_search_attempts",
      "market_search_observations",
      "market_source_evidence",
      "market_source_passages",
      "market_provider_claims",
      "market_snapshot_leases",
      "report_market_snapshot_refs",
      "report_source_forensics"
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain("ogc_expire_market_source_excerpt");
    expect(sql).toContain("report_market_snapshot_refs_snapshot_cache_fkey");
    expect(sql).toContain("public_search_surface_authorities_one_active_uidx");
    expect(sql).toContain("cannot retain pending attempts");
    expect(sql).toContain("retention deadline");
    expect(sql).toContain("REVOKE ALL ON FUNCTION ogc_expire_market_source_excerpt");
    expect(sql).toContain("ogc_market_source_expiry_context");
    expect(sql).toContain("ogc.market_source_expiry_nonce");
    expect(sql).toContain("context.transaction_id = txid_current()");
    expect(sql).toContain("ogc_reject_private_identity_in_shared_market_data");
    expect(sql).toContain("combined_geo_report_v1");
    expect(sql).toContain("combined_geo_report_v3");
    expect(sql).toContain("DROP INDEX IF EXISTS report_market_snapshot_refs_job_cache_uidx");
    expect(sql).toContain("candidate_verification");
    expect(sql).toContain("query_plan_version");
    expect(sql).toContain("public_source_retrieval_attempts");
    expect(sql).toContain("question_acquisition_checkpoints");
  });

  it("isolates V4 methodology, enhancement lineage, limited snapshots, and terminal checkpoints", () => {
    const sql = V26_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("two_stage_geo_report_v4");
    expect(sql).toContain("scan_jobs_v4_methodology_check");
    expect(sql).toContain("artifact_contract='combined_geo_report_v4' AND fulfillment_methodology='two_stage_geo_report_v4' AND recommendation_report_version=4");
    expect(sql).toContain("artifact_contract<>'combined_geo_report_v4') AND (fulfillment_methodology IS NULL OR fulfillment_methodology<>'two_stage_geo_report_v4'");
    expect(sql).toContain("diagnosis_enhancement");
    expect(sql).toContain("report_artifact_revisions_v4_kind_check");
    expect(sql).toContain("report_artifact_revisions_v4_diagnosis_source_trigger");
    expect(sql).toContain("revision_kind IN ('generation','correction','presentation_refresh','evidence_refresh','replacement','diagnosis_enhancement')");
    expect(sql).toContain("artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND revision_kind<>'diagnosis_enhancement'");
    expect(sql).toContain("status IN ('collecting','completed','completed_limited','unavailable','custom_service')");
    expect(sql).toContain("status='completed_limited'");
    expect(sql).toContain("OLD.state IN ('answered','unavailable')");
    expect(sql).toContain("report_v4_question_checkpoints_terminal_immutability_trigger");
    expect(sql).toContain("fulfillment_methodology = 'answer_engine_recommendation_forensics_v1' AND recommendation_report_version = 1");
    expect(sql).toContain("fulfillment_methodology = 'public_search_source_forensics_v1' AND recommendation_report_version = 2");
    expect(sql).toContain("pdf_sha256 IS NOT NULL AND pdf_storage_key IS NOT NULL");
  });

  it("adds an append-only recovery ledger without replacing the legacy stage projection", () => {
    const sql = DATABASE_MIGRATIONS.join("\n");
    for (const column of ["execution_state", "current_phase", "checkpoint_revision", "phase_attempt", "resume_generation", "retry_not_before", "repair_reason_code", "repair_deadline_at"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS scan_job_error_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS scan_job_transition_events");
    expect(sql).toContain("Job event history is append-only.");
    expect(sql).toContain("scan_jobs_repair_wait_lease_check");
  });

  it("backfills legacy scopes and replaces ambiguous AI report uniqueness", () => {
    const sql = DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("artifact_scope text NOT NULL DEFAULT 'legacy_website_audit_v1'");
    expect(sql).toContain("product_contract text NOT NULL DEFAULT 'legacy_website_audit_v1'");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS ai_reports_report_id_tier_key");
    expect(sql).toContain("ai_reports_report_tier_product_uidx");
  });

  it("skips DDL bootstrap when the current schema version is present", () => {
    expect(shouldRunDatabaseMigrations(DATABASE_SCHEMA_VERSION)).toBe(false);
  });

  it("bootstraps an unmarked or older database", () => {
    expect(shouldRunDatabaseMigrations(undefined)).toBe(true);
    expect(shouldRunDatabaseMigrations(DATABASE_SCHEMA_VERSION - 1)).toBe(true);
  });

  it("runs only forward migrations when upgrading an existing schema", () => {
    expect(databaseMigrationsAfter(21)).toEqual([...V22_DATABASE_MIGRATIONS, ...V23_DATABASE_MIGRATIONS, ...V24_DATABASE_MIGRATIONS, ...V25_DATABASE_MIGRATIONS, ...V26_DATABASE_MIGRATIONS, ...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(22)).toEqual([...V23_DATABASE_MIGRATIONS, ...V24_DATABASE_MIGRATIONS, ...V25_DATABASE_MIGRATIONS, ...V26_DATABASE_MIGRATIONS, ...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(23)).toEqual([...V24_DATABASE_MIGRATIONS, ...V25_DATABASE_MIGRATIONS, ...V26_DATABASE_MIGRATIONS, ...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(24)).toEqual([...V25_DATABASE_MIGRATIONS, ...V26_DATABASE_MIGRATIONS, ...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(25)).toEqual([...V26_DATABASE_MIGRATIONS, ...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(26)).toEqual([...V27_DATABASE_MIGRATIONS, ...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(27)).toEqual([...V28_DATABASE_MIGRATIONS, ...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(28)).toEqual([...V29_DATABASE_MIGRATIONS, ...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(29)).toEqual([...V30_DATABASE_MIGRATIONS, ...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(30)).toEqual([...V31_DATABASE_MIGRATIONS, ...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(31)).toEqual([...V32_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(32)).toEqual([]);
    expect(databaseMigrationsAfter(undefined)).toEqual([...DATABASE_MIGRATIONS]);
  });

  it("refuses to run older code against a newer schema", () => {
    expect(() => shouldRunDatabaseMigrations(DATABASE_SCHEMA_VERSION + 1)).toThrow("newer than this deployment");
  });

  it("keeps retirement columns on payment orders in fresh bootstrap and repairs legacy credit ledgers", () => {
    const paymentCreate = DATABASE_MIGRATIONS.findIndex((statement) => statement.includes("CREATE TABLE IF NOT EXISTS payment_orders"));
    const paymentAlter = DATABASE_MIGRATIONS.findIndex((statement) => statement.includes("ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS legacy_retirement_cutoff_at"));
    const creditCreate = DATABASE_MIGRATIONS.find((statement) => statement.includes("CREATE TABLE IF NOT EXISTS credit_ledger"))!;
    expect(paymentCreate).toBeGreaterThan(-1);
    expect(paymentAlter).toBeGreaterThan(paymentCreate);
    expect(DATABASE_MIGRATIONS[paymentCreate]).toContain("legacy_retirement_cutoff_at timestamptz");
    expect(creditCreate).not.toContain("legacy_retirement_cutoff_at");
    expect(DATABASE_MIGRATIONS).toContain("ALTER TABLE credit_ledger DROP COLUMN IF EXISTS legacy_retirement_cutoff_at");
    expect(DATABASE_MIGRATIONS).toContain("ALTER TABLE credit_ledger DROP COLUMN IF EXISTS legacy_retired_at");
  });
});
