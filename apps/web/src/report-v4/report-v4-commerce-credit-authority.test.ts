import { describe, expect, it } from "vitest";
import { normalizeReportV4CommerceCreditAuthority } from "./report-v4-commerce-credit-authority";
const h = "a".repeat(64);
const t = "2026-07-17T00:00:00.000Z";
const access = (x: Record<string, unknown> = {}) => ({
  idHash: h,
  keyPrefixHash: h,
  paymentOrderIdHash: null,
  status: "active",
  creditsRemaining: 0,
  expiresAt: null,
  revokedAt: null,
  ...x,
});
const credit = (x: Record<string, unknown> = {}) => ({
  idHash: h,
  accessKeyIdHash: h,
  reportIdHash: h,
  jobIdHash: null,
  paymentOrderIdHash: null,
  idempotencyKeyHash: h,
  credits: 1,
  status: "reserved",
  reservedAt: t,
  settledAt: null,
  refundedAt: null,
  ...x,
});
const refund = (x: Record<string, unknown> = {}) => ({
  idHash: h,
  orderIdHash: h,
  provider: "airwallex",
  providerRefundIdHash: null,
  reason: "report_failed",
  amountMinor: 1,
  currency: "CNY",
  state: "pending",
  idempotencyKeyHash: h,
  attempts: 0,
  failureCode: null,
  submittedAt: null,
  succeededAt: null,
  ...x,
});
const norm = (x: unknown) =>
  normalizeReportV4CommerceCreditAuthority({
    accessKeys: [access()],
    creditLedger: [credit()],
    refunds: [refund(x as Record<string, unknown>)],
  });
describe("report v4 commerce credit authority", () => {
  it("accepts active/exhausted/revoked, zero credits, nulls and expiry", () => {
    for (const status of ["active", "exhausted", "revoked"])
      expect(
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [access({ status, expiresAt: t })],
          creditLedger: [],
          refunds: [],
        }).accessKeys[0].creditsRemaining,
      ).toBe(0);
  });
  it("accepts all credit states", () => {
    for (const status of ["reserved", "settled", "refunded"])
      expect(
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [],
          creditLedger: [credit({ status })],
          refunds: [],
        }).creditLedger[0].status,
      ).toBe(status);
  });
  it("accepts refund states, reasons, providers and currencies", () => {
    for (const state of ["pending", "submitted", "succeeded", "failed"])
      for (const reason of [
        "completed_limited",
        "report_failed",
        "sla_missed",
        "operator_approved",
      ])
        for (const provider of ["airwallex", "stripe"])
          for (const currency of ["CNY", "USD", "HKD"])
            expect(
              norm({ state, reason, provider, currency }).refunds[0].state,
            ).toBe(state);
  });
  it("sorts and rejects duplicate ids", () => {
    const b = "b".repeat(64);
    const out = normalizeReportV4CommerceCreditAuthority({
      accessKeys: [access({ idHash: b }), access()],
      creditLedger: [],
      refunds: [],
    });
    expect(out.accessKeys.map((x) => x.idHash)).toEqual([h, b]);
    expect(() =>
      normalizeReportV4CommerceCreditAuthority({
        accessKeys: [access(), access()],
        creditLedger: [],
        refunds: [],
      }),
    ).toThrow(/duplicate/);
  });
  it("rejects bad, uppercase, raw and sensitive hashes", () => {
    for (const field of ["idHash", "keyPrefixHash", "paymentOrderIdHash"])
      expect(() =>
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [
            access({
              [field]: field === "paymentOrderIdHash" ? "raw" : "A".repeat(64),
            }),
          ],
          creditLedger: [],
          refunds: [],
        }),
      ).toThrow();
    for (const field of ["keyPrefix", "keyHmac", "keyHmacHash"])
      expect(() =>
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [access({ [field]: h })],
          creditLedger: [],
          refunds: [],
        }),
      ).toThrow(/unknown/);
  });
  it("rejects raw sensitive fields in all rows", () => {
    for (const field of [
      "idempotencyKey",
      "providerRefundId",
      "token",
      "email",
      "url",
      "ip",
      "payload",
      "lease",
    ])
      expect(() =>
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [access({ [field]: "raw" })],
          creditLedger: [],
          refunds: [],
        }),
      ).toThrow();
  });
  it("rejects invalid statuses, reason, currency and undefined", () => {
    expect(() => norm({ state: "x" })).toThrow();
    expect(() => norm({ reason: "x" })).toThrow();
    expect(() => norm({ currency: "EUR" })).toThrow();
    expect(() => normalizeReportV4CommerceCreditAuthority(undefined)).toThrow();
  });
  it("enforces numeric boundaries and finite integers", () => {
    for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [access({ creditsRemaining: n })],
          creditLedger: [],
          refunds: [],
        }),
      ).toThrow();
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => norm({ amountMinor: n })).toThrow();
    for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => norm({ attempts: n })).toThrow();
  });
  it("enforces canonical UTC and invalid dates", () => {
    for (const value of [
      "2026-07-17T00:00:00Z",
      "2026-02-30T00:00:00.000Z",
      "x",
    ])
      expect(() =>
        normalizeReportV4CommerceCreditAuthority({
          accessKeys: [],
          creditLedger: [credit({ reservedAt: value })],
          refunds: [],
        }),
      ).toThrow();
  });
  it("validates failureCode null/nonempty trimmed bounded", () => {
    expect(norm({ failureCode: null }).refunds[0].failureCode).toBeNull();
    expect(norm({ failureCode: "oops" }).refunds[0].failureCode).toBe("oops");
    for (const value of ["", " bad", "x".repeat(201)])
      expect(() => norm({ failureCode: value })).toThrow();
  });
  it("requires exact keys with paths", () => {
    expect(() =>
      normalizeReportV4CommerceCreditAuthority({
        accessKeys: [access({ extra: true })],
        creditLedger: [],
        refunds: [],
      }),
    ).toThrow(/accessKeys\[0\].*unknown/);
    expect(() =>
      normalizeReportV4CommerceCreditAuthority({
        accessKeys: [access({ revokedAt: undefined })],
        creditLedger: [],
        refunds: [],
      }),
    ).toThrow(/missing/);
  });
  it("does not expose supplied sensitive raw values", () => {
    const out = normalizeReportV4CommerceCreditAuthority({
      accessKeys: [access()],
      creditLedger: [credit()],
      refunds: [refund()],
    });
    expect(JSON.stringify(out)).not.toContain("raw");
    expect(out.accessKeys[0]).not.toHaveProperty("keyHmacHash");
  });
});
