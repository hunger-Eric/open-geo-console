import type { ReportTier } from "@/db/schema";

export interface WorkerPresenceRepository {
  heartbeatWorkerPresence(input: {
    instanceId: string;
    tier: ReportTier;
    deploymentVersion: string;
    ttlSeconds?: number;
  }): Promise<unknown>;
  removeWorkerPresence(instanceId: string): Promise<unknown>;
}

export interface WorkerPresenceOptions {
  instanceId: string;
  tier: ReportTier;
  deploymentVersion: string;
  intervalMs?: number;
  ttlSeconds?: number;
  onError?: (error: unknown) => void;
}

export class WorkerPresenceReporter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly repository: WorkerPresenceRepository,
    private readonly options: WorkerPresenceOptions
  ) {}

  async start(): Promise<void> {
    if (this.timer) return;
    await this.heartbeat();
    this.timer = setInterval(() => { void this.heartbeat(); }, boundedInterval(this.options.intervalMs));
    this.timer.unref?.();
  }

  async heartbeat(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.repository.heartbeatWorkerPresence({
      instanceId: this.options.instanceId,
      tier: this.options.tier,
      deploymentVersion: this.options.deploymentVersion,
      ttlSeconds: this.options.ttlSeconds ?? 120
    }).then(() => undefined).catch((error) => {
      this.options.onError?.(error);
    }).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
    await this.repository.removeWorkerPresence(this.options.instanceId).catch((error) => {
      this.options.onError?.(error);
    });
  }
}

function boundedInterval(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! >= 5_000 ? Math.min(5 * 60_000, value!) : 30_000;
}
