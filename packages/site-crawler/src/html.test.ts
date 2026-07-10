import { describe, expect, it } from "vitest";
import {
  detectBrowserFallback,
  extractJsonLd,
  extractLinks,
  extractPageContent,
  extractReadableText
} from "./html";

const richHtml = `<!doctype html>
<html lang="zh-CN"><head>
  <title>Acme &amp; Co</title>
  <meta name="description" content="Industrial tools">
  <link rel="canonical" href="/products/widget">
  <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["Product","Thing"]}]}</script>
</head><body>
  <header>Repeated navigation</header><main>
    <h1>Fast &amp; reliable widgets</h1><h2>Specifications</h2>
    <p>${"Useful product evidence and technical details. ".repeat(20)}</p>
    <a href="/about#team">About</a><a href="mailto:sales@example.com">Mail</a>
  </main><footer>Repeated footer</footer>
</body></html>`;

describe("HTML extraction", () => {
  it("extracts metadata, headings, JSON-LD, links, and readable body text", () => {
    const page = extractPageContent(richHtml, "https://example.com/products/widget");
    expect(page).toMatchObject({
      title: "Acme & Co",
      description: "Industrial tools",
      canonical: "https://example.com/products/widget",
      language: "zh-CN",
      jsonLdTypes: ["Organization", "Product", "Thing"],
      browserFallback: { required: false, reasons: [] }
    });
    expect(page.headings).toEqual([
      { level: 1, text: "Fast & reliable widgets" },
      { level: 2, text: "Specifications" }
    ]);
    expect(page.links).toEqual(["https://example.com/about"]);
    expect(page.text).not.toContain("Repeated navigation");
    expect(page.text).not.toContain("Repeated footer");
  });

  it("ignores malformed JSON-LD while preserving valid blocks", () => {
    const result = extractJsonLd(
      '<script type="application/ld+json">bad</script><script type="application/ld+json">{"@type":"Article"}</script>'
    );
    expect(result.values).toHaveLength(1);
    expect(result.types).toEqual(["Article"]);
  });

  it("resolves and deduplicates crawlable links", () => {
    expect(
      extractLinks(
        '<a href="/about#x">A</a><a href="https://example.com/about">B</a><a href="javascript:void(0)">C</a>',
        "https://example.com"
      )
    ).toEqual(["https://example.com/about"]);
  });

  it("caps extracted content", () => {
    expect(extractReadableText(`<main>${"x".repeat(1000)}</main>`, 100)).toHaveLength(100);
  });

  it("requests a browser fallback for thin hydration shells", () => {
    const html = '<html><body><div id="__next"></div><script id="__NEXT_DATA__">{}</script></body></html>';
    expect(detectBrowserFallback(html, "", 500)).toEqual({
      required: true,
      reasons: [
        "insufficient-readable-text",
        "hydration-root-without-content",
        "client-rendering-marker"
      ]
    });
  });
});
