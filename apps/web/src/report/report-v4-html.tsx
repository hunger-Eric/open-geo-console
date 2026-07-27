import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";
import { CombinedGeoReportV4Artifact } from "@/components/combined-geo-report-v4-artifact";
import { ARTIFACT_CSS } from "./artifact-styles";

export type ReportV4HtmlStage = "core" | "enhancement";

export interface RenderReportV4HtmlInput {
  readonly stage: ReportV4HtmlStage;
  readonly report: CombinedGeoReportV4;
  readonly signal?: AbortSignal;
}

export async function renderReportV4Html(input: RenderReportV4HtmlInput): Promise<string> {
  input.signal?.throwIfAborted();

  const markup = renderToStaticMarkup(createElement(
    "html",
    {
      lang: input.report.locale,
      "data-artifact-contract": input.report.artifactContract,
      "data-report-version": input.report.version,
      "data-report-stage": input.stage
    },
    createElement(
      "head",
      null,
      createElement("meta", { charSet: "utf-8" }),
      createElement("style", { dangerouslySetInnerHTML: { __html: ARTIFACT_CSS } })
    ),
    createElement(
      "body",
      null,
      createElement(CombinedGeoReportV4Artifact, { report: input.report })
    )
  ));

  input.signal?.throwIfAborted();
  return `<!doctype html>${markup}`;
}
