import { createHmac } from "node:crypto";

export function checkoutIdempotencyHmac(input: {
  rawKey: string;
  reportId: string;
  environment?: NodeJS.ProcessEnv;
}): string {
  const key = input.rawKey.trim();
  if (key.length < 8 || key.length > 256) throw new Error("A valid Idempotency-Key is required.");
  const secret = (input.environment ?? process.env).OGC_PAYMENT_IDEMPOTENCY_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("OGC_PAYMENT_IDEMPOTENCY_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(`${input.reportId}\0${key}`).digest("hex");
}
