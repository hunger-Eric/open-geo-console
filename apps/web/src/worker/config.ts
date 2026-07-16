import type { ReportTier } from "@/db/schema";

export interface WorkerConfig {
  tier: ReportTier;
  pollMs: number;
}

export function readWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    tier: parseWorkerTier(environment.OGC_WORKER_TIER),
    pollMs: positiveInteger(environment.OGC_WORKER_POLL_MS, 1500)
  };
}

export function parseWorkerTier(raw: string | undefined): ReportTier {
  const tier = raw?.trim().toLowerCase();
  if (tier === "free" || tier === "deep") return tier;
  throw new Error("OGC_WORKER_TIER is required and must be either 'free' or 'deep'.");
}

export function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
