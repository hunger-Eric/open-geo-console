import { describe, expect, it, vi } from "vitest";
import { prepareStagingCommand } from "./staging-guard";

describe("staging command guard", () => {
  it("returns only non-sensitive startup identity after database validation", async () => {
    const ensureDatabase = vi.fn().mockResolvedValue(undefined);
    const summary = await prepareStagingCommand({
      environment: { OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test", FULFILLMENT_MODE: "batch_24h" },
      ensureDatabase,
      getDatabaseStatus: async () => ({ profile: "staging", fingerprint: "0123456789abcdef" })
    });
    expect(ensureDatabase).toHaveBeenCalledOnce();
    expect(summary).toEqual({
      profile: "staging",
      databaseFingerprint: "0123456789abcdef",
      commerceMode: "test",
      fulfillmentMode: "batch_24h"
    });
    expect(JSON.stringify(summary)).not.toMatch(/postgres|database_url|api.?key/i);
  });

  it("rejects live commerce and a non-staging database", async () => {
    await expect(prepareStagingCommand({
      environment: { OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "live" },
      ensureDatabase: async () => undefined,
      getDatabaseStatus: async () => ({ profile: "staging", fingerprint: "fingerprint" })
    })).rejects.toThrow("live commerce");
    await expect(prepareStagingCommand({
      environment: { OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" },
      ensureDatabase: async () => undefined,
      getDatabaseStatus: async () => ({ profile: "production", fingerprint: "fingerprint" })
    })).rejects.toThrow("non-staging database");
  });
});
