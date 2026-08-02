import { describe, expect, it, vi } from "vitest";
import { parseStagingEmailConsumerConfig, runStagingEmailConsumerCycle } from "./staging-email-consumer";

describe("Staging email consumer", () => {
  it("requires an exact stable UTC activation timestamp and bounded interval", () => {
    expect(parseStagingEmailConsumerConfig(validEnvironment({
      OGC_STAGING_EMAIL_ACTIVATION_AT: "2026-08-03T00:00:00.000Z",
      OGC_STAGING_EMAIL_INTERVAL_MS: "5000"
    }))).toEqual({ activationAt: new Date("2026-08-03T00:00:00.000Z"), intervalMs: 5000 });
    expect(() => parseStagingEmailConsumerConfig(validEnvironment({ OGC_STAGING_EMAIL_ACTIVATION_AT: "2026-08-03" }))).toThrow(/exact UTC ISO/i);
    expect(() => parseStagingEmailConsumerConfig(validEnvironment({
      OGC_STAGING_EMAIL_ACTIVATION_AT: "2026-08-03T00:00:00.000Z",
      OGC_STAGING_EMAIL_INTERVAL_MS: "999"
    }))).toThrow(/between 1000 and 300000/i);
  });

  it("fails before claiming unless the runtime is exact protected Staging test email", () => {
    expect(() => parseStagingEmailConsumerConfig(validEnvironment({ COMMERCE_MODE: "disabled" }))).toThrow(/protected staging/i);
    expect(() => parseStagingEmailConsumerConfig(validEnvironment({ OGC_TEST_EMAIL_RECIPIENT: "" }))).toThrow(/recipient/i);
    expect(() => parseStagingEmailConsumerConfig(validEnvironment({ OGC_REPORT_BASE_URL: "https://geo.itheheda.online" }))).toThrow(/fixed Protected Staging/i);
  });

  it("runs only the email pass with the persisted activation cutoff", async () => {
    const activationAt = new Date("2026-08-03T00:00:00.000Z");
    const processEmails = vi.fn(async () => ({ claimed: 0, succeeded: 0, retried: 0, failed: 0 }));
    await expect(runStagingEmailConsumerCycle({ activationAt, intervalMs: 5000 }, processEmails))
      .resolves.toEqual({ claimed: 0, succeeded: 0, retried: 0, failed: 0 });
    expect(processEmails).toHaveBeenCalledWith(25, { createdAtOrAfter: activationAt });
  });
});

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    OGC_DEPLOYMENT_PROFILE: "staging",
    VERCEL_ENV: "preview",
    COMMERCE_MODE: "test",
    DATABASE_URL: "postgres://staging.invalid/database",
    OGC_TOKEN_HASH_SECRET: "staging-email-test-token-secret-at-least-32-chars",
    RESEND_API_KEY: "re_staging_test",
    RESEND_FROM_EMAIL: "Open GEO <reports@example.test>",
    OGC_REPLY_TO_EMAIL: "support@example.test",
    OGC_TEST_EMAIL_RECIPIENT: "acceptance@example.test",
    OGC_REPORT_BASE_URL: "https://open-geo-console-staging-itheheda.vercel.app",
    OGC_STAGING_EMAIL_ACTIVATION_AT: "2026-08-03T00:00:00.000Z",
    ...overrides
  };
}
