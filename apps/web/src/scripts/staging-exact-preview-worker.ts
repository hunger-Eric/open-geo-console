import { randomUUID } from "node:crypto";
import { ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { claimExactScanJob, getScanJob } from "@/db/jobs";
import { runProtectedExactPreviewJob } from "@/worker/exact-preview-job";
import { processScanJob } from "@/worker/processor";
import { prepareWorkerStartup } from "@/worker/report-v4-startup-readiness";
import { prepareStagingCommand } from "./staging-guard";

const [jobId, reportId] = process.argv.slice(2);
if (!jobId?.trim() || !reportId?.trim()) throw new Error("Usage: staging-exact-preview-worker <jobId> <reportId>");
const workerId = `ogc-exact-preview-free-${randomUUID()}`;
await runProtectedExactPreviewJob({ jobId, reportId, tier: "free", workerId }, {
  prepareStaging: () => prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus }),
  prepareWorker: () => prepareWorkerStartup({ ensureDatabase }), getJob: getScanJob, claim: claimExactScanJob,
  process: processScanJob
});
process.stdout.write(`Exact preview free scan job ${jobId} completed.\n`);
