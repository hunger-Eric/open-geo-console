import { REPORT_SEMANTIC_REVIEW_CONTRACT } from "@open-geo-console/ai-report-engine";
import type { JobCheckpoint, ScanJobStage } from "./schema";

export type SemanticReviewContractVersion = typeof REPORT_SEMANTIC_REVIEW_CONTRACT;

const CARRIER_KEY = "semanticReviewContractVersion" as const;

export function createSemanticReviewInitialCheckpoint(
  version?: SemanticReviewContractVersion
): JobCheckpoint {
  if (version === undefined) return {};
  requireVersion(version, "$checkpoint.semanticReviewContractVersion");
  return { semanticReviewContractVersion: version };
}

export function readSemanticReviewContractVersion(value: unknown): SemanticReviewContractVersion | null {
  const checkpoint = record(value, "$checkpoint");
  const declared = Object.prototype.hasOwnProperty.call(checkpoint, CARRIER_KEY);
  assertNoNestedCarrier(checkpoint);
  if (!declared) return null;
  return requireVersion(checkpoint[CARRIER_KEY], `$checkpoint.${CARRIER_KEY}`);
}

export function assertSemanticReviewCarrierUpdate(
  persistedValue: unknown,
  updateValue: unknown
): void {
  const persisted = readSemanticReviewContractVersion(persistedValue);
  const proposed = semanticReviewCarrierUpdateVersion(updateValue);
  if (proposed === undefined) return;
  if (proposed !== persisted) {
    throw new Error("The semantic-review checkpoint carrier is immutable after job creation.");
  }
}

export function semanticReviewCarrierUpdateVersion(
  updateValue: unknown
): SemanticReviewContractVersion | undefined {
  const update = record(updateValue, "$checkpointUpdate");
  const declared = Object.prototype.hasOwnProperty.call(update, CARRIER_KEY);
  const proposed = readSemanticReviewContractVersion(update);
  return declared ? proposed ?? undefined : undefined;
}

export function assertSemanticReviewCarrierEquals(
  checkpoint: unknown,
  expected: SemanticReviewContractVersion | null
): void {
  if (readSemanticReviewContractVersion(checkpoint) !== expected) {
    throw new Error("The semantic-review checkpoint carrier does not match the job creation authority.");
  }
}

export function resolvePaidV3SemanticReviewContract(input: {
  checkpoint: unknown;
  stage: ScanJobStage;
  reportId: string;
  questionSetId: string;
  questionSetIdentity: string;
}): SemanticReviewContractVersion | null {
  const version = readSemanticReviewContractVersion(input.checkpoint);
  if (version === null) return null;
  if (input.stage !== "completed" && input.stage !== "completed_limited") {
    throw new Error("A marker-bearing Free teaser must be terminal before Paid V3 creation.");
  }
  const checkpoint = record(input.checkpoint, "$checkpoint");
  const teaser = record(checkpoint.freeTeaser, "$checkpoint.freeTeaser");
  if (teaser.version !== "free-teaser-checkpoint-v1" || teaser.stage !== "ready" ||
      teaser.reportId !== input.reportId || teaser.questionSetId !== input.questionSetId ||
      teaser.questionSetIdentity !== input.questionSetIdentity) {
    throw new Error("The marker-bearing Free teaser does not match the Paid V3 question lineage.");
  }
  return version;
}

function requireVersion(value: unknown, path: string): SemanticReviewContractVersion {
  if (value !== REPORT_SEMANTIC_REVIEW_CONTRACT) {
    throw new TypeError(`${path} must equal ${REPORT_SEMANTIC_REVIEW_CONTRACT}.`);
  }
  return REPORT_SEMANTIC_REVIEW_CONTRACT;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertNoNestedCarrier(root: Record<string, unknown>): void {
  const pending = Object.entries(root)
    .filter(([key]) => key !== CARRIER_KEY)
    .map(([, value]) => value);
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const row = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(row, CARRIER_KEY)) {
      throw new TypeError(`$checkpoint.${CARRIER_KEY} must be declared only at the checkpoint root.`);
    }
    pending.push(...Object.values(row));
  }
}
