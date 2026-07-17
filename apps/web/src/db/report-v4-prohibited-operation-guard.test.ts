import { describe, expect, it } from "vitest";
import * as repositoryModule from "./report-v4-prohibited-operation-guard";
import {
  armReportV4ProhibitedOperationGuard,
  reportV4ProhibitedOperationEventUnitId,
  reportV4ProhibitedOperationGuardRunId,
  type ArmReportV4ProhibitedOperationGuardInput
} from "./report-v4-prohibited-operation-guard";

const staging = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as unknown as NodeJS.ProcessEnv;
const input: ArmReportV4ProhibitedOperationGuardInput = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  scenarioId: "22222222-2222-4222-8222-222222222222",
  jobId: "job-safe-1",
  workerGitSha: "a".repeat(40)
};

describe("Report V4 DB-authoritative prohibited-operation guard production API", () => {
  it("does not export injected-store factories or capability authorizers", () => {
    expect(Object.keys(repositoryModule)).not.toEqual(expect.arrayContaining([
      "createReportV4ProhibitedOperationGuardRepository",
      "createPostgresReportV4ProhibitedOperationGuardStore",
      "authorizeReportV4ProhibitedOperationGuardCapability"
    ]));
    expect(repositoryModule.armReportV4ProhibitedOperationGuard).toBeTypeOf("function");
  });

  it("refuses non-protected production before opening persistence", async () => {
    await expect(armReportV4ProhibitedOperationGuard(input, {
      VERCEL_ENV: "production", OGC_DEPLOYMENT_PROFILE: "production", COMMERCE_MODE: "live"
    } as unknown as NodeJS.ProcessEnv)).rejects.toThrow(/protected staging preview/iu);
  });

  it("rejects URL-shaped IDs, unknown fields, and wrong worker SHA before opening persistence", async () => {
    await expect(armReportV4ProhibitedOperationGuard({ ...input,
      jobId: "https://user:password@example.test" }, staging)).rejects.toThrow(/hash-safe/u);
    await expect(armReportV4ProhibitedOperationGuard({ ...input,
      workerGitSha: "A".repeat(40) }, staging)).rejects.toThrow(/Git SHA/u);
    await expect(armReportV4ProhibitedOperationGuard({ ...input,
      extra: "secret" } as unknown as ArmReportV4ProhibitedOperationGuardInput, staging)).rejects.toThrow(/strict contract/u);
  });

  it("derives deterministic hash-safe run and event identities", () => {
    const runId = reportV4ProhibitedOperationGuardRunId(input);
    const eventId = reportV4ProhibitedOperationEventUnitId(input.jobId, "correction_prepare");
    expect(runId).toMatch(/^[a-f0-9]{64}$/u);
    expect(eventId).toMatch(/^[a-f0-9]{64}$/u);
    expect(reportV4ProhibitedOperationGuardRunId({ ...input })).toBe(runId);
    expect(`${runId}${eventId}`).not.toMatch(/https?:|password|secret|token/iu);
  });
});
