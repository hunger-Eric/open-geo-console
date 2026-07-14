import { describe, expect, it } from "vitest";
import { analyzeTitlePatterns, weightedTitleLength } from "./title-patterns";

const suffix =
  "凌顺国际物流-16年老牌货代，专业提供台湾海快专线、台湾海运专线、菲律宾海运专线及跨境物流实时追踪";

describe("title pattern analysis", () => {
  it("finds exact duplicate titles on distinct successful URLs", () => {
    expect(
      analyzeTitlePatterns([
        { url: "https://example.com/a", status: 200, title: "Same page title" },
        { url: "https://example.com/b", status: 200, title: " same   page title " }
      ])
    ).toEqual([
      expect.objectContaining({
        kind: "exact_duplicate",
        affectedUrls: ["https://example.com/a", "https://example.com/b"]
      })
    ]);
  });

  it("finds a dominant shared suffix while retaining page-unique text", () => {
    const result = analyzeTitlePatterns([
      { url: "https://example.com/", status: 200, title: suffix },
      {
        url: "https://example.com/service",
        status: 200,
        title: `国际转运流程-${suffix}`
      },
      {
        url: "https://example.com/about",
        status: 200,
        title: `集团简介-${suffix}`
      },
      {
        url: "https://example.com/news",
        status: 200,
        title: `新闻动态-${suffix}`
      },
      {
        url: "https://example.com/shipping",
        status: 200,
        title: `国际集运-${suffix}`
      }
    ]);

    expect(result).toContainEqual(
      expect.objectContaining({
        kind: "dominant_suffix",
        sharedSegment: suffix.normalize("NFKC"),
        affectedUrls: expect.arrayContaining([
          "https://example.com/service",
          "https://example.com/about"
        ]),
        uniqueSegments: expect.objectContaining({
          "https://example.com/service": "国际转运流程",
          "https://example.com/about": "集团简介"
        })
      })
    );
  });

  it("uses two display units for CJK and one for ASCII", () => {
    expect(weightedTitleLength("GEO 报告")).toBe(8);
  });

  it("does not flag a short reusable brand suffix", () => {
    expect(
      analyzeTitlePatterns([
        { url: "https://example.com/a", status: 200, title: "Air freight | Acme" },
        { url: "https://example.com/b", status: 200, title: "Sea freight | Acme" },
        { url: "https://example.com/c", status: 200, title: "Warehousing | Acme" }
      ])
    ).toEqual([]);
  });

  it("requires three pages for a dominant template", () => {
    expect(
      analyzeTitlePatterns([
        { url: "https://example.com/a", status: 200, title: `A-${suffix}` },
        { url: "https://example.com/b", status: 200, title: `B-${suffix}` }
      ])
    ).toEqual([]);
  });

  it("ignores unsuccessful and untitled pages", () => {
    expect(
      analyzeTitlePatterns([
        { url: "https://example.com/a", status: 404, title: `A-${suffix}` },
        { url: "https://example.com/b", status: 200 },
        { url: "https://example.com/c", status: 200, title: "Distinct useful title" }
      ])
    ).toEqual([]);
  });

  it("finds a dominant shared prefix", () => {
    const prefix =
      "International logistics evidence and service overview for generated answers";
    const result = analyzeTitlePatterns([
      { url: "https://example.com/a", status: 200, title: `${prefix} - Air` },
      { url: "https://example.com/b", status: 200, title: `${prefix} - Sea` },
      { url: "https://example.com/c", status: 200, title: `${prefix} - Rail` }
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        kind: "dominant_prefix",
        sharedSegment: prefix,
        uniqueSegments: {
          "https://example.com/a": "Air",
          "https://example.com/b": "Sea",
          "https://example.com/c": "Rail"
        }
      })
    ]);
  });

  it("chooses the prefix when otherwise qualifying prefix and suffix candidates tie", () => {
    const prefix = `${"P".repeat(16)}OVERLAPS`;
    const suffixTemplate = `OVERLAPS${"S".repeat(16)}`;
    const result = analyzeTitlePatterns([
      { url: "https://example.com/a", status: 200, title: `${prefix}${"A".repeat(16)}` },
      { url: "https://example.com/b", status: 200, title: `${prefix}${"B".repeat(16)}` },
      { url: "https://example.com/c", status: 200, title: `${prefix}${"S".repeat(16)}` },
      { url: "https://example.com/d", status: 200, title: `${"D".repeat(16)}${suffixTemplate}` },
      { url: "https://example.com/e", status: 200, title: `${"E".repeat(16)}${suffixTemplate}` }
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        kind: "dominant_prefix",
        sharedSegment: prefix,
        affectedUrls: [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c"
        ]
      })
    ]);
  });

  it("does not repeat exact-duplicate URLs in a dominant-template match", () => {
    const repeated = `Repeated page-${suffix}`;
    const result = analyzeTitlePatterns([
      { url: "https://example.com/a", status: 200, title: repeated },
      { url: "https://example.com/b", status: 200, title: repeated },
      { url: "https://example.com/c", status: 200, title: `C-${suffix}` },
      { url: "https://example.com/d", status: 200, title: `D-${suffix}` },
      { url: "https://example.com/e", status: 200, title: `E-${suffix}` }
    ]);

    expect(result[0]).toMatchObject({
      kind: "exact_duplicate",
      affectedUrls: ["https://example.com/a", "https://example.com/b"]
    });
    expect(result[1]).toMatchObject({
      kind: "dominant_suffix",
      affectedUrls: [
        "https://example.com/c",
        "https://example.com/d",
        "https://example.com/e"
      ]
    });
  });
});
