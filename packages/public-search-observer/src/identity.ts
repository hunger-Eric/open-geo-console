import { createHash } from "node:crypto";
import type { CanonicalBuyerQuestion, MarketSnapshotIdentity, PublicSearchSurface } from "./types";

export function deterministicId(namespace: string, parts: readonly string[]): string {
  return `${namespace}-${createHash("sha256").update(JSON.stringify(parts.map((part) => part.normalize("NFC")))).digest("hex")}`;
}

export function createMarketSnapshotIdentity(input: {
  question: CanonicalBuyerQuestion;
  surface: PublicSearchSurface;
  fanoutVersion: string;
}): MarketSnapshotIdentity {
  const dimensions = [
    input.question.normalizedText,
    input.question.locale,
    input.question.region,
    input.surface.surfaceId,
    input.surface.surfaceVersion,
    input.fanoutVersion
  ].map((value) => value.trim().normalize("NFKC"));
  return {
    id: deterministicId("market", dimensions),
    normalizedQuestion: dimensions[0]!, locale: dimensions[1]!, region: dimensions[2]!,
    surfaceId: dimensions[3]!, surfaceVersion: dimensions[4]!, fanoutVersion: dimensions[5]!
  };
}
