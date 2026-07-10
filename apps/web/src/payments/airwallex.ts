import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { amountMinorToMajor, assertCommerceEnabled, getCommerceMode } from "@/commerce/config";
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
    const response = await this.api("/api/v1/pa/payment_links/create", {
      amount: amountMinorToMajor(input.amountMinor),
      currency: input.currency,
      title: input.locale === "zh" ? "AI 搜索可见性深度诊断" : "AI Search Visibility Audit",
      description: input.locale === "zh" ? "单份全站深度诊断报告" : "One-time full-site diagnostic report",
      reference: input.orderId,
      reusable: false,
      expires_at: input.expiresAt.toISOString(),
      metadata: {
        ogc_order_id: input.orderId,
        ogc_report_id: input.reportId,
        ogc_site_key: input.siteKey
      },
      collectable_shopper_info: {
        billing_address: false,
        message: false,
        phone_number: false,
        reference: false,
        shipping_address: false
      }
    }) as { id?: unknown; url?: unknown };
    if (typeof response.id !== "string" || typeof response.url !== "string") {
      throw new Error("Airwallex did not return a valid hosted checkout.");
    }
    return { provider: "airwallex", providerCheckoutId: response.id, checkoutUrl: response.url };
  }

  async getHostedCheckout(providerCheckoutId: string): Promise<HostedCheckoutResult> {
    assertCommerceEnabled(this.environment);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(providerCheckoutId)) throw new Error("Airwallex checkout ID is invalid.");
    const response = await this.apiGet(`/api/v1/pa/payment_links/${encodeURIComponent(providerCheckoutId)}`) as { id?: unknown; url?: unknown };
    if (typeof response.id !== "string" || typeof response.url !== "string") {
      throw new Error("Airwallex did not return a valid hosted checkout.");
    }
    return { provider: "airwallex", providerCheckoutId: response.id, checkoutUrl: response.url };
  }

  async findHostedCheckoutByReference(orderId: string): Promise<HostedCheckoutResult | null> {
    assertCommerceEnabled(this.environment);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) throw new Error("Airwallex order reference is invalid.");
    const from = new Date(this.now() - 2 * 60 * 60_000).toISOString();
    const response = await this.apiGet(`/api/v1/pa/payment_links?active=true&reusable=false&page_num=0&page_size=100&from_created_at=${encodeURIComponent(from)}`) as {
      items?: unknown;
    };
    const matches = Array.isArray(response.items) ? response.items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
      return record.reference === orderId && metadata.ogc_order_id === orderId;
    }) : [];
    if (matches.length > 1) throw new Error("Multiple Airwallex checkouts were found for one order reference.");
    const match = matches[0] as Record<string, unknown> | undefined;
    return match && typeof match.id === "string" && typeof match.url === "string"
      ? { provider: "airwallex", providerCheckoutId: match.id, checkoutUrl: match.url }
      : null;
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
    const metadata = objectField(resource, "metadata");
    const createdAtValue = stringField(payload, "created_at") ?? stringField(resource, "created_at");
    const createdAt = createdAtValue ? new Date(createdAtValue) : new Date(0);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Airwallex webhook creation time is invalid.");
    const providerStatus = stringField(resource, "status");
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
      orderId: stringField(metadata, "ogc_order_id") ?? stringField(resource, "merchant_order_id", "reference"),
      paymentIntentId: stringField(resource, "payment_intent_id") ?? (normalized.includes("payment_intent") ? stringField(resource, "id") : null),
      providerRefundId: normalized.includes("refund") ? stringField(resource, "id") : null,
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
    }) as { id?: unknown; status?: unknown };
    if (typeof response.id !== "string") throw new Error("Airwallex did not return a refund ID.");
    const status = normalizeRefundStatus(typeof response.status === "string" ? response.status : "");
    return { providerRefundId: response.id, status };
  }

  private async api(path: string, body: Record<string, unknown>): Promise<unknown> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Airwallex request failed with status ${response.status}.`);
    return response.json();
  }

  private async apiGet(path: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${this.baseUrl()}${path}`, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
    });
    if (!response.ok) throw new Error(`Airwallex request failed with status ${response.status}.`);
    return response.json();
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 30_000) return this.accessToken.value;
    const response = await this.fetchImpl(`${this.baseUrl()}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": required(this.environment, "AIRWALLEX_CLIENT_ID"),
        "x-api-key": required(this.environment, "AIRWALLEX_API_KEY")
      }
    });
    if (!response.ok) throw new Error(`Airwallex authentication failed with status ${response.status}.`);
    const payload = await response.json() as { token?: unknown; expires_at?: unknown };
    if (typeof payload.token !== "string") throw new Error("Airwallex authentication did not return a token.");
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
}

export function verifyAirwallexWebhookSignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  return verifyHmac(`${timestamp}${rawBody}`, signature, secret);
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

function normalizeRefundStatus(status: string): RefundResult["status"] {
  switch (status.toUpperCase()) {
    case "SETTLED":
    case "ACCEPTED": return "succeeded";
    case "FAILED": return "failed";
    case "RECEIVED": return "submitted";
    default: return "pending";
  }
}
