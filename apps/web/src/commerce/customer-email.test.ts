import { describe, expect, it } from "vitest";
import { customerEmailLookupHmac, normalizeCustomerEmail, protectCustomerEmail, revealCustomerEmail } from "./customer-email";

const environment = {
  OGC_EMAIL_ENCRYPTION_SECRET: "encryption-secret-with-at-least-32-characters",
  OGC_EMAIL_LOOKUP_SECRET: "lookup-secret-with-at-least-32-characters"
};

describe("customer email protection", () => {
  it("normalizes, encrypts with authentication, and indexes without plaintext", () => {
    const protectedEmail = protectCustomerEmail(" Buyer@Example.COM ", environment);
    expect(protectedEmail.encrypted).not.toContain("buyer@example.com");
    expect(protectedEmail.lookupHmac).toBe(customerEmailLookupHmac("buyer@example.com", environment));
    expect(revealCustomerEmail(protectedEmail.encrypted, environment)).toBe("buyer@example.com");
  });

  it("rejects invalid addresses and modified ciphertext", () => {
    expect(() => normalizeCustomerEmail("not-an-email")).toThrow();
    const encrypted = protectCustomerEmail("buyer@example.com", environment).encrypted;
    expect(() => revealCustomerEmail(`${encrypted}x`, environment)).toThrow("authenticated");
  });
});
