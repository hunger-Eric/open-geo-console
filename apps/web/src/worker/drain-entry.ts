import { parseFulfillmentMode } from "@/queue/config";
import { parseWorkerTier } from "./config";

process.env.FULFILLMENT_MODE = parseFulfillmentMode(process.argv[2]);
process.env.OGC_WORKER_TIER = parseWorkerTier(process.argv[3]);
await import("./index");
