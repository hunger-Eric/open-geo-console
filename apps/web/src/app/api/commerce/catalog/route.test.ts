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

  it("returns only server-owned price snapshots", async () => {
    process.env.COMMERCE_MODE = "test";
    const payload = await (await GET()).json() as { enabled: boolean; prices: Array<{ currency: string; amountMinor: number }> };
    expect(payload.enabled).toBe(true);
    expect(payload.prices).toEqual(expect.arrayContaining([{ currency: "USD", amountMinor: 2_900 }]));
  });
});
