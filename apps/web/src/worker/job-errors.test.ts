import { describe, expect, it } from "vitest";
import { normalizeJobError, PublicSourceRuntimeError, redactDiagnostic, retryDelayMs } from "./job-errors";
import { ReportLanguageValidationError } from "@open-geo-console/ai-report-engine";
import { PublicSourceSnapshotUnavailableError } from "./public-source-snapshot-resolver";
import { AnswerFirstV3ModelContractInvalidError } from "./answer-first-v3";

const context = { jobId: "job-1", phase: "public_source_preflight" as const, phaseAttempt: 1, resumeGeneration: 0, configuredSecrets: ["super-secret"] };

describe("job error normalization", () => {
  it("redacts credentials, URLs and raw IPs before diagnostics persist", () => {
    const error = new Error("Bearer super-secret postgres://alice:password@db.example/app from 203.0.113.42");
    const normalized = normalizeJobError(error, context);
    expect(normalized.message).not.toContain("super-secret");
    expect(normalized.message).not.toContain("postgres://");
    expect(normalized.message).not.toContain("203.0.113.42");
    expect(normalized.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(redactDiagnostic("Cookie=abc")).toContain("[REDACTED]");
  });

  it("keeps stable operator-repairable codes and deterministic bounded backoff", () => {
    const normalized = normalizeJobError(new PublicSourceRuntimeError("disabled", "public_source_runtime_disabled"), context, new Date("2030-01-01T00:00:00Z"));
    expect(normalized).toMatchObject({ classification: "operator_repairable", code: "public_source_runtime_disabled", retryableAt: null });
    expect(retryDelayMs(99, "ffff")).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it("routes an exhausted report-language gate to operator repair without an automatic retry", () => {
    const normalized = normalizeJobError(new ReportLanguageValidationError([
      { path: "executiveSummary.overview", reason: "unexpected_english_sentence" }
    ]), context);
    expect(normalized).toMatchObject({
      classification: "operator_repairable",
      code: "report_language_validation_failed",
      retryableAt: null
    });
  });

  it("preserves the safe public-source stage while redacting the underlying cause", () => {
    const error = new PublicSourceSnapshotUnavailableError(
      "observation_persistence",
      { cause: new Error("Bearer super-secret failed for https://user:pass@example.com/private") }
    );
    const normalized = normalizeJobError(error, context);
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "public_source_snapshot_observation_persistence",
      type: "PublicSourceSnapshotUnavailableError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(JSON.stringify(normalized)).not.toContain("super-secret");
    expect(JSON.stringify(normalized)).not.toContain("user:pass");
  });

  it("records a bounded code for an invalid answer-first V3 model contract", () => {
    const normalized = normalizeJobError(new AnswerFirstV3ModelContractInvalidError({
      cause: new TypeError("Model must return exactly three ordered answer entries.")
    }), context);

    expect(normalized).toMatchObject({
      classification: "operator_repairable",
      code: "answer_first_v3_model_contract_invalid",
      type: "AnswerFirstV3ModelContractInvalidError",
      retryableAt: null
    });
  });
});
