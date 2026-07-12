import { describe, expect, it } from "vitest";
import { parseFulfillmentMode, readJobQueueConfig } from "./config";

describe("queue runtime configuration", () => {
  it("defaults to a no-op notification adapter and batch fulfillment", () => {
    expect(readJobQueueConfig({ NODE_ENV: "test" })).toEqual({ provider: "noop", fulfillmentMode: "batch_24h" });
  });

  it("fails closed when Cloudflare Queue credentials are incomplete", () => {
    expect(() => readJobQueueConfig({ NODE_ENV: "test", OGC_JOB_QUEUE_PROVIDER: "cloudflare" }))
      .toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("supports PostgreSQL polling for a persistent self-hosted Worker", () => {
    expect(readJobQueueConfig({ OGC_JOB_QUEUE_PROVIDER: "postgres", FULFILLMENT_MODE: "realtime" }))
      .toEqual({ provider: "postgres", fulfillmentMode: "realtime" });
  });

  it("accepts only the two fulfillment modes", () => {
    expect(parseFulfillmentMode(" realtime ")).toBe("realtime");
    expect(parseFulfillmentMode(undefined)).toBe("batch_24h");
    expect(() => parseFulfillmentMode("instant")).toThrow(/FULFILLMENT_MODE/);
  });
});
