import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import {
  attemptPaymentCompletionHandoff,
  fetchPaymentCompletionAccess,
  fetchPaymentReturnStatus,
  getPaymentReturnView,
  isTerminalPaymentReturn,
  shouldAttemptCompletionAccess,
  type PublicOrderStatus
} from "./payment-return";

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

  it("distinguishes a queued refund from one submitted to the provider", () => {
    expect(getPaymentReturnView({ ...base, paymentStatus: "paid", refundStatus: "pending" }, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentRefundPending);
    expect(getPaymentReturnView({ ...base, paymentStatus: "paid", refundStatus: "submitted" }, "success", dictionary).message)
      .toBe(dictionary.commerce.paymentRefundSubmitted);
    expect(dictionary.commerce.paymentRefundPending).not.toBe(dictionary.commerce.paymentRefundSubmitted);
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

  it("attempts completion access only for paid deliverable states", () => {
    expect(shouldAttemptCompletionAccess({ ...base, paymentStatus: "paid", fulfillmentStatus: "completed" })).toBe(true);
    expect(shouldAttemptCompletionAccess({ ...base, paymentStatus: "paid", fulfillmentStatus: "completed_limited" })).toBe(true);
    expect(shouldAttemptCompletionAccess({ ...base, paymentStatus: "pending", fulfillmentStatus: "completed" })).toBe(false);
    expect(shouldAttemptCompletionAccess({ ...base, paymentStatus: "paid", fulfillmentStatus: "failed" })).toBe(false);
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

describe("payment completion access request", () => {
  it("accepts only the exact canonical destination", async () => {
    const expected = "/reports/report-1/report.html";
    const acceptedFetch = vi.fn(async () => Response.json({ destination: expected })) as typeof fetch;
    const rejectedFetch = vi.fn(async () => Response.json({ destination: "https://attacker.test/report" })) as typeof fetch;

    await expect(fetchPaymentCompletionAccess("/api/completion", expected, { fetchImpl: acceptedFetch })).resolves.toBe(expected);
    await expect(fetchPaymentCompletionAccess("/api/completion", expected, { fetchImpl: rejectedFetch })).resolves.toBeNull();
    expect(acceptedFetch).toHaveBeenCalledWith("/api/completion", expect.objectContaining({ method: "POST", cache: "no-store" }));
  });

  it("keeps email as the fallback when the exchange is unavailable", async () => {
    const unavailableFetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    await expect(fetchPaymentCompletionAccess("/api/completion", "/reports/report-1/report.html", {
      fetchImpl: unavailableFetch
    })).resolves.toBeNull();
  });

  it("posts and navigates exactly once for a completed order", async () => {
    let attemptedFor: string | null = null;
    const fetchAccess = vi.fn(async () => "/reports/report-1/report.html");
    const navigate = vi.fn();
    const attempt = () => attemptPaymentCompletionHandoff({
      status: { ...base, paymentStatus: "paid", fulfillmentStatus: "completed" },
      orderId: "order-1",
      attemptedFor,
      completionUrl: "/api/completion",
      expectedDestination: "/reports/report-1/report.html",
      markAttempted: (orderId) => { attemptedFor = orderId; },
      fetchAccess,
      navigate
    });

    await attempt();
    await attempt();
    expect(fetchAccess).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/reports/report-1/report.html");
  });
});
