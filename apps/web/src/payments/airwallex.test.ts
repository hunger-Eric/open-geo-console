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
      amountMinor: 2_900, currency: "USD", expiresAt: new Date("2030-01-01T00:00:00Z")
    })).rejects.toThrow("Sandbox API");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates a fixed, non-reusable provider-hosted checkout", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "link_1", url: "https://pay.example/link_1" }), { status: 200 }));
    const gateway = new AirwallexGateway({
      environment: { COMMERCE_MODE: "test", AIRWALLEX_CLIENT_ID: "client", AIRWALLEX_API_KEY: "key" },
      fetchImpl
    });
    const result = await gateway.createHostedCheckout({
      orderId: "order_1", reportId: "report_1", siteKey: "example.com", locale: "en",
      amountMinor: 2_900, currency: "USD", expiresAt: new Date("2030-01-01T00:00:00Z")
    });
    expect(result.checkoutUrl).toBe("https://pay.example/link_1");
    const request = fetchImpl.mock.calls[1];
    const body = JSON.parse(String(request[1]?.body));
    expect(body).toMatchObject({ amount: 29, currency: "USD", reusable: false, reference: "order_1" });
    expect(body.metadata).toEqual({ ogc_order_id: "order_1", ogc_report_id: "report_1", ogc_site_key: "example.com" });
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
