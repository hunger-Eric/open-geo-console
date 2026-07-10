import { describe, expect, it } from "vitest";
import { createSiteKey, getRegistrableDomain, isSameSite } from "./site-key";

describe("site key normalization", () => {
  it("ignores scheme, www, port, path, query, and fragment", () => {
    expect(createSiteKey("https://www.Example.com:8443/path?a=1#part")).toBe("example.com");
    expect(createSiteKey("http://blog.example.com/elsewhere")).toBe("example.com");
  });

  it("handles common multi-label public suffixes", () => {
    expect(getRegistrableDomain("shop.brand.co.uk")).toBe("brand.co.uk");
    expect(getRegistrableDomain("news.example.com.cn")).toBe("example.com.cn");
  });

  it.each([
    ["alice.github.io", "alice.github.io"],
    ["docs.alice.github.io", "alice.github.io"],
    ["team.vercel.app", "team.vercel.app"],
    ["preview.team.vercel.app", "team.vercel.app"],
    ["project.pages.dev", "project.pages.dev"]
  ])("keeps private-suffix tenant boundary for %s", (hostname, expected) => {
    expect(getRegistrableDomain(hostname)).toBe(expected);
  });

  it("supports extending suffix tables without a package upgrade", () => {
    expect(getRegistrableDomain("preview.customer.host.example", { privateSuffixes: new Set(["host.example"]) })).toBe(
      "customer.host.example"
    );
  });

  it("compares ordinary subdomains as one site but private tenants separately", () => {
    expect(isSameSite("https://shop.example.com", "https://docs.example.com")).toBe(true);
    expect(isSameSite("https://alice.github.io", "https://bob.github.io")).toBe(false);
  });
});
