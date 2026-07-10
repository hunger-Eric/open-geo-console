import { describe, expect, it, vi } from "vitest";
import { isTurnstileRequired, verifyTurnstile } from "./turnstile";

describe("Turnstile", () => {
  it("is fail-closed in production but optional for local deterministic tests", () => {
    expect(isTurnstileRequired({ NODE_ENV: "production" })).toBe(true);
    expect(isTurnstileRequired({ NODE_ENV: "test" })).toBe(false);
  });

  it("verifies the token server-side and checks the deployment hostname", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "example.com" }), { status: 200 }));
    const result = await verifyTurnstile({
      token: "token", remoteIp: "203.0.113.2", fetchImpl,
      environment: { TURNSTILE_REQUIRED: "true", TURNSTILE_SECRET_KEY: "secret", TURNSTILE_EXPECTED_HOSTNAME: "example.com" }
    });
    expect(result.success).toBe(true);
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain("remoteip=203.0.113.2");
  });

  it("rejects a provider success for the wrong hostname", async () => {
    const result = await verifyTurnstile({
      token: "token", fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "evil.example" }), { status: 200 })),
      environment: { TURNSTILE_REQUIRED: "true", TURNSTILE_SECRET_KEY: "secret", TURNSTILE_EXPECTED_HOSTNAME: "example.com" }
    });
    expect(result).toEqual({ success: false, errorCodes: ["hostname-mismatch"] });
  });
});
