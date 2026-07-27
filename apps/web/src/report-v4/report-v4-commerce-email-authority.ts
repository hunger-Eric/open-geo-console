import type {
  EmailDeliveryState,
  EmailTemplateType,
  PaymentEventProcessingStatus,
  ReportLocale,
} from "../db/schema";

const HASH = /^[0-9a-f]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TEMPLATES = new Set<EmailTemplateType>([
  "payment_confirmed",
  "report_ready",
  "limited_report_refund",
  "report_failed_refund",
  "refund_succeeded",
  "refund_assistance",
  "link_reissue",
  "corrected_report_ready",
  "replacement_report_ready",
]);
const STATES = new Set<EmailDeliveryState>([
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
]);
const EVENTS = new Set<PaymentEventProcessingStatus>([
  "received",
  "processed",
  "ignored",
  "failed",
]);

type Delivery = {
  idHash: string;
  orderIdHash: string | null;
  reportIdHash: string;
  templateType: EmailTemplateType;
  templateVersion: string;
  locale: ReportLocale;
  recipientRefHash: string;
  provider: "resend";
  providerEmailIdHash: string | null;
  businessIdempotencyKeyHash: string;
  state: EmailDeliveryState;
  attempts: number;
  failureCode: string | null;
  lastProviderEventAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};
type Event = {
  idHash: string;
  providerEventIdHash: string;
  providerEmailIdHash: string;
  deliveryIdHash: string | null;
  provider: "resend";
  eventType: string;
  processingStatus: PaymentEventProcessingStatus;
  payloadHash: string;
  providerCreatedAt: string | null;
  errorCode: string | null;
};
export type ReportV4CommerceEmailAuthority = {
  deliveries: Delivery[];
  events: Event[];
};

export function normalizeReportV4CommerceEmailAuthority(
  input: unknown,
): ReportV4CommerceEmailAuthority {
  const r = record(input, "authority");
  rejectUnknown(r, ["deliveries", "events"]);
  return {
    deliveries: list(r.deliveries, normalizeDelivery, "deliveries"),
    events: list(r.events, normalizeEvent, "events"),
  };
}
function list<T extends { idHash: string }>(
  v: unknown,
  fn: (v: unknown) => T,
  label: string,
): T[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`);
  const rows = v.map((x, i) => {
    try {
      return fn(x);
    } catch (e) {
      throw new Error(
        `${label}[${i}]: ${e instanceof Error ? e.message : "invalid value"}`,
      );
    }
  });
  const ids = new Set<string>();
  for (const x of rows) {
    if (ids.has(x.idHash)) throw new Error(`${label} duplicate idHash`);
    ids.add(x.idHash);
  }
  return rows.sort((a, b) => a.idHash.localeCompare(b.idHash));
}
function normalizeDelivery(v: unknown): Delivery {
  const r = record(v, "delivery");
  rejectUnknown(r, [
    "idHash",
    "orderIdHash",
    "reportIdHash",
    "templateType",
    "templateVersion",
    "locale",
    "recipientRefHash",
    "provider",
    "providerEmailIdHash",
    "businessIdempotencyKeyHash",
    "state",
    "attempts",
    "failureCode",
    "lastProviderEventAt",
    "sentAt",
    "deliveredAt",
  ]);
  return {
    idHash: hash(r.idHash),
    orderIdHash: nullableHash(r.orderIdHash),
    reportIdHash: hash(r.reportIdHash),
    templateType: enumValue(r.templateType, TEMPLATES, "templateType"),
    templateVersion: text(r.templateVersion, "templateVersion"),
    locale: enumValue(r.locale, new Set<ReportLocale>(["en", "zh"]), "locale"),
    recipientRefHash: hash(r.recipientRefHash),
    provider: enumValue(r.provider, new Set(["resend"]), "provider"),
    providerEmailIdHash: nullableHash(r.providerEmailIdHash),
    businessIdempotencyKeyHash: hash(r.businessIdempotencyKeyHash),
    state: enumValue(r.state, STATES, "state"),
    attempts: integer(r.attempts, "attempts", 0),
    failureCode: nullableCode(r.failureCode),
    lastProviderEventAt: nullableTime(r.lastProviderEventAt),
    sentAt: nullableTime(r.sentAt),
    deliveredAt: nullableTime(r.deliveredAt),
  };
}
function normalizeEvent(v: unknown): Event {
  const r = record(v, "event");
  rejectUnknown(r, [
    "idHash",
    "providerEventIdHash",
    "providerEmailIdHash",
    "deliveryIdHash",
    "provider",
    "eventType",
    "processingStatus",
    "payloadHash",
    "providerCreatedAt",
    "errorCode",
  ]);
  return {
    idHash: hash(r.idHash),
    providerEventIdHash: hash(r.providerEventIdHash),
    providerEmailIdHash: hash(r.providerEmailIdHash),
    deliveryIdHash: nullableHash(r.deliveryIdHash),
    provider: enumValue(r.provider, new Set(["resend"]), "provider"),
    eventType: text(r.eventType, "eventType"),
    processingStatus: enumValue(r.processingStatus, EVENTS, "processingStatus"),
    payloadHash: hash(r.payloadHash),
    providerCreatedAt: nullableTime(r.providerCreatedAt),
    errorCode: nullableCode(r.errorCode),
  };
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function record(v: unknown, l: string) {
  if (!isRecord(v)) throw new Error(`${l} must be an object`);
  return v;
}
function rejectUnknown(r: Record<string, unknown>, a: string[]) {
  for (const k of Object.keys(r))
    if (!a.includes(k)) throw new Error(`unknown key ${k}`);
  for (const k of a)
    if (!(k in r) || r[k] === undefined) throw new Error(`missing key ${k}`);
}
function hash(v: unknown) {
  if (typeof v !== "string" || !HASH.test(v) || v !== v.toLowerCase())
    throw new Error("invalid hash");
  return v;
}
function nullableHash(v: unknown) {
  return v === null ? null : hash(v);
}
function text(v: unknown, l: string) {
  if (
    typeof v !== "string" ||
    v.length === 0 ||
    v.trim() !== v ||
    v.length > 200
  )
    throw new Error(`invalid ${l}`);
  return v;
}
function nullableCode(v: unknown) {
  return v === null ? null : text(v, "code");
}
function nullableTime(v: unknown) {
  if (v === null) return null;
  if (typeof v !== "string" || !UTC.test(v))
    throw new Error("invalid canonical UTC timestamp");
  const d = new Date(v);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== v)
    throw new Error("invalid canonical UTC timestamp");
  return v;
}
function integer(v: unknown, l: string, min: number) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
    throw new Error(`${l} must be integer >= ${min}`);
  return v;
}
function enumValue<T>(v: unknown, s: Set<T>, l: string) {
  if (typeof v !== "string" || !s.has(v as T)) throw new Error(`invalid ${l}`);
  return v as T;
}
