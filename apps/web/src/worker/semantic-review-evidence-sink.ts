import { appendFileSync } from "node:fs";
import type { FreeV4SemanticReviewBatchEvidence } from "@open-geo-console/ai-report-engine";

/** Local-only evidence file gate; never set in staging/production env files. */
export const OGC_SEMANTIC_REVIEW_EVIDENCE_PATH = "OGC_SEMANTIC_REVIEW_EVIDENCE_PATH";

/**
 * Returns an `onSemanticReviewBatchEvidence` sink appending one redacted JSON
 * line per batch evidence record, or undefined when the env path is unset.
 * Write failures are swallowed: evidence must never break a review.
 */
export function createSemanticReviewBatchEvidenceSink(input?: {
  env?: NodeJS.ProcessEnv;
  context?: Record<string, string>;
}): ((evidence: FreeV4SemanticReviewBatchEvidence) => void) | undefined {
  const path = (input?.env ?? process.env)[OGC_SEMANTIC_REVIEW_EVIDENCE_PATH];
  if (!path || !path.trim()) return undefined;
  const context = input?.context ?? {};
  return (evidence) => {
    try {
      const record = { ...context, ...evidence, recordedAt: new Date().toISOString() };
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      // Intentionally swallowed.
    }
  };
}
