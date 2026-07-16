import { describe, expect, it } from "vitest";
import { getCommerceReadiness } from "./readiness";

describe("commerce readiness", () => {
  it("fails closed when commerce is disabled", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "disabled" })).toEqual({ ready: false, code: "disabled" });
  });

  it("requires a valid reply mailbox before sandbox commerce is ready", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "test" })).toEqual({ ready: false, code: "configuration" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "support@itheheda.online"
    })).toEqual({ ready: true, code: "ready" });
    expect(await getCommerceReadiness({
      COMMERCE_MODE: "test",
      OGC_REPLY_TO_EMAIL: "invalid"
    })).toEqual({ ready: false, code: "configuration" });
  });

  it("rejects live mode before every required provider and protection is configured", async () => {
    expect(await getCommerceReadiness({ COMMERCE_MODE: "live" })).toEqual({ ready: false, code: "configuration" });
  });
});
