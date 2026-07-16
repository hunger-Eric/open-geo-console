import type postgres from "postgres";
import { ensureDatabase, getSqlClient } from "./index";

export const REPORT_V4_ARTIFACT_CONTRACT = "combined_geo_report_v4" as const;

export type ReportV4ArtifactRevisionKind = "generation" | "diagnosis_enhancement";
export type ReportV4ArtifactRevisionStatus = "pending" | "ready" | "active" | "failed";

export interface ReportV4ArtifactRevisionRow {
  readonly id: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly configSnapshotId: string;
  readonly revision: number;
  readonly revisionKind: ReportV4ArtifactRevisionKind;
  readonly sourceArtifactRevisionId: string | null;
  readonly artifactContract: typeof REPORT_V4_ARTIFACT_CONTRACT;
  readonly status: ReportV4ArtifactRevisionStatus;
  readonly payloadIdentityHash: string | null;
  readonly htmlSha256: string | null;
}

export interface ReportV4PendingRevisionInsert {
  readonly id: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly configSnapshotId: string;
  readonly revision: number;
  readonly revisionKind: ReportV4ArtifactRevisionKind;
  readonly sourceArtifactRevisionId: string | null;
  readonly artifactContract: typeof REPORT_V4_ARTIFACT_CONTRACT;
}

export interface ReportV4ArtifactRevisionTransaction {
  lockReport(reportId: string): Promise<void>;
  getRevision(id: string): Promise<ReportV4ArtifactRevisionRow | null>;
  getCoreRevision(reportId: string): Promise<ReportV4ArtifactRevisionRow | null>;
  getActiveRevision(reportId: string): Promise<ReportV4ArtifactRevisionRow | null>;
  nextRevision(reportId: string): Promise<number>;
  insertRevision(input: ReportV4PendingRevisionInsert): Promise<ReportV4ArtifactRevisionRow>;
  markReady(id: string, payloadIdentityHash: string, htmlSha256: string): Promise<ReportV4ArtifactRevisionRow | null>;
  transitionStatus(
    id: string,
    from: ReportV4ArtifactRevisionStatus,
    to: ReportV4ArtifactRevisionStatus
  ): Promise<ReportV4ArtifactRevisionRow | null>;
  setActiveRevision(reportId: string, revisionId: string): Promise<void>;
}

export interface ReportV4ArtifactRevisionExecutor {
  transaction<T>(work: (tx: ReportV4ArtifactRevisionTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4ArtifactRevisionSql {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ArtifactRevisionSqlValue[]
  ): Promise<T[]>;
}

export type ReportV4ArtifactRevisionSqlValue = string | number | boolean | Date | null;

export interface ReportV4ArtifactRevisionPostgresDatabase {
  transaction<T>(work: (sql: ReportV4ArtifactRevisionSql) => Promise<T>): Promise<T>;
}

export function createReportV4ArtifactRevisionPostgresDatabase(
  sql: Pick<postgres.Sql, "begin">
): ReportV4ArtifactRevisionPostgresDatabase {
  return {
    async transaction(work) {
      const envelope = await sql.begin(async (tx) => ({
        value: await work(adaptPostgresArtifactRevisionSql(tx))
      }));
      return envelope.value;
    }
  };
}

export interface ReportV4CoreGenerationIdentity {
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly configSnapshotId: string;
}

export interface ActivateReportV4CoreRevisionInput extends ReportV4CoreGenerationIdentity {
  readonly payloadIdentityHash: string;
  readonly htmlSha256: string;
}

export interface ReportV4DiagnosisEnhancementIdentity {
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly configSnapshotId: string;
  readonly sourceArtifactRevisionId: string;
}

export interface ActivateReportV4DiagnosisEnhancementInput extends ReportV4DiagnosisEnhancementIdentity {
  readonly payloadIdentityHash: string;
  readonly htmlSha256: string;
}

const CORE_IDENTITY_FIELDS = new Set(["artifactRevisionId", "reportId", "orderId", "jobId", "configSnapshotId"]);
const CORE_FIELDS = new Set([...CORE_IDENTITY_FIELDS, "payloadIdentityHash", "htmlSha256"]);
const ENHANCEMENT_IDENTITY_FIELDS = new Set([
  "artifactRevisionId", "reportId", "orderId", "jobId", "configSnapshotId", "sourceArtifactRevisionId"
]);
const ENHANCEMENT_ACTIVATION_FIELDS = new Set([
  ...ENHANCEMENT_IDENTITY_FIELDS, "payloadIdentityHash", "htmlSha256"
]);

export function createPostgresReportV4ArtifactRevisionExecutor(
  database: ReportV4ArtifactRevisionPostgresDatabase = livePostgresArtifactRevisionDatabase()
): ReportV4ArtifactRevisionExecutor {
  return {
    transaction: (work) => database.transaction((sql) => work(postgresArtifactRevisionTransaction(sql)))
  };
}

export async function prepareReportV4CoreGeneration(
  input: ReportV4CoreGenerationIdentity,
  executor: ReportV4ArtifactRevisionExecutor
): Promise<ReportV4ArtifactRevisionRow> {
  strictInput(input, CORE_IDENTITY_FIELDS, "V4 core generation preparation");
  const identity = coreIdentity(input);

  return executor.transaction(async (tx) => {
    await tx.lockReport(identity.reportId);
    const existing = await tx.getRevision(identity.id);
    if (existing) {
      assertRevisionIdentity(existing, identity);
      if (existing.status === "failed") throw new Error("A failed V4 core generation cannot be prepared again.");
      return existing;
    }
    const existingCore = await tx.getCoreRevision(identity.reportId);
    if (existingCore) {
      throw new Error("A distinct V4 core generation revision already exists for this report.");
    }
    const active = await tx.getActiveRevision(identity.reportId);
    if (active) throw new Error("A distinct V4 artifact revision is already active for this report.");
    return tx.insertRevision({
      ...identity,
      revision: await tx.nextRevision(identity.reportId)
    });
  });
}

export async function activateReportV4CoreRevision(
  input: ActivateReportV4CoreRevisionInput,
  executor: ReportV4ArtifactRevisionExecutor
): Promise<ReportV4ArtifactRevisionRow> {
  strictInput(input, CORE_FIELDS, "V4 core activation");
  const identity = coreIdentity(input);
  const payloadIdentityHash = sha256(input.payloadIdentityHash, "payloadIdentityHash");
  const htmlSha256 = sha256(input.htmlSha256, "htmlSha256");

  return executor.transaction(async (tx) => {
    await tx.lockReport(identity.reportId);
    let revision = await tx.getRevision(identity.id);
    if (revision) {
      assertRevisionIdentity(revision, identity);
      if (revision.status === "active") {
        assertReadyHashes(revision, payloadIdentityHash, htmlSha256);
        return revision;
      }
      if (revision.status === "failed") throw new Error("A failed V4 core revision cannot be activated.");
    } else {
      const existingCore = await tx.getCoreRevision(identity.reportId);
      if (existingCore) throw new Error("A distinct V4 core generation revision already exists for this report.");
      const active = await tx.getActiveRevision(identity.reportId);
      if (active) throw new Error("A distinct V4 core revision is already active for this report.");
      revision = await tx.insertRevision({
        ...identity,
        revision: await tx.nextRevision(identity.reportId)
      });
    }

    const active = await tx.getActiveRevision(identity.reportId);
    if (active && active.id !== revision.id) throw new Error("A distinct V4 core revision is already active for this report.");
    const ready = await ensureReady(revision, payloadIdentityHash, htmlSha256, tx);
    const activated = await tx.transitionStatus(ready.id, "ready", "active");
    if (!activated) throw new Error("The ready V4 core revision could not be activated.");
    await tx.setActiveRevision(identity.reportId, activated.id);
    return activated;
  });
}

export async function prepareReportV4DiagnosisEnhancement(
  input: ReportV4DiagnosisEnhancementIdentity,
  executor: ReportV4ArtifactRevisionExecutor
): Promise<ReportV4ArtifactRevisionRow> {
  strictInput(input, ENHANCEMENT_IDENTITY_FIELDS, "V4 diagnosis enhancement preparation");
  const identity = enhancementIdentity(input);

  return executor.transaction(async (tx) => {
    await tx.lockReport(identity.reportId);
    const existing = await tx.getRevision(identity.id);
    if (existing) {
      assertRevisionIdentity(existing, identity);
      return existing;
    }
    const source = await requireCoreSource(identity, tx);
    const active = await tx.getActiveRevision(identity.reportId);
    if (active?.id !== source.id) throw new Error("V4 diagnosis enhancement preparation requires the report's current active core.");
    return tx.insertRevision({
      ...identity,
      revision: await tx.nextRevision(identity.reportId)
    });
  });
}

export async function activateReportV4DiagnosisEnhancement(
  input: ActivateReportV4DiagnosisEnhancementInput,
  executor: ReportV4ArtifactRevisionExecutor
): Promise<ReportV4ArtifactRevisionRow> {
  strictInput(input, ENHANCEMENT_ACTIVATION_FIELDS, "V4 diagnosis enhancement activation");
  const identity = enhancementIdentity(input);
  const payloadIdentityHash = sha256(input.payloadIdentityHash, "payloadIdentityHash");
  const htmlSha256 = sha256(input.htmlSha256, "htmlSha256");

  return executor.transaction(async (tx) => {
    await tx.lockReport(identity.reportId);
    const revision = await tx.getRevision(identity.id);
    if (!revision) throw new Error("The V4 diagnosis enhancement must be prepared before activation.");
    assertRevisionIdentity(revision, identity);
    const active = await tx.getActiveRevision(identity.reportId);
    if (revision.status === "active") {
      assertReadyHashes(revision, payloadIdentityHash, htmlSha256);
      if (active?.id !== revision.id) {
        throw new Error("The report active pointer does not identify the active V4 diagnosis enhancement.");
      }
      return revision;
    }
    const source = await requireCoreSource(identity, tx);
    if (revision.status === "failed") throw new Error("A failed V4 diagnosis enhancement cannot be activated.");
    if (active?.id !== source.id) throw new Error("V4 diagnosis enhancement activation requires the report's current active core.");
    const ready = await ensureReady(revision, payloadIdentityHash, htmlSha256, tx);
    if (source.status === "active") {
      const demoted = await tx.transitionStatus(source.id, "active", "ready");
      if (!demoted) throw new Error("The active V4 core revision could not be retained as ready.");
    }
    const activated = await tx.transitionStatus(ready.id, "ready", "active");
    if (!activated) throw new Error("The ready V4 diagnosis enhancement could not be activated.");
    await tx.setActiveRevision(identity.reportId, activated.id);
    return activated;
  });
}

export async function failReportV4DiagnosisEnhancement(
  input: ReportV4DiagnosisEnhancementIdentity,
  executor: ReportV4ArtifactRevisionExecutor
): Promise<ReportV4ArtifactRevisionRow> {
  strictInput(input, ENHANCEMENT_IDENTITY_FIELDS, "V4 diagnosis enhancement failure");
  const identity = enhancementIdentity(input);

  return executor.transaction(async (tx) => {
    await tx.lockReport(identity.reportId);
    const revision = await tx.getRevision(identity.id);
    if (!revision) throw new Error("The V4 diagnosis enhancement does not exist.");
    assertRevisionIdentity(revision, identity);
    await requireCoreSource(identity, tx);
    if (revision.status === "failed") return revision;
    if (revision.status === "active") throw new Error("An active V4 diagnosis enhancement cannot be marked failed.");
    const failed = await tx.transitionStatus(revision.id, revision.status, "failed");
    if (!failed) throw new Error("The V4 diagnosis enhancement could not be marked failed.");
    return failed;
  });
}

export function assertReportV4ArtifactRevisionKind(value: string): ReportV4ArtifactRevisionKind {
  if (value === "generation" || value === "diagnosis_enhancement") return value;
  throw new TypeError(`${value} is not allowed for a V4 artifact revision.`);
}

function livePostgresArtifactRevisionDatabase(): ReportV4ArtifactRevisionPostgresDatabase {
  return {
    async transaction(work) {
      await ensureDatabase();
      return createReportV4ArtifactRevisionPostgresDatabase(getSqlClient()).transaction(work);
    }
  };
}

function adaptPostgresArtifactRevisionSql(tx: postgres.TransactionSql): ReportV4ArtifactRevisionSql {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ArtifactRevisionSqlValue[]
  ): Promise<T[]> => {
    const rows = await tx<T[]>(strings, ...values);
    return [...rows];
  };
}

function postgresArtifactRevisionTransaction(sql: ReportV4ArtifactRevisionSql): ReportV4ArtifactRevisionTransaction {
  const lockedReports = new Set<string>();
  return {
    async lockReport(reportId) {
      const normalizedReportId = requiredText(reportId, "reportId");
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${artifactRevisionLockKey(normalizedReportId)}, 0))`;
      lockedReports.add(normalizedReportId);
    },

    async getRevision(id) {
      const rows = await sql`
        SELECT id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
        FROM report_artifact_revisions
        WHERE id=${requiredText(id, "artifactRevisionId")}
          AND artifact_contract='combined_geo_report_v4'
        FOR UPDATE
      `;
      return parseOptionalPostgresRevision(rows, "V4 artifact revision lookup");
    },

    async getCoreRevision(reportId) {
      const rows = await sql`
        SELECT id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
        FROM report_artifact_revisions
        WHERE report_id=${requiredText(reportId, "reportId")}
          AND artifact_contract='combined_geo_report_v4' AND revision_kind='generation'
        FOR UPDATE
      `;
      return parseOptionalPostgresRevision(rows, "V4 core generation revision lookup");
    },

    async getActiveRevision(reportId) {
      const rows = await sql`
        SELECT id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
        FROM report_artifact_revisions
        WHERE report_id=${requiredText(reportId, "reportId")}
          AND artifact_contract='combined_geo_report_v4' AND status='active'
        FOR UPDATE
      `;
      return parseOptionalPostgresRevision(rows, "active V4 artifact revision lookup");
    },

    async nextRevision(reportId) {
      const normalizedReportId = requireLockedReport(reportId, lockedReports);
      const rows = await sql<ArrayRow>`
        SELECT COALESCE(max(revision),0)::integer+1 AS revision
        FROM report_artifact_revisions WHERE report_id=${normalizedReportId}
      `;
      if (rows.length !== 1 || !Number.isSafeInteger(rows[0]?.revision) || Number(rows[0]?.revision) < 1) {
        throw new Error("The locked V4 artifact revision sequence did not return exactly one positive revision.");
      }
      return Number(rows[0]!.revision);
    },

    async insertRevision(input) {
      const normalized = postgresPendingRevision(input);
      requireLockedReport(normalized.reportId, lockedReports);
      const rows = await sql`
        INSERT INTO report_artifact_revisions (
          id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,ready_at,activated_at
        ) VALUES (
          ${normalized.id},${normalized.reportId},${normalized.orderId},${normalized.jobId},${normalized.configSnapshotId},${normalized.revision},
          ${normalized.revisionKind},${normalized.sourceArtifactRevisionId},'combined_geo_report_v4','pending',
          ${pendingPayloadIdentity(normalized)},NULL,NULL,NULL,NULL,NULL
        ) ON CONFLICT DO NOTHING
        RETURNING id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
      `;
      if (rows.length !== 1) throw new Error("V4 artifact revision insert must affect exactly one row.");
      return parsePostgresRevision(rows[0]!, "inserted V4 artifact revision");
    },

    async markReady(id, payloadIdentityHash, htmlSha256) {
      const rows = await sql`
        UPDATE report_artifact_revisions SET status='ready',
          payload_identity_hash=${sha256(payloadIdentityHash, "payloadIdentityHash")},
          html_sha256=${sha256(htmlSha256, "htmlSha256")},ready_at=clock_timestamp(),activated_at=NULL,
          pdf_sha256=NULL,pdf_storage_key=NULL
        WHERE id=${requiredText(id, "artifactRevisionId")} AND status='pending'
          AND artifact_contract='combined_geo_report_v4'
        RETURNING id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
          artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
      `;
      return parseOptionalPostgresRevision(rows, "V4 artifact readiness transition");
    },

    async transitionStatus(id, from, to) {
      assertAllowedPostgresStatusTransition(from, to);
      const normalizedId = requiredText(id, "artifactRevisionId");
      const rows = from === "ready" && to === "active"
        ? await sql`
            UPDATE report_artifact_revisions SET status=${to},activated_at=clock_timestamp(),
              pdf_sha256=NULL,pdf_storage_key=NULL
            WHERE id=${normalizedId} AND status=${from} AND artifact_contract='combined_geo_report_v4'
            RETURNING id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
              artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
          `
        : await sql`
            UPDATE report_artifact_revisions SET status=${to},activated_at=NULL,
              pdf_sha256=NULL,pdf_storage_key=NULL
            WHERE id=${normalizedId} AND status=${from} AND artifact_contract='combined_geo_report_v4'
            RETURNING id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,
              artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key
          `;
      return parseOptionalPostgresRevision(rows, "V4 artifact status transition");
    },

    async setActiveRevision(reportId, revisionId) {
      const normalizedReportId = requireLockedReport(reportId, lockedReports);
      const rows = await sql<ArrayRow>`
        UPDATE scan_reports AS report
        SET active_artifact_revision_id=artifact.id
        FROM report_artifact_revisions AS artifact
        WHERE report.id=${normalizedReportId} AND artifact.id=${requiredText(revisionId, "artifactRevisionId")}
          AND artifact.report_id=report.id AND artifact.artifact_contract='combined_geo_report_v4'
          AND artifact.status='active'
        RETURNING report.id,report.active_artifact_revision_id
      `;
      if (rows.length !== 1) {
        throw new Error("The V4 active pointer must affect exactly one same-report row with an active revision.");
      }
    }
  };
}

type ArrayRow = Record<string, unknown>;

function artifactRevisionLockKey(reportId: string): string {
  return `artifact-revision:${reportId}`;
}

function pendingPayloadIdentity(input: ReportV4PendingRevisionInsert): string {
  return `v4-pending:${input.jobId}:${input.id}`;
}

function requireLockedReport(reportId: string, lockedReports: ReadonlySet<string>): string {
  const normalized = requiredText(reportId, "reportId");
  if (!lockedReports.has(normalized)) throw new Error("The V4 artifact report advisory lock is required for this operation.");
  return normalized;
}

function postgresPendingRevision(input: ReportV4PendingRevisionInsert): ReportV4PendingRevisionInsert {
  if (input.artifactContract !== REPORT_V4_ARTIFACT_CONTRACT) throw new TypeError("Only the V4 artifact contract may be inserted.");
  const revisionKind = assertReportV4ArtifactRevisionKind(input.revisionKind);
  const sourceArtifactRevisionId = input.sourceArtifactRevisionId === null
    ? null
    : requiredText(input.sourceArtifactRevisionId, "sourceArtifactRevisionId");
  if ((revisionKind === "generation") !== (sourceArtifactRevisionId === null)) {
    throw new TypeError("V4 generation revisions cannot have a source and diagnosis enhancements require one.");
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new TypeError("revision must be a positive integer.");
  return {
    id: requiredText(input.id, "artifactRevisionId"),
    reportId: requiredText(input.reportId, "reportId"),
    orderId: requiredText(input.orderId, "orderId"),
    jobId: requiredText(input.jobId, "jobId"),
    configSnapshotId: requiredText(input.configSnapshotId, "configSnapshotId"),
    revision: input.revision,
    revisionKind,
    sourceArtifactRevisionId,
    artifactContract: REPORT_V4_ARTIFACT_CONTRACT
  };
}

function assertAllowedPostgresStatusTransition(
  from: ReportV4ArtifactRevisionStatus,
  to: ReportV4ArtifactRevisionStatus
): void {
  const allowed = (from === "ready" && (to === "active" || to === "failed"))
    || (from === "active" && to === "ready")
    || (from === "pending" && to === "failed");
  if (!allowed) throw new TypeError(`V4 artifact status transition ${from}->${to} is not allowed.`);
}

function parseOptionalPostgresRevision(
  rows: readonly Record<string, unknown>[],
  operation: string
): ReportV4ArtifactRevisionRow | null {
  if (rows.length > 1) throw new Error(`${operation} returned more than one row.`);
  return rows[0] ? parsePostgresRevision(rows[0], operation) : null;
}

function parsePostgresRevision(row: Record<string, unknown>, operation: string): ReportV4ArtifactRevisionRow {
  if (row.artifact_contract !== REPORT_V4_ARTIFACT_CONTRACT) {
    throw new Error(`${operation} returned a row outside the V4 artifact contract.`);
  }
  if (row.pdf_sha256 !== null || row.pdf_storage_key !== null) {
    throw new Error(`${operation} returned a V4 artifact whose PDF fields are not NULL.`);
  }
  const revisionKind = assertReportV4ArtifactRevisionKind(dbText(row.revision_kind, `${operation}.revision_kind`));
  const status = dbStatus(row.status, `${operation}.status`);
  const sourceArtifactRevisionId = dbNullableText(row.source_artifact_revision_id, `${operation}.source_artifact_revision_id`);
  const configSnapshotId = dbText(row.config_snapshot_id, `${operation}.config_snapshot_id`);
  if ((revisionKind === "generation") !== (sourceArtifactRevisionId === null)) {
    throw new Error(`${operation} returned invalid V4 artifact lineage.`);
  }
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1) {
    throw new Error(`${operation}.revision must be a positive integer.`);
  }
  const payloadIdentityHash = dbNullableText(row.payload_identity_hash, `${operation}.payload_identity_hash`);
  const htmlSha256 = dbNullableText(row.html_sha256, `${operation}.html_sha256`);
  if ((status === "ready" || status === "active") && (!payloadIdentityHash || !htmlSha256)) {
    throw new Error(`${operation} returned a ready V4 artifact without HTML and payload identity.`);
  }
  return {
    id: dbText(row.id, `${operation}.id`),
    reportId: dbText(row.report_id, `${operation}.report_id`),
    orderId: dbText(row.order_id, `${operation}.order_id`),
    jobId: dbText(row.job_id, `${operation}.job_id`),
    configSnapshotId,
    revision: Number(row.revision),
    revisionKind,
    sourceArtifactRevisionId,
    artifactContract: REPORT_V4_ARTIFACT_CONTRACT,
    status,
    payloadIdentityHash,
    htmlSha256
  };
}

function dbStatus(value: unknown, field: string): ReportV4ArtifactRevisionStatus {
  if (value === "pending" || value === "ready" || value === "active" || value === "failed") return value;
  throw new Error(`${field} is not a V4 artifact revision status.`);
}

function dbText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty database text.`);
  return value;
}

function dbNullableText(value: unknown, field: string): string | null {
  return value === null ? null : dbText(value, field);
}

function coreIdentity(input: ReportV4CoreGenerationIdentity): Omit<ReportV4PendingRevisionInsert, "revision"> {
  return {
    id: requiredText(input.artifactRevisionId, "artifactRevisionId"),
    reportId: requiredText(input.reportId, "reportId"),
    orderId: requiredText(input.orderId, "orderId"),
    jobId: requiredText(input.jobId, "jobId"),
    configSnapshotId: requiredText(input.configSnapshotId, "configSnapshotId"),
    revisionKind: "generation",
    sourceArtifactRevisionId: null,
    artifactContract: REPORT_V4_ARTIFACT_CONTRACT
  };
}

function enhancementIdentity(input: ReportV4DiagnosisEnhancementIdentity): Omit<ReportV4PendingRevisionInsert, "revision"> {
  return {
    id: requiredText(input.artifactRevisionId, "artifactRevisionId"),
    reportId: requiredText(input.reportId, "reportId"),
    orderId: requiredText(input.orderId, "orderId"),
    jobId: requiredText(input.jobId, "jobId"),
    configSnapshotId: requiredText(input.configSnapshotId, "configSnapshotId"),
    revisionKind: "diagnosis_enhancement",
    sourceArtifactRevisionId: requiredText(input.sourceArtifactRevisionId, "sourceArtifactRevisionId"),
    artifactContract: REPORT_V4_ARTIFACT_CONTRACT
  };
}

async function requireCoreSource(
  identity: Omit<ReportV4PendingRevisionInsert, "revision">,
  tx: ReportV4ArtifactRevisionTransaction
): Promise<ReportV4ArtifactRevisionRow> {
  const sourceId = identity.sourceArtifactRevisionId;
  const source = sourceId ? await tx.getRevision(sourceId) : null;
  if (!source || source.artifactContract !== REPORT_V4_ARTIFACT_CONTRACT || source.revisionKind !== "generation"
    || source.reportId !== identity.reportId || source.orderId !== identity.orderId) {
    throw new Error("A V4 diagnosis enhancement must point to a same report and order core generation revision.");
  }
  if (source.status !== "active") {
    throw new Error("A V4 diagnosis enhancement requires the report's current active core generation revision.");
  }
  if (source.configSnapshotId !== identity.configSnapshotId) {
    throw new Error("A V4 diagnosis enhancement must use the same immutable configuration snapshot as its core revision.");
  }
  return source;
}

async function ensureReady(
  revision: ReportV4ArtifactRevisionRow,
  payloadIdentityHash: string,
  htmlSha256: string,
  tx: ReportV4ArtifactRevisionTransaction
): Promise<ReportV4ArtifactRevisionRow> {
  if (revision.status === "ready") {
    assertReadyHashes(revision, payloadIdentityHash, htmlSha256);
    return revision;
  }
  if (revision.status !== "pending") throw new Error("Only a pending V4 revision may become HTML-ready.");
  const ready = await tx.markReady(revision.id, payloadIdentityHash, htmlSha256);
  if (!ready) throw new Error("The pending V4 revision could not become HTML-ready.");
  return ready;
}

function assertReadyHashes(revision: ReportV4ArtifactRevisionRow, payloadIdentityHash: string, htmlSha256: string): void {
  if (revision.payloadIdentityHash !== payloadIdentityHash || revision.htmlSha256 !== htmlSha256) {
    throw new Error("V4 artifact revision idempotency conflict: HTML or payload identity changed.");
  }
}

function assertRevisionIdentity(
  revision: ReportV4ArtifactRevisionRow,
  identity: Omit<ReportV4PendingRevisionInsert, "revision">
): void {
  if (revision.reportId !== identity.reportId || revision.orderId !== identity.orderId || revision.jobId !== identity.jobId
    || revision.configSnapshotId !== identity.configSnapshotId
    || revision.revisionKind !== identity.revisionKind || revision.sourceArtifactRevisionId !== identity.sourceArtifactRevisionId
    || revision.artifactContract !== identity.artifactContract) {
    throw new Error("V4 artifact revision idempotency identity conflict.");
  }
}

function strictInput(value: object, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}.`);
}

function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be non-empty text.`);
  return value.trim();
}

function sha256(value: string, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${field} must be a lowercase 64-character SHA-256.`);
  }
  return value;
}
