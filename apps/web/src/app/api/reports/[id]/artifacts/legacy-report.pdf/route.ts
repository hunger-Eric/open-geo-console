import { serveScopedReportPdf } from "@/report/pdf-artifact-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return serveScopedReportPdf({
    request, reportId: id, artifactScope: "legacy_website_audit_v1",
    htmlPath: `/reports/${encodeURIComponent(id)}/legacy-report.html`,
    filename: `open-geo-legacy-report-${id}.pdf`
  });
}
