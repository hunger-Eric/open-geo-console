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
  it("uses recommendation-forensics authority schema version 5", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(5);
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
});
