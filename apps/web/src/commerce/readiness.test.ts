import { describe, expect, it } from "vitest";
import { getCommerceReadiness } from "./readiness";

describe("commerce readiness", () => {
  it("fails closed when commerce is disabled", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "disabled" })).toEqual({ ready: false, code: "disabled" });
  });

  it("allows sandbox wiring without pretending it is live readiness", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "test" })).toEqual({ ready: true, code: "ready" });
  });

  it("rejects live mode before every required provider and protection is configured", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "live" })).toEqual({ ready: false, code: "configuration" });
  });
});
