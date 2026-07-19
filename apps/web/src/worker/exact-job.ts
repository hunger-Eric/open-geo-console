import type { ExactScanJobIdentity } from "@/db/jobs";
import type { ScanJobRow } from "@/db/schema";

export interface ExactJobInput extends ExactScanJobIdentity { workerId: string; }
export interface ExactJobDependencies {
  prepareStaging: () => Promise<unknown>;
  prepareV4: () => Promise<unknown>;
  getJob: (id: string) => Promise<ScanJobRow | null>;
  claim: (workerId: string, identity: ExactScanJobIdentity) => Promise<ScanJobRow | null>;
  process: (job: ScanJobRow, workerId: string) => Promise<void>;
}

export async function runProtectedExactJob(input: ExactJobInput, dependencies: ExactJobDependencies): Promise<void> {
  await dependencies.prepareStaging();
  await dependencies.prepareV4();
  const candidate = await dependencies.getJob(input.jobId);
  assertExactCandidate(candidate, input);
  const claimed = await dependencies.claim(input.workerId, identity(input));
  if (!claimed) throw new Error("The exact scan job is not eligible for claim.");
  if (claimed.id !== input.jobId || claimed.reportId !== input.reportId || claimed.tier !== input.tier) {
    throw new Error("The exact scan-job claim returned a mismatched identity.");
  }
  await dependencies.process(claimed, input.workerId);
}

function assertExactCandidate(candidate: ScanJobRow | null, input: ExactJobInput): asserts candidate is ScanJobRow {
  if (!candidate || candidate.id !== input.jobId || candidate.reportId !== input.reportId || candidate.tier !== input.tier) throw new Error("The exact scan-job identity is unavailable.");
  if (candidate.productContract !== "recommendation_forensics_v1" || candidate.artifactContract !== "combined_geo_report_v4" ||
      candidate.fulfillmentMethodology !== "two_stage_geo_report_v4" || candidate.recommendationReportVersion !== 4 ||
      !["v4_pre_admission", "standard", "v4_diagnosis_enhancement"].includes(candidate.reason)) throw new Error("The exact scan job does not satisfy the locked V4 contract.");
}

function identity(input: ExactJobInput): ExactScanJobIdentity { return { jobId: input.jobId, reportId: input.reportId, tier: input.tier }; }
