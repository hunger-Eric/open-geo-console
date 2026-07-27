import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("commerce catalog route", () => {
  it("fails closed by default", async () => {
    delete process.env.COMMERCE_MODE;
    expect(await (await GET()).json()).toMatchObject({ enabled: false, prices: [] });
  });

  it("does not expose legacy GEO pricing while the replacement product runtime is unavailable", async () => {
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_REPLY_TO_EMAIL = "support@example.test";
    const payload = await (await GET()).json() as { enabled: boolean; prices: Array<{ currency: string; amountMinor: number }> };
    expect(payload.enabled).toBe(false);
    expect(payload.prices).toEqual([]);
  });
});
