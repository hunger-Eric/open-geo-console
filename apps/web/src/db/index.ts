import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let client: Database.Database | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!client) {
    const filePath = getDatabasePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    client = new Database(filePath);
    client.pragma("journal_mode = WAL");
    client.exec(`
      CREATE TABLE IF NOT EXISTS scan_reports (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'geo',
        score INTEGER,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    database = drizzle(client, { schema });
  }

  return database!;
}

function getDatabasePath(): string {
  if (process.env.OPEN_GEO_DB_PATH) {
    return process.env.OPEN_GEO_DB_PATH;
  }
  return path.join(findWorkspaceRoot(process.cwd()), ".data", "open-geo-console.sqlite");
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
        workspaces?: unknown;
      };
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
