import type { ReportTier } from "@/db/schema";
import type { CloudflareQueueConfig } from "./config";
import {
  assertJobNotification,
  parseJobNotification,
  type JobNotificationQueue,
  type JobNotificationV1,
  type PulledJobNotification,
  type QueuePullOptions,
  type QueueRetry
} from "./job-notification";

interface CloudflareEnvelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
}

interface CloudflarePulledMessage {
  id?: string;
  lease_id?: string;
  attempts?: number;
  timestamp_ms?: number;
  body?: unknown;
}

export class CloudflareJobNotificationQueue implements JobNotificationQueue {
  constructor(
    private readonly config: CloudflareQueueConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async publish(notification: JobNotificationV1): Promise<void> {
    assertJobNotification(notification);
    await this.request(notification.tier, "", {
      body: notification,
      content_type: "json"
    });
  }

  async pull(tier: ReportTier, options: QueuePullOptions = {}): Promise<readonly PulledJobNotification[]> {
    const batchSize = boundedInteger(options.batchSize, 1, 100, 1);
    const visibilityTimeoutMs = boundedInteger(options.visibilityTimeoutMs, 1_000, 43_200_000, 30_000);
    const result = await this.request<{ messages?: CloudflarePulledMessage[] }>(tier, "/pull", {
      batch_size: batchSize,
      visibility_timeout_ms: visibilityTimeoutMs
    });

    return (result?.messages ?? []).flatMap((message) => {
      if (!message.id || !message.lease_id) return [];
      return [{
        messageId: message.id,
        leaseId: message.lease_id,
        attempts: nonNegativeInteger(message.attempts),
        timestampMs: nonNegativeInteger(message.timestamp_ms),
        notification: decodeNotification(message.body)
      }];
    });
  }

  async acknowledge(tier: ReportTier, leaseIds: readonly string[]): Promise<void> {
    const unique = uniqueLeaseIds(leaseIds);
    if (unique.length === 0) return;
    await this.request(tier, "/ack", {
      acks: unique.map((leaseId) => ({ lease_id: leaseId })),
      retries: []
    });
  }

  async retry(tier: ReportTier, retries: readonly QueueRetry[]): Promise<void> {
    const normalized = uniqueRetries(retries);
    if (normalized.length === 0) return;
    await this.request(tier, "/ack", {
      acks: [],
      retries: normalized.map(({ leaseId, delaySeconds }) => ({
        lease_id: leaseId,
        ...(delaySeconds === undefined ? {} : { delay_seconds: delaySeconds })
      }))
    });
  }

  private async request<T>(tier: ReportTier, action: "" | "/pull" | "/ack", body: unknown): Promise<T | undefined> {
    const queueId = tier === "free" ? this.config.freeQueueId : this.config.deepQueueId;
    const baseUrl = this.config.apiBaseUrl.replace(/\/$/, "");
    const response = await this.fetchImpl(
      `${baseUrl}/accounts/${encodeURIComponent(this.config.accountId)}/queues/${encodeURIComponent(queueId)}/messages${action}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs)
      }
    );

    const payload = await parseEnvelope<T>(response);
    if (!response.ok || payload.success !== true) {
      const code = payload.errors?.[0]?.code;
      throw new Error(code ? `Cloudflare Queue request failed (${code}).` : "Cloudflare Queue request failed.");
    }
    return payload.result;
  }
}

async function parseEnvelope<T>(response: Response): Promise<CloudflareEnvelope<T>> {
  try {
    return await response.json() as CloudflareEnvelope<T>;
  } catch {
    return { success: false };
  }
}

function decodeNotification(body: unknown): JobNotificationV1 | null {
  if (typeof body !== "string") return parseJobNotification(body);
  const direct = parseJson(body);
  if (direct !== null) return parseJobNotification(direct);
  try {
    return parseJobNotification(parseJson(Buffer.from(body, "base64").toString("utf8")));
  } catch {
    return null;
  }
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function boundedInteger(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return Number.isSafeInteger(value) && value! >= minimum && value! <= maximum ? value! : fallback;
}

function nonNegativeInteger(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! >= 0 ? value! : 0;
}

function uniqueLeaseIds(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function uniqueRetries(values: readonly QueueRetry[]): QueueRetry[] {
  const unique = new Map<string, QueueRetry>();
  for (const value of values) {
    if (!value.leaseId) continue;
    const delaySeconds = value.delaySeconds === undefined
      ? undefined
      : Math.max(0, Math.min(43_200, Math.trunc(value.delaySeconds)));
    unique.set(value.leaseId, { leaseId: value.leaseId, delaySeconds });
  }
  return [...unique.values()];
}
