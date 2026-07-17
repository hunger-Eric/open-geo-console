import { createHash } from "node:crypto";
import {
  loadReportV4CommerceAuthoritySnapshotInTransaction,
  type LoadReportV4CommerceAuthoritySnapshotInput,
  type ReportV4CommerceAuthoritySnapshot,
  type ReportV4CommerceAuthoritySnapshotSql,
  type ReportV4CommerceAuthoritySnapshotTransactionSql
} from "./report-v4-commerce-authority-snapshot";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;

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
