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
});
