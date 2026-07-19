import type { ExactScanJobIdentity } from "@/db/jobs";
import type { ScanJobRow } from "@/db/schema";

export interface ExactPreviewJobInput extends ExactScanJobIdentity { workerId: string; }
export interface ExactPreviewJobDependencies {
  prepareStaging: () => Promise<unknown>;
  prepareWorker: () => Promise<unknown>;
  getJob: (id: string) => Promise<ScanJobRow | null>;
  claim: (workerId: string, identity: ExactScanJobIdentity) => Promise<ScanJobRow | null>;
  process: (job: ScanJobRow, workerId: string) => Promise<void>;
}

export async function runProtectedExactPreviewJob(input: ExactPreviewJobInput, dependencies: ExactPreviewJobDependencies): Promise<void> {
  await dependencies.prepareStaging();
  await dependencies.prepareWorker();
  const candidate = await dependencies.getJob(input.jobId);
  assertPreviewCandidate(candidate, input);
  const claimed = await dependencies.claim(input.workerId, identity(input));
  if (!claimed) throw new Error("The exact preview scan job is not eligible for claim.");
  if (claimed.id !== input.jobId || claimed.reportId !== input.reportId || claimed.tier !== input.tier) {
    throw new Error("The exact preview scan-job claim returned a mismatched identity.");
  }
  await dependencies.process(claimed, input.workerId);
}

function assertPreviewCandidate(candidate: ScanJobRow | null, input: ExactPreviewJobInput): asserts candidate is ScanJobRow {
  if (input.tier !== "free" || !candidate || candidate.id !== input.jobId || candidate.reportId !== input.reportId || candidate.tier !== input.tier) {
    throw new Error("The exact preview scan-job identity is unavailable.");
  }
  if (candidate.productContract !== "legacy_website_audit_v1" || candidate.fulfillmentMethodology !== null
      || candidate.recommendationReportVersion !== null || candidate.artifactContract !== null
      || candidate.creditReservationId !== null || !["standard", "staging_regeneration"].includes(candidate.reason)) {
    throw new Error("The exact preview scan job does not satisfy the locked legacy-free contract.");
  }
}

function identity(input: ExactPreviewJobInput): ExactScanJobIdentity {
  return { jobId: input.jobId, reportId: input.reportId, tier: input.tier };
}
