import { createHash } from "node:crypto";
import type postgres from "postgres";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { ensureDatabase, getSqlClient } from "./index";
import type {
  ReportV4AcceptanceEventDetails,
  ReportV4AcceptanceEventKind,
  ReportV4AcceptanceEventPhase,
  ReportV4AcceptanceFaultKind,
  ReportV4AcceptanceOperation,
  ReportV4AcceptanceScenarioKind,
  ReportV4AcceptanceSessionState
} from "./schema";

const ZERO_HASH = "0".repeat(64);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export interface ReportV4AcceptanceSession {
  readonly sessionId: string;
  readonly environment: "protected_staging";
  readonly previewDeploymentId: string;
  readonly protectedAliasUrl: string;
  readonly webGitSha: string;
  readonly workerGitSha: string;
  readonly state: ReportV4AcceptanceSessionState;
  readonly headSequence: number;
  readonly headHash: string;
  readonly eventCount: number;
  readonly startedAt: Date;
  readonly terminalAt: Date | null;
}

export interface CreateReportV4AcceptanceSessionInput {
  readonly sessionId: string;
  readonly previewDeploymentId: string;
  readonly protectedAliasUrl: string;
  readonly webGitSha: string;
  readonly workerGitSha: string;
}

export type CreateReportV4AcceptanceScenarioInput = {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly faultQuestionId: string;
} & (
  | { readonly kind: "success"; readonly faultKind: "independent_source_read_failure"; readonly faultSourceId?: string; readonly expectedFaultOccurrences: 1 }
  | { readonly kind: "diagnosis_failure"; readonly faultKind: "diagnosis_failure"; readonly expectedFaultOccurrences: 2 }
  | { readonly kind: "question_failure"; readonly faultKind: "question_failure"; readonly expectedFaultOccurrences: 2 }
);

export interface BindReportV4AcceptanceScenarioInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string;
  readonly orderId: string;
  readonly preAdmissionJobId: string;
  readonly coreJobId: string;
  readonly enhancementJobId: string | null;
  readonly siteSnapshotId: string;
  readonly configSnapshotId: string;
  readonly questionSetId: string;
  readonly coreArtifactRevisionId: string;
  readonly enhancementArtifactRevisionId: string | null;
}

export interface BindReportV4AcceptancePreAdmissionJobInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly preAdmissionJobId: string;
}

export interface BindReportV4AcceptanceFaultSourceInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly sourceId: string;
}

export interface LoadCollectingReportV4AcceptanceScenarioByJobInput {
  readonly sessionId: string;
  readonly jobId: string;
}

export interface ReportV4AcceptanceScenario {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string | null;
  readonly orderId: string | null;
  readonly preAdmissionJobId: string | null;
  readonly coreJobId: string | null;
  readonly enhancementJobId: string | null;
  readonly siteSnapshotId: string | null;
  readonly configSnapshotId: string | null;
  readonly questionSetId: string | null;
  readonly coreArtifactRevisionId: string | null;
  readonly enhancementArtifactRevisionId: string | null;
  readonly kind: ReportV4AcceptanceScenarioKind;
  readonly faultKind: ReportV4AcceptanceFaultKind;
  readonly faultQuestionId: string;
  readonly faultSourceId: string | null;
  readonly expectedFaultOccurrences: 1 | 2;
  readonly baselineFingerprint: string | null;
  readonly finalFingerprint: string | null;
  readonly state: ReportV4AcceptanceSessionState;
  readonly createdAt: Date;
  readonly terminalAt: Date | null;
}

export type AppendReportV4AcceptanceEventInput = {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly unitId: string;
  readonly attempt: 0 | 1 | 2;
} & (
  | { readonly kind: "scenario_bound"; readonly operation: "v4_dispatch"; readonly phase: "observed"; readonly details: { readonly bindingHash: string } }
  | { readonly kind: "crawl_run"; readonly operation: "crawl"; readonly phase: "started" | "completed" | "failed"; readonly details: { readonly candidatePages: number; readonly analyzablePages: number; readonly excludedPages: number; readonly jsDependentPages: number } }
  | { readonly kind: "site_read"; readonly operation: "site_raw_read" | "site_browser_read"; readonly phase: "started" | "completed" | "failed"; readonly details: { readonly urlHash: string; readonly readMode: "raw" | "browser"; readonly networkPerformed: boolean } }
  | { readonly kind: "model_operation"; readonly operation: "page_analysis" | "website_synthesis" | "question_answer" | "source_diagnosis"; readonly phase: "started" | "completed" | "failed" | "rejected"; readonly details: { readonly providerCall: boolean; readonly retry: boolean; readonly budgetOutcome: "allowed" | "rejected"; readonly inputTokens: number; readonly outputTokens: number } }
  | { readonly kind: "html_assembly"; readonly operation: "core_html" | "enhancement_html"; readonly phase: "started" | "completed" | "failed"; readonly details: { readonly artifactRevisionId: string; readonly htmlSha256: string } }
  | { readonly kind: "fault_injection"; readonly operation: ReportV4AcceptanceFaultKind; readonly phase: "consumed"; readonly details: { readonly fault: ReportV4AcceptanceFaultKind; readonly occurrence: 1 | 2; readonly baselineFingerprint: string } }
  | { readonly kind: "checkpoint_terminal"; readonly operation: "question_answer" | "source_diagnosis"; readonly phase: "observed"; readonly details: { readonly checkpointHash: string; readonly state: "answered" | "unavailable" | "completed" | "failed" } }
  | { readonly kind: "v4_dispatch"; readonly operation: "v4_dispatch"; readonly phase: "observed"; readonly details: Record<string, never> }
  | { readonly kind: "prohibited_operation"; readonly operation: "pdf" | "provider_claim" | "qualification" | "four_snapshot" | "replacement_fulfillment" | "correction" | "full_report_rerun" | "legacy_mutation"; readonly phase: "started"; readonly details: Record<string, never> }
  | { readonly kind: "artifact_activation"; readonly operation: "artifact_activation"; readonly phase: "observed"; readonly details: { readonly artifactRevisionId: string; readonly htmlSha256: string } }
  | { readonly kind: "commerce_fingerprint"; readonly operation: "commerce"; readonly phase: "observed"; readonly details: { readonly fingerprint: string } }
);

export interface ReportV4AcceptanceEvent {
  readonly idempotencyKey: string;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly sequence: number;
  readonly kind: ReportV4AcceptanceEventKind;
  readonly operation: ReportV4AcceptanceOperation;
  readonly unitId: string;
  readonly attempt: 0 | 1 | 2;
  readonly phase: ReportV4AcceptanceEventPhase;
  readonly details: ReportV4AcceptanceEventDetails;
  readonly detailsCanonical: string;
  readonly prevHash: string;
  readonly eventHash: string;
  readonly occurredAt: Date;
  readonly occurredAtCanonical: string;
}

export interface ReportV4AcceptanceEventAppendResult {
  readonly event: ReportV4AcceptanceEvent;
  /** True only for the transaction that first claimed this deterministic event key. */
  readonly inserted: boolean;
}

export interface TerminalizeReportV4AcceptanceScenarioInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly baselineFingerprint: string;
  readonly finalFingerprint: string;
}

export interface ReportV4AcceptanceLedgerStore {
  createSession(input: CreateReportV4AcceptanceSessionInput): Promise<ReportV4AcceptanceSession>;
  createScenario(input: CreateReportV4AcceptanceScenarioInput): Promise<ReportV4AcceptanceScenario>;
  bindFaultSource(input: BindReportV4AcceptanceFaultSourceInput): Promise<ReportV4AcceptanceScenario>;
  bindPreAdmissionJob(input: BindReportV4AcceptancePreAdmissionJobInput): Promise<ReportV4AcceptanceScenario>;
  bindScenario(input: BindReportV4AcceptanceScenarioInput): Promise<ReportV4AcceptanceScenario>;
  appendEvent(input: AppendReportV4AcceptanceEventInput): Promise<ReportV4AcceptanceEventAppendResult>;
  sealScenario(input: TerminalizeReportV4AcceptanceScenarioInput): Promise<ReportV4AcceptanceScenario>;
  failScenario(input: TerminalizeReportV4AcceptanceScenarioInput): Promise<ReportV4AcceptanceScenario>;
  sealSession(sessionId: string): Promise<ReportV4AcceptanceSession>;
  failSession(sessionId: string): Promise<ReportV4AcceptanceSession>;
  loadSession(sessionId: string): Promise<ReportV4AcceptanceSession | null>;
  loadScenarios(sessionId: string): Promise<readonly ReportV4AcceptanceScenario[]>;
  loadCollectingScenarioByJob(input: LoadCollectingReportV4AcceptanceScenarioByJobInput): Promise<ReportV4AcceptanceScenario | null>;
  loadEvents(sessionId: string): Promise<readonly ReportV4AcceptanceEvent[]>;
}

export type ReportV4AcceptanceLedgerRepository = ReportV4AcceptanceLedgerStore;

export function createReportV4AcceptanceLedgerRepository(
  store: ReportV4AcceptanceLedgerStore,
  environment: NodeJS.ProcessEnv = process.env
): ReportV4AcceptanceLedgerRepository {
  const mutate = <T extends unknown[], R>(operation: (...args: T) => Promise<R>) => async (...args: T): Promise<R> => {
    assertProtectedStagingCommercePreview(environment);
    return operation(...args);
  };
  return {
    createSession: mutate((value) => store.createSession(parseSessionInput(value))),
    createScenario: mutate((value) => store.createScenario(parseScenarioInput(value))),
    bindFaultSource: mutate((value) => store.bindFaultSource(parseFaultSourceBindingInput(value))),
    bindPreAdmissionJob: mutate((value) => store.bindPreAdmissionJob(parsePreAdmissionBindingInput(value))),
    bindScenario: mutate((value) => store.bindScenario(parseBindingInput(value))),
    appendEvent: mutate((value) => store.appendEvent(parseEventInput(value))),
    sealScenario: mutate((value) => store.sealScenario(parseTerminalScenarioInput(value))),
    failScenario: mutate((value) => store.failScenario(parseTerminalScenarioInput(value))),
    sealSession: mutate((value) => store.sealSession(uuid(value, "sessionId"))),
    failSession: mutate((value) => store.failSession(uuid(value, "sessionId"))),
    loadSession: mutate((value) => store.loadSession(uuid(value, "sessionId"))),
    loadScenarios: mutate((value) => store.loadScenarios(uuid(value, "sessionId"))),
    loadCollectingScenarioByJob: mutate((value) => store.loadCollectingScenarioByJob(parseJobLookupInput(value))),
    loadEvents: mutate((value) => store.loadEvents(uuid(value, "sessionId")))
  };
}

export function createPostgresReportV4AcceptanceLedgerStore(sql: postgres.Sql): ReportV4AcceptanceLedgerStore {
  return {
    async createSession(input) {
      const rows = await sql`INSERT INTO report_v4_acceptance_sessions
        (id,environment,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
        VALUES(${input.sessionId},'protected_staging',${input.previewDeploymentId},${input.protectedAliasUrl},${input.webGitSha},${input.workerGitSha})
        ON CONFLICT(id) DO NOTHING RETURNING *`;
      const row = rows[0] ?? (await sql`SELECT * FROM report_v4_acceptance_sessions WHERE id=${input.sessionId}`)[0];
      const mapped = mapSession(row);
      if (!mapped || mapped.previewDeploymentId !== input.previewDeploymentId || mapped.protectedAliasUrl !== input.protectedAliasUrl
        || mapped.webGitSha !== input.webGitSha || mapped.workerGitSha !== input.workerGitSha) {
        throw new Error("Report V4 acceptance session idempotency conflicts with another deployment identity.");
      }
      return mapped;
    },
    async createScenario(input) {
      const source = "faultSourceId" in input ? input.faultSourceId : undefined;
      const rows = await sql`INSERT INTO report_v4_acceptance_scenarios
        (id,session_id,kind,fault_kind,fault_question_id,fault_source_id,expected_fault_occurrences)
        VALUES(${input.scenarioId},${input.sessionId},${input.kind},${input.faultKind},${input.faultQuestionId},${source ?? null},${input.expectedFaultOccurrences})
        ON CONFLICT(id) DO NOTHING RETURNING *`;
      const row = rows[0] ?? (await sql`SELECT * FROM report_v4_acceptance_scenarios WHERE id=${input.scenarioId}`)[0];
      const mapped = mapScenario(row);
      if (!mapped || mapped.sessionId !== input.sessionId || mapped.kind !== input.kind || mapped.faultKind !== input.faultKind
        || mapped.faultQuestionId !== input.faultQuestionId || mapped.faultSourceId !== (source ?? null)
        || mapped.expectedFaultOccurrences !== input.expectedFaultOccurrences) {
        throw new Error("Report V4 acceptance scenario idempotency conflicts with another exact fault identity.");
      }
      return mapped;
    },
    async bindFaultSource(input) {
      const rows = await sql`UPDATE report_v4_acceptance_scenarios SET fault_source_id=${input.sourceId}
        WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting' AND kind='success'
          AND fault_kind='independent_source_read_failure' AND fault_source_id IS NULL RETURNING *`;
      const bound = mapScenario(rows[0]);
      if (bound) return bound;
      const existing = mapScenario((await sql`SELECT * FROM report_v4_acceptance_scenarios
        WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting'`)[0]);
      if (existing?.kind === "success" && existing.faultKind === "independent_source_read_failure"
        && existing.faultSourceId === input.sourceId) return existing;
      if (existing?.kind !== "success" || existing.faultKind !== "independent_source_read_failure") {
        throw new Error("Only a collecting successful Report V4 acceptance scenario can bind an independent fault source.");
      }
      throw new Error("The collecting Report V4 acceptance scenario cannot rebind its fault source.");
    },
    async bindPreAdmissionJob(input) {
      const rows = await sql`UPDATE report_v4_acceptance_scenarios SET pre_admission_job_id=${input.preAdmissionJobId}
        WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting' AND pre_admission_job_id IS NULL
        RETURNING *`;
      const bound = mapScenario(rows[0]);
      if (bound) return bound;
      const existing = mapScenario((await sql`SELECT * FROM report_v4_acceptance_scenarios
        WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting'`)[0]);
      if (existing?.preAdmissionJobId === input.preAdmissionJobId) return existing;
      throw new Error("The collecting Report V4 acceptance scenario cannot rebind its pre-admission job.");
    },
    async bindScenario(input) {
      const rows = await sql`UPDATE report_v4_acceptance_scenarios SET
        report_id=${input.reportId},order_id=${input.orderId},pre_admission_job_id=${input.preAdmissionJobId},
        core_job_id=${input.coreJobId},enhancement_job_id=${input.enhancementJobId},site_snapshot_id=${input.siteSnapshotId},
        config_snapshot_id=${input.configSnapshotId},question_set_id=${input.questionSetId},
        core_artifact_revision_id=${input.coreArtifactRevisionId},enhancement_artifact_revision_id=${input.enhancementArtifactRevisionId}
        WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting' RETURNING *`;
      const mapped = mapScenario(rows[0]);
      if (!mapped) throw new Error("The collecting Report V4 acceptance scenario was not found for exact lineage binding.");
      return mapped;
    },
    async appendEvent(input) {
      const envelope = await sql.begin(async (tx) => ({ value: await appendPostgresEvent(tx, input) }));
      return envelope.value;
    },
    sealScenario: (input) => terminalizePostgresScenario(sql, input, "sealed"),
    failScenario: (input) => terminalizePostgresScenario(sql, input, "failed"),
    sealSession: (sessionId) => terminalizePostgresSession(sql, sessionId, "sealed"),
    failSession: (sessionId) => terminalizePostgresSession(sql, sessionId, "failed"),
    async loadSession(sessionId) {
      return mapSession((await sql`SELECT * FROM report_v4_acceptance_sessions WHERE id=${sessionId}`)[0]);
    },
    async loadScenarios(sessionId) {
      return (await sql`SELECT * FROM report_v4_acceptance_scenarios WHERE session_id=${sessionId} ORDER BY kind`).map(mapScenarioRequired);
    },
    async loadCollectingScenarioByJob(input) {
      const rows = await sql`SELECT * FROM report_v4_acceptance_scenarios
        WHERE session_id=${input.sessionId} AND state='collecting'
          AND (${input.jobId}=pre_admission_job_id OR ${input.jobId}=core_job_id OR ${input.jobId}=enhancement_job_id)
        ORDER BY id LIMIT 2`;
      if (rows.length > 1) throw new Error("A Report V4 acceptance job maps to more than one collecting scenario.");
      return mapScenario(rows[0]);
    },
    async loadEvents(sessionId) {
      return (await sql`SELECT * FROM report_v4_acceptance_events WHERE session_id=${sessionId} ORDER BY sequence`).map(mapEventRequired);
    }
  };
}

export function createProductionReportV4AcceptanceLedgerRepository(
  environment: NodeJS.ProcessEnv = process.env
): ReportV4AcceptanceLedgerRepository {
  return createReportV4AcceptanceLedgerRepository({
    async createSession(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).createSession(input); },
    async createScenario(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).createScenario(input); },
    async bindFaultSource(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).bindFaultSource(input); },
    async bindPreAdmissionJob(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).bindPreAdmissionJob(input); },
    async bindScenario(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).bindScenario(input); },
    async appendEvent(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).appendEvent(input); },
    async sealScenario(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).sealScenario(input); },
    async failScenario(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).failScenario(input); },
    async sealSession(id) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).sealSession(id); },
    async failSession(id) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).failSession(id); },
    async loadSession(id) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).loadSession(id); },
    async loadScenarios(id) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).loadScenarios(id); },
    async loadCollectingScenarioByJob(input) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).loadCollectingScenarioByJob(input); },
    async loadEvents(id) { await ensureDatabase(); return createPostgresReportV4AcceptanceLedgerStore(getSqlClient()).loadEvents(id); }
  }, environment);
}

async function appendPostgresEvent(tx: postgres.TransactionSql, input: AppendReportV4AcceptanceEventInput): Promise<ReportV4AcceptanceEventAppendResult> {
  const sessions = await tx`SELECT * FROM report_v4_acceptance_sessions WHERE id=${input.sessionId} FOR UPDATE`;
  const session = mapSession(sessions[0]);
  if (!session || session.state !== "collecting") throw new Error("A collecting Report V4 acceptance session is required for append.");
  const idempotencyKey = eventIdempotencyKey(input);
  const existing = mapEvent((await tx`SELECT * FROM report_v4_acceptance_events WHERE idempotency_key=${idempotencyKey}`)[0]);
  if (existing) {
    if (!sameEvent(existing, input)) throw new Error("Report V4 acceptance event idempotency payload conflict.");
    return { event: existing, inserted: false };
  }
  const rows = await tx`INSERT INTO report_v4_acceptance_events
    (idempotency_key,session_id,scenario_id,sequence,kind,operation,unit_id,attempt,phase,details,prev_hash,event_hash)
    VALUES(${idempotencyKey},${input.sessionId},${input.scenarioId},${session.headSequence + 1},${input.kind},${input.operation},
      ${input.unitId},${input.attempt},${input.phase},${tx.json(input.details)}::jsonb,${session.headHash},${ZERO_HASH}) RETURNING *`;
  return { event: mapEventRequired(rows[0]), inserted: true };
}

async function terminalizePostgresScenario(
  sql: postgres.Sql,
  input: TerminalizeReportV4AcceptanceScenarioInput,
  state: "sealed" | "failed"
): Promise<ReportV4AcceptanceScenario> {
  const rows = await sql`UPDATE report_v4_acceptance_scenarios SET state=${state},baseline_fingerprint=${input.baselineFingerprint},
    final_fingerprint=${input.finalFingerprint},terminal_at=clock_timestamp()
    WHERE id=${input.scenarioId} AND session_id=${input.sessionId} AND state='collecting' RETURNING *`;
  const row = mapScenario(rows[0]);
  if (!row) throw new Error("The collecting Report V4 acceptance scenario could not be terminalized.");
  return row;
}

async function terminalizePostgresSession(
  sql: postgres.Sql,
  sessionId: string,
  state: "sealed" | "failed"
): Promise<ReportV4AcceptanceSession> {
  const rows = await sql`UPDATE report_v4_acceptance_sessions SET state=${state},terminal_at=clock_timestamp()
    WHERE id=${sessionId} AND state='collecting' RETURNING *`;
  const row = mapSession(rows[0]);
  if (!row) throw new Error("The collecting Report V4 acceptance session could not be terminalized.");
  return row;
}

function parseSessionInput(value: CreateReportV4AcceptanceSessionInput): CreateReportV4AcceptanceSessionInput {
  const input = strictRecord(value, ["sessionId", "previewDeploymentId", "protectedAliasUrl", "webGitSha", "workerGitSha"], "session");
  const url = new URL(text(input.protectedAliasUrl, "protectedAliasUrl", 2_000));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("protectedAliasUrl must be a canonical HTTPS origin.");
  }
  const webGitSha = gitSha(input.webGitSha, "webGitSha");
  const workerGitSha = gitSha(input.workerGitSha, "workerGitSha");
  if (webGitSha !== workerGitSha) throw new TypeError("webGitSha and workerGitSha must identify the same deployment commit.");
  return {
    sessionId: uuid(input.sessionId, "sessionId"),
    previewDeploymentId: text(input.previewDeploymentId, "previewDeploymentId", 200),
    protectedAliasUrl: url.toString().replace(/\/$/u, ""),
    webGitSha,
    workerGitSha
  };
}

function parsePreAdmissionBindingInput(value: BindReportV4AcceptancePreAdmissionJobInput): BindReportV4AcceptancePreAdmissionJobInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "preAdmissionJobId"], "pre-admission binding");
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    preAdmissionJobId: text(input.preAdmissionJobId, "preAdmissionJobId", 500) };
}

function parseJobLookupInput(value: LoadCollectingReportV4AcceptanceScenarioByJobInput): LoadCollectingReportV4AcceptanceScenarioByJobInput {
  const input = strictRecord(value, ["sessionId", "jobId"], "scenario job lookup");
  return { sessionId: uuid(input.sessionId, "sessionId"), jobId: text(input.jobId, "jobId", 500) };
}

function parseScenarioInput(value: CreateReportV4AcceptanceScenarioInput): CreateReportV4AcceptanceScenarioInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("scenario must be an object.");
  const candidate = value as unknown as Record<string, unknown>;
  const allowed = candidate.kind === "success"
    ? ["sessionId", "scenarioId", "kind", "faultKind", "faultQuestionId", ...("faultSourceId" in candidate ? ["faultSourceId"] : []), "expectedFaultOccurrences"]
    : ["sessionId", "scenarioId", "kind", "faultKind", "faultQuestionId", "expectedFaultOccurrences"];
  const input = strictRecord(value, allowed, "scenario");
  const kind = input.kind;
  const faultKind = input.faultKind;
  const base = { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"), faultQuestionId: text(input.faultQuestionId, "faultQuestionId", 500) };
  if (kind === "success" && faultKind === "independent_source_read_failure" && input.expectedFaultOccurrences === 1) {
    return input.faultSourceId === undefined
      ? { ...base, kind, faultKind, expectedFaultOccurrences: 1 }
      : { ...base, kind, faultKind, faultSourceId: text(input.faultSourceId, "faultSourceId", 500), expectedFaultOccurrences: 1 };
  }
  if (kind === "diagnosis_failure" && faultKind === kind && input.faultSourceId === undefined && input.expectedFaultOccurrences === 2) {
    return { ...base, kind, faultKind, expectedFaultOccurrences: 2 };
  }
  if (kind === "question_failure" && faultKind === kind && input.faultSourceId === undefined && input.expectedFaultOccurrences === 2) {
    return { ...base, kind, faultKind, expectedFaultOccurrences: 2 };
  }
  throw new TypeError("Report V4 acceptance scenario fault identity and occurrence budget are invalid.");
}

function parseFaultSourceBindingInput(value: BindReportV4AcceptanceFaultSourceInput): BindReportV4AcceptanceFaultSourceInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "sourceId"], "fault source binding");
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    sourceId: text(input.sourceId, "sourceId", 500) };
}

function parseBindingInput(value: BindReportV4AcceptanceScenarioInput): BindReportV4AcceptanceScenarioInput {
  const fields = ["sessionId", "scenarioId", "reportId", "orderId", "preAdmissionJobId", "coreJobId", "enhancementJobId",
    "siteSnapshotId", "configSnapshotId", "questionSetId", "coreArtifactRevisionId", "enhancementArtifactRevisionId"];
  const input = strictRecord(value, fields, "scenario binding");
  const id = (field: string) => text(input[field], field, 500);
  return {
    sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    reportId: id("reportId"), orderId: id("orderId"), preAdmissionJobId: id("preAdmissionJobId"), coreJobId: id("coreJobId"),
    enhancementJobId: input.enhancementJobId === null ? null : id("enhancementJobId"), siteSnapshotId: id("siteSnapshotId"),
    configSnapshotId: id("configSnapshotId"), questionSetId: id("questionSetId"), coreArtifactRevisionId: id("coreArtifactRevisionId"),
    enhancementArtifactRevisionId: input.enhancementArtifactRevisionId === null ? null : id("enhancementArtifactRevisionId")
  };
}

function parseTerminalScenarioInput(value: TerminalizeReportV4AcceptanceScenarioInput): TerminalizeReportV4AcceptanceScenarioInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "baselineFingerprint", "finalFingerprint"], "scenario terminalization");
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    baselineFingerprint: hash(input.baselineFingerprint, "baselineFingerprint"), finalFingerprint: hash(input.finalFingerprint, "finalFingerprint") };
}

function parseEventInput(value: AppendReportV4AcceptanceEventInput): AppendReportV4AcceptanceEventInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "kind", "operation", "unitId", "attempt", "phase", "details"], "event");
  const base = { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    unitId: text(input.unitId, "unitId", 500), attempt: integer(input.attempt, "attempt", 0, 2) as 0 | 1 | 2 };
  const kind = input.kind as ReportV4AcceptanceEventKind;
  const operation = input.operation as ReportV4AcceptanceOperation;
  const phase = input.phase as ReportV4AcceptanceEventPhase;
  const details = parseEventDetails(kind, operation, phase, input.details);
  return { ...base, kind, operation, phase, details } as AppendReportV4AcceptanceEventInput;
}

function parseEventDetails(kind: ReportV4AcceptanceEventKind, operation: ReportV4AcceptanceOperation, phase: ReportV4AcceptanceEventPhase, value: unknown): ReportV4AcceptanceEventDetails {
  const record = (fields: readonly string[]) => strictRecord(value, fields, `${kind} details`);
  if (kind === "scenario_bound" && operation === "v4_dispatch" && phase === "observed") return { bindingHash: hash(record(["bindingHash"]).bindingHash, "bindingHash") };
  if (kind === "crawl_run" && operation === "crawl" && ["started", "completed", "failed"].includes(phase)) {
    const d = record(["candidatePages", "analyzablePages", "excludedPages", "jsDependentPages"]);
    return { candidatePages: integer(d.candidatePages, "candidatePages", 0), analyzablePages: integer(d.analyzablePages, "analyzablePages", 0), excludedPages: integer(d.excludedPages, "excludedPages", 0), jsDependentPages: integer(d.jsDependentPages, "jsDependentPages", 0) };
  }
  if (kind === "site_read" && ["site_raw_read", "site_browser_read"].includes(operation) && ["started", "completed", "failed"].includes(phase)) {
    const d = record(["urlHash", "readMode", "networkPerformed"]); const mode = d.readMode;
    if (mode !== "raw" && mode !== "browser" || typeof d.networkPerformed !== "boolean") throw new TypeError("site_read details are invalid.");
    return { urlHash: hash(d.urlHash, "urlHash"), readMode: mode, networkPerformed: d.networkPerformed };
  }
  if (kind === "model_operation" && ["page_analysis", "website_synthesis", "question_answer", "source_diagnosis"].includes(operation) && ["started", "completed", "failed", "rejected"].includes(phase)) {
    const d = record(["providerCall", "retry", "budgetOutcome", "inputTokens", "outputTokens"]);
    if (typeof d.providerCall !== "boolean" || typeof d.retry !== "boolean" || (d.budgetOutcome !== "allowed" && d.budgetOutcome !== "rejected")) throw new TypeError("model_operation details are invalid.");
    return { providerCall: d.providerCall, retry: d.retry, budgetOutcome: d.budgetOutcome, inputTokens: integer(d.inputTokens, "inputTokens", 0), outputTokens: integer(d.outputTokens, "outputTokens", 0) };
  }
  if ((kind === "html_assembly" && ["core_html", "enhancement_html"].includes(operation) && ["started", "completed", "failed"].includes(phase))
    || (kind === "artifact_activation" && operation === "artifact_activation" && phase === "observed")) {
    const d = record(["artifactRevisionId", "htmlSha256"]); return { artifactRevisionId: text(d.artifactRevisionId, "artifactRevisionId", 500), htmlSha256: hash(d.htmlSha256, "htmlSha256") };
  }
  if (kind === "fault_injection" && ["question_failure", "diagnosis_failure", "independent_source_read_failure"].includes(operation) && phase === "consumed") {
    const d = record(["fault", "occurrence", "baselineFingerprint"]);
    if (d.fault !== operation || (d.occurrence !== 1 && d.occurrence !== 2)) throw new TypeError("fault_injection details are invalid.");
    return { fault: d.fault as ReportV4AcceptanceFaultKind, occurrence: d.occurrence, baselineFingerprint: hash(d.baselineFingerprint, "baselineFingerprint") };
  }
  if (kind === "checkpoint_terminal" && ["question_answer", "source_diagnosis"].includes(operation) && phase === "observed") {
    const d = record(["checkpointHash", "state"]); if (!["answered", "unavailable", "completed", "failed"].includes(String(d.state))) throw new TypeError("checkpoint_terminal state is invalid.");
    return { checkpointHash: hash(d.checkpointHash, "checkpointHash"), state: d.state as "answered" | "unavailable" | "completed" | "failed" };
  }
  if ((kind === "v4_dispatch" && operation === "v4_dispatch" && phase === "observed") || (kind === "prohibited_operation" && ["pdf", "provider_claim", "qualification", "four_snapshot", "replacement_fulfillment", "correction", "full_report_rerun", "legacy_mutation"].includes(operation) && phase === "started")) {
    record([]); return {};
  }
  if (kind === "commerce_fingerprint" && operation === "commerce" && phase === "observed") return { fingerprint: hash(record(["fingerprint"]).fingerprint, "fingerprint") };
  throw new TypeError("Report V4 acceptance event kind, operation, phase, and typed details do not match.");
}

function eventIdempotencyKey(input: AppendReportV4AcceptanceEventInput): string {
  return createHash("sha256").update([input.sessionId, input.scenarioId, input.kind, input.operation, input.unitId, input.attempt, input.phase].join("\x1f")).digest("hex");
}

function sameEvent(row: ReportV4AcceptanceEvent, input: AppendReportV4AcceptanceEventInput): boolean {
  return row.sessionId === input.sessionId && row.scenarioId === input.scenarioId && row.kind === input.kind
    && row.operation === input.operation && row.unitId === input.unitId && row.attempt === input.attempt
    && row.phase === input.phase && stableJson(row.details) === stableJson(input.details);
}

function mapSession(row: Record<string, unknown> | undefined): ReportV4AcceptanceSession | null {
  if (!row) return null;
  return { sessionId: String(row.id), environment: "protected_staging", previewDeploymentId: String(row.preview_deployment_id),
    protectedAliasUrl: String(row.protected_alias_url), webGitSha: String(row.web_git_sha), workerGitSha: String(row.worker_git_sha),
    state: String(row.state) as ReportV4AcceptanceSessionState, headSequence: Number(row.head_sequence), headHash: String(row.head_hash),
    eventCount: Number(row.event_count), startedAt: new Date(String(row.started_at)), terminalAt: row.terminal_at ? new Date(String(row.terminal_at)) : null };
}

function mapScenario(row: Record<string, unknown> | undefined): ReportV4AcceptanceScenario | null {
  if (!row) return null;
  return { sessionId: String(row.session_id), scenarioId: String(row.id), kind: String(row.kind) as ReportV4AcceptanceScenarioKind,
    faultKind: String(row.fault_kind) as ReportV4AcceptanceFaultKind, faultQuestionId: String(row.fault_question_id),
    faultSourceId: row.fault_source_id == null ? null : String(row.fault_source_id), expectedFaultOccurrences: Number(row.expected_fault_occurrences) as 1 | 2,
    reportId: nullable(row.report_id), orderId: nullable(row.order_id), preAdmissionJobId: nullable(row.pre_admission_job_id),
    coreJobId: nullable(row.core_job_id), enhancementJobId: nullable(row.enhancement_job_id), siteSnapshotId: nullable(row.site_snapshot_id),
    configSnapshotId: nullable(row.config_snapshot_id), questionSetId: nullable(row.question_set_id), coreArtifactRevisionId: nullable(row.core_artifact_revision_id),
    enhancementArtifactRevisionId: nullable(row.enhancement_artifact_revision_id), baselineFingerprint: nullable(row.baseline_fingerprint),
    finalFingerprint: nullable(row.final_fingerprint), state: String(row.state) as ReportV4AcceptanceSessionState,
    createdAt: new Date(String(row.created_at)), terminalAt: row.terminal_at ? new Date(String(row.terminal_at)) : null };
}

function mapScenarioRequired(row: Record<string, unknown>): ReportV4AcceptanceScenario { return mapScenario(row)!; }
function mapEvent(row: Record<string, unknown> | undefined): ReportV4AcceptanceEvent | null {
  if (!row) return null;
  const details = typeof row.details === "string" ? JSON.parse(row.details) : row.details;
  return { idempotencyKey: String(row.idempotency_key), sessionId: String(row.session_id), scenarioId: String(row.scenario_id),
    sequence: Number(row.sequence), kind: String(row.kind) as ReportV4AcceptanceEventKind, operation: String(row.operation) as ReportV4AcceptanceOperation,
    unitId: String(row.unit_id), attempt: Number(row.attempt) as 0 | 1 | 2, phase: String(row.phase) as ReportV4AcceptanceEventPhase,
    details: details as ReportV4AcceptanceEventDetails, detailsCanonical: String(row.details_canonical),
    prevHash: String(row.prev_hash), eventHash: String(row.event_hash), occurredAt: new Date(String(row.occurred_at)),
    occurredAtCanonical: String(row.occurred_at_canonical) };
}
function mapEventRequired(row: Record<string, unknown>): ReportV4AcceptanceEvent { return mapEvent(row)!; }

function strictRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const input = value as Record<string, unknown>; const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)) || fields.some((field) => !(field in input))) {
    throw new TypeError(`${label} fields must match the strict contract.`);
  }
  return input;
}
function uuid(value: unknown, field: string): string { const result = text(value, field, 36); if (!UUID_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase UUID.`); return result; }
function hash(value: unknown, field: string): string { const result = text(value, field, 64); if (!HASH_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase SHA-256 hash.`); return result; }
function gitSha(value: unknown, field: string): string { const result = text(value, field, 40); if (!GIT_SHA_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase 40-character Git SHA.`); return result; }
function text(value: unknown, field: string, maximum: number): string { if (typeof value !== "string" || !value || value.trim() !== value || value.length > maximum) throw new TypeError(`${field} must be a bounded nonblank trimmed string.`); return value; }
function integer(value: unknown, field: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new TypeError(`${field} must be an integer from ${minimum} through ${maximum}.`); return Number(value); }
function nullable(value: unknown): string | null { return value == null ? null : String(value); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`; return JSON.stringify(value); }
