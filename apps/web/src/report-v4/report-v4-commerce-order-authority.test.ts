import { describe, expect, it } from "vitest";
import {
  normalizeReportV4CommerceOrders,
  normalizeReportV4PaymentEvents,
} from "./report-v4-commerce-order-authority";

const h = "a".repeat(64);
const order = {
  idHash: h,
  provider: "airwallex",
  providerCheckoutIdHash: null,
  providerPaymentIdHash: h,
  reportIdHash: "b".repeat(64),
  siteKeyHash: "c".repeat(64),
  siteSnapshotIdHash: null,
  fulfillmentJobIdHash: null,
  productCode: "recommendation_forensics_v1",
  businessQuestionSetIdHash: null,
  fulfillmentMethodology: "two_stage_geo_report_v4",
  recommendationReportVersion: 4,
  catalogVersion: "catalog-v1",
  termsVersion: "terms-v1",
  refundPolicyVersion: "refund-v1",
  reportLocale: "en",
  currency: "USD",
  amountMinor: 100,
  taxAmountMinor: 0,
  paymentStatus: "paid",
  fulfillmentStatus: "completed",
  refundStatus: "not_required",
  deliveryStatus: "delivered",
  courtesyNonBillable: false,
  paidAt: "2026-07-17T00:00:00.000Z",
  fulfillmentDeadlineAt: null,
  fulfilledAt: "2026-07-17T01:00:00.000Z",
  refundedAt: null,
} as const;
const event = {
  idHash: "d".repeat(64),
  provider: "airwallex",
  providerEventIdHash: h,
  eventType: "payment_succeeded",
  payloadHash: h,
  selectedFieldsHash: "e".repeat(64),
  processingStatus: "processed",
  orderIdHash: h,
  providerCreatedAt: "2026-07-17T00:00:00.000Z",
  processedAt: "2026-07-17T00:01:00.000Z",
  errorCode: null,
} as const;

describe("report v4 commerce authority", () => {
  it("normalizes valid order and payment event", () => {
    expect(normalizeReportV4CommerceOrders([order])).toEqual([order]);
    expect(normalizeReportV4PaymentEvents([event])).toEqual([event]);
  });
  it("accepts nullable fields", () => {
    expect(
      normalizeReportV4CommerceOrders([
        { ...order, providerPaymentIdHash: null, taxAmountMinor: null },
      ]),
    ).toHaveLength(1);
  });
  it("sorts stably by id hash", () => {
    const second = { ...order, idHash: "0".repeat(64) };
    expect(
      normalizeReportV4CommerceOrders([order, second]).map((row) => row.idHash),
    ).toEqual([second.idHash, order.idHash]);
  });
  it("rejects duplicate ids", () => {
    expect(() => normalizeReportV4CommerceOrders([order, order])).toThrow(
      /duplicate idHash/iu,
    );
  });
  it.each(["bogus", "paypal", ""])(
    "rejects invalid provider %s",
    (provider) => {
      expect(() =>
        normalizeReportV4CommerceOrders([{ ...order, provider }]),
      ).toThrow(/provider/iu);
    },
  );
  it.each(["bogus", "EUR"])("rejects invalid order enum %s", (currency) => {
    expect(() =>
      normalizeReportV4CommerceOrders([{ ...order, currency }]),
    ).toThrow(/currency/iu);
  });
  it.each([
    ["productCode", "other"],
    ["fulfillmentMethodology", "legacy"],
    ["recommendationReportVersion", 3],
  ] as const)("rejects non-V4 cross-field %s", (field, value) => {
    expect(() =>
      normalizeReportV4CommerceOrders([{ ...order, [field]: value }]),
    ).toThrow(new RegExp(field, "iu"));
  });
  it("rejects bad and uppercase hashes", () => {
    expect(() =>
      normalizeReportV4CommerceOrders([{ ...order, idHash: "A".repeat(64) }]),
    ).toThrow(/idHash/iu);
    expect(() =>
      normalizeReportV4PaymentEvents([{ ...event, payloadHash: "short" }]),
    ).toThrow(/payloadHash/iu);
  });
  it.each([
    "customerEmail",
    "url",
    "ip",
    "token",
    "key",
    "providerEventId",
    "selectedFields",
    "payload",
  ])("rejects raw sensitive field %s", (field) => {
    expect(() =>
      normalizeReportV4PaymentEvents([{ ...event, [field]: "secret" }]),
    ).toThrow(new RegExp(field, "iu"));
  });
  it("rejects missing, unknown, and undefined fields", () => {
    const missing = Object.fromEntries(
      Object.entries(order).filter(([key]) => key !== "termsVersion"),
    );
    expect(() => normalizeReportV4CommerceOrders([missing])).toThrow(
      /termsVersion.*missing/iu,
    );
    expect(() =>
      normalizeReportV4CommerceOrders([{ ...order, unknown: true }]),
    ).toThrow(/unknown/iu);
    expect(() =>
      normalizeReportV4CommerceOrders([{ ...order, amountMinor: undefined }]),
    ).toThrow(/amountMinor/iu);
  });
  it.each([NaN, Infinity, -1, 0, 1.5])("validates amount %s", (amountMinor) => {
    const result = () =>
      normalizeReportV4CommerceOrders([{ ...order, amountMinor }]);
    if (amountMinor === 0) expect(result).toThrow(/amountMinor/iu);
    else expect(result).toThrow();
  });
  it.each(["2026-02-30T00:00:00.000Z", "2026-07-17T00:00:00Z", "not-a-date"])(
    "rejects invalid or noncanonical UTC %s",
    (paidAt) => {
      expect(() =>
        normalizeReportV4CommerceOrders([{ ...order, paidAt }]),
      ).toThrow(/paidAt/iu);
    },
  );
  it("rejects trimmed or overlong text", () => {
    expect(() =>
      normalizeReportV4CommerceOrders([
        { ...order, catalogVersion: " catalog-v1" },
      ]),
    ).toThrow(/catalogVersion/iu);
    expect(() =>
      normalizeReportV4PaymentEvents([
        { ...event, eventType: "x".repeat(129) },
      ]),
    ).toThrow(/eventType/iu);
  });
  it.each(["done", "RECEIVED"])(
    "rejects event status %s",
    (processingStatus) => {
      expect(() =>
        normalizeReportV4PaymentEvents([{ ...event, processingStatus }]),
      ).toThrow(/processingStatus/iu);
    },
  );
  it("accepts event nulls and does not expose sensitive values in errors", () => {
    expect(
      normalizeReportV4PaymentEvents([
        {
          ...event,
          orderIdHash: null,
          providerCreatedAt: null,
          processedAt: null,
          errorCode: null,
        },
      ]),
    ).toHaveLength(1);
    const secret = "customer@example.test";
    try {
      normalizeReportV4PaymentEvents([{ ...event, customerEmail: secret }]);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
