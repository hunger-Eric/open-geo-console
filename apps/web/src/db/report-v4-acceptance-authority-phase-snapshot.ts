import { createHash } from "node:crypto";
import { fingerprintNormalizedReportV4CommerceAuthority } from "../report-v4/report-v4-commerce-authority-fingerprint";
import {
  loadReportV4CommerceAuthoritySnapshotInTransaction,
  type LoadReportV4CommerceAuthoritySnapshotInput,
  type ReportV4CommerceAuthoritySnapshot,
  type ReportV4CommerceAuthoritySnapshotSql,
  type ReportV4CommerceAuthoritySnapshotTransactionSql
} from "./report-v4-commerce-authority-snapshot";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const COMPLETE_PHASE_CONTRACT = "report-v4-acceptance-authority-phase-v1" as const;
const COMPLETE_AUTHORITY_SLOT_NAMES = [
  "site_snapshot_pages",
  "page_summary_integrity",
  "artifact_combined_payload_integrity",
  "site_read_manifest",
  "ledger_authority",
  "prohibited_operation_guard_authority",
  "zero_database_effect_counts"
] as const;

export const REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS = Object.freeze([
  "site_snapshot_pages",
  "page_summary_integrity",
  "artifact_combined_payload_integrity",
  "site_read_manifest",
  "ledger_authority",
  "prohibited_operation_guard_authority",
  "zero_database_effect_counts"
] as const);

/** Runtime-observed evidence is intentionally outside the database phase projection. */
export const REPORT_V4_ACCEPTANCE_RUNTIME_ONLY_REQUIRED_SLOTS = Object.freeze([
  "oversized_token_probe",
  "physical_provider_call_counts",
  "pdf_invocation_count"
] as const);

export type ReportV4AcceptanceAuthorityUnavailableSlot =
  | typeof REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS[number]
  | "website_checkpoint_v38_hashes";

export interface ReportV4AcceptanceWebsiteCheckpointV38Authority {
  readonly state: "completed";
  readonly providerCallCount: 1;
  readonly correctionCount: 0;
  readonly pageSummaryCount: number;
  readonly identityHash: string;
  readonly inputIdentityHash: string;
  readonly pageSummaryIdentitySetHash: string;
  readonly outputHash: string;
}

export interface ReportV4AcceptanceAuthorityPhaseFoundation {
  readonly phase: "baseline" | "final";
  readonly capturedAt: string;
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly session: Readonly<{
    sessionIdHash: string;
    scenarioIdHash: string;
    sessionState: "collecting" | "sealed" | "failed";
    scenarioState: "collecting" | "sealed" | "failed";
    headSequence: number;
    headHash: string;
    eventCount: number;
  }>;
  readonly commerce: ReportV4CommerceAuthoritySnapshot;
  readonly paidAt: string;
  readonly websiteCheckpoint: ReportV4AcceptanceWebsiteCheckpointV38Authority | null;
  readonly foundationHash: string;
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
}

export interface PersistReportV4AcceptanceAuthorityPhaseSnapshotInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
  readonly workerGitSha: string;
  readonly payload: unknown;
}

export interface ReportV4AcceptanceAuthorityPhaseSnapshotDependencies {
  /** Same-transaction adapter for projecting and validating the V38 checkpoint authority. */
  readonly loadWebsiteCheckpointV38InTransaction?: (
    tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
    input: LoadReportV4CommerceAuthoritySnapshotInput
  ) => Promise<ReportV4AcceptanceWebsiteCheckpointV38Authority | null>;
}

export class ReportV4AcceptanceAuthorityPhaseUnavailableError extends Error {
  readonly code = "REPORT_V4_ACCEPTANCE_AUTHORITY_PHASE_UNAVAILABLE" as const;

  constructor(
    readonly phase: "baseline" | "final",
    readonly missingAuthorities: readonly ReportV4AcceptanceAuthorityUnavailableSlot[],
    readonly foundationHash: string
  ) {
    super(`Report V4 ${phase} authority phase is unavailable: ${missingAuthorities.join(", ")}.`);
    this.name = "ReportV4AcceptanceAuthorityPhaseUnavailableError";
  }
}

export class ReportV4AcceptanceAuthorityPhaseIncompleteError extends Error {
  readonly code = "phase_authority_incomplete" as const;

  constructor() {
    super("phase_authority_incomplete: all seven DB authority slots remain unavailable until slot-specific complete-set loaders and validators exist.");
    this.name = "ReportV4AcceptanceAuthorityPhaseIncompleteError";
  }
}

/**
 * Minimal fail-closed phase projector foundation.
 *
 * It proves the one-transaction composition boundary now, but deliberately
 * refuses to return a purported complete phase snapshot until every remaining
 * DB authority slot has a transaction-scoped, integrity-checking loader.
 */
export async function loadReportV4AcceptanceAuthorityPhaseSnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
  dependencies: ReportV4AcceptanceAuthorityPhaseSnapshotDependencies = {}
): Promise<never> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const foundation = await loadFoundationInTransaction(tx, parsed, dependencies);
    const missing: ReportV4AcceptanceAuthorityUnavailableSlot[] = [
      ...REPORT_V4_ACCEPTANCE_AUTHORITY_UNAVAILABLE_SLOTS
    ];
    if (foundation.websiteCheckpoint === null) missing.unshift("website_checkpoint_v38_hashes");
    throw new ReportV4AcceptanceAuthorityPhaseUnavailableError(
      foundation.phase,
      Object.freeze(missing),
      foundation.foundationHash
    );
  });
}

/** The V39 table exists, but no production complete-set projector exists yet. */
export async function persistReportV4AcceptanceAuthorityPhaseSnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: PersistReportV4AcceptanceAuthorityPhaseSnapshotInput
): Promise<never> {
  void sql;
  const raw = exactRecord(input, ["payload", "phase", "scenarioId", "sessionId", "workerGitSha"], "phase persistence input");
  parsePhaseIdentity(raw as unknown as Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">);
  if (typeof raw.workerGitSha !== "string" || !GIT_SHA.test(raw.workerGitSha)) {
    throw new Error("workerGitSha must be a lowercase full Git SHA.");
  }
  try {
    assertReportV4AcceptanceCompleteAuthorityPhasePayload(raw.payload);
  } catch (error) {
    if (error instanceof ReportV4AcceptanceAuthorityPhaseIncompleteError) throw error;
    throw new ReportV4AcceptanceAuthorityPhaseIncompleteError();
  }
}

export async function loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">
): Promise<null> {
  const identity = parsePhaseIdentity(input);
  const rows = await tx.unsafe(`SELECT session_id,scenario_id,phase
    FROM report_v4_acceptance_authority_phase_snapshots
    WHERE session_id=$1 AND scenario_id=$2 AND phase=$3`, [identity.sessionId, identity.scenarioId, identity.phase]);
  if (rows.length > 1) throw new Error("Report V4 authority phase persistence identity is not unique.");
  if (rows[0]) throw new ReportV4AcceptanceAuthorityPhaseIncompleteError();
  return null;
}

export function assertReportV4AcceptanceAuthorityCaptureOrder(
  baseline: ReportV4AcceptanceAuthorityPhaseFoundation,
  final: ReportV4AcceptanceAuthorityPhaseFoundation
): void {
  if (baseline.phase !== "baseline" || final.phase !== "final") {
    throw new TypeError("Authority capture order requires complete baseline and final phase foundations.");
  }
  const baselineCapturedAt = canonicalUtcInstant(baseline.capturedAt, "baseline capturedAt");
  const finalCapturedAt = canonicalUtcInstant(final.capturedAt, "final capturedAt");
  if (baselineCapturedAt >= finalCapturedAt) {
    throw new Error("Authority baseline capture must strictly precede final capture.");
  }
  if (baseline.session.sessionIdHash !== final.session.sessionIdHash
      || baseline.session.scenarioIdHash !== final.session.scenarioIdHash
      || baseline.scenarioKind !== final.scenarioKind) {
    throw new Error("Authority baseline and final captures must share one exact scenario identity.");
  }
  assertPhaseTopology(baseline);
  assertPhaseTopology(final);
}

async function loadFoundationInTransaction(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
  dependencies: ReportV4AcceptanceAuthorityPhaseSnapshotDependencies
): Promise<ReportV4AcceptanceAuthorityPhaseFoundation> {
  const isolationRows = await tx.unsafe(`/* phase-authority:isolation */
    SELECT current_setting('transaction_isolation') transaction_isolation,
      current_setting('transaction_read_only') transaction_read_only,
      clock_timestamp() captured_at`);
  const isolation = exactlyOne(isolationRows, "transaction isolation");
  if (isolation.transaction_isolation !== "repeatable read" || isolation.transaction_read_only !== "on") {
    throw new Error("Report V4 authority phase requires one repeatable-read read-only transaction.");
  }
  const capturedAt = timestamp(isolation.captured_at, "captured_at");
  const metadataRows = await tx.unsafe(`/* phase-authority:session-scenario */
    SELECT sessions.id session_id,sessions.state session_state,sessions.head_sequence,sessions.head_hash,
      sessions.event_count,scenarios.id scenario_id,scenarios.kind scenario_kind,scenarios.state scenario_state
    FROM report_v4_acceptance_sessions sessions
    JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id
    WHERE sessions.id=$1 AND scenarios.id=$2`, [input.sessionId, input.scenarioId]);
  const metadata = exactlyOne(metadataRows, "session/scenario authority");
  const scenarioKind = parseScenarioKind(metadata.scenario_kind);
  const commerce = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, input);
  if (commerce.scenarioKind !== scenarioKind) throw new Error("Commerce and session scenario authority disagree.");
  const paidAt = commerce.orders[0]?.paidAt;
  if (!paidAt) throw new Error("The exact paid order timestamp is required for authority capture.");
  const websiteCheckpointCandidate = dependencies.loadWebsiteCheckpointV38InTransaction
    ? await dependencies.loadWebsiteCheckpointV38InTransaction(tx, input)
    : null;
  const websiteCheckpoint = websiteCheckpointCandidate ?? null;
  if (websiteCheckpoint !== null) assertReportV4AcceptanceWebsiteCheckpointV38Authority(websiteCheckpoint);
  const session = Object.freeze({
    sessionIdHash: digest(text(metadata.session_id, "session_id")),
    scenarioIdHash: digest(text(metadata.scenario_id, "scenario_id")),
    sessionState: parseState(metadata.session_state, "session state"),
    scenarioState: parseState(metadata.scenario_state, "scenario state"),
    headSequence: nonnegativeInteger(metadata.head_sequence, "head_sequence"),
    headHash: hash(metadata.head_hash, "head_hash"),
    eventCount: nonnegativeInteger(metadata.event_count, "event_count")
  });
  const foundation = {
    phase: input.phase,
    capturedAt,
    scenarioKind,
    session,
    commerce,
    paidAt,
    websiteCheckpoint,
    transactionProfile: Object.freeze({ isolation: "repeatable read" as const, readOnly: true as const })
  };
  const projected = Object.freeze({ ...foundation, foundationHash: digest(stableJson(foundation)) });
  assertPhaseTopology(projected);
  return projected;
}

function assertPhaseTopology(value: ReportV4AcceptanceAuthorityPhaseFoundation): void {
  const enhancementJob = value.commerce.scope.enhancementJobIdHash;
  const enhancementArtifact = value.commerce.scope.enhancementArtifactRevisionIdHash;
  if (value.phase === "baseline" && (enhancementJob !== null || enhancementArtifact !== null)) {
    throw new Error("Authority baseline must not contain enhancement lineage.");
  }
  if (value.phase === "final") {
    const expectsEnhancement = value.scenarioKind !== "question_failure";
    if (expectsEnhancement !== (enhancementJob !== null && enhancementArtifact !== null)) {
      throw new Error("Authority final enhancement lineage conflicts with scenario topology.");
    }
  }
}

export function assertReportV4AcceptanceWebsiteCheckpointV38Authority(
  value: unknown
): asserts value is ReportV4AcceptanceWebsiteCheckpointV38Authority {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("V38 website checkpoint authority must be a complete object.");
  }
  const checkpoint = value as Record<string, unknown>;
  const expectedFields = [
    "correctionCount",
    "identityHash",
    "inputIdentityHash",
    "outputHash",
    "pageSummaryCount",
    "pageSummaryIdentitySetHash",
    "providerCallCount",
    "state"
  ];
  if (Object.keys(checkpoint).sort().join("\u001f") !== expectedFields.join("\u001f")) {
    throw new Error("V38 website checkpoint authority fields are incomplete or non-canonical.");
  }
  if (checkpoint.state !== "completed" || checkpoint.providerCallCount !== 1 || checkpoint.correctionCount !== 0) {
    throw new Error("V38 website checkpoint must be completed exactly once without correction.");
  }
  if (!Number.isSafeInteger(checkpoint.pageSummaryCount)
      || Number(checkpoint.pageSummaryCount) < 1 || Number(checkpoint.pageSummaryCount) > 50) {
    throw new Error("V38 website checkpoint pageSummaryCount is missing or invalid.");
  }
  for (const field of [
    "identityHash",
    "inputIdentityHash",
    "pageSummaryIdentitySetHash",
    "outputHash"
  ] as const) {
    const candidate = checkpoint[field];
    if (typeof candidate !== "string" || !HASH.test(candidate)) {
      throw new Error(`V38 website checkpoint ${field} is missing or invalid.`);
    }
  }
}

export function assertReportV4AcceptanceCompleteAuthorityPhasePayload(
  value: unknown
): never {
  const payload = exactRecord(value, [
    "authorities", "capturedAt", "commerce", "contractVersion", "paidAt", "phase", "scenarioKind", "session",
    "transactionProfile", "websiteCheckpoint"
  ], "complete authority phase payload");
  if (payload.contractVersion !== COMPLETE_PHASE_CONTRACT) throw new Error("Complete authority phase contractVersion is invalid.");
  if (payload.phase !== "baseline" && payload.phase !== "final") throw new Error("Complete authority phase is invalid.");
  canonicalUtcInstant(payload.capturedAt, "complete payload capturedAt");
  canonicalUtcInstant(payload.paidAt, "complete payload paidAt");
  if (payload.scenarioKind !== "success" && payload.scenarioKind !== "diagnosis_failure" && payload.scenarioKind !== "question_failure") {
    throw new Error("Complete authority phase scenarioKind is invalid.");
  }
  validateCompleteSession(payload.session);
  assertReportV4AcceptanceWebsiteCheckpointV38Authority(payload.websiteCheckpoint);
  validateTransactionProfile(payload.transactionProfile);
  const commerce = validateCompleteCommerce(payload.commerce, payload.phase, payload.scenarioKind);
  if (payload.capturedAt !== commerce.capturedAt) {
    throw new Error("Complete authority phase capturedAt must exactly equal commerce capturedAt.");
  }
  if (!Array.isArray(commerce.orders) || commerce.orders.length !== 1
      || !commerce.orders[0] || typeof commerce.orders[0] !== "object" || Array.isArray(commerce.orders[0])
      || (commerce.orders[0] as Record<string, unknown>).paidAt !== payload.paidAt) {
    throw new Error("Complete authority phase paidAt must exactly equal the unique commerce order paidAt.");
  }
  assertPhaseTopology({
    phase: payload.phase as "baseline" | "final",
    capturedAt: payload.capturedAt as string,
    scenarioKind: payload.scenarioKind as ReportV4AcceptanceAuthorityPhaseFoundation["scenarioKind"],
    session: payload.session as ReportV4AcceptanceAuthorityPhaseFoundation["session"],
    commerce: payload.commerce as ReportV4CommerceAuthoritySnapshot,
    paidAt: payload.paidAt as string,
    websiteCheckpoint: payload.websiteCheckpoint as ReportV4AcceptanceWebsiteCheckpointV38Authority,
    foundationHash: digest(stableJson(payload)),
    transactionProfile: payload.transactionProfile as ReportV4AcceptanceAuthorityPhaseFoundation["transactionProfile"]
  });
  let authorities: Record<string, unknown>;
  try {
    authorities = exactRecord(payload.authorities, [...COMPLETE_AUTHORITY_SLOT_NAMES].sort(), "complete DB authorities");
  } catch {
    throw new ReportV4AcceptanceAuthorityPhaseIncompleteError();
  }
  for (const name of COMPLETE_AUTHORITY_SLOT_NAMES) {
    assertNoSensitiveUnknownKeys(authorities[name], `complete DB authorities.${name}`);
  }
  throw new ReportV4AcceptanceAuthorityPhaseIncompleteError();
}

function validateCompleteCommerce(value: unknown, phase: "baseline" | "final", scenarioKind: string): Record<string, unknown> {
  const commerce = exactRecord(value, [
    "accessTokens", "artifacts", "capturedAt", "creditAuthority", "diagnosisCheckpoints", "dispatches", "emailAuthority",
    "fingerprint", "jobs", "orders", "paymentEvents", "phase", "questionCheckpoints", "scenarioKind", "scope", "transactionProfile"
  ], "complete commerce authority");
  if (commerce.phase !== phase || commerce.scenarioKind !== scenarioKind) throw new Error("Complete commerce phase/scenario topology mismatch.");
  canonicalUtcInstant(commerce.capturedAt, "commerce capturedAt");
  validateTransactionProfile(commerce.transactionProfile);
  const normalized = {
    phase: commerce.phase,
    capturedAt: commerce.capturedAt,
    scope: commerce.scope,
    orders: commerce.orders,
    paymentEvents: commerce.paymentEvents,
    jobs: commerce.jobs,
    dispatches: commerce.dispatches,
    creditAuthority: commerce.creditAuthority,
    emailAuthority: commerce.emailAuthority,
    accessTokens: commerce.accessTokens,
    artifacts: commerce.artifacts,
    questionCheckpoints: commerce.questionCheckpoints,
    diagnosisCheckpoints: commerce.diagnosisCheckpoints
  };
  const recomputed = fingerprintNormalizedReportV4CommerceAuthority(normalized);
  if (commerce.fingerprint !== recomputed) throw new Error("Complete commerce fingerprint does not match its canonical full payload.");
  return commerce;
}

function validateCompleteSession(value: unknown): void {
  const session = exactRecord(value, [
    "eventCount", "headHash", "headSequence", "scenarioIdHash", "scenarioState", "sessionIdHash", "sessionState"
  ], "complete phase session authority");
  hash(session.sessionIdHash, "sessionIdHash");
  hash(session.scenarioIdHash, "scenarioIdHash");
  hash(session.headHash, "headHash");
  const headSequence = nonnegativeInteger(session.headSequence, "headSequence");
  const eventCount = nonnegativeInteger(session.eventCount, "eventCount");
  if (headSequence !== eventCount) throw new Error("Complete phase session eventCount must equal headSequence.");
  if (parseState(session.sessionState, "session state") !== "collecting"
      || parseState(session.scenarioState, "scenario state") !== "collecting") {
    throw new Error("Complete phase session and scenario must be collecting at capture time.");
  }
}

function validateTransactionProfile(value: unknown): void {
  const profile = exactRecord(value, ["isolation", "readOnly"], "authority transaction profile");
  if (profile.isolation !== "repeatable read" || profile.readOnly !== true) {
    throw new Error("Authority transaction profile must be repeatable-read and read-only.");
  }
}

function parsePhaseIdentity(
  input: Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase">
): Pick<PersistReportV4AcceptanceAuthorityPhaseSnapshotInput, "sessionId" | "scenarioId" | "phase"> {
  if (!input || typeof input !== "object" || !UUID.test(input.sessionId) || !UUID.test(input.scenarioId)
      || (input.phase !== "baseline" && input.phase !== "final")) {
    throw new TypeError("Report V4 authority phase persistence identity is invalid.");
  }
  return { sessionId: input.sessionId, scenarioId: input.scenarioId, phase: input.phase };
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an exact object.`);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are incomplete or non-canonical.`);
  }
  return value as Record<string, unknown>;
}

function assertNoSensitiveUnknownKeys(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoSensitiveUnknownKeys(child, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const words = sensitiveKeyWords(key);
    const compact = key.replace(/[^A-Za-z0-9]+/gu, "").toLowerCase();
    const compactSensitive = /(?:email|token|password|credential|secret|authorization)/u.test(compact)
      || /(?:api|access|private|encryption|signing|idempotency|checkout)key/u.test(compact);
    if (compactSensitive || words.some((word) => /^(?:url|email|token|key|password|credential|credentials|secret|secrets|authorization)$/u.test(word))) {
      throw new Error(`${label} contains forbidden sensitive unknown field ${key}.`);
    }
    assertNoSensitiveUnknownKeys(child, `${label}.${key}`);
  }
}

function sensitiveKeyWords(key: string): string[] {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Za-z])([0-9])/gu, "$1 $2")
    .replace(/([0-9])([A-Za-z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function parseInput(input: LoadReportV4CommerceAuthoritySnapshotInput): LoadReportV4CommerceAuthoritySnapshotInput {
  if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "phase,scenarioId,sessionId"
      || !UUID.test(input.sessionId) || !UUID.test(input.scenarioId)
      || (input.phase !== "baseline" && input.phase !== "final")) {
    throw new TypeError("Report V4 authority phase input is invalid.");
  }
  return input;
}

function exactlyOne(rows: readonly Record<string, unknown>[], label: string): Record<string, unknown> {
  if (rows.length !== 1) throw new Error(`Report V4 authority phase ${label} must contain exactly one row.`);
  return rows[0]!;
}

function parseScenarioKind(value: unknown): ReportV4AcceptanceAuthorityPhaseFoundation["scenarioKind"] {
  if (value !== "success" && value !== "diagnosis_failure" && value !== "question_failure") {
    throw new Error("Report V4 authority phase scenario kind is invalid.");
  }
  return value;
}

function parseState(value: unknown, label: string): "collecting" | "sealed" | "failed" {
  if (value !== "collecting" && value !== "sealed" && value !== "failed") {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  const candidate = text(value, label);
  if (!HASH.test(candidate)) throw new Error(`Report V4 authority phase ${label} is not a SHA-256 hash.`);
  return candidate;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`Report V4 authority phase ${label} is invalid.`);
  }
  return candidate;
}

function timestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : new Date(text(value, label));
  if (!Number.isFinite(date.getTime())) throw new Error(`Report V4 authority phase ${label} is invalid.`);
  return date.toISOString();
}

function canonicalUtcInstant(value: unknown, label: string): number {
  if (typeof value !== "string") throw new Error(`Report V4 authority phase ${label} must be a canonical UTC ISO instant.`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`Report V4 authority phase ${label} must be a canonical UTC ISO instant.`);
  }
  return milliseconds;
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  throw new TypeError("Report V4 authority phase canonical payload contains an unsupported value.");
}
