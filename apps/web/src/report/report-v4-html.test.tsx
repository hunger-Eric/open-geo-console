import { readFile } from "node:fs/promises";
import {
  parseCombinedGeoReportV4,
  type CombinedGeoReportV4
} from "@open-geo-console/ai-report-engine";
import { describe, expect, it } from "vitest";
import { renderReportV4Html } from "./report-v4-html";

// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-COPY-01
// @requirement GEO-V4-PDF-01
describe("renderReportV4Html", () => {
  it("renders complete deterministic core and enhancement UTF-8 documents with audit markers", async () => {
    const core = report({ locale: "en-US" });
    const enhancement = report({ locale: "en-US", diagnosis: true });

    const coreHtml = await renderReportV4Html({ stage: "core", report: core });
    const repeatedCoreHtml = await renderReportV4Html({ stage: "core", report: core });
    const enhancementHtml = await renderReportV4Html({ stage: "enhancement", report: enhancement });

    expect(coreHtml).toBe(repeatedCoreHtml);
    expect(coreHtml).toMatch(/^<!doctype html><html[^>]*data-report-version="4"[^>]*data-report-stage="core"/);
    expect(coreHtml).toMatch(/<head><meta[^>]*charset="utf-8"/i);
    expect(coreHtml).toContain("<style>");
    expect(coreHtml).toContain("--forest:#173f37");
    expect(coreHtml).toContain('<main class="report-shell answer-first-report report-v4-artifact"');
    expect(coreHtml).not.toContain("Question-level GEO diagnosis");
    expect(coreHtml).toMatch(/<\/body><\/html>$/);

    expect(enhancementHtml).toMatch(/^<!doctype html><html[^>]*data-report-version="4"[^>]*data-report-stage="enhancement"/);
    expect(enhancementHtml).toContain("Question-level GEO diagnosis");
    expect(enhancementHtml).toContain("Observable factor 1 for question 1.");
  });

  it("renders Chinese and English copy and escapes document attributes and customer text", async () => {
    const english = await renderReportV4Html({ stage: "core", report: report({ locale: "en-US" }) });
    const chinese = await renderReportV4Html({
      stage: "core",
      report: report({ locale: "zh-CN", summary: "\u5b98\u7f51\u7ed3\u8bba\u4e0e GEO \u884c\u52a8\u3002" })
    });
    const unsafe = await renderReportV4Html({
      stage: "core",
      report: report({
        locale: 'en-US" onload="boom',
        summary: "<script>alert('x')</script> & customer text"
      })
    });

    expect(english).toContain("Open GEO report");
    expect(chinese).toContain('lang="zh-CN"');
    expect(chinese).toContain("Open GEO \u62a5\u544a");
    expect(chinese).toContain("\u5b98\u7f51\u7ed3\u8bba\u4e0e GEO \u884c\u52a8\u3002");
    expect(unsafe).toContain('lang="en-US&quot; onload=&quot;boom"');
    expect(unsafe).not.toContain("<script>alert('x')</script>");
    expect(unsafe).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt; &amp; customer text");
  });

  it("fails closed when already aborted or aborted synchronously during rendering", async () => {
    const before = new AbortController();
    const beforeReason = new Error("aborted before V4 render");
    before.abort(beforeReason);

    await expect(renderReportV4Html({
      stage: "core",
      report: report({ locale: "en-US" }),
      signal: before.signal
    })).rejects.toBe(beforeReason);

    const during = new AbortController();
    const duringReason = new Error("aborted during V4 render");
    const base = report({ locale: "en-US" });
    const abortingReport = new Proxy(base, {
      get(target, property, receiver) {
        if (property === "websiteSynthesis") during.abort(duringReason);
        return Reflect.get(target, property, receiver);
      }
    });

    await expect(renderReportV4Html({
      stage: "core",
      report: abortingReport,
      signal: during.signal
    })).rejects.toBe(duringReason);
  });

  it("has only V4 HTML dependencies and emits no PDF or legacy customer surface", async () => {
    const source = await readFile(new URL("./report-v4-html.tsx", import.meta.url), "utf8");
    const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((match) => match[1]);
    const html = await renderReportV4Html({ stage: "core", report: report({ locale: "en-US" }) });

    expect(imports).toEqual([
      "react",
      "react-dom/server",
      "@open-geo-console/ai-report-engine",
      "@/components/combined-geo-report-v4-artifact",
      "./artifact-styles"
    ]);
    expect(source).not.toMatch(/artifact-model|combined-artifact-readiness|chromium|playwright|puppeteer|legacy|report-v[123]|pdf/iu);
    expect(html).not.toMatch(/\bPDF\b|legacy report|download PDF|\u6253\u5370 PDF|\u4e0b\u8f7d PDF/iu);
  });
});

function report(input: {
  readonly locale: string;
  readonly diagnosis?: boolean;
  readonly summary?: string;
}): CombinedGeoReportV4 {
  const isChinese = input.locale.toLocaleLowerCase("en-US").startsWith("zh");
  return parseCombinedGeoReportV4({
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4-html",
    artifactRevisionId: input.diagnosis ? "revision-enhancement" : "revision-core",
    targetUrl: "https://target.example/",
    locale: input.locale,
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: "completed",
    websiteSynthesis: {
      summary: input.summary ?? (isChinese ? "\u76ee\u6807\u5b98\u7f51\u5177\u5907\u6e05\u6670\u7684 GEO \u670d\u52a1\u7ed3\u8bba\u3002" : "The target website has a clear GEO service conclusion."),
      strengths: [isChinese ? "\u516c\u5f00\u670d\u52a1\u8303\u56f4\u6e05\u6670\u3002" : "The public service scope is explicit."],
      gaps: [isChinese ? "\u9700\u8981\u8865\u5145\u8fd0\u8425\u6761\u4ef6\u3002" : "Operating conditions need more detail."],
      actions: [isChinese ? "\u53d1\u5e03\u53ef\u4f9b\u751f\u6210\u5f0f\u7b54\u6848\u5f15\u7528\u7684\u670d\u52a1\u6761\u4ef6\u3002" : "Publish service conditions for generative answers."]
    },
    questions: [1, 2, 3].map((order) => ({
      order,
      questionId: `question-${order}`,
      questionText: isChinese ? `\u5ba2\u6237\u95ee\u9898 ${order}\uff1f` : `Customer question ${order}?`,
      status: "answered",
      answer: isChinese ? `\u5ba2\u6237\u7b54\u6848 ${order}\u3002` : `Customer answer ${order}.`,
      sources: [{
        questionId: `question-${order}`,
        sourceId: `q${order}-source-1`,
        title: isChinese ? `\u95ee\u9898 ${order} \u6765\u6e90` : `Question ${order} source`,
        canonicalUrl: `https://question-${order}.example/evidence`,
        citedText: isChinese ? `\u95ee\u9898 ${order} \u6765\u6e90\u6458\u5f55\u3002` : `Question ${order} source excerpt.`,
        retrievalStatus: input.diagnosis ? "available" : "not_checked"
      }],
      ...(input.diagnosis ? {
        diagnosis: {
          selectionSummary: `Sources support question ${order}.`,
          observableFactors: [1, 2, 3].map((factor) => ({
            kind: `factor-${factor}`,
            observation: `Observable factor ${factor} for question ${order}.`,
            evidenceRefs: [`q${order}-source-1`]
          })),
          targetGap: `Target gap for question ${order}.`,
          recommendedActions: [1, 2, 3].map((priority) => ({
            priority,
            action: `GEO action ${priority} for question ${order}.`,
            evidenceRefs: [`q${order}-source-1`]
          })),
          detailedEvidenceRefs: [`q${order}-source-1`]
        }
      } : {})
    }))
  });
}
