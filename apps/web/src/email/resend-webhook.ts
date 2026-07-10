import { createHmac, timingSafeEqual } from "node:crypto";

export interface ResendDeliveryEvent {
  eventId: string;
  eventType: "email.sent" | "email.delivered" | "email.bounced" | "email.complained" | "email.suppressed" | "email.failed";
  providerEmailId: string;
  createdAt: Date;
}

export function verifyAndParseResendWebhook(input: {
  rawBody: string;
  headers: Headers;
  webhookSecret?: string;
  now?: Date;
  toleranceSeconds?: number;
}): ResendDeliveryEvent {
  if (Buffer.byteLength(input.rawBody, "utf8") > 256_000) throw new Error("Resend webhook body is too large.");
  const eventId = input.headers.get("svix-id") ?? "";
  const timestamp = input.headers.get("svix-timestamp") ?? "";
  const signatures = input.headers.get("svix-signature") ?? "";
  const secret = input.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  if (!eventId || !timestamp || !signatures || !secret) throw new Error("Resend webhook signature headers are incomplete.");
  const numericTimestamp = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(numericTimestamp) || Math.abs(nowSeconds - numericTimestamp) > (input.toleranceSeconds ?? 300)) {
    throw new Error("Resend webhook timestamp is outside the accepted replay window.");
  }
  const secretBytes = decodeSvixSecret(secret);
  const expected = createHmac("sha256", secretBytes).update(`${eventId}.${timestamp}.${input.rawBody}`).digest();
  const matches = signatures.split(/\s+/).some((entry) => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    let received: Buffer;
    try { received = Buffer.from(encoded, "base64"); } catch { return false; }
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!matches) throw new Error("Resend webhook signature is invalid.");
  const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  const eventType = payload.type;
  if (!isDeliveryEventType(eventType)) throw new Error("Unsupported Resend delivery event type.");
  const data = payload.data;
  if (!data || typeof data !== "object") throw new Error("Resend webhook data is missing.");
  const providerEmailId = (data as Record<string, unknown>).email_id;
  if (typeof providerEmailId !== "string" || !providerEmailId) throw new Error("Resend webhook email ID is missing.");
  const created = typeof payload.created_at === "string" ? new Date(payload.created_at) : new Date(numericTimestamp * 1000);
  if (Number.isNaN(created.getTime())) throw new Error("Resend webhook creation time is invalid.");
  return { eventId, eventType, providerEmailId, createdAt: created };
}

function decodeSvixSecret(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > 0) return decoded;
  } catch {
    // Fall through to a deterministic invalid-signature result.
  }
  return Buffer.from(secret, "utf8");
}

function isDeliveryEventType(value: unknown): value is ResendDeliveryEvent["eventType"] {
  return value === "email.sent" || value === "email.delivered" || value === "email.bounced" ||
    value === "email.complained" || value === "email.suppressed" || value === "email.failed";
}
