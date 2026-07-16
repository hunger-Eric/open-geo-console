import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function request(path: string) {
  return new NextRequest(`https://geo.itheheda.online${path}`);
}

describe("default-locale proxy", () => {
  it("rewrites canonical Chinese paths without a client-visible redirect", () => {
    const response = proxy(request("/reports/abc?tab=summary"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://geo.itheheda.online/zh/reports/abc?tab=summary"
    );
  });

  it("permanently redirects legacy Chinese paths and preserves the query", () => {
    const response = proxy(request("/zh/reports/abc?tab=summary"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://geo.itheheda.online/reports/abc?tab=summary"
    );
  });

  it("leaves explicit English and infrastructure paths alone", () => {
    expect(proxy(request("/en/reports/abc")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/scan")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/reports/abc/report.html")).headers.get("x-middleware-next")).toBe("1");
  });
});
