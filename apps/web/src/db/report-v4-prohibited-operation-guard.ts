import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import {
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH,
  lookupReportV4ProhibitedOperationManifestEntry,
  type ReportV4ProhibitedOperation,
  type ReportV4ProhibitedOperationGuardSite
} from "@/report-v4/prohibited-operation-manifest";
import { ensureDatabase, getSqlClient } from "./index";

const RUN_ID_DOMAIN = "ogc:report-v4:prohibited-operation-guard-run:v1";
const RUN_EXECUTION_LOCK_DOMAIN = "ogc:report-v4:prohibited-operation-guard-execution:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export interface ArmReportV4ProhibitedOperationGuardInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly jobId: string;
  readonly workerGitSha: string;
}

export interface ReportV4ProhibitedOperationGuardRun {
  readonly runId: string;
  readonly domain: typeof REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly jobId: string;
  readonly workerGitSha: string;
  readonly manifestHash: string;
  readonly state: "armed" | "completed";
  readonly armedAt: Date;
  readonly completedAt: Date | null;
}

export interface ReportV4ProhibitedOperationGuardCounter {
  readonly runId: string;
  readonly operation: ReportV4ProhibitedOperation;
  readonly guardSite: ReportV4ProhibitedOperationGuardSite;
  readonly attemptCount: 0 | 1;
  readonly seededAt: Date;
  readonly attemptedAt: Date | null;
}

export interface ReportV4ProhibitedOperationGuardAuthority {
  readonly run: ReportV4ProhibitedOperationGuardRun;
  readonly counters: readonly ReportV4ProhibitedOperationGuardCounter[];
}

export interface ReportV4ProhibitedOperationRecorderIdentity {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly jobId: string;
  readonly workerGitSha: string;
  readonly manifestHash: string;
  readonly operation: ReportV4ProhibitedOperation;
  readonly guardSite: ReportV4ProhibitedOperationGuardSite;
}

export interface ReportV4ProhibitedOperationAttemptResult {
  readonly previousAttemptCount: number;
  readonly attemptCount: number;
}

export interface ReportV4ProhibitedOperationEventInput extends ReportV4ProhibitedOperationRecorderIdentity {
  readonly attemptCount: 1;
}

const capabilityBrand: unique symbol = Symbol("ReportV4ProhibitedOperationGuardCapability");

export interface ReportV4ProhibitedOperationGuardCapability {
  readonly kind: "report_v4_prohibited_operation_guard_capability";
  readonly [capabilityBrand]: true;
}

interface AuthorizedCapabilityData extends ArmReportV4ProhibitedOperationGuardInput {
  readonly runId: string;
  readonly sql: postgres.Sql;
  inUse: boolean;
  completed: boolean;
}

interface ActiveGuard {
  readonly capability: ReportV4ProhibitedOperationGuardCapability;
  readonly data: AuthorizedCapabilityData;
  readonly connection: postgres.ReservedSql;
}

export class ReportV4ProhibitedOperationBlockedError extends Error {
  readonly code = "REPORT_V4_PROHIBITED_OPERATION_BLOCKED" as const;

  constructor(
    readonly operation: ReportV4ProhibitedOperation,
    readonly guardSite: ReportV4ProhibitedOperationGuardSite
  ) {
    super(`Report V4 acceptance blocked prohibited operation ${operation} at registered guard site ${guardSite}.`);
    Object.defineProperty(this, "name", { configurable: true, value: "ReportV4ProhibitedOperationBlockedError" });
  }
}

export class ReportV4ProhibitedOperationGuardContextConflictError extends Error {
  readonly code = "REPORT_V4_PROHIBITED_OPERATION_GUARD_CONTEXT_CONFLICT" as const;

  constructor() {
    super("A conflicting or completed Report V4 prohibited-operation guard capability cannot execute work.");
    Object.defineProperty(this, "name", { configurable: true, value: "ReportV4ProhibitedOperationGuardContextConflictError" });
  }
}

const storage = new AsyncLocalStorage<ActiveGuard>();
const authorizedCapabilities = new WeakMap<object, AuthorizedCapabilityData>();
const capabilitiesBySql = new WeakMap<object, Map<string, ReportV4ProhibitedOperationGuardCapability>>();

export async function armReportV4ProhibitedOperationGuard(
  value: ArmReportV4ProhibitedOperationGuardInput,
  environment: NodeJS.ProcessEnv = process.env
): Promise<ReportV4ProhibitedOperationGuardCapability> {
  assertProtectedStagingCommercePreview(environment);
  const input = parseArmInput(value);
  await ensureDatabase();
  const sql = getSqlClient();
  const runId = reportV4ProhibitedOperationGuardRunId(input);
  const authority = await armPostgresAuthority(sql, { ...input, runId });
  assertExactAuthority(authority, { ...input, runId });

  let capabilities = capabilitiesBySql.get(sql);
  if (!capabilities) {
    capabilities = new Map();
    capabilitiesBySql.set(sql, capabilities);
  }
  const replay = capabilities.get(runId);
  if (replay) return replay;

  const capability = Object.freeze({
    kind: "report_v4_prohibited_operation_guard_capability",
    [capabilityBrand]: true
  }) as ReportV4ProhibitedOperationGuardCapability;
  authorizedCapabilities.set(capability, { ...input, runId, sql, inUse: false, completed: false });
  capabilities.set(runId, capability);
  return capability;
}

export async function withReportV4ProhibitedOperationGuard<T>(
  capability: ReportV4ProhibitedOperationGuardCapability,
  work: () => T | Promise<T>
): Promise<Awaited<T>> {
  requireAuthorizedCapability(capability);
  const active = storage.getStore();
  if (active) {
    if (active.capability !== capability) throw new ReportV4ProhibitedOperationGuardContextConflictError();
    return await work();
  }

  const result = await withReportV4ProhibitedOperationGuardSegment(capability, work);
  await completeReportV4ProhibitedOperationGuard(capability);
  return result;
}

/**
 * Runs one resumable guarded segment without sealing its persisted authority.
 * Both success and failure release the process/advisory execution claim while
 * the exact all-zero run remains armed for a later segment or process.
 */
export async function withReportV4ProhibitedOperationGuardSegment<T>(
  capability: ReportV4ProhibitedOperationGuardCapability,
  work: () => T | Promise<T>
): Promise<Awaited<T>> {
  const data = requireAuthorizedCapability(capability);
  const active = storage.getStore();
  if (active) {
    if (active.capability !== capability) throw new ReportV4ProhibitedOperationGuardContextConflictError();
    return await work();
  }
  if (data.completed || data.inUse) throw new ReportV4ProhibitedOperationGuardContextConflictError();

  data.inUse = true;
  let connection: postgres.ReservedSql | undefined;
  let result: Awaited<T> | undefined;
  let failure: unknown;
  let failed = false;
  try {
    connection = await acquireExecutionClaim(data);
    result = await storage.run({ capability, data, connection }, async () => await work());
  } catch (error) {
    failed = true;
    failure = error;
  }
  if (connection) {
    try {
      await releaseExecutionClaim(connection, data.runId);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  data.inUse = false;
  if (failed) throw failure;
  return result as Awaited<T>;
}

/** Seals the exact active-process capability and persisted all-zero run once. */
export async function completeReportV4ProhibitedOperationGuard(
  capability: ReportV4ProhibitedOperationGuardCapability
): Promise<void> {
  const data = requireAuthorizedCapability(capability);
  if (storage.getStore() || data.completed || data.inUse) {
    throw new ReportV4ProhibitedOperationGuardContextConflictError();
  }

  data.inUse = true;
  let connection: postgres.ReservedSql | undefined;
  let failure: unknown;
  let failed = false;
  try {
    connection = await acquireExecutionClaim(data);
    await completePostgresAuthority(connection, data.runId);
    data.completed = true;
  } catch (error) {
    failed = true;
    failure = error;
  }
  if (connection) {
    try {
      await releaseExecutionClaim(connection, data.runId);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  data.inUse = false;
  if (failed) throw failure;
}

export async function runReportV4GuardedOperation<T>(input: {
  readonly guardSite: ReportV4ProhibitedOperationGuardSite;
  readonly delegate: () => T | Promise<T>;
}): Promise<Awaited<T>> {
  const active = storage.getStore();
  if (!active) return await input.delegate();

  const entry = lookupReportV4ProhibitedOperationManifestEntry(input.guardSite);
  const identity = Object.freeze({
    sessionId: active.data.sessionId,
    scenarioId: active.data.scenarioId,
    jobId: active.data.jobId,
    workerGitSha: active.data.workerGitSha,
    manifestHash: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH,
    operation: entry.operation,
    guardSite: input.guardSite
  });
  await runReservedTransaction(active.connection, async () => {
    const attempt = await incrementPostgresAttempt(active.connection, active.data.runId, identity);
    if (!isAuthoritativeFirstAttempt(attempt)) {
      throw new Error("The Report V4 prohibited-operation attempt did not atomically transition from zero to one.");
    }
  });
  await runReservedTransaction(active.connection, async () => {
    await appendPostgresProhibitedEvent(active.connection, identity);
  });
  throw new ReportV4ProhibitedOperationBlockedError(entry.operation, input.guardSite);
}

/** Hash-safe authority loader for the future unified acceptance projector. */
export async function loadReportV4ProhibitedOperationGuardAuthority(
  sql: postgres.Sql | postgres.TransactionSql,
  input: { readonly sessionId: string; readonly scenarioId: string; readonly jobId: string }
): Promise<ReportV4ProhibitedOperationGuardAuthority | null> {
  const parsed = parseAuthorityInput(input);
  return loadAuthorityByRunId(sql, null, parsed.sessionId, parsed.scenarioId, parsed.jobId);
}

export function reportV4ProhibitedOperationGuardRunId(input: ArmReportV4ProhibitedOperationGuardInput): string {
  const parsed = parseArmInput(input);
  return sha256([RUN_ID_DOMAIN, REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN, parsed.sessionId, parsed.scenarioId,
    parsed.jobId, parsed.workerGitSha, REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH].join("\x1f"));
}

export function reportV4ProhibitedOperationEventUnitId(
  jobId: string,
  guardSite: ReportV4ProhibitedOperationGuardSite
): string {
  return sha256(["ogc:report-v4:prohibited-operation-event-unit:v1", safeId(jobId, "jobId"), guardSite].join("\x1f"));
}

async function armPostgresAuthority(
  sql: postgres.Sql,
  input: ArmReportV4ProhibitedOperationGuardInput & { readonly runId: string }
): Promise<ReportV4ProhibitedOperationGuardAuthority> {
  return sql.begin(async (tx) => {
    const inserted = await tx`INSERT INTO report_v4_prohibited_operation_guard_runs
      (id,domain,session_id,scenario_id,job_id,worker_git_sha,manifest_hash,state)
      VALUES(${input.runId},${REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN},${input.sessionId},${input.scenarioId},${input.jobId},
        ${input.workerGitSha},${REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH},'armed')
      ON CONFLICT(session_id,scenario_id,job_id) DO NOTHING RETURNING id`;
    if (inserted.length === 1) {
      for (const { operation, guardSite } of REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES) {
        await tx`INSERT INTO report_v4_prohibited_operation_guard_counters(run_id,operation,guard_site,attempt_count)
          VALUES(${input.runId},${operation},${guardSite},0)`;
      }
    }
    const authority = await loadAuthorityByRunId(tx, input.runId, input.sessionId, input.scenarioId, input.jobId);
    if (!authority) throw new Error("The exact Report V4 prohibited-operation guard run does not exist.");
    return authority;
  });
}

async function acquireExecutionClaim(data: AuthorizedCapabilityData): Promise<postgres.ReservedSql> {
  const connection = await data.sql.reserve();
  let locked = false;
  try {
    await connection`SELECT pg_advisory_lock(hashtextextended(${executionLockKey(data.runId)},0))`;
    locked = true;
    const authority = await loadAuthorityByRunId(connection, data.runId, data.sessionId, data.scenarioId, data.jobId);
    if (!authority || authority.run.state !== "armed" || authority.run.completedAt !== null) {
      data.completed = authority?.run.state === "completed";
      throw new ReportV4ProhibitedOperationGuardContextConflictError();
    }
    assertExactAuthority(authority, data);
    return connection;
  } catch (error) {
    if (locked) {
      try { await connection`SELECT pg_advisory_unlock(hashtextextended(${executionLockKey(data.runId)},0))`; } catch { /* preserve claim failure */ }
    }
    connection.release();
    throw error;
  }
}

async function releaseExecutionClaim(connection: postgres.ReservedSql, runId: string): Promise<void> {
  try {
    const rows = await connection<{ released: boolean }[]>`
      SELECT pg_advisory_unlock(hashtextextended(${executionLockKey(runId)},0)) AS released`;
    if (rows.length !== 1 || rows[0]?.released !== true) {
      throw new Error("The Report V4 prohibited-operation execution authority lock was not released exactly once.");
    }
  } finally {
    connection.release();
  }
}

async function incrementPostgresAttempt(
  sql: postgres.ReservedSql,
  runId: string,
  identity: ReportV4ProhibitedOperationRecorderIdentity
): Promise<ReportV4ProhibitedOperationAttemptResult> {
  assertRecorderIdentity(identity);
  const rows = await sql`UPDATE report_v4_prohibited_operation_guard_counters
    SET attempt_count=1,attempted_at=clock_timestamp()
    WHERE run_id=${runId} AND operation=${identity.operation} AND guard_site=${identity.guardSite} AND attempt_count=0
    RETURNING attempt_count`;
  if (rows.length !== 1 || Number(rows[0]!.attempt_count) !== 1) {
    throw new Error("The Report V4 prohibited-operation guard counter did not atomically transition from zero to one.");
  }
  return { previousAttemptCount: 0, attemptCount: 1 };
}

async function appendPostgresProhibitedEvent(
  sql: postgres.ReservedSql,
  input: ReportV4ProhibitedOperationRecorderIdentity
): Promise<void> {
  assertRecorderIdentity(input);
  const unitId = reportV4ProhibitedOperationEventUnitId(input.jobId, input.guardSite);
  const idempotencyKey = sha256([
    input.sessionId, input.scenarioId, "prohibited_operation", input.operation, unitId, 0, "started"
  ].join("\x1f"));
  const sessions = await sql`SELECT state,head_sequence,head_hash FROM report_v4_acceptance_sessions
    WHERE id=${input.sessionId} FOR UPDATE`;
  const session = sessions[0];
  if (!session || session.state !== "collecting") {
    throw new Error("A collecting Report V4 acceptance session is required for prohibited-operation append.");
  }
  const existing = (await sql`SELECT session_id,scenario_id,kind,operation,unit_id,attempt,phase,details
    FROM report_v4_acceptance_events WHERE idempotency_key=${idempotencyKey}`)[0];
  if (existing) {
    const exact = existing.session_id === input.sessionId && existing.scenario_id === input.scenarioId
      && existing.kind === "prohibited_operation" && existing.operation === input.operation
      && existing.unit_id === unitId && Number(existing.attempt) === 0 && existing.phase === "started"
      && JSON.stringify(existing.details) === "{}";
    if (!exact) throw new Error("Report V4 prohibited-operation event idempotency payload conflict.");
    throw new Error("The Report V4 prohibited-operation event was not a new exact trip event.");
  }
  await sql`INSERT INTO report_v4_acceptance_events
    (idempotency_key,session_id,scenario_id,sequence,kind,operation,unit_id,attempt,phase,details,prev_hash,event_hash)
    VALUES(${idempotencyKey},${input.sessionId},${input.scenarioId},${Number(session.head_sequence) + 1},
      'prohibited_operation',${input.operation},${unitId},0,'started','{}'::jsonb,${String(session.head_hash)},${"0".repeat(64)})`;
}

async function runReservedTransaction<T>(
  sql: postgres.ReservedSql,
  work: () => Promise<T>
): Promise<T> {
  await sql.unsafe("BEGIN");
  try {
    const result = await work();
    await sql.unsafe("COMMIT");
    return result;
  } catch (error) {
    try {
      await sql.unsafe("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "The Report V4 prohibited-operation transaction failed and could not roll back cleanly."
      );
    }
    throw error;
  }
}

async function completePostgresAuthority(sql: postgres.ReservedSql, runId: string): Promise<void> {
  const rows = await sql`UPDATE report_v4_prohibited_operation_guard_runs
    SET state='completed',completed_at=clock_timestamp() WHERE id=${runId} AND state='armed' RETURNING id`;
  if (rows.length !== 1) throw new Error("The Report V4 prohibited-operation guard run could not complete exactly once.");
}

async function loadAuthorityByRunId(
  sql: postgres.Sql | postgres.TransactionSql,
  runId: string | null,
  sessionId: string,
  scenarioId: string,
  jobId: string
): Promise<ReportV4ProhibitedOperationGuardAuthority | null> {
  const runs = runId
    ? await sql`SELECT * FROM report_v4_prohibited_operation_guard_runs WHERE id=${runId}`
    : await sql`SELECT * FROM report_v4_prohibited_operation_guard_runs
        WHERE session_id=${sessionId} AND scenario_id=${scenarioId} AND job_id=${jobId}`;
  if (runs.length === 0) {
    if (runId === null) return null;
    throw new Error("The exact Report V4 prohibited-operation guard run does not exist.");
  }
  if (runs.length !== 1) throw new Error("The Report V4 prohibited-operation guard authority is ambiguous.");
  const run = mapRun(runs[0]!);
  const counters = (await sql`SELECT * FROM report_v4_prohibited_operation_guard_counters
    WHERE run_id=${run.runId} ORDER BY guard_site`).map(mapCounter);
  return Object.freeze({ run, counters: Object.freeze(counters) });
}

function assertExactAuthority(
  authority: ReportV4ProhibitedOperationGuardAuthority,
  expected: ArmReportV4ProhibitedOperationGuardInput & { runId: string }
): void {
  const run = authority?.run;
  if (!run || run.runId !== expected.runId || run.domain !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN
      || run.sessionId !== expected.sessionId || run.scenarioId !== expected.scenarioId || run.jobId !== expected.jobId
      || run.workerGitSha !== expected.workerGitSha || run.manifestHash !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH
      || run.state !== "armed" || run.completedAt !== null) {
    throw new Error("Report V4 prohibited-operation guard arming conflicts with another exact authority identity.");
  }
  const expectedPairs = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES
    .map(({ operation, guardSite }) => `${guardSite}\x1f${operation}`).sort();
  const actualPairs = authority.counters.map(({ runId, operation, guardSite, attemptCount, attemptedAt }) => {
    if (runId !== expected.runId || attemptCount !== 0 || attemptedAt !== null) {
      throw new Error("A Report V4 prohibited-operation guard seed is not an exact zero counter.");
    }
    return `${guardSite}\x1f${operation}`;
  }).sort();
  if (actualPairs.length !== 15 || new Set(actualPairs).size !== 15 || actualPairs.some((pair, index) => pair !== expectedPairs[index])) {
    throw new Error("A Report V4 prohibited-operation guard requires exactly the fifteen canonical seeded counters.");
  }
}

function assertRecorderIdentity(identity: ReportV4ProhibitedOperationRecorderIdentity): void {
  if (identity.manifestHash !== REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH) {
    throw new Error("The Report V4 prohibited-operation recorder identity does not match its armed DB authority.");
  }
  const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find(({ guardSite }) => guardSite === identity.guardSite);
  if (!entry || entry.operation !== identity.operation) throw new Error("The Report V4 prohibited-operation recorder pair is not canonical.");
}

function requireAuthorizedCapability(
  capability: ReportV4ProhibitedOperationGuardCapability
): AuthorizedCapabilityData {
  const data = capability && typeof capability === "object" ? authorizedCapabilities.get(capability) : undefined;
  if (!data) throw new TypeError("A DB-authorized Report V4 prohibited-operation guard capability is required.");
  return data;
}

function isAuthoritativeFirstAttempt(value: unknown): value is ReportV4ProhibitedOperationAttemptResult {
  return isPlainObject(value) && hasExactKeys(value, ["attemptCount", "previousAttemptCount"])
    && value.previousAttemptCount === 0 && value.attemptCount === 1;
}

function parseArmInput(value: unknown): ArmReportV4ProhibitedOperationGuardInput {
  const input = strictRecord(value, ["jobId", "scenarioId", "sessionId", "workerGitSha"], "guard arming");
  const sessionId = uuid(input.sessionId, "sessionId");
  const scenarioId = uuid(input.scenarioId, "scenarioId");
  const jobId = safeId(input.jobId, "jobId");
  if (typeof input.workerGitSha !== "string" || !GIT_SHA_PATTERN.test(input.workerGitSha)) {
    throw new TypeError("workerGitSha must be a lowercase full Git SHA.");
  }
  return { sessionId, scenarioId, jobId, workerGitSha: input.workerGitSha };
}

function parseAuthorityInput(value: unknown): { sessionId: string; scenarioId: string; jobId: string } {
  const input = strictRecord(value, ["jobId", "scenarioId", "sessionId"], "guard authority lookup");
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"), jobId: safeId(input.jobId, "jobId") };
}

function mapRun(row: Record<string, unknown>): ReportV4ProhibitedOperationGuardRun {
  return Object.freeze({ runId: String(row.id), domain: String(row.domain) as typeof REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
    sessionId: String(row.session_id), scenarioId: String(row.scenario_id), jobId: String(row.job_id),
    workerGitSha: String(row.worker_git_sha), manifestHash: String(row.manifest_hash),
    state: String(row.state) as "armed" | "completed", armedAt: new Date(String(row.armed_at)),
    completedAt: row.completed_at == null ? null : new Date(String(row.completed_at)) });
}

function mapCounter(row: Record<string, unknown>): ReportV4ProhibitedOperationGuardCounter {
  return Object.freeze({ runId: String(row.run_id), operation: String(row.operation) as ReportV4ProhibitedOperation,
    guardSite: String(row.guard_site) as ReportV4ProhibitedOperationGuardSite, attemptCount: Number(row.attempt_count) as 0 | 1,
    seededAt: new Date(String(row.seeded_at)), attemptedAt: row.attempted_at == null ? null : new Date(String(row.attempted_at)) });
}

function strictRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)) || fields.some((field) => !(field in input))) {
    throw new TypeError(`${label} fields must match the strict contract.`);
  }
  return input;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError(`${field} must be a lowercase UUID.`);
  return value;
}

function safeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value)) {
    throw new TypeError(`${field} must be a hash-safe identifier.`);
  }
  return value;
}

function executionLockKey(runId: string): string { return `${RUN_EXECUTION_LOCK_DOMAIN}:${runId}`; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
