import { serveScopedReportPdf } from "@/report/pdf-artifact-route";
import { resolveRequestArtifactScope } from "@/server/report-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productContract = await resolveRequestArtifactScope(request, id);
  if (!productContract) return new Response(JSON.stringify({ error: "Report artifact is unavailable." }), {
    status: 404, headers: { "cache-control": "private, no-store", "content-type": "application/json" }
  });
  const combined = productContract === "combined_geo_report_v1";
  const recommendation = productContract === "recommendation_forensics_v1";
  return serveScopedReportPdf({
    request, reportId: id, artifactScope: productContract, accessAlreadyVerified: true,
    htmlPath: `/reports/${encodeURIComponent(id)}/${combined ? "report.html" : recommendation ? "recommendation-report.html" : "legacy-report.html"}`,
    filename: `open-geo-${combined ? "combined" : recommendation ? "recommendation" : "legacy"}-report-${id}.pdf`
  });
}
