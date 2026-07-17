import { pathToFileURL } from "node:url";
import type postgres from "postgres";
import {
  closeDatabase,
  DATABASE_SCHEMA_VERSION as CURRENT_SCHEMA_VERSION,
  getSqlClient
} from "../db";
import { assertProtectedStagingCommercePreview } from "../security/deployment-policy";

const V34_SCHEMA_VERSION = 34;

export interface ReportV4StagingPreflightInspection {
  readonly profile: string | null;
  readonly schemaVersion: number | null;
  readonly diagnosisCheckpointTableExists: boolean;
  readonly diagnosisCheckpointCount: number;
}

export interface ReportV4StagingPreflightStore {
  inspect(): Promise<ReportV4StagingPreflightInspection>;
}

export interface ReportV4StagingPreflightResult {
  readonly profile: "staging";
  readonly schemaVersion: number;
  readonly currentSchemaVersion: number;
  readonly diagnosisCheckpointTableExists: boolean;
  readonly diagnosisCheckpointCount: number;
  readonly v34MigrationSafe: true;
}

export class ReportV4StagingPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportV4StagingPreflightError";
  }
}

export async function runReportV4StagingPreflight(
  environment: NodeJS.ProcessEnv = process.env,
  store?: ReportV4StagingPreflightStore
): Promise<ReportV4StagingPreflightResult> {
  assertProtectedStagingCommercePreview(environment);
  let inspection: ReportV4StagingPreflightInspection;
  try {
    inspection = await (store ?? createPostgresPreflightStore()).inspect();
  } catch {
    throw new ReportV4StagingPreflightError("Protected-Staging PostgreSQL preflight inspection failed.");
  }
  if (inspection.profile !== "staging") {
    throw new ReportV4StagingPreflightError("The PostgreSQL deployment marker is not staging.");
  }
  if (!Number.isSafeInteger(inspection.schemaVersion) || inspection.schemaVersion === null || inspection.schemaVersion < 1) {
    throw new ReportV4StagingPreflightError("The PostgreSQL schema version is missing or invalid.");
  }
  if (inspection.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new ReportV4StagingPreflightError("The staging database schema is newer than this deployment checkout.");
  }
  const checkpointCount = inspection.diagnosisCheckpointTableExists
    ? exactCount(inspection.diagnosisCheckpointCount)
    : 0;
  if (inspection.schemaVersion < V34_SCHEMA_VERSION && checkpointCount > 0) {
    throw new ReportV4StagingPreflightError(
      "V34 is blocked because existing diagnosis checkpoints have no immutable input-payload backfill."
    );
  }
  return Object.freeze({
    profile: "staging",
    schemaVersion: inspection.schemaVersion,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    diagnosisCheckpointTableExists: inspection.diagnosisCheckpointTableExists,
    diagnosisCheckpointCount: checkpointCount,
    v34MigrationSafe: true
  });
}

export function createPostgresPreflightStore(
  sql: Pick<postgres.Sql, "begin"> = getSqlClient()
): ReportV4StagingPreflightStore {
  return {
    async inspect() {
      const envelope = await sql.begin("read only", async (tx) => {
        const profiles = await tx<{ profile: string }[]>`
          SELECT profile FROM deployment_environment WHERE singleton=true
        `;
        const versions = await tx<{ version: number }[]>`
          SELECT version FROM ogc_schema_state WHERE singleton=true
        `;
        const relations = await tx<{ relation: string | null }[]>`
          SELECT to_regclass('public.report_v4_diagnosis_checkpoints')::text AS relation
        `;
        if (profiles.length !== 1 || versions.length !== 1 || relations.length !== 1) {
          throw new Error("The staging identity tables are incomplete.");
        }
        const tableExists = relations[0]!.relation !== null;
        const checkpointCount = tableExists
          ? Number((await tx<{ count: number }[]>`
              SELECT count(*)::int AS count FROM report_v4_diagnosis_checkpoints
            `)[0]?.count)
          : 0;
        return {
          value: {
            profile: profiles[0]!.profile,
            schemaVersion: Number(versions[0]!.version),
            diagnosisCheckpointTableExists: tableExists,
            diagnosisCheckpointCount: checkpointCount
          } satisfies ReportV4StagingPreflightInspection
        };
      });
      return envelope.value;
    }
  };
}

function exactCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ReportV4StagingPreflightError("The diagnosis checkpoint count is invalid.");
  }
  return value;
}

async function main(): Promise<number> {
  try {
    process.stdout.write(`${JSON.stringify(await runReportV4StagingPreflight())}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof ReportV4StagingPreflightError
      ? error.message
      : "Protected-Staging identity validation failed.";
    process.stderr.write(`Report V4 staging preflight failed: ${message}\n`);
    return 1;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
