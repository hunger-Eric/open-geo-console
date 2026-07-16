import { describe, expect, it } from "vitest";
import {
  V4_STANDARD_ANALYZABLE_PAGE_LIMIT,
  assessAnalyzableSiteAdmission,
  classifyAnalyzableSitePage,
  type AnalyzableSitePageObservation
} from "./analyzable-site";

function observation(
  overrides: Partial<AnalyzableSitePageObservation> = {}
): AnalyzableSitePageObservation {
  return {
    siteUrl: "https://www.example.com/",
    url: "https://example.com/about",
    networkSafety: "public",
    access: "public",
    contentType: "text/html; charset=utf-8",
    analyzableText: "A public page with useful company information.",
    ...overrides
  };
}

describe("V4 analyzable site admission", () => {
  // @requirement GEO-V4-CRAWL-01
  it("admits only safe public same-site HTML with nonblank analyzable text", () => {
    expect(classifyAnalyzableSitePage(observation({
      url: "https://example.com/about?utm_source=test&lang=en#team"
    }))).toMatchObject({
      status: "analyzable",
      page: { normalizedUrl: "https://example.com/about?lang=en" }
    });

    expect(classifyAnalyzableSitePage(observation({
      contentType: "application/xhtml+xml"
    }))).toMatchObject({ status: "analyzable" });
  });

  // @requirement GEO-V4-CRAWL-01
  it.each([
    ["unsafe network", { networkSafety: "unsafe" }, "unsafe_network"],
    ["unverified network", { networkSafety: "unverified" }, "unverified_network_safety"],
    ["blocked literal despite a public claim", { siteUrl: "http://127.0.0.1/", url: "http://127.0.0.1/about" }, "unsafe_network"],
    ["non-HTTP URL", { url: "ftp://example.com/file" }, "unsupported_protocol"],
    ["credentials", { url: "https://user:secret@example.com/about" }, "embedded_credentials"],
    ["cross-site URL", { url: "https://elsewhere.test/about" }, "cross_site"],
    ["PDF URL", { url: "https://example.com/catalog.pdf" }, "excluded_document_type"],
    ["Word URL", { url: "https://example.com/catalog.docx" }, "excluded_document_type"],
    ["media URL", { url: "https://example.com/demo.mp4" }, "excluded_document_type"],
    ["archive URL", { url: "https://example.com/assets.zip" }, "excluded_document_type"],
    ["login", { access: "login_required" }, "login_required"],
    ["captcha", { access: "captcha_required" }, "captcha_required"],
    ["paywall", { access: "paywalled" }, "paywalled"],
    ["robots exclusion", { explicitExclusion: "robots_denied" }, "robots_denied"],
    ["policy exclusion", { explicitExclusion: "policy_excluded" }, "policy_excluded"],
    ["non-HTML response", { contentType: "application/pdf" }, "non_html_content_type"],
    ["empty body", { analyzableText: "  \n\t " }, "empty_analyzable_body"]
  ] as const)("excludes %s with an explicit reason", (_label, overrides, reason) => {
    expect(classifyAnalyzableSitePage(observation(overrides))).toMatchObject({
      status: "excluded",
      reason
    });
  });

  // @requirement GEO-V4-CRAWL-03
  it("admits zero, one, fifty and fifty-one analyzable pages at exact boundaries", () => {
    expect(assessAnalyzableSiteAdmission([])).toMatchObject({
      outcome: "unavailable",
      analyzablePageCount: 0,
      pages: []
    });

    expect(assessAnalyzableSiteAdmission([observation()])).toMatchObject({
      outcome: "standard",
      analyzablePageCount: 1
    });

    const fifty = Array.from({ length: V4_STANDARD_ANALYZABLE_PAGE_LIMIT }, (_, index) =>
      observation({ url: `https://example.com/page-${index + 1}` })
    );
    const standard = assessAnalyzableSiteAdmission(fifty);
    expect(standard).toMatchObject({
      outcome: "standard",
      analyzablePageCount: V4_STANDARD_ANALYZABLE_PAGE_LIMIT
    });
    expect(standard.pages).toHaveLength(V4_STANDARD_ANALYZABLE_PAGE_LIMIT);

    const oversized = assessAnalyzableSiteAdmission([
      ...fifty,
      observation({ url: "https://example.com/page-51" })
    ]);
    expect(oversized).toMatchObject({
      outcome: "custom_service",
      analyzablePageCount: V4_STANDARD_ANALYZABLE_PAGE_LIMIT + 1,
      pages: []
    });
  });

  // @requirement GEO-V4-CRAWL-03
  it("does not spend the standard capacity on failures, exclusions or normalized duplicates", () => {
    const analyzable = Array.from({ length: V4_STANDARD_ANALYZABLE_PAGE_LIMIT }, (_, index) =>
      observation({ url: `https://example.com/accepted-${index + 1}` })
    );
    const excluded = Array.from({ length: 75 }, (_, index) =>
      observation({
        url: `https://example.com/excluded-${index + 1}`,
        contentType: "application/octet-stream"
      })
    );
    const result = assessAnalyzableSiteAdmission([
      ...excluded,
      observation({ networkSafety: "unsafe", url: "https://example.com/unsafe" }),
      ...analyzable,
      observation({ url: "https://example.com/accepted-1?utm_source=duplicate#fragment" })
    ]);

    expect(result.outcome).toBe("standard");
    expect(result.analyzablePageCount).toBe(V4_STANDARD_ANALYZABLE_PAGE_LIMIT);
    expect(result.pages).toHaveLength(V4_STANDARD_ANALYZABLE_PAGE_LIMIT);
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason: "duplicate" }));
  });
});
