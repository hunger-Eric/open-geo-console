import { randomUUID } from "node:crypto";
import {
  finishBatchRun,
  heartbeatWorkerPresence,
  removeWorkerPresence,
  startBatchRun
} from "../db/commercial-operations";
import { claimScanJob } from "../db/jobs";
import { closeDatabase, ensureDatabase } from "../db";
import { createJobNotificationQueue, readJobQueueConfig } from "../queue";
import { processScanJob } from "./processor";
import { positiveInteger, readWorkerConfig } from "./config";
import { runPostgresPollingLane, runRealtimeLane } from "./drain";
import { runRecordedBatchDrain } from "./drain-batch";
import { WorkerPresenceReporter } from "./presence";
import { createStagingLiveDrill } from "./staging-live-drill";

const config = readWorkerConfig();
const liveDrill = createStagingLiveDrill();
const workerId = `ogc-worker-${config.tier}-${randomUUID()}`;
let stopping = false;

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

await ensureDatabase();
process.stdout.write(`Open GEO Console ${config.tier} worker ${workerId} is ready.\n`);

const queueConfig = readJobQueueConfig();
const presence = new WorkerPresenceReporter({ heartbeatWorkerPresence, removeWorkerPresence }, {
  instanceId: workerId,
  tier: config.tier,
  deploymentVersion: process.env.OGC_DEPLOYMENT_VERSION?.trim() || "local-worker",
  onError: () => process.stderr.write("Worker presence heartbeat failed.\n")
});
const runner = {
  claim: claimScanJob,
  process: async (job: NonNullable<Awaited<ReturnType<typeof claimScanJob>>>, owner: string) => {
    process.stdout.write(`Processing ${job.tier} AI report job ${job.id}.\n`);
    await processScanJob(job, owner, { liveDrill: liveDrill ?? undefined });
  }
};

await presence.start();
try {
  if (queueConfig.fulfillmentMode === "batch_24h") {
    const result = await runRecordedBatchDrain({
      tier: config.tier,
      workerIdPrefix: workerId,
      runner,
      batchRuns: { startBatchRun, finishBatchRun },
      shouldStop: () => stopping
    });
    process.stdout.write(`Batch drain claimed ${result.claimedJobs} ${config.tier} job(s).\n`);
  } else {
    if (queueConfig.provider === "postgres") {
      await runPostgresPollingLane({
        tier: config.tier,
        workerIdPrefix: workerId,
        runner,
        pollMs: positiveInteger(process.env.OGC_WORKER_POLL_MS, 5_000),
        shouldStop: () => stopping,
        onCycleError: () => process.stderr.write("The PostgreSQL polling cycle failed and will retry.\n"),
        onProcessingError: () => process.stderr.write("A claimed report job exited unexpectedly.\n")
      });
    } else {
      if (queueConfig.provider === "noop") {
        throw new Error("Realtime fulfillment requires a Cloudflare, local, or PostgreSQL queue provider.");
      }
      await runRealtimeLane({
        tier: config.tier,
        workerIdPrefix: workerId,
        runner,
        queue: createJobNotificationQueue(queueConfig),
        queuePollMs: positiveInteger(process.env.OGC_QUEUE_PULL_MS, 30_000),
        shouldStop: () => stopping,
        onCycleError: () => process.stderr.write("The job notification cycle failed and will retry.\n"),
        onProcessingError: () => process.stderr.write("A claimed report job exited unexpectedly.\n")
      });
    }
  }
} finally {
  await presence.stop();
  await closeDatabase();
}

process.stdout.write("Open GEO Console worker stopped.\n");
