import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_MIGRATIONS } from "./migrations";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
let initialization: Promise<void> | undefined;

export function isMemoryPersistence(): boolean {
  return process.env.NODE_ENV === "test" && !process.env.DATABASE_URL;
}

export function getDb() {
  if (!database) {
    const connectionString = getDatabaseUrl();
    client = postgres(connectionString, {
      max: Number(process.env.OGC_DATABASE_POOL_SIZE ?? "10"),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined
    });
    database = drizzle(client, { schema });
  }
  return database;
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
  if (!initialization) {
    const sql = getSqlClient();
    initialization = (async () => {
      for (const migration of DATABASE_MIGRATIONS) {
        await sql.unsafe(migration);
      }
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  await initialization;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
  }
  client = undefined;
  database = undefined;
  initialization = undefined;
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
