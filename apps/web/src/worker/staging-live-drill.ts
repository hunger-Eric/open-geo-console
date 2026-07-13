import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { StagingLiveDrillFaultError } from "./job-errors";

export const STAGING_LIVE_DRILL_FAULTS = ["crawl", "model", "v2_runtime", "artifact", "terminalization"] as const;
export type StagingLiveDrillFault = typeof STAGING_LIVE_DRILL_FAULTS[number];

export interface StagingLiveDrill {
  inject(input: { jobId: string; fault: StagingLiveDrillFault }): void;
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
  let consumed = false;
  return {
    inject(input) {
      if (consumed || input.jobId !== jobId || input.fault !== fault) return;
      consumed = true;
      throw new StagingLiveDrillFaultError(fault);
    }
  };
}
