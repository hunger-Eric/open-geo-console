import { randomUUID } from "node:crypto";
import { claimScanJob } from "../db/jobs";
import { closeDatabase, ensureDatabase } from "../db";
import { processScanJob } from "./processor";
import { readWorkerConfig } from "./config";

const config = readWorkerConfig();
const workerId = `ogc-worker-${config.tier}-${randomUUID()}`;
let stopping = false;

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

// Remote serverless PostgreSQL clients may keep their connection bootstrap
// handles unref'ed. Keep Node alive until migrations finish so a production
// worker cannot exit with an unsettled top-level await before it is ready.
const databaseStartupHold = setInterval(() => undefined, 1_000);
try {
  await ensureDatabase();
} finally {
  clearInterval(databaseStartupHold);
}
process.stdout.write(`Open GEO Console ${config.tier} worker ${workerId} is ready.\n`);

while (!stopping) {
  const job = await claimScanJob(workerId, config.tier);
  if (job) {
    process.stdout.write(`Processing ${job.tier} AI report job ${job.id}.\n`);
    await processScanJob(job, workerId);
  } else {
    await delay(config.pollMs);
  }
}

await closeDatabase();
process.stdout.write("Open GEO Console worker stopped.\n");

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
