import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function hmacSecret(value: string, secret: string): string {
  if (!value || !secret) {
    throw new Error("Both a value and an HMAC secret are required.");
  }
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function verifyHmacSecret(value: string, expectedHex: string, secret: string): boolean {
  const actual = Buffer.from(hmacSecret(value, secret), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateOpaqueSecret(prefix: string): { raw: string; displayPrefix: string } {
  const raw = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { raw, displayPrefix: raw.slice(0, Math.min(raw.length, prefix.length + 9)) };
}

export function requireSecret(name: "OGC_TOKEN_HASH_SECRET" | "OGC_IP_HASH_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters.`);
  }
  return value;
}
