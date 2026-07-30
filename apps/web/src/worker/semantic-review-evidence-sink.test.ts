import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FreeV4SemanticReviewBatchEvidence } from "@open-geo-console/ai-report-engine";
import { createSemanticReviewBatchEvidenceSink, OGC_SEMANTIC_REVIEW_EVIDENCE_PATH } from "./semantic-review-evidence-sink";

const SENTINEL_PROSE = "SENTINEL-PROSE-MUST-NEVER-APPEAR";
const DECLARED_KEYS = ["batchId", "durationMs", "errorClass", "inputIdentities", "jobId", "recordedAt", "reportId", "requestBytes", "requestSha256", "responseIdentities", "responseRowCount"];

function evidence(): FreeV4SemanticReviewBatchEvidence {
  return {
    batchId: "B_answers", inputIdentities: ["q1@answer"], requestSha256: "a".repeat(64),
    requestBytes: 1_024, responseRowCount: 1, responseIdentities: ["q1"], durationMs: 3, errorClass: null
  };
}

describe("createSemanticReviewBatchEvidenceSink", () => {
  it("returns undefined when the env path is unset or blank", () => {
    expect(createSemanticReviewBatchEvidenceSink({ env: {} })).toBeUndefined();
    expect(createSemanticReviewBatchEvidenceSink({ env: { [OGC_SEMANTIC_REVIEW_EVIDENCE_PATH]: "   " } })).toBeUndefined();
    expect(createSemanticReviewBatchEvidenceSink()).toBeUndefined();
  });

  it("appends one redacted JSONL record per evidence entry with context and recordedAt", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ogc-evidence-sink-")), "evidence.jsonl");
    try {
      const sink = createSemanticReviewBatchEvidenceSink({
        env: { [OGC_SEMANTIC_REVIEW_EVIDENCE_PATH]: path },
        context: { jobId: "job-1", reportId: "report-1" }
      });
      expect(sink).toBeTypeOf("function");
      sink!(evidence());
      sink!({ ...evidence(), batchId: "B_obs", responseIdentities: ["o1/r1"], errorClass: "Error:ETEST" });
      const lines = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ jobId: "job-1", reportId: "report-1", batchId: "B_answers", requestSha256: "a".repeat(64), requestBytes: 1_024, responseRowCount: 1, errorClass: null });
      expect(lines[1]).toMatchObject({ batchId: "B_obs", errorClass: "Error:ETEST" });
      for (const line of lines) {
        // Redaction: only context keys + declared evidence keys + recordedAt;
        // values are ids/hashes/counts/timings — never prose or secrets.
        expect(Object.keys(line).sort()).toEqual(DECLARED_KEYS);
        expect(typeof line.recordedAt).toBe("string");
        expect(JSON.stringify(line)).not.toContain(SENTINEL_PROSE);
        expect(JSON.stringify(line)).not.toContain("Bearer");
        for (const value of Object.values(line)) {
          expect(value === null || typeof value === "string" || typeof value === "number" ||
            (Array.isArray(value) && value.every((item) => typeof item === "string"))).toBe(true);
        }
      }
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("swallows write failures so evidence never breaks a review", () => {
    const sink = createSemanticReviewBatchEvidenceSink({ env: { [OGC_SEMANTIC_REVIEW_EVIDENCE_PATH]: tmpdir() } });
    expect(() => sink!(evidence())).not.toThrow();
  });
});
