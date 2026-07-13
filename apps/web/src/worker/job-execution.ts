export class JobDeadlineExceededError extends Error {
  constructor(readonly deadlineMs: number) {
    super(`The report job exceeded its hard deadline of ${Math.ceil(deadlineMs / 1_000)} seconds.`);
    this.name = "JobDeadlineExceededError";
  }
}

export interface JobExecutionLeaseOptions {
  hardDeadlineMs: number;
  heartbeatIntervalMs?: number;
  heartbeat: () => Promise<boolean>;
  now?: () => number;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

/**
 * A job owns its lease only while it is making checkpointed progress.  The
 * hard deadline aborts all signal-aware work before the lease can be renewed
 * forever by a stalled network/model operation.
 */
export class JobExecutionLease {
  readonly controller = new AbortController();
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly setIntervalImpl: typeof setInterval;
  private readonly clearIntervalImpl: typeof clearInterval;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private lastCheckpointAt: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatInFlight = false;

  constructor(private readonly options: JobExecutionLeaseOptions) {
    if (!Number.isSafeInteger(options.hardDeadlineMs) || options.hardDeadlineMs < 1_000) {
      throw new Error("OGC_JOB_HARD_DEADLINE_MS must be an integer of at least 1000.");
    }
    this.now = options.now ?? Date.now;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    this.setIntervalImpl = options.setIntervalImpl ?? setInterval;
    this.clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
    this.lastCheckpointAt = this.now();
  }

  start(): void {
    this.deadlineTimer = this.setTimeoutImpl(() => {
      this.controller.abort(new JobDeadlineExceededError(this.options.hardDeadlineMs));
    }, this.options.hardDeadlineMs);
    this.heartbeatTimer = this.setIntervalImpl(() => { void this.heartbeatIfProgressing(); }, this.heartbeatIntervalMs);
  }

  checkpointed(): void {
    this.throwIfAborted();
    this.lastCheckpointAt = this.now();
  }

  throwIfAborted(): void {
    if (this.controller.signal.aborted) {
      throw this.controller.signal.reason instanceof Error
        ? this.controller.signal.reason
        : new JobDeadlineExceededError(this.options.hardDeadlineMs);
    }
  }

  stop(): void {
    if (this.heartbeatTimer) this.clearIntervalImpl(this.heartbeatTimer);
    if (this.deadlineTimer) this.clearTimeoutImpl(this.deadlineTimer);
  }

  private async heartbeatIfProgressing(): Promise<void> {
    if (this.heartbeatInFlight || this.controller.signal.aborted) return;
    // Never renew beyond the latest phase checkpoint's hard-deadline window.
    if (this.now() - this.lastCheckpointAt >= this.options.hardDeadlineMs) return;
    this.heartbeatInFlight = true;
    try {
      await this.options.heartbeat();
    } catch {
      // A transient heartbeat failure must not hide the underlying job result.
    } finally {
      this.heartbeatInFlight = false;
    }
  }
}

export function configuredJobHardDeadlineMs(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(environment.OGC_JOB_HARD_DEADLINE_MS);
  return Number.isSafeInteger(configured) && configured >= 1_000 ? configured : 15 * 60_000;
}
