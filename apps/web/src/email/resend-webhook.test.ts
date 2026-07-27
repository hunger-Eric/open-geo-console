import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAndParseResendWebhook } from "./resend-webhook";

const now = new Date("2026-07-10T12:00:00Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const secretBytes = Buffer.from("resend-webhook-secret");
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;

function signed(rawBody: string, id = "msg_1") {
  const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return new Headers({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` });
}

describe("Resend webhook verification", () => {
  it("verifies raw body and parses a delivery event", () => {
    const rawBody = JSON.stringify({ type: "email.delivered", created_at: now.toISOString(), data: { email_id: "email_1" } });
    expect(verifyAndParseResendWebhook({ rawBody, headers: signed(rawBody), webhookSecret, now })).toEqual({
      eventId: "msg_1", eventType: "email.delivered", providerEmailId: "email_1", createdAt: now
    });
  });

  it("rejects body mutation and stale signed replays", () => {
    const rawBody = JSON.stringify({ type: "email.bounced", data: { email_id: "email_1" } });
    expect(() => verifyAndParseResendWebhook({ rawBody: `${rawBody} `, headers: signed(rawBody), webhookSecret, now })).toThrow("signature");
    expect(() => verifyAndParseResendWebhook({ rawBody, headers: signed(rawBody), webhookSecret, now: new Date(now.getTime() + 301_000) })).toThrow("replay");
  });
});
