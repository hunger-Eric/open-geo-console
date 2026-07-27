import { describe, expect, it, vi } from "vitest";
import { CloudflareJobNotificationQueue } from "./cloudflare";
import type { CloudflareQueueConfig } from "./config";

const config: CloudflareQueueConfig = {
  accountId: "account",
  apiToken: "secret-token",
  freeQueueId: "free-id",
  deepQueueId: "deep-id",
  apiBaseUrl: "https://api.example.test/client/v4",
  requestTimeoutMs: 1_000
};

describe("Cloudflare job notification queue", () => {
  it("publishes only the minimal JSON hint to the tier queue", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ success: true, result: {} });
    });
    const queue = new CloudflareJobNotificationQueue(config, fetchImpl as typeof fetch);

    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/queues/deep-id/messages");
    expect(JSON.parse(String(init?.body))).toEqual({
      body: { version: 1, dispatchId: "dispatch_1", tier: "deep" },
      content_type: "json"
    });
  });

  it("decodes Cloudflare JSON bodies and preserves invalid messages as poison hints", async () => {
    const valid = Buffer.from(JSON.stringify({ version: 1, dispatchId: "dispatch_2", tier: "free" })).toString("base64");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({
        success: true,
        result: {
          messages: [
            { id: "m1", lease_id: "l1", attempts: 2, timestamp_ms: 100, body: valid },
            { id: "m2", lease_id: "l2", attempts: 1, timestamp_ms: 200, body: "not-json" }
          ]
        }
      });
    });
    const queue = new CloudflareJobNotificationQueue(config, fetchImpl as typeof fetch);

    const messages = await queue.pull("free", { batchSize: 2 });
    expect(messages[0].notification?.dispatchId).toBe("dispatch_2");
    expect(messages[1].notification).toBeNull();
  });

  it("uses the combined ack endpoint for acknowledgement and retry", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ success: true, result: {} });
    });
    const queue = new CloudflareJobNotificationQueue(config, fetchImpl as typeof fetch);

    await queue.acknowledge("free", ["lease-1", "lease-1"]);
    await queue.retry("free", [{ leaseId: "lease-2", delaySeconds: 60 }]);

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      acks: [{ lease_id: "lease-1" }],
      retries: []
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      acks: [],
      retries: [{ lease_id: "lease-2", delay_seconds: 60 }]
    });
  });

  it("does not expose the API response or token in request failures", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({
        success: false,
        errors: [{ code: 7003, message: "secret-token must not leak" }]
      }, { status: 400 });
    });
    const queue = new CloudflareJobNotificationQueue(config, fetchImpl as typeof fetch);

    await expect(queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "free" }))
      .rejects.toThrow("Cloudflare Queue request failed (7003).");
  });
});
