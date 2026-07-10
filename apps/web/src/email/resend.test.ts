import { describe, expect, it, vi } from "vitest";
import { ResendEmailGateway } from "./resend";
import { renderTransactionalEmail } from "./templates";

describe("ResendEmailGateway", () => {
  it("sends a localized template with the durable business key as provider idempotency", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const gateway = new ResendEmailGateway({
      environment: { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Open GEO <reports@example.com>" }, fetchImpl
    });
    await gateway.send({
      to: "buyer@example.com", template: "report_ready", locale: "zh", orderReference: "OGC-1",
      siteLabel: "example.com", reportUrl: "https://example.com/report", idempotencyKey: "report_ready/order-1/v1"
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "report_ready/order-1/v1" });
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).not.toContain("undefined");
  });

  it("escapes customer-visible fields in HTML", () => {
    const rendered = renderTransactionalEmail({
      template: "payment_confirmed", locale: "en", orderReference: "<script>", siteLabel: "<b>bad</b>"
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<b>bad</b>");
  });
});
