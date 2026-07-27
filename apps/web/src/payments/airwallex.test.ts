import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AirwallexGateway, verifyAirwallexWebhookSignature } from "./airwallex";
import { CommerceProviderError } from "@/commerce/provider-error";

describe("AirwallexGateway", () => {
  it("verifies the official timestamp + raw-body HMAC-SHA256 contract", () => {
    const body = '{"id":"evt_1"}';
    const signature = createHmac("sha256", "secret").update(`123${body}`).digest("hex");
    expect(verifyAirwallexWebhookSignature(body, "123", signature, "secret")).toBe(true);
    expect(verifyAirwallexWebhookSignature(`${body} `, "123", signature, "secret")).toBe(false);
  });

  it("rejects a production API override in test commerce before network I/O", async () => {
    const fetchImpl = vi.fn();
    const gateway = new AirwallexGateway({
      environment: {
        COMMERCE_MODE: "test",
        AIRWALLEX_API_BASE_URL: "https://api.airwallex.com",
        AIRWALLEX_CLIENT_ID: "client",
        AIRWALLEX_API_KEY: "key"
      },
      fetchImpl
    });
    await expect(gateway.createHostedCheckout({
      orderId: "order_2", reportId: "report_2", siteKey: "example.com", locale: "en",
      amountMinor: 2_900, currency: "USD",
      returnUrl: "https://example.test/en/reports/report_2"
    })).rejects.toThrow("Sandbox API");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates an idempotent fixed-price PaymentIntent for HPP", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "int_1", client_secret: "secret_1", currency: "USD", merchant_order_id: "order_1"
      }), { status: 201 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" },
      fetchImpl
    });
    const result = await gateway.createHostedCheckout({
      orderId: "order_1", reportId: "report_1", siteKey: "example.com", locale: "en",
      amountMinor: 2_900, currency: "USD",
      returnUrl: "https://example.test/en/reports/report_1"
    });
    expect(result).toMatchObject({ providerCheckoutId: "int_1", clientSecret: "secret_1", currency: "USD", environment: "demo" });
    const request = fetchImpl.mock.calls[1];
    const body = JSON.parse(String(request[1]?.body));
    expect(String(request[0])).toContain("/api/v1/pa/payment_intents/create");
    expect(body).toMatchObject({
      request_id: "order_1", merchant_order_id: "order_1", amount: 29, currency: "USD",
      return_url: "https://example.test/en/reports/report_1"
    });
    expect(body.metadata).toEqual({ ogc_order_id: "order_1", ogc_report_id: "report_1", ogc_site_key: "example.com" });
  });

  it("retrieves an attached PaymentIntent and rejects legacy Payment Link IDs", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "int_existing", client_secret: "secret_existing", currency: "HKD", merchant_order_id: "order_1"
      }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" },
      fetchImpl
    });
    await expect(gateway.getHostedCheckout("link_legacy", "order_1")).rejects.toThrow("legacy checkout");
    await expect(gateway.getHostedCheckout("int_existing", "order_1")).resolves.toMatchObject({
      providerCheckoutId: "int_existing", clientSecret: "secret_existing", currency: "HKD"
    });
  });

  it("deactivates an unpaid legacy Payment Link only after verifying its order binding", async () => {
    const legacy = {
      id: "6fc2d9c0-2580-4ad3-a33d-72500ec93bda",
      active: true,
      status: "UNPAID",
      successful_payment_intent_count: 0,
      updated_at: "2026-07-11T00:00:00Z",
      reference: "order_1",
      metadata: { ogc_order_id: "order_1" }
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacy), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...legacy, active: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...legacy, active: false }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" },
      fetchImpl,
      now: () => Date.parse("2026-07-11T01:00:00Z")
    });
    await expect(gateway.deactivateLegacyHostedCheckout(legacy.id, "order_1")).resolves.toBe("deactivated");
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain(`/payment_links/${legacy.id}/deactivate`);
  });

  it("does not deactivate a legacy Payment Link that has already been paid", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "6fc2d9c0-2580-4ad3-a33d-72500ec93bda",
        active: true,
        status: "PAID",
        successful_payment_intent_count: 1,
        updated_at: "2026-07-11T00:59:00Z",
        reference: "order_1",
        metadata: { ogc_order_id: "order_1" }
      }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" }, fetchImpl
    });
    await expect(gateway.deactivateLegacyHostedCheckout("6fc2d9c0-2580-4ad3-a33d-72500ec93bda", "order_1"))
      .resolves.toBe("paid");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("cancels only a cancellable PaymentIntent and confirms its terminal provider state", async () => {
    const intent = { id: "int_retire", merchant_order_id: "order_1", metadata: { ogc_order_id: "order_1" } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...intent, status: "REQUIRES_PAYMENT_METHOD" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...intent, status: "CANCELLED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...intent, status: "CANCELLED" }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" }, fetchImpl
    });
    await expect(gateway.retireHostedCheckout("int_retire", "order_1")).resolves.toBe("cancelled");
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain("/payment_intents/int_retire/cancel");
  });

  it("recovers one PaymentIntent by merchant order ID and rejects ambiguous matches", async () => {
    const intent = {
      id: "int_recovered", client_secret: "secret_recovered", currency: "CNY", merchant_order_id: "order_1",
      metadata: { ogc_order_id: "order_1" }
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [intent] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [intent, { ...intent, id: "int_other" }] }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" }, fetchImpl
    });
    await expect(gateway.findHostedCheckoutByReference("order_1")).resolves.toMatchObject({ providerCheckoutId: "int_recovered" });
    await expect(gateway.findHostedCheckoutByReference("order_1")).rejects.toThrow("Multiple Airwallex PaymentIntents");
  });

  it("parses a signed paid event without trusting a browser success URL", () => {
    const raw = JSON.stringify({
      id: "evt_1", name: "payment_intent.succeeded", created_at: "2026-07-10T00:00:00Z",
      data: { object: { id: "int_1", status: "SUCCEEDED", metadata: { ogc_order_id: "order_1" } } }
    });
    const signature = createHmac("sha256", "secret").update(`123${raw}`).digest("hex");
    const gateway = new AirwallexGateway({ environment: { AIRWALLEX_WEBHOOK_SECRET: "secret" } });
    expect(gateway.verifyAndParseWebhook(raw, new Headers({ "x-timestamp": "123", "x-signature": signature }))).toMatchObject({
      eventId: "evt_1", orderId: "order_1", paymentIntentId: "int_1", outcome: "payment_paid"
    });
  });

  it("preserves a legacy Payment Link binding when its paid intent has no order metadata", () => {
    const raw = JSON.stringify({
      id: "evt_legacy", name: "payment_intent.succeeded", created_at: "2026-07-11T07:07:07Z",
      data: { object: {
        id: "int_legacy", status: "SUCCEEDED", amount: 199, currency: "CNY",
        merchant_order_id: "AI Search Visibility Audit", payment_link_id: "legacy-link-1"
      } }
    });
    const signature = createHmac("sha256", "secret").update(`123${raw}`).digest("hex");
    const gateway = new AirwallexGateway({ environment: { AIRWALLEX_WEBHOOK_SECRET: "secret" } });
    expect(gateway.verifyAndParseWebhook(raw, new Headers({ "x-timestamp": "123", "x-signature": signature })))
      .toMatchObject({
        orderId: null,
        paymentLinkId: "legacy-link-1",
        paymentIntentId: "int_legacy",
        amountMinor: 19_900,
        currency: "CNY"
      });
  });

  it("classifies authentication, refund, response-shape, and network failures without provider bodies", async () => {
    const environment = { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" };
    const authentication = new AirwallexGateway({
      environment,
      fetchImpl: vi.fn().mockResolvedValue(new Response("Bearer must-not-leak", { status: 401 }))
    });
    await expect(authentication.getHostedCheckout("int_auth", "order_1")).rejects.toMatchObject({
      provider: "airwallex", operation: "authentication", category: "http", status: 401
    });

    const refund = new AirwallexGateway({
      environment,
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
        .mockResolvedValueOnce(new Response("api_key=must-not-leak", { status: 403 }))
    });
    await expect(refund.requestRefund({ orderId: "order_1", paymentIntentId: "int_refund", amountMinor: 100, currency: "CNY", reason: "failed", idempotencyKey: "refund-1" }))
      .rejects.toMatchObject({ provider: "airwallex", operation: "refund", category: "http", status: 403 });

    const invalid = new AirwallexGateway({ environment, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) });
    await expect(invalid.getHostedCheckout("int_invalid", "order_1")).rejects.toMatchObject({
      provider: "airwallex", operation: "authentication", category: "invalid_response"
    });

    const network = new AirwallexGateway({ environment, fetchImpl: vi.fn().mockRejectedValue(new Error("network body must-not-leak")) });
    const networkError = await network.getHostedCheckout("int_network", "order_1").catch((error) => error);
    expect(networkError).toBeInstanceOf(CommerceProviderError);
    expect(networkError).toMatchObject({ provider: "airwallex", operation: "authentication", category: "network" });
    expect(JSON.stringify(networkError)).not.toContain("must-not-leak");
  });
});
