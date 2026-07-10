import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("scan API report locale", () => {
  it("rejects a missing or unsupported locale before scanning", async () => {
    for (const locale of [undefined, "EN", "zh-CN", "fr"]) {
      const response = await POST(new Request("http://localhost/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", locale })
      }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Locale must be either en or zh.");
    }
  });

  it("rejects forceFresh in production before scanning", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    const response = await POST(new Request("http://localhost/api/scan?forceFresh=true", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "forceFresh=true",
        "x-ogc-force-fresh": "true"
      },
      body: JSON.stringify({ url: "https://example.com", locale: "en", forceFresh: true })
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).errorKey).toBe("forceFreshUnavailable");
  });
});
