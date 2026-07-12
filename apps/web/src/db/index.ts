import fs from "node:fs";
import type { DeploymentProfile } from "@/security/deployment-policy";
import {
  assertDeploymentRuntime,
  nonSensitiveDatabaseFingerprint,
  readDeploymentProfile
} from "@/security/deployment-policy";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_MIGRATIONS } from "./migrations";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
let schemaInitialization: Promise<void> | undefined;
let validatedProfile: DeploymentProfile | undefined;

export const DATABASE_SCHEMA_VERSION = 6;

export function isMemoryPersistence(): boolean {
  return process.env.NODE_ENV === "test" && !process.env.DATABASE_URL;
}

export function getDb() {
  if (!database) {
    const connectionString = getDatabaseUrl();
    client = postgres(connectionString, {
      max: getDatabasePoolSize(),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined
    });
    database = drizzle(client, { schema });
  }
  return database;
}

export function getDatabasePoolSize(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(environment.OGC_DATABASE_POOL_SIZE);
  return Number.isInteger(configured) && configured > 0 ? configured : 10;
}

export function getSqlClient(): ReturnType<typeof postgres> {
  getDb();
  return client!;
}

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  }
  return value;
}

export async function ensureDatabase(): Promise<void> {
  if (isMemoryPersistence()) {
    return;
  }
  await ensureDatabaseSchema();
  const profile = assertDeploymentRuntime();
  if (validatedProfile === profile) return;
  const rows = await getSqlClient()<{ profile: string }[]>`
    SELECT profile FROM deployment_environment WHERE singleton = true LIMIT 1
  `;
  assertDatabaseProfileMatches(rows[0]?.profile, profile);
  validatedProfile = profile;
}

export function assertDatabaseProfileMatches(
  actualProfile: string | undefined,
  expectedProfile: DeploymentProfile
): void {
  if (actualProfile !== expectedProfile) {
    throw new Error("The database environment marker does not match the deployment profile.");
  }
}

async function ensureDatabaseSchema(): Promise<void> {
  if (!schemaInitialization) {
    const sql = getSqlClient();
    schemaInitialization = readDatabaseSchemaVersion(sql).then(async (currentVersion) => {
      if (!shouldRunDatabaseMigrations(currentVersion)) return;
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('ogc:schema-bootstrap', 0))`;
        const lockedVersion = await readDatabaseSchemaVersion(tx);
        if (!shouldRunDatabaseMigrations(lockedVersion)) return;
        for (const migration of DATABASE_MIGRATIONS) {
          await tx.unsafe(migration);
        }
        await tx`CREATE TABLE IF NOT EXISTS ogc_schema_state (
          singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
          version integer NOT NULL CHECK (version > 0),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`;
        await tx`
          INSERT INTO ogc_schema_state (singleton, version, updated_at)
          VALUES (true, ${DATABASE_SCHEMA_VERSION}, now())
          ON CONFLICT (singleton) DO UPDATE
          SET version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
        `;
      });
    }).catch((error) => {
      schemaInitialization = undefined;
      throw error;
    });
  }
  await schemaInitialization;
}

async function readDatabaseSchemaVersion(
  sql: ReturnType<typeof postgres> | postgres.TransactionSql
): Promise<number | undefined> {
  const relation = await sql<{ exists: boolean }[]>`
    SELECT to_regclass('public.ogc_schema_state') IS NOT NULL AS exists
  `;
  if (!relation[0]?.exists) return undefined;
  const rows = await sql<{ version: number }[]>`
    SELECT version FROM ogc_schema_state WHERE singleton = true LIMIT 1
  `;
  return rows[0]?.version;
}

export function shouldRunDatabaseMigrations(currentVersion: number | undefined): boolean {
  if (currentVersion !== undefined && currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error("The database schema is newer than this deployment supports.");
  }
  return currentVersion !== DATABASE_SCHEMA_VERSION;
}

export async function initializeDatabaseEnvironment(profile: DeploymentProfile): Promise<{ profile: DeploymentProfile; fingerprint: string }> {
  if (isMemoryPersistence()) throw new Error("A PostgreSQL database is required to initialize its environment marker.");
  if (readDeploymentProfile({ OGC_DEPLOYMENT_PROFILE: profile }) !== profile) throw new Error("Invalid database environment profile.");
  await ensureDatabaseSchema();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('ogc:deployment-environment', 0))`;
    const rows = await tx<{ profile: string }[]>`
      SELECT profile FROM deployment_environment WHERE singleton = true FOR UPDATE
    `;
    if (rows[0] && rows[0].profile !== profile) {
      throw new Error("The database environment marker is already initialized for another profile.");
    }
    if (!rows[0]) {
      await tx`
        INSERT INTO deployment_environment (singleton, profile)
        VALUES (true, ${profile})
      `;
    }
  });
  validatedProfile = undefined;
  return getDatabaseEnvironmentStatus();
}

export async function getDatabaseEnvironmentStatus(): Promise<{ profile: DeploymentProfile; fingerprint: string }> {
  if (isMemoryPersistence()) throw new Error("A PostgreSQL database is required to inspect its environment marker.");
  await ensureDatabaseSchema();
  const rows = await getSqlClient()<{ profile: string; database_name: string; database_oid: string | number }[]>`
    SELECT environment.profile,
           current_database() AS database_name,
           database.oid AS database_oid
    FROM deployment_environment environment
    JOIN pg_database database ON database.datname = current_database()
    WHERE environment.singleton = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || (row.profile !== "staging" && row.profile !== "production")) {
    throw new Error("The database environment marker has not been initialized.");
  }
  return {
    profile: row.profile,
    fingerprint: nonSensitiveDatabaseFingerprint({
      databaseName: row.database_name,
      databaseOid: row.database_oid,
      profile: row.profile
    })
  };
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
  }
  client = undefined;
  database = undefined;
  schemaInitialization = undefined;
  validatedProfile = undefined;
}

/**
 * Kept only so older tests and SQLite import tooling can locate a legacy file.
 * Production persistence never reads this path.
 */
export function getDatabasePath(): string {
  if (process.env.OPEN_GEO_DB_PATH) {
    return process.env.OPEN_GEO_DB_PATH;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(tmpdir(), "open-geo-console.sqlite");
  }
  return path.join(findWorkspaceRoot(process.cwd()), ".data", "open-geo-console.sqlite");
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { workspaces?: unknown };
      if (packageJson.workspaces) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}
