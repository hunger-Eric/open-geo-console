import { describe, expect, it } from "vitest";
import { getTrustedClientIp } from "./client-ip";

describe("getTrustedClientIp", () => {
  it("uses Vercel's anti-spoofing client IP header on Vercel", () => {
    const request = new Request("https://example.test", {
      headers: {
        "cf-connecting-ip": "198.51.100.9",
        "x-forwarded-for": "198.51.100.10",
        "x-vercel-forwarded-for": "203.0.113.7"
      }
    });

    expect(getTrustedClientIp(request, { VERCEL: "1" })).toBe("203.0.113.7");
  });

  it("falls back to Vercel's overwritten x-forwarded-for header on legacy deployments", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.10" }
    });

    expect(getTrustedClientIp(request, { VERCEL: "1" })).toBe("198.51.100.10");
  });

  it("fails closed on Vercel when no platform IP header is present", () => {
    expect(getTrustedClientIp(new Request("https://example.test"), { VERCEL: "1" }))
      .toBe("untrusted-direct-client");
  });

  it("supports an explicit Vercel trust marker for legacy projects without system variables", () => {
    const request = new Request("https://example.test", {
      headers: { "x-vercel-forwarded-for": "203.0.113.11" }
    });

    expect(getTrustedClientIp(request, { OGC_TRUST_VERCEL_HEADERS: "true" })).toBe("203.0.113.11");
  });

  it("uses explicitly trusted proxy headers outside Vercel", () => {
    const request = new Request("https://example.test", {
      headers: {
        "cf-connecting-ip": "203.0.113.8",
        "x-forwarded-for": "198.51.100.10"
      }
    });

    expect(getTrustedClientIp(request, { TRUST_PROXY_HEADERS: "true" })).toBe("203.0.113.8");
  });

  it("does not trust caller-controlled forwarded headers by default", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.9" }
    });

    expect(getTrustedClientIp(request, {})).toBe("untrusted-direct-client");
  });
});
