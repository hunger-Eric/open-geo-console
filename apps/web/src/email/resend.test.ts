import { describe, expect, it, vi } from "vitest";
import { ResendEmailGateway, resolveEnvelopeRecipient } from "./resend";
import { renderTransactionalEmail } from "./templates";

describe("ResendEmailGateway", () => {
  const deliveryEnvironment = {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "Open GEO Console <reports@itheheda.online>",
    OGC_REPLY_TO_EMAIL: "support@itheheda.online"
  };

  it("sends a localized template with the durable business key as provider idempotency", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const gateway = new ResendEmailGateway({
      environment: deliveryEnvironment, fetchImpl
    });
    await gateway.send({
      to: "buyer@example.com", template: "report_ready", locale: "zh", orderReference: "OGC-1",
      siteLabel: "example.com", reportUrl: "https://example.com/report", idempotencyKey: "report_ready/order-1/v1"
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "report_ready/order-1/v1" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      from: "Open GEO Console <reports@itheheda.online>",
      to: ["buyer@example.com"],
      reply_to: "support@itheheda.online"
    });
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).not.toContain("undefined");
  });

  it("redirects every test-mode envelope to the configured staging recipient", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_test" }), { status: 200 }));
    const gateway = new ResendEmailGateway({
      environment: {
        OGC_DEPLOYMENT_PROFILE: "staging",
        COMMERCE_MODE: "test",
        OGC_TEST_EMAIL_RECIPIENT: "operator@example.test",
        ...deliveryEnvironment
      },
      fetchImpl
    });
    await gateway.send({
      to: "buyer@example.com", template: "payment_confirmed", locale: "en", orderReference: "OGC-2",
      siteLabel: "example.com", idempotencyKey: "payment_confirmed/order-2/v1"
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).to).toEqual(["operator@example.test"]);
  });

  it("fails before network I/O when the test recipient is missing", async () => {
    const fetchImpl = vi.fn();
    const gateway = new ResendEmailGateway({
      environment: {
        OGC_DEPLOYMENT_PROFILE: "staging",
        COMMERCE_MODE: "test",
        ...deliveryEnvironment
      },
      fetchImpl
    });
    await expect(gateway.send({
      to: "buyer@example.com", template: "payment_confirmed", locale: "en", orderReference: "OGC-3",
      siteLabel: "example.com", idempotencyKey: "payment_confirmed/order-3/v1"
    })).rejects.toThrow("OGC_TEST_EMAIL_RECIPIENT");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never redirects a production-profile recipient", () => {
    expect(resolveEnvelopeRecipient("buyer@example.com", {
      OGC_DEPLOYMENT_PROFILE: "production",
      COMMERCE_MODE: "test",
      OGC_TEST_EMAIL_RECIPIENT: "operator@example.test"
    })).toBe("buyer@example.com");
  });

  it.each([
    ["RESEND_API_KEY", { ...deliveryEnvironment, RESEND_API_KEY: "not-a-resend-key" }],
    ["RESEND_FROM_EMAIL", { ...deliveryEnvironment, RESEND_FROM_EMAIL: "not-an-address" }],
    ["OGC_REPLY_TO_EMAIL", { ...deliveryEnvironment, OGC_REPLY_TO_EMAIL: "not-an-address" }]
  ])("fails before network I/O when %s is malformed", async (expectedName, environment) => {
    const fetchImpl = vi.fn();
    const gateway = new ResendEmailGateway({ environment, fetchImpl });
    await expect(gateway.send({
      to: "buyer@example.com", template: "report_ready", locale: "en", orderReference: "OGC-4",
      siteLabel: "example.com", reportUrl: "https://example.com/report", idempotencyKey: "report_ready/order-4/v1"
    })).rejects.toThrow(String(expectedName));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("escapes customer-visible fields in HTML", () => {
    const rendered = renderTransactionalEmail({
      template: "payment_confirmed", locale: "en", orderReference: "<script>", siteLabel: "<b>bad</b>"
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<b>bad</b>");
  });

  it.each([
    ["report_ready", "en"], ["report_ready", "zh"],
    ["corrected_report_ready", "en"], ["corrected_report_ready", "zh"]
  ] as const)(
    "delivers %s in %s with only the secure HTML report link",
    (template, locale) => {
      const reportUrl = "https://example.com/reports/report-1/report.html?access=secure";
      const rendered = renderTransactionalEmail({
        template, locale, orderReference: "OGC-HTML", siteLabel: "example.com", reportUrl
      });
      expect(rendered.html).toContain(reportUrl.replaceAll("&", "&amp;"));
      expect(rendered.text).toContain(reportUrl);
      expect(rendered.html).not.toMatch(/PDF|\.pdf/i);
      expect(rendered.text).not.toMatch(/PDF|\.pdf/i);
    }
  );
});
