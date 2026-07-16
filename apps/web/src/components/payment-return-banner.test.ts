import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { fetchPaymentReturnStatus, getPaymentReturnView, isTerminalPaymentReturn, type PublicOrderStatus } from "./payment-return";

const base: PublicOrderStatus = {
  orderId: "order-1", paymentStatus: "pending", fulfillmentStatus: "not_started",
  refundStatus: "not_required", deliveryStatus: "not_queued", deliveryDeadlineAt: null, fulfillmentMode: "batch_24h", progress: null
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

  it("shows generation after payment when the report-bound deep job is advancing", () => {
    expect(getPaymentReturnView({
      ...base, paymentStatus: "paid", fulfillmentStatus: "queued", progress: { stage: "analyzing", progress: 65 }
    }, "success", dictionary).message).toBe(dictionary.commerce.paymentGenerating);
  });

  it("prioritizes trusted refund state over the return hint", () => {
    expect(getPaymentReturnView({ ...base, paymentStatus: "paid", refundStatus: "refunded" }, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentRefunded);
  });

  it("states that operator help is required when the authoritative refund failed", () => {
    const status = { ...base, paymentStatus: "paid" as const, fulfillmentStatus: "failed" as const, refundStatus: "failed" as const };
    expect(getPaymentReturnView(status, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentRefundFailed);
    expect(isTerminalPaymentReturn(status)).toBe(true);
  });

  it("keeps polling a failed report while its refund is still pending", () => {
    expect(isTerminalPaymentReturn({
      ...base,
      paymentStatus: "paid",
      fulfillmentStatus: "failed",
      refundStatus: "pending"
    })).toBe(false);
  });
});

describe("payment return status request", () => {
  it("aborts a hung status request within its own timeout", async () => {
    const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;

    await expect(fetchPaymentReturnStatus("/api/status", { fetchImpl: hangingFetch, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("propagates a caller cancellation", async () => {
    const caller = new AbortController();
    const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;
    const request = fetchPaymentReturnStatus("/api/status", { fetchImpl: hangingFetch, signal: caller.signal });

    caller.abort(new DOMException("Unmounted.", "AbortError"));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
