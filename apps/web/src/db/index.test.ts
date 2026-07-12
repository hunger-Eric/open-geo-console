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
import { DATABASE_MIGRATIONS } from "./migrations";

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
  it("uses artifact-scoped schema version 9", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(9);
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
