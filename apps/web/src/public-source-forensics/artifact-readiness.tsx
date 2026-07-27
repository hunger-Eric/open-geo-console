import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { PublicSourceForensicsReportArtifact } from "@/components/public-source-forensics-report-artifact";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import type { ArtifactReadinessGate } from "@/worker/public-source-forensics";

export function createPublicSourceArtifactReadinessGate(input:{
  loadTechnicalReport(reportId:string,jobId:string):Promise<GeoAuditReport|null>;
  materializePdf(value:{report:RecommendationForensicReportV2;html:string}):Promise<Uint8Array>;
}):ArtifactReadinessGate{
  return {async verify(report){
    const technicalReport=await input.loadTechnicalReport(report.reportId,report.jobId); if(!technicalReport)throw new Error("V2 technical appendix is unavailable.");
    const locale=report.locale.toLowerCase().startsWith("zh")?"zh":"en";
    const markup=renderToStaticMarkup(createElement(PublicSourceForensicsReportArtifact,{model:{productContract:"recommendation_forensics_v1",reportVersion:2,
      fulfillmentMethodology:"public_search_source_forensics_v1",reportId:report.reportId,locale,technicalReport,recommendationReport:report,evidenceAssets:[]}}));
    const html=`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"/><style>${ARTIFACT_CSS}</style></head><body>${markup}</body></html>`;
    if(!html.includes(report.executiveVerdict.text)||!report.executivePriorities.every(({title})=>html.includes(title))||
      /contributionMarginMicros|allocatedSharedCostMicros|actualIncrementalCostMicros/.test(html))throw new Error("V2 HTML artifact failed readiness validation.");
    const pdf=await input.materializePdf({report,html}); if(pdf.byteLength<5||new TextDecoder().decode(pdf.slice(0,5))!=="%PDF-")throw new Error("V2 PDF artifact failed readiness validation.");
  }};
}
