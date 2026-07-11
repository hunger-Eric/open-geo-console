import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { getPaymentReturnView, type PublicOrderStatus } from "./payment-return";

const base: PublicOrderStatus = {
  orderId: "order-1", paymentStatus: "pending", fulfillmentStatus: "not_started",
  refundStatus: "not_required", deliveryStatus: "not_queued", deliveryDeadlineAt: null, fulfillmentMode: "batch_24h"
};

describe("payment return presentation", () => {
  const dictionary = getDictionary("en");

  it("does not treat a success return as paid", () => {
    expect(getPaymentReturnView(base, "success", dictionary).message).toBe(dictionary.commerce.paymentConfirming);
  });

  it("shows queued only after persisted paid state", () => {
    expect(getPaymentReturnView({ ...base, paymentStatus: "paid", fulfillmentStatus: "queued" }, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentQueued);
  });

  it("prioritizes trusted refund state over the return hint", () => {
    expect(getPaymentReturnView({ ...base, paymentStatus: "paid", refundStatus: "refunded" }, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentRefunded);
  });
});
