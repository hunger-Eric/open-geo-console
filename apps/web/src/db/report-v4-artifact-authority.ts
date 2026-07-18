import { createHash } from "node:crypto";
import {
  parseCombinedGeoReportV4,
  type CombinedGeoReportV4,
  type CombinedGeoReportV4Question
} from "@open-geo-console/ai-report-engine";

type Row = Record<string, unknown>;
type Rows = Row[];

export type ReportV4ArtifactAuthorityTransactionSql = {
  unsafe<T extends Rows = Rows>(query: string, parameters?: unknown[]): Promise<T>;
};

export interface ReportV4ArtifactAuthoritySql {
  begin<T>(options: string, work: (sql: ReportV4ArtifactAuthorityTransactionSql) => Promise<T>): Promise<T>;
}

export interface LoadReportV4ArtifactAuthorityInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}

export interface ReportV4ArtifactPayloadAuthorityRecord {
  readonly artifactRevisionIdHash: string;
  readonly reportIdHash: string;
  readonly orderIdHash: string;
  readonly jobIdHash: string;
  readonly configSnapshotIdHash: string;
  readonly questionSetIdHash: string;
  readonly sourceArtifactRevisionIdHash: string | null;
  readonly revisionKind: "generation" | "diagnosis_enhancement";
  readonly status: "ready" | "active";
  readonly revision: number;
  readonly payloadIdentityHash: string;
  readonly preservedContentHash: string;
  readonly questionContentHashes: readonly [string, string, string];
  readonly diagnosisContentHashes: readonly [string | null, string | null, string | null];
}

export interface ReportV4ArtifactAuthority {
  readonly phase: "baseline" | "final";
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly faultQuestionIdHash: string;
  readonly faultSourceIdHash: string | null;
  readonly capturedAt: string;
  readonly activeArtifactRevisionIdHash: string;
  readonly artifacts: readonly ReportV4ArtifactPayloadAuthorityRecord[];
  readonly canonicalHash: string;
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;

/**
 * Loads the exact combined-payload authority from one immutable PostgreSQL view.
 * Stored payload hashes are treated as assertions, never as payload evidence.
 * @requirement GEO-V4-DELIVERY-01
 * @requirement GEO-V4-SOURCE-01
 * @requirement GEO-V4-ACCEPT-01
 */
export async function loadReportV4ArtifactAuthority(
  sql: ReportV4ArtifactAuthoritySql,
  input: LoadReportV4ArtifactAuthorityInput
): Promise<ReportV4ArtifactAuthority> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", (tx) =>
    loadReportV4ArtifactAuthorityInTransaction(tx, parsed));
}

/** Caller-owned transaction variant. It never opens or nests a transaction. */
export async function loadReportV4ArtifactAuthorityInTransaction(
  tx: ReportV4ArtifactAuthorityTransactionSql,
  input: LoadReportV4ArtifactAuthorityInput
): Promise<ReportV4ArtifactAuthority> {
  const parsed = parseInput(input);
  const isolation = one(await query(tx, "isolation", `SELECT current_setting('transaction_isolation') transaction_isolation,
    current_setting('transaction_read_only') transaction_read_only,clock_timestamp() captured_at`), "transaction isolation");
  if (isolation.transaction_isolation !== "repeatable read" || isolation.transaction_read_only !== "on") {
    fail("repeatable-read read-only transaction is required");
  }
  const capturedAt = iso(isolation.captured_at, "captured_at");

  const anchor = one(await query(tx, "anchor", `SELECT s.session_id,s.id scenario_id,s.kind,s.fault_question_id,s.fault_source_id,s.report_id,s.order_id,s.core_job_id,
    s.enhancement_job_id,s.site_snapshot_id,s.config_snapshot_id,s.question_set_id,s.core_artifact_revision_id,
    s.enhancement_artifact_revision_id,r.url report_url,r.report_locale,r.active_artifact_revision_id,
    o.report_id order_report_id,o.fulfillment_job_id order_core_job_id,o.site_snapshot_id order_site_snapshot_id,
    o.business_question_set_id order_question_set_id,o.product_code,o.fulfillment_methodology,o.recommendation_report_version,
    c.report_id config_report_id,c.order_id config_order_id,c.core_job_id config_core_job_id,
    core.report_id core_report_id,core.site_snapshot_id core_site_snapshot_id,
    core.business_question_set_id core_question_set_id,core.reason core_reason,core.artifact_contract core_artifact_contract,
    enhancement.report_id enhancement_report_id,enhancement.business_question_set_id enhancement_question_set_id,
    enhancement.reason enhancement_reason,enhancement.artifact_contract enhancement_artifact_contract,
    q.report_id question_report_id,q.order_id question_order_id,q.status question_set_status
    FROM report_v4_acceptance_scenarios s
    JOIN report_v4_acceptance_sessions session ON session.id=s.session_id
    JOIN scan_reports r ON r.id=s.report_id
    JOIN payment_orders o ON o.id=s.order_id
    JOIN report_v4_config_snapshots c ON c.id=s.config_snapshot_id
    JOIN scan_jobs core ON core.id=s.core_job_id
    LEFT JOIN scan_jobs enhancement ON enhancement.id=s.enhancement_job_id
    JOIN report_business_question_sets q ON q.id=s.question_set_id
    WHERE s.session_id=$1 AND s.id=$2`, [parsed.sessionId, parsed.scenarioId]), "acceptance artifact anchor");
  const binding = parseAnchor(anchor, parsed);
  assertTopology(binding, parsed.phase);

  const questionRows = await query(tx, "questions", `SELECT id,ordinal,COALESCE(private_text,generated_text) question_text
    FROM report_business_questions WHERE question_set_id=$1 ORDER BY ordinal`, [binding.questionSetId]);
  const questions = parseQuestions(questionRows);

  const artifactRows = await query(tx, "artifacts", `SELECT a.id,a.report_id,a.order_id,a.job_id,a.config_snapshot_id,
    a.source_artifact_revision_id,a.revision_kind,a.revision,a.artifact_contract,a.status,a.payload_identity_hash,
    p.artifact_revision_id payload_artifact_revision_id,p.report_id payload_report_id,p.order_id payload_order_id,
    p.job_id payload_job_id,p.question_set_id payload_question_set_id,p.payload
    FROM report_artifact_revisions a
    LEFT JOIN combined_geo_reports p ON p.artifact_revision_id=a.id
    WHERE a.report_id=$1 AND (a.artifact_contract='combined_geo_report_v4' OR a.revision_kind='diagnosis_enhancement')
    ORDER BY a.revision,a.id`, [binding.reportId]);
  const expectedIds = [binding.coreArtifactRevisionId, binding.enhancementArtifactRevisionId]
    .filter((value): value is string => value !== null).sort();
  exactIds(artifactRows, expectedIds, "artifact");

  const checkpointRows = await query(tx, "diagnosis-checkpoints", `SELECT report_id,enhancement_job_id,core_artifact_revision_id,
    config_snapshot_id,question_set_id,question_id,ordinal,state,source_audit_payload,diagnosis_payload,diagnosis_content_hash
    FROM report_v4_diagnosis_checkpoints WHERE report_id=$1 ORDER BY ordinal`, [binding.reportId]);
  const parsedArtifacts = artifactRows.map((row) => parseArtifact(row, binding, questions));
  const core = exactlyOne(parsedArtifacts.filter((item) => item.record.revisionKind === "generation"), "core artifact");
  if (core.report.questions.some((question) => question.diagnosis !== undefined)) fail("the core artifact cannot contain diagnosis output");
  assertCoreQuestionTopology(core.report, binding);

  const enhancement = parsedArtifacts.find((item) => item.record.revisionKind === "diagnosis_enhancement") ?? null;
  if (enhancement) {
    assertEnhancementPreservesCore(enhancement.report, core.report);
    assertSourceFaultAuthority(checkpointRows, core.report, enhancement.report, binding, questions);
    assertDiagnosisCheckpointLineage(checkpointRows, enhancement.report, binding, questions);
  } else if (checkpointRows.length !== 0) {
    fail("diagnosis checkpoints exist without the exact enhancement artifact topology");
  }

  const artifacts = parsedArtifacts.map((item) => item.record);
  const projection = {
    phase: parsed.phase,
    scenarioKind: binding.scenarioKind,
    faultQuestionIdHash: sha(binding.faultQuestionId),
    faultSourceIdHash: binding.faultSourceId === null ? null : sha(binding.faultSourceId),
    capturedAt,
    activeArtifactRevisionIdHash: sha(binding.activeArtifactRevisionId),
    artifacts,
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const }
  };
  const canonicalHash = hashJson({ phase: projection.phase, scenarioKind: projection.scenarioKind,
    faultQuestionIdHash: projection.faultQuestionIdHash,
    faultSourceIdHash: projection.faultSourceIdHash,
    activeArtifactRevisionIdHash: projection.activeArtifactRevisionIdHash, artifacts: projection.artifacts,
    transactionProfile: projection.transactionProfile });
  return { ...projection, canonicalHash };
}

type Binding = {
  scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  faultQuestionId: string;
  faultSourceId: string | null;
  reportId: string;
  orderId: string;
  coreJobId: string;
  enhancementJobId: string | null;
  siteSnapshotId: string;
  configSnapshotId: string;
  questionSetId: string;
  coreArtifactRevisionId: string;
  enhancementArtifactRevisionId: string | null;
  activeArtifactRevisionId: string;
  reportUrl: string;
  reportLocale: string;
};

function parseAnchor(row: Row, input: LoadReportV4ArtifactAuthorityInput): Binding {
  equal(row.session_id, input.sessionId, "scenario session");
  equal(row.scenario_id, input.scenarioId, "scenario identity");
  const scenario = scenarioKind(row.kind);
  const faultSourceId = nullable(row.fault_source_id, "fault_source_id");
  if ((scenario === "success") !== (faultSourceId !== null)) {
    fail("fault_source_id must exist only for the success source-fault scenario");
  }
  const binding: Binding = {
    scenarioKind: scenario,
    faultQuestionId: required(row.fault_question_id, "fault_question_id"),
    faultSourceId,
    reportId: required(row.report_id, "report_id"), orderId: required(row.order_id, "order_id"),
    coreJobId: required(row.core_job_id, "core_job_id"), enhancementJobId: nullable(row.enhancement_job_id, "enhancement_job_id"),
    siteSnapshotId: required(row.site_snapshot_id, "site_snapshot_id"), configSnapshotId: required(row.config_snapshot_id, "config_snapshot_id"),
    questionSetId: required(row.question_set_id, "question_set_id"), coreArtifactRevisionId: required(row.core_artifact_revision_id, "core_artifact_revision_id"),
    enhancementArtifactRevisionId: nullable(row.enhancement_artifact_revision_id, "enhancement_artifact_revision_id"),
    activeArtifactRevisionId: required(row.active_artifact_revision_id, "active_artifact_revision_id"),
    reportUrl: required(row.report_url, "report_url"), reportLocale: required(row.report_locale, "report_locale")
  };
  for (const [actual, expected, label] of [
    [row.order_report_id,binding.reportId,"order report"],[row.order_core_job_id,binding.coreJobId,"order core job"],
    [row.order_site_snapshot_id,binding.siteSnapshotId,"order site snapshot"],[row.order_question_set_id,binding.questionSetId,"order question set"],
    [row.config_report_id,binding.reportId,"config report"],[row.config_order_id,binding.orderId,"config order"],
    [row.config_core_job_id,binding.coreJobId,"config core job"],[row.core_report_id,binding.reportId,"core report"],
    [row.core_site_snapshot_id,binding.siteSnapshotId,"core site snapshot"],[row.core_question_set_id,binding.questionSetId,"core question set"],
    [row.question_report_id,binding.reportId,"question-set report"],[row.question_order_id,binding.orderId,"question-set order"]
  ] as const) equal(actual, expected, label);
  if (row.product_code !== "recommendation_forensics_v1" || row.fulfillment_methodology !== "two_stage_geo_report_v4"
    || row.recommendation_report_version !== 4 || row.core_reason !== "standard"
    || row.core_artifact_contract !== "combined_geo_report_v4" || row.question_set_status !== "locked") {
    fail("the core artifact product/config/question lineage is incomplete");
  }
  if (binding.enhancementJobId === null) {
    if (row.enhancement_report_id !== null || row.enhancement_question_set_id !== null
      || row.enhancement_reason !== null || row.enhancement_artifact_contract !== null) fail("unexpected enhancement job lineage");
  } else if (row.enhancement_report_id !== binding.reportId || row.enhancement_question_set_id !== binding.questionSetId
    || row.enhancement_reason !== "v4_diagnosis_enhancement" || row.enhancement_artifact_contract !== "combined_geo_report_v4") {
    fail("the enhancement job lineage is incomplete");
  }
  return binding;
}

function assertTopology(binding: Binding, phase: "baseline" | "final"): void {
  const enhancedFinal = phase === "final" && binding.scenarioKind !== "question_failure";
  if (enhancedFinal) {
    if (!binding.enhancementJobId || !binding.enhancementArtifactRevisionId) fail("the final scenario requires its exact enhancement topology");
    equal(binding.activeArtifactRevisionId, binding.enhancementArtifactRevisionId, "final active enhancement artifact");
  } else {
    if (binding.enhancementJobId !== null || binding.enhancementArtifactRevisionId !== null) fail("this phase forbids enhancement topology");
    equal(binding.activeArtifactRevisionId, binding.coreArtifactRevisionId, "active core artifact");
  }
}

type QuestionBinding = { id: string; ordinal: 1 | 2 | 3; text: string };
function parseQuestions(rows: Rows): readonly [QuestionBinding, QuestionBinding, QuestionBinding] {
  if (rows.length !== 3) fail("the exact question set must contain three questions");
  const mapped = rows.map((row, index) => {
    if (row.ordinal !== index + 1) fail("the exact question order is invalid");
    return { id: required(row.id, "question id"), ordinal: (index + 1) as 1 | 2 | 3, text: required(row.question_text, "question text") };
  });
  return [mapped[0]!, mapped[1]!, mapped[2]!];
}

function assertCoreQuestionTopology(report: CombinedGeoReportV4, binding: Binding): void {
  const targetIndex = report.questions.findIndex((question) => question.questionId === binding.faultQuestionId);
  if (targetIndex < 0) fail("scenario fault question is not in the exact persisted question set");
  if (binding.scenarioKind === "success") {
    const matches = report.questions[targetIndex]!.sources.filter((source) => source.sourceId === binding.faultSourceId);
    if (matches.length !== 1 || matches[0]!.retrievalStatus !== "not_checked") {
      fail("scenario fault source is not one exact unchecked source of the fault question");
    }
  }
  report.questions.forEach((question, index) => {
    const expected = binding.scenarioKind === "question_failure" && index === targetIndex ? "unavailable" : "answered";
    if (question.status !== expected) fail("core question status topology does not match the exact scenario fault target");
  });
}

function parseArtifact(row: Row, binding: Binding, questions: readonly [QuestionBinding, QuestionBinding, QuestionBinding]): {
  report: CombinedGeoReportV4; record: ReportV4ArtifactPayloadAuthorityRecord;
} {
  const id = required(row.id, "artifact id");
  const kind = revisionKind(row.revision_kind);
  equal(row.report_id, binding.reportId, "artifact report"); equal(row.order_id, binding.orderId, "artifact order");
  equal(row.config_snapshot_id, binding.configSnapshotId, "artifact config");
  equal(row.payload_artifact_revision_id, id, "payload artifact"); equal(row.payload_report_id, binding.reportId, "payload report");
  equal(row.payload_order_id, binding.orderId, "payload order"); equal(row.payload_question_set_id, binding.questionSetId, "payload question set");
  if (row.artifact_contract !== "combined_geo_report_v4") fail("artifact contract is not V4");
  const status = artifactStatus(row.status);
  const active = id === binding.activeArtifactRevisionId;
  if ((status === "active") !== active) fail("artifact active status conflicts with scan_reports authority");
  if (kind === "generation") {
    equal(id, binding.coreArtifactRevisionId, "core artifact id"); equal(row.job_id, binding.coreJobId, "core artifact job");
    if (row.source_artifact_revision_id !== null) fail("core artifact cannot have a source revision");
  } else {
    equal(id, binding.enhancementArtifactRevisionId, "enhancement artifact id"); equal(row.job_id, binding.enhancementJobId, "enhancement artifact job");
    equal(row.source_artifact_revision_id, binding.coreArtifactRevisionId, "enhancement source artifact");
  }
  equal(row.payload_job_id, row.job_id, "payload job");
  let report: CombinedGeoReportV4;
  try { report = parseCombinedGeoReportV4(row.payload); }
  catch (error) { throw new Error(`Report V4 artifact authority: persisted payload is invalid: ${error instanceof Error ? error.message : "unknown parser error"}`); }
  equal(report.reportId, binding.reportId, "payload report identity"); equal(report.artifactRevisionId, id, "payload artifact identity");
  equal(report.targetUrl, canonicalPublicUrl(binding.reportUrl), "payload target URL lineage"); equal(report.locale, binding.reportLocale, "payload locale lineage");
  report.questions.forEach((question, index) => {
    const expected = questions[index]!;
    if (question.order !== expected.ordinal || question.questionId !== expected.id || question.questionText !== expected.text) {
      fail("payload question-set lineage drift was detected");
    }
  });
  if (stableJson(report) !== stableJson(row.payload)) {
    fail("parser round-trip differs from exact raw persisted JSONB");
  }
  const rawPayloadIdentityHash = hashJson(row.payload);
  if (!HASH.test(String(row.payload_identity_hash)) || row.payload_identity_hash !== rawPayloadIdentityHash) {
    fail("stored payload identity differs from exact raw persisted JSONB");
  }
  const payloadIdentityHash = rawPayloadIdentityHash;
  const revision = integer(row.revision, "artifact revision");
  const questionContentHashes = report.questions.map((question) => hashJson(questionCore(question))) as unknown as [string,string,string];
  const diagnosisContentHashes = report.questions.map((question) => question.diagnosis ? hashJson(question.diagnosis) : null) as unknown as [string|null,string|null,string|null];
  return { report, record: {
    artifactRevisionIdHash: sha(id), reportIdHash: sha(binding.reportId), orderIdHash: sha(binding.orderId),
    jobIdHash: sha(required(row.job_id,"artifact job")), configSnapshotIdHash: sha(binding.configSnapshotId),
    questionSetIdHash: sha(binding.questionSetId), sourceArtifactRevisionIdHash: row.source_artifact_revision_id === null ? null : sha(row.source_artifact_revision_id),
    revisionKind: kind, status, revision, payloadIdentityHash,
    preservedContentHash: hashJson(preservedReport(report)), questionContentHashes, diagnosisContentHashes
  } };
}

function assertEnhancementPreservesCore(enhancement: CombinedGeoReportV4, core: CombinedGeoReportV4): void {
  if (stableJson(preservedReport(enhancement)) !== stableJson(preservedReport(core))) {
    fail("enhancement drifted core answers, sources, synthesis, status, target, or locale");
  }
}

function preservedReport(report: CombinedGeoReportV4): unknown {
  return { version: report.version, artifactContract: report.artifactContract, reportId: report.reportId,
    targetUrl: report.targetUrl, locale: report.locale, status: report.status, websiteSynthesis: report.websiteSynthesis,
    questions: report.questions.map(questionCore) };
}

function questionCore(question: CombinedGeoReportV4Question): unknown {
  return { order: question.order, questionId: question.questionId, questionText: question.questionText,
    status: question.status, answer: question.answer, sources: question.sources.map((source) => ({
      questionId: source.questionId, sourceId: source.sourceId, title: source.title,
      canonicalUrl: source.canonicalUrl, citedText: source.citedText
    })) };
}

type SourceAudit = {
  questionId: string;
  sourceId: string;
  canonicalUrl: string;
  status: "available" | "inaccessible";
};

function assertSourceFaultAuthority(rows: Rows, core: CombinedGeoReportV4, enhancement: CombinedGeoReportV4, binding: Binding,
  questions: readonly [QuestionBinding, QuestionBinding, QuestionBinding]): void {
  if (rows.length !== 3) fail("the enhancement requires exactly three source-audit checkpoints");
  const inaccessible: SourceAudit[] = [];
  rows.forEach((row, index) => {
    const question = questions[index]!;
    const coreQuestion = core.questions[index]!;
    const enhancedQuestion = enhancement.questions[index]!;
    const audits = parseSourceAudits(row.source_audit_payload, question.id);
    if (audits.length !== coreQuestion.sources.length || enhancedQuestion.sources.length !== coreQuestion.sources.length) {
      fail("source audit does not preserve every exact question-owned report source");
    }
    const byId = new Map(audits.map((audit) => [audit.sourceId, audit]));
    if (byId.size !== audits.length) fail("source audit sourceId values must be unique per question");
    coreQuestion.sources.forEach((source, sourceIndex) => {
      const audit = byId.get(source.sourceId);
      const enhancedSource = enhancedQuestion.sources[sourceIndex];
      if (!audit || !enhancedSource || audit.canonicalUrl !== source.canonicalUrl
        || enhancedSource.sourceId !== source.sourceId || enhancedSource.questionId !== source.questionId
        || enhancedSource.canonicalUrl !== source.canonicalUrl || enhancedSource.retrievalStatus !== audit.status) {
        fail("source audit does not match the exact question/source artifact retrieval lineage");
      }
      if (audit.status === "inaccessible") inaccessible.push(audit);
    });
  });
  if (binding.scenarioKind === "success") {
    if (inaccessible.length !== 1 || inaccessible[0]!.questionId !== binding.faultQuestionId
      || inaccessible[0]!.sourceId !== binding.faultSourceId) {
      fail("success source fault must be the unique inaccessible exact target source");
    }
  } else if (inaccessible.length !== 0) {
    fail("non-success scenario cannot contain source-fault audit drift");
  }
}

function parseSourceAudits(value: unknown, questionId: string): SourceAudit[] {
  if (!Array.isArray(value)) fail("source_audit_payload must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`source audit ${index + 1} is invalid`);
    const audit = item as Row;
    const allowed = new Set(["questionId", "sourceId", "canonicalUrl", "status", "summary"]);
    if (Object.keys(audit).some((key) => !allowed.has(key))) fail(`source audit ${index + 1} contains unsupported fields`);
    const auditQuestionId = required(audit.questionId, `source audit ${index + 1} questionId`);
    if (auditQuestionId !== questionId) fail("source audit question does not match its exact checkpoint question");
    const status = audit.status;
    if (status !== "available" && status !== "inaccessible") fail(`source audit ${index + 1} status is invalid`);
    if (status === "inaccessible" && audit.summary !== undefined) fail("inaccessible source audit cannot retain a summary");
    return { questionId: auditQuestionId, sourceId: required(audit.sourceId, `source audit ${index + 1} sourceId`),
      canonicalUrl: required(audit.canonicalUrl, `source audit ${index + 1} canonicalUrl`), status };
  });
}

function assertDiagnosisCheckpointLineage(rows: Rows, report: CombinedGeoReportV4, binding: Binding,
  questions: readonly [QuestionBinding, QuestionBinding, QuestionBinding]): void {
  if (rows.length !== 3) fail("the enhancement requires exactly three terminal diagnosis checkpoints");
  const targetIndex = questions.findIndex((question) => question.id === binding.faultQuestionId);
  if (targetIndex < 0) fail("scenario fault question is not in the exact diagnosis question set");
  rows.forEach((row, index) => {
    const question = questions[index]!;
    for (const [actual, expected, label] of [
      [row.report_id,binding.reportId,"checkpoint report"],[row.enhancement_job_id,binding.enhancementJobId,"checkpoint enhancement job"],
      [row.core_artifact_revision_id,binding.coreArtifactRevisionId,"checkpoint core artifact"],
      [row.config_snapshot_id,binding.configSnapshotId,"checkpoint config"],[row.question_set_id,binding.questionSetId,"checkpoint question set"],
      [row.question_id,question.id,"checkpoint question"],[row.ordinal,question.ordinal,"checkpoint ordinal"]
    ] as const) equal(actual, expected, label);
    const diagnosis = report.questions[index]!.diagnosis;
    const expectedState = binding.scenarioKind === "diagnosis_failure" && index === targetIndex ? "failed" : "completed";
    if (row.state !== expectedState) fail("diagnosis checkpoint state topology does not match the exact scenario fault target");
    if (row.state === "completed") {
      if (!diagnosis || stableJson(diagnosis) !== stableJson(row.diagnosis_payload)
        || row.diagnosis_content_hash !== hashJson(diagnosis)) fail(`completed diagnosis checkpoint ${index + 1} does not match artifact diagnosis`);
    } else if (row.state === "failed") {
      if (diagnosis !== undefined || row.diagnosis_payload !== null || row.diagnosis_content_hash !== null) {
        fail("failed diagnosis checkpoint leaked output into the artifact");
      }
    } else fail("enhancement artifact requires terminal diagnosis checkpoints");
  });
}

async function query(tx: ReportV4ArtifactAuthorityTransactionSql, label: string, statement: string, parameters: unknown[] = []): Promise<Rows> {
  return tx.unsafe(`/* authority:${label} */ ${statement}`, parameters);
}
function parseInput(input: LoadReportV4ArtifactAuthorityInput): LoadReportV4ArtifactAuthorityInput {
  if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "phase,scenarioId,sessionId") fail("input fields are invalid");
  if (!UUID.test(input.sessionId) || !UUID.test(input.scenarioId)) fail("sessionId and scenarioId must be lowercase UUIDs");
  if (input.phase !== "baseline" && input.phase !== "final") fail("phase must be baseline or final");
  return input;
}
function exactIds(rows: Rows, expected: string[], label: string): void {
  const actual = rows.map((row) => required(row.id, `${label} id`)).sort();
  if (new Set(actual).size !== actual.length || stableJson(actual) !== stableJson(expected)) fail(`${label} scope must contain every and only the bound revisions`);
}
function one(rows: Rows, label: string): Row { if (rows.length !== 1) fail(`${label} must contain exactly one row`); return rows[0]!; }
function exactlyOne<T>(values: T[], label: string): T { if (values.length !== 1) fail(`${label} must exist exactly once`); return values[0]!; }
function equal(actual: unknown, expected: unknown, label: string): void { if (actual !== expected) fail(`${label} mismatch`); }
function required(value: unknown, label: string): string { if (typeof value !== "string" || !value || value.trim() !== value) fail(`${label} is invalid`); return value; }
function nullable(value: unknown, label: string): string | null { return value === null ? null : required(value, label); }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail(`${label} is invalid`); return value; }
function scenarioKind(value: unknown): Binding["scenarioKind"] { if (value !== "success" && value !== "diagnosis_failure" && value !== "question_failure") fail("scenario kind is invalid"); return value; }
function revisionKind(value: unknown): ReportV4ArtifactPayloadAuthorityRecord["revisionKind"] { if (value !== "generation" && value !== "diagnosis_enhancement") fail("artifact revision kind is invalid"); return value; }
function artifactStatus(value: unknown): ReportV4ArtifactPayloadAuthorityRecord["status"] { if (value !== "ready" && value !== "active") fail("artifact must be ready or active"); return value; }
function sha(value: unknown): string { return createHash("sha256").update(required(value, "hash source")).digest("hex"); }
function hashJson(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function iso(value: unknown, label: string): string { const date = value instanceof Date ? value : new Date(required(value,label)); if (!Number.isFinite(date.getTime())) fail(`${label} is invalid`); return date.toISOString(); }
function canonicalPublicUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { fail("report URL is invalid"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) fail("report URL is not public HTTP(S)");
  url.hash = "";
  return url.toString();
}
function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Row).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key,child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  fail("canonical JSON contains an unsupported value");
}
function fail(message: string): never { throw new Error(`Report V4 artifact authority: ${message}`); }
