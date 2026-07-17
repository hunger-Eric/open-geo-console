import { createHash } from "node:crypto";
import {
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH,
  type ReportV4ProhibitedOperation,
  type ReportV4ProhibitedOperationGuardSite
} from "@/report-v4/prohibited-operation-manifest";
import {
  reportV4ProhibitedOperationEventUnitId,
  reportV4ProhibitedOperationGuardRunId
} from "./report-v4-prohibited-operation-guard";

type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const ZERO_HASH = "0".repeat(64);
const LEDGER_DOMAIN = "open-geo-console/report-v4/acceptance-ledger-authority/v1";
const GUARD_DOMAIN = "open-geo-console/report-v4/prohibited-operation-guard-authority/v1";

export interface ReportV4AcceptanceLedgerGuardAuthorityTransactionSql {
  unsafe<T extends Row[] = Row[]>(query: string, parameters?: unknown[]): Promise<T>;
}

export interface ReportV4AcceptanceLedgerGuardAuthoritySql {
  begin<T>(
    options: string,
    work: (tx: ReportV4AcceptanceLedgerGuardAuthorityTransactionSql) => Promise<T>
  ): Promise<T>;
}

export interface LoadReportV4AcceptanceLedgerGuardAuthorityInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}

export interface ReportV4AcceptanceLedgerGuardRawSnapshot {
  session: Row;
  scenario: Row;
  events: Row[];
  guardRuns: Row[];
  guardCounters: Row[];
}

export interface ReportV4AcceptanceLedgerAuthorityEventRecord {
  readonly sequence: number;
  readonly fingerprint: string;
  readonly scenarioIdHash: string;
  readonly kind: string;
  readonly operation: string;
  readonly unitIdHash: string;
  readonly attempt: 0 | 1 | 2;
  readonly eventPhase: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly previousHash: string;
  readonly eventHash: string;
  readonly occurredAt: string;
}

export interface ReportV4AcceptanceLedgerAuthority {
  readonly contractVersion: "report-v4-acceptance-ledger-authority-v1";
  readonly phase: "baseline" | "final";
  readonly session: Readonly<{
    sessionIdHash: string;
    previewDeploymentIdHash: string;
    protectedAliasUrlHash: string;
    webGitSha: string;
    workerGitSha: string;
    state: "collecting";
    headSequence: number;
    headHash: string;
    eventCount: number;
    startedAt: string;
  }>;
  readonly scenario: Readonly<Record<string, unknown>>;
  readonly events: readonly ReportV4AcceptanceLedgerAuthorityEventRecord[];
  readonly canonicalHash: string;
}

export interface ReportV4ProhibitedOperationGuardAuthorityRecord {
  readonly contractVersion: "report-v4-prohibited-operation-guard-authority-v1";
  readonly phase: "baseline" | "final";
  readonly run: Readonly<{
    runId: string;
    sessionIdHash: string;
    scenarioIdHash: string;
    jobIdHash: string;
    workerGitSha: string;
    manifestHash: string;
    state: "armed" | "completed";
    armedAt: string;
    completedAt: string | null;
  }>;
  readonly counters: readonly Readonly<{
    operation: ReportV4ProhibitedOperation;
    guardSite: ReportV4ProhibitedOperationGuardSite;
    attemptCount: 0 | 1;
    seededAt: string;
    attemptedAt: string | null;
    matchingEventFingerprint: string | null;
  }>[];
  readonly canonicalHash: string;
}

export interface ReportV4AcceptanceLedgerGuardAuthority {
  readonly ledgerAuthority: ReportV4AcceptanceLedgerAuthority;
  readonly prohibitedOperationGuardAuthority: ReportV4ProhibitedOperationGuardAuthorityRecord;
}

/** Public standalone reader: exactly one repeatable-read, read-only transaction. */
export async function loadReportV4AcceptanceLedgerGuardAuthority(
  sql: ReportV4AcceptanceLedgerGuardAuthoritySql,
  input: LoadReportV4AcceptanceLedgerGuardAuthorityInput
): Promise<ReportV4AcceptanceLedgerGuardAuthority> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", (tx) =>
    loadReportV4AcceptanceLedgerGuardAuthorityInTransaction(tx, parsed));
}

/** Transaction-scoped reader for the future unified phase projector. */
export async function loadReportV4AcceptanceLedgerGuardAuthorityInTransaction(
  tx: ReportV4AcceptanceLedgerGuardAuthorityTransactionSql,
  input: LoadReportV4AcceptanceLedgerGuardAuthorityInput
): Promise<ReportV4AcceptanceLedgerGuardAuthority> {
  const parsed = parseInput(input);
  const isolation = await tx.unsafe(`/* ledger-guard-authority:isolation */
    SELECT current_setting('transaction_isolation') transaction_isolation,
      current_setting('transaction_read_only') transaction_read_only`);
  if (isolation.length !== 1 || isolation[0]?.transaction_isolation !== "repeatable read"
      || isolation[0]?.transaction_read_only !== "on") {
    throw new Error("Report V4 ledger/guard authority requires one repeatable-read read-only transaction.");
  }
  const sessions = await tx.unsafe(`/* ledger-guard-authority:session */
    SELECT id,environment,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha,state,
      head_sequence,head_hash,event_count,started_at,terminal_at
    FROM report_v4_acceptance_sessions WHERE id=$1`, [parsed.sessionId]);
  const scenarios = await tx.unsafe(`/* ledger-guard-authority:scenario */
    SELECT id,session_id,report_id,order_id,pre_admission_job_id,core_job_id,enhancement_job_id,
      site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id,enhancement_artifact_revision_id,
      kind,fault_kind,fault_question_id,fault_source_id,expected_fault_occurrences,baseline_fingerprint,
      final_fingerprint,state,created_at,terminal_at
    FROM report_v4_acceptance_scenarios WHERE session_id=$1 AND id=$2`, [parsed.sessionId, parsed.scenarioId]);
  const events = await tx.unsafe(`/* ledger-guard-authority:events */
    SELECT idempotency_key,session_id,scenario_id,sequence,kind,operation,unit_id,attempt,phase,details,
      details_canonical,details::text recomputed_details_canonical,prev_hash,event_hash,occurred_at,
      occurred_at_canonical,
      to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') recomputed_occurred_at_canonical
    FROM report_v4_acceptance_events WHERE session_id=$1 ORDER BY sequence`, [parsed.sessionId]);
  const guardRuns = await tx.unsafe(`/* ledger-guard-authority:guard-runs */
    SELECT id,domain,session_id,scenario_id,job_id,worker_git_sha,manifest_hash,state,armed_at,completed_at
    FROM report_v4_prohibited_operation_guard_runs WHERE session_id=$1 AND scenario_id=$2`,
  [parsed.sessionId, parsed.scenarioId]);
  const guardCounters = await tx.unsafe(`/* ledger-guard-authority:guard-counters */
    SELECT counters.run_id,counters.operation,counters.guard_site,counters.attempt_count,
      counters.seeded_at,counters.attempted_at
    FROM report_v4_prohibited_operation_guard_counters counters
    JOIN report_v4_prohibited_operation_guard_runs runs ON runs.id=counters.run_id
    WHERE runs.session_id=$1 AND runs.scenario_id=$2 ORDER BY counters.guard_site`,
  [parsed.sessionId, parsed.scenarioId]);
  return projectReportV4AcceptanceLedgerGuardAuthority(parsed, {
    session: exactlyOne(sessions, "session"),
    scenario: exactlyOne(scenarios, "scenario"),
    events,
    guardRuns,
    guardCounters
  });
}

export function projectReportV4AcceptanceLedgerGuardAuthority(
  input: LoadReportV4AcceptanceLedgerGuardAuthorityInput,
  raw: ReportV4AcceptanceLedgerGuardRawSnapshot
): ReportV4AcceptanceLedgerGuardAuthority {
  const parsed = parseInput(input);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Ledger/guard raw snapshot is invalid.");
  const session = projectSession(parsed, raw.session);
  const scenario = projectScenario(parsed, raw.scenario);
  const events = projectEvents(parsed, session, raw.events);
  const ledgerWithoutHash = {
    contractVersion: "report-v4-acceptance-ledger-authority-v1" as const,
    phase: parsed.phase,
    session,
    scenario,
    events
  };
  const ledgerAuthority = Object.freeze({
    ...ledgerWithoutHash,
    canonicalHash: digest(`${LEDGER_DOMAIN}\x1f${stableJson(ledgerWithoutHash)}`)
  });
  const prohibitedOperationGuardAuthority = projectGuard(parsed, raw, session.workerGitSha, events);
  return Object.freeze({ ledgerAuthority, prohibitedOperationGuardAuthority });
}

function projectSession(input: LoadReportV4AcceptanceLedgerGuardAuthorityInput, row: Row): ReportV4AcceptanceLedgerAuthority["session"] {
  exactKeys(row, ["id", "environment", "preview_deployment_id", "protected_alias_url", "web_git_sha", "worker_git_sha",
    "state", "head_sequence", "head_hash", "event_count", "started_at", "terminal_at"], "session row");
  if (uuid(row.id, "session id") !== input.sessionId || row.environment !== "protected_staging"
      || row.state !== "collecting" || row.terminal_at !== null) {
    throw new Error("Ledger authority requires the exact collecting protected-Staging session.");
  }
  const webGitSha = gitSha(row.web_git_sha, "web Git SHA");
  const workerGitSha = gitSha(row.worker_git_sha, "worker Git SHA");
  if (webGitSha !== workerGitSha) throw new Error("Ledger authority deployment Git SHAs disagree.");
  return Object.freeze({
    sessionIdHash: digest(input.sessionId),
    previewDeploymentIdHash: digest(text(row.preview_deployment_id, "preview deployment id")),
    protectedAliasUrlHash: digest(text(row.protected_alias_url, "protected alias URL")),
    webGitSha,
    workerGitSha,
    state: "collecting" as const,
    headSequence: nonnegative(row.head_sequence, "head sequence"),
    headHash: hash(row.head_hash, "head hash"),
    eventCount: nonnegative(row.event_count, "event count"),
    startedAt: instant(row.started_at, "session started at")
  });
}

function projectScenario(input: LoadReportV4AcceptanceLedgerGuardAuthorityInput, row: Row): Readonly<Record<string, unknown>> {
  exactKeys(row, ["id", "session_id", "report_id", "order_id", "pre_admission_job_id", "core_job_id",
    "enhancement_job_id", "site_snapshot_id", "config_snapshot_id", "question_set_id", "core_artifact_revision_id",
    "enhancement_artifact_revision_id", "kind", "fault_kind", "fault_question_id", "fault_source_id",
    "expected_fault_occurrences", "baseline_fingerprint", "final_fingerprint", "state", "created_at", "terminal_at"], "scenario row");
  if (uuid(row.id, "scenario id") !== input.scenarioId || uuid(row.session_id, "scenario session id") !== input.sessionId
      || row.state !== "collecting" || row.terminal_at !== null) {
    throw new Error("Ledger authority requires the exact collecting scenario.");
  }
  const kind = enumValue(row.kind, ["success", "diagnosis_failure", "question_failure"], "scenario kind");
  const faultKind = enumValue(row.fault_kind,
    ["independent_source_read_failure", "diagnosis_failure", "question_failure"], "scenario fault kind");
  const expectedFaultOccurrences = integer(row.expected_fault_occurrences, "expected fault occurrences", 1, 2);
  if ((kind === "success" && (faultKind !== "independent_source_read_failure" || expectedFaultOccurrences !== 1))
      || (kind !== "success" && (faultKind !== kind || expectedFaultOccurrences !== 2))) {
    throw new Error("Ledger authority scenario fault identity is non-canonical.");
  }
  const idHash = (value: unknown, label: string) => value === null ? null : digest(text(value, label));
  return Object.freeze({
    scenarioIdHash: digest(input.scenarioId),
    reportIdHash: idHash(row.report_id, "report id"),
    orderIdHash: idHash(row.order_id, "order id"),
    preAdmissionJobIdHash: idHash(row.pre_admission_job_id, "pre-admission job id"),
    coreJobIdHash: idHash(row.core_job_id, "core job id"),
    enhancementJobIdHash: idHash(row.enhancement_job_id, "enhancement job id"),
    siteSnapshotIdHash: idHash(row.site_snapshot_id, "site snapshot id"),
    configSnapshotIdHash: idHash(row.config_snapshot_id, "config snapshot id"),
    questionSetIdHash: idHash(row.question_set_id, "question set id"),
    coreArtifactRevisionIdHash: idHash(row.core_artifact_revision_id, "core artifact revision id"),
    enhancementArtifactRevisionIdHash: idHash(row.enhancement_artifact_revision_id, "enhancement artifact revision id"),
    kind,
    faultKind,
    faultQuestionIdHash: digest(text(row.fault_question_id, "fault question id")),
    faultSourceIdHash: idHash(row.fault_source_id, "fault source id"),
    expectedFaultOccurrences,
    baselineFingerprint: nullableHash(row.baseline_fingerprint, "baseline fingerprint"),
    finalFingerprint: nullableHash(row.final_fingerprint, "final fingerprint"),
    state: "collecting",
    createdAt: instant(row.created_at, "scenario created at")
  });
}

function projectEvents(
  input: LoadReportV4AcceptanceLedgerGuardAuthorityInput,
  session: ReportV4AcceptanceLedgerAuthority["session"],
  rawEvents: Row[]
): readonly ReportV4AcceptanceLedgerAuthorityEventRecord[] {
  if (!Array.isArray(rawEvents)) throw new TypeError("Ledger events must be a complete array.");
  let previousHash = ZERO_HASH;
  const fingerprints = new Set<string>();
  const events = rawEvents.map((row, index) => {
    exactKeys(row, ["idempotency_key", "session_id", "scenario_id", "sequence", "kind", "operation", "unit_id",
      "attempt", "phase", "details", "details_canonical", "recomputed_details_canonical", "prev_hash", "event_hash",
      "occurred_at", "occurred_at_canonical", "recomputed_occurred_at_canonical"], `event row ${index}`);
    if (uuid(row.session_id, "event session id") !== input.sessionId) throw new Error("Ledger event crosses its exact session.");
    const eventScenarioId = uuid(row.scenario_id, "event scenario id");
    const sequence = positive(row.sequence, "event sequence");
    if (sequence !== index + 1) throw new Error("Ledger event sequence contains a gap or duplicate.");
    const kind = text(row.kind, "event kind");
    const operation = text(row.operation, "event operation");
    const unitId = text(row.unit_id, "event unit id");
    const attempt = integer(row.attempt, "event attempt", 0, 2) as 0 | 1 | 2;
    const eventPhase = text(row.phase, "event phase");
    const details = validateDetails(kind, operation, attempt, eventPhase, row.details);
    const detailsCanonical = text(row.details_canonical, "event details canonical");
    if (detailsCanonical !== row.recomputed_details_canonical
        || stableJson(JSON.parse(detailsCanonical)) !== stableJson(row.details)) {
      throw new Error("Ledger event details canonical form does not exactly match its JSON payload.");
    }
    const occurredAtCanonical = text(row.occurred_at_canonical, "event occurred-at canonical");
    if (occurredAtCanonical !== row.recomputed_occurred_at_canonical) {
      throw new Error("Ledger event occurred-at canonical form is invalid.");
    }
    const fingerprint = hash(row.idempotency_key, "event fingerprint");
    const expectedFingerprint = digest([input.sessionId, eventScenarioId, kind, operation, unitId, attempt, eventPhase].join("\x1f"));
    if (fingerprint !== expectedFingerprint || fingerprints.has(fingerprint)) {
      throw new Error("Ledger event fingerprint/idempotency identity is invalid or duplicated.");
    }
    fingerprints.add(fingerprint);
    if (hash(row.prev_hash, "event previous hash") !== previousHash) {
      throw new Error("Ledger event previous hash does not extend the exact chain.");
    }
    const eventHash = hash(row.event_hash, "event hash");
    const expectedEventHash = digest([previousHash, fingerprint, sequence, kind, operation, unitId, attempt,
      eventPhase, detailsCanonical, occurredAtCanonical].join("\x1f"));
    if (eventHash !== expectedEventHash) throw new Error("Ledger event hash does not match the real event formula.");
    previousHash = eventHash;
    return Object.freeze({
      sequence,
      fingerprint,
      scenarioIdHash: digest(eventScenarioId),
      kind,
      operation,
      unitIdHash: digest(unitId),
      attempt,
      eventPhase,
      details: Object.freeze(hashSafeDetails(kind, details)),
      previousHash: String(row.prev_hash),
      eventHash,
      occurredAt: instant(row.occurred_at, "event occurred at")
    });
  });
  if (session.headSequence !== events.length || session.eventCount !== events.length) {
    throw new Error("Ledger session eventCount/headSequence must equal the exact event row count.");
  }
  if (session.headHash !== (events.at(-1)?.eventHash ?? ZERO_HASH)) {
    throw new Error("Ledger session head hash does not equal the final event hash.");
  }
  return Object.freeze(events);
}

function projectGuard(
  input: LoadReportV4AcceptanceLedgerGuardAuthorityInput,
  raw: ReportV4AcceptanceLedgerGuardRawSnapshot,
  expectedWorkerGitSha: string,
  events: readonly ReportV4AcceptanceLedgerAuthorityEventRecord[]
): ReportV4ProhibitedOperationGuardAuthorityRecord {
  const runRow = exactlyOne(raw.guardRuns, "prohibited-operation guard run");
  exactKeys(runRow, ["id", "domain", "session_id", "scenario_id", "job_id", "worker_git_sha", "manifest_hash",
    "state", "armed_at", "completed_at"], "guard run row");
  if (runRow.domain !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN
      || uuid(runRow.session_id, "guard run session id") !== input.sessionId
      || uuid(runRow.scenario_id, "guard run scenario id") !== input.scenarioId) {
    throw new Error("Guard authority run does not match the exact session/scenario binding.");
  }
  const jobId = text(runRow.job_id, "guard job id");
  const ownedJobs = [raw.scenario.pre_admission_job_id, raw.scenario.core_job_id, raw.scenario.enhancement_job_id];
  if (!ownedJobs.includes(jobId)) throw new Error("Guard authority job is not owned by the exact scenario.");
  const workerGitSha = gitSha(runRow.worker_git_sha, "guard worker Git SHA");
  if (workerGitSha !== expectedWorkerGitSha) throw new Error("Guard authority worker Git SHA disagrees with the session.");
  if (runRow.manifest_hash !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH) {
    throw new Error("Guard authority manifest hash is not the fixed compiled manifest.");
  }
  const runId = hash(runRow.id, "guard run id");
  const expectedRunId = reportV4ProhibitedOperationGuardRunId({ sessionId: input.sessionId,
    scenarioId: input.scenarioId, jobId, workerGitSha });
  if (runId !== expectedRunId) throw new Error("Guard run identity is not deterministic.");
  const state = enumValue(runRow.state, ["armed", "completed"], "guard state") as "armed" | "completed";
  const armedAt = instant(runRow.armed_at, "guard armed at");
  const completedAt = runRow.completed_at === null ? null : instant(runRow.completed_at, "guard completed at");
  if ((state === "armed" && completedAt !== null) || (state === "completed" && completedAt === null)) {
    throw new Error("Guard run state/timestamp topology is invalid.");
  }

  if (!Array.isArray(raw.guardCounters) || raw.guardCounters.length !== 15) {
    throw new Error("Guard authority requires exactly fifteen canonical counters.");
  }
  const targetScenarioHash = digest(input.scenarioId);
  const prohibitedEvents = events.filter((event) => event.scenarioIdHash === targetScenarioHash
    && event.kind === "prohibited_operation");
  const unmatched = new Set(prohibitedEvents.map(({ fingerprint }) => fingerprint));
  const seenSites = new Set<string>();
  const counters = raw.guardCounters.map((row, index) => {
    exactKeys(row, ["run_id", "operation", "guard_site", "attempt_count", "seeded_at", "attempted_at"], `guard counter row ${index}`);
    if (row.run_id !== runId) throw new Error("Guard counter belongs to a different run.");
    const guardSite = text(row.guard_site, "guard site") as ReportV4ProhibitedOperationGuardSite;
    const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find((candidate) => candidate.guardSite === guardSite);
    if (!entry || entry.operation !== row.operation || seenSites.has(guardSite)) {
      throw new Error("Guard counter operation/site mapping is non-canonical or duplicated.");
    }
    seenSites.add(guardSite);
    const operation = entry.operation;
    const attemptCount = integer(row.attempt_count, "guard attempt count", 0, 1) as 0 | 1;
    const seededAt = instant(row.seeded_at, "guard counter seeded at");
    const attemptedAt = row.attempted_at === null ? null : instant(row.attempted_at, "guard counter attempted at");
    if ((attemptCount === 0 && attemptedAt !== null) || (attemptCount === 1 && attemptedAt === null)) {
      throw new Error("Guard counter attempt/timestamp topology is invalid.");
    }
    const expectedUnitHash = digest(reportV4ProhibitedOperationEventUnitId(jobId, guardSite));
    const matches = prohibitedEvents.filter((event) => event.operation === operation && event.unitIdHash === expectedUnitHash
      && event.attempt === 0 && event.eventPhase === "started" && Object.keys(event.details).length === 0);
    if ((attemptCount === 1 && matches.length !== 1) || (attemptCount === 0 && matches.length !== 0)) {
      throw new Error(`Guard counter ${attemptCount} has no exact matching prohibited ledger event topology.`);
    }
    const matchingEventFingerprint = matches[0]?.fingerprint ?? null;
    if (matchingEventFingerprint) unmatched.delete(matchingEventFingerprint);
    return Object.freeze({ operation, guardSite, attemptCount, seededAt, attemptedAt, matchingEventFingerprint });
  }).sort((left, right) => left.guardSite.localeCompare(right.guardSite));
  if (seenSites.size !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.length || unmatched.size !== 0) {
    throw new Error("Guard authority contains an unmatched prohibited ledger event or non-canonical counter set.");
  }
  const nonzero = counters.filter(({ attemptCount }) => attemptCount !== 0).length;
  if (state === "completed" && nonzero !== 0) throw new Error("A completed guard authority cannot contain a nonzero counter.");
  if (input.phase === "baseline" && (state !== "armed" || nonzero !== 0)) {
    throw new Error("Guard baseline authority requires an armed run with all zero counters.");
  }
  if (input.phase === "final" && (state !== "completed" || nonzero !== 0)) {
    throw new Error("Guard final authority requires a completed run with all zero counters.");
  }
  const run = Object.freeze({ runId, sessionIdHash: digest(input.sessionId), scenarioIdHash: digest(input.scenarioId),
    jobIdHash: digest(jobId), workerGitSha, manifestHash: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH,
    state, armedAt, completedAt });
  const withoutHash = { contractVersion: "report-v4-prohibited-operation-guard-authority-v1" as const,
    phase: input.phase, run, counters: Object.freeze(counters) };
  return Object.freeze({ ...withoutHash, canonicalHash: digest(`${GUARD_DOMAIN}\x1f${stableJson(withoutHash)}`) });
}

function validateDetails(kind: string, operation: string, attempt: number, phase: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Event details must be an exact object.");
  const details = value as Row;
  const keys = (expected: readonly string[]) => exactKeys(details, expected, `${kind} details`);
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) throw new Error("Event attempt is invalid.");
  if (kind === "scenario_bound" && operation === "v4_dispatch" && attempt === 0 && phase === "observed") {
    keys(["bindingHash"]); hash(details.bindingHash, "binding hash"); return details;
  }
  if (kind === "crawl_run" && operation === "crawl" && ["started", "completed", "failed"].includes(phase)) {
    keys(["candidatePages", "analyzablePages", "excludedPages", "jsDependentPages"]);
    for (const field of Object.keys(details)) nonnegative(details[field], field);
    return details;
  }
  if (kind === "site_read" && ["site_raw_read", "site_browser_read"].includes(operation)
      && ["started", "completed", "failed"].includes(phase)) {
    keys(["urlHash", "readMode", "networkPerformed"]); hash(details.urlHash, "site read URL hash");
    if (![("raw"), "browser"].includes(String(details.readMode)) || typeof details.networkPerformed !== "boolean") {
      throw new Error("site_read details are invalid.");
    }
    return details;
  }
  if (kind === "model_operation" && ["page_analysis", "website_synthesis", "question_answer", "source_diagnosis"].includes(operation)
      && ["started", "completed", "failed", "rejected"].includes(phase)) {
    keys(["providerCall", "retry", "budgetOutcome", "inputTokens", "outputTokens"]);
    if (typeof details.providerCall !== "boolean" || typeof details.retry !== "boolean"
        || !["allowed", "rejected"].includes(String(details.budgetOutcome))) throw new Error("model_operation details are invalid.");
    nonnegative(details.inputTokens, "input tokens"); nonnegative(details.outputTokens, "output tokens"); return details;
  }
  if ((kind === "html_assembly" && ["core_html", "enhancement_html"].includes(operation)
      && ["started", "completed", "failed"].includes(phase))
      || (kind === "artifact_activation" && operation === "artifact_activation" && attempt === 0 && phase === "observed")) {
    keys(["artifactRevisionId", "htmlSha256"]); text(details.artifactRevisionId, "artifact revision id");
    hash(details.htmlSha256, "HTML SHA-256"); return details;
  }
  if (kind === "fault_injection" && ["question_failure", "diagnosis_failure", "independent_source_read_failure"].includes(operation)
      && phase === "consumed") {
    keys(["fault", "occurrence", "baselineFingerprint"]);
    if (details.fault !== operation || ![1, 2].includes(Number(details.occurrence))) throw new Error("fault_injection details are invalid.");
    hash(details.baselineFingerprint, "fault baseline fingerprint"); return details;
  }
  if (kind === "checkpoint_terminal" && ["question_answer", "source_diagnosis"].includes(operation)
      && attempt === 0 && phase === "observed") {
    keys(["checkpointHash", "state"]); hash(details.checkpointHash, "checkpoint hash");
    if (!["answered", "unavailable", "completed", "failed"].includes(String(details.state))) throw new Error("checkpoint details are invalid.");
    return details;
  }
  if ((kind === "v4_dispatch" && operation === "v4_dispatch" && attempt === 0 && phase === "observed")
      || (kind === "prohibited_operation" && ["pdf", "provider_claim", "qualification", "four_snapshot",
        "replacement_fulfillment", "correction", "full_report_rerun", "legacy_mutation"].includes(operation)
        && attempt === 0 && phase === "started")) {
    keys([]); return details;
  }
  if (kind === "commerce_fingerprint" && operation === "commerce" && attempt === 0 && phase === "observed") {
    keys(["fingerprint"]); hash(details.fingerprint, "commerce fingerprint"); return details;
  }
  throw new Error("Event kind, operation, attempt, phase, and details shape are non-canonical.");
}

function hashSafeDetails(kind: string, details: Row): Record<string, unknown> {
  if (kind === "html_assembly" || kind === "artifact_activation") {
    return { artifactRevisionIdHash: digest(String(details.artifactRevisionId)), htmlSha256: details.htmlSha256 };
  }
  return { ...details };
}

function parseInput(value: LoadReportV4AcceptanceLedgerGuardAuthorityInput): LoadReportV4AcceptanceLedgerGuardAuthorityInput {
  exactKeys(value as unknown as Row, ["sessionId", "scenarioId", "phase"], "ledger/guard authority input");
  const phase = enumValue(value.phase, ["baseline", "final"], "authority phase") as "baseline" | "final";
  return { sessionId: uuid(value.sessionId, "session id"), scenarioId: uuid(value.scenarioId, "scenario id"), phase };
}

function exactlyOne(rows: Row[], label: string): Row {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Ledger/guard authority requires exactly one ${label} row.`);
  return rows[0]!;
}

function exactKeys(value: Row, expected: readonly string[], label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an exact object.`);
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are incomplete or non-canonical.`);
  }
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > 8_192) throw new Error(`${label} is invalid.`);
  return value;
}

function uuid(value: unknown, label: string): string { const candidate = text(value, label); if (!UUID.test(candidate)) throw new Error(`${label} is not a lowercase UUID.`); return candidate; }
function hash(value: unknown, label: string): string { const candidate = text(value, label); if (!HASH.test(candidate)) throw new Error(`${label} is not a SHA-256 hash.`); return candidate; }
function gitSha(value: unknown, label: string): string { const candidate = text(value, label); if (!GIT_SHA.test(candidate)) throw new Error(`${label} is not a full lowercase Git SHA.`); return candidate; }
function nullableHash(value: unknown, label: string): string | null { return value === null ? null : hash(value, label); }
function integer(value: unknown, label: string, minimum: number, maximum: number): number { const candidate = Number(value); if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error(`${label} is invalid.`); return candidate; }
function nonnegative(value: unknown, label: string): number { return integer(value, label, 0, Number.MAX_SAFE_INTEGER); }
function positive(value: unknown, label: string): number { return integer(value, label, 1, Number.MAX_SAFE_INTEGER); }
function instant(value: unknown, label: string): string { const date = value instanceof Date ? value : new Date(text(value, label)); if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid.`); return date.toISOString(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  throw new Error("Authority canonical payload contains an unsupported value.");
}
