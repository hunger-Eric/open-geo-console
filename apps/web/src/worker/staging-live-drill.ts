import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { StagingLiveDrillFaultError } from "./job-errors";

export const STAGING_LIVE_DRILL_FAULTS = [
  "crawl", "model", "v2_runtime", "artifact", "terminalization",
  "question_failure", "diagnosis_failure", "independent_source_read_failure"
] as const;
export type StagingLiveDrillFault = typeof STAGING_LIVE_DRILL_FAULTS[number];

type LegacyStagingLiveDrillFault = Exclude<StagingLiveDrillFault,
  "question_failure" | "diagnosis_failure" | "independent_source_read_failure">;

export type StagingLiveDrillInjection =
  | { readonly jobId: string; readonly fault: LegacyStagingLiveDrillFault }
  | { readonly jobId: string; readonly fault: "question_failure" | "diagnosis_failure"; readonly questionId: string }
  | {
      readonly jobId: string;
      readonly fault: "independent_source_read_failure";
      readonly questionId: string;
      readonly sourceId: string;
    };

export interface StagingLiveDrill {
  inject(input: StagingLiveDrillInjection): void;
}

export function createStagingLiveDrill(environment: NodeJS.ProcessEnv = process.env): StagingLiveDrill | null {
  const jobId = environment.OGC_STAGING_LIVE_DRILL_JOB_ID?.trim() ?? "";
  const rawFault = environment.OGC_STAGING_LIVE_DRILL_FAULT?.trim() ?? "";
  if (!jobId && !rawFault) return null;
  if (!jobId || !rawFault) throw new Error("Protected staging live Worker drills require both job ID and fault.");
  if (!STAGING_LIVE_DRILL_FAULTS.includes(rawFault as StagingLiveDrillFault)) {
    throw new Error("Protected staging live Worker drill fault is not recognized.");
  }
  assertProtectedStagingCommercePreview(environment);
  const fault = rawFault as StagingLiveDrillFault;
  const target = parseTarget(environment, fault);
  let remaining = target.occurrences;
  return {
    inject(input) {
      if (remaining === 0 || input.jobId !== jobId || input.fault !== fault) return;
      if (target.questionId && (!("questionId" in input) || input.questionId !== target.questionId)) return;
      if (target.sourceId && (!("sourceId" in input) || input.sourceId !== target.sourceId)) return;
      remaining -= 1;
      throw new StagingLiveDrillFaultError(fault);
    }
  };
}

function parseTarget(
  environment: NodeJS.ProcessEnv,
  fault: StagingLiveDrillFault
): { readonly questionId?: string; readonly sourceId?: string; readonly occurrences: number } {
  const questionId = environment.OGC_STAGING_LIVE_DRILL_QUESTION_ID?.trim() ?? "";
  const sourceId = environment.OGC_STAGING_LIVE_DRILL_SOURCE_ID?.trim() ?? "";
  const occurrenceText = environment.OGC_STAGING_LIVE_DRILL_OCCURRENCES?.trim() ?? "";
  const isQuestionTargeted = fault === "question_failure" || fault === "diagnosis_failure"
    || fault === "independent_source_read_failure";
  if (!isQuestionTargeted) {
    if (questionId || sourceId || occurrenceText) {
      throw new Error("Legacy protected staging live Worker drills do not accept V4 target or occurrence fields.");
    }
    return { occurrences: 1 };
  }
  if (!questionId) throw new Error("A V4 protected staging live Worker drill requires an exact question ID.");
  const expectedOccurrences = fault === "independent_source_read_failure" ? 1 : 2;
  if (occurrenceText !== String(expectedOccurrences)) {
    throw new Error(`The ${fault} protected staging drill occurrence budget must be exactly ${expectedOccurrences}.`);
  }
  if (fault === "independent_source_read_failure") {
    if (!sourceId) throw new Error("The independent source read drill requires an exact source ID.");
    return { questionId, sourceId, occurrences: expectedOccurrences };
  }
  if (sourceId) throw new Error(`${fault} does not accept a source target.`);
  return { questionId, occurrences: expectedOccurrences };
}
