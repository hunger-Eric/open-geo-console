import { randomUUID } from "node:crypto";
import { closeDatabase, ensureDatabase } from "@/db";
import {
  finishBatchRun,
  heartbeatWorkerPresence,
  removeWorkerPresence,
  startBatchRun
} from "@/db/commercial-operations";
import { claimScanJob } from "@/db/jobs";
import { positiveInteger, parseWorkerTier } from "@/worker/config";
import { runRecordedBatchDrain } from "@/worker/drain-batch";
import { WorkerPresenceReporter } from "@/worker/presence";
import { processScanJob } from "@/worker/processor";

const tier = parseWorkerTier(process.argv[2]);
const replicas = positiveInteger(
  tier === "free" ? process.env.OGC_BATCH_FREE_REPLICAS : process.env.OGC_BATCH_DEEP_REPLICAS,
  1
);
process.env.OGC_DATABASE_POOL_SIZE ||= String(Math.min(3, replicas + 1));

const instanceId = `ogc-batch-${tier}-${randomUUID()}`;
const presence = new WorkerPresenceReporter({ heartbeatWorkerPresence, removeWorkerPresence }, {
  instanceId,
  tier,
  deploymentVersion: process.env.OGC_DEPLOYMENT_VERSION?.trim() || "local-batch",
  onError: () => process.stderr.write("Worker presence heartbeat failed.\n")
});

await ensureDatabase();
await presence.start();
try {
  const result = await runRecordedBatchDrain({
    tier,
    replicas,
    workerIdPrefix: instanceId,
    batchRuns: { startBatchRun, finishBatchRun },
    runner: {
      claim: claimScanJob,
      process: async (job, workerId) => {
        process.stdout.write(`Processing ${job.tier} AI report job ${job.id}.\n`);
        await processScanJob(job, workerId);
      }
    },
    onProcessingError: () => process.stderr.write("A claimed report job exited unexpectedly.\n")
  });
  process.stdout.write(`Batch drain tier=${tier} replicas=${replicas} claimed=${result.claimedJobs} completed=${result.completedJobs} failed=${result.failedJobs}\n`);
} finally {
  await presence.stop();
  await closeDatabase();
}
