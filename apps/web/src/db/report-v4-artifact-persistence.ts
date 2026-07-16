import { createHash } from "node:crypto";
import type postgres from "postgres";
import {
  parseCombinedGeoReportV4,
  type CombinedGeoReportV4
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export type ReportV4ArtifactPersistenceRevisionKind = "generation" | "diagnosis_enhancement";
export type ReportV4ArtifactPersistenceStatus = "pending" | "ready" | "active";

export interface ReportV4ArtifactQuestionBinding {
  readonly order: 1 | 2 | 3;
  readonly questionId: string;
  readonly questionText: string;
}

export interface ReportV4ArtifactOrderBinding {
  readonly orderId: string;
  readonly reportId: string;
  readonly fulfillmentJobId: string;
  readonly siteSnapshotId: string;
  readonly productCode: string;
  readonly fulfillmentMethodology: string;
  readonly recommendationReportVersion: number;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
}

export interface ReportV4ArtifactPersistenceContext {
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly coreJobId: string;
  readonly questionSetId: string;
  readonly configSnapshotId: string;
  readonly siteSnapshotId: string;
  readonly revisionKind: ReportV4ArtifactPersistenceRevisionKind;
  readonly sourceArtifactRevisionId: string | null;
  readonly artifactContract: "combined_geo_report_v4";
  readonly status: ReportV4ArtifactPersistenceStatus;
  readonly payloadIdentityHash: string;
  readonly htmlSha256: string | null;
  readonly orderBinding: ReportV4ArtifactOrderBinding;
  readonly questionBindings: readonly [
    ReportV4ArtifactQuestionBinding,
    ReportV4ArtifactQuestionBinding,
    ReportV4ArtifactQuestionBinding
  ];
}

export interface PersistReportV4ArtifactPayloadInput {
  readonly report: unknown;
  readonly canonicalHtml: string;
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly coreJobId: string;
  readonly questionSetId: string;
  readonly configSnapshotId: string;
  readonly siteSnapshotId: string;
  readonly revisionKind: ReportV4ArtifactPersistenceRevisionKind;
  readonly sourceArtifactRevisionId: string | null;
}

export interface PersistedReportV4ArtifactPayload {
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly coreJobId: string;
  readonly questionSetId: string;
  readonly configSnapshotId: string;
  readonly siteSnapshotId: string;
  readonly revisionKind: ReportV4ArtifactPersistenceRevisionKind;
  readonly sourceArtifactRevisionId: string | null;
  readonly payloadIdentityHash: string;
  readonly htmlSha256: string;
  readonly report: CombinedGeoReportV4;
}

export interface ReportV4ArtifactPayloadRow {
  readonly artifactRevisionId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly jobId: string;
  readonly questionSetId: string;
  readonly payload: unknown;
}

export interface ReportV4ArtifactPersistenceTransaction {
  lockContext(artifactRevisionId: string): Promise<ReportV4ArtifactPersistenceContext | null>;
  getPayload(artifactRevisionId: string): Promise<ReportV4ArtifactPayloadRow | null>;
  insertPayload(row: ReportV4ArtifactPayloadRow): Promise<ReportV4ArtifactPayloadRow | null>;
  bindPendingHashes(artifactRevisionId: string, payloadIdentityHash: string, htmlSha256: string): Promise<boolean>;
}

export interface ReportV4ArtifactPersistenceStore {
  transaction<T>(work: (tx: ReportV4ArtifactPersistenceTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4ArtifactPersistenceSql {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ArtifactPersistenceSqlValue[]
  ): Promise<T[]>;
}

export type ReportV4ArtifactPersistenceSqlValue = string | number | boolean | Date | null;

export interface ReportV4ArtifactPersistencePostgresDatabase {
  transaction<T>(work: (sql: ReportV4ArtifactPersistenceSql) => Promise<T>): Promise<T>;
}

const INPUT_FIELDS = new Set([
  "report", "canonicalHtml", "artifactRevisionId", "reportId", "orderId", "jobId", "coreJobId",
  "questionSetId", "configSnapshotId", "siteSnapshotId", "revisionKind", "sourceArtifactRevisionId"
]);
const HASH = /^[a-f0-9]{64}$/u;

export async function persistReportV4ArtifactPayload(
  input: PersistReportV4ArtifactPayloadInput,
  store: ReportV4ArtifactPersistenceStore = createPostgresReportV4ArtifactPersistenceStore()
): Promise<PersistedReportV4ArtifactPayload> {
  const candidate = persistenceCandidate(input);
  return store.transaction(async (tx) => {
    const context = await tx.lockContext(candidate.artifactRevisionId);
    if (!context) throw new Error("The exact V4 artifact revision is missing.");
    assertExactContext(context, candidate);
    const existing = await tx.getPayload(candidate.artifactRevisionId);
    if (existing) {
      const validated = validatePersistedPayload(context, existing);
      assertSamePayloadCandidate(validated, candidate);
      if (context.status === "pending") {
        const bound = await tx.bindPendingHashes(context.artifactRevisionId, candidate.payloadIdentityHash, candidate.htmlSha256);
        if (!bound) throw new Error("The pending V4 artifact hashes conflict with the persisted payload identity.");
        return persistedFromValidated(context, validated, candidate.htmlSha256);
      }
      const persisted = materializeValidated(context, validated);
      assertSameCandidate(persisted, candidate);
      return persisted;
    }
    if (context.status !== "pending") {
      throw new Error("A missing V4 payload may only be persisted while its artifact revision is pending.");
    }
    assertPendingHashesAvailable(context, candidate);
    const inserted = await tx.insertPayload(payloadRow(candidate));
    if (!inserted) {
      const raced = await tx.getPayload(candidate.artifactRevisionId);
      if (!raced) throw new Error("The V4 payload insert did not persist an exact row.");
      const validated = validatePersistedPayload(context, raced);
      assertSamePayloadCandidate(validated, candidate);
    }
    const bound = await tx.bindPendingHashes(context.artifactRevisionId, candidate.payloadIdentityHash, candidate.htmlSha256);
    if (!bound) throw new Error("The pending V4 artifact hashes conflict with the persisted payload identity.");
    return deepFreeze({ ...candidate });
  });
}

export async function getReportV4ArtifactPayload(
  artifactRevisionId: string,
  store: ReportV4ArtifactPersistenceStore = createPostgresReportV4ArtifactPersistenceStore()
): Promise<PersistedReportV4ArtifactPayload | null> {
  const id = text(artifactRevisionId, "artifactRevisionId");
  return store.transaction(async (tx) => {
    const context = await tx.lockContext(id);
    if (!context) return null;
    assertV4Context(context);
    const row = await tx.getPayload(id);
    return row ? materialize(context, row) : null;
  });
}

export function createReportV4ArtifactPersistencePostgresDatabase(
  sql: Pick<postgres.Sql, "begin">
): ReportV4ArtifactPersistencePostgresDatabase {
  return {
    async transaction(work) {
      const envelope = await sql.begin(async (tx) => ({ value: await work(adaptSql(tx)) }));
      return envelope.value;
    }
  };
}

export function createPostgresReportV4ArtifactPersistenceStore(
  database: ReportV4ArtifactPersistencePostgresDatabase = livePostgresDatabase()
): ReportV4ArtifactPersistenceStore {
  return { transaction: (work) => database.transaction((sql) => work(postgresTransaction(sql))) };
}

export function createMemoryReportV4ArtifactPersistenceStore(
  contexts: readonly ReportV4ArtifactPersistenceContext[],
  rows: readonly ReportV4ArtifactPayloadRow[] = [],
  seedIdentity?: PersistReportV4ArtifactPayloadInput
): ReportV4ArtifactPersistenceStore & { readonly writeCount: number } {
  const byContext = new Map(contexts.map((context) => [context.artifactRevisionId, cloneContext(context)]));
  const byPayload = new Map(rows.map((row) => [row.artifactRevisionId, clonePayloadRow(row)]));
  if (seedIdentity) {
    const seed = persistenceCandidate(seedIdentity);
    const context = byContext.get(seed.artifactRevisionId);
    if (context) byContext.set(seed.artifactRevisionId, { ...context, payloadIdentityHash: seed.payloadIdentityHash, htmlSha256: seed.htmlSha256 });
  }
  let writes = 0;
  const store: ReportV4ArtifactPersistenceStore & { readonly writeCount: number } = {
    get writeCount() { return writes; },
    async transaction(work) {
      const contextBackup = new Map([...byContext].map(([id, context]) => [id, cloneContext(context)]));
      const payloadBackup = new Map([...byPayload].map(([id, row]) => [id, clonePayloadRow(row)]));
      const writeBackup = writes;
      try {
        return await work({
          async lockContext(id) {
            const context = byContext.get(id);
            return context ? cloneContext(context) : null;
          },
          async getPayload(id) {
            const row = byPayload.get(id);
            return row ? clonePayloadRow(row) : null;
          },
          async insertPayload(row) {
            if (byPayload.has(row.artifactRevisionId)) return null;
            const conflicting = [...byPayload.values()].some((existing) =>
              existing.reportId === row.reportId && existing.jobId === row.jobId);
            if (conflicting) return null;
            byPayload.set(row.artifactRevisionId, clonePayloadRow(row));
            writes += 1;
            return clonePayloadRow(row);
          },
          async bindPendingHashes(id, payloadIdentityHash, htmlSha256) {
            const context = byContext.get(id);
            if (!context || context.status !== "pending") return false;
            if (!isPendingIdentity(context.payloadIdentityHash, context) && context.payloadIdentityHash !== payloadIdentityHash) return false;
            if (context.htmlSha256 !== null && context.htmlSha256 !== htmlSha256) return false;
            byContext.set(id, { ...context, payloadIdentityHash, htmlSha256 });
            return true;
          }
        });
      } catch (error) {
        byContext.clear();
        contextBackup.forEach((context, id) => byContext.set(id, context));
        byPayload.clear();
        payloadBackup.forEach((row, id) => byPayload.set(id, row));
        writes = writeBackup;
        throw error;
      }
    }
  };
  return store;
}

function livePostgresDatabase(): ReportV4ArtifactPersistencePostgresDatabase {
  return {
    async transaction(work) {
      await ensureDatabase();
      return createReportV4ArtifactPersistencePostgresDatabase(getSqlClient()).transaction(work);
    }
  };
}

function adaptSql(tx: postgres.TransactionSql): ReportV4ArtifactPersistenceSql {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ArtifactPersistenceSqlValue[]
  ): Promise<T[]> => [...await tx<T[]>(strings, ...values)];
}

function postgresTransaction(sql: ReportV4ArtifactPersistenceSql): ReportV4ArtifactPersistenceTransaction {
  return {
    async lockContext(artifactRevisionId) {
      const id = text(artifactRevisionId, "artifactRevisionId");
      const rows = await sql`
        SELECT artifact.id AS artifact_revision_id,artifact.report_id,artifact.order_id,artifact.job_id,
          artifact.config_snapshot_id,artifact.revision_kind,artifact.source_artifact_revision_id,
          artifact.artifact_contract,artifact.status,artifact.payload_identity_hash,artifact.html_sha256,
          config.report_id AS config_report_id,config.order_id AS config_order_id,config.core_job_id,
          payment.id AS payment_order_id,payment.report_id AS payment_report_id,
          payment.fulfillment_job_id AS payment_fulfillment_job_id,payment.site_snapshot_id AS payment_site_snapshot_id,
          payment.product_code AS payment_product_code,payment.fulfillment_methodology AS payment_fulfillment_methodology,
          payment.recommendation_report_version AS payment_recommendation_report_version,
          payment.payment_status,payment.fulfillment_status,
          job.report_id AS job_report_id,job.reason AS job_reason,job.artifact_contract AS job_artifact_contract,
          job.business_question_set_id AS job_question_set_id,
          core.report_id AS core_report_id,core.reason AS core_reason,core.artifact_contract AS core_artifact_contract,
          core.business_question_set_id AS core_question_set_id,core.site_snapshot_id,
          questions.report_id AS question_report_id,questions.order_id AS question_order_id,questions.status AS question_status,
          site.report_id AS site_report_id,site.status AS site_status,site.content_identity_hash AS site_content_identity_hash,
          source.report_id AS source_report_id,source.order_id AS source_order_id,source.job_id AS source_job_id,
          source.config_snapshot_id AS source_config_snapshot_id,source.revision_kind AS source_revision_kind,
          source.artifact_contract AS source_artifact_contract,source.status AS source_status
        FROM report_artifact_revisions artifact
        LEFT JOIN report_v4_config_snapshots config ON config.id=artifact.config_snapshot_id
        JOIN payment_orders payment ON payment.id=artifact.order_id
        LEFT JOIN scan_jobs job ON job.id=artifact.job_id
        LEFT JOIN scan_jobs core ON core.id=config.core_job_id
        LEFT JOIN report_business_question_sets questions ON questions.id=core.business_question_set_id
        LEFT JOIN report_v4_site_snapshots site ON site.id=core.site_snapshot_id
        LEFT JOIN report_artifact_revisions source ON source.id=artifact.source_artifact_revision_id
        WHERE artifact.id=${id}
        FOR UPDATE OF artifact,payment
      `;
      if (rows.length > 1) throw new Error("Multiple artifact revisions share one V4 persistence identity.");
      if (!rows[0]) return null;
      const questionRows = await sql`
        SELECT id,ordinal,COALESCE(private_text,generated_text) AS question_text
        FROM report_business_questions WHERE question_set_id=${dbText(rows[0].core_question_set_id, "core question set")}
        ORDER BY ordinal
      `;
      return postgresContext(rows[0], questionRows);
    },
    async getPayload(artifactRevisionId) {
      const rows = await sql`
        SELECT artifact_revision_id,report_id,order_id,job_id,question_set_id,payload
        FROM combined_geo_reports WHERE artifact_revision_id=${text(artifactRevisionId, "artifactRevisionId")}
      `;
      if (rows.length > 1) throw new Error("Multiple combined payloads share one artifact revision.");
      return rows[0] ? postgresPayloadRow(rows[0]) : null;
    },
    async insertPayload(row) {
      const normalized = clonePayloadRow(row);
      const rows = await sql`
        INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
        VALUES(${normalized.artifactRevisionId},${normalized.reportId},${normalized.orderId},${normalized.jobId},
          ${normalized.questionSetId},${JSON.stringify(normalized.payload)}::text::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING artifact_revision_id,report_id,order_id,job_id,question_set_id,payload
      `;
      return rows[0] ? postgresPayloadRow(rows[0]) : null;
    },
    async bindPendingHashes(artifactRevisionId, payloadIdentityHash, htmlSha256) {
      const rows = await sql`
        UPDATE report_artifact_revisions
        SET payload_identity_hash=${hash(payloadIdentityHash, "payloadIdentityHash")},
          html_sha256=${hash(htmlSha256, "htmlSha256")}
        WHERE id=${text(artifactRevisionId, "artifactRevisionId")}
          AND artifact_contract='combined_geo_report_v4' AND status='pending'
          AND (payload_identity_hash LIKE 'v4-pending:%' OR payload_identity_hash=${payloadIdentityHash})
          AND (html_sha256 IS NULL OR html_sha256=${htmlSha256})
        RETURNING id
      `;
      return rows.length === 1;
    }
  };
}

type Candidate = PersistedReportV4ArtifactPayload;

function persistenceCandidate(input: PersistReportV4ArtifactPayloadInput): Candidate {
  const record = strictRecord(input, INPUT_FIELDS, "V4 artifact payload persistence");
  const report = parseCombinedGeoReportV4(record.report);
  const artifactRevisionId = text(record.artifactRevisionId, "artifactRevisionId");
  const reportId = text(record.reportId, "reportId");
  const revisionKind = revisionKindOf(record.revisionKind);
  const sourceArtifactRevisionId = record.sourceArtifactRevisionId === null
    ? null
    : text(record.sourceArtifactRevisionId, "sourceArtifactRevisionId");
  if ((revisionKind === "generation") !== (sourceArtifactRevisionId === null)) {
    throw new TypeError("The V4 revision kind and source lineage identity conflict.");
  }
  if (report.reportId !== reportId || report.artifactRevisionId !== artifactRevisionId) {
    throw new TypeError("The V4 payload identity does not match its report and artifact revision lineage.");
  }
  const canonicalHtml = typeof record.canonicalHtml === "string" ? record.canonicalHtml : "";
  if (!canonicalHtml.trim() || !/data-report-version=(?:"4"|'4')/u.test(canonicalHtml)) {
    throw new TypeError("canonicalHtml must be caller-rendered V4 HTML.");
  }
  const parsed = deepFreeze(parseCombinedGeoReportV4(report));
  return deepFreeze({
    artifactRevisionId,
    reportId,
    orderId: text(record.orderId, "orderId"),
    jobId: text(record.jobId, "jobId"),
    coreJobId: text(record.coreJobId, "coreJobId"),
    questionSetId: text(record.questionSetId, "questionSetId"),
    configSnapshotId: text(record.configSnapshotId, "configSnapshotId"),
    siteSnapshotId: text(record.siteSnapshotId, "siteSnapshotId"),
    revisionKind,
    sourceArtifactRevisionId,
    payloadIdentityHash: sha256(canonicalJson(parsed)),
    htmlSha256: sha256(canonicalHtml),
    report: parsed
  });
}

function assertExactContext(context: ReportV4ArtifactPersistenceContext, candidate: Candidate): void {
  assertV4Context(context);
  for (const field of ["artifactRevisionId", "reportId", "orderId", "jobId", "coreJobId", "questionSetId",
    "configSnapshotId", "siteSnapshotId", "revisionKind", "sourceArtifactRevisionId"] as const) {
    if (context[field] !== candidate[field]) throw new Error(`The V4 artifact ${field} lineage identity does not match.`);
  }
  context.questionBindings.forEach((binding, index) => {
    const question = candidate.report.questions[index];
    if (!question || question.order !== binding.order || question.questionId !== binding.questionId || question.questionText !== binding.questionText) {
      throw new Error("The V4 payload does not match its exact business question set lineage.");
    }
  });
  assertPendingHashesAvailable(context, candidate);
}

function assertV4Context(context: ReportV4ArtifactPersistenceContext): void {
  if (context.artifactContract !== "combined_geo_report_v4") throw new Error("Only a V4 artifact contract may persist this payload.");
  if (!(["pending", "ready", "active"] as const).includes(context.status)) throw new Error("The V4 artifact revision status is not persistable.");
  if (context.questionBindings.length !== 3) throw new Error("The V4 business question set lineage must contain exactly three questions.");
  if ((context.revisionKind === "generation") !== (context.sourceArtifactRevisionId === null)) {
    throw new Error("The persisted V4 revision kind has an invalid source lineage.");
  }
  if (context.revisionKind === "generation" && context.jobId !== context.coreJobId) {
    throw new Error("A V4 generation payload must bind the exact core job.");
  }
  const order = context.orderBinding;
  if (order.orderId !== context.orderId || order.reportId !== context.reportId
    || order.fulfillmentJobId !== context.coreJobId || order.siteSnapshotId !== context.siteSnapshotId
    || order.productCode !== "recommendation_forensics_v1"
    || order.fulfillmentMethodology !== "two_stage_geo_report_v4"
    || order.recommendationReportVersion !== 4 || order.paymentStatus !== "paid"
    || !["queued", "processing", "completed", "completed_limited"].includes(order.fulfillmentStatus)) {
    throw new Error("The V4 artifact does not bind an exact paid, fulfilling or completed V4 order.");
  }
}

function assertPendingHashesAvailable(context: ReportV4ArtifactPersistenceContext, candidate: Candidate): void {
  if (!isPendingIdentity(context.payloadIdentityHash, context) && context.payloadIdentityHash !== candidate.payloadIdentityHash) {
    throw new Error("The V4 payload identity hash conflicts with its artifact revision.");
  }
  if (context.htmlSha256 !== null && context.htmlSha256 !== candidate.htmlSha256) {
    throw new Error("The canonical V4 HTML hash conflicts with its artifact revision.");
  }
}

function materialize(context: ReportV4ArtifactPersistenceContext, row: ReportV4ArtifactPayloadRow): PersistedReportV4ArtifactPayload {
  return materializeValidated(context, validatePersistedPayload(context, row));
}

interface ValidatedReportV4ArtifactPayload {
  readonly payloadIdentityHash: string;
  readonly report: CombinedGeoReportV4;
}

function validatePersistedPayload(
  context: ReportV4ArtifactPersistenceContext,
  row: ReportV4ArtifactPayloadRow
): ValidatedReportV4ArtifactPayload {
  assertV4Context(context);
  if (row.artifactRevisionId !== context.artifactRevisionId || row.reportId !== context.reportId || row.orderId !== context.orderId
    || row.jobId !== context.jobId || row.questionSetId !== context.questionSetId) {
    throw new Error("The persisted V4 payload row conflicts with its exact lineage identity.");
  }
  const report = deepFreeze(parseCombinedGeoReportV4(row.payload));
  const payloadIdentityHash = sha256(canonicalJson(report));
  if (report.reportId !== context.reportId || report.artifactRevisionId !== context.artifactRevisionId) {
    throw new Error("The persisted V4 payload identity conflicts with its artifact revision.");
  }
  if (!isPendingIdentity(context.payloadIdentityHash, context) && context.payloadIdentityHash !== payloadIdentityHash) {
    throw new Error("The persisted V4 payload content identity conflicts with its artifact revision.");
  }
  return deepFreeze({ payloadIdentityHash, report });
}

function materializeValidated(
  context: ReportV4ArtifactPersistenceContext,
  validated: ValidatedReportV4ArtifactPayload
): PersistedReportV4ArtifactPayload {
  if (!context.htmlSha256 || !HASH.test(context.htmlSha256)) {
    throw new Error("The persisted V4 payload is missing its canonical HTML hash.");
  }
  return persistedFromValidated(context, validated, context.htmlSha256);
}

function persistedFromValidated(
  context: ReportV4ArtifactPersistenceContext,
  validated: ValidatedReportV4ArtifactPayload,
  htmlSha256: string
): PersistedReportV4ArtifactPayload {
  return deepFreeze({
    artifactRevisionId: context.artifactRevisionId,
    reportId: context.reportId,
    orderId: context.orderId,
    jobId: context.jobId,
    coreJobId: context.coreJobId,
    questionSetId: context.questionSetId,
    configSnapshotId: context.configSnapshotId,
    siteSnapshotId: context.siteSnapshotId,
    revisionKind: context.revisionKind,
    sourceArtifactRevisionId: context.sourceArtifactRevisionId,
    payloadIdentityHash: validated.payloadIdentityHash,
    htmlSha256,
    report: validated.report
  });
}

function assertSamePayloadCandidate(
  persisted: ValidatedReportV4ArtifactPayload,
  candidate: Candidate
): void {
  if (persisted.payloadIdentityHash !== candidate.payloadIdentityHash) {
    throw new Error("The V4 payload identity conflicts with the idempotent reentry.");
  }
}

function assertSameCandidate(persisted: PersistedReportV4ArtifactPayload, candidate: Candidate): void {
  if (persisted.payloadIdentityHash !== candidate.payloadIdentityHash || persisted.htmlSha256 !== candidate.htmlSha256) {
    throw new Error("The V4 payload or canonical HTML identity conflicts with the idempotent reentry.");
  }
  for (const field of ["artifactRevisionId", "reportId", "orderId", "jobId", "coreJobId", "questionSetId",
    "configSnapshotId", "siteSnapshotId", "revisionKind", "sourceArtifactRevisionId"] as const) {
    if (persisted[field] !== candidate[field]) throw new Error(`The V4 artifact ${field} identity conflicts with the idempotent reentry.`);
  }
}

function payloadRow(candidate: Candidate): ReportV4ArtifactPayloadRow {
  return {
    artifactRevisionId: candidate.artifactRevisionId,
    reportId: candidate.reportId,
    orderId: candidate.orderId,
    jobId: candidate.jobId,
    questionSetId: candidate.questionSetId,
    payload: candidate.report
  };
}

function postgresContext(row: Record<string, unknown>, questions: readonly Record<string, unknown>[]): ReportV4ArtifactPersistenceContext {
  const artifactContract = dbText(row.artifact_contract, "artifact.artifact_contract");
  if (artifactContract !== "combined_geo_report_v4") throw new Error("Only a V4 artifact contract may persist this payload.");
  const reportId = dbText(row.report_id, "artifact.report_id");
  const orderId = dbText(row.order_id, "artifact.order_id");
  const jobId = dbText(row.job_id, "artifact.job_id");
  const configSnapshotId = dbText(row.config_snapshot_id, "artifact.config_snapshot_id");
  const coreJobId = dbText(row.core_job_id, "config.core_job_id");
  const questionSetId = dbText(row.core_question_set_id, "core.business_question_set_id");
  const siteSnapshotId = dbText(row.site_snapshot_id, "core.site_snapshot_id");
  const revisionKind = revisionKindOf(row.revision_kind);
  const sourceArtifactRevisionId = row.source_artifact_revision_id === null
    ? null : dbText(row.source_artifact_revision_id, "artifact.source_artifact_revision_id");
  const orderBinding: ReportV4ArtifactOrderBinding = {
    orderId: dbText(row.payment_order_id, "payment.id"),
    reportId: dbText(row.payment_report_id, "payment.report_id"),
    fulfillmentJobId: dbText(row.payment_fulfillment_job_id, "payment.fulfillment_job_id"),
    siteSnapshotId: dbText(row.payment_site_snapshot_id, "payment.site_snapshot_id"),
    productCode: dbText(row.payment_product_code, "payment.product_code"),
    fulfillmentMethodology: dbText(row.payment_fulfillment_methodology, "payment.fulfillment_methodology"),
    recommendationReportVersion: dbInteger(row.payment_recommendation_report_version, "payment.recommendation_report_version"),
    paymentStatus: dbText(row.payment_status, "payment.payment_status"),
    fulfillmentStatus: dbText(row.fulfillment_status, "payment.fulfillment_status")
  };
  if (row.config_report_id !== reportId || row.config_order_id !== orderId || row.core_report_id !== reportId
    || row.job_report_id !== reportId || row.question_report_id !== reportId || row.question_order_id !== orderId
    || row.site_report_id !== reportId || row.job_artifact_contract !== artifactContract
    || row.core_artifact_contract !== artifactContract || row.job_question_set_id !== questionSetId
    || row.question_status !== "locked" || !["completed", "completed_limited"].includes(String(row.site_status))
    || !HASH.test(String(row.site_content_identity_hash))) {
    throw new Error("The V4 artifact database lineage is incomplete or inconsistent.");
  }
  if (row.core_reason !== "standard") throw new Error("The V4 core payload must bind a standard core job.");
  if (revisionKind === "generation") {
    if (jobId !== coreJobId || row.job_reason !== "standard" || sourceArtifactRevisionId !== null) {
      throw new Error("The V4 generation database lineage does not bind its exact core job.");
    }
  } else if (jobId === coreJobId || row.job_reason !== "v4_diagnosis_enhancement" || !sourceArtifactRevisionId
    || row.source_report_id !== reportId || row.source_order_id !== orderId || row.source_config_snapshot_id !== configSnapshotId
    || row.source_revision_kind !== "generation" || row.source_artifact_contract !== artifactContract
    || !["ready", "active"].includes(String(row.source_status))) {
    throw new Error("The V4 diagnosis enhancement database lineage does not bind its exact core source.");
  }
  if (questions.length !== 3) throw new Error("The V4 business question set must contain exactly three persisted questions.");
  const mappedQuestionBindings = questions.map((question, index): ReportV4ArtifactQuestionBinding => {
    const order = Number(question.ordinal);
    if (order !== index + 1) throw new Error("The V4 business question set order is invalid.");
    return {
      order: order as 1 | 2 | 3,
      questionId: dbText(question.id, `question[${index}].id`),
      questionText: dbText(question.question_text, `question[${index}].question_text`)
    };
  });
  const questionBindings: ReportV4ArtifactPersistenceContext["questionBindings"] = [
    mappedQuestionBindings[0]!,
    mappedQuestionBindings[1]!,
    mappedQuestionBindings[2]!
  ];
  const status = String(row.status);
  if (status !== "pending" && status !== "ready" && status !== "active") throw new Error("The V4 artifact revision status is not persistable.");
  return {
    artifactRevisionId: dbText(row.artifact_revision_id, "artifact.id"), reportId, orderId, jobId, coreJobId,
    questionSetId, configSnapshotId, siteSnapshotId, revisionKind, sourceArtifactRevisionId,
    artifactContract, status,
    payloadIdentityHash: dbText(row.payload_identity_hash, "artifact.payload_identity_hash"),
    htmlSha256: row.html_sha256 === null ? null : dbText(row.html_sha256, "artifact.html_sha256"),
    orderBinding,
    questionBindings
  };
}

function postgresPayloadRow(row: Record<string, unknown>): ReportV4ArtifactPayloadRow {
  return {
    artifactRevisionId: dbText(row.artifact_revision_id, "combined.artifact_revision_id"),
    reportId: dbText(row.report_id, "combined.report_id"),
    orderId: dbText(row.order_id, "combined.order_id"),
    jobId: dbText(row.job_id, "combined.job_id"),
    questionSetId: dbText(row.question_set_id, "combined.question_set_id"),
    payload: row.payload
  };
}

function strictRecord(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).filter((field) => !allowed.has(field));
  if (unknown.length) throw new TypeError(`${label} has unknown field ${unknown.join(", ")}.`);
  return row;
}

function revisionKindOf(value: unknown): ReportV4ArtifactPersistenceRevisionKind {
  if (value === "generation" || value === "diagnosis_enhancement") return value;
  throw new TypeError("revisionKind must be generation or diagnosis_enhancement.");
}

function cloneContext(context: ReportV4ArtifactPersistenceContext): ReportV4ArtifactPersistenceContext {
  return {
    ...context,
    orderBinding: { ...context.orderBinding },
    questionBindings: [
      { ...context.questionBindings[0] },
      { ...context.questionBindings[1] },
      { ...context.questionBindings[2] }
    ]
  };
}

function clonePayloadRow(row: ReportV4ArtifactPayloadRow): ReportV4ArtifactPayloadRow {
  return { ...row, payload: structuredClone(row.payload) };
}

function isPendingIdentity(value: string, context: Pick<ReportV4ArtifactPersistenceContext, "jobId" | "artifactRevisionId">): boolean {
  return value === `v4-pending:${context.jobId}:${context.artifactRevisionId}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
  return value.trim();
}

function dbText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be persisted non-empty text.`);
  return value;
}

function dbInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} must be a persisted integer.`);
  return value;
}

function hash(value: string, label: string): string {
  if (!HASH.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
