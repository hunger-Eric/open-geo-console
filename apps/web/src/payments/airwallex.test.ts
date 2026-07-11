import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AirwallexGateway, verifyAirwallexWebhookSignature } from "./airwallex";

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
});
