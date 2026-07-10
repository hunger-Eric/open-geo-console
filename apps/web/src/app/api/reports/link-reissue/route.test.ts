import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn() }));
vi.mock("@/db/commercial-delivery", () => ({ requestReportLinkReissue: mocks.request }));
vi.mock("@/security/turnstile", () => ({ verifyTurnstile: mocks.verify }));
import { POST } from "./route";

describe("report link reissue route", () => {
  it("returns the same generic response when the order/email pair is unknown", async () => {
    process.env.OGC_EMAIL_LOOKUP_SECRET = "lookup-secret-with-at-least-32-characters";
    mocks.verify.mockResolvedValue({ success: true, errorCodes: [] });
    mocks.request.mockResolvedValue({ accepted: false });
    const response = await POST(new Request("https://example.test/api/reports/link-reissue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderReference: "order-1", email: "buyer@example.com", turnstileToken: "human" })
    }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
  });
});
