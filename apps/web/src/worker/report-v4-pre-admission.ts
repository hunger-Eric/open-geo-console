import type { ScanJobCoverage, TerminalizeScanJobInput } from "@/db/jobs";
import type { ScanJobRow } from "@/db/schema";
import { JobError } from "./job-errors";

export interface ReportV4PreAdmissionRunInput {
  job: ScanJobRow;
  signal: AbortSignal;
  remainingMs: () => number;
}

export type ReportV4PreAdmissionRunner = (
  input: ReportV4PreAdmissionRunInput
) => Promise<ScanJobCoverage>;

export class ReportV4PreAdmissionRuntimeUnavailableError extends JobError {
  constructor() {
    super(
      "The Report V4 pre-admission runtime is not configured.",
      "report_v4_pre_admission_runtime_unavailable",
      "operator_repairable"
    );
  }
}

class ReportV4PreAdmissionIdentityError extends JobError {
  constructor() {
    super(
      "A V4 pre-admission job requires the exact prospective V4 identity.",
      "report_v4_pre_admission_identity_invalid",
      "permanent"
    );
  }
}

export async function processReportV4PreAdmissionJob(input: {
  job: ScanJobRow;
  workerId: string;
  signal: AbortSignal;
  remainingMs: () => number;
  runner?: ReportV4PreAdmissionRunner;
  terminalizeJob: (
    id: string,
    workerId: string,
    terminal: TerminalizeScanJobInput
  ) => Promise<unknown>;
}): Promise<boolean> {
  if (input.job.reason !== "v4_pre_admission") return false;
  assertAdmissionIdentity(input.job);
  if (!input.runner) throw new ReportV4PreAdmissionRuntimeUnavailableError();
  const coverage = await input.runner({
    job: input.job,
    signal: input.signal,
    remainingMs: input.remainingMs
  });
  assertCoverage(coverage);
  await input.terminalizeJob(input.job.id, input.workerId, {
    stage: "completed",
    coverage
  });
  return true;
}

function assertAdmissionIdentity(job: ScanJobRow): void {
  if (job.tier !== "deep" ||
      job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "two_stage_geo_report_v4" ||
      job.recommendationReportVersion !== 4 ||
      job.artifactContract !== "combined_geo_report_v4" ||
      job.siteSnapshotId !== null ||
      job.creditReservationId !== null ||
      job.correctionId !== null ||
      job.replacementFulfillmentId !== null ||
      job.businessQuestionSetId !== null) {
    throw new ReportV4PreAdmissionIdentityError();
  }
}

function assertCoverage(coverage: ScanJobCoverage): void {
  if (![coverage.plannedPages, coverage.successfulPages, coverage.failedPages]
    .every((value) => Number.isSafeInteger(value) && value >= 0) ||
      coverage.successfulPages + coverage.failedPages > coverage.plannedPages) {
    throw new JobError(
      "The V4 pre-admission runner returned invalid coverage.",
      "report_v4_pre_admission_coverage_invalid",
      "permanent"
    );
  }
}
