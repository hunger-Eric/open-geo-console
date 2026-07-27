import { ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { parseWorkerTier } from "@/worker/config";
import { prepareStagingCommand } from "./staging-guard";

process.env.OGC_WORKER_TIER = parseWorkerTier(process.argv[2]);
const summary = await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
process.stdout.write(`Staging worker guard ${JSON.stringify({ ...summary, tier: process.env.OGC_WORKER_TIER })}\n`);
await import("@/worker/index");
