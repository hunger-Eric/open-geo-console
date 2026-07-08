import { afterEach, describe, expect, it, vi } from "vitest";
import { auditSite, createFinding, extractSitemapUrls, selectRepresentativePages } from "./index";

describe("geo auditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts sitemap URLs", () => {
    expect(
      extractSitemapUrls(
        "<urlset><url><loc>https://example.com/</loc></url><url><loc>/about</loc></url></urlset>",
        new URL("https://example.com/")
      )
    ).toEqual(["https://example.com/", "https://example.com/about"]);
  });

  it("selects representative pages from sitemap candidates", () => {
    const pages = selectRepresentativePages(new URL("https://example.com/"), [
      "https://example.com/blog/launch",
      "https://example.com/services",
      "https://example.com/about",
      "https://other.example.com/products"
    ]);

    expect(pages).toEqual(
      expect.arrayContaining([
        "https://example.com/",
        "https://example.com/services",
        "https://example.com/blog/launch",
        "https://example.com/about"
      ])
    );
    expect(pages).not.toContain("https://other.example.com/products");
  });

  it("returns stable findings for missing llms, schema, sitemap, and 404 pages", async () => {
    const responses = new Map<string, Response>([
      [
        "https://example.com/",
        new Response(
          "<html><head><title>Example</title><meta name=\"description\" content=\"Short\"></head><body><h1>Example</h1><p>tiny</p></body></html>",
          { status: 200 }
        )
      ],
      ["https://example.com/robots.txt", new Response("User-agent: *", { status: 200 })],
      ["https://example.com/sitemap.xml", new Response("", { status: 404 })],
      ["https://example.com/llms.txt", new Response("", { status: 404 })]
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => responses.get(url) ?? new Response("", { status: 404 }))
    );

    const report = await auditSite("https://example.com");
    expect(report.machineReadableAssets.llmsTxt.present).toBe(false);
    expect(report.machineReadableAssets.sitemapXml.present).toBe(false);
    expect(report.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["missing-llms", "missing-sitemap"])
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "missing-llms",
        messageKey: "asset.missingLlmsTxt",
        params: { assetPath: "/llms.txt" },
        title: "Missing llms.txt"
      })
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        messageKey: "page.missingJsonLd",
        title: "Missing JSON-LD schema"
      })
    );
    expect(report.score).toBeLessThan(90);
  });

  it("creates keyed findings with params while preserving rendered fallback copy", () => {
    const finding = createFinding({
      id: "bad-status-test",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      url: "https://example.com/missing"
    });

    expect(finding).toMatchObject({
      id: "bad-status-test",
      severity: "critical",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      title: "Page returned an error status",
      description: "https://example.com/missing returned HTTP 404.",
      recommendation: "Fix broken canonical pages or remove them from the sitemap."
    });
  });
});
