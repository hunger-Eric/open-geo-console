import { describe, expect, it } from "vitest";
import {
  buildCheckoutRequestBody,
  getPaymentConfirmationReturnUrl,
  getStripeCheckoutRedirect,
  readCheckoutPayload
} from "./checkout-response";
import { buildHppReturnUrls } from "./payment-return";

describe("HPP return URLs", () => {
  it("returns success and cancel to the exact originating report without trusting stale query state", () => {
    const urls = buildHppReturnUrls(
      "https://example.test/zh/reports/report-1/analysis?page=2&order=old&payment_return=success#fragment",
      "order-1"
    );
    expect(urls.successUrl).toBe("https://example.test/zh/reports/report-1/analysis?page=2&order=order-1&payment_return=success");
    expect(urls.cancelUrl).toBe("https://example.test/zh/reports/report-1/analysis?page=2&order=order-1&payment_return=cancel");
  });
});

describe("checkout response parsing", () => {
  it("builds checkout input without a browser-selected currency", () => {
    expect(buildCheckoutRequestBody({
      email: "buyer@example.test",
      locale: "zh",
      turnstileToken: "token",
      questionSetId: "questions-1"
    })).toEqual({
      email: "buyer@example.test",
      locale: "zh",
      turnstileToken: "token",
      questionSetId: "questions-1"
    });
  });

  it("accepts only a Stripe-hosted checkout URL bound to a local order", () => {
    expect(getStripeCheckoutRedirect({
      orderId: "order-1",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_valid"
    })).toBe("https://checkout.stripe.com/c/pay/cs_test_valid");
    expect(getStripeCheckoutRedirect({
      orderId: "order-1",
      checkoutUrl: "https://attacker.example/c/pay/cs_test_valid"
    })).toBeNull();
    expect(getStripeCheckoutRedirect({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_unbound"
    })).toBeNull();
  });

  it("turns an empty gateway response into a safe empty payload", async () => {
    await expect(readCheckoutPayload(new Response(null, { status: 500 }))).resolves.toEqual({});
  });

  it("preserves a structured server error", async () => {
    await expect(readCheckoutPayload(new Response(JSON.stringify({ error: "Checkout unavailable." }), {
      status: 409,
      headers: { "content-type": "application/json" }
    }))).resolves.toEqual({ error: "Checkout unavailable." });
  });

  it("moves a provider-paid legacy order into the report-bound confirmation state", () => {
    expect(getPaymentConfirmationReturnUrl({
      code: "payment_confirmation_pending",
      orderId: "order-1"
    }, "https://example.test/zh/reports/report-1?tab=overview#checkout")).toBe(
      "https://example.test/zh/reports/report-1?tab=overview&order=order-1&payment_return=success"
    );
  });
});
