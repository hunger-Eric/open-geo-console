import { parseWorkerTier } from "./config";

process.env.OGC_WORKER_TIER = parseWorkerTier(process.argv[2]);
await import("./index");
