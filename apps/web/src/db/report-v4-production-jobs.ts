import { createHash } from "node:crypto";
import type postgres from "postgres";
import { ensureDatabase, getSqlClient } from "./index";

export type ReportV4Locale = "en" | "zh";

export interface ReportV4ProductionCoreAggregate {
  report: { id: string; locale: string | null; activeArtifactRevisionId: string | null };
  coreJob: ReportV4ProductionCoreJob;
  orders: Array<{
    id: string; reportId: string; fulfillmentJobId: string | null; siteSnapshotId: string | null;
    productCode: string; fulfillmentMethodology: string | null; recommendationReportVersion: number | null;
    questionSetId: string | null; reportLocale: string; paymentStatus: string; fulfillmentStatus: string; refundStatus: string;
  }>;
  siteSnapshots: Array<{
    id: string; reportId: string; siteKey: string; status: string;
    collectorConfigIdentityHash: string; contentIdentityHash: string | null;
  }>;
  questionSets: Array<{ id: string; reportId: string; orderId: string | null; region: string; locale: string; status: string }>;
  questions: Array<{ id: string; questionSetId: string; ordinal: number; purpose: string; privateText: string | null }>;
  configSnapshots: Array<{
    id: string; reportId: string; orderId: string; coreJobId: string; identityHash: string;
    modelProfileId: string; modelProfileHash: string; reportProfileId: string; reportProfileHash: string;
  }>;
  credits: Array<{ id: string; reportId: string; jobId: string | null; paymentOrderId: string | null; status: string }>;
  activeArtifacts: Array<{
    id: string; reportId: string; orderId: string; jobId: string; configSnapshotId: string | null;
    revisionKind: string; artifactContract: string; status: string; sourceArtifactRevisionId: string | null;
  }>;
  activeAccessTokenCount: number;
}

export interface ReportV4ProductionCoreJob {
  id: string; reportId: string; siteSnapshotId: string | null; tier: string; productContract: string;
  fulfillmentMethodology: string | null; recommendationReportVersion: number | null; artifactContract: string | null;
  questionSetId: string | null; locale: string; reason: string; stage: string; executionState: string;
  creditReservationId: string | null; correctionId: string | null; replacementFulfillmentId: string | null;
}

export interface ReportV4ProductionEnhancementJob extends Omit<ReportV4ProductionCoreJob, "siteSnapshotId"> {
  siteSnapshotId: null;
}

export interface ReportV4ProductionJobTransaction {
  acquireEnhancementLock(reportId: string): Promise<void>;
  loadCoreAggregate(coreJobId: string, forUpdate?: boolean): Promise<ReportV4ProductionCoreAggregate | null>;
  listEnhancementJobs(reportId: string, forUpdate?: boolean): Promise<ReportV4ProductionEnhancementJob[]>;
  insertEnhancementJob(job: ReportV4ProductionEnhancementJob): Promise<void>;
  loadEnhancementJob(id: string, forUpdate?: boolean): Promise<ReportV4ProductionEnhancementJob | null>;
}

export interface ReportV4ProductionJobStore {
  transaction<T>(work: (transaction: ReportV4ProductionJobTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4ProductionLineage {
  reportId: string; orderId: string; coreJobId: string; coreArtifactRevisionId: string;
  configSnapshotId: string; siteSnapshotId: string; questionSetId: string; locale: ReportV4Locale;
}

export interface ReportV4PaidCoreContext {
  report: ReportV4ProductionCoreAggregate["report"];
  order: ReportV4ProductionCoreAggregate["orders"][number];
  coreJob: ReportV4ProductionCoreJob;
  siteSnapshot: ReportV4ProductionCoreAggregate["siteSnapshots"][number];
  questionSet: ReportV4ProductionCoreAggregate["questionSets"][number];
  questions: ReportV4ProductionCoreAggregate["questions"];
  config: ReportV4ProductionCoreAggregate["configSnapshots"][number];
  credit: ReportV4ProductionCoreAggregate["credits"][number];
  activeCoreArtifact: ReportV4ProductionCoreAggregate["activeArtifacts"][number] | null;
  commercePhase: "reserved" | "settled";
}

export function createReportV4ProductionJobRepository(store: ReportV4ProductionJobStore = createPostgresStore()) {
  return {
    async loadPaidCoreContext(input: { coreJobId: string }): Promise<ReportV4PaidCoreContext> {
      return store.transaction(async (tx) => {
        const aggregate = await tx.loadCoreAggregate(requireId(input.coreJobId, "core job"));
        if (!aggregate) throw new Error("The exact paid V4 core job does not exist.");
        return validateCoreAggregate(aggregate);
      });
    },

    async enqueueDiagnosisEnhancement(input: ReportV4ProductionLineage): Promise<ReportV4ProductionEnhancementJob> {
      const lineage = validateLineageInput(input);
      return store.transaction(async (tx) => {
        // Schema V28 has no enhancement-job uniqueness index. This report-scoped transaction lock,
        // followed by an unbounded locked count, is the repository's concurrency boundary.
        await tx.acquireEnhancementLock(lineage.reportId);
        const aggregate = await tx.loadCoreAggregate(lineage.coreJobId, true);
        if (!aggregate) throw new Error("The exact paid V4 core lineage does not exist.");
        const core = validateCoreAggregate(aggregate);
        assertSettledActiveCore(core);
        assertLineage(core, lineage);

        const existing = await tx.listEnhancementJobs(lineage.reportId, true);
        if (existing.length > 1) throw new Error("Duplicate V4 diagnosis enhancement jobs violate exact lineage.");
        if (existing.length === 1) {
          assertEnhancementJob(existing[0]!, core);
          return existing[0]!;
        }

        const job: ReportV4ProductionEnhancementJob = {
          // V28 deliberately reserves a non-null scan_jobs.site_snapshot_id for the standard core job.
          // Enhancement snapshot lineage is therefore derived and verified through that exact active core.
          id: deterministicEnhancementJobId(lineage), reportId: lineage.reportId, siteSnapshotId: null,
          tier: "deep", productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
          recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", questionSetId: lineage.questionSetId,
          locale: lineage.locale, reason: "v4_diagnosis_enhancement", stage: "queued", executionState: "queued",
          creditReservationId: null, correctionId: null, replacementFulfillmentId: null
        };
        await tx.insertEnhancementJob(job);
        const stored = await tx.loadEnhancementJob(job.id, true);
        if (!stored) throw new Error("The exact V4 diagnosis enhancement job was not persisted.");
        assertEnhancementJob(stored, core);
        return stored;
      });
    },

    async loadDiagnosisEnhancementContext(input: ReportV4ProductionLineage & { enhancementJobId: string }) {
      const lineage = validateLineageInput(input);
      const enhancementJobId = requireId(input.enhancementJobId, "enhancement job");
      return store.transaction(async (tx) => {
        await tx.acquireEnhancementLock(lineage.reportId);
        const enhancementJobs = await tx.listEnhancementJobs(lineage.reportId, true);
        if (enhancementJobs.length !== 1) {
          throw new Error(`Exactly one V4 diagnosis enhancement job lineage is required; found ${enhancementJobs.length}.`);
        }
        const enhancementJob = enhancementJobs[0]!;
        if (enhancementJob.id !== enhancementJobId) throw new Error("The exact enhancement job identity does not match its report lineage.");
        const aggregate = await tx.loadCoreAggregate(lineage.coreJobId);
        if (!aggregate) throw new Error("The exact V4 source core lineage does not exist.");
        const core = validateCoreAggregate(aggregate, enhancementJob.id);
        if (core.commercePhase !== "settled" || !core.activeCoreArtifact) {
          throw new Error("The diagnosis enhancement requires a commercially settled source core.");
        }
        assertLineage(core, lineage);
        assertEnhancementJob(enhancementJob, core);
        return { enhancementJob, core };
      });
    }
  };
}

function validateCoreAggregate(value: ReportV4ProductionCoreAggregate, allowedActiveEnhancementJobId?: string): ReportV4PaidCoreContext {
  const job = value.coreJob;
  if (job.tier !== "deep" || job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "two_stage_geo_report_v4" || Number(job.recommendationReportVersion) !== 4 ||
      job.artifactContract !== "combined_geo_report_v4" || job.reason !== "standard" ||
      job.correctionId !== null || job.replacementFulfillmentId !== null || !job.creditReservationId ||
      !job.siteSnapshotId || !job.questionSetId || value.report.id !== job.reportId) {
    throw new Error("The exact standard paid V4 core job lineage is invalid.");
  }
  const locale = requireLocale(job.locale);
  if (value.report.locale !== locale) throw new Error("The immutable V4 report locale lineage conflicts.");

  const order = exactlyOne(value.orders, "paid V4 order");
  if (order.id.length === 0 || order.reportId !== job.reportId || order.fulfillmentJobId !== job.id ||
      order.siteSnapshotId !== job.siteSnapshotId || order.productCode !== job.productContract ||
      order.fulfillmentMethodology !== job.fulfillmentMethodology || Number(order.recommendationReportVersion) !== 4 ||
      order.questionSetId !== job.questionSetId || order.reportLocale !== locale || order.paymentStatus !== "paid") {
    throw new Error("The exact paid V4 order lineage conflicts with the core job.");
  }
  const snapshot = exactlyOne(value.siteSnapshots, "V4 site snapshot");
  if (snapshot.id !== job.siteSnapshotId || snapshot.reportId !== job.reportId ||
      !["completed", "completed_limited"].includes(snapshot.status) || !isHash(snapshot.collectorConfigIdentityHash) ||
      !snapshot.contentIdentityHash || !isHash(snapshot.contentIdentityHash)) {
    throw new Error("The exact terminal V4 site snapshot lineage is invalid.");
  }
  const questionSet = exactlyOne(value.questionSets, "V4 business question set");
  if (questionSet.id !== job.questionSetId || questionSet.reportId !== job.reportId || questionSet.orderId !== order.id ||
      questionSet.status !== "locked" || questionSet.locale !== locale || !questionSet.region.trim()) {
    throw new Error("The exact locked V4 question-set lineage is invalid.");
  }
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"];
  const questions = [...value.questions].sort((a, b) => a.ordinal - b.ordinal);
  if (questions.length !== 3 || questions.some((question, index) => question.questionSetId !== questionSet.id ||
      question.ordinal !== index + 1 || question.purpose !== purposes[index] || !question.privateText?.trim())) {
    throw new Error("The V4 core requires exactly three ordered private business questions.");
  }
  const config = exactlyOne(value.configSnapshots, "V4 configuration snapshot");
  if (config.reportId !== job.reportId || config.orderId !== order.id || config.coreJobId !== job.id ||
      ![config.identityHash, config.modelProfileHash, config.reportProfileHash].every(isHash) ||
      !config.modelProfileId.trim() || !config.reportProfileId.trim()) {
    throw new Error("The exact immutable V4 configuration lineage is invalid.");
  }
  const credit = exactlyOne(value.credits, "paid V4 credit");
  if (credit.id !== job.creditReservationId || credit.reportId !== job.reportId || credit.jobId !== job.id ||
      credit.paymentOrderId !== order.id) throw new Error("The exact V4 paid credit lineage is invalid.");

  const reserved = !["completed", "completed_limited", "failed"].includes(job.stage) &&
    ["queued", "running", "retry_wait", "repair_wait"].includes(job.executionState) &&
    ["queued", "processing"].includes(order.fulfillmentStatus) && order.refundStatus === "not_required" &&
    credit.status === "reserved" && value.activeArtifacts.length === 0 && value.activeAccessTokenCount === 0;
  const settled = job.stage === "completed" && job.executionState === "completed" &&
    order.fulfillmentStatus === "completed" && order.refundStatus === "not_required" && credit.status === "settled";
  if (!reserved && !settled) throw new Error("The V4 commercial job, order and credit state is not an exact reserved or settled phase.");

  let activeCoreArtifact: ReportV4ProductionCoreAggregate["activeArtifacts"][number] | null = null;
  if (settled) {
    const coreArtifacts = value.activeArtifacts.filter((artifact) => artifact.jobId === job.id && artifact.revisionKind === "generation");
    activeCoreArtifact = exactlyOne(coreArtifacts, "V4 source core generation artifact");
    const reportActiveArtifacts = value.activeArtifacts.filter((artifact) => artifact.id === value.report.activeArtifactRevisionId);
    const reportActiveArtifact = exactlyOne(reportActiveArtifacts, "current active V4 artifact");
    const expectedArtifactCount = reportActiveArtifact.id === activeCoreArtifact.id ? 1 : 2;
    if (value.activeArtifacts.length !== expectedArtifactCount ||
        new Set(value.activeArtifacts.map(({ id }) => id)).size !== value.activeArtifacts.length ||
        activeCoreArtifact.reportId !== job.reportId || activeCoreArtifact.orderId !== order.id || activeCoreArtifact.jobId !== job.id ||
        activeCoreArtifact.configSnapshotId !== config.id || activeCoreArtifact.revisionKind !== "generation" ||
        activeCoreArtifact.artifactContract !== "combined_geo_report_v4" || activeCoreArtifact.sourceArtifactRevisionId !== null) {
      throw new Error("The exact V4 source core generation artifact lineage conflicts.");
    }
    const coreIsActive = reportActiveArtifact.id === activeCoreArtifact.id && activeCoreArtifact.status === "active";
    const exactEnhancementIsActive = Boolean(allowedActiveEnhancementJobId) && activeCoreArtifact.status === "ready" &&
      reportActiveArtifact.reportId === job.reportId && reportActiveArtifact.orderId === order.id &&
      reportActiveArtifact.jobId === allowedActiveEnhancementJobId && reportActiveArtifact.configSnapshotId === config.id &&
      reportActiveArtifact.revisionKind === "diagnosis_enhancement" &&
      reportActiveArtifact.artifactContract === "combined_geo_report_v4" && reportActiveArtifact.status === "active" &&
      reportActiveArtifact.sourceArtifactRevisionId === activeCoreArtifact.id;
    if (!coreIsActive && !exactEnhancementIsActive) {
      throw new Error("The V4 source core is neither active nor legitimately superseded by this exact active enhancement.");
    }
    if (value.activeAccessTokenCount < 1) throw new Error("The settled V4 core requires an active paid access token.");
  }
  return { report: value.report, order, coreJob: job, siteSnapshot: snapshot, questionSet, questions,
    config, credit, activeCoreArtifact, commercePhase: settled ? "settled" : "reserved" };
}

function assertSettledActiveCore(core: ReportV4PaidCoreContext): asserts core is ReportV4PaidCoreContext & { activeCoreArtifact: NonNullable<ReportV4PaidCoreContext["activeCoreArtifact"]> } {
  if (core.commercePhase !== "settled" || !core.activeCoreArtifact || core.activeCoreArtifact.status !== "active" ||
      core.report.activeArtifactRevisionId !== core.activeCoreArtifact.id) {
    throw new Error("A commercially settled terminal V4 core must be active before diagnosis enhancement.");
  }
}

function assertLineage(core: ReportV4PaidCoreContext, input: ReportV4ProductionLineage): void {
  if (core.report.id !== input.reportId || core.order.id !== input.orderId || core.coreJob.id !== input.coreJobId ||
      core.activeCoreArtifact?.id !== input.coreArtifactRevisionId || core.config.id !== input.configSnapshotId ||
      core.siteSnapshot.id !== input.siteSnapshotId || core.questionSet.id !== input.questionSetId || core.coreJob.locale !== input.locale) {
    throw new Error("The exact V4 report/order/core/config/snapshot/question/locale lineage conflicts.");
  }
}

function assertEnhancementJob(job: ReportV4ProductionEnhancementJob, core: ReportV4PaidCoreContext): void {
  if (job.reportId !== core.report.id || job.siteSnapshotId !== null || job.tier !== "deep" ||
      job.productContract !== "recommendation_forensics_v1" || job.fulfillmentMethodology !== "two_stage_geo_report_v4" ||
      Number(job.recommendationReportVersion) !== 4 || job.artifactContract !== "combined_geo_report_v4" ||
      job.questionSetId !== core.questionSet.id || job.locale !== core.coreJob.locale || job.reason !== "v4_diagnosis_enhancement" ||
      job.creditReservationId !== null || job.correctionId !== null || job.replacementFulfillmentId !== null) {
    throw new Error("The exact no-credit V4 diagnosis enhancement job lineage conflicts.");
  }
}

function validateLineageInput<T extends ReportV4ProductionLineage>(input: T): ReportV4ProductionLineage {
  return {
    reportId: requireId(input.reportId, "report"), orderId: requireId(input.orderId, "order"),
    coreJobId: requireId(input.coreJobId, "core job"), coreArtifactRevisionId: requireId(input.coreArtifactRevisionId, "core artifact"),
    configSnapshotId: requireId(input.configSnapshotId, "configuration snapshot"), siteSnapshotId: requireId(input.siteSnapshotId, "site snapshot"),
    questionSetId: requireId(input.questionSetId, "question set"), locale: requireLocale(input.locale)
  };
}

function requireId(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error(`An exact ${label} identity is required.`);
  return value;
}
function requireLocale(value: string): ReportV4Locale {
  if (value !== "en" && value !== "zh") throw new Error("The exact immutable V4 locale must be en or zh.");
  return value;
}
function isHash(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function exactlyOne<T>(values: T[], label: string): T {
  if (values.length !== 1) throw new Error(`Exactly one ${label} is required; found ${values.length}.`);
  return values[0]!;
}
function deterministicEnhancementJobId(lineage: ReportV4ProductionLineage): string {
  const digest = createHash("sha256").update([
    lineage.reportId, lineage.orderId, lineage.coreJobId, lineage.coreArtifactRevisionId,
    lineage.configSnapshotId, lineage.siteSnapshotId, lineage.questionSetId, lineage.locale
  ].join("\0")).digest("hex");
  return `v4-diagnosis-job-${digest}`;
}

function createPostgresStore(): ReportV4ProductionJobStore {
  return {
    async transaction<T>(work: (transaction: ReportV4ProductionJobTransaction) => Promise<T>): Promise<T> {
      await ensureDatabase();
      const result = await getSqlClient().begin((sql) => work(createPostgresTransaction(sql)));
      return result as T;
    }
  };
}

function createPostgresTransaction(sql: postgres.TransactionSql): ReportV4ProductionJobTransaction {
  return {
    async acquireEnhancementLock(reportId) {
      // Synchronize with core commerce terminalization before examining its successful terminal state.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-commerce:${reportId}`},0))`;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`report-v4-enhancement:${reportId}`},0))`;
    },
    async loadCoreAggregate(coreJobId, forUpdate = false) {
      return loadPostgresCoreAggregate(sql, coreJobId, forUpdate);
    },
    async listEnhancementJobs(reportId, forUpdate = false) {
      const rows = forUpdate
        ? await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE report_id=${reportId} AND reason='v4_diagnosis_enhancement' FOR UPDATE`
        : await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE report_id=${reportId} AND reason='v4_diagnosis_enhancement'`;
      return rows.map(mapEnhancementJob);
    },
    async insertEnhancementJob(job) {
      await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,credit_reservation_id,correction_id,replacement_fulfillment_id)
        VALUES(${job.id},${job.reportId},${job.siteSnapshotId},${job.tier},${job.productContract},${job.fulfillmentMethodology},${job.recommendationReportVersion},${job.artifactContract},${job.questionSetId},${job.locale},${job.reason},${job.stage},${job.executionState},'source_retrieval',NULL,NULL,NULL)`;
    },
    async loadEnhancementJob(id, forUpdate = false) {
      const rows = forUpdate
        ? await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE id=${id} FOR UPDATE`
        : await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE id=${id}`;
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new Error("The V4 enhancement job identity is duplicated.");
      return mapEnhancementJob(rows[0]!);
    }
  };
}

const scanJobColumns = ["id", "report_id", "site_snapshot_id", "tier", "product_contract", "fulfillment_methodology",
  "recommendation_report_version", "artifact_contract", "business_question_set_id", "locale", "reason", "stage",
  "execution_state", "credit_reservation_id", "correction_id", "replacement_fulfillment_id"];
interface ScanJobRow {
  id: string; report_id: string; site_snapshot_id: string | null; tier: string; product_contract: string;
  fulfillment_methodology: string | null; recommendation_report_version: number | null; artifact_contract: string | null;
  business_question_set_id: string | null; locale: string; reason: string; stage: string; execution_state: string;
  credit_reservation_id: string | null; correction_id: string | null; replacement_fulfillment_id: string | null;
}
function mapCoreJob(row: ScanJobRow): ReportV4ProductionCoreJob {
  return { id: row.id, reportId: row.report_id, siteSnapshotId: row.site_snapshot_id, tier: row.tier,
    productContract: row.product_contract, fulfillmentMethodology: row.fulfillment_methodology,
    recommendationReportVersion: row.recommendation_report_version, artifactContract: row.artifact_contract,
    questionSetId: row.business_question_set_id, locale: row.locale, reason: row.reason, stage: row.stage,
    executionState: row.execution_state, creditReservationId: row.credit_reservation_id,
    correctionId: row.correction_id, replacementFulfillmentId: row.replacement_fulfillment_id };
}
function mapEnhancementJob(row: ScanJobRow): ReportV4ProductionEnhancementJob {
  const core = mapCoreJob(row);
  if (core.siteSnapshotId !== null) throw new Error("A V4 enhancement must derive snapshot lineage from its exact active core.");
  return { ...core, siteSnapshotId: null };
}

async function loadPostgresCoreAggregate(sql: postgres.TransactionSql, coreJobId: string, forUpdate: boolean): Promise<ReportV4ProductionCoreAggregate | null> {
  const jobs = forUpdate
    ? await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE id=${coreJobId} FOR UPDATE`
    : await sql<ScanJobRow[]>`SELECT ${sql(scanJobColumns)} FROM scan_jobs WHERE id=${coreJobId}`;
  if (jobs.length === 0) return null;
  if (jobs.length !== 1) throw new Error("The V4 core job identity is duplicated.");
  const job = jobs[0]!;
  const reports = await sql<Array<{ id: string; report_locale: string | null; active_artifact_revision_id: string | null }>>`
    SELECT id,report_locale,active_artifact_revision_id FROM scan_reports WHERE id=${job.report_id}`;
  if (reports.length !== 1) throw new Error("The exact V4 report lineage is missing or duplicated.");
  const orders = await sql<Array<{ id:string;report_id:string;fulfillment_job_id:string|null;site_snapshot_id:string|null;product_code:string;fulfillment_methodology:string|null;recommendation_report_version:number|null;business_question_set_id:string|null;report_locale:string;payment_status:string;fulfillment_status:string;refund_status:string }>>`
    SELECT id,report_id,fulfillment_job_id,site_snapshot_id,product_code,fulfillment_methodology,recommendation_report_version,business_question_set_id,report_locale,payment_status,fulfillment_status,refund_status FROM payment_orders WHERE fulfillment_job_id=${job.id}`;
  const snapshots = job.site_snapshot_id ? await sql<Array<{id:string;report_id:string;site_key:string;status:string;collector_config_identity_hash:string;content_identity_hash:string|null}>>`
    SELECT id,report_id,site_key,status,collector_config_identity_hash,content_identity_hash FROM report_v4_site_snapshots WHERE id=${job.site_snapshot_id}` : [];
  const sets = job.business_question_set_id ? await sql<Array<{id:string;report_id:string;order_id:string|null;region:string;locale:string;status:string}>>`
    SELECT id,report_id,order_id,region,locale,status FROM report_business_question_sets WHERE id=${job.business_question_set_id}` : [];
  const questions = job.business_question_set_id ? await sql<Array<{id:string;question_set_id:string;ordinal:number;purpose:string;private_text:string|null}>>`
    SELECT id,question_set_id,ordinal,purpose,private_text FROM report_business_questions WHERE question_set_id=${job.business_question_set_id} ORDER BY ordinal` : [];
  const configs = await sql<Array<{id:string;report_id:string;order_id:string;core_job_id:string;identity_hash:string;model_profile_id:string;model_profile_hash:string;report_profile_id:string;report_profile_hash:string}>>`
    SELECT id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,report_profile_id,report_profile_hash FROM report_v4_config_snapshots WHERE core_job_id=${job.id}`;
  const credits = job.credit_reservation_id ? await sql<Array<{id:string;report_id:string;job_id:string|null;payment_order_id:string|null;status:string}>>`
    SELECT id,report_id,job_id,payment_order_id,status FROM credit_ledger WHERE id=${job.credit_reservation_id}` : [];
  const activeId = reports[0]!.active_artifact_revision_id;
  const artifacts = await sql<Array<{id:string;report_id:string;order_id:string;job_id:string;config_snapshot_id:string|null;revision_kind:string;artifact_contract:string;status:string;source_artifact_revision_id:string|null}>>`
    SELECT id,report_id,order_id,job_id,config_snapshot_id,revision_kind,artifact_contract,status,source_artifact_revision_id
    FROM report_artifact_revisions WHERE report_id=${job.report_id} AND (job_id=${job.id} OR id=${activeId})`;
  const access = await sql<Array<{ count: number }>>`SELECT count(*)::int AS count FROM report_access_tokens WHERE report_id=${job.report_id} AND artifact_scope='combined_geo_report_v4' AND revoked_at IS NULL AND expires_at>now()`;
  return {
    report: { id: reports[0]!.id, locale: reports[0]!.report_locale, activeArtifactRevisionId: activeId }, coreJob: mapCoreJob(job),
    orders: orders.map((row) => ({ id:row.id,reportId:row.report_id,fulfillmentJobId:row.fulfillment_job_id,siteSnapshotId:row.site_snapshot_id,productCode:row.product_code,fulfillmentMethodology:row.fulfillment_methodology,recommendationReportVersion:row.recommendation_report_version,questionSetId:row.business_question_set_id,reportLocale:row.report_locale,paymentStatus:row.payment_status,fulfillmentStatus:row.fulfillment_status,refundStatus:row.refund_status })),
    siteSnapshots: snapshots.map((row) => ({ id:row.id,reportId:row.report_id,siteKey:row.site_key,status:row.status,collectorConfigIdentityHash:row.collector_config_identity_hash,contentIdentityHash:row.content_identity_hash })),
    questionSets: sets.map((row) => ({ id:row.id,reportId:row.report_id,orderId:row.order_id,region:row.region,locale:row.locale,status:row.status })),
    questions: questions.map((row) => ({ id:row.id,questionSetId:row.question_set_id,ordinal:Number(row.ordinal),purpose:row.purpose,privateText:row.private_text })),
    configSnapshots: configs.map((row) => ({ id:row.id,reportId:row.report_id,orderId:row.order_id,coreJobId:row.core_job_id,identityHash:row.identity_hash,modelProfileId:row.model_profile_id,modelProfileHash:row.model_profile_hash,reportProfileId:row.report_profile_id,reportProfileHash:row.report_profile_hash })),
    credits: credits.map((row) => ({ id:row.id,reportId:row.report_id,jobId:row.job_id,paymentOrderId:row.payment_order_id,status:row.status })),
    activeArtifacts: artifacts.map((row) => ({ id:row.id,reportId:row.report_id,orderId:row.order_id,jobId:row.job_id,configSnapshotId:row.config_snapshot_id,revisionKind:row.revision_kind,artifactContract:row.artifact_contract,status:row.status,sourceArtifactRevisionId:row.source_artifact_revision_id })),
    activeAccessTokenCount: Number(access[0]?.count ?? 0)
  };
}
