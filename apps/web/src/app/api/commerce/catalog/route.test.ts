import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCommerceReadiness: vi.fn(),
  getRecommendationProductAvailability: vi.fn()
}));

vi.mock("@/commerce/readiness", () => ({ getCommerceReadiness: mocks.getCommerceReadiness }));
vi.mock("@/recommendation-forensics/product-availability", () => ({
  getRecommendationProductAvailability: mocks.getRecommendationProductAvailability
}));

import { GET } from "./route";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("commerce catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCommerceReadiness.mockResolvedValue({ ready: true, code: "ready" });
    mocks.getRecommendationProductAvailability.mockResolvedValue({ ready: true });
  });

  it("fails closed by default", async () => {
    delete process.env.COMMERCE_MODE;
    mocks.getCommerceReadiness.mockResolvedValue({ ready: false, code: "disabled" });
    expect(await (await GET(new Request("https://example.test/api/commerce/catalog"))).json())
      .toMatchObject({ enabled: false, prices: [] });
  });

  it("does not expose legacy GEO pricing while the replacement product runtime is unavailable", async () => {
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_REPLY_TO_EMAIL = "support@example.test";
    mocks.getRecommendationProductAvailability.mockResolvedValue({ ready: false });
    const payload = await (await GET(new Request("https://example.test/api/commerce/catalog"))).json() as { enabled: boolean; prices: Array<{ currency: string; amountMinor: number }> };
    expect(payload.enabled).toBe(false);
    expect(payload.prices).toEqual([]);
  });

  it.each([
    ["CN", "CNY", 29_900],
    ["HK", "USD", 9_900],
    ["MO", "USD", 9_900],
    ["TW", "USD", 9_900],
    ["US", "USD", 9_900],
    ["JP", "USD", 9_900],
    ["DE", "USD", 9_900]
  ])("returns one offer for trusted country %s", async (countryCode, currency, amountMinor) => {
    process.env.COMMERCE_MODE = "test";
    process.env.VERCEL = "1";
    const request = new Request("https://example.test/api/commerce/catalog", {
      headers: { "x-vercel-ip-country": countryCode }
    });
    const payload = await (await GET(request)).json() as { enabled: boolean; prices: Array<{ currency: string; amountMinor: number }> };
    expect(payload).toMatchObject({ enabled: true, prices: [{ currency, amountMinor }] });
    expect(payload.prices).toHaveLength(1);
  });

  it("defaults an untrusted country header to the USD offer", async () => {
    process.env.COMMERCE_MODE = "test";
    delete process.env.VERCEL;
    delete process.env.OGC_TRUST_VERCEL_HEADERS;
    const request = new Request("https://example.test/api/commerce/catalog", {
      headers: { "x-vercel-ip-country": "CN" }
    });
    const payload = await (await GET(request)).json() as { prices: Array<{ currency: string; amountMinor: number }> };
    expect(payload.prices).toEqual([{ currency: "USD", amountMinor: 9_900 }]);
  });
});
