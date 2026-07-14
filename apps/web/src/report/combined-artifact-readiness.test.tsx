import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { combinedArtifactFixture } from "@/components/combined-geo-report-artifact.test";
import { renderCanonicalCombinedArtifactHtml } from "./combined-artifact-readiness";

describe("combined artifact canonical rendering",()=>{
  it("wraps the exact shared HTML component used by the report route and PDF readiness",()=>{
    const model=combinedArtifactFixture();
    const componentMarkup=renderToStaticMarkup(createElement(CombinedGeoReportArtifact,{model}));
    const canonicalHtml=renderCanonicalCombinedArtifactHtml(model);
    expect(canonicalHtml).toContain(componentMarkup);
    expect(canonicalHtml).toContain("data-business-question-section=\"true\"");
    expect(canonicalHtml.match(/class="business-question-answer"/g)).toHaveLength(3);
    expect(canonicalHtml).toContain("/api/reports/report/evidence/asset-1");
  });
});
