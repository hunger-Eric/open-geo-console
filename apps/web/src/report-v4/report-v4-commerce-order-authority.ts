type Obj = Record<string, unknown>;
const HASH = /^[0-9a-f]{64}$/u;
const providers = ["airwallex", "stripe"] as const;
const paymentStatuses = [
  "created",
  "pending",
  "paid",
  "failed",
  "cancelled",
] as const;
const fulfillmentStatuses = [
  "not_started",
  "queued",
  "processing",
  "completed",
  "completed_limited",
  "failed",
] as const;
const refundStatuses = [
  "not_required",
  "pending",
  "submitted",
  "refunded",
  "failed",
] as const;
const deliveryStatuses = [
  "not_queued",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
] as const;
const eventStatuses = ["received", "processed", "ignored", "failed"] as const;
const currencies = ["CNY", "USD", "HKD"] as const;
const locales = ["en", "zh"] as const;

export type ReportV4CommerceOrderAuthority = Readonly<{
  idHash: string;
  provider: (typeof providers)[number];
  providerCheckoutIdHash: string | null;
  providerPaymentIdHash: string | null;
  reportIdHash: string;
  siteKeyHash: string;
  siteSnapshotIdHash: string | null;
  fulfillmentJobIdHash: string | null;
  productCode: "recommendation_forensics_v1";
  businessQuestionSetIdHash: string | null;
  fulfillmentMethodology: "two_stage_geo_report_v4";
  recommendationReportVersion: 4;
  catalogVersion: string;
  termsVersion: string;
  refundPolicyVersion: string;
  reportLocale: (typeof locales)[number];
  currency: (typeof currencies)[number];
  amountMinor: number;
  taxAmountMinor: number | null;
  paymentStatus: (typeof paymentStatuses)[number];
  fulfillmentStatus: (typeof fulfillmentStatuses)[number];
  refundStatus: (typeof refundStatuses)[number];
  deliveryStatus: (typeof deliveryStatuses)[number];
  courtesyNonBillable: boolean;
  paidAt: string | null;
  fulfillmentDeadlineAt: string | null;
  fulfilledAt: string | null;
  refundedAt: string | null;
}>;
export type ReportV4PaymentEventAuthority = Readonly<{
  idHash: string;
  provider: (typeof providers)[number];
  providerEventIdHash: string;
  eventType: string;
  payloadHash: string;
  selectedFieldsHash: string;
  processingStatus: (typeof eventStatuses)[number];
  orderIdHash: string | null;
  providerCreatedAt: string | null;
  processedAt: string | null;
  errorCode: string | null;
}>;

function fail(path: string, message: string): never {
  throw new Error(`Invalid commerce authority row at ${path}: ${message}`);
}
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("$", "expected object");
  return value as Obj;
}
function exactKeys(value: Obj, required: readonly string[]): void {
  const allowed = new Set(required);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(value, key))
      fail(`$.${key}`, "missing field");
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`$.${key}`, "unknown field");
}
function text(value: unknown, field: string, max = 256): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > max
  )
    fail(`$.${field}`, "invalid text");
  return value;
}
function hash(value: unknown, field: string): string {
  const v = text(value, field);
  if (!HASH.test(v)) fail(`$.${field}`, "invalid lowercase SHA-256 hash");
  return v;
}
function nullableHash(value: unknown, field: string): string | null {
  return value === null ? null : hash(value, field);
}
function enumValue<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    fail(`$.${field}`, "invalid enum value");
  return value as T;
}
function integer(value: unknown, field: string, positive = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0)
  )
    fail(`$.${field}`, "invalid non-negative integer");
  return value;
}
function date(value: unknown, field: string): string | null {
  if (value === null) return null;
  const v = text(value, field, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v))
    fail(`$.${field}`, "invalid canonical UTC timestamp");
  try {
    if (new Date(v).toISOString() !== v)
      fail(`$.${field}`, "invalid UTC timestamp");
  } catch {
    fail(`$.${field}`, "invalid UTC timestamp");
  }
  return v;
}
function rows<T>(
  input: readonly unknown[],
  normalize: (value: unknown) => T,
  id: (value: T) => string,
): readonly T[] {
  const out = input.map(normalize).sort((a, b) => id(a).localeCompare(id(b)));
  for (let i = 1; i < out.length; i += 1)
    if (id(out[i]) === id(out[i - 1])) fail("$", "duplicate idHash");
  return out;
}

const orderKeys = [
  "idHash",
  "provider",
  "providerCheckoutIdHash",
  "providerPaymentIdHash",
  "reportIdHash",
  "siteKeyHash",
  "siteSnapshotIdHash",
  "fulfillmentJobIdHash",
  "productCode",
  "businessQuestionSetIdHash",
  "fulfillmentMethodology",
  "recommendationReportVersion",
  "catalogVersion",
  "termsVersion",
  "refundPolicyVersion",
  "reportLocale",
  "currency",
  "amountMinor",
  "taxAmountMinor",
  "paymentStatus",
  "fulfillmentStatus",
  "refundStatus",
  "deliveryStatus",
  "courtesyNonBillable",
  "paidAt",
  "fulfillmentDeadlineAt",
  "fulfilledAt",
  "refundedAt",
] as const;
const eventKeys = [
  "idHash",
  "provider",
  "providerEventIdHash",
  "eventType",
  "payloadHash",
  "selectedFieldsHash",
  "processingStatus",
  "orderIdHash",
  "providerCreatedAt",
  "processedAt",
  "errorCode",
] as const;

export function normalizeReportV4CommerceOrders(
  input: readonly unknown[],
): readonly ReportV4CommerceOrderAuthority[] {
  return rows(
    input,
    (value) => {
      const v = object(value);
      exactKeys(v, orderKeys);
      if (v.productCode !== "recommendation_forensics_v1")
        fail("$.productCode", "must be V4 product");
      if (v.fulfillmentMethodology !== "two_stage_geo_report_v4")
        fail("$.fulfillmentMethodology", "must be V4 methodology");
      if (v.recommendationReportVersion !== 4)
        fail("$.recommendationReportVersion", "must be 4");
      return {
        idHash: hash(v.idHash, "idHash"),
        provider: enumValue(v.provider, "provider", providers),
        providerCheckoutIdHash: nullableHash(
          v.providerCheckoutIdHash,
          "providerCheckoutIdHash",
        ),
        providerPaymentIdHash: nullableHash(
          v.providerPaymentIdHash,
          "providerPaymentIdHash",
        ),
        reportIdHash: hash(v.reportIdHash, "reportIdHash"),
        siteKeyHash: hash(v.siteKeyHash, "siteKeyHash"),
        siteSnapshotIdHash: nullableHash(
          v.siteSnapshotIdHash,
          "siteSnapshotIdHash",
        ),
        fulfillmentJobIdHash: nullableHash(
          v.fulfillmentJobIdHash,
          "fulfillmentJobIdHash",
        ),
        productCode: "recommendation_forensics_v1",
        businessQuestionSetIdHash: nullableHash(
          v.businessQuestionSetIdHash,
          "businessQuestionSetIdHash",
        ),
        fulfillmentMethodology: "two_stage_geo_report_v4",
        recommendationReportVersion: 4,
        catalogVersion: text(v.catalogVersion, "catalogVersion"),
        termsVersion: text(v.termsVersion, "termsVersion"),
        refundPolicyVersion: text(v.refundPolicyVersion, "refundPolicyVersion"),
        reportLocale: enumValue(v.reportLocale, "reportLocale", locales),
        currency: enumValue(v.currency, "currency", currencies),
        amountMinor: integer(v.amountMinor, "amountMinor", true),
        taxAmountMinor:
          v.taxAmountMinor === null
            ? null
            : integer(v.taxAmountMinor, "taxAmountMinor"),
        paymentStatus: enumValue(
          v.paymentStatus,
          "paymentStatus",
          paymentStatuses,
        ),
        fulfillmentStatus: enumValue(
          v.fulfillmentStatus,
          "fulfillmentStatus",
          fulfillmentStatuses,
        ),
        refundStatus: enumValue(v.refundStatus, "refundStatus", refundStatuses),
        deliveryStatus: enumValue(
          v.deliveryStatus,
          "deliveryStatus",
          deliveryStatuses,
        ),
        courtesyNonBillable:
          typeof v.courtesyNonBillable === "boolean"
            ? v.courtesyNonBillable
            : fail("$.courtesyNonBillable", "invalid boolean"),
        paidAt: date(v.paidAt, "paidAt"),
        fulfillmentDeadlineAt: date(
          v.fulfillmentDeadlineAt,
          "fulfillmentDeadlineAt",
        ),
        fulfilledAt: date(v.fulfilledAt, "fulfilledAt"),
        refundedAt: date(v.refundedAt, "refundedAt"),
      };
    },
    (value) => value.idHash,
  );
}

export function normalizeReportV4PaymentEvents(
  input: readonly unknown[],
): readonly ReportV4PaymentEventAuthority[] {
  return rows(
    input,
    (value) => {
      const v = object(value);
      exactKeys(v, eventKeys);
      return {
        idHash: hash(v.idHash, "idHash"),
        provider: enumValue(v.provider, "provider", providers),
        providerEventIdHash: hash(v.providerEventIdHash, "providerEventIdHash"),
        eventType: text(v.eventType, "eventType", 128),
        payloadHash: hash(v.payloadHash, "payloadHash"),
        selectedFieldsHash: hash(v.selectedFieldsHash, "selectedFieldsHash"),
        processingStatus: enumValue(
          v.processingStatus,
          "processingStatus",
          eventStatuses,
        ),
        orderIdHash: nullableHash(v.orderIdHash, "orderIdHash"),
        providerCreatedAt: date(v.providerCreatedAt, "providerCreatedAt"),
        processedAt: date(v.processedAt, "processedAt"),
        errorCode:
          v.errorCode === null ? null : text(v.errorCode, "errorCode", 128),
      };
    },
    (value) => value.idHash,
  );
}
