import { parseCombinedGeoReportV4, type CombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export interface ReportV4EnhancementTerminalizationInput {
  readonly reportId: string;
  readonly coreJobId: string;
  readonly enhancementJobId: string;
  readonly sourceCoreArtifactRevisionId: string;
  readonly enhancementArtifactRevisionId: string;
  readonly outcome: "completed" | "failed";
  readonly completedQuestionIds: readonly string[];
  readonly failedQuestionIds: readonly string[];
  readonly workerId: string;
}

export interface ReportV4EnhancementTerminalizationExecutor {
  transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T>;
}

type Sql = <T extends Record<string, unknown> = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
) => Promise<T[]>;

interface EnhancementJobRow extends Record<string, unknown> {
  id: string;
  report_id: string;
  site_snapshot_id: string | null;
  tier: string;
  product_contract: string;
  fulfillment_methodology: string | null;
  recommendation_report_version: number | null;
  artifact_contract: string | null;
  business_question_set_id: string | null;
  locale: string;
  reason: string;
  stage: string;
  execution_state: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  lease_is_live: boolean;
  credit_reservation_id: string | null;
  correction_id: string | null;
  replacement_fulfillment_id: string | null;
}

interface CoreLineageRow extends Record<string, unknown> {
  id: string;
  report_id: string;
  site_snapshot_id: string | null;
  product_contract: string;
  fulfillment_methodology: string | null;
  recommendation_report_version: number | null;
  artifact_contract: string | null;
  business_question_set_id: string | null;
  locale: string;
  reason: string;
  stage: string;
  execution_state: string;
  credit_reservation_id: string | null;
  order_id: string;
  order_report_id: string;
  order_fulfillment_job_id: string | null;
  order_site_snapshot_id: string | null;
  order_question_set_id: string | null;
  order_product_code: string;
  order_methodology: string | null;
  order_version: number | null;
  order_locale: string;
  payment_status: string;
  fulfillment_status: string;
  refund_status: string;
  credit_id: string;
  credit_report_id: string;
  credit_job_id: string | null;
  credit_order_id: string | null;
  credit_status: string;
  source_id: string;
  source_report_id: string;
  source_order_id: string;
  source_job_id: string;
  source_config_snapshot_id: string | null;
  source_revision_kind: string;
  source_artifact_contract: string;
  source_status: string;
  config_report_id: string;
  config_order_id: string;
  config_core_job_id: string;
  active_artifact_revision_id: string | null;
  active_id: string;
  active_report_id: string;
  active_order_id: string;
  active_job_id: string;
  active_config_snapshot_id: string | null;
  active_revision_kind: string;
  active_source_artifact_revision_id: string | null;
  active_artifact_contract: string;
  active_status: string;
  access_count: number;
  source_payload: unknown;
}

interface ArtifactRevisionRow extends Record<string, unknown> {
  id: string;
  job_id: string;
  report_id: string;
  order_id: string;
  config_snapshot_id: string | null;
  revision_kind: string;
  artifact_contract: string;
  source_artifact_revision_id: string | null;
  status: string;
}

const INPUT_FIELDS = new Set([
  "reportId", "coreJobId", "enhancementJobId", "sourceCoreArtifactRevisionId",
  "enhancementArtifactRevisionId", "outcome", "completedQuestionIds", "failedQuestionIds", "workerId"
]);

export async function terminalizeReportV4EnhancementJob(
  input: ReportV4EnhancementTerminalizationInput,
  executor: ReportV4EnhancementTerminalizationExecutor = liveExecutor()
): Promise<void> {
  const normalized = validateInput(input);
  await executor.transaction(async (sql) => {
    const enhancementRows = await sql<EnhancementJobRow>`
      SELECT id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,
        recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,
        execution_state,lease_owner,lease_expires_at,(lease_expires_at>now()) AS lease_is_live,
        credit_reservation_id,correction_id,replacement_fulfillment_id
      FROM scan_jobs WHERE id=${normalized.enhancementJobId} AND report_id=${normalized.reportId} FOR UPDATE
    `;
    const enhancement = exactlyOne(enhancementRows, "exact V4 enhancement job");
    assertEnhancementIdentity(enhancement, normalized);

    const coreRows = await sql<CoreLineageRow>`
      SELECT core.id,core.report_id,core.site_snapshot_id,core.product_contract,core.fulfillment_methodology,
        core.recommendation_report_version,core.artifact_contract,core.business_question_set_id,core.locale,
        core.reason,core.stage,core.execution_state,core.credit_reservation_id,
        orders.id AS order_id,orders.report_id AS order_report_id,
        orders.fulfillment_job_id AS order_fulfillment_job_id,orders.site_snapshot_id AS order_site_snapshot_id,
        orders.business_question_set_id AS order_question_set_id,orders.product_code AS order_product_code,
        orders.fulfillment_methodology AS order_methodology,orders.recommendation_report_version AS order_version,
        orders.report_locale AS order_locale,orders.payment_status,orders.fulfillment_status,orders.refund_status,
        credit.id AS credit_id,credit.report_id AS credit_report_id,credit.job_id AS credit_job_id,
        credit.payment_order_id AS credit_order_id,credit.status AS credit_status,
        source.id AS source_id,source.report_id AS source_report_id,source.order_id AS source_order_id,
        source.job_id AS source_job_id,source.config_snapshot_id AS source_config_snapshot_id,
        source.revision_kind AS source_revision_kind,source.artifact_contract AS source_artifact_contract,
        source.status AS source_status,config.report_id AS config_report_id,config.order_id AS config_order_id,
        config.core_job_id AS config_core_job_id,report.active_artifact_revision_id,
        active.id AS active_id,active.report_id AS active_report_id,active.order_id AS active_order_id,
        active.job_id AS active_job_id,active.config_snapshot_id AS active_config_snapshot_id,
        active.revision_kind AS active_revision_kind,
        active.source_artifact_revision_id AS active_source_artifact_revision_id,
        active.artifact_contract AS active_artifact_contract,active.status AS active_status,
        payload.payload AS source_payload,
        (SELECT count(*)::int FROM report_access_tokens token
          WHERE token.report_id=core.report_id AND token.revoked_at IS NULL AND token.expires_at>now()
            AND token.artifact_scope='combined_geo_report_v4') AS access_count
      FROM scan_jobs core
      JOIN payment_orders orders ON orders.fulfillment_job_id=core.id AND orders.report_id=core.report_id
      JOIN credit_ledger credit ON credit.id=core.credit_reservation_id AND credit.job_id=core.id
      JOIN report_artifact_revisions source ON source.id=${normalized.sourceCoreArtifactRevisionId}
        AND source.report_id=core.report_id AND source.job_id=core.id AND source.order_id=orders.id
      JOIN report_v4_config_snapshots config ON config.id=source.config_snapshot_id
      JOIN combined_geo_reports payload ON payload.artifact_revision_id=source.id
        AND payload.report_id=core.report_id AND payload.order_id=orders.id AND payload.job_id=core.id
        AND payload.question_set_id=core.business_question_set_id
      JOIN scan_reports report ON report.id=core.report_id
      JOIN report_artifact_revisions active ON active.id=report.active_artifact_revision_id
      WHERE core.id=${normalized.coreJobId} AND core.report_id=${normalized.reportId}
      FOR UPDATE OF core,orders,credit,source,report,active
    `;
    const core = exactlyOne(coreRows, "settled paid V4 core lineage");
    assertCoreLineage(core, enhancement, normalized);

    const questions = await sql<{ id: string; ordinal: number }>`
      SELECT id,ordinal FROM report_business_questions WHERE question_set_id=${core.business_question_set_id} ORDER BY ordinal
    `;
    const sourceReport = parseSourceCorePayload(core, questions, normalized);
    assertExactQuestionPartition(sourceReport, normalized.completedQuestionIds, normalized.failedQuestionIds);

    const revisionRows = await sql<ArtifactRevisionRow>`
      SELECT id,job_id,report_id,order_id,config_snapshot_id,revision_kind,artifact_contract,
        source_artifact_revision_id,status
      FROM report_artifact_revisions WHERE job_id=${normalized.enhancementJobId} FOR UPDATE
    `;
    if (revisionRows.length > 1) throw new Error("Multiple artifact revisions share the V4 enhancement job.");
    const revision = revisionRows[0] ?? null;
    assertOutcomeArtifact(revision, core, normalized);

    if (enhancement.stage === normalized.outcome && enhancement.execution_state === normalized.outcome) return;
    if (isTerminal(enhancement.stage) || isTerminal(enhancement.execution_state)) {
      throw new Error("The V4 enhancement job already has a conflicting terminal outcome.");
    }
    if (enhancement.execution_state !== "running" || enhancement.lease_owner !== normalized.workerId ||
        !enhancement.lease_expires_at || enhancement.lease_is_live !== true) {
      throw new Error("The V4 enhancement job is not leased by this worker.");
    }

    const updated = await sql<{ id: string }>`
      UPDATE scan_jobs SET stage=${normalized.outcome},execution_state=${normalized.outcome},
        current_phase='terminalization',progress=CASE WHEN ${normalized.outcome}='completed' THEN 100 ELSE progress END,
        lease_owner=NULL,lease_expires_at=NULL,
        error_code=CASE WHEN ${normalized.outcome}='failed' THEN 'report_v4_diagnosis_enhancement_failed' ELSE NULL END,
        public_error=CASE WHEN ${normalized.outcome}='failed' THEN 'The diagnostic enhancement was not available.' ELSE NULL END,
        checkpoint=jsonb_set(COALESCE(checkpoint,'{}'::jsonb),'{reportV4Diagnosis}',
          jsonb_build_object('completedQuestionIds',${JSON.stringify(normalized.completedQuestionIds)}::jsonb,
            'failedQuestionIds',${JSON.stringify(normalized.failedQuestionIds)}::jsonb),true),
        updated_at=now()
      WHERE id=${normalized.enhancementJobId} AND execution_state='running'
        AND lease_owner=${normalized.workerId} AND lease_expires_at>now()
      RETURNING id
    `;
    if (updated.length !== 1) throw new Error("The leased V4 enhancement job could not be terminalized exactly once.");
  });
}

function assertEnhancementIdentity(
  job: EnhancementJobRow,
  input: ReportV4EnhancementTerminalizationInput
): void {
  if (job.id !== input.enhancementJobId || job.report_id !== input.reportId || job.site_snapshot_id !== null ||
      job.tier !== "deep" || job.product_contract !== "recommendation_forensics_v1" ||
      job.fulfillment_methodology !== "two_stage_geo_report_v4" || job.recommendation_report_version !== 4 ||
      job.artifact_contract !== "combined_geo_report_v4" || !job.business_question_set_id ||
      job.reason !== "v4_diagnosis_enhancement" || job.credit_reservation_id !== null ||
      job.correction_id !== null || job.replacement_fulfillment_id !== null) {
    throw new Error("The exact V4 enhancement job lineage is invalid.");
  }
}

function assertCoreLineage(
  core: CoreLineageRow,
  enhancement: EnhancementJobRow,
  input: ReportV4EnhancementTerminalizationInput
): void {
  const common = core.id === input.coreJobId && core.report_id === input.reportId && core.site_snapshot_id !== null &&
    core.product_contract === "recommendation_forensics_v1" && core.fulfillment_methodology === "two_stage_geo_report_v4" &&
    core.recommendation_report_version === 4 && core.artifact_contract === "combined_geo_report_v4" &&
    core.business_question_set_id !== null && core.reason === "standard" && core.stage === "completed" &&
    core.execution_state === "completed" && core.credit_reservation_id === core.credit_id &&
    core.order_report_id === core.report_id && core.order_fulfillment_job_id === core.id &&
    core.order_site_snapshot_id === core.site_snapshot_id && core.order_question_set_id === core.business_question_set_id &&
    core.order_product_code === "recommendation_forensics_v1" && core.order_methodology === "two_stage_geo_report_v4" &&
    core.order_version === 4 && core.order_locale === core.locale && core.payment_status === "paid" &&
    core.fulfillment_status === "completed" && core.refund_status === "not_required" &&
    core.credit_report_id === core.report_id && core.credit_job_id === core.id && core.credit_order_id === core.order_id &&
    core.credit_status === "settled" && core.source_id === input.sourceCoreArtifactRevisionId &&
    core.source_report_id === core.report_id && core.source_order_id === core.order_id && core.source_job_id === core.id &&
    core.source_config_snapshot_id !== null && core.source_revision_kind === "generation" &&
    core.source_artifact_contract === "combined_geo_report_v4" && core.config_report_id === core.report_id &&
    core.config_order_id === core.order_id && core.config_core_job_id === core.id && core.access_count >= 1 &&
    enhancement.business_question_set_id === core.business_question_set_id && enhancement.locale === core.locale;
  if (!common) throw new Error("The settled paid V4 core lineage is invalid.");

  if (input.outcome === "completed") {
    if (core.source_status !== "ready" || core.active_artifact_revision_id !== input.enhancementArtifactRevisionId ||
        core.active_id !== input.enhancementArtifactRevisionId || core.active_report_id !== core.report_id ||
        core.active_order_id !== core.order_id || core.active_job_id !== input.enhancementJobId ||
        core.active_config_snapshot_id !== core.source_config_snapshot_id ||
        core.active_revision_kind !== "diagnosis_enhancement" ||
        core.active_source_artifact_revision_id !== input.sourceCoreArtifactRevisionId ||
        core.active_artifact_contract !== "combined_geo_report_v4" || core.active_status !== "active") {
      throw new Error("The completed V4 enhancement is not the exact active successor of its source core.");
    }
    return;
  }
  if (core.source_status !== "active" || core.active_artifact_revision_id !== input.sourceCoreArtifactRevisionId ||
      core.active_id !== input.sourceCoreArtifactRevisionId || core.active_revision_kind !== "generation" ||
      core.active_source_artifact_revision_id !== null || core.active_status !== "active") {
    throw new Error("A failed V4 enhancement must preserve its source core as the active delivery revision.");
  }
}

function assertOutcomeArtifact(
  revision: ArtifactRevisionRow | null,
  core: CoreLineageRow,
  input: ReportV4EnhancementTerminalizationInput
): void {
  if (!revision) {
    if (input.outcome === "completed") throw new Error("The exact active V4 enhancement revision is required.");
    return;
  }
  const exactIdentity = revision.id === input.enhancementArtifactRevisionId && revision.job_id === input.enhancementJobId &&
    revision.report_id === input.reportId && revision.order_id === core.order_id &&
    revision.config_snapshot_id === core.source_config_snapshot_id && revision.revision_kind === "diagnosis_enhancement" &&
    revision.artifact_contract === "combined_geo_report_v4" &&
    revision.source_artifact_revision_id === input.sourceCoreArtifactRevisionId;
  if (!exactIdentity) throw new Error("The exact V4 enhancement artifact lineage is invalid.");
  if (input.outcome === "completed" && revision.status !== "active") {
    throw new Error("The exact active V4 enhancement revision is required.");
  }
  if (input.outcome === "failed" && revision.status !== "failed") {
    throw new Error("A failed V4 enhancement may not leave a pending, ready or active revision.");
  }
}

function parseSourceCorePayload(
  core: CoreLineageRow,
  questions: readonly { id: string; ordinal: number }[],
  input: ReportV4EnhancementTerminalizationInput
): CombinedGeoReportV4 {
  let report: CombinedGeoReportV4;
  try {
    report = parseCombinedGeoReportV4(core.source_payload);
  } catch {
    throw new Error("The persisted V4 source core payload is invalid.");
  }
  if (report.reportId !== input.reportId || report.artifactRevisionId !== input.sourceCoreArtifactRevisionId ||
      questions.length !== 3 || report.questions.some((question, index) => {
        const persisted = questions[index];
        return !persisted || persisted.ordinal !== index + 1 || persisted.id !== question.questionId;
      })) {
    throw new Error("The persisted V4 source core payload identity conflicts with its exact question set lineage.");
  }
  return report;
}

function assertExactQuestionPartition(
  sourceReport: CombinedGeoReportV4,
  completedQuestionIds: readonly string[],
  failedQuestionIds: readonly string[]
): void {
  const answered = sourceReport.questions.filter(({ status }) => status === "answered").map(({ questionId }) => questionId);
  const unavailable = sourceReport.questions.filter(({ status }) => status === "unavailable").map(({ questionId }) => questionId);
  const terminal = [...completedQuestionIds, ...failedQuestionIds];
  if (terminal.length !== answered.length || new Set(terminal).size !== terminal.length ||
      answered.some((id) => !terminal.includes(id)) || terminal.some((id) => !answered.includes(id)) ||
      unavailable.some((id) => terminal.includes(id))) {
    throw new Error("V4 enhancement terminalization requires one exact terminal outcome for each answered source-core question.");
  }
}

function validateInput(input: ReportV4EnhancementTerminalizationInput): ReportV4EnhancementTerminalizationInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("V4 enhancement terminalization input must be an object.");
  const unknown = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field));
  if (unknown.length) throw new TypeError(`V4 enhancement terminalization has unknown field ${unknown.join(", ")}.`);
  for (const field of ["reportId", "coreJobId", "enhancementJobId", "sourceCoreArtifactRevisionId", "enhancementArtifactRevisionId", "workerId"] as const) {
    if (typeof input[field] !== "string" || !input[field].trim()) throw new TypeError(`Missing ${field}.`);
  }
  if (input.outcome !== "completed" && input.outcome !== "failed") throw new TypeError("Invalid outcome.");
  const completedQuestionIds = questionIds(input.completedQuestionIds, "completedQuestionIds");
  const failedQuestionIds = questionIds(input.failedQuestionIds, "failedQuestionIds");
  if (completedQuestionIds.some((id) => failedQuestionIds.includes(id))) {
    throw new TypeError("Completed and failed V4 question identities must be disjoint.");
  }
  return Object.freeze({
    ...input,
    reportId: input.reportId.trim(), coreJobId: input.coreJobId.trim(), enhancementJobId: input.enhancementJobId.trim(),
    sourceCoreArtifactRevisionId: input.sourceCoreArtifactRevisionId.trim(),
    enhancementArtifactRevisionId: input.enhancementArtifactRevisionId.trim(), workerId: input.workerId.trim(),
    completedQuestionIds: Object.freeze(completedQuestionIds), failedQuestionIds: Object.freeze(failedQuestionIds)
  });
}

function questionIds(value: readonly string[], field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  const normalized = value.map((id) => {
    if (typeof id !== "string" || !id.trim()) throw new TypeError(`${field} must contain non-empty strings.`);
    return id.trim();
  });
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${field} must not contain duplicates.`);
  return normalized;
}

function exactlyOne<T>(rows: readonly T[], label: string): T {
  if (rows.length !== 1 || !rows[0]) throw new Error(`The ${label} is invalid.`);
  return rows[0];
}

function isTerminal(value: string): boolean {
  return value === "completed" || value === "completed_limited" || value === "failed";
}

function liveExecutor(): ReportV4EnhancementTerminalizationExecutor {
  return {
    async transaction(work) {
      await ensureDatabase();
      const database = getSqlClient();
      const envelope = await database.begin(async (transaction) => ({ value: await work(transaction as unknown as Sql) }));
      return envelope.value;
    }
  };
}
