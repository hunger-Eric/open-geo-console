import { describe, expect, it, vi } from "vitest";
import {runStagingProviderProbe} from "@/commerce/staging-provider-probe";

describe("protected staging provider probe", () => {
  it("returns only allowlisted provider evidence", async () => {
    const airwallex = vi.fn(async () => ({
      provider: "airwallex" as const,
      providerCheckoutId: "int_fixture",
      clientSecret: "must-not-leak",
      currency: "CNY" as const,
      environment: "demo" as const
    }));
    const resend = vi.fn(async () => ({ provider: "resend" as const, providerEmailId: "email_fixture" }));
    const result = await runStagingProviderProbe({ paymentIntentId: "int_fixture", orderId: "order_fixture" }, {
      prepare: async () => ({ profile: "staging", databaseFingerprint: "db", commerceMode: "test", fulfillmentMode: "batch_24h" }),
      airwallex: { getHostedCheckout: airwallex },
      resend: { send: resend },
      environment: { OGC_TEST_EMAIL_RECIPIENT: "operator@example.test" }
    });

    expect(result).toEqual({
      profile: "staging",
      airwallex: { retrieved: true, paymentIntentId: "int_fixture" },
      resend: { sent: true, providerEmailId: "email_fixture" }
    });
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|operator@example\.test|clientSecret/i);
  });

  it("rejects a mismatched intent before email delivery", async () => {
    const resend = vi.fn();
    await expect(runStagingProviderProbe({ paymentIntentId: "int_expected", orderId: "order_fixture" }, {
      prepare: async () => ({ profile: "staging", databaseFingerprint: "db", commerceMode: "test", fulfillmentMode: "batch_24h" }),
      airwallex: { getHostedCheckout: async () => ({ provider: "airwallex", providerCheckoutId: "int_other", clientSecret: "secret", currency: "CNY", environment: "demo" }) },
      resend: { send: resend },
      environment: { OGC_TEST_EMAIL_RECIPIENT: "operator@example.test" }
    })).rejects.toThrow("staging_probe_intent_mismatch");
    expect(resend).not.toHaveBeenCalled();
  });

  it("stops on the staging guard before provider network I/O", async () => {
    const airwallex = vi.fn();
    const resend = vi.fn();
    await expect(runStagingProviderProbe({ paymentIntentId: "int_fixture", orderId: "order_fixture" }, {
      prepare: async () => { throw new Error("staging only"); },
      airwallex: { getHostedCheckout: airwallex },
      resend: { send: resend },
      environment: { OGC_TEST_EMAIL_RECIPIENT: "operator@example.test" }
    })).rejects.toThrow("staging only");
    expect(airwallex).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });
});
