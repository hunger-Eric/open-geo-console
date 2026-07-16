import { describe, expect, it, vi } from "vitest";
import { retireLegacyUnpaidOrders } from "./legacy-retirement";

const env = { OGC_DEPLOYMENT_PROFILE: "staging", OGC_LEGACY_RETIREMENT_ENABLED: "true", COMMERCE_MODE: "test" };

describe("legacy unpaid checkout retirement", () => {
  it("confirms provider shutdown before atomically retiring the order", async () => {
    const events: string[] = [];
    const cutoffAt = new Date("2030-01-01T00:00:00.000Z");
    const result = await retireLegacyUnpaidOrders({ cutoffAt, environment: env,
      prepare: async () => [{ id: "order-1", providerCheckoutId: "link-1", cutoffAt }],
      gateway: { retireHostedCheckout: vi.fn(async () => { events.push("provider"); return "deactivated"; }) },
      finalize: async () => { events.push("database"); return true; }
    });
    expect(events).toEqual(["provider", "database"]);
    expect(result).toEqual({ inspected: 1, retired: 1, paid: 0 });
  });

  it("never retires an order the provider reports as paid", async () => {
    const finalize = vi.fn();
    const cutoffAt = new Date("2030-01-01T00:00:00.000Z");
    expect(await retireLegacyUnpaidOrders({ cutoffAt, environment: env,
      prepare: async () => [{ id: "order-1", providerCheckoutId: "link-1", cutoffAt }],
      gateway: { retireHostedCheckout: async () => "paid" }, finalize
    })).toEqual({ inspected: 1, retired: 0, paid: 1 });
    expect(finalize).not.toHaveBeenCalled();
  });
});
