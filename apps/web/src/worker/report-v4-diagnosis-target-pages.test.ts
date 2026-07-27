import { describe, expect, it } from "vitest";
import {
  REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES,
  REPORT_V4_MAX_SITE_PAGES,
  parseReportV4DiagnosisInput,
  type ReportV4PageSummary,
  type ReportV4PageSummaryChunk
} from "@open-geo-console/ai-report-engine";
import { selectReportV4DiagnosisTargetPages } from "./report-v4-diagnosis-target-pages";

// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-04
describe("V4 diagnosis target-page selector", () => {
  it("selects Chinese and English pages by the current question and saved answer", () => {
    const chinese = selectReportV4DiagnosisTargetPages({
      questionId: "question-zh",
      question: "\u5982\u4f55\u7f29\u77ed\u4e2d\u6b27\u7269\u6d41\u4ea4\u4ed8\u65f6\u95f4\uff1f",
      answer: "\u5ba2\u6237\u5173\u5fc3\u4e2d\u6b27\u73ed\u5217\u7684\u7a33\u5b9a\u6027\u4e0e\u7269\u6d41\u65f6\u6548\u3002",
      pages: [page("rail", "https://example.com/cn/rail", [
        chunk(1, "\u4e2d\u6b27\u73ed\u5217\u6bcf\u5468\u53d1\u8fd0\uff0c\u63d0\u4f9b\u7a33\u5b9a\u7269\u6d41\u4ea4\u4ed8\u65f6\u95f4\u3002", "rail-1", 0, 40),
        chunk(2, "\u516c\u53f8\u5386\u53f2\u4e0e\u62db\u8058\u4fe1\u606f\u3002", "rail-2", 41, 70)
      ])]
    });
    const english = selectReportV4DiagnosisTargetPages({
      questionId: "question-en",
      question: "How can buyers verify cold-chain delivery times?",
      answer: "Buyers need temperature monitoring and delivery tracking evidence.",
      pages: [page("cold-chain", "https://example.com/cold-chain", [
        chunk(1, "Cold-chain delivery tracking includes continuous temperature monitoring.", "cold-1", 0, 70),
        chunk(2, "Our office opened in 2010.", "cold-2", 71, 100)
      ])]
    });

    expect(chinese).toHaveLength(1);
    expect(chinese[0]).toMatchObject({
      questionId: "question-zh",
      pageId: "rail",
      url: "https://example.com/cn/rail",
      summary: "\u4e2d\u6b27\u73ed\u5217\u6bcf\u5468\u53d1\u8fd0\uff0c\u63d0\u4f9b\u7a33\u5b9a\u7269\u6d41\u4ea4\u4ed8\u65f6\u95f4\u3002"
    });
    expect(chinese[0]!.sourceLocations.map(({ locationId }) => locationId)).toEqual(["rail-1"]);
    expect(chinese[0]!.relevanceReason).toMatch(/\u5f53\u524d\u95ee\u9898/);
    expect(english).toHaveLength(1);
    expect(english[0]!.summary).toBe("Cold-chain delivery tracking includes continuous temperature monitoring.");
    expect(english[0]!.sourceLocations.map(({ locationId }) => locationId)).toEqual(["cold-1"]);
    expect(english[0]!.relevanceReason).toMatch(/current question/i);
    expect(() => parseReportV4DiagnosisInput({
      question: { questionId: "question-en", text: "How can buyers verify cold-chain delivery times?" },
      answer: "Buyers need temperature monitoring and delivery tracking evidence.",
      locale: "en-US",
      sources: [],
      targetPages: english
    })).not.toThrow();
  });

  it("returns no fallback for unrelated pages or a query made only of common stop words", () => {
    const unrelated = selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "How are pharmaceutical shipments temperature monitored?",
      answer: "The buyer needs cold-chain evidence.",
      pages: [page("careers", "https://example.com/careers", [
        chunk(1, "Meet our leadership team and browse current job openings.", "careers-1", 0, 60)
      ])]
    });
    const stopWordsOnly = selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "the and of to in",
      answer: "",
      pages: [page("generic", "https://example.com/generic", [
        chunk(1, "The company is in the region and open to visitors.", "generic-1", 0, 60)
      ])]
    });
    const chineseStopWordsOnly = selectReportV4DiagnosisTargetPages({
      questionId: "question-zh",
      question: "\u5982\u4f55\u4e86\u89e3\u5f53\u524d\u95ee\u9898\u7684\u76f8\u5173\u5185\u5bb9\uff1f",
      answer: "",
      pages: [page("generic-zh", "https://example.com/generic-zh", [
        chunk(1, "\u8be5\u9875\u9762\u63d0\u4f9b\u516c\u53f8\u76f8\u5173\u5185\u5bb9\u548c\u4e00\u822c\u4fe1\u606f\u3002", "generic-zh-1", 0, 60)
      ])]
    });

    expect(unrelated).toEqual([]);
    expect(stopWordsOnly).toEqual([]);
    expect(chineseStopWordsOnly).toEqual([]);
  });

  it("ranks by relevance, preserves page order for ties and caps the selection at ten", () => {
    const pages = Array.from({ length: 12 }, (_, index) => page(
      `page-${index + 1}`,
      `https://example.com/page-${index + 1}`,
      [chunk(1, index === 11
        ? "Verified freight tracking tracking tracking supports delivery monitoring."
        : "Freight tracking supports delivery updates.", `location-${index + 1}`, index * 20, index * 20 + 15)],
      400
    ));

    const selected = selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "Which freight tracking supports delivery monitoring?",
      answer: "Verified tracking is required.",
      pages
    });

    expect(selected).toHaveLength(REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES);
    expect(selected[0]!.pageId).toBe("page-12");
    expect(selected.slice(1).map(({ pageId }) => pageId)).toEqual(
      Array.from({ length: 9 }, (_, index) => `page-${index + 1}`)
    );
  });

  it("uses only relevant whole chunks, keeps exact locations and stays within 4000 characters", () => {
    const first = `Freight tracking ${"A".repeat(1_780)}`;
    const second = `Delivery tracking ${"B".repeat(1_780)}`;
    const third = `Shipment tracking ${"C".repeat(1_780)}`;
    const selected = selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "Which tracking evidence covers freight delivery shipment status?",
      answer: "Tracking evidence is required.",
      pages: [page("tracking", "https://example.com/tracking", [
        chunk(1, first, "tracking-1", 0, 100),
        chunk(2, "Office locations and company history.", "tracking-unrelated", 100, 200),
        chunk(3, second, "tracking-2", 200, 300),
        chunk(4, third, "tracking-3", 300, 400)
      ], 500)]
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]!.summary.length).toBeLessThanOrEqual(4_000);
    expect([first, second, third]).toContain(selected[0]!.summary.split("\n\n")[0]);
    expect(selected[0]!.summary).not.toContain("Office locations");
    expect(selected[0]!.summary).not.toContain("C".repeat(1_000));
    expect(selected[0]!.sourceLocations.map(({ locationId }) => locationId)).toEqual(["tracking-1", "tracking-2"]);
  });

  it("fails closed for duplicate identity, location drift and malformed or over-bound summaries", () => {
    const valid = page("one", "https://example.com/one", [chunk(1, "Freight tracking evidence.", "same-location", 0, 20)]);
    const duplicatePageId = page("one", "https://example.com/two", [chunk(1, "Freight tracking evidence.", "two-location", 0, 20)]);
    const duplicateUrl = page("two", "https://example.com/one", [chunk(1, "Freight tracking evidence.", "two-location", 0, 20)]);
    const duplicateLocation = page("two", "https://example.com/two", [chunk(1, "Freight tracking evidence.", "same-location", 0, 20)]);
    const invalidOffset = page("offset", "https://example.com/offset", [chunk(1, "Freight tracking evidence.", "offset-location", 0, 101)], 100);
    const overBound = Array.from({ length: REPORT_V4_MAX_SITE_PAGES + 1 }, (_, index) => page(
      `page-${index}`,
      `https://example.com/${index}`,
      [chunk(1, "Freight tracking evidence.", `location-${index}`, 0, 20)]
    ));
    const run = (pages: readonly ReportV4PageSummary[]) => selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "Which freight tracking evidence is available?",
      answer: "Tracking evidence is needed.",
      pages
    });

    expect(() => run([valid, duplicatePageId])).toThrow(/pageId|unique/i);
    expect(() => run([valid, duplicateUrl])).toThrow(/URL|unique/i);
    expect(() => run([valid, duplicateLocation])).toThrow(/locationId|unique/i);
    expect(() => run([invalidOffset])).toThrow(/sourceLength|bounds/i);
    expect(() => run(overBound)).toThrow(/between|50|page summaries/i);
    expect(() => run([{ ...valid, chunks: [{ ...valid.chunks[0]!, summary: "" }] }])).toThrow(/summary|non-empty/i);
    expect(() => selectReportV4DiagnosisTargetPages({
      questionId: "question-1",
      question: "Which freight tracking evidence is available?",
      answer: "Tracking evidence is needed.",
      pages: [valid],
      publicQuestionPool: ["not allowed"]
    } as never)).toThrow(/unknown field|publicQuestionPool/i);
  });

  it("does not mutate inputs or disclose content hashes and secret-like retained fields", () => {
    const pages = [page("one", "https://example.com/one", [
      chunk(1, "Freight tracking evidence is available.", "location-one", 0, 40)
    ])];
    const input = deepFreeze({
      questionId: "question-1",
      question: "Which freight tracking evidence is available?",
      answer: "Freight tracking evidence is required.",
      pages
    });
    const before = structuredClone(input);

    const selected = selectReportV4DiagnosisTargetPages(input);

    expect(input).toEqual(before);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected[0])).toBe(true);
    expect(JSON.stringify(selected)).not.toContain("a".repeat(64));
    expect(Object.keys(selected[0]!)).toEqual([
      "questionId", "pageId", "url", "relevanceReason", "summary", "sourceLocations"
    ]);
  });
});

function page(
  pageId: string,
  url: string,
  chunks: readonly ReportV4PageSummaryChunk[],
  sourceLength = 1_000
): ReportV4PageSummary {
  return {
    pageId,
    url,
    contentHash: "a".repeat(64),
    readability: "direct_readable",
    sourceLength,
    chunks
  };
}

function chunk(
  order: number,
  summary: string,
  locationId: string,
  startOffset: number,
  endOffset: number
): ReportV4PageSummaryChunk {
  return { order, summary, sourceLocations: [{ locationId, startOffset, endOffset }] };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
