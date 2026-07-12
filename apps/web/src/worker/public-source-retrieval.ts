import { createHash } from "node:crypto";
import { canonicalizePublicSourceUrl, type RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";

// This is a data-only boundary for Phase 3. Phase 5 may connect it to the
// existing safe-fetch/robots/browser machinery; this module never performs I/O.
export interface PublicSourceRetrievalRequest {
  observationId: string;
  queryId: string;
  resultUrl: string;
  maxBytes: number;
  maxRedirects: number;
  requireRobotsAtEveryOrigin: true;
}

export interface PublicSourceExtractorResult {
  request: PublicSourceRetrievalRequest;
  finalUrl?: string;
  retrievalState: RetrievedPublicSourceFact["retrievalState"];
  robotsAllowed: boolean;
  publiclyRoutable: boolean;
  accessBarrier: RetrievedPublicSourceFact["accessBarrier"];
  redirectChain?: readonly string[];
  robotsCheckedOrigins: readonly string[];
  contentBytes?: number;
  normalizedText?: string;
  verifiedExcerpt?: string;
  entityMentions?: RetrievedPublicSourceFact["entityMentions"];
  claims?: RetrievedPublicSourceFact["claims"];
}

export function createPublicSourceRetrievalRequest(input: {
  observationId: string;
  queryId: string;
  resultUrl: string;
}): PublicSourceRetrievalRequest {
  return {
    observationId: requireText(input.observationId, "observationId"),
    queryId: requireText(input.queryId, "queryId"),
    resultUrl: canonicalizePublicSourceUrl(input.resultUrl),
    maxBytes: 2 * 1024 * 1024,
    maxRedirects: 5,
    requireRobotsAtEveryOrigin: true
  };
}

export function normalizePublicSourceRetrievalResult(input: PublicSourceExtractorResult): RetrievedPublicSourceFact {
  const normalizedText = input.normalizedText?.normalize("NFKC").trim().replace(/\s+/g, " ");
  const verifiedExcerpt = input.verifiedExcerpt?.normalize("NFKC").trim().replace(/\s+/g, " ");
  const visitedUrls = [input.request.resultUrl, ...(input.redirectChain ?? []), ...(input.finalUrl ? [input.finalUrl] : [])]
    .map(canonicalizePublicSourceUrl);
  const requiredOrigins = new Set(visitedUrls.map((url) => new URL(url).origin));
  const checkedOrigins = new Set(input.robotsCheckedOrigins.map((origin) => new URL(origin).origin));
  if ((input.redirectChain?.length ?? 0) > input.request.maxRedirects) {
    throw new Error("Public-source retrieval exceeded its redirect limit.");
  }
  if (verifiedExcerpt && verifiedExcerpt.length > 1_000) {
    throw new Error("Verified public-source excerpts must not exceed 1000 characters.");
  }
  if (
    input.retrievalState === "available" &&
    (!normalizedText || input.contentBytes === undefined || input.contentBytes < 0 || !input.publiclyRoutable || !input.robotsAllowed || input.accessBarrier !== "none" ||
      [...requiredOrigins].some((origin) => !checkedOrigins.has(origin)))
  ) {
    throw new Error("Available evidence contradicts the safe retrieval boundary.");
  }
  if (input.retrievalState !== "available" && (normalizedText || verifiedExcerpt)) {
    throw new Error("Unavailable public sources must not retain extracted text or excerpts.");
  }
  if (verifiedExcerpt && normalizedText && !normalizedText.includes(verifiedExcerpt)) {
    throw new Error("Verified public-source excerpt must match the normalized retrieved text.");
  }
  if ((input.contentBytes ?? 0) > input.request.maxBytes) {
    throw new Error("Public-source retrieval exceeded its bounded response size.");
  }
  return {
    observationId: input.request.observationId,
    queryId: input.request.queryId,
    resultUrl: input.request.resultUrl,
    ...(input.finalUrl ? { finalUrl: canonicalizePublicSourceUrl(input.finalUrl) } : {}),
    retrievalState: input.retrievalState,
    publiclyRoutable: input.publiclyRoutable,
    robotsAllowed: input.robotsAllowed,
    accessBarrier: input.accessBarrier,
    ...(input.contentBytes !== undefined ? { contentBytes: input.contentBytes } : {}),
    ...(normalizedText ? { normalizedText } : {}),
    ...(normalizedText ? { normalizedContentHash: hashNormalizedPublicSourceText(normalizedText) } : {}),
    ...(verifiedExcerpt ? { verifiedExcerpt } : {}),
    ...(input.entityMentions ? { entityMentions: input.entityMentions } : {}),
    ...(input.claims ? { claims: input.claims } : {})
  };
}

export function hashNormalizedPublicSourceText(normalizedText: string): string {
  return `sha256:${createHash("sha256").update(normalizedText).digest("hex")}`;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be empty.`);
  return normalized;
}
