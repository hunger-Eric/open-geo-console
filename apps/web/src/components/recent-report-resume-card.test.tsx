import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { RecentReportResumeCard } from "./recent-report-resume-card";

describe("RecentReportResumeCard", () => {
  it("offers explicit progress recovery without hiding the new-scan path", () => {
    const html = renderToStaticMarkup(createElement(RecentReportResumeCard, {
      dictionary: getDictionary("zh"),
      href: "/zh/reports/report-1",
      resume: { reportId: "report-1", locale: "zh", domain: "company.example", state: "generating" }
    }));

    expect(html).toContain("你的报告仍在生成");
    expect(html).toContain("继续查看生成进度");
    expect(html).toContain("检测其他网站");
    expect(html).toContain('href="/zh/reports/report-1"');
    expect(html).toContain('href="#website-scanner"');
    expect(html).not.toContain("已完成");
    expect(html).not.toContain("取消任务");
  });

  it("distinguishes a failed task without implying a retry or completion", () => {
    const html = renderToStaticMarkup(createElement(RecentReportResumeCard, {
      dictionary: getDictionary("en"),
      href: "/en/reports/report-1",
      resume: { reportId: "report-1", locale: "en", domain: "company.example", state: "failed" }
    }));

    expect(html).toContain("The last report did not finish");
    expect(html).toContain("View task status");
    expect(html).toContain("does not create or retry a report");
    expect(html).not.toContain("Report complete");
  });
});
