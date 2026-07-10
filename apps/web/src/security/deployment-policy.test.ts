import { describe, expect, it } from "vitest";
import {
  assertDeploymentRuntime,
  assertStagingCommandEnvironment,
  freeDistinctSiteLimit,
  isProtectedStagingPreview,
  nonSensitiveDatabaseFingerprint
} from "./deployment-policy";

describe("deployment security policy", () => {
  it("keeps production at two regardless of staging variables", () => {
    expect(freeDistinctSiteLimit({
      VERCEL_ENV: "production",
      OGC_DEPLOYMENT_PROFILE: "staging",
      OGC_STAGING_FREE_SITE_LIMIT: "100"
    })).toBe(2);
    expect(freeDistinctSiteLimit({
      VERCEL_ENV: "production",
      OGC_DEPLOYMENT_PROFILE: "production",
      OGC_STAGING_FREE_SITE_LIMIT: "999999"
    })).toBe(2);
  });

  it("enables the bounded staging limit only for Preview plus staging", () => {
    expect(isProtectedStagingPreview({ VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" })).toBe(true);
    expect(freeDistinctSiteLimit({ VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" })).toBe(100);
    expect(freeDistinctSiteLimit({
      VERCEL_ENV: "preview",
      OGC_DEPLOYMENT_PROFILE: "staging",
      COMMERCE_MODE: "test",
      OGC_STAGING_FREE_SITE_LIMIT: "37"
    })).toBe(37);
    expect(freeDistinctSiteLimit({ VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "production", OGC_STAGING_FREE_SITE_LIMIT: "100" })).toBe(2);
    expect(freeDistinctSiteLimit({ OGC_DEPLOYMENT_PROFILE: "staging", OGC_STAGING_FREE_SITE_LIMIT: "100" })).toBe(2);
  });

  it("fails closed on invalid staging limits", () => {
    for (const value of ["0", "-1", "1.5", "101", "NaN", "  "]) {
      const environment = {
        VERCEL_ENV: "preview",
        OGC_DEPLOYMENT_PROFILE: "staging",
        COMMERCE_MODE: "test",
        OGC_STAGING_FREE_SITE_LIMIT: value
      };
      if (value.trim() === "") expect(freeDistinctSiteLimit(environment)).toBe(100);
      else expect(() => freeDistinctSiteLimit(environment)).toThrow("integer from 1 through 100");
    }
  });

  it("rejects contradictory runtime and command identities", () => {
    expect(() => assertDeploymentRuntime({ VERCEL_ENV: "production", OGC_DEPLOYMENT_PROFILE: "staging" })).toThrow("production profile");
    expect(() => assertDeploymentRuntime({ VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "production" })).toThrow("staging profile");
    expect(() => assertDeploymentRuntime({ OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "live" })).toThrow("live commerce");
    expect(() => assertDeploymentRuntime({ OGC_DEPLOYMENT_PROFILE: "production", OGC_TEST_EMAIL_RECIPIENT: "operator@example.test" })).toThrow("must not configure");
    expect(() => assertStagingCommandEnvironment({ OGC_DEPLOYMENT_PROFILE: "production", COMMERCE_MODE: "test" })).toThrow("only runs");
  });

  it("produces a stable opaque database fingerprint", () => {
    const fingerprint = nonSensitiveDatabaseFingerprint({ databaseName: "private-name", databaseOid: 42, profile: "staging" });
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(fingerprint).not.toContain("private-name");
  });
});
