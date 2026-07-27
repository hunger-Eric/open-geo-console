import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { amountMinorToMajor, assertCommerceEnabled, getCommerceMode } from "@/commerce/config";
import { CommerceProviderError, type CommerceProviderOperation } from "@/commerce/provider-error";
import type {
  HostedCheckoutInput,
  HostedCheckoutResult,
  PaymentGateway,
  RefundInput,
  RefundResult,
  VerifiedPaymentEvent
} from "./gateway";

interface AirwallexOptions {
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

export class AirwallexGateway implements PaymentGateway {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private accessToken?: AccessToken;

  constructor(options: AirwallexOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult> {
    assertCommerceEnabled(this.environment);
    const response = await this.api("/api/v1/pa/payment_intents/create", {
      request_id: input.orderId,
      amount: amountMinorToMajor(input.amountMinor),
      currency: input.currency,
      merchant_order_id: input.orderId,
      return_url: input.returnUrl,
      metadata: {
        ogc_order_id: input.orderId,
        ogc_report_id: input.reportId,
        ogc_site_key: input.siteKey
      }
    }, "checkout");
    return this.parsePaymentIntent(response, input.orderId, "checkout");
  }

  async getHostedCheckout(providerCheckoutId: string, orderId: string): Promise<HostedCheckoutResult> {
    assertCommerceEnabled(this.environment);
    assertPaymentIntentId(providerCheckoutId);
    const response = await this.apiGet(`/api/v1/pa/payment_intents/${encodeURIComponent(providerCheckoutId)}`, "retrieve");
    return this.parsePaymentIntent(response, orderId, "retrieve");
  }

  async deactivateLegacyHostedCheckout(providerCheckoutId: string, orderId: string): Promise<"deactivated" | "paid"> {
    assertCommerceEnabled(this.environment);
    if (isAirwallexPaymentIntentId(providerCheckoutId)) {
      throw new Error("A PaymentIntent cannot be retired as a legacy Payment Link.");
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(providerCheckoutId)) {
      throw new Error("Airwallex legacy Payment Link ID is invalid.");
    }
    const current = await this.apiGet(`/api/v1/pa/payment_links/${encodeURIComponent(providerCheckoutId)}`, "retrieve");
    const link = parseLegacyPaymentLink(current, providerCheckoutId, orderId);
    if (link.paid) return "paid";
    if (link.active && link.updatedAt > this.now() - 15 * 60_000) {
      throw new Error("The legacy checkout is still active. Please retry after its payment window closes.");
    }
    if (link.active) {
      await this.api(`/api/v1/pa/payment_links/${encodeURIComponent(providerCheckoutId)}/deactivate`, {}, "checkout");
    }
    const confirmed = parseLegacyPaymentLink(
      await this.apiGet(`/api/v1/pa/payment_links/${encodeURIComponent(providerCheckoutId)}`, "retrieve"),
      providerCheckoutId,
      orderId
    );
    if (confirmed.paid) return "paid";
    if (confirmed.active) throw new Error("Airwallex legacy Payment Link could not be deactivated.");
    return "deactivated";
  }

  async retireHostedCheckout(providerCheckoutId: string, orderId: string): Promise<"deactivated" | "cancelled" | "paid"> {
    if (!isAirwallexPaymentIntentId(providerCheckoutId)) {
      return this.deactivateLegacyHostedCheckout(providerCheckoutId, orderId);
    }
    assertCommerceEnabled(this.environment);
    const current = await this.apiGet(`/api/v1/pa/payment_intents/${encodeURIComponent(providerCheckoutId)}`, "retrieve") as Record<string, unknown>;
    assertPaymentIntentOrder(current, orderId);
    const status = String(current.status ?? "").toUpperCase();
    if (["SUCCEEDED", "SETTLED", "PAID"].includes(status)) return "paid";
    if (["CANCELLED", "CANCELED"].includes(status)) return "cancelled";
    if (!["CREATED", "PENDING", "REQUIRES_PAYMENT_METHOD", "REQUIRES_CUSTOMER_ACTION", "REQUIRES_ACTION"].includes(status)) {
      throw new Error(`Airwallex PaymentIntent status ${status || "unknown"} is not safely cancellable.`);
    }
    await this.api(`/api/v1/pa/payment_intents/${encodeURIComponent(providerCheckoutId)}/cancel`, {}, "checkout");
    const confirmed = await this.apiGet(`/api/v1/pa/payment_intents/${encodeURIComponent(providerCheckoutId)}`, "retrieve") as Record<string, unknown>;
    assertPaymentIntentOrder(confirmed, orderId);
    const confirmedStatus = String(confirmed.status ?? "").toUpperCase();
    if (["SUCCEEDED", "SETTLED", "PAID"].includes(confirmedStatus)) return "paid";
    if (!["CANCELLED", "CANCELED"].includes(confirmedStatus)) throw new Error("Airwallex PaymentIntent cancellation was not confirmed.");
    return "cancelled";
  }

  async findHostedCheckoutByReference(orderId: string): Promise<HostedCheckoutResult | null> {
    assertCommerceEnabled(this.environment);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) throw new Error("Airwallex order reference is invalid.");
    const response = await this.apiGet(`/api/v1/pa/payment_intents?merchant_order_id=${encodeURIComponent(orderId)}&page_num=0&page_size=10`, "retrieve") as {
      items?: unknown;
    };
    const matches = Array.isArray(response.items) ? response.items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
      return record.merchant_order_id === orderId && metadata.ogc_order_id === orderId;
    }) : [];
    if (matches.length > 1) throw new Error("Multiple Airwallex PaymentIntents were found for one order reference.");
    return matches[0] ? this.parsePaymentIntent(matches[0], orderId, "retrieve") : null;
  }

  verifyAndParseWebhook(rawBody: string, headers: Headers): VerifiedPaymentEvent {
    if (Buffer.byteLength(rawBody, "utf8") > 256_000) throw new Error("Airwallex webhook body is too large.");
    const timestamp = headers.get("x-timestamp") ?? "";
    const signature = headers.get("x-signature") ?? "";
    const secret = required(this.environment, "AIRWALLEX_WEBHOOK_SECRET");
    if (!timestamp || !signature || !verifyHmac(`${timestamp}${rawBody}`, signature, secret)) {
      throw new Error("Airwallex webhook signature is invalid.");
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId = stringField(payload, "id");
    const eventType = stringField(payload, "name", "type");
    if (!eventId || !eventType) throw new Error("Airwallex webhook is missing its stable event identity.");
    const data = objectField(payload, "data");
    const resource = objectField(data, "object") ?? data;
    if (!resource) throw new Error("Airwallex webhook is missing its payment resource.");
    const metadata = objectField(resource, "metadata");
    const createdAtValue = stringField(payload, "created_at") ?? stringField(resource, "created_at");
    if (!createdAtValue) throw new Error("Airwallex webhook creation time is required.");
    const createdAt = new Date(createdAtValue);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Airwallex webhook creation time is invalid.");
    const providerStatus = stringField(resource, "status");
    const metadataOrderId = stringField(metadata, "ogc_order_id");
    const providerOrderId = stringField(resource, "merchant_order_id", "reference");
    const orderId = validOrderReference(metadataOrderId)
      ? metadataOrderId
      : validOrderReference(providerOrderId)
        ? providerOrderId
        : null;
    const currency = supportedCurrency(stringField(resource, "currency"));
    const amountMinor = currency ? parseMajorAmountMinor(resource.amount) : null;
    const normalized = eventType.toLowerCase();
    const outcome = normalized.includes("refund")
      ? "refund_updated"
      : normalized.includes("succeed") || normalized.includes("paid")
        ? "payment_paid"
        : normalized.includes("fail") || normalized.includes("cancel")
          ? "payment_failed"
          : "ignored";
    return {
      provider: "airwallex",
      eventId,
      eventType,
      createdAt,
      orderId,
      paymentLinkId: stringField(resource, "payment_link_id"),
      paymentIntentId: stringField(resource, "payment_intent_id") ?? (normalized.includes("payment_intent") ? stringField(resource, "id") : null),
      providerRefundId: normalized.includes("refund") ? stringField(resource, "id") : null,
      amountMinor,
      currency,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      outcome,
      providerStatus
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    assertCommerceEnabled(this.environment);
    const response = await this.api("/api/v1/pa/refunds/create", {
      request_id: input.idempotencyKey,
      payment_intent_id: input.paymentIntentId,
      amount: amountMinorToMajor(input.amountMinor),
      reason: input.reason,
      metadata: { ogc_order_id: input.orderId }
    }, "refund") as { id?: unknown; status?: unknown };
    if (typeof response.id !== "string") throw new CommerceProviderError("airwallex", "refund", "invalid_response");
    const status = normalizeRefundStatus(typeof response.status === "string" ? response.status : "");
    return { providerRefundId: response.id, status };
  }

  private async api(path: string, body: Record<string, unknown>, operation: Extract<CommerceProviderOperation, "checkout" | "refund">): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl()}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw airwallexNetworkError(operation, error);
    }
    if (!response.ok) throw new CommerceProviderError("airwallex", operation, "http", response.status);
    return parseProviderJson(response, operation);
  }

  private async apiGet(path: string, operation: "retrieve"): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl()}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
      });
    } catch (error) {
      throw airwallexNetworkError(operation, error);
    }
    if (!response.ok) throw new CommerceProviderError("airwallex", operation, "http", response.status);
    return parseProviderJson(response, operation);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 30_000) return this.accessToken.value;
    let url: string;
    let clientId: string;
    let apiKey: string;
    try {
      url = `${this.baseUrl()}/api/v1/authentication/login`;
      clientId = required(this.environment, "AIRWALLEX_CLIENT_ID");
      apiKey = required(this.environment, "AIRWALLEX_API_KEY");
    } catch (error) {
      throw airwallexConfigurationError(error);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-id": clientId,
          "x-api-key": apiKey
        }
      });
    } catch (error) {
      throw airwallexNetworkError("authentication", error);
    }
    if (!response.ok) throw new CommerceProviderError("airwallex", "authentication", "http", response.status);
    const payload = await parseProviderJson(response, "authentication") as { token?: unknown; expires_at?: unknown };
    if (typeof payload.token !== "string") throw new CommerceProviderError("airwallex", "authentication", "invalid_response");
    const parsedExpiry = typeof payload.expires_at === "string" ? Date.parse(payload.expires_at) : Number.NaN;
    this.accessToken = { value: payload.token, expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : this.now() + 25 * 60_000 };
    return payload.token;
  }

  private baseUrl(): string {
    const configured = this.environment.AIRWALLEX_API_BASE_URL?.trim();
    const mode = getCommerceMode(this.environment);
    if (mode === "test") {
      if (configured && configured.replace(/\/$/, "") !== "https://api-demo.airwallex.com") {
        throw new Error("Airwallex test commerce must use the Sandbox API.");
      }
      return "https://api-demo.airwallex.com";
    }
    if (configured) return configured.replace(/\/$/, "");
    return mode === "live" ? "https://api.airwallex.com" : "https://api-demo.airwallex.com";
  }

  private parsePaymentIntent(value: unknown, orderId: string, operation: "checkout" | "retrieve"): HostedCheckoutResult {
    if (!value || typeof value !== "object") throw new CommerceProviderError("airwallex", operation, "invalid_response");
    const response = value as Record<string, unknown>;
    const id = stringField(response, "id");
    const clientSecret = stringField(response, "client_secret");
    const currency = stringField(response, "currency");
    const merchantOrderId = stringField(response, "merchant_order_id");
    if (!id || !clientSecret || !currency || merchantOrderId !== orderId) {
      throw new CommerceProviderError("airwallex", operation, "invalid_response");
    }
    if (!isAirwallexPaymentIntentId(id)) throw new CommerceProviderError("airwallex", operation, "invalid_response");
    if (currency !== "CNY" && currency !== "USD" && currency !== "HKD") {
      throw new CommerceProviderError("airwallex", operation, "invalid_response");
    }
    return {
      provider: "airwallex",
      providerCheckoutId: id,
      clientSecret,
      currency,
      environment: getCommerceMode(this.environment) === "live" ? "prod" : "demo"
    };
  }
}

export function verifyAirwallexWebhookSignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  return verifyHmac(`${timestamp}${rawBody}`, signature, secret);
}

async function parseProviderJson(response: Response, operation: CommerceProviderOperation): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CommerceProviderError("airwallex", operation, "invalid_response");
  }
}

function airwallexNetworkError(operation: CommerceProviderOperation, error: unknown): CommerceProviderError {
  const name = error instanceof Error ? error.name : "";
  return new CommerceProviderError(
    "airwallex",
    operation,
    name === "AbortError" || name === "TimeoutError" ? "timeout" : "network"
  );
}

function airwallexConfigurationError(error: unknown): CommerceProviderError {
  const failure = new CommerceProviderError("airwallex", "authentication", "invalid_configuration");
  const safeDetail = ["AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "Sandbox API"]
    .find((value) => error instanceof Error && error.message.includes(value));
  if (safeDetail) failure.message = `airwallex authentication failed: ${safeDetail}.`;
  return failure;
}

function verifyHmac(value: string, receivedHex: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(value).digest();
  let received: Buffer;
  try { received = Buffer.from(receivedHex, "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertPaymentIntentId(value: string): void {
  if (!isAirwallexPaymentIntentId(value)) {
    throw new Error("Airwallex PaymentIntent ID is invalid or belongs to a legacy checkout.");
  }
}

export function isAirwallexPaymentIntentId(value: string): boolean {
  return /^int_[a-zA-Z0-9_-]{1,124}$/.test(value);
}

function parseLegacyPaymentLink(value: unknown, providerCheckoutId: string, orderId: string): {
  active: boolean;
  paid: boolean;
  updatedAt: number;
} {
  if (!value || typeof value !== "object") throw new Error("Airwallex did not return a valid legacy Payment Link.");
  const link = value as Record<string, unknown>;
  const metadata = objectField(link, "metadata");
  if (stringField(link, "id") !== providerCheckoutId
    || stringField(link, "reference") !== orderId
    || stringField(metadata, "ogc_order_id") !== orderId) {
    throw new Error("Airwallex legacy Payment Link does not belong to this order.");
  }
  const successfulCount = typeof link.successful_payment_intent_count === "number"
    ? link.successful_payment_intent_count
    : 0;
  const updatedAt = Date.parse(stringField(link, "updated_at", "created_at") ?? "");
  if (!Number.isFinite(updatedAt)) throw new Error("Airwallex legacy Payment Link is missing its update time.");
  return {
    active: link.active === true,
    updatedAt,
    paid: stringField(link, "status")?.toUpperCase() === "PAID"
      || successfulCount > 0
      || Boolean(stringField(link, "latest_successful_payment_intent_id"))
  };
}

function assertPaymentIntentOrder(value: Record<string, unknown>, orderId: string): void {
  const metadata = objectField(value, "metadata");
  if (stringField(value, "merchant_order_id") !== orderId || stringField(metadata, "ogc_order_id") !== orderId) {
    throw new Error("Airwallex PaymentIntent does not belong to this order.");
  }
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" ? nested as Record<string, unknown> : null;
}

function stringField(value: unknown, ...keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

function validOrderReference(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9_-]{1,128}$/.test(value));
}

function supportedCurrency(value: string | null): "CNY" | "USD" | "HKD" | null {
  return value === "CNY" || value === "USD" || value === "HKD" ? value : null;
}

function parseMajorAmountMinor(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const amountMinor = Math.round(value * 100);
  return Math.abs(amountMinor / 100 - value) < 1e-9 && Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

function normalizeRefundStatus(status: string): RefundResult["status"] {
  switch (status.toUpperCase()) {
    case "SETTLED":
    case "ACCEPTED": return "succeeded";
    case "FAILED": return "failed";
    case "RECEIVED": return "submitted";
    default: return "pending";
  }
}
