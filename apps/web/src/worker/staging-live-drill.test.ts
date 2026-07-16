import { describe, expect, it } from "vitest";
import { normalizeJobError } from "./job-errors";
import { createStagingLiveDrill } from "./staging-live-drill";

const protectedPreview = {
  OGC_DEPLOYMENT_PROFILE: "staging",
  VERCEL_ENV: "preview",
  COMMERCE_MODE: "test"
} as NodeJS.ProcessEnv;

describe("protected staging live Worker drills", () => {
  it("is disabled without both process-only fields and rejects partial or unsafe configuration", () => {
    expect(createStagingLiveDrill(protectedPreview)).toBeNull();
    expect(() => createStagingLiveDrill({ ...protectedPreview, OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1" }))
      .toThrow(/both/i);
    expect(() => createStagingLiveDrill({
      ...protectedPreview, OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1", OGC_STAGING_LIVE_DRILL_FAULT: "unknown"
    })).toThrow(/fault/i);
    expect(() => createStagingLiveDrill({
      ...protectedPreview, OGC_DEPLOYMENT_PROFILE: "production", VERCEL_ENV: "production", COMMERCE_MODE: "live",
      OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1", OGC_STAGING_LIVE_DRILL_FAULT: "crawl"
    })).toThrow(/protected staging Preview/i);
  });

  it("fires once only for the selected job and normalizes as operator repairable", () => {
    const drill = createStagingLiveDrill({
      ...protectedPreview, OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1", OGC_STAGING_LIVE_DRILL_FAULT: "artifact"
    });
    expect(drill).not.toBeNull();
    expect(() => drill!.inject({ jobId: "other-job", fault: "artifact" })).not.toThrow();
    expect(() => drill!.inject({ jobId: "job-1", fault: "crawl" })).not.toThrow();
    let thrown: unknown;
    try { drill!.inject({ jobId: "job-1", fault: "artifact" }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Error);
    expect(normalizeJobError(thrown, {
      jobId: "job-1", phase: "artifact_verification", phaseAttempt: 0, resumeGeneration: 0
    })).toMatchObject({ classification: "operator_repairable", code: "staging_live_drill_artifact" });
    expect(() => drill!.inject({ jobId: "job-1", fault: "artifact" })).not.toThrow();
  });
});
