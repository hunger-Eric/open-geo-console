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
  <script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Acme","legalName":"Acme Legal","alternateName":["Acme Co",{"bad":true}]},{"@type":["Product","Thing"],"name":"Product One","brand":{"name":"Acme Products"}},{"@type":"Article","name":"Marketing headline"}]}</script>
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
      jsonLdTypes: ["Organization", "Product", "Thing", "Article"],
      officialNames: ["Acme", "Acme Legal", "Acme Co", "Product One", "Acme Products"],
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

  it("bounds official names and ignores unsupported or malformed name values", () => {
    const brands = Array.from({ length: 40 }, (_, index) => ({ "@type": "Brand", name: `Brand ${index + 1}` }));
    const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [
      ...brands,
      { "@type": "SoftwareApplication", name: { unexpected: true }, alternateName: "x".repeat(500) },
      { "@type": "Article", name: "Not official" }
    ] })}</script><body>${"usable text ".repeat(100)}</body>`;
    const page = extractPageContent(html, "https://example.com");
    expect(page.officialNames).toHaveLength(32);
    expect(page.officialNames).not.toContain("Not official");
    expect(page.officialNames).not.toContain("x".repeat(500));
  });

  it("extracts names only from supported organization, brand, product, and service schema types", () => {
    const graph = [
      { "@type": "Corporation", name: "Acme Corp" },
      { "@type": "LocalBusiness", legalName: "Acme Local LLC" },
      { "@type": "Brand", alternateName: "Acme Brand" },
      { "@type": "Service", name: "Service 360" },
      { "@type": "SoftwareApplication", name: "AcmeApp" }
    ];
    const page = extractPageContent(
      `<script type="application/ld+json">${JSON.stringify({ "@graph": graph })}</script><body>${"usable text ".repeat(100)}</body>`,
      "https://example.com"
    );
    expect(page.officialNames).toEqual(["Acme Corp", "Acme Local LLC", "Acme Brand", "Service 360", "AcmeApp"]);
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
