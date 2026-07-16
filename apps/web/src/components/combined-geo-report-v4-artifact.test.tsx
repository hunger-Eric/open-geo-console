import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseCombinedGeoReportV4,
  type CombinedGeoReportV4
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
});

function render(report: CombinedGeoReportV4): string {
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
      summary: "The target website presents a clear GEO service conclusion.",
      strengths: ["The public service scope is explicit."],
      gaps: ["Operating conditions need more detail."],
      actions: ["Publish specific service conditions for generative answers."]
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
