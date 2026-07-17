import type {
  AccessKeyStatus,
  CommerceCurrency,
  CreditStatus,
  PaymentProvider,
  PaymentRefundReason,
  PaymentRefundState,
} from "../db/schema";

const HASH = /^[0-9a-f]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ACCESS_STATUS = new Set<AccessKeyStatus>([
  "active",
  "revoked",
  "exhausted",
]);
const CREDIT_STATUS = new Set<CreditStatus>([
  "reserved",
  "settled",
  "refunded",
]);
const PROVIDERS = new Set<PaymentProvider>(["airwallex", "stripe"]);
const CURRENCIES = new Set<CommerceCurrency>(["CNY", "USD", "HKD"]);
const REFUND_REASONS = new Set<PaymentRefundReason>([
  "completed_limited",
  "report_failed",
  "sla_missed",
  "operator_approved",
]);
const REFUND_STATES = new Set<PaymentRefundState>([
  "pending",
  "submitted",
  "succeeded",
  "failed",
]);

type AccessKey = {
  idHash: string;
  keyPrefixHash: string;
  paymentOrderIdHash: string | null;
  status: AccessKeyStatus;
  creditsRemaining: number;
  expiresAt: string | null;
  revokedAt: string | null;
};
type Credit = {
  idHash: string;
  accessKeyIdHash: string;
  reportIdHash: string;
  jobIdHash: string | null;
  paymentOrderIdHash: string | null;
  idempotencyKeyHash: string;
  credits: number;
  status: CreditStatus;
  reservedAt: string;
  settledAt: string | null;
  refundedAt: string | null;
};
type Refund = {
  idHash: string;
  orderIdHash: string;
  provider: PaymentProvider;
  providerRefundIdHash: string | null;
  reason: PaymentRefundReason;
  amountMinor: number;
  currency: CommerceCurrency;
  state: PaymentRefundState;
  idempotencyKeyHash: string;
  attempts: number;
  failureCode: string | null;
  submittedAt: string | null;
  succeededAt: string | null;
};
export type ReportV4CommerceCreditAuthority = {
  accessKeys: AccessKey[];
  creditLedger: Credit[];
  refunds: Refund[];
};

export function normalizeReportV4CommerceCreditAuthority(
  input: unknown,
): ReportV4CommerceCreditAuthority {
  const r = record(input, "authority");
  rejectUnknown(r, ["accessKeys", "creditLedger", "refunds"]);
  return {
    accessKeys: list(r.accessKeys, normalizeAccessKey, "accessKeys"),
    creditLedger: list(r.creditLedger, normalizeCredit, "creditLedger"),
    refunds: list(r.refunds, normalizeRefund, "refunds"),
  };
}
function list<T extends { idHash: string }>(
  v: unknown,
  fn: (v: unknown) => T,
  label: string,
): T[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`);
  const rows = v.map((x, i) => fnAt(x, fn, `${label}[${i}]`));
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.idHash)) throw new Error(`${label} duplicate idHash`);
    ids.add(row.idHash);
  }
  return rows.sort((a, b) => a.idHash.localeCompare(b.idHash));
}
function fnAt<T>(v: unknown, fn: (v: unknown) => T, path: string): T {
  try {
    return fn(v);
  } catch (e) {
    throw new Error(
      `${path}: ${e instanceof Error ? e.message : "invalid value"}`,
    );
  }
}
function normalizeAccessKey(value: unknown): AccessKey {
  const r = record(value, "object");
  rejectUnknown(r, [
    "idHash",
    "keyPrefixHash",
    "paymentOrderIdHash",
    "status",
    "creditsRemaining",
    "expiresAt",
    "revokedAt",
  ]);
  return {
    idHash: hash(r.idHash),
    keyPrefixHash: hash(r.keyPrefixHash),
    paymentOrderIdHash: nullableHash(r.paymentOrderIdHash),
    status: enumValue(r.status, ACCESS_STATUS, "status"),
    creditsRemaining: integer(r.creditsRemaining, "creditsRemaining", 0),
    expiresAt: nullableTime(r.expiresAt),
    revokedAt: nullableTime(r.revokedAt),
  };
}
function normalizeCredit(value: unknown): Credit {
  const r = record(value, "object");
  rejectUnknown(r, [
    "idHash",
    "accessKeyIdHash",
    "reportIdHash",
    "jobIdHash",
    "paymentOrderIdHash",
    "idempotencyKeyHash",
    "credits",
    "status",
    "reservedAt",
    "settledAt",
    "refundedAt",
  ]);
  return {
    idHash: hash(r.idHash),
    accessKeyIdHash: hash(r.accessKeyIdHash),
    reportIdHash: hash(r.reportIdHash),
    jobIdHash: nullableHash(r.jobIdHash),
    paymentOrderIdHash: nullableHash(r.paymentOrderIdHash),
    idempotencyKeyHash: hash(r.idempotencyKeyHash),
    credits: integer(r.credits, "credits", 1),
    status: enumValue(r.status, CREDIT_STATUS, "status"),
    reservedAt: time(r.reservedAt),
    settledAt: nullableTime(r.settledAt),
    refundedAt: nullableTime(r.refundedAt),
  };
}
function normalizeRefund(value: unknown): Refund {
  const r = record(value, "object");
  rejectUnknown(r, [
    "idHash",
    "orderIdHash",
    "provider",
    "providerRefundIdHash",
    "reason",
    "amountMinor",
    "currency",
    "state",
    "idempotencyKeyHash",
    "attempts",
    "failureCode",
    "submittedAt",
    "succeededAt",
  ]);
  return {
    idHash: hash(r.idHash),
    orderIdHash: hash(r.orderIdHash),
    provider: enumValue(r.provider, PROVIDERS, "provider"),
    providerRefundIdHash: nullableHash(r.providerRefundIdHash),
    reason: enumValue(r.reason, REFUND_REASONS, "reason"),
    amountMinor: integer(r.amountMinor, "amountMinor", 1),
    currency: enumValue(r.currency, CURRENCIES, "currency"),
    state: enumValue(r.state, REFUND_STATES, "state"),
    idempotencyKeyHash: hash(r.idempotencyKeyHash),
    attempts: integer(r.attempts, "attempts", 0),
    failureCode: nullableCode(r.failureCode),
    submittedAt: nullableTime(r.submittedAt),
    succeededAt: nullableTime(r.succeededAt),
  };
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function record(v: unknown, label: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`${label} must be an object`);
  return v;
}
function rejectUnknown(r: Record<string, unknown>, allowed: string[]): void {
  const keys = new Set(allowed);
  for (const k of Object.keys(r))
    if (!keys.has(k)) throw new Error(`unknown key ${k}`);
  for (const k of allowed)
    if (!(k in r) || r[k] === undefined) throw new Error(`missing key ${k}`);
}
function hash(v: unknown): string {
  if (typeof v !== "string" || !HASH.test(v)) throw new Error("invalid hash");
  return v;
}
function nullableHash(v: unknown): string | null {
  return v === null ? null : hash(v);
}
function time(v: unknown): string {
  if (typeof v !== "string" || !UTC.test(v))
    throw new Error("invalid canonical UTC timestamp");
  const d = new Date(v);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== v)
    throw new Error("invalid canonical UTC timestamp");
  return v;
}
function nullableTime(v: unknown): string | null {
  return v === null ? null : time(v);
}
function integer(v: unknown, label: string, min: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
    throw new Error(`${label} must be integer >= ${min}`);
  return v;
}
function enumValue<T>(v: unknown, set: Set<T>, label: string): T {
  if (typeof v !== "string" || !set.has(v as T))
    throw new Error(`invalid ${label}`);
  return v as T;
}
function nullableCode(v: unknown): string | null {
  if (v === null) return null;
  if (
    typeof v !== "string" ||
    v.length === 0 ||
    v.trim() !== v ||
    v.length > 200
  )
    throw new Error("invalid failureCode");
  return v;
}
