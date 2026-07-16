import { describe, expect, it } from "vitest";
import {
  REPORT_V4_MAX_PAGE_SUMMARY_CHARS,
  REPORT_V4_MAX_SITE_PAGES,
  parseReportV4QuestionAnswerInput,
  parseReportV4SiteSynthesisInput
} from "./report-v4-site-synthesis";

// @requirement GEO-V4-TOKEN-02
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

function page(index: number) {
  const summaryChunk = chunk(1, `Structured summary for page ${index}.`, 0, 24);
  summaryChunk.sourceLocations[0]!.locationId = `page-${index}-location-1`;
  return {
    pageId: `page-${index}`,
    url: `https://target.example/page-${index}`,
    contentHash: index.toString(16).padStart(64, "0"),
    readability: "direct_readable",
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
