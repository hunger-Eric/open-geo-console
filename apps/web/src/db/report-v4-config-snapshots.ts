import { createHash } from "node:crypto";
import type postgres from "postgres";
import {
  parseModelProfile,
  parseReportV4CustomerProseProfile,
  type ModelProfile,
  type ReportV4CustomerProseProfile
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export interface ReportV4ConfigSnapshotRow {
  readonly id: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly identityHash: string;
  readonly modelProfileId: string;
  readonly modelProfileHash: string;
  readonly modelProfile: ModelProfile;
  readonly reportProfileId: string;
  readonly reportProfileHash: string;
  readonly reportProfile: ReportV4CustomerProseProfile;
  readonly createdAt: Date;
}

export interface LockReportV4ConfigSnapshotInput {
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly modelProfile: unknown;
  readonly reportProfile: unknown;
}

export type ReportV4ConfigSnapshotInsert = Omit<ReportV4ConfigSnapshotRow, "createdAt">;

export interface ReportV4ConfigSnapshotTransaction {
  lockReport(reportId: string): Promise<void>;
  findByReport(reportId: string): Promise<ReportV4ConfigSnapshotRow | null>;
  insert(snapshot: ReportV4ConfigSnapshotInsert): Promise<ReportV4ConfigSnapshotRow>;
}

export interface ReportV4ConfigSnapshotStore {
  transaction<T>(work: (tx: ReportV4ConfigSnapshotTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4ConfigSnapshotRepository {
  lock(input: LockReportV4ConfigSnapshotInput): Promise<ReportV4ConfigSnapshotRow>;
}

export interface ReportV4ConfigSnapshotSql {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ConfigSnapshotSqlValue[]
  ): Promise<T[]>;
}

export type ReportV4ConfigSnapshotSqlValue = string | number | boolean | Date | null;

export interface ReportV4ConfigSnapshotPostgresDatabase {
  transaction<T>(work: (sql: ReportV4ConfigSnapshotSql) => Promise<T>): Promise<T>;
}

export function createReportV4ConfigSnapshotRepository(
  store: ReportV4ConfigSnapshotStore = createPostgresReportV4ConfigSnapshotStore()
): ReportV4ConfigSnapshotRepository {
  return {
    lock: (input) => lockWithStore(input, store)
  };
}

export async function lockReportV4ConfigSnapshot(
  input: LockReportV4ConfigSnapshotInput,
  repository: ReportV4ConfigSnapshotRepository = createReportV4ConfigSnapshotRepository()
): Promise<ReportV4ConfigSnapshotRow> {
  return repository.lock(input);
}

export function createReportV4ConfigSnapshotPostgresDatabase(
  sql: Pick<postgres.Sql, "begin">
): ReportV4ConfigSnapshotPostgresDatabase {
  return {
    async transaction(work) {
      const envelope = await sql.begin(async (tx) => ({
        value: await work(adaptPostgresSql(tx))
      }));
      return envelope.value;
    }
  };
}

export function createPostgresReportV4ConfigSnapshotStore(
  database: ReportV4ConfigSnapshotPostgresDatabase = livePostgresDatabase()
): ReportV4ConfigSnapshotStore {
  return {
    transaction: (work) => database.transaction((sql) => work(postgresTransaction(sql)))
  };
}

async function lockWithStore(
  input: LockReportV4ConfigSnapshotInput,
  store: ReportV4ConfigSnapshotStore
): Promise<ReportV4ConfigSnapshotRow> {
  const candidate = buildSnapshot(input);
  return store.transaction(async (tx) => {
    await tx.lockReport(candidate.reportId);
    const existing = await tx.findByReport(candidate.reportId);
    if (existing) {
      assertExactSnapshot(existing, candidate);
      return existing;
    }
    return tx.insert(candidate);
  });
}

function buildSnapshot(input: LockReportV4ConfigSnapshotInput): ReportV4ConfigSnapshotInsert {
  const reportId = requiredText(input.reportId, "reportId");
  const orderId = requiredText(input.orderId, "orderId");
  const coreJobId = requiredText(input.coreJobId, "coreJobId");
  const modelProfile = parseModelProfile(input.modelProfile);
  const reportProfile = parseReportV4CustomerProseProfile(input.reportProfile);
  const modelProfileHash = hashStableJson(modelProfile);
  const reportProfileHash = hashStableJson(reportProfile);
  const identityHash = hashStableJson({
    coreJobId,
    modelProfileHash,
    orderId,
    reportId,
    reportProfileHash
  });
  return deepFreeze({
    id: `v4-config-${identityHash}`,
    reportId,
    orderId,
    coreJobId,
    identityHash,
    modelProfileId: modelProfile.profileId,
    modelProfileHash,
    modelProfile,
    reportProfileId: reportProfile.profileId,
    reportProfileHash,
    reportProfile
  });
}

function assertExactSnapshot(
  existing: ReportV4ConfigSnapshotRow,
  candidate: ReportV4ConfigSnapshotInsert
): void {
  for (const field of [
    "id", "reportId", "orderId", "coreJobId", "identityHash", "modelProfileId",
    "modelProfileHash", "reportProfileId", "reportProfileHash"
  ] as const) {
    if (existing[field] !== candidate[field]) {
      throw new Error(`V4 configuration drift violates the immutable exact-resume snapshot (${field}).`);
    }
  }
  if (stableJson(existing.modelProfile) !== stableJson(candidate.modelProfile)
    || stableJson(existing.reportProfile) !== stableJson(candidate.reportProfile)) {
    throw new Error("V4 configuration drift violates the immutable exact-resume snapshot payload.");
  }
}

function livePostgresDatabase(): ReportV4ConfigSnapshotPostgresDatabase {
  return {
    async transaction(work) {
      await ensureDatabase();
      return createReportV4ConfigSnapshotPostgresDatabase(getSqlClient()).transaction(work);
    }
  };
}

function adaptPostgresSql(tx: postgres.TransactionSql): ReportV4ConfigSnapshotSql {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ConfigSnapshotSqlValue[]
  ): Promise<T[]> => [...await tx<T[]>(strings, ...values)];
}

function postgresTransaction(sql: ReportV4ConfigSnapshotSql): ReportV4ConfigSnapshotTransaction {
  const lockedReports = new Set<string>();
  return {
    async lockReport(reportId) {
      const normalized = requiredText(reportId, "reportId");
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-config:${normalized}`}, 0))`;
      lockedReports.add(normalized);
    },
    async findByReport(reportId) {
      const normalized = requireLocked(reportId, lockedReports);
      const rows = await sql`
        SELECT id,report_id,order_id,core_job_id,identity_hash,
          model_profile_id,model_profile_hash,model_profile_payload,
          report_profile_id,report_profile_hash,report_profile_payload,created_at
        FROM report_v4_config_snapshots WHERE report_id=${normalized} FOR UPDATE
      `;
      if (rows.length > 1) throw new Error("A V4 report returned multiple immutable configuration snapshots.");
      return rows[0] ? parsePostgresSnapshot(rows[0]) : null;
    },
    async insert(snapshot) {
      requireLocked(snapshot.reportId, lockedReports);
      const rows = await sql`
        INSERT INTO report_v4_config_snapshots (
          id,report_id,order_id,core_job_id,identity_hash,
          model_profile_id,model_profile_hash,model_profile_payload,
          report_profile_id,report_profile_hash,report_profile_payload
        ) VALUES (
          ${snapshot.id},${snapshot.reportId},${snapshot.orderId},${snapshot.coreJobId},${snapshot.identityHash},
          ${snapshot.modelProfileId},${snapshot.modelProfileHash},${stableJson(snapshot.modelProfile)}::jsonb,
          ${snapshot.reportProfileId},${snapshot.reportProfileHash},${stableJson(snapshot.reportProfile)}::jsonb
        ) ON CONFLICT DO NOTHING
        RETURNING id,report_id,order_id,core_job_id,identity_hash,
          model_profile_id,model_profile_hash,model_profile_payload,
          report_profile_id,report_profile_hash,report_profile_payload,created_at
      `;
      if (rows.length !== 1) throw new Error("V4 configuration snapshot insert must affect exactly one row without identity conflict.");
      const inserted = parsePostgresSnapshot(rows[0]!);
      assertExactSnapshot(inserted, snapshot);
      return inserted;
    }
  };
}

function parsePostgresSnapshot(row: Record<string, unknown>): ReportV4ConfigSnapshotRow {
  const modelProfile = parseModelProfile(row.model_profile_payload);
  const reportProfile = parseReportV4CustomerProseProfile(row.report_profile_payload);
  const parsed: ReportV4ConfigSnapshotRow = {
    id: requiredText(row.id, "snapshot.id"),
    reportId: requiredText(row.report_id, "snapshot.reportId"),
    orderId: requiredText(row.order_id, "snapshot.orderId"),
    coreJobId: requiredText(row.core_job_id, "snapshot.coreJobId"),
    identityHash: sha256(row.identity_hash, "snapshot.identityHash"),
    modelProfileId: requiredText(row.model_profile_id, "snapshot.modelProfileId"),
    modelProfileHash: sha256(row.model_profile_hash, "snapshot.modelProfileHash"),
    modelProfile,
    reportProfileId: requiredText(row.report_profile_id, "snapshot.reportProfileId"),
    reportProfileHash: sha256(row.report_profile_hash, "snapshot.reportProfileHash"),
    reportProfile,
    createdAt: validDate(row.created_at, "snapshot.createdAt")
  };
  if (parsed.modelProfileId !== modelProfile.profileId
    || parsed.reportProfileId !== reportProfile.profileId
    || parsed.modelProfileHash !== hashStableJson(modelProfile)
    || parsed.reportProfileHash !== hashStableJson(reportProfile)) {
    throw new Error("Persisted V4 configuration snapshot profile identity or hash is inconsistent.");
  }
  const rebuilt = buildSnapshot({
    reportId: parsed.reportId,
    orderId: parsed.orderId,
    coreJobId: parsed.coreJobId,
    modelProfile,
    reportProfile
  });
  assertExactSnapshot(parsed, rebuilt);
  return deepFreeze(parsed);
}

function requireLocked(reportId: string, lockedReports: ReadonlySet<string>): string {
  const normalized = requiredText(reportId, "reportId");
  if (!lockedReports.has(normalized)) throw new Error("The V4 configuration snapshot report advisory lock is required.");
  return normalized;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be nonblank text.`);
  return value.trim();
}

function sha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256.`);
  return value;
}

function validDate(value: unknown, field: string): Date {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${field} must be a valid date.`);
  return parsed;
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("V4 configuration snapshots cannot contain undefined values.");
  return json;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
