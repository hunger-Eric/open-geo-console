import { describe, expect, it } from "vitest";
import { getCommerceReadiness } from "./readiness";

describe("commerce readiness", () => {
  it("fails closed when commerce is disabled", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "disabled" })).toEqual({ ready: false, code: "disabled" });
  });

  it("requires Stripe Sandbox credentials and a valid reply mailbox before test commerce is ready", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "test" })).toEqual({ ready: false, code: "configuration" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "support@itheheda.online",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      OGC_REPORT_BASE_URL: "https://geo.example.test"
    })).toEqual({ ready: true, code: "ready" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "invalid",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      OGC_REPORT_BASE_URL: "https://geo.example.test"
    })).toEqual({ ready: false, code: "configuration" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "support@itheheda.online",
      STRIPE_SECRET_KEY: "sk_live_forbidden",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      OGC_REPORT_BASE_URL: "https://geo.example.test"
    })).toEqual({ ready: false, code: "configuration" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "support@itheheda.online",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      OGC_REPORT_BASE_URL: "http://attacker.example"
    })).toEqual({ ready: false, code: "configuration" });
  });

  it("rejects live mode before every required provider and protection is configured", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "live" })).toEqual({ ready: false, code: "configuration" });
  });
});
