import { describe, expect, it } from "vitest";
import { normalizeReportV4CommerceEmailAuthority } from "./report-v4-commerce-email-authority";

const h = (n: string) =>
  (
    ({ a: "a", b: "b", r: "c", u: "d", e: "e", p: "f", m: "1", q: "2" })[n] ??
    "3"
  ).repeat(64);
const delivery = (id: string) => ({
  idHash: h(id),
  orderIdHash: null,
  reportIdHash: h("r"),
  templateType: "report_ready",
  templateVersion: "v1",
  locale: "en",
  recipientRefHash: h("u"),
  provider: "resend",
  providerEmailIdHash: null,
  businessIdempotencyKeyHash: h("b"),
  state: "queued",
  attempts: 0,
  failureCode: null,
  lastProviderEventAt: null,
  sentAt: null,
  deliveredAt: null,
});
const event = {
  idHash: h("e"),
  providerEventIdHash: h("p"),
  providerEmailIdHash: h("m"),
  deliveryIdHash: null,
  provider: "resend",
  eventType: "delivered",
  processingStatus: "processed",
  payloadHash: h("q"),
  providerCreatedAt: null,
  errorCode: null,
};
describe("report v4 commerce email authority", () => {
  it("normalizes valid rows", () =>
    expect(
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [delivery("a")],
        events: [event],
      }).deliveries,
    ).toHaveLength(1));
  it("sorts rows", () =>
    expect(
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [delivery("b"), delivery("a")],
        events: [],
      }).deliveries[0]!.idHash,
    ).toBe(h("a")));
  it("rejects duplicate ids", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [delivery("a"), delivery("a")],
        events: [],
      }),
    ).toThrow(/duplicate/));
  it("rejects unknown keys", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [],
        events: [],
        token: "x",
      }),
    ).toThrow(/unknown/));
  it("rejects missing keys", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), locale: undefined }],
        events: [],
      }),
    ).toThrow(/missing/));
  it("rejects malformed hashes", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), idHash: "A" }],
        events: [],
      }),
    ).toThrow(/hash/));
  it("rejects invalid enum", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), state: "x" }],
        events: [],
      }),
    ).toThrow(/state/));
  it("rejects negative attempts", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), attempts: -1 }],
        events: [],
      }),
    ).toThrow(/attempts/));
  it("accepts null optional fields", () =>
    expect(
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [delivery("a")],
        events: [event],
      }).events[0]!.errorCode,
    ).toBeNull());
  it("rejects noncanonical time", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), sentAt: "2020-01-01T00:00:00Z" }],
        events: [],
      }),
    ).toThrow(/timestamp/));
  it("rejects raw recipient", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), recipientRefHash: "foo@example.com" }],
        events: [],
      }),
    ).toThrow());
  it("rejects raw payload", () =>
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [],
        events: [{ ...event, payloadHash: "{" }],
      }),
    ).toThrow());
  it.each([
    "payment_confirmed",
    "limited_report_refund",
    "report_failed_refund",
    "refund_succeeded",
    "refund_assistance",
    "link_reissue",
    "corrected_report_ready",
    "replacement_report_ready",
  ])("accepts template %s", (templateType) =>
    expect(
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), templateType }],
        events: [],
      }),
    ).toBeTruthy(),
  );
  it.each(["sent", "delivered", "bounced", "failed"])(
    "accepts delivery state %s",
    (state) =>
      expect(
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [{ ...delivery("a"), state }],
          events: [],
        }),
      ).toBeTruthy(),
  );
  it.each(["received", "ignored", "failed"])(
    "accepts processing status %s",
    (processingStatus) =>
      expect(
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [],
          events: [{ ...event, processingStatus }],
        }),
      ).toBeTruthy(),
  );
  it("accepts zh and rejects provider id raw value", () => {
    expect(
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), locale: "zh" }],
        events: [],
      }),
    ).toBeTruthy();
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [
          { ...delivery("a"), providerEmailIdHash: "provider@example.com" },
        ],
        events: [],
      }),
    ).toThrow();
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects attempts %s",
    (attempts) =>
      expect(() =>
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [{ ...delivery("a"), attempts }],
          events: [],
        }),
      ).toThrow(/attempts/),
  );
  it.each(["", " bad", "x".repeat(201)])(
    "rejects invalid failure code %s",
    (failureCode) =>
      expect(() =>
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [{ ...delivery("a"), failureCode }],
          events: [],
        }),
      ).toThrow(/code/),
  );
  it("rejects uppercase hash and invalid calendar", () => {
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), idHash: h("a").toUpperCase() }],
        events: [],
      }),
    ).toThrow(/hash/);
    expect(() =>
      normalizeReportV4CommerceEmailAuthority({
        deliveries: [{ ...delivery("a"), sentAt: "2024-02-30T00:00:00.000Z" }],
        events: [],
      }),
    ).toThrow(/timestamp/);
  });
  it("rejects operational and secret keys", () => {
    for (const key of [
      "customerEmail",
      "providerEventId",
      "businessIdempotencyKey",
      "selectedFields",
      "token",
      "url",
      "ip",
      "lease",
      "nextRetry",
    ])
      expect(() =>
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [{ ...delivery("a"), [key]: "secret" }],
          events: [],
        }),
      ).toThrow(/unknown/);
  });
  it("does not expose supplied secret in output", () =>
    expect(
      JSON.stringify(
        normalizeReportV4CommerceEmailAuthority({
          deliveries: [delivery("a")],
          events: [],
        }),
      ),
    ).not.toContain("customer@example.com"));
});
