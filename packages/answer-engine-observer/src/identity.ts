import { createHash } from "node:crypto";
import type {
  AnswerSnapshotCellIdentityInput,
  AnswerSnapshotRunIdentityInput
} from "./types";

function normalizeIdentityPart(value: string): string {
  return value.trim().normalize("NFKC");
}

function sha256(parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function createAnswerSnapshotRunId(input: AnswerSnapshotRunIdentityInput): string {
  return sha256([
    input.reportId,
    input.jobId,
    input.locale,
    input.region,
    input.questionSetVersion,
    input.runKey
  ].map(normalizeIdentityPart));
}

export function createAnswerSnapshotCellId(input: AnswerSnapshotCellIdentityInput): string {
  return sha256([
    input.runId,
    input.questionId,
    input.surface.providerId,
    input.surface.productId,
    input.surface.modelId,
    input.surface.collectionSurface,
    input.surface.locale,
    input.surface.region
  ].map(normalizeIdentityPart));
}

export function createAnswerResponseHash(answerText: string): string {
  return createHash("sha256").update(answerText.normalize("NFC")).digest("hex");
}
