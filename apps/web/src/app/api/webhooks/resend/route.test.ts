import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), record: vi.fn() }));
vi.mock("@/email/resend-webhook", () => ({ verifyAndParseResendWebhook: mocks.verify }));
vi.mock("@/db/commercial-delivery", () => ({ recordEmailProviderEvent: mocks.record }));
import { POST } from "./route";

describe("Resend webhook route", () => {
  it("maps complaints to a terminal failed delivery without storing recipient data", async () => {
    mocks.verify.mockReturnValue({ eventId: "msg-1", eventType: "email.complained", providerEmailId: "email-1", createdAt: new Date("2026-07-10T00:00:00Z") });
    const response = await POST(new Request("https://example.test/api/webhooks/resend", { method: "POST", body: "raw" }));
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ providerEventId: "msg-1", providerEmailId: "email-1", targetState: "failed" }));
  });
});
