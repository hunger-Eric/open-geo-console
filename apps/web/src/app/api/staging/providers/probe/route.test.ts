import {afterEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({probe: vi.fn()}));

vi.mock("@/commerce/staging-provider-probe", () => ({runStagingProviderProbe: mocks.probe}));

import {POST} from "./route";

const original = {...process.env};
afterEach(() => {
  process.env = {...original};
  vi.clearAllMocks();
});

function protectedPreview(): void {
  process.env.VERCEL_ENV = "preview";
  process.env.OGC_DEPLOYMENT_PROFILE = "staging";
  process.env.COMMERCE_MODE = "test";
}

describe("protected staging provider probe route", () => {
  it("runs only the fixed read-only acceptance probe in protected Preview", async () => {
    protectedPreview();
    mocks.probe.mockResolvedValue({
      profile: "staging",
      airwallex: {retrieved: true, paymentIntentId: "int_hkdmp9krrhkepyhp2bz"},
      resend: {sent: true, providerEmailId: "email_fixture"}
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.probe).toHaveBeenCalledWith({
      paymentIntentId: "int_hkdmp9krrhkepyhp2bz",
      orderId: "d738b38f-63cb-4886-bdda-c8f745bf5b81"
    });
    await expect(response.json()).resolves.toEqual({
      profile: "staging",
      airwallex: {retrieved: true, paymentIntentId: "int_hkdmp9krrhkepyhp2bz"},
      resend: {sent: true, providerEmailId: "email_fixture"}
    });
  });

  it("is hidden outside protected Preview test commerce", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.COMMERCE_MODE = "live";

    expect((await POST()).status).toBe(404);
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("does not disclose provider or credential errors", async () => {
    protectedPreview();
    mocks.probe.mockRejectedValue(new Error("AIRWALLEX_API_KEY=private-value"));

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({error: "staging_provider_probe_unavailable"});
  });
});
