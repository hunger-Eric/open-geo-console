import { randomUUID } from "node:crypto";
import { ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { claimExactScanJob, getScanJob } from "@/db/jobs";
import { parseWorkerTier } from "@/worker/config";
import { runProtectedExactJob } from "@/worker/exact-job";
import { processScanJob } from "@/worker/processor";
import { prepareWorkerStartup } from "@/worker/report-v4-startup-readiness";
import { prepareStagingCommand } from "./staging-guard";

const [jobId, reportId, rawTier] = process.argv.slice(2);
if (!jobId?.trim() || !reportId?.trim()) throw new Error("Usage: staging-exact-worker <jobId> <reportId> <free|deep>");
const tier = parseWorkerTier(rawTier);
const workerId = `ogc-exact-${tier}-${randomUUID()}`;
await runProtectedExactJob({ jobId, reportId, tier, workerId }, {
  prepareStaging: () => prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus }),
  prepareV4: () => prepareWorkerStartup({ ensureDatabase }), getJob: getScanJob, claim: claimExactScanJob,
  process: processScanJob
});
process.stdout.write(`Exact ${tier} scan job ${jobId} completed.\n`);
