import { NextResponse } from "next/server";
import { loadPrivateReportArtifact } from "@/report/artifact-model";
import { exportReportPdf } from "@/report/pdf-export";
import { requestHasReportAccess } from "@/server/report-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!await requestHasReportAccess(request, id)) return denied();
  const model = await loadPrivateReportArtifact(id);
  if (!model) return denied();
  try {
    const htmlUrl = new URL(`/reports/${encodeURIComponent(id)}/report.html`, request.url).href;
    const pdf = await exportReportPdf({ htmlUrl, cookieHeader: request.headers.get("cookie") ?? "" });
    return new NextResponse(copyArrayBuffer(pdf), {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": `inline; filename="open-geo-report-${id}.pdf"`,
        "content-type": "application/pdf",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      }
    });
  } catch (error) {
    console.error("PDF artifact export failed.", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "PDF export is temporarily unavailable. The HTML report remains available." }, {
      status: 503,
      headers: { "cache-control": "private, no-store", "retry-after": "30" }
    });
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function denied() {
  return NextResponse.json({ error: "Report artifact is unavailable." }, {
    status: 404,
    headers: { "cache-control": "private, no-store" }
  });
}
