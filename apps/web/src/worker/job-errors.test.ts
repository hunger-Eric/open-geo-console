import { describe, expect, it } from "vitest";
import { normalizeJobError, PublicSourceRuntimeError, redactDiagnostic, retryDelayMs } from "./job-errors";

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
});
