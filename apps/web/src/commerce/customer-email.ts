import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export interface ProtectedEmail {
  encrypted: string;
  lookupHmac: string;
}

export function normalizeCustomerEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("A customer email address is required.");
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid customer email address.");
  }
  return normalized;
}

export function protectCustomerEmail(email: string, environment: NodeJS.ProcessEnv = process.env): ProtectedEmail {
  const normalized = normalizeCustomerEmail(email);
  const encryptionKey = deriveKey(required(environment, "OGC_EMAIL_ENCRYPTION_SECRET"));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`,
    lookupHmac: createHmac("sha256", required(environment, "OGC_EMAIL_LOOKUP_SECRET")).update(normalized).digest("hex")
  };
}

export function revealCustomerEmail(encrypted: string, environment: NodeJS.ProcessEnv = process.env): string {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Customer email ciphertext is invalid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(required(environment, "OGC_EMAIL_ENCRYPTION_SECRET")), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Customer email ciphertext could not be authenticated.");
  }
}

export function customerEmailLookupHmac(email: string, environment: NodeJS.ProcessEnv = process.env): string {
  return createHmac("sha256", required(environment, "OGC_EMAIL_LOOKUP_SECRET"))
    .update(normalizeCustomerEmail(email))
    .digest("hex");
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters.`);
  return value;
}
