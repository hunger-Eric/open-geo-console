import { closeDatabase, ensureDatabase } from "@/db";
import {
  ensureQueuedJobsHaveDispatches,
  leaseJobDispatches,
  markJobDispatchPublished,
  markJobDispatchRetry
} from "@/db/commercial-dispatch";
import { createJobNotificationQueue, readJobQueueConfig } from "@/queue";
import {
  dispatchJobNotifications,
  reconcileJobNotifications,
  type JobDispatchOutboxRepository
} from "@/queue/outbox-dispatcher";

const operation = parseOperation(process.argv[2]);
const repository: JobDispatchOutboxRepository = {
  ensureQueuedJobsHaveDispatches,
  leaseJobDispatches,
  markJobDispatchPublished,
  markJobDispatchRetry
};

await ensureDatabase();
try {
  const queue = createJobNotificationQueue(readJobQueueConfig());
  const result = operation === "reconcile"
    ? await reconcileJobNotifications(repository, queue)
    : await dispatchJobNotifications(repository, queue);
  process.stdout.write(`${operation} leased=${result.leased} published=${result.published} deferred=${result.deferred} repaired=${result.repaired}\n`);
} finally {
  await closeDatabase();
}

function parseOperation(raw: string | undefined): "dispatch" | "reconcile" {
  const operation = raw?.trim().toLowerCase() || "dispatch";
  if (operation === "dispatch" || operation === "reconcile") return operation;
  throw new Error("The notification operation must be 'dispatch' or 'reconcile'.");
}
