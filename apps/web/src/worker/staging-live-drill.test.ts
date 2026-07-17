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

  it("requires exact bounded V4 targets and rejects production or incomplete drill configuration", () => {
    const exactQuestion = {
      ...protectedPreview,
      OGC_STAGING_LIVE_DRILL_JOB_ID: "core-job-1",
      OGC_STAGING_LIVE_DRILL_FAULT: "question_failure",
      OGC_STAGING_LIVE_DRILL_QUESTION_ID: "question-2",
      OGC_STAGING_LIVE_DRILL_OCCURRENCES: "2"
    } as NodeJS.ProcessEnv;
    expect(createStagingLiveDrill(exactQuestion)).not.toBeNull();
    expect(() => createStagingLiveDrill({ ...exactQuestion, OGC_STAGING_LIVE_DRILL_QUESTION_ID: "" }))
      .toThrow(/question/i);
    expect(() => createStagingLiveDrill({ ...exactQuestion, OGC_STAGING_LIVE_DRILL_OCCURRENCES: "1" }))
      .toThrow(/occurrence|budget/i);
    expect(() => createStagingLiveDrill({
      ...exactQuestion,
      OGC_DEPLOYMENT_PROFILE: "production",
      VERCEL_ENV: "production",
      COMMERCE_MODE: "live"
    })).toThrow(/protected staging Preview/i);

    const source = {
      ...protectedPreview,
      OGC_STAGING_LIVE_DRILL_JOB_ID: "enhancement-job-1",
      OGC_STAGING_LIVE_DRILL_FAULT: "independent_source_read_failure",
      OGC_STAGING_LIVE_DRILL_QUESTION_ID: "question-2",
      OGC_STAGING_LIVE_DRILL_SOURCE_ID: "source-4",
      OGC_STAGING_LIVE_DRILL_OCCURRENCES: "1"
    } as NodeJS.ProcessEnv;
    expect(createStagingLiveDrill(source)).not.toBeNull();
    expect(() => createStagingLiveDrill({ ...source, OGC_STAGING_LIVE_DRILL_SOURCE_ID: "" }))
      .toThrow(/source/i);
  });

  it("consumes a V4 occurrence budget only for the exact job, question, source, and fault", () => {
    const drill = createStagingLiveDrill({
      ...protectedPreview,
      OGC_STAGING_LIVE_DRILL_JOB_ID: "enhancement-job-1",
      OGC_STAGING_LIVE_DRILL_FAULT: "diagnosis_failure",
      OGC_STAGING_LIVE_DRILL_QUESTION_ID: "question-2",
      OGC_STAGING_LIVE_DRILL_OCCURRENCES: "2"
    });
    expect(drill).not.toBeNull();
    expect(() => drill!.inject({
      jobId: "other-job", fault: "diagnosis_failure", questionId: "question-2"
    })).not.toThrow();
    expect(() => drill!.inject({
      jobId: "enhancement-job-1", fault: "diagnosis_failure", questionId: "other-question"
    })).not.toThrow();
    expect(() => drill!.inject({
      jobId: "enhancement-job-1", fault: "question_failure", questionId: "question-2"
    })).not.toThrow();
    expect(() => drill!.inject({
      jobId: "enhancement-job-1", fault: "diagnosis_failure", questionId: "question-2"
    })).toThrow(/diagnosis_failure/i);
    expect(() => drill!.inject({
      jobId: "enhancement-job-1", fault: "diagnosis_failure", questionId: "question-2"
    })).toThrow(/diagnosis_failure/i);
    expect(() => drill!.inject({
      jobId: "enhancement-job-1", fault: "diagnosis_failure", questionId: "question-2"
    })).not.toThrow();
  });
});
