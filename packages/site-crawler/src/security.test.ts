import { describe, expect, it } from "vitest";
import {
  UrlSafetyError,
  isBlockedHostname,
  isBlockedIpAddress,
  parseHttpUrl,
  resolveSafeUrl,
  validateRedirectChain,
  validateRedirectTarget
} from "./security";
import { createSiteKey } from "./site-key";

const publicResolver = async () => ["93.184.216.34"];

describe("crawler URL safety", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/file", "javascript:alert(1)"])(
    "rejects non-http URL %s",
    (url) => expect(() => parseHttpUrl(url)).toThrowError(UrlSafetyError)
  );

  it("rejects embedded credentials", () => {
    expect(() => parseHttpUrl("https://user:secret@example.com")).toThrowError(
      expect.objectContaining({ code: "embedded-credentials" })
    );
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "172.31.2.4",
    "192.168.1.1",
    "100.64.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1"
  ])("blocks non-public address %s", (address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => expect(isBlockedIpAddress(address)).toBe(false)
  );

  it.each(["localhost", "api.localhost", "metadata.google.internal", "printer.lan", "intranet"])(
    "blocks special hostname %s",
    (hostname) => expect(isBlockedHostname(hostname)).toBe(true)
  );

  it("rejects a hostname if any DNS answer is private", async () => {
    await expect(
      resolveSafeUrl("https://example.com", {
        resolver: async () => ["93.184.216.34", "127.0.0.1"]
      })
    ).rejects.toMatchObject({ code: "blocked-address" });
  });

  it("allows only the benchmark proxy range behind an explicit local-development option", async () => {
    await expect(
      resolveSafeUrl("https://example.com", {
        resolver: async () => ["198.18.0.96"],
        allowBenchmarkNetwork: true
      })
    ).resolves.toMatchObject({ addresses: [{ address: "198.18.0.96", family: 4 }] });

    await expect(
      resolveSafeUrl("https://example.com", {
        resolver: async () => ["127.0.0.1"],
        allowBenchmarkNetwork: true
      })
    ).rejects.toMatchObject({ code: "blocked-address" });
  });

  it("returns resolved addresses for a safe request so transports can pin them", async () => {
    await expect(resolveSafeUrl("https://example.com/path", { resolver: publicResolver })).resolves.toMatchObject({
      url: expect.objectContaining({ href: "https://example.com/path" }),
      addresses: [{ address: "93.184.216.34", family: 4 }]
    });
  });

  it("validates relative redirects and every redirect DNS target", async () => {
    await expect(
      validateRedirectTarget("https://example.com/old", "/new", { resolver: publicResolver })
    ).resolves.toMatchObject({ url: expect.objectContaining({ href: "https://example.com/new" }) });

    await expect(
      validateRedirectChain("https://example.com", ["https://redirect.test", "http://169.254.169.254/latest"], {
        resolver: publicResolver
      })
    ).rejects.toMatchObject({ code: "blocked-hostname" });
  });

  it("enforces redirect count and optional same-site redirects", async () => {
    await expect(
      validateRedirectChain("https://www.example.com", ["/one", "/two"], {
        resolver: publicResolver,
        maxRedirects: 1
      })
    ).rejects.toMatchObject({ code: "too-many-redirects" });

    await expect(
      validateRedirectChain("https://www.example.com", ["https://elsewhere.test"], {
        resolver: publicResolver,
        allowCrossSite: false,
        getSiteKey: createSiteKey
      })
    ).rejects.toMatchObject({ code: "cross-site-redirect" });
  });
});
