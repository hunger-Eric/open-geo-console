import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  run: vi.fn()
}));

vi.mock("@/scripts/staging-guard", () => ({ prepareStagingCommand: mocks.prepare }));
vi.mock("@/commerce/run-operations", () => ({ runCommercialOperations: mocks.run }));
vi.mock("@/db", () => ({ ensureDatabase: vi.fn(), getDatabaseEnvironmentStatus: vi.fn() }));

import { POST } from "./route";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
  vi.clearAllMocks();
});

function protectedPreview(): void {
  process.env.VERCEL_ENV = "preview";
  process.env.OGC_DEPLOYMENT_PROFILE = "staging";
  process.env.COMMERCE_MODE = "test";
}

describe("protected staging commerce route", () => {
  it("runs the fixed full sequence only in the protected Preview test environment", async () => {
    protectedPreview();
    mocks.prepare.mockResolvedValue({ profile: "staging" });
    mocks.run.mockResolvedValue({ refunds: { claimed: 1, succeeded: 1, retried: 0, failed: 0 } });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      profile: "staging",
      output: { refunds: { claimed: 1, succeeded: 1, retried: 0, failed: 0 } }
    });
    expect(mocks.run).toHaveBeenCalledWith("all");
  });

  it("hides the endpoint outside the exact protected Preview environment", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.COMMERCE_MODE = "live";
    expect((await POST()).status).toBe(404);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("does not disclose provider or configuration errors", async () => {
    protectedPreview();
    mocks.prepare.mockRejectedValue(new Error("AIRWALLEX_API_KEY=private-value"));
    const response = await POST();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "staging_commerce_unavailable" });
  });
});
