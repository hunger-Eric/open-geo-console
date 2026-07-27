import { afterEach, describe, expect, it } from "vitest";
import { clearStagingFreeState, terminalizeStagingActiveFreeJobs } from "./staging-free-cleanup";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("staging free-state cleanup", () => {
  it("refuses production before opening a database connection", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.COMMERCE_MODE = "disabled";
    delete process.env.DATABASE_URL;

    await expect(clearStagingFreeState()).rejects.toThrow(/staging/i);
    await expect(terminalizeStagingActiveFreeJobs()).rejects.toThrow(/staging/i);
  });
});
