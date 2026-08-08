import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseCombinedGeoReportV4,
  parsePersistedCombinedGeoReportV4,
  type CombinedGeoReportV4,
  type PersistedCombinedGeoReportV4
} from "@open-geo-console/ai-report-engine";
import { CombinedGeoReportV4Artifact } from "./combined-geo-report-v4-artifact";

// @requirement GEO-V4-SOURCE-01
// @requirement GEO-V4-SOURCE-02
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-COPY-01
// @requirement GEO-V4-COPY-02
// @requirement GEO-V4-PDF-01
describe("CombinedGeoReportV4Artifact", () => {
  it("renders conclusion, reasons and actions in that order without inventing customer answers", () => {
    const report = parsedReport();
    const html = render(report);
    if (report.websiteSynthesis.status !== "available") throw new Error("fixture website synthesis must be available");

    const websiteConclusion = html.indexOf('data-content-stage="conclusion"');
    const websiteReason = html.indexOf('data-content-stage="reason"');
    const websiteAction = html.indexOf('data-content-stage="action"');
    expect(websiteConclusion).toBeGreaterThan(0);
    expect(websiteConclusion).toBeLessThan(websiteReason);
    expect(websiteReason).toBeLessThan(websiteAction);
    expect(html).toContain(report.websiteSynthesis.summary);
    expect(html).toContain(report.websiteSynthesis.strengths[0]);
    expect(html).toContain(report.websiteSynthesis.actions[0]);

    const first = questionSegment(html, 1);
    expect(first.indexOf('data-question-stage="conclusion"')).toBeLessThan(first.indexOf('data-question-stage="reason"'));
    expect(first.indexOf('data-question-stage="reason"')).toBeLessThan(first.indexOf('data-question-stage="action"'));
    expect(first).toContain(report.questions[0].questionText);
    expect(first).toContain(report.questions[0].answer!);
  });

  it("keeps all three questions independent and renders at most five sources owned by each question", () => {
    const report = parsedReport({ sourceCount: 7 });
    const html = render(report);

    expect(html.match(/data-question-order=/g)).toHaveLength(3);
    for (const order of [1, 2, 3] as const) {
      const segment = questionSegment(html, order);
      expect(segment.match(/data-question-source="true"/g)).toHaveLength(5);
      expect(segment).toContain(`Question ${order} source 1`);
      expect(segment).toContain(`Question ${order} source 5`);
      expect(segment).not.toContain(`Question ${order} source 6`);
      const sibling = order === 3 ? 2 : order + 1;
      expect(segment).not.toContain(`Question ${sibling} source 1`);
    }
  });

  it("retains an inaccessible source label and original safe link", () => {
    const report = parsedReport({ inaccessibleFirst: true });
    const html = render(report);
    const first = questionSegment(html, 1);

    expect(first).toContain('href="https://question-1-source-1.example/evidence"');
    expect(first).toContain("Question 1 source 1");
    expect(first).toContain("Page temporarily unavailable for independent reading");
  });

  it("keeps question diagnosis concise and places source excerpts in a closed details disclosure", () => {
    const report = parsedReport();
    const html = render(report);
    const first = questionSegment(html, 1);
    const details = first.match(/<details[^>]*>/)?.[0];

    expect(first).toContain("Sources provide directly usable facts for question 1.");
    expect(first).toContain("Observable factor 1 for question 1.");
    expect(first).toContain("Target gap for question 1.");
    expect(first).toContain("GEO action 1 for question 1.");
    expect(details).toBeDefined();
    expect(details).not.toMatch(/\sopen(?:=|\s|>)/i);
    expect(first.indexOf("View detailed evidence")).toBeLessThan(first.indexOf("Question 1 cited excerpt 1."));
    expect(first).not.toContain("q1-target-location-1");
    expect(first).not.toContain("q1-source-1");
  });

  it("renders only whitelisted customer fields and drops malicious prompt, raw and workflow extras", () => {
    const parsed = parsedReport();
    const malicious = {
      ...parsed,
      systemPrompt: "LEAK_ROOT_SYSTEM_PROMPT",
      rawProviderJson: "LEAK_ROOT_RAW_JSON",
      workflowNode: "LEAK_ROOT_WORKFLOW",
      pdfDownloadUrl: "/reports/report-v4.pdf",
      websiteSynthesis: {
        ...parsed.websiteSynthesis,
        developerMessage: "LEAK_WEBSITE_DEVELOPER_MESSAGE"
      },
      questions: parsed.questions.map((question, index) => ({
        ...question,
        retryCount: `LEAK_QUESTION_RETRY_${index}`,
        diagnosis: question.diagnosis ? {
          ...question.diagnosis,
          validatorError: `LEAK_DIAGNOSIS_VALIDATOR_${index}`
        } : undefined,
        sources: question.sources.map((source) => ({
          ...source,
          rawProviderResponse: `LEAK_SOURCE_RAW_${index}`
        }))
      }))
    } as unknown as CombinedGeoReportV4;

    const html = render(malicious);

    for (const marker of [
      "LEAK_ROOT_SYSTEM_PROMPT",
      "LEAK_ROOT_RAW_JSON",
      "LEAK_ROOT_WORKFLOW",
      "LEAK_WEBSITE_DEVELOPER_MESSAGE",
      "LEAK_QUESTION_RETRY_0",
      "LEAK_DIAGNOSIS_VALIDATOR_0",
      "LEAK_SOURCE_RAW_0"
    ]) expect(html).not.toContain(marker);
    expect(html).not.toContain("/reports/report-v4.pdf");
  });

  it("uses GEO-only interface copy and exposes no PDF, print or download surface", () => {
    const html = render(parsedReport());
    const visible = html.replace(/<[^>]+>/g, " ");

    expect(visible).toContain("GEO actions");
    expect(visible).not.toMatch(/\bSEO\b|search ranking|keyword ranking/i);
    expect(html).not.toMatch(/\.pdf\b|download(?:=| pdf)|print report|pdf download|打印|下载 PDF/i);
    expect(html).not.toContain("<button");
  });

  it("uses responsive semantic classes and accessible native document structure", () => {
    const html = render(parsedReport());

    expect(html).toMatch(/^<main class="[^"]*report-shell/);
    expect(html).toContain("<header class=\"report-hero");
    expect(html).toContain("<h1>");
    expect(html.match(/<article[^>]*class="[^"]*answer-card/g)).toHaveLength(3);
    expect(html).toContain("answer-card-list");
    expect(html).toContain("source-card");
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("renders crawl unavailability as a GEO observation without fabricating synthesis", () => {
    const report = parseCombinedGeoReportV4({
      ...parsedReport(),
      status: "unavailable",
      websiteSynthesis: { status: "unavailable", reason: "no_crawl_readable_pages" },
      pageCoverage: {
        counts: { total: 1, analyzed: 0, crawlUnavailable: 1, excluded: 0, analysisUnavailable: 0 },
        pages: [{ ordinal: 1, pageId: "page-1", url: "https://target.example/", status: "crawl_unavailable", readMode: null, reasonCode: "robots_denied" }]
      }
    });
    const html = render(report);

    expect(html).toContain('data-page-outcome="crawl_unavailable"');
    expect(html).toContain("Unavailable to this Open GEO crawl");
    expect(html).toContain("robots_denied");
    expect(html).toContain("no website synthesis was fabricated");
    expect(html).not.toContain("Supporting strengths");
  });

  it("labels website-synthesis provider unavailability without discarding page or question content", () => {
    const report = parseCombinedGeoReportV4({
      ...parsedReport(),
      status: "completed_limited",
      websiteSynthesis: { status: "unavailable", reason: "website_synthesis_unavailable" }
    });
    const html = render(report);

    expect(html).toContain("internal website synthesis was unavailable");
    expect(html).toContain('data-page-outcome="analyzed"');
    expect(html).toContain("Customer answer 1 grounded only in its own sources.");
    expect(html).not.toContain("The target website presents a clear GEO service conclusion.");
  });

  it("renders a 51-page terminal ledger through its final row without truncation", () => {
    const pages = Array.from({ length: 51 }, (_, index) => ({
      ordinal: index + 1,
      pageId: `page-${index + 1}`,
      url: `https://target.example/page-${index + 1}`,
      status: "analyzed" as const,
      readMode: "direct_readable" as const,
      reasonCode: null
    }));
    const report = parseCombinedGeoReportV4({
      ...parsedReport(),
      pageCoverage: {
        counts: { total: 51, analyzed: 51, crawlUnavailable: 0, excluded: 0, analysisUnavailable: 0 },
        pages
      }
    });
    const html = render(report);

    expect(html).toContain("<dt>Observed pages</dt><dd>51</dd>");
    expect(html).toContain("https://target.example/page-51");
    expect(html.match(/data-page-outcome="analyzed"/gu)).toHaveLength(51);
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(1_000_000);
  });

  it("renders the exact historical two-section dialect without synthesizing prospective coverage", () => {
    const current = parsedReport();
    if (current.websiteSynthesis.status !== "available") throw new Error("fixture website synthesis must be available");
    const report = parsePersistedCombinedGeoReportV4({
      version: current.version,
      artifactContract: current.artifactContract,
      reportId: current.reportId,
      artifactRevisionId: current.artifactRevisionId,
      targetUrl: current.targetUrl,
      locale: current.locale,
      generatedAt: current.generatedAt,
      status: "completed_limited",
      websiteSynthesis: {
        summary: current.websiteSynthesis.summary,
        strengths: current.websiteSynthesis.strengths,
        gaps: current.websiteSynthesis.gaps,
        actions: current.websiteSynthesis.actions
      },
      questions: current.questions
    });
    const html = render(report);

    expect(report.status).toBe("completed_limited");
    expect(html).toContain('<p class="section-index">01</p>');
    expect(html).toContain('<p class="section-index">02</p>');
    expect(html).not.toContain('<p class="section-index">03</p>');
    expect(html).toContain("The target website presents a clear GEO service conclusion.");
    expect(html).not.toContain("Page crawl coverage");
    expect(html).not.toContain("data-page-outcome");
  });
});

function render(report: PersistedCombinedGeoReportV4): string {
  return renderToStaticMarkup(createElement(CombinedGeoReportV4Artifact, { report }));
}

function questionSegment(html: string, order: 1 | 2 | 3): string {
  const start = html.indexOf(`data-question-order="${order}"`);
  const next = order < 3 ? html.indexOf(`data-question-order="${order + 1}"`) : html.length;
  if (start < 0 || next < 0) throw new Error(`question ${order} segment not found`);
  return html.slice(start, next);
}

function parsedReport(options: { sourceCount?: number; inaccessibleFirst?: boolean } = {}): CombinedGeoReportV4 {
  const sourceCount = options.sourceCount ?? 2;
  return parseCombinedGeoReportV4({
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "revision-v4",
    targetUrl: "https://target.example/",
    locale: "en-US",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: "completed",
    websiteSynthesis: {
      status: "available",
      summary: "The target website presents a clear GEO service conclusion.",
      strengths: ["The public service scope is explicit."],
      gaps: ["Operating conditions need more detail."],
      actions: ["Publish specific service conditions for generative answers."]
    },
    pageCoverage: {
      counts: { total: 2, analyzed: 1, crawlUnavailable: 1, excluded: 0, analysisUnavailable: 0 },
      pages: [
        { ordinal: 1, pageId: "page-1", url: "https://target.example/", status: "analyzed", readMode: "direct_readable", reasonCode: null },
        { ordinal: 2, pageId: "page-2", url: "https://target.example/private", status: "crawl_unavailable", readMode: null, reasonCode: "login_required" }
      ]
    },
    questions: [1, 2, 3].map((order) => ({
      order,
      questionId: `question-${order}`,
      questionText: `Customer question ${order}?`,
      status: "answered",
      answer: `Customer answer ${order} grounded only in its own sources.`,
      sources: Array.from({ length: sourceCount }, (_, index) => ({
        questionId: `question-${order}`,
        sourceId: `q${order}-source-${index + 1}`,
        title: `Question ${order} source ${index + 1}`,
        canonicalUrl: `https://question-${order}-source-${index + 1}.example/evidence`,
        citedText: `Question ${order} cited excerpt ${index + 1}.`,
        retrievalStatus: options.inaccessibleFirst && order === 1 && index === 0 ? "inaccessible" : "available"
      })),
      diagnosis: {
        selectionSummary: `Sources provide directly usable facts for question ${order}.`,
        observableFactors: [1, 2, 3].map((factor) => ({
          kind: factor === 1 ? "problem_match" : factor === 2 ? "factual_specificity" : "target_clarity",
          observation: `Observable factor ${factor} for question ${order}.`,
          evidenceRefs: factor === 3 ? [`q${order}-target-location-1`] : [`q${order}-source-${factor}`]
        })),
        targetGap: `Target gap for question ${order}.`,
        recommendedActions: [1, 2, 3].map((priority) => ({
          priority,
          action: `GEO action ${priority} for question ${order}.`,
          evidenceRefs: priority === 3 ? [`q${order}-target-location-1`] : [`q${order}-source-${priority}`]
        })),
        detailedEvidenceRefs: [
          ...Array.from({ length: Math.min(sourceCount, 5) }, (_, index) => `q${order}-source-${index + 1}`),
          `q${order}-target-location-1`
        ]
      }
    }))
  });
}
