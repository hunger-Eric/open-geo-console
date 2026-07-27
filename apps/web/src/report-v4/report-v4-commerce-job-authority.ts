import { createHash } from "node:crypto";
import type {
  ReportTier,
  ScanJobExecutionState,
  ScanJobPhase,
  ScanJobStage,
} from "@/db/schema";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const stages = new Set<ScanJobStage>([
  "queued",
  "discovering",
  "planning",
  "fetching",
  "analyzing",
  "synthesizing",
  "completed",
  "completed_limited",
  "failed",
]);
const states = new Set<ScanJobExecutionState>([
  "queued",
  "running",
  "retry_wait",
  "repair_wait",
  "completed",
  "failed",
]);
const phases = new Set<ScanJobPhase>([
  "admission",
  "discovery",
  "planning",
  "fetching",
  "technical_audit",
  "page_analysis",
  "website_synthesis",
  "public_source_preflight",
  "question_generation",
  "snapshot_resolution",
  "provider_discovery_search",
  "candidate_resolution",
  "candidate_verification",
  "provider_source_retrieval",
  "provider_passage_selection",
  "provider_claim_extraction",
  "provider_qualification",
  "grounded_answer_synthesis",
  "source_retrieval",
  "evidence_graph",
  "report_build",
  "artifact_verification",
  "terminalization",
]);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const allowedJob = new Set([
  "id",
  "reportId",
  "siteSnapshotId",
  "tier",
  "productContract",
  "fulfillmentMethodology",
  "recommendationReportVersion",
  "artifactContract",
  "businessQuestionSetId",
  "locale",
  "reason",
  "stage",
  "executionState",
  "currentPhase",
  "checkpointRevision",
  "phaseAttempt",
  "resumeGeneration",
  "progress",
  "plannedPages",
  "successfulPages",
  "failedPages",
  "attempts",
  "maxAttempts",
  "errorCode",
  "publicError",
  "creditReservationId",
]);
const allowedDispatch = new Set([
  "id",
  "jobId",
  "tier",
  "schemaVersion",
  "state",
  "attempts",
  "publishedAt",
  "lastErrorCode",
]);

function rejectUnknown(
  row: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(row, key))
      throw new Error(`missing field: ${key}`);
  }
  for (const key of Object.keys(row))
    if (!allowed.has(key)) throw new Error(`unknown field: ${key}`);
}
function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}
function optionalId(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requiredId(value, name);
}
function integer(
  value: unknown,
  name: string,
  min: number,
  max?: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    (max !== undefined && value > max)
  )
    throw new Error(`${name} invalid`);
  return value;
}
function nullableText(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 256
  )
    throw new Error(`${name} invalid`);
  return value;
}
function timestamp(value: unknown, name: string): string | null {
  if (value === null) return null;
  let output: string;
  try {
    output = value instanceof Date ? value.toISOString() : (value as string);
  } catch {
    throw new Error(`${name} invalid`);
  }
  if (typeof value !== "string" && !(value instanceof Date))
    throw new Error(`${name} invalid`);
  if (!UTC.test(output) || Number.isNaN(Date.parse(output)))
    throw new Error(`${name} invalid`);
  if (!(value instanceof Date) && new Date(output).toISOString() !== output)
    throw new Error(`${name} invalid`);
  return output;
}

export type ReportV4CommerceJobAuthority = {
  idHash: string;
  reportIdHash: string;
  siteSnapshotIdHash: string | null;
  tier: ReportTier;
  productContract: "recommendation_forensics_v1";
  fulfillmentMethodology: "two_stage_geo_report_v4";
  recommendationReportVersion: 4;
  artifactContract: "combined_geo_report_v4";
  businessQuestionSetIdHash: string | null;
  locale: "en" | "zh";
  reason: "standard" | "v4_pre_admission" | "v4_diagnosis_enhancement";
  stage: ScanJobStage;
  executionState: ScanJobExecutionState;
  currentPhase: ScanJobPhase;
  checkpointRevision: number;
  phaseAttempt: number;
  resumeGeneration: number;
  progress: number;
  plannedPages: number;
  successfulPages: number;
  failedPages: number;
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
  publicError: string | null;
  creditReservationIdHash: string | null;
};
export type ReportV4CommerceDispatchAuthority = {
  idHash: string;
  jobIdHash: string;
  tier: ReportTier;
  schemaVersion: number;
  state: "pending" | "published" | "abandoned";
  attempts: number;
  publishedAt: string | null;
  lastErrorCode: string | null;
};

export function normalizeReportV4CommerceJob(
  row: Record<string, unknown>,
): ReportV4CommerceJobAuthority {
  rejectUnknown(row, allowedJob);
  const id = requiredId(row.id, "id");
  const reportId = requiredId(row.reportId, "reportId");
  if (
    (row.tier !== "free" && row.tier !== "deep") ||
    (row.locale !== "en" && row.locale !== "zh")
  )
    throw new Error("enum invalid");
  if (
    row.productContract !== "recommendation_forensics_v1" ||
    row.fulfillmentMethodology !== "two_stage_geo_report_v4" ||
    row.recommendationReportVersion !== 4 ||
    row.artifactContract !== "combined_geo_report_v4"
  )
    throw new Error("not a V4 job");
  if (
    row.reason !== "standard" &&
    row.reason !== "v4_pre_admission" &&
    row.reason !== "v4_diagnosis_enhancement"
  )
    throw new Error("not a V4 reason");
  const snapshot = optionalId(row.siteSnapshotId, "siteSnapshotId");
  const questions = optionalId(
    row.businessQuestionSetId,
    "businessQuestionSetId",
  );
  const credit = optionalId(row.creditReservationId, "creditReservationId");
  if (
    row.reason === "v4_pre_admission" &&
    (row.tier !== "deep" ||
      snapshot !== null ||
      questions !== null ||
      credit !== null)
  )
    throw new Error("invalid pre-admission lane");
  if (
    row.reason === "v4_diagnosis_enhancement" &&
    (row.tier !== "deep" ||
      snapshot !== null ||
      questions === null ||
      credit !== null)
  )
    throw new Error("invalid enhancement lane");
  if (
    row.reason === "standard" &&
    (snapshot === null || questions === null || credit === null)
  )
    throw new Error("invalid core lane");
  if (
    !stages.has(row.stage as ScanJobStage) ||
    !states.has(row.executionState as ScanJobExecutionState) ||
    !phases.has(row.currentPhase as ScanJobPhase)
  )
    throw new Error("stage, execution state, or phase invalid");
  return {
    idHash: hash(id),
    reportIdHash: hash(reportId),
    siteSnapshotIdHash: snapshot === null ? null : hash(snapshot),
    tier: row.tier as ReportTier,
    productContract: "recommendation_forensics_v1",
    fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4,
    artifactContract: "combined_geo_report_v4",
    businessQuestionSetIdHash: questions === null ? null : hash(questions),
    locale: row.locale as "en" | "zh",
    reason: row.reason,
    stage: row.stage as ScanJobStage,
    executionState: row.executionState as ScanJobExecutionState,
    currentPhase: row.currentPhase as ScanJobPhase,
    checkpointRevision: integer(
      row.checkpointRevision,
      "checkpointRevision",
      0,
    ),
    phaseAttempt: integer(row.phaseAttempt, "phaseAttempt", 0),
    resumeGeneration: integer(row.resumeGeneration, "resumeGeneration", 0),
    progress: integer(row.progress, "progress", 0, 100),
    plannedPages: integer(row.plannedPages, "plannedPages", 0),
    successfulPages: integer(row.successfulPages, "successfulPages", 0),
    failedPages: integer(row.failedPages, "failedPages", 0),
    attempts: integer(row.attempts, "attempts", 0),
    maxAttempts: integer(row.maxAttempts, "maxAttempts", 1),
    errorCode: nullableText(row.errorCode, "errorCode"),
    publicError: nullableText(row.publicError, "publicError"),
    creditReservationIdHash: credit === null ? null : hash(credit),
  };
}

export function normalizeReportV4CommerceDispatch(
  row: Record<string, unknown>,
): ReportV4CommerceDispatchAuthority {
  rejectUnknown(row, allowedDispatch);
  const id = requiredId(row.id, "id");
  const jobId = requiredId(row.jobId, "jobId");
  if (
    (row.tier !== "free" && row.tier !== "deep") ||
    (row.state !== "pending" &&
      row.state !== "published" &&
      row.state !== "abandoned")
  )
    throw new Error("dispatch enum invalid");
  return {
    idHash: hash(id),
    jobIdHash: hash(jobId),
    tier: row.tier as ReportTier,
    schemaVersion: integer(row.schemaVersion, "schemaVersion", 1),
    state: row.state,
    attempts: integer(row.attempts, "attempts", 0),
    publishedAt: timestamp(row.publishedAt, "publishedAt"),
    lastErrorCode: nullableText(row.lastErrorCode, "lastErrorCode"),
  };
}
export function normalizeReportV4CommerceJobs(
  rows: Record<string, unknown>[],
): ReportV4CommerceJobAuthority[] {
  const output = rows
    .map(normalizeReportV4CommerceJob)
    .sort((a, b) => a.idHash.localeCompare(b.idHash));
  if (new Set(output.map((row) => row.idHash)).size !== output.length)
    throw new Error("duplicate job id");
  return output;
}
export function normalizeReportV4CommerceDispatches(
  rows: Record<string, unknown>[],
): ReportV4CommerceDispatchAuthority[] {
  const output = rows
    .map(normalizeReportV4CommerceDispatch)
    .sort((a, b) => a.idHash.localeCompare(b.idHash));
  if (new Set(output.map((row) => row.idHash)).size !== output.length)
    throw new Error("duplicate dispatch id");
  return output;
}
