import { describe, expect, it } from "vitest";
import {
  REPORT_V4_MAX_PAGE_SUMMARY_CHARS,
  REPORT_V4_MAX_PAGE_SUMMARY_CHUNKS,
  REPORT_V4_MAX_SITE_PAGES,
  REPORT_V4_MAX_SOURCE_LOCATIONS_PER_CHUNK,
  REPORT_V4_MAX_WEBSITE_SYNTHESIS_ITEM_CHARS,
  REPORT_V4_MAX_WEBSITE_SYNTHESIS_ITEMS,
  REPORT_V4_MAX_WEBSITE_SYNTHESIS_SUMMARY_CHARS,
  parseReportV4PageAnalysisOutput,
  parseReportV4QuestionAnswerInput,
  parseReportV4SiteSynthesisInput,
  parseReportV4WebsiteSynthesisOutput
} from "./report-v4-site-synthesis";

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-03
describe("V4 hierarchical site synthesis input", () => {
  it("accepts at most 50 structured summaries without carrying the 50 raw page bodies", () => {
    const rawSentinels = Array.from({ length: REPORT_V4_MAX_SITE_PAGES }, (_, index) => `RAW-BODY-SENTINEL-${index}`);
    const input = {
      targetUrl: "https://target.example/",
      locale: "en",
      pages: rawSentinels.map((_sentinel, index) => page(index + 1))
    };

    const parsed = parseReportV4SiteSynthesisInput(input);
    const serialized = JSON.stringify(parsed);

    expect(parsed.pages).toHaveLength(50);
    expect(parsed.pages[0]?.chunks[0]?.sourceLocations[0]).toEqual({
      locationId: "page-1-location-1",
      startOffset: 0,
      endOffset: 24
    });
    for (const sentinel of rawSentinels) expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("rawBody");
  });

  // @requirement GEO-V4-COPY-01
  it("rejects a 51st page and any raw body field", () => {
    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: Array.from({ length: REPORT_V4_MAX_SITE_PAGES + 1 }, (_, index) => page(index + 1))
    })).toThrow(/50/);

    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [{ ...page(1), rawBody: "RAW-BODY-SENTINEL" }]
    })).toThrow(/rawBody|unknown/i);
  });

  it("requires overlong page summaries to arrive as ordered bounded chunks with source locations", () => {
    const chunked = page(1);
    chunked.chunks = [
      chunk(1, "First bounded summary chunk.", 0, 28),
      chunk(2, "Second bounded summary chunk.", 29, 58)
    ];
    expect(parseReportV4SiteSynthesisInput({ targetUrl: "https://target.example/", locale: "en", pages: [chunked] }).pages[0]?.chunks)
      .toHaveLength(2);

    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [{ ...chunked, chunks: [chunk(2, "Out of order.", 0, 13), chunk(1, "Wrong.", 14, 20)] }]
    })).toThrow(/order/i);

    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [{ ...chunked, chunks: [chunk(1, "x".repeat(REPORT_V4_MAX_PAGE_SUMMARY_CHARS + 1), 0, 10)] }]
    })).toThrow(/summary|characters/i);

    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [{ ...chunked, chunks: [{ order: 1, summary: "No location evidence.", sourceLocations: [] }] }]
    })).toThrow(/sourceLocations/i);
  });

  it("deep-freezes every accepted level", () => {
    const parsed = parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [page(1)]
    });

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.pages)).toBe(true);
    expect(Object.isFrozen(parsed.pages[0])).toBe(true);
    expect(Object.isFrozen(parsed.pages[0]?.chunks)).toBe(true);
    expect(Object.isFrozen(parsed.pages[0]?.chunks[0])).toBe(true);
    expect(Object.isFrozen(parsed.pages[0]?.chunks[0]?.sourceLocations)).toBe(true);
    expect(Object.isFrozen(parsed.pages[0]?.chunks[0]?.sourceLocations[0])).toBe(true);
  });

  it("revalidates persisted source locations against their trusted source length", () => {
    const persisted = parseReportV4PageAnalysisOutput({
      chunks: [chunk(1, "Bounded persisted summary.", 0, 80)]
    }, pageContext());
    const corrupted = {
      ...persisted,
      chunks: [{
        ...persisted.chunks[0]!,
        sourceLocations: [{
          ...persisted.chunks[0]!.sourceLocations[0]!,
          endOffset: 101
        }]
      }]
    };

    expect(persisted).toMatchObject({ sourceLength: 100 });
    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [corrupted]
    })).toThrow(/sourceLength|retained source|bounds/i);

    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [{ ...page(1), sourceLength: 0 }]
    })).toThrow(/sourceLength|positive integer/i);

    const { sourceLength: _removed, ...withoutSourceLength } = page(1);
    expect(() => parseReportV4SiteSynthesisInput({
      targetUrl: "https://target.example/",
      locale: "en",
      pages: [withoutSourceLength]
    })).toThrow(/sourceLength|positive integer/i);
  });

  it("keeps question-answer input strictly single-question and free of site bodies or other questions", () => {
    expect(parseReportV4QuestionAnswerInput({
      questionId: "question-1",
      question: "Which service fits this route?",
      locale: "en",
      region: "US"
    })).toEqual({ questionId: "question-1", question: "Which service fits this route?", locale: "en", region: "US" });

    expect(() => parseReportV4QuestionAnswerInput({
      questionId: "question-1",
      question: "Which service fits this route?",
      locale: "en",
      region: "US",
      questions: ["another question"]
    })).toThrow(/questions|unknown/i);
    expect(() => parseReportV4QuestionAnswerInput({
      questionId: "question-1",
      question: "Which service fits this route?",
      locale: "en",
      region: "US",
      siteBody: "whole site body"
    })).toThrow(/siteBody|unknown/i);
  });
});

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-03
// @requirement GEO-V4-COPY-01
describe("V4 page-analysis output", () => {
  it("binds a valid hierarchical model output to trusted page identity and deep-freezes it", () => {
    const parsed = parseReportV4PageAnalysisOutput({
      chunks: [
        chunk(1, "The page identifies the service and its operating region.", 0, 30),
        chunk(2, "The page provides concrete delivery and contact details.", 31, 80)
      ]
    }, pageContext());

    expect(parsed).toMatchObject({
      pageId: "page-1",
      url: "https://target.example/page-1",
      contentHash: "1".padStart(64, "0"),
      readability: "direct_readable"
    });
    expect(parsed.chunks).toHaveLength(2);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.chunks)).toBe(true);
    expect(Object.isFrozen(parsed.chunks[0])).toBe(true);
    expect(Object.isFrozen(parsed.chunks[0]?.sourceLocations)).toBe(true);
    expect(Object.isFrozen(parsed.chunks[0]?.sourceLocations[0])).toBe(true);
  });

  it.each([
    [{}, /chunks/i],
    [{ chunks: [], rawBody: "whole page" }, /rawBody|unknown/i],
    [{ chunks: [], rawProviderJson: { secret: true } }, /rawProviderJson|unknown/i],
    [{ chunks: [], systemPrompt: "hidden instructions" }, /systemPrompt|unknown/i],
    [{ chunks: [], pageId: "model-controlled-page" }, /pageId|unknown/i],
    [{ chunks: [], sourceLength: 1 }, /sourceLength|unknown/i]
  ])("rejects missing or internal output fields", (value, expected) => {
    expect(() => parseReportV4PageAnalysisOutput(value, pageContext())).toThrow(expected);
  });

  it("rejects empty, excessive, unordered and overlong chunks", () => {
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [] }, pageContext())).toThrow(/chunks/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: Array.from({ length: REPORT_V4_MAX_PAGE_SUMMARY_CHUNKS + 1 }, (_, index) => (
        chunk(index + 1, `Summary ${index + 1}`, index, index + 1)
      ))
    }, pageContext())).toThrow(/chunks/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [chunk(2, "Wrong order", 0, 10)]
    }, pageContext())).toThrow(/order/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [chunk(1, " ", 0, 10)]
    }, pageContext())).toThrow(/summary|non-empty/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [chunk(1, "x".repeat(REPORT_V4_MAX_PAGE_SUMMARY_CHARS + 1), 0, 10)]
    }, pageContext())).toThrow(/summary|characters/i);
  });

  it("rejects missing, excessive, duplicate and out-of-bounds source locations", () => {
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [{ order: 1, summary: "No locations", sourceLocations: [] }]
    }, pageContext())).toThrow(/sourceLocations/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [{
        order: 1,
        summary: "Too many locations",
        sourceLocations: Array.from({ length: REPORT_V4_MAX_SOURCE_LOCATIONS_PER_CHUNK + 1 }, (_, index) => ({
          locationId: `location-${index}`,
          startOffset: index,
          endOffset: index + 1
        }))
      }]
    }, pageContext())).toThrow(/sourceLocations/i);
    expect(() => parseReportV4PageAnalysisOutput({
      chunks: [
        chunk(1, "First", 0, 10),
        { ...chunk(2, "Second", 11, 20), sourceLocations: [{ locationId: "page-1-location-1", startOffset: 11, endOffset: 20 }] }
      ]
    }, pageContext())).toThrow(/locationId|unique/i);
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [chunk(1, "Negative", -1, 10)] }, pageContext())).toThrow(/startOffset|nonnegative/i);
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [chunk(1, "Reversed", 10, 10)] }, pageContext())).toThrow(/endOffset|greater/i);
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [chunk(1, "Past retained source", 90, 101)] }, pageContext())).toThrow(/sourceLength|retained source|bounds/i);
  });

  it("rejects untrusted or invalid page-analysis context", () => {
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [chunk(1, "Valid", 0, 10)] }, {
      ...pageContext(),
      sourceLength: 0
    })).toThrow(/sourceLength/i);
    expect(() => parseReportV4PageAnalysisOutput({ chunks: [chunk(1, "Valid", 0, 10)] }, {
      ...pageContext(),
      rawBody: "must not cross the contract"
    })).toThrow(/rawBody|unknown/i);
  });
});

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-COPY-01
describe("V4 website-synthesis output", () => {
  it("accepts only bounded customer fields and deep-freezes them", () => {
    const parsed = parseReportV4WebsiteSynthesisOutput(websiteSynthesis());

    expect(parsed.summary).toContain("target site");
    expect(parsed.strengths).toEqual(["The service scope is stated clearly."]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.strengths)).toBe(true);
    expect(Object.isFrozen(parsed.gaps)).toBe(true);
    expect(Object.isFrozen(parsed.actions)).toBe(true);
  });

  it.each([
    [{ strengths: ["one"], gaps: ["one"], actions: ["one"] }, /summary/i],
    [{ ...websiteSynthesis(), prompt: "hidden" }, /prompt|unknown/i],
    [{ ...websiteSynthesis(), rawProviderJson: { choices: [] } }, /rawProviderJson|unknown/i],
    [{ ...websiteSynthesis(), pages: [page(1)] }, /pages|unknown/i],
    [{ ...websiteSynthesis(), wholeSiteBody: "raw site content" }, /wholeSiteBody|unknown/i]
  ])("rejects missing, prompt, provider and whole-site fields", (value, expected) => {
    expect(() => parseReportV4WebsiteSynthesisOutput(value)).toThrow(expected);
  });

  it("rejects empty and over-bound output fields", () => {
    expect(() => parseReportV4WebsiteSynthesisOutput({ ...websiteSynthesis(), summary: " " })).toThrow(/summary|non-empty/i);
    expect(() => parseReportV4WebsiteSynthesisOutput({
      ...websiteSynthesis(),
      summary: "x".repeat(REPORT_V4_MAX_WEBSITE_SYNTHESIS_SUMMARY_CHARS + 1)
    })).toThrow(/summary|characters/i);
    for (const field of ["strengths", "gaps", "actions"] as const) {
      expect(() => parseReportV4WebsiteSynthesisOutput({ ...websiteSynthesis(), [field]: [] })).toThrow(new RegExp(field, "i"));
      expect(() => parseReportV4WebsiteSynthesisOutput({ ...websiteSynthesis(), [field]: [" "] })).toThrow(new RegExp(`${field}|non-empty`, "i"));
      expect(() => parseReportV4WebsiteSynthesisOutput({
        ...websiteSynthesis(),
        [field]: Array.from({ length: REPORT_V4_MAX_WEBSITE_SYNTHESIS_ITEMS + 1 }, () => "bounded item")
      })).toThrow(new RegExp(field, "i"));
      expect(() => parseReportV4WebsiteSynthesisOutput({
        ...websiteSynthesis(),
        [field]: ["x".repeat(REPORT_V4_MAX_WEBSITE_SYNTHESIS_ITEM_CHARS + 1)]
      })).toThrow(new RegExp(`${field}|characters`, "i"));
    }
  });
});

function page(index: number) {
  const summaryChunk = chunk(1, `Structured summary for page ${index}.`, 0, 24);
  summaryChunk.sourceLocations[0]!.locationId = `page-${index}-location-1`;
  return {
    pageId: `page-${index}`,
    url: `https://target.example/page-${index}`,
    contentHash: index.toString(16).padStart(64, "0"),
    readability: "direct_readable",
    sourceLength: 100,
    chunks: [summaryChunk]
  };
}

function chunk(order: number, summary: string, startOffset: number, endOffset: number) {
  return {
    order,
    summary,
    sourceLocations: [{ locationId: `page-1-location-${order}`, startOffset, endOffset }]
  };
}

function pageContext() {
  return {
    pageId: "page-1",
    url: "https://target.example/page-1",
    contentHash: "1".padStart(64, "0"),
    readability: "direct_readable",
    sourceLength: 100
  };
}

function websiteSynthesis() {
  return {
    summary: "The target site presents a coherent service offer for business buyers.",
    strengths: ["The service scope is stated clearly."],
    gaps: ["Regional delivery evidence is limited."],
    actions: ["Add current region-specific delivery examples."]
  };
}
